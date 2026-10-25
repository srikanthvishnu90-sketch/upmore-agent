// Fixture tests for supabase/functions/telegram-inbound (Trainee test surface).
// Recorded-shape Telegram Bot API webhook payloads; all network via doubles.
import { handleTelegramWebhook } from "../../supabase/functions/_shared/telegram_bridge.ts";
import { FakeAdmin, assert, assertEq, envOf, fakeFetch, TEST_USER, SUPABASE_URL, SERVICE_KEY } from "./lib/channel_fixture.ts";

const CHAT_ID = 424242;
const SECRET = "fixture-webhook-secret";

function deps(reply = "Hello from the agent.", envExtra: Record<string, string> = {}) {
  const admin = new FakeAdmin();
  const f = fakeFetch(reply);
  const env = envOf({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TELEGRAM_BOT_TOKEN: "fixture-bot-token",
    TELEGRAM_WEBHOOK_SECRET: SECRET,
    CHANNEL_TEST_USER_ID: TEST_USER,
    TELEGRAM_ALLOWED_CHAT_IDS: String(CHAT_ID),
    ...envExtra,
  });
  return { admin, calls: f.calls, d: { env, fetchFn: f.fn, createAdmin: () => admin, paceMs: 0 } as any };
}

function tgReq(update: any, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  return new Request("https://fixture.supabase.co/functions/v1/telegram-inbound", {
    method: "POST", headers, body: JSON.stringify(update),
  });
}
const textUpdate = (text: string, id = 11, chatId = CHAT_ID) => ({
  update_id: 9001,
  message: { message_id: id, date: 1760000000, text, chat: { id: chatId, type: "private" }, from: { id: 777, is_bot: false, first_name: "Test" } },
});
const agentCalls = (calls: any[]) => calls.filter((c) => c.url.includes("/functions/v1/agent-chat"));
// sendMessage calls only: the presentation lane added sendChatAction
// (typing) to the same API host, and a typing ping is not a message send.
const sendCalls = (calls: any[]) => calls.filter((c) => c.url.includes("api.telegram.org") && c.url.endsWith("/sendMessage"));

Deno.test("valid telegram turn reaches the agent and the reply is sent back", async () => {
  const { d, calls } = deps();
  const res = await handleTelegramWebhook(tgReq(textUpdate("find me software intern roles")), d);
  assertEq(res.status, 200);
  const body = await res.json();
  assertEq(body.ok, true);
  assertEq(body.parts_sent, 1);
  const ac = agentCalls(calls);
  assertEq(ac.length, 1);
  const sent = JSON.parse(ac[0].init.body);
  assertEq(sent.as_user_id, TEST_USER);
  assertEq(sent.message, "find me software intern roles");
  assertEq(ac[0].init.headers.Authorization, `Bearer ${SERVICE_KEY}`);
  const sc = sendCalls(calls);
  assertEq(sc.length, 1);
  assertEq(JSON.parse(sc[0].init.body).chat_id, CHAT_ID);
  assertEq(JSON.parse(sc[0].init.body).text, "Hello from the agent.");
  assert(sc[0].url.includes("/botfixture-bot-token/sendMessage"), "bot token from env in send URL");
});

Deno.test("bad or missing secret header is rejected before any processing", async () => {
  for (const bad of ["wrong-secret", null]) {
    const { d, calls } = deps();
    const res = await handleTelegramWebhook(tgReq(textUpdate("hi"), bad), d);
    assertEq(res.status, 403);
    assertEq(calls.length, 0, "no network calls on a rejected webhook");
  }
});

Deno.test("missing webhook secret env fails closed", async () => {
  const { d, calls } = deps("x", { TELEGRAM_WEBHOOK_SECRET: "" });
  const res = await handleTelegramWebhook(tgReq(textUpdate("hi")), d);
  assertEq(res.status, 403);
  assertEq(calls.length, 0);
});

