// WO-004 hardening (Codex's findings on PR #3, confirmed 2026-10-19): bubbles keep their limits on any reply, a cut is
// always said, an empty brain reply saves nothing, and a forgotten person's queued messages go with them. The
// simulator's attachment isolation needs process and file permissions, so it is tested in
// tests/architect/wo-004-simulator-isolation.test.ts. Run: deno test --no-check tests/edge/conversation-hardening.test.ts
import { CUT_NOTE, handleInbound, MAX_BUBBLES, memoryStore, OUTBOX_CHARS, toBubbles, SAFE_ERROR_REPLY, type Brain } from "../../supabase/functions/_shared/conversation.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const isLink = (s: string) => /^https?:\/\/\S+$/.test(s.trim());

Deno.test("WO-004/H1 any reply: at most 4 bubbles, none over 700 characters (a bare link excepted), and a cut is always said", () => {
  const words = ["data", "analyst", "Stripe", "interview", "12.5%", "netflix.com", "follow-up", "résumé", "SQL"];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2000; i++) {
    const parts: string[] = [];
    for (let n = Math.floor(rnd() * 900), k = 0; k < n; k++) {
      const r = rnd();
      parts.push(r < 0.03 ? `\nhttps://jobs.lever.co/acme/${Math.floor(rnd() * 1e6)}\n` : r < 0.08 ? ".\n\n" : r < 0.1 ? "x".repeat(Math.floor(rnd() * 900)) : words[Math.floor(rnd() * words.length)]);
    }
    const reply = parts.join(" ");
    if (!reply.trim()) continue;
    const b = toBubbles(reply);
    assert(b.length >= 1 && b.length <= MAX_BUBBLES, `case ${i}: ${b.length} bubbles`);
    for (const x of b) assert(x.length <= 700 || isLink(x), `case ${i}: a ${x.length}-character bubble`);
    const kept = b.join("").replace(/\s+/g, "").length, given = reply.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, "").length;
    if (kept < given * 0.98) assert(b.some((x) => x.includes(CUT_NOTE)), `case ${i}: content was dropped without saying so`);
    // What the outbox can hold is never cut: every character arrives and no cut note is added.
    if (reply.replace(/<!--[\s\S]*?-->/g, "").trim().length <= OUTBOX_CHARS) {
      assert(!b.join(" ").includes(CUT_NOTE), `case ${i}: a ${reply.length}-character reply was cut`);
      assert(kept >= given, `case ${i}: ${given - kept} characters lost`);
    }
  }
});

Deno.test("WO-004/H2 a short reply is unchanged: one bubble, links alone, nothing appended", () => {
  eq(toBubbles("Short answer."), ["Short answer."]);
  eq(toBubbles("Here's the posting.\nhttps://boards.greenhouse.io/stripe/jobs/123\nWant me to tailor your resume?"),
    ["Here's the posting.", "https://boards.greenhouse.io/stripe/jobs/123", "Want me to tailor your resume?"]);
  assert(!toBubbles("A".repeat(600)).join("").includes(CUT_NOTE));
});

Deno.test("WO-004/H3 an empty brain reply is a failure: the person hears SAFE_ERROR_REPLY and nothing is saved", async () => {
  const store = memoryStore();
  const ok: Brain = async (a) => ({ reply: "Saved.", stores: { ...a.stores, n: 1 } });
  await handleInbound({ contact: "+15550001111", text: "hi", at: 1 }, { brain: ok, store });
  const empty: Brain = async (a) => ({ reply: "   ", stores: { ...a.stores, n: 2, poisoned: true } });
  const out = await handleInbound({ contact: "+15550001111", text: "again", at: 2 }, { brain: empty, store });
  eq(out.bubbles, toBubbles(SAFE_ERROR_REPLY));
  const p = await store.userFor("+15550001111");
  eq(await store.stores(p!.id), { n: 1 }, "the empty turn changed nothing");
});

Deno.test("WO-004/H4 forget clears the person's state, history and queued messages; already-delivered keys stay delivered", async () => {
  const store = memoryStore();
  const a = await store.ensureUser("+15550002222", 0), b = await store.ensureUser("+15550003333", 0);
  await store.setStores(a.id, { x: 1 });
  await store.append(a.id, { role: "user", content: "hi" });
  await store.enqueueProactive(a.id, { key: "alert:1", text: "sent", at: 0 });
  await store.drainProactive(0);
  await store.enqueueProactive(a.id, { key: "alert:2", text: "queued for a", at: 100 });
  await store.enqueueProactive(b.id, { key: "alert:2", text: "queued for b", at: 100 });
  await store.forget(a.id);
  eq([await store.stores(a.id), (await store.history(a.id)).length], [{}, 0]);
  const out = await store.drainProactive(200);
  eq(out.map((o) => o.contact), ["+15550003333"], "only the other person's message is still queued");
  await store.enqueueProactive(a.id, { key: "alert:1", text: "again", at: 300 });
  eq((await store.drainProactive(400)).length, 0, "a delivered key is never sent twice, even after forget");
});
