// TELEGRAM LINK REPLY CODE (review #348; 20261031050000_telegram_link_reply_code.sql), through the real webhooks (iMessage's
// trainee-inbound, trainee-telegram), the real inbound core and deliverer, over the memory database (channel_memory.ts, the
// rules of the SQL), fake provider HTTP. No network, no model.
// The hijack: a stranger opens a leaked "connect telegram" link; the owner then says a plain "yes" on iMessage, meant for
// something else (an application card). That yes linked the stranger's chat to the account. Now the yes goes on to the turn
// (the brain, where the card is) and links nothing; only "LINK <the 4-digit code shown on the owner's channel>" links, once.
// Run: deno test -A --no-check tests/edge/telegram-link-reply-code.test.ts
import assertNode from "node:assert/strict";
import { memoryChannelWorld } from "../../supabase/functions/_shared/channel_memory.ts";
import { adaptersFromEnv } from "../../supabase/functions/_shared/channel_registry.ts";
import { deliverDue } from "../../supabase/functions/_shared/channel.ts";
import * as IN from "../../supabase/functions/_shared/channel_inbound.ts";
import { loopSend } from "../../supabase/functions/_shared/loopmessage.ts";
import { telegramAdapter } from "../../supabase/functions/_shared/telegram.ts";
import { handleInbound } from "../../supabase/functions/trainee-inbound/handler.ts";
import { handleTelegram } from "../../supabase/functions/trainee-telegram/handler.ts";

const X = IN as Record<string, unknown>; // read from the module, so this file runs (and fails) on the code before the fix
const NO_MATCH = (X.LINK_CODE_NO_MATCH_REPLY as string) ?? "<LINK_CODE_NO_MATCH_REPLY>";
const BUSY = (X.TELEGRAM_LINK_BUSY_REPLY as string) ?? "<TELEGRAM_LINK_BUSY_REPLY>";
const MIN = 60000, T0 = Date.UTC(2026, 10, 4, 15, 0, 0);
const mk = (p: string, n: number) => `${p}${"x".repeat(n)}`;
const TG_TOKEN = `${7000 + 3}:${mk("TeSt", 31)}`, TG_SECRET = mk("tgsecret_", 32), LM_KEY = mk("loop", 20), IN_SECRET = mk("insecret", 32);
const HOME = "+15550600001";

