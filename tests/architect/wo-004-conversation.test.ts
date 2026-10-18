// WO-004 acceptance tests (architect-authored; builders make them pass, never edit them).
// One conversation interface every channel uses: the text simulator now, LoopMessage last (WO-013).
// A person is identified by their contact (phone or email); the first text creates them (text-first signup).
// Contract in docs/architect/work-orders/WO-004-conversation-simulator.md. Run: deno test -A --no-check tests/architect/
import { handleInbound, toBubbles, memoryStore, SAFE_ERROR_REPLY, type Brain } from "../../supabase/functions/_shared/conversation.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const T0 = Date.UTC(2026, 9, 18, 15);

// A brain that records what it was given and counts turns in the person's own stores.
function recordingBrain() {
  const calls: any[] = [];
  const brain: Brain = async (a) => {
    calls.push(JSON.parse(JSON.stringify({ userId: a.userId, message: a.message, history: a.history, stores: a.stores, attachments: a.attachments })));
    const n = ((a.stores.turns as number) || 0) + 1;
    return { reply: `reply ${n} to: ${a.message}`, stores: { ...a.stores, turns: n } };
  };
  return { brain, calls };
}

Deno.test("WO-004/1 a first text from an unknown contact creates the person; no web account needed", async () => {
  const store = memoryStore(), { brain, calls } = recordingBrain();
  const out = await handleInbound({ contact: "+15551230001", text: "hi", at: T0 }, { brain, store });
  eq(out.contact, "+15551230001");
  eq(out.kind, "reply");
  eq(out.bubbles, ["reply 1 to: hi"]);
  eq(calls.length, 1);
  eq(calls[0].history, [], "a new person has no history");
  const u = await store.userFor("+15551230001");
  assert(u && typeof u.id === "string" && u.created, "the person exists after one text");
});

Deno.test("WO-004/2 the next text from the same contact carries the conversation and the person's state", async () => {
  const store = memoryStore(), { brain, calls } = recordingBrain();
  await handleInbound({ contact: "+15551230001", text: "I'm a nurse", at: T0 }, { brain, store });
  const out = await handleInbound({ contact: "+15551230001", text: "find me jobs", at: T0 + 60000 }, { brain, store });
  eq(out.bubbles, ["reply 2 to: find me jobs"]);
  eq(calls[1].history, [{ role: "user", content: "I'm a nurse" }, { role: "assistant", content: "reply 1 to: I'm a nurse" }]);
  eq(calls[1].stores, { turns: 1 }, "the stores the brain returned last turn come back");
  eq(calls[0].userId, calls[1].userId, "same person");
});

Deno.test("WO-004/3 different contacts never see each other's history or state", async () => {
  const store = memoryStore(), { brain, calls } = recordingBrain();
  await handleInbound({ contact: "+15551230001", text: "secret plan A", at: T0 }, { brain, store });
  await handleInbound({ contact: "+15551230002", text: "hello", at: T0 + 1000 }, { brain, store });
  eq(calls[1].history, []);
  eq(calls[1].stores, {});
  assert(calls[0].userId !== calls[1].userId, "two people");
});

Deno.test("WO-004/4 contacts are normalized: the same phone written two ways is one person", async () => {
  const store = memoryStore(), { brain, calls } = recordingBrain();
  await handleInbound({ contact: "+1 (555) 123-0001", text: "a", at: T0 }, { brain, store });
  await handleInbound({ contact: "+15551230001", text: "b", at: T0 + 1000 }, { brain, store });
  eq(calls[0].userId, calls[1].userId);
});

Deno.test("WO-004/5 a text attachment reaches the brain as text; any other file reaches it with text null", async () => {
  const store = memoryStore(), { brain, calls } = recordingBrain();
  const resume = new TextEncoder().encode("Jane Doe\nBarista, Blue Bottle Coffee, 2022-2025");
  await handleInbound({ contact: "+15551230001", text: "here's my resume", at: T0, attachments: [
    { name: "resume.txt", mime: "text/plain", bytes: resume },
    { name: "photo.heic", mime: "image/heic", bytes: new Uint8Array([1, 2, 3]) },
  ] }, { brain, store });
  eq(calls[0].attachments, [
    { name: "resume.txt", mime: "text/plain", text: "Jane Doe\nBarista, Blue Bottle Coffee, 2022-2025" },
    { name: "photo.heic", mime: "image/heic", text: null },
  ]);
});

Deno.test("WO-004/6 a brain failure answers with SAFE_ERROR_REPLY, keeps the person's state unchanged, and never throws", async () => {
  const store = memoryStore(), { brain } = recordingBrain();
  await handleInbound({ contact: "+15551230001", text: "one", at: T0 }, { brain, store });
  const broken: Brain = async () => { throw new Error("model down"); };
  const out = await handleInbound({ contact: "+15551230001", text: "two", at: T0 + 1000 }, { brain: broken, store });
  eq(out.bubbles, toBubbles(SAFE_ERROR_REPLY));
  const u = await store.userFor("+15551230001");
  eq(await store.stores(u!.id), { turns: 1 }, "state is not touched by a failed turn");
  assert(!/sent|submitted|applied/i.test(SAFE_ERROR_REPLY) || /nothing/i.test(SAFE_ERROR_REPLY), "honest");
});

Deno.test("WO-004/7 toBubbles: texting-sized, a bare link gets its own bubble, never more than 4, nothing lost from short replies", () => {
  eq(toBubbles("Short answer."), ["Short answer."]);
  const withLink = toBubbles("Here's the posting.\nhttps://boards.greenhouse.io/stripe/jobs/123\nWant me to tailor your resume?");
  assert(withLink.includes("https://boards.greenhouse.io/stripe/jobs/123"), "the link stands alone");
  const long = toBubbles(Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here to make this reply long.`).join(" "));
  assert(long.length <= 4, "at most 4 bubbles");
  assert(long.every((b) => b.length <= 700), "each bubble at most 700 characters");
  eq(toBubbles("Hi <!-- internal note --> there.").length, 1);
  assert(!toBubbles("Hi <!-- internal note --> there.").join(" ").includes("internal note"), "HTML comments never reach the person");
});

Deno.test("WO-004/8 proactive messages: queued per person, delivered once, in order, through the same bubbles", async () => {
  const store = memoryStore(), { brain } = recordingBrain();
  await handleInbound({ contact: "+15551230001", text: "hi", at: T0 }, { brain, store });
  const u = await store.userFor("+15551230001");
  await store.enqueueProactive(u!.id, { key: "alert:stripe:123", text: "New: Data Analyst at Stripe, posted 4 minutes ago.", at: T0 + 1000 });
  await store.enqueueProactive(u!.id, { key: "alert:stripe:123", text: "duplicate", at: T0 + 2000 });
  await store.enqueueProactive(u!.id, { key: "report:2026-10-19", text: "Your daily report: 3 new matches.", at: T0 + 3000 });
  const out = await store.drainProactive(T0 + 5000);
  eq(out.map((o) => [o.contact, o.kind, o.bubbles[0]]), [
    ["+15551230001", "proactive", "New: Data Analyst at Stripe, posted 4 minutes ago."],
    ["+15551230001", "proactive", "Your daily report: 3 new matches."],
  ], "one per key, in time order");
  eq(await store.drainProactive(T0 + 6000), [], "delivered once");
  const hist = await store.history(u!.id);
  assert(hist.some((m) => m.role === "assistant" && /daily report/.test(m.content)), "a proactive message becomes part of the conversation the brain sees next");
});
