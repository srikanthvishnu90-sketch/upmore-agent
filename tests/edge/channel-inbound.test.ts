// WO-013b-2 builder tests: the inbound webhook. The secret first; a message id handled once, ever; STOP/START/HELP before
// any account; signup closed unless the owner opens it or lists the number; a new contact gets an account; the turn runs as
// that person with a stable turn key; the reply rides the outbox; failures say so once instead of going silent.
// Run: deno test --no-check tests/edge/channel-inbound.test.ts
import { CHAT_DOWN_REPLY, handleInbound, SIGNUP_CLOSED_REPLY, signupAllows, turnKeyFor, type InboundStore } from "../../supabase/functions/trainee-inbound/handler.ts";
import { supabaseInboundStore } from "../../supabase/functions/trainee-inbound/store.ts";
import { parseLoopInbound } from "../../supabase/functions/_shared/loopmessage.ts";
import { CHANNEL_REPLIES } from "../../supabase/functions/_shared/channel.ts";
import { toBubbles } from "../../supabase/functions/_shared/conversation.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = Date.UTC(2026, 9, 19, 15), SECRET = "i".repeat(40);

function world(e: Record<string, string> = {}, over: Record<string, unknown> = {}) {
  const st = { claimed: new Set<string>(), people: new Map<string, { userId: string; threadId: string | null }>(), refused: new Set<string>(), optOut: new Map<string, boolean>(), outbox: [] as any[] };
  const store: InboundStore = {
    async claimMessage(id) { if (st.claimed.has(id)) return false; st.claimed.add(id); return true; },
    async person(c) { return st.people.get(c) ?? null; },
    async refusedBefore(c) { const seen = st.refused.has(c); st.refused.add(c); return seen; },
    async createPerson(c) { const p = { userId: `u-${st.people.size + 1}`, threadId: null }; st.people.set(c, p); return p; },
    async setThread(c, t) { st.people.get(c)!.threadId = t; },
    async setOptOut(c, out) { st.optOut.set(c, out); },
    async enqueueReply(userId, key, text, at) { if (st.outbox.some((o) => o.userId === userId && o.key === key)) return false; st.outbox.push({ userId, key, text, at }); return true; },
  };
  const sent: { contact: string; bubbles: string[] }[] = [], chats: any[] = [], delivered: any[] = [];
  const deps = {
    env: { get: (k: string) => ({ TRAINEE_INBOUND_SECRET: SECRET, LOOPMESSAGE_API_KEY: "k-live", ...e } as Record<string, string>)[k] }, now: () => NOW,
    store: () => store, send: () => async (contact: string, bubbles: string[]) => { sent.push({ contact, bubbles }); return { ok: true as const, id: null }; },
    chat: async (a: any) => { chats.push(a); return { status: 200, reply: `Answer to: ${a.message}`, threadId: "t-1" }; },
    deliverReply: async (a: any) => { delivered.push(a); }, ...over,
  };
  const text = (body: unknown, q = `?secret=${SECRET}`) => handleInbound(new Request(`https://fn.test/trainee-inbound${q}`, { method: "POST", body: JSON.stringify(body) }), deps as any);
  return { st, sent, chats, delivered, text, deps };
}
const msg = (id: string, text: string, from = "+1 (555) 000-1111") => ({ alert_type: "message_inbound", message_id: id, recipient: from, text });

Deno.test("WO-013b-2/I1 the door: a 32+ character secret (query or header), NOT_WIRED without the LoopMessage key", async () => {
  eq((await world({ TRAINEE_INBOUND_SECRET: "short" }).text(msg("1", "hi"))).status, 503);
  eq((await world().text(msg("1", "hi"), "?secret=wrong")).status, 403);
  const h = world();
  eq((await handleInbound(new Request("https://fn.test/", { method: "POST", headers: { "x-trainee-secret": SECRET }, body: JSON.stringify(msg("1", "hi")) }), h.deps as any)).status, 200);
  const unwired = world({ LOOPMESSAGE_API_KEY: "" });
  eq((await unwired.text(msg("1", "hi"))).status, 503);
  eq([unwired.chats.length, unwired.st.claimed.size], [0, 0], "no turn, and the message is not claimed: the provider's retry will run it once wired");
});