Deno.test("a ?secret= query value does NOT authenticate a telegram webhook", async () => {
  const { d, calls } = deps();
  const req = new Request(
    `https://fixture.supabase.co/functions/v1/telegram-inbound?secret=${SECRET}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(textUpdate("hi")) },
  );
  const res = await handleTelegramWebhook(req, d);
  assertEq(res.status, 403);
  assertEq(agentCalls(calls).length, 0);
});

Deno.test("unknown sender never reaches the agent; silence by default", async () => {
  const { d, calls } = deps();
  const res = await handleTelegramWebhook(tgReq(textUpdate("hi", 12, 999999)), d);
  assertEq(res.status, 200);
  const body = await res.json();
  assertEq(body.ignored, "unknown sender");
  assertEq(agentCalls(calls).length, 0);
  assertEq(sendCalls(calls).length, 0);
});

Deno.test("unknown sender gets the polite not-authorized reply only when configured", async () => {
  const { d, calls } = deps("x", { CHANNEL_UNKNOWN_REPLY: "1" });
  const res = await handleTelegramWebhook(tgReq(textUpdate("hi", 13, 999999)), d);
  assertEq(res.status, 200);
  assertEq(agentCalls(calls).length, 0);
  const sc = sendCalls(calls);
  assertEq(sc.length, 1);
  assert(String(JSON.parse(sc[0].init.body).text).includes("not authorized"), "polite not-authorized text sent");
});

Deno.test("oversized agent reply is split under the 4096-char telegram limit", async () => {
  const long = ("Sentence number one is here. ".repeat(400)).trim(); // ~12k chars
  const { d, calls } = deps(long);
  const res = await handleTelegramWebhook(tgReq(textUpdate("long please")), d);
  assertEq(res.status, 200);
  const sc = sendCalls(calls);
  assert(sc.length >= 3, `expected >=3 parts, got ${sc.length}`);
  for (const c of sc) assert(JSON.parse(c.init.body).text.length <= 4096, "each part within the telegram limit");
  const joined = sc.map((c) => JSON.parse(c.init.body).text).join(" ");
  assert(joined.includes("Sentence number one is here."), "content preserved across the split");
});

Deno.test("duplicate telegram message id is suppressed (agent called once)", async () => {
  const { d, calls } = deps();
  await handleTelegramWebhook(tgReq(textUpdate("hello", 21)), d);
  const res2 = await handleTelegramWebhook(tgReq(textUpdate("hello", 21)), d);
  const body2 = await res2.json();
  assertEq(body2.ignored, "duplicate webhook");
  assertEq(agentCalls(calls).length, 1);
});

Deno.test("non-text updates are ignored without an agent call", async () => {
  const { d, calls } = deps();
  const edited = { update_id: 9002, edited_message: { message_id: 31, text: "edited", chat: { id: CHAT_ID, type: "private" } } };
  const res = await handleTelegramWebhook(tgReq(edited), d);
  assertEq(res.status, 200);
  assertEq(agentCalls(calls).length, 0);
});

// SERIAL-1462: a Telegram reply carries the replied-to message as message.reply_to_message (Bot API); its message_id
// reaches the turn as reply_to_message_id, so a card's text yes can be bound to the message that carried the card.
Deno.test("SERIAL-1462 a reply in Telegram carries reply_to_message.message_id to the agent; a plain message carries none", async () => {
  const { d, calls } = deps();
  const reply = {
    update_id: 9003,
    message: {
      message_id: 41, date: 1760000100, text: "yes", chat: { id: CHAT_ID, type: "private" }, from: { id: 777, is_bot: false, first_name: "Test" },
      reply_to_message: { message_id: 40, date: 1760000050, text: "2 applications are ready. Every answer below goes exactly as shown.", chat: { id: CHAT_ID, type: "private" }, from: { id: 999, is_bot: true, first_name: "Trainee" } },
    },
  };
  const res = await handleTelegramWebhook(tgReq(reply), d);
  assertEq(res.status, 200);
  const bodies = agentCalls(calls).map((c) => JSON.parse(c.init?.body ?? "{}"));
  assertEq(bodies.length, 1);
  assertEq(bodies[0].reply_to_message_id, "40", "the replied-to message's id, as Telegram gives it");
  const plain = await handleTelegramWebhook(tgReq(textUpdate("yes", 42)), d);
  assertEq(plain.status, 200);
  const after = agentCalls(calls).map((c) => JSON.parse(c.init?.body ?? "{}"));
  assertEq(after.length, 2);
  assert(!("reply_to_message_id" in after[1]), "a plain message carries no reply id");
});
