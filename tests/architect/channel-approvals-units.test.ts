// One approval model on every channel (2026-10-26): the pieces each channel's webhook leans on, against the providers'
// own documented payloads (tests/fixtures/channels/*.json, sources in tests/architect/flow-channel-approvals-pg.test.ts):
//   - "YES <code>" and its messy forms are read as a code; a bare number never is; the code path asks the database and
//     words its answer, never more (career_apply_cards.ts cardTurn);
//   - a bare yes is told only what the channel has (needsReplyTextFor);
//   - LoopMessage's documented inbound: `contact` is the person, `sender` is Trainee's own sender id and never the person,
//     a reaction and a delivery callback run nothing, a group runs nothing, a file is a file, thread.initial_message_id
//     is the reply id; the Authorization header is accepted as the webhook secret;
//   - WhatsApp: the card's Approve and Decline go out as reply buttons inside Meta's limits, and a tap comes back as a
//     button tap bound to the card; another button's tap is text, as before;
//   - a webhook answers before the turn runs when the runtime can run it after (E-15), and a retry is a duplicate;
//   - the inspect page (trainee-inspect) shows what the card binds, warns when the payload changed, and serves the resume
//     only when its bytes hash to the payload's resume_sha256.
import { cardTurn, type CardStore, type CodeAnswer, needsReplyTextFor, parseCardReply } from "../../supabase/functions/_shared/career_apply_cards.ts";
import { parseLoopInbound } from "../../supabase/functions/_shared/loopmessage.ts";
import { loopMessageAdapter } from "../../supabase/functions/_shared/loopmessage_adapter.ts";
import { parseWhatsAppBody, whatsappAdapter } from "../../supabase/functions/_shared/whatsapp.ts";
import { handleChannelWebhook, type InboundStore } from "../../supabase/functions/_shared/channel_inbound.ts";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const fixture = (name: string) => JSON.parse(Deno.readTextFileSync(`${ROOT}/tests/fixtures/channels/${name}`));
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }

Deno.test("the code: messy forms read as YES <code>; a bare number or another yes is not a code", () => {
  for (const [t, code, except] of [["YES 4821", "4821", []], ["yes, 4821", "4821", []], ["Yes4821!!", "4821", []], ["approve 4821", "4821", []], ["4821 yes", "4821", []],
    ["yes code 4821", "4821", []], ["ok #4821", "4821", []], ["YES 4821 but not 2", "4821", [2]], ["yes 482", "482", []]] as const) {
    eq(parseCardReply(t), { kind: "yes", except, code }, t);
  }
  eq(parseCardReply("no 4821"), { kind: "no", code: "4821" });
  for (const t of ["4821", "2026", "my zip is 60614", "yes", "yes but not 2", "approve 2", "yes 2"]) {
    const r = parseCardReply(t) as any;
    assert(!r || r.code === undefined, `${t}: not a code: ${JSON.stringify(r)}`);
  }
});