function world() {
  const W = memoryChannelWorld();
  const clock = { t: T0 };
  const sent: { to: string; text: string }[] = [];
  let seq = 0;
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  const fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const b = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.host === "api.telegram.org") {
      const method = u.pathname.split("/").pop();
      if (method === "sendMessage") { sent.push({ to: `tg:${b.chat_id}`, text: String(b.text) }); return json({ ok: true, result: { message_id: ++seq } }); }
      return json({ ok: true, result: method === "sendChatAction" || method === "answerCallbackQuery" ? true : { message_id: ++seq } });
    }
    if (u.host === "a.loopmessage.com") { sent.push({ to: String(b.contact), text: String(b.text) }); return json({ message_id: `lm-${++seq}`, success: true }); }
    throw new TypeError(`network refused: ${u.host}`);
  }) as typeof globalThis.fetch;
  const vars: Record<string, string> = { TRAINEE_INBOUND_SECRET: IN_SECRET, LOOPMESSAGE_API_KEY: LM_KEY, TELEGRAM_BOT_TOKEN: TG_TOKEN, TELEGRAM_WEBHOOK_SECRET: TG_SECRET,
    TELEGRAM_BOT_USERNAME: "TraineeLinkBot", TRAINEE_SIGNUP: "closed" };
  const env = { get: (k: string) => vars[k] || undefined };
  const sleep = async (ms: number) => { clock.t += ms; };
  const turns: { contact: string; userId: string; message: string }[] = [];
  let cur = "";
  const chat = async (a: any) => { turns.push({ contact: cur, userId: a.userId, message: a.message }); return { status: 200, threadId: a.threadId ?? `t-${a.userId}`, reply: `[${a.userId}] answer to ${a.message}` } as any; };
  const adapters = () => adaptersFromEnv(env, { fetch, clock: () => clock.t, sleep });
  const head = async (a: { userId: string; key: string; now: number }) => {
    const s = W.delivery({ only: { userId: a.userId, key: a.key } });
    const r = await deliverDue({ store: s, adapters: adapters(), now: a.now, limit: 1 });
    await s.release();
    return r;
  };
  let mid = 0, upd = 0;
  const lm = async (from: string, text: string) => {
    cur = from; clock.t += 1000;
    const res = await handleInbound(new Request(`https://fn.test/trainee-inbound?secret=${IN_SECRET}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ alert_type: "message_inbound", message_id: `lm-in-${++mid}`, recipient: from, text }) }), {
      env, now: () => clock.t, store: () => W.inbound, send: (k) => loopSend({ apiKey: k, fetch, sleep }), chat, deliverReply: (a) => head({ userId: a.userId, key: a.key, now: a.now }),
    });
    assertNode.equal(res.status, 200);
  };
  const tg = async (chatId: number, text: string, username?: string) => {
    cur = `tg:${chatId}`; clock.t += 1000;
    const req = new Request("https://fn.test/trainee-telegram", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": TG_SECRET },
      body: JSON.stringify({ update_id: ++upd, message: { message_id: ++mid, chat: { id: chatId, type: "private" }, from: { id: chatId, is_bot: false, first_name: "T", ...(username ? { username } : {}) }, date: Math.floor(clock.t / 1000), text } }) });
    const res = await handleTelegram(req, { env, now: () => clock.t, store: () => W.inbound, chat, deliver: (a) => head({ userId: a.userId, key: a.key, now: a.now }),
      adapter: (e) => telegramAdapter({ token: e.get("TELEGRAM_BOT_TOKEN") || "", webhookSecret: TG_SECRET, fetch, clock: () => clock.t, sleep }) });
    assertNode.equal(res.status, 200);
  };
  const A = W.newUser();
  W.link(HOME, A, clock.t - 2 * 3600000, { lastInboundAt: clock.t - 3600000, threadId: `t-${A}`, phone: HOME });
  const owner = (key: string) => W.contacts.get(key)?.userId ?? null;
  const mark = () => sent.length;
  const read = (key: string, since = 0) => sent.slice(since).filter((s) => s.to === key).map((s) => s.text);
  const code = async () => await W.inbound.issueLinkNonce!(A, clock.t);
  return { W, A, clock, turns, lm, tg, owner, mark, read, code };
}
const codeIn = (t: string) => /\bLINK (\d{4})\b/.exec(t)?.[1] ?? null;

Deno.test("#348: the owner's plain yes after a stranger opened a leaked link links nothing and goes to the turn", async () => {
  const w = world();
  const S = 7600000001;
  const m = w.mark();
  await w.tg(S, `/start ${await w.code()}`, "stranger_one");
  const asked = w.read(HOME, m);
  assertNode.equal(asked.length, 1, `the owner's channel is asked once: ${JSON.stringify(asked)}`);
  const t = w.turns.length;
  await w.lm(HOME, "yes"); // meant for an application card
  assertNode.equal(w.owner(`tg:${S}`), null, "the stranger's chat is linked to the owner's account by a plain yes");
  assertNode.ok(w.turns.slice(t).some((x) => x.userId === w.A && x.message === "yes"), "the plain yes goes on to the owner's turn (where the card is)");
  assertNode.ok(!w.read(`tg:${S}`).some((x) => x === IN.LINKED_HERE_REPLY), "the stranger is never told it is linked");
});

Deno.test("#348: only LINK <the request's code> from the owner's channel links, once; the code is never shown to the opener", async () => {
  const w = world();
  const M = 7600000002;
  const m = w.mark();
  await w.tg(M, `/start ${await w.code()}`, "owner_one");
  const ask = w.read(HOME, m)[0] ?? "";
  assertNode.ok(ask.includes("@owner_one"), `the question names who asks: ${ask}`);
  const c = codeIn(ask);
  assertNode.ok(c, `the question carries a 4-digit LINK code: ${ask}`);
  assertNode.ok(!w.read(`tg:${M}`).some((x) => x.includes(c!)), "the opener's chat never sees the code");
  // a wrong code: nothing, said plainly
  const wrong = String((Number(c) + 1) % 10000).padStart(4, "0");
  const m2 = w.mark();
  await w.lm(HOME, `LINK ${wrong}`);
  assertNode.equal(w.owner(`tg:${M}`), null, "a wrong code linked the chat");
  assertNode.deepEqual(w.read(HOME, m2), [NO_MATCH]);
  // the chat itself sending the code: it is no one's, so it reads nothing and links nothing
  await w.tg(M, `LINK ${c}`, "owner_one");
  assertNode.equal(w.owner(`tg:${M}`), null, "the new chat confirmed itself");
  // the right code from the owner's channel
  const t = w.turns.length, m3 = w.mark();
  await w.lm(HOME, `link ${c}`);
  assertNode.equal(w.owner(`tg:${M}`), w.A, "the right LINK code did not link the chat");
  assertNode.ok(w.read(`tg:${M}`, m3).includes(IN.LINKED_HERE_REPLY), "the linked chat is told");
  assertNode.equal(w.turns.length, t, "LINK <code> never reaches the brain");
  // once: the same code again does nothing more
  const m4 = w.mark();
  await w.lm(HOME, `LINK ${c}`);
  assertNode.deepEqual(w.read(HOME, m4), [NO_MATCH]);
});

Deno.test("#348: a stranger with no username is named by Telegram id; at most 3 link questions wait per account", async () => {
  const w = world();
  const m = w.mark();
  await w.tg(7600000010, `/start ${await w.code()}`);
  assertNode.ok(w.read(HOME, m)[0]?.includes("Telegram id 7600000010"), `who asks: ${w.read(HOME, m)[0]}`);
  await w.tg(7600000011, `/start ${await w.code()}`);
  await w.tg(7600000012, `/start ${await w.code()}`);
  const m2 = w.mark();
  await w.tg(7600000013, `/start ${await w.code()}`);
  assertNode.deepEqual(w.read("tg:7600000013", m2), [BUSY]);
  assertNode.equal(w.read(HOME, m2).length, 0, "a 4th question was asked");
  // a plain yes still links none of the three
  await w.lm(HOME, "yes");
  for (const c of [7600000010, 7600000011, 7600000012, 7600000013]) assertNode.equal(w.owner(`tg:${c}`), null);
});