Deno.test("WO-013b-2/I2 a message id runs once, ever; callbacks, empty text and id-less messages run nothing", async () => {
  const h = world({ TRAINEE_SIGNUP: "open" });
  await h.text(msg("m1", "find me data analyst jobs"));
  const again = await (await h.text(msg("m1", "find me data analyst jobs"))).json();
  eq([again.ignored, h.chats.length, h.st.outbox.length], ["duplicate webhook", 1, 1]);
  for (const body of [{ alert_type: "message_sent", message_id: "m2", recipient: "+15550001111", text: "x" }, { alert_type: "message_inbound", message_id: "m3", recipient: "+15550001111", text: "  " }, { alert_type: "message_inbound", recipient: "+15550001111", text: "hi" }]) {
    assert((await (await h.text(body)).json()).ignored, JSON.stringify(body));
  }
  eq(h.chats.length, 1);
  eq(parseLoopInbound({ alert_type: "message_failed", message_id: "x", recipient: "+1", text: "t" }).kind, "ignored", "a failed-send callback is not a text");
});

Deno.test("WO-013b-2/I3 STOP, START, HELP: answered straight away, recorded by number, no account, no model call", async () => {
  const h = world();
  const r = await (await h.text(msg("s1", "STOP"))).json();
  eq([r.command, h.st.optOut.get("+15550001111"), h.st.people.size, h.chats.length], ["stop", true, 0, 0]);
  eq(h.sent[0], { contact: "+15550001111", bubbles: toBubbles(CHANNEL_REPLIES.stop) });
  await h.text(msg("s2", "start"));
  eq(h.st.optOut.get("+15550001111"), false);
  await h.text(msg("s3", "HELP"));
  eq(h.sent.map((s) => s.bubbles), [toBubbles(CHANNEL_REPLIES.stop), toBubbles(CHANNEL_REPLIES.start), toBubbles(CHANNEL_REPLIES.help)]);
});

Deno.test("WO-013b-2/I4 signup is closed by default: a stranger is told once, gets no account and costs no model call", async () => {
  const h = world();
  const r = await (await h.text(msg("c1", "hi, I need a job"))).json();
  eq([r.refused, h.st.people.size, h.chats.length], ["signup closed", 0, 0]);
  eq(h.sent[0].bubbles, toBubbles(SIGNUP_CLOSED_REPLY));
  await h.text(msg("c2", "hello?"));
  eq(h.sent.length, 1, "told once, not on every text");
  const env = (m: Record<string, string>) => ({ get: (k: string) => m[k] });
  assert(signupAllows(env({ TRAINEE_ALLOWED_CONTACTS: "+1 555 000 1111, owner@example.com" }), "+15550001111"), "an allowlisted number, however it was written");
  assert(signupAllows(env({ TRAINEE_ALLOWED_CONTACTS: "+15550001111,OWNER@example.com" }), "owner@example.com"));
  assert(!signupAllows(env({ TRAINEE_ALLOWED_CONTACTS: "+15550001111" }), "+15550002222"));
  assert(signupAllows(env({ TRAINEE_SIGNUP: "open" }), "+15550002222"));
});

Deno.test("WO-013b-2/I5 an allowed contact gets an account; the turn runs as them with a stable key; the reply is queued and sent", async () => {
  const h = world({ TRAINEE_ALLOWED_CONTACTS: "+15550001111" });
  await h.text(msg("lm-42", "find me data analyst jobs in nyc"));
  eq(h.chats[0], { userId: "u-1", threadId: null, message: "find me data analyst jobs in nyc", turnKey: await turnKeyFor("lm-42") });
  assert(/^lm_[0-9a-f]{32}$/.test(h.chats[0].turnKey), h.chats[0].turnKey);
  eq(h.st.outbox, [{ userId: "u-1", key: "reply:lm-42", text: "Answer to: find me data analyst jobs in nyc", at: NOW }]);
  eq(h.delivered, [{ userId: "u-1", key: "reply:lm-42", apiKey: "k-live", now: NOW }]);
  await h.text(msg("lm-43", "and remote ones"));
  eq([h.chats[1].userId, h.chats[1].threadId], ["u-1", "t-1"], "the same person, in the thread the first turn opened");
  eq(h.st.people.size, 1);
});