function codeStore(answer: (code: string, except: number[], decline: boolean) => CodeAnswer) {
  const calls: unknown[] = [];
  const store: CardStore = {
    pending: async () => [], open: async () => { throw new Error("not used"); }, latestOpen: async () => null, answer: async () => { throw new Error("the code path never answers by card id"); },
    lastAssistantIntent: async () => null, lastShownCard: async () => null,
    answerCode: async (_u, code, except, decline) => { calls.push([code, except, decline]); return answer(code, except, decline); },
  };
  return { store, calls };
}
Deno.test("the code path: the database decides; each status is worded as exactly what happened", async () => {
  const cases: [CodeAnswer, RegExp, string][] = [
    [{ status: "answered", card_id: "C1", results: [{ n: 1, company: "Acme", result: "queued" }] }, /^1 approved exactly as shown\. Nothing has gone to an employer yet\.\n1\. Acme: approved/, "answered"],
    [{ status: "wrong_code", misses: 1 }, /doesn't match your card, so nothing was approved/, "wrong_code"],
    [{ status: "locked" }, /too many wrong codes, so it can't be approved by text now; nothing was sent/, "code_locked"],
    [{ status: "outdated" }, /out of date/, "card_outdated"],
    [{ status: "answered_before" }, /already answered/, "answered_before"],
    [{ status: "stale" }, /more than 10 minutes ago/, "stale_card"],
    [{ status: "changed" }, /changed after it was shown, so nothing was approved/, "changed"],
    [{ status: "no_card" }, /no card waiting/, "no_card"],
    [{ status: "not_on_card", count: 1 }, /only number 1; nothing was sent/, "not_on_card"],
  ];
  for (const [a, re, status] of cases) {
    const s = codeStore(() => a);
    const r = await cardTurn({ message: "Yes, 4821", userId: "U", threadId: "TH", now: 0, store: s.store });
    assert(r && r.status === status && re.test(r.reply), `${a.status}: ${JSON.stringify(r)}`);
    eq(s.calls, [["4821", [], false]]);
  }
  // A 3-digit try while no card waits is not about a card: the turn goes on.
  eq(await cardTurn({ message: "ok 150", userId: "U", threadId: "TH", now: 0, store: codeStore(() => ({ status: "no_card" })).store }), null);
  const d = codeStore(() => ({ status: "answered", card_id: "C1", results: [{ n: 1, company: "Acme", result: "declined" }] }));
  const r = await cardTurn({ message: "no 4821", userId: "U", threadId: "TH", now: 0, store: d.store });
  eq([r?.status, d.calls], ["answered", [["4821", [], true]]]);
});

Deno.test("a bare yes is told only what the channel has", () => {
  const im = needsReplyTextFor("imessage"), wa = needsReplyTextFor("whatsapp"), tg = needsReplyTextFor("telegram"), app = needsReplyTextFor(null);
  for (const t of [im, wa, tg, app]) assert(/^Nothing was approved\./.test(t) && /YES and the 4-digit code at the end of the card/.test(t), t);
  assert(!/tap|button|press and hold|reply directly|\bapp\b/i.test(im), `iMessage: only the code: ${im}`);
  for (const t of [wa, tg]) assert(/tap Approve under the card/.test(t) && !/in the app/.test(t), t);
  assert(/tap Approve in the app/.test(app), app);
});

Deno.test("LoopMessage's documented inbound: contact is the person; sender, reactions, delivery callbacks and groups run nothing; a file is a file; the thread's first message is the reply id", async () => {
  const doc = fixture("loopmessage-inbound.json");
  eq(parseLoopInbound(doc), { kind: "text", text: "text", sender: "+13231112233", messageId: "59c55Ce8-41d6-43Cc-9116-8cfb2e696D7b", replyTo: null });
  const withSender = parseLoopInbound({ ...doc, sender: "trainee-sender-id" }) as any;
  eq(withSender.sender, "+13231112233", "the documented `sender` (Trainee's own sender id) is never the person");
  eq(parseLoopInbound(fixture("loopmessage-reaction.json")).kind, "ignored", "a like carries text and is not a message");
  eq(parseLoopInbound(fixture("loopmessage-delivered.json")).kind, "ignored");
  eq(parseLoopInbound({ ...doc, event: "inbound_call" }).kind, "ignored");
  eq(parseLoopInbound({ ...doc, group: { id: "g1", name: "x", participants: ["+1", "+2"] } }).kind, "ignored", "a group is not one person");
  eq(parseLoopInbound({ ...doc, text: "", message_type: "attachments", attachments: ["https://cdn.example/r.pdf"] }), { kind: "file", sender: "+13231112233", messageId: doc.message_id });
  eq((parseLoopInbound({ ...doc, thread: { thread_id: "T1", initial_message_id: "LM-OUT-7" } }) as any).replyTo, "LM-OUT-7");
  eq(parseLoopInbound({ alert_type: "message_inbound", recipient: "+15550001111", message_id: "m1", text: "hi" }).kind, "text", "the older shape the test bridge saw still reads");
  // The webhook's secret in the Authorization header, as LoopMessage's dashboard sets it.
  const secret = "S".repeat(40);
  const a = loopMessageAdapter({ apiKey: "k", inboundSecret: secret, send: async () => ({ ok: true, id: null }) });
  const r = await a.parseInbound(new Request("https://fn.test/trainee-inbound", { method: "POST", headers: { authorization: secret }, body: JSON.stringify(doc) }));
  assert(!("response" in r) && r.messages[0].contact === "+13231112233", JSON.stringify(r));
  const bad = await a.parseInbound(new Request("https://fn.test/trainee-inbound", { method: "POST", headers: { authorization: "wrong".repeat(10) }, body: JSON.stringify(doc) }));
  assert("response" in bad && bad.response.status === 403, "a wrong Authorization is refused");
  const file = await a.parseInbound(new Request("https://fn.test/trainee-inbound", { method: "POST", headers: { authorization: `Bearer ${secret}` }, body: JSON.stringify({ ...doc, text: "", message_type: "attachments", attachments: ["https://x/r.pdf"] }) }));
  assert(!("response" in file) && file.messages[0].kind === "seen" && file.messages[0].file === true, JSON.stringify(file));
});

Deno.test("WhatsApp: the card's buttons go out as reply buttons inside Meta's limits; a tap on one is a button tap bound to the card", async () => {
  const sent: any[] = [];
  const a = whatsappAdapter({ token: "t", phoneNumberId: "106540352242922", sleep: async () => {}, clock: () => 0,
    fetch: (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return Response.json({ ...fixture("whatsapp-send-text-response.json"), messages: [{ id: `wamid.T${sent.length}` }] }); }) as typeof fetch });
  const card = "c".repeat(8) + "-0000-4000-8000-" + "0".repeat(12);
  const buttons = [[{ text: "Approve", data: `tca:${card}:0123456789abcdef` }, { text: "Decline", data: `tcd:${card}:0123456789abcdef` }]];
  const r = await a.send("16505551234", ["the card"], { buttons });
  assert(r.ok && r.ids?.length === 1, JSON.stringify(r));
  const doc = fixture("whatsapp-send-reply-buttons.json");
  eq(Object.keys(sent[0]).sort(), ["messaging_product", "recipient_type", "to", "type", "interactive"].sort(), "the documented request's top-level fields");
  eq([sent[0].type, sent[0].interactive.type, sent[0].interactive.body.text], [doc.type, doc.interactive.type, "the card"]);
  eq(sent[0].interactive.action.buttons, [{ type: "reply", reply: { id: buttons[0][0].data, title: "Approve" } }, { type: "reply", reply: { id: buttons[0][1].data, title: "Decline" } }]);
  // A card longer than an interactive body (1,024): the card as text, then the buttons alone.
  sent.length = 0;
  await a.send("16505551234", ["x".repeat(1100)], { buttons });
  eq(sent.map((b) => b.type), ["text", "interactive"]);
  assert(sent[1].interactive.body.text.length <= 1024);
  // The tap, in Meta's documented shape.
  const tap = fixture("whatsapp-button-reply.json");
  tap.entry[0].changes[0].value.messages[0].interactive.button_reply = { id: buttons[0][0].data, title: "Approve" };
  const m = parseWhatsAppBody(tap, "106540352242922").messages[0];
  eq([m.kind, m.callback?.data, m.callback?.messageId, m.contact], ["callback", buttons[0][0].data, "wamid.HBgLMTY0NjcwNDM1OTUVAgARGBJBM0Y4RUU0RUNFQkFDMjYzQUMA", "wa:16505551234"]);
  const other = parseWhatsAppBody(fixture("whatsapp-button-reply.json"), "106540352242922").messages[0];
  eq([other.kind, other.text], ["text", "Change"], "another business's button reads as its title, as before");
});

function memInbound(): InboundStore & { claimed: string[] } {
  const claimed: string[] = [];
  return {
    claimed,
    async claimMessage(id) { if (claimed.includes(id)) return false; claimed.push(id); return true; },
    async person() { return { userId: "U1", threadId: "T1", contact: "wa:16505551234" }; },
    async refusedBefore() { return false; }, async createPerson() { throw new Error("no"); }, async setThread() {}, async setOptOut() {},
    async enqueueReply() { return true; },
  };
}
Deno.test("E-15: with a runtime that runs work after the answer, the webhook claims, answers 200, then runs the turn; a retry meanwhile is a duplicate", async () => {
  const secret = "app-secret-0123456789";
  const a = whatsappAdapter({ token: "t", phoneNumberId: "106540352242922", appSecret: secret, sleep: async () => {}, fetch: (async () => Response.json({ messages: [{ id: "wamid.X" }] })) as typeof fetch });
  const { whatsappSignature } = await import("../../supabase/functions/_shared/whatsapp.ts");
  const body = new TextEncoder().encode(JSON.stringify(fixture("whatsapp-text.json")));
  const req = async () => new Request("https://fn.test/trainee-whatsapp", { method: "POST", headers: { "x-hub-signature-256": await whatsappSignature(secret, body) }, body });
  let release!: () => void, turns = 0;
  const gate = new Promise<void>((r) => (release = r));
  const work: Promise<unknown>[] = [];
  const store = memInbound();
  const deps = { env: { get: () => undefined }, now: () => 0, store, render: (t: string) => [t], reply: async () => ({ ok: true }),
    chat: async () => { await gate; turns++; return { status: 200, reply: "ok", threadId: "T1" }; }, deliver: async () => {}, defer: (p: Promise<unknown>) => { work.push(p); } };
  const res = await handleChannelWebhook(await req(), a, deps);
  eq([res.status, (await res.json()).results, turns], [200, [{ ok: true, accepted: true }], 0], "answered before the turn ran");
  eq(store.claimed, ["wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA="], "claimed before the answer");
  const retry = await handleChannelWebhook(await req(), a, deps);
  eq((await retry.json()).results, [{ ok: true, ignored: "duplicate webhook" }]);
  release();
  await Promise.all(work);
  eq(turns, 1, "the one turn ran, after the answer");
});

Deno.test("trainee-inspect: shows exactly what the card binds, warns when it changed, serves the resume only when its bytes match", async () => {
  // Imported here, so the rest of this file runs (and fails for its own reasons) on a base without trainee-inspect.
  const { handleInspect } = await import("../../supabase/functions/trainee-inspect/handler.ts");
  const resume = new TextEncoder().encode("%PDF-1.4 TEST\n");
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", resume))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const payload = { company: "Acme", url: "https://jobs.lever.co/acme/1", resume_sha256: sha, fields: [{ name: "email", label: "Email", value: "a@example.test" }] };
  const T = "0123456789abcdef0123456789abcdef";
  const data = (matches: boolean, sent: any = null) => ({ card_id: "C1", user_id: "U1", state: "open", items: [{ n: 1, card_hash: "h".repeat(64), prepared: { company: "Acme", url: payload.url, payload, matches }, sent }] });
  const deps = (d: any, file: Uint8Array | null = resume) => ({ now: () => 0, inspect: async (t: string) => (t === T ? d : null), resume: async (_u: string, s: string) => (file && s === sha ? { bytes: file, mime: "application/pdf", name: "Resume.pdf" } : null) });
  const page = await handleInspect(new Request(`https://x/functions/v1/trainee-inspect?t=${T}`), deps(data(true)));
  const text = await page.text();
  assert(page.status === 200 && /^text\/plain/.test(page.headers.get("content-type")!) && page.headers.get("cache-control") === "no-store", "plain text, never cached");
  assert(text.includes(`Check: it hashes to ${"h".repeat(64)}, the hash on the card.`) && text.includes("- Email: a@example.test") && text.includes(`?t=${T}&f=resume`), text);
  const changed = await (await handleInspect(new Request(`https://x/functions/v1/trainee-inspect?t=${T}`), deps(data(false)))).text();
  assert(changed.includes("WARNING: this application changed after the card was shown"), changed);
  eq((await handleInspect(new Request(`https://x/functions/v1/trainee-inspect?t=${T}&f=resume`), deps(data(false)))).status, 409, "a changed application's resume is not shown as the approved one");
  const file = await handleInspect(new Request(`https://x/functions/v1/trainee-inspect?t=${T}&f=resume`), deps(data(true)));
  eq([file.status, file.headers.get("content-type"), new Uint8Array(await file.arrayBuffer()).length], [200, "application/pdf", resume.length]);
  eq((await handleInspect(new Request(`https://x/functions/v1/trainee-inspect?t=${T}&f=resume`), deps(data(true), new TextEncoder().encode("other bytes")))).status, 404, "bytes that don't hash to the payload's resume are never served");
  eq((await handleInspect(new Request(`https://x/functions/v1/trainee-inspect?t=${"f".repeat(32)}`), deps(data(true)))).status, 404);
  eq((await handleInspect(new Request(`https://x/functions/v1/trainee-inspect?t=../etc`), deps(data(true)))).status, 404);
  const sent = await (await handleInspect(new Request(`https://x/functions/v1/trainee-inspect?t=${T}&f=sent`), deps(data(true, { state: "submitted_unconfirmed", payload, matches: true })))).text();
  assert(sent.includes("Its state: submitted_unconfirmed.") && sent.includes("the hash on the card you approved"), sent);
  eq((await handleInspect(new Request(`https://x/functions/v1/trainee-inspect?t=${T}&f=sent`), deps(data(true)))).status, 404, "nothing sent: nothing to show as sent");
});

Deno.test("E-15: a texting channel's reply id is read only against that channel's delivered texts, never as an agent_messages id", async () => {
  const { supabaseCardStore } = await import("../../supabase/functions/_shared/career_apply_cards.ts");
  // A fake service client: agent_messages has a card message whose id is 5001; the outbox has one Telegram text whose
  // provider id is 5001 and which carried no card (an unrelated reply).
  const reads: { table: string; filters: string[] }[] = [];
  const admin = {
    from(table: string) {
      const filters: string[] = [];
      reads.push({ table, filters });
      const q: any = {
        select: () => q, eq: (c: string, v: unknown) => (filters.push(`${c}=${v}`), q), or: (s: string) => (filters.push(`or:${s}`), q),
        like: (c: string, v: string) => (filters.push(`${c}~${v}`), q), not: (c: string, op: string, v: string) => (filters.push(`${c}!${op}${v}`), q), order: () => q,
        limit: async () => ({ data: table === "agent_messages" ? [{ meta: { intent: "career_apply_card", card_id: "CARD-1" } }] : [{ key: "reply:tg:9", card_id: null, provider_id: "5001", provider_ids: null }], error: null }),
      };
      return q;
    },
  };
  const store = supabaseCardStore(admin);
  eq(await store.cardOfMessage!("TH", "5001", "U", "telegram"), null, "the Telegram text 5001 carried no card");
  assert(!reads.some((r) => r.table === "agent_messages"), "agent_messages is never read for a channel's reply id");
  assert(reads.some((r) => r.table === "career_outbox" && r.filters.includes("contact~tg:%")), JSON.stringify(reads));
  reads.length = 0;
  eq(await store.cardOfMessage!("TH", "5001", "U", null), "CARD-1", "the app's own message ids are agent_messages ids");
});

Deno.test("E-15: the runtime probe (deferFromRuntime): no EdgeRuntime or no waitUntil on it means no defer; a real waitUntil is bound to the runtime and is what the webhook defers to", async () => {
  const { deferFromRuntime } = await import("../../supabase/functions/_shared/channel_runtime.ts");
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  const had = "EdgeRuntime" in g, before = g.EdgeRuntime;
  try {
    delete g.EdgeRuntime;
    eq(deferFromRuntime(), undefined, "no EdgeRuntime: no defer, the turn runs before the answer");
    g.EdgeRuntime = {};
    eq(deferFromRuntime(), undefined, "an EdgeRuntime with no waitUntil: no defer");
    g.EdgeRuntime = { waitUntil: "not a function" };
    eq(deferFromRuntime(), undefined, "a waitUntil that is not a function: no defer");
    // A real waitUntil: the probe returns it bound to the runtime object, forwarding the exact promise.
    const seen: { self: unknown; p: Promise<unknown> }[] = [];
    const rt = { waitUntil(p: Promise<unknown>) { seen.push({ self: this, p }); } };
    g.EdgeRuntime = rt;
    const defer = deferFromRuntime();
    assert(typeof defer === "function");
    const work = Promise.resolve("done");
    defer!(work);
    eq(seen.length, 1);
    assert(seen[0].self === rt && seen[0].p === work, "bound to EdgeRuntime, the same promise forwarded");
    // Composed exactly as the three index.ts roots compose it (const waitUntil = deferFromRuntime(); ...{ defer: waitUntil }):
    // the probe's defer is the webhook's defer — claim, 200 back, the turn runs only when the runtime settles it.
    const captured: Promise<unknown>[] = [];
    g.EdgeRuntime = { waitUntil: (p: Promise<unknown>) => { captured.push(p); } };
    const secret = "app-secret-0123456789";
    const a = whatsappAdapter({ token: "t", phoneNumberId: "106540352242922", appSecret: secret, sleep: async () => {}, fetch: (async () => Response.json({ messages: [{ id: "wamid.X" }] })) as typeof fetch });
    const { whatsappSignature } = await import("../../supabase/functions/_shared/whatsapp.ts");
    const body = new TextEncoder().encode(JSON.stringify(fixture("whatsapp-text.json")));
    let release!: () => void, turns = 0;
    const gate = new Promise<void>((r) => (release = r));
    const store = memInbound();
    const deps = { env: { get: () => undefined }, now: () => 0, store, render: (t: string) => [t], reply: async () => ({ ok: true }),
      chat: async () => { await gate; turns++; return { status: 200, reply: "ok", threadId: "T1" }; }, deliver: async () => {}, defer: deferFromRuntime() };
    const res = await handleChannelWebhook(new Request("https://fn.test/trainee-whatsapp", { method: "POST", headers: { "x-hub-signature-256": await whatsappSignature(secret, body) }, body }), a, deps);
    eq([res.status, (await res.json()).results, turns, captured.length], [200, [{ ok: true, accepted: true }], 0, 1], "the runtime's hook holds the turn; the provider already has its 200");
    release();
    await Promise.all(captured);
    eq(turns, 1, "the deferred turn ran when the runtime settled it");
  } finally {
    if (had) g.EdgeRuntime = before; else delete g.EdgeRuntime;
  }
});

Deno.test("receipts (spec 7.2, 7.4): where it went and the link to exactly what was sent; a failure says what, why and the one next step, and never retries on its own", async () => {
  const { receiptText } = await import("../../supabase/functions/_shared/career_apply_receipts.ts");
  const link = "https://x.supabase.co/functions/v1/trainee-inspect?t=0123456789abcdef0123456789abcdef&f=sent";
  const sent = receiptText({ company: "Acme", url: "https://jobs.lever.co/acme/1", state: "submitted_unconfirmed", sent_link: link });
  assert(/^Sent to Acme\./.test(sent) && sent.includes("https://jobs.lever.co/acme/1") && sent.endsWith(`Exactly what was sent: ${link}`), sent);
  const failed = receiptText({ company: "Acme", url: "https://jobs.lever.co/acme/1", state: "failed", reason: "Phone is invalid" });
  assert(/^Acme did not accept it: their form said "Phone is invalid"\. Nothing is retried on its own\. Next: say "apply me to this: https:\/\/jobs\.lever\.co\/acme\/1" and I'll show you the new application to approve first\./.test(failed), failed);
  const answers = receiptText({ company: "Acme", state: "not_submitted", reason: "needs_answers" });
  assert(/Nothing reached the employer\. Next: say "what do you need from me" to answer them; the application then comes back to you to approve\./.test(answers), answers);
  assert(!/Exactly what was sent/.test(failed + answers), "nothing was sent: no 'what was sent' link");
  assert(!/Exactly what was sent/.test(receiptText({ company: "Acme", state: "confirmed", sent_link: "javascript:alert(1)" })), "only an http(s) link");
});
