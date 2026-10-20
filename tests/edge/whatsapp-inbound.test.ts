// Fixture tests for supabase/functions/whatsapp-inbound (Twilio sandbox shape).
// Recorded-shape form-encoded webhooks; X-Twilio-Signature computed exactly the
// way Twilio computes it (HMAC-SHA1 over URL + sorted params, base64).
import { handleWhatsappWebhook } from "../../supabase/functions/_shared/whatsapp_twilio.ts";
import { FakeAdmin, assert, assertEq, envOf, fakeFetch, TEST_USER, SUPABASE_URL, SERVICE_KEY } from "./lib/channel_fixture.ts";

const AUTH = "fixture-twilio-auth-token";
const SID = "ACfixture";
const FROM_NUM = "whatsapp:+14155238886"; // twilio sandbox sender
const USER_NUM = "+12246029341";
const HOOK_URL = "https://fixture.supabase.co/functions/v1/whatsapp-inbound";

async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function deps(reply = "Hello from the agent.", envExtra: Record<string, string> = {}) {
  const admin = new FakeAdmin();
  const f = fakeFetch(reply);
  const env = envOf({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: AUTH, TWILIO_WHATSAPP_FROM: FROM_NUM,
    CHANNEL_TEST_USER_ID: TEST_USER,
    WHATSAPP_ALLOWED_NUMBERS: USER_NUM,
    ...envExtra,
  });
  return { admin, calls: f.calls, d: { env, fetchFn: f.fn, createAdmin: () => admin, paceMs: 0 } as any };
}

async function waReq(params: Record<string, string>, sign = true, authToken = AUTH) {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (sign) headers["x-twilio-signature"] = await twilioSignature(authToken, HOOK_URL, params);
  return new Request(HOOK_URL, { method: "POST", headers, body: new URLSearchParams(params).toString() });
}
const waParams = (body: string, sid = "SM1001", from = `whatsapp:${USER_NUM}`) => ({
  From: from, To: FROM_NUM, Body: body, MessageSid: sid, NumMedia: "0", ProfileName: "Test",
});
const agentCalls = (calls: any[]) => calls.filter((c) => c.url.includes("/functions/v1/agent-chat"));
const sendCalls = (calls: any[]) => calls.filter((c) => c.url.includes("api.twilio.com"));

Deno.test("valid twilio whatsapp turn reaches the agent and the reply is sent via the Messages API", async () => {
  const { d, calls } = deps();
  const res = await handleWhatsappWebhook(await waReq(waParams("find me finance intern roles")), d);
  assertEq(res.status, 200);
  const body = await res.json();
  assertEq(body.ok, true);
  assertEq(body.parts_sent, 1);
  const ac = agentCalls(calls);
  assertEq(ac.length, 1);
  const sent = JSON.parse(ac[0].init.body);
  assertEq(sent.as_user_id, TEST_USER);
  assertEq(sent.message, "find me finance intern roles");
  const sc = sendCalls(calls);
  assertEq(sc.length, 1);
  assert(sc[0].url.includes(`/Accounts/${SID}/Messages.json`), "messages api url carries the account sid");
  const form = new URLSearchParams(sc[0].init.body);
  assertEq(form.get("From"), FROM_NUM);
  assertEq(form.get("To"), `whatsapp:${USER_NUM}`);
  assertEq(form.get("Body"), "Hello from the agent.");
  const authz = sc[0].init.headers.Authorization as string;
  assert(authz.startsWith("Basic "), "twilio basic auth header present");
  assertEq(atob(authz.slice(6)), `${SID}:${AUTH}`);
});

Deno.test("bad or missing twilio signature is rejected before any processing", async () => {
  {
    const { d, calls } = deps();
    const req = await waReq(waParams("hi"), true, "the-wrong-token");
    const res = await handleWhatsappWebhook(req, d);
    assertEq(res.status, 403);
    assertEq(calls.length, 0);
  }
  {
    const { d, calls } = deps();
    const req = await waReq(waParams("hi"), false);
    const res = await handleWhatsappWebhook(req, d);
    assertEq(res.status, 403);
    assertEq(calls.length, 0);
  }
});

Deno.test("missing twilio auth token env fails closed", async () => {
  const { d, calls } = deps("x", { TWILIO_AUTH_TOKEN: "" });
  const res = await handleWhatsappWebhook(await waReq(waParams("hi")), d);
  assertEq(res.status, 403);
  assertEq(calls.length, 0);
});

Deno.test("unknown sender number never reaches the agent", async () => {
  const { d, calls } = deps();
  const res = await handleWhatsappWebhook(await waReq(waParams("hi", "SM1002", "whatsapp:+13125550199")), d);
  assertEq(res.status, 200);
  const body = await res.json();
  assertEq(body.ignored, "unknown sender");
  assertEq(agentCalls(calls).length, 0);
  assertEq(sendCalls(calls).length, 0);
});

Deno.test("oversized agent reply is split under the 4096-char whatsapp limit", async () => {
  const long = ("Sentence number one is here. ".repeat(400)).trim();
  const { d, calls } = deps(long);
  const res = await handleWhatsappWebhook(await waReq(waParams("long please", "SM1003")), d);
  assertEq(res.status, 200);
  const sc = sendCalls(calls);
  assert(sc.length >= 3, `expected >=3 parts, got ${sc.length}`);
  for (const c of sc) {
    const form = new URLSearchParams(c.init.body);
    assert((form.get("Body") ?? "").length <= 4096, "each part within the whatsapp limit");
  }
});

Deno.test("duplicate MessageSid is suppressed (agent called once)", async () => {
  const { d, calls } = deps();
  await handleWhatsappWebhook(await waReq(waParams("hello", "SM1004")), d);
  const res2 = await handleWhatsappWebhook(await waReq(waParams("hello", "SM1004")), d);
  const body2 = await res2.json();
  assertEq(body2.ignored, "duplicate webhook");
  assertEq(agentCalls(calls).length, 1);
});

Deno.test("empty-body webhook (status callback shape) is ignored without an agent call", async () => {
  const { d, calls } = deps();
  const cb = { From: `whatsapp:${USER_NUM}`, To: FROM_NUM, MessageSid: "SM1005", MessageStatus: "delivered" };
  const res = await handleWhatsappWebhook(await waReq(cb), d);
  assertEq(res.status, 200);
  assertEq(agentCalls(calls).length, 0);
});