Deno.test("WO-013b-2/I6 failures are said once, never silent and never doubled", async () => {
  const down = world({ TRAINEE_SIGNUP: "open" }, { chat: async () => { throw new Error("agent-chat HTTP 500"); } });
  await down.text(msg("f1", "hi"));
  eq(down.st.outbox[0].text, CHAT_DOWN_REPLY, "the chat failing still answers, through the outbox");
  const sendFails = world({ TRAINEE_SIGNUP: "open" }, { deliverReply: async () => { throw new Error("record delivery: connection reset"); } });
  eq((await sendFails.text(msg("f2", "hi"))).status, 200);
  eq(sendFails.sent.length, 0, "the reply may already be with the provider: no second 'couldn't answer' text");
  const storeFails = world({ TRAINEE_SIGNUP: "open" }, { store: () => ({ ...world().deps.store(), claimMessage: async () => true, person: async () => null, createPerson: async () => { throw new Error("create an account: phone exists"); } }) });
  eq((await storeFails.text(msg("f3", "hi"))).status, 500);
  eq(storeFails.sent.map((s) => s.bubbles), [toBubbles(CHAT_DOWN_REPLY)], "a failure after the claim is said once");
});

Deno.test("WO-013b-2/I7 the Supabase store: a seen message id or reply key is 'already', any other error is an error", async () => {
  const mk = (error: any) => ({ from: () => ({ insert: async () => ({ data: null, error }) }) });
  eq(await supabaseInboundStore(mk(null)).claimMessage("m1", NOW), true);
  eq(await supabaseInboundStore(mk({ code: "23505", message: "duplicate key value" })).claimMessage("m1", NOW), false);
  eq(await supabaseInboundStore(mk({ code: "23505", message: "duplicate key value" })).enqueueReply("u1", "reply:m1", "x", NOW), false);
  let msg2 = "";
  try { await supabaseInboundStore(mk({ code: "42501", message: "permission denied" })).claimMessage("m1", NOW); } catch (e) { msg2 = (e as Error).message; }
  assert(/claim the inbound message: permission denied/.test(msg2), msg2);
});

// SERIAL-1462: which providers expose the id of the message the person replied to, in each adapter's real payload shape.
import { parseWhatsAppBody } from "../../supabase/functions/_shared/whatsapp.ts";
import { parseTelegramUpdate } from "../../supabase/functions/_shared/telegram.ts";
Deno.test("SERIAL-1462 reply-to ids: WhatsApp Cloud messages[].context.id and Telegram reply_to_message.message_id are read; LoopMessage carries none", async () => {
  // Meta's WhatsApp Cloud API webhook: a text sent as a reply carries `context` with the quoted message's id.
  const wa = {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA-1", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { display_phone_number: "15550000000", phone_number_id: "PNID-1" },
      contacts: [{ profile: { name: "Test" }, wa_id: "15551234567" }],
      messages: [{ from: "15551234567", id: "wamid.HBgLMTU1NTEyMzQ1NjcVAgASGBQzQTBEMEY2NEM2RkQ4RDA2RDk5NwA=", timestamp: "1760000100", type: "text", text: { body: "yes" },
        context: { from: "15550000000", id: "wamid.HBgLMTU1NTEyMzQ1NjcVAgARGBI5QjdBMkI3RjlGMEMxOEE2RDAA" } }],
    } }] }],
  };
  const r = parseWhatsAppBody(wa, "PNID-1");
  eq(r.messages.length, 1);
  eq(r.messages[0].replyToMessageId, "wamid.HBgLMTU1NTEyMzQ1NjcVAgARGBI5QjdBMkI3RjlGMEMxOEE2RDAA", "the quoted message's id, as Meta gives it");
  const waPlain = structuredClone(wa); delete (waPlain.entry[0].changes[0].value.messages[0] as any).context;
  eq(parseWhatsAppBody(waPlain, "PNID-1").messages[0].replyToMessageId, null, "no context: no reply id");
  // Telegram Bot API: reply_to_message on the message.
  const tg = parseTelegramUpdate({ update_id: 9010, message: { message_id: 51, date: 1760000100, text: "yes", chat: { id: 4242, type: "private" }, from: { id: 4242, is_bot: false, first_name: "T" },
    reply_to_message: { message_id: 50, date: 1760000050, text: "card", chat: { id: 4242, type: "private" }, from: { id: 1, is_bot: true, first_name: "Trainee" } } } });
  eq(tg.message?.replyToMessageId, "50");
  eq(parseTelegramUpdate({ update_id: 9011, message: { message_id: 52, date: 1760000101, text: "yes", chat: { id: 4242, type: "private" }, from: { id: 4242, is_bot: false, first_name: "T" } } }).message?.replyToMessageId, null);
  // LoopMessage's recorded inbound shape (alert_type message_inbound) carries no reply-to field: the turn gets none.
  const w = world({ TRAINEE_SIGNUP: "open" });
  await w.text(msg("lm-1", "yes"));
  eq(w.chats.length, 1);
  eq("replyToMessageId" in w.chats[0], false, "an iMessage text carries no reply id, so none is handed on");
});
