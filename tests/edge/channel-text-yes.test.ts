// P1 TEXT YES — the channel half (Deno). A prepared batch's card reaches a
// texting channel (F-037 readback) and a texted "yes" / "yes but not 2" /
// "no" resolves exactly that card. Drives the REAL handlers
// (telegram_bridge.handleTelegramWebhook, whatsapp_twilio.handleWhatsappWebhook)
// and the REAL core planner (career_task_bridge.normalizeCareerBatchRequest +
// planCareerBatchIntent) behind an agent-chat double; doubles only at fetch
// (Telegram / Twilio / agent-chat wire) and supabase-js. Nothing is sent to a
// real person. The worker side (10 submits, exclusions, the observation gate)
// is tests/career-text-yes-approval.test.cjs.
// Run: deno test --no-check -A tests/edge/channel-text-yes.test.ts
import { handleTelegramWebhook } from "../../supabase/functions/_shared/telegram_bridge.ts";
import { handleWhatsappWebhook } from "../../supabase/functions/_shared/whatsapp_twilio.ts";
import { parseTextApproval } from "../../supabase/functions/_shared/channel_present.ts";
import { normalizeCareerBatchRequest, planCareerBatchIntent } from "../../supabase/functions/_shared/career_task_bridge.js";
import {
  FakeAdminApprovals, assert, assertEq, envOf, fakeFetchRich, TEST_USER, SUPABASE_URL, SERVICE_KEY,
} from "./lib/channel_fixture.ts";

const CHAT_ID = 515151;
const OTHER_CHAT = 626262;
const SECRET = "fixture-webhook-secret";
const THREAD = "thread-ty";
const RUN = "batch-textyes10";
const RUN2 = "batch-textyes20";
const HASH = "b".repeat(64);
const HASH2 = "c".repeat(64);
const OTHER_USER = "7de0a11a-0000-4000-8000-0000000000f0";

const keyOf = (n: number) => `greenhouse:textyes${n}:software-engineering-intern`;

// A stored career_batch_run/v1 record with N doorstep applications — the
// shape the worker writes (155 run + summary), read owner-scoped.
function storedRun(runId: string, hash: string, n = 10, userId = TEST_USER) {
  const selected: string[] = [];
  const apps: Record<string, unknown> = {};
  for (let i = 1; i <= n; i++) {
    const k = keyOf(i);
    selected.push(k);
    apps[k] = { postingKey: k, company: `TextYes ${i}`, role: "Software Engineering Intern", stage: "doorstep", payloadSha256: String(i).padStart(64, "0") };
  }
  return {
    version: "career_batch_run/v1", runId, userId, status: "awaiting_approval",
    run: { id: runId, userId, status: "awaiting_approval", cardSha256: hash, selected, apps },
    summary: { doorstep: n },
  };
}

// The agent-chat double runs the real core planner on structured batch
// requests and records every committed approve intent (the
// career_batch_turn_commit_v1 row the worker would claim).
function harness(opts: { seedIntent?: boolean } = {}) {
  const admin = new FakeAdminApprovals();
  admin.batchRuns.set(RUN, storedRun(RUN, HASH));
  admin.threads.set(`telegram:${CHAT_ID}`, { thread_id: THREAD, last_message_id: null });
  admin.threads.set(`whatsapp:15550001111`, { thread_id: THREAD, last_message_id: null });
  if (opts.seedIntent !== false) {
    admin.batchIntents.set(`${TEST_USER}:prep`, {
      user_id: TEST_USER, intent_id: "prep", thread_id: THREAD, run_id: RUN,
      binding: { version: "career_batch_intent/v1", action: "prepare", run_id: RUN }, created_at: "2026-10-22T10:00:00.000Z",
    });
  }
  const committed: any[] = [];
  const persistence = {
    readBatchRun: async ({ userId, runId }: { userId: string; runId: string }) => {
      const r = admin.batchRuns.get(runId);
      return r && r.userId === userId ? JSON.parse(JSON.stringify(r)) : null;
    },
  };
  let seq = 0;
  const chatAsync = async (body: any) => {
    if (body.career_batch) {
      const req = normalizeCareerBatchRequest(body.career_batch);
      const plan = await planCareerBatchIntent({
        batchRequest: req, message: body.message, userId: body.as_user_id, threadId: body.thread_id,
        turnKey: body.turn_key ?? `tk-${++seq}`, requestHash: "e".repeat(64), ctx: { workerCapabilities: null },
        accountVersion: 1, account: { epoch: 0 }, persistence,
      });
      if (plan.intent) committed.push(plan.intent);
      return { thread_id: body.thread_id, reply: plan.out.reply, ...(plan.out.batch ? { batch: plan.out.batch } : {}) };
    }
    return { thread_id: body.thread_id, reply: "Plain brain answer." };
  };
  // The planner is async, so agent-chat is answered here; every other
  // provider call goes to the channel fixture's fetch double.
  const f = fakeFetchRich({});
  const fn = async (url: any, init?: any) => {
    if (String(url).includes("/functions/v1/agent-chat")) {
      f.calls.push({ url: String(url), init });
      const out = await chatAsync(JSON.parse(init.body));
      return new Response(JSON.stringify(out), { status: 200 });
    }
    return f.fn(url, init);
  };
  const env = envOf({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TELEGRAM_BOT_TOKEN: "fixture-bot-token", TELEGRAM_WEBHOOK_SECRET: SECRET,
    TWILIO_ACCOUNT_SID: "ACfixture", TWILIO_AUTH_TOKEN: "fixture-auth", TWILIO_WHATSAPP_FROM: "whatsapp:+15550009999",
    CHANNEL_TEST_USER_ID: TEST_USER,
    TELEGRAM_ALLOWED_CHAT_IDS: `${CHAT_ID},${OTHER_CHAT}`,
    WHATSAPP_ALLOWED_NUMBERS: "+15550001111",
  });
  const d = { env, fetchFn: fn as any, createAdmin: () => admin, paceMs: 0 } as any;
  return { admin, d, calls: f.calls, committed };
}

let msgId = 100;
function tg(d: any, text: string, chatId = CHAT_ID) {
  const update = { update_id: 9000 + msgId, message: { message_id: ++msgId, date: 1760000000, text, chat: { id: chatId, type: "private" }, from: { id: 777, is_bot: false } } };
  return handleTelegramWebhook(new Request("https://fixture.supabase.co/functions/v1/telegram-inbound", {
    method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify(update),
  }), d);
}
const agentBodies = (calls: any[]) => calls.filter((c) => c.url.includes("/functions/v1/agent-chat")).map((c) => JSON.parse(c.init.body));
const approveBodies = (calls: any[]) => agentBodies(calls).filter((b) => b.career_batch?.action === "approve");
const tgTexts = (calls: any[]) => calls.filter((c) => c.url.includes("api.telegram.org") && c.url.endsWith("/sendMessage")).map((c) => String(JSON.parse(c.init.body).text));

// The card turn: a plain status ask surfaces the card via the F-037
// readback and offers it (numbered list + text-yes footer + buttons).
async function showCard(h: ReturnType<typeof harness>) {
  const res = await tg(h.d, "how is my batch?");
  const body = await res.json();
  assertEq(body.approval_offered, true, "the card was offered: " + JSON.stringify(body));
  return body;
}

Deno.test("text yes: parse — only clear yes / yes-but-not-N / no shapes are card replies", () => {
  assertEq(JSON.stringify(parseTextApproval("yes")), JSON.stringify({ kind: "yes", exclude: [] }));
  assertEq(JSON.stringify(parseTextApproval("Yes!")), JSON.stringify({ kind: "yes", exclude: [] }));
  assertEq(JSON.stringify(parseTextApproval("yes but not 2")), JSON.stringify({ kind: "yes", exclude: [2] }));
  assertEq(JSON.stringify(parseTextApproval("yes except 5, 2 and 7")), JSON.stringify({ kind: "yes", exclude: [2, 5, 7] }));
  assertEq(JSON.stringify(parseTextApproval("Yes, but not #3")), JSON.stringify({ kind: "yes", exclude: [3] }));
  assertEq(JSON.stringify(parseTextApproval("no")), JSON.stringify({ kind: "no" }));
  assertEq(parseTextApproval("yes but not the google one")?.kind, "unclear");
  assertEq(parseTextApproval("yes 2")?.kind, "unclear", "a number without 'not/except' is never an exclusion");
  assertEq(parseTextApproval("yes but not 2, 2")?.kind, "unclear");
  assertEq(parseTextApproval("yes but not 0")?.kind, "unclear");
  assertEq(parseTextApproval("find me data analyst roles"), null);
  assertEq(parseTextApproval("yesterday was great"), null);
});

Deno.test("F-037 + text yes: the 10-application card reaches Telegram and ONE 'yes' approves exactly its hash", async () => {
  const h = harness();
  await showCard(h);
  const texts = tgTexts(h.calls);
  const prompt = texts.find((t) => t.includes(`Batch ${RUN} is waiting on your yes.`)) ?? "";
  assert(prompt.includes("1. TextYes 1 — Software Engineering Intern"), "numbered list shown: " + prompt);
  assert(prompt.includes("10. TextYes 10 — Software Engineering Intern"), "all 10 listed");
  assert(prompt.includes('Text "yes" to approve all 10'), "text-yes footer shown");
  assertEq(h.admin.approvals.size, 1);
  assertEq([...h.admin.approvals.values()][0].card_sha256, HASH, "offer bound to the stored hash");

  const res = await tg(h.d, "yes");
  const body = await res.json();
  assertEq(body.approval, "resolved", JSON.stringify(body));
  assertEq(body.approved, 10);
  assertEq(body.excluded, 0);
  const ap = approveBodies(h.calls);
  assertEq(ap.length, 1, "exactly one structured approve");
  assertEq(ap[0].message, `Approve batch ${RUN}`);
  assertEq(ap[0].career_batch.cardSha256, HASH, "the card's hash, never another");
  assertEq(ap[0].career_batch.runId, RUN);
  assertEq(ap[0].career_batch.exclude, undefined, "a plain yes is byte-identical to the button tap");
  assertEq(h.committed.length, 1, "one approve intent committed (the logged approval the worker claims)");
  assertEq(h.committed[0].card_sha256, HASH);
  assertEq(h.committed[0].run_id, RUN);
  assert(tgTexts(h.calls).some((t) => t.includes("Your yes is recorded")), "the core's answer reaches the person");
  assert([...h.admin.approvals.values()].every((r) => r.consumed_at), "the offer is spent");

  // A second "yes" (retry, double text) is an ordinary turn: no second approval.
  await tg(h.d, "yes");
  assertEq(approveBodies(h.calls).length, 1, "never approves twice");
  assertEq(h.committed.length, 1);
});

Deno.test("'yes but not 2' leaves exactly the card's 2nd application off", async () => {
  const h = harness();
  await showCard(h);
  const body = await (await tg(h.d, "yes but not 2")).json();
  assertEq(body.approval, "resolved", JSON.stringify(body));
  assertEq(body.approved, 9);
  assertEq(body.excluded, 1);
  const ap = approveBodies(h.calls);
  assertEq(ap.length, 1);
  assertEq(JSON.stringify(ap[0].career_batch.exclude), JSON.stringify([keyOf(2)]), "the 2nd posting key, as shown");
  assertEq(ap[0].career_batch.cardSha256, HASH);
  assertEq(JSON.stringify(h.committed[0].exclude_keys), JSON.stringify([keyOf(2)]));
  assert(tgTexts(h.calls).some((t) => t.includes("You left 1 out")), "the reply names the exclusion");
});

Deno.test("'yes but not 11' on a 10-card, or an unclear yes, approves nothing and keeps the offer live", async () => {
  const h = harness();
  await showCard(h);
  for (const text of ["yes but not 11", "yes but not the google one", "yes 2"]) {
    const body = await (await tg(h.d, text)).json();
    assertEq(body.approval, "refused", text);
    assertEq(body.reason, "unclear", text);
  }
  assertEq(approveBodies(h.calls).length, 0, "no approve call");
  assertEq(h.committed.length, 0);
  assert([...h.admin.approvals.values()].some((r) => !r.consumed_at), "the offer still stands for a clear answer");
  const body = await (await tg(h.d, "yes but not 10")).json();
  assertEq(body.approved, 9, "a clear answer still lands on the same card");
});

Deno.test("'no' declines: nothing approved, offer spent", async () => {
  const h = harness();
  await showCard(h);
  const body = await (await tg(h.d, "no")).json();
  assertEq(body.approval, "declined");
  assertEq(approveBodies(h.calls).length, 0);
  assertEq(h.committed.length, 0);
  assert(tgTexts(h.calls).some((t) => t.includes("nothing was approved")));
  await tg(h.d, "yes");
  assertEq(approveBodies(h.calls).length, 0, "a yes after a no approves nothing");
});

Deno.test("a stale card is refused: the stored run moved after the offer -> nothing approved, offer spent", async () => {
  const h = harness();
  await showCard(h);
  // Re-prepared since the card was shown: same run, a different set hash.
  h.admin.batchRuns.set(RUN, storedRun(RUN, "d".repeat(64)));
  const body = await (await tg(h.d, "yes")).json();
  assertEq(body.approval, "refused");
  assertEq(body.reason, "moved");
  assertEq(approveBodies(h.calls).length, 0, "no approve call for a moved card");
  assertEq(h.committed.length, 0);
  assert(tgTexts(h.calls).some((t) => t.includes("That card changed since I showed it")));
  assert([...h.admin.approvals.values()].every((r) => r.consumed_at), "the stale offer can never resolve later");
});

Deno.test("a replaced card: a newer card supersedes the old offer; 'yes' approves only the newest card", async () => {
  const h = harness();
  await showCard(h);
  const oldToken = [...h.admin.approvals.keys()][0];
  // A newer batch for the same thread reaches the card.
  h.admin.batchRuns.set(RUN2, storedRun(RUN2, HASH2, 3));
  h.admin.batchIntents.set(`${TEST_USER}:prep2`, {
    user_id: TEST_USER, intent_id: "prep2", thread_id: THREAD, run_id: RUN2,
    binding: { version: "career_batch_intent/v1", action: "prepare", run_id: RUN2 }, created_at: "2026-10-22T11:00:00.000Z",
  });
  await showCard(h);
  assert(h.admin.approvals.get(oldToken).consumed_at, "the old offer was superseded");
  const body = await (await tg(h.d, "yes")).json();
  assertEq(body.approval, "resolved");
  const ap = approveBodies(h.calls);
  assertEq(ap.length, 1);
  assertEq(ap[0].career_batch.runId, RUN2, "the newest card, never the replaced one");
  assertEq(ap[0].career_batch.cardSha256, HASH2);
  // The old card's button cannot resolve either.
  const cb = { update_id: 99999, callback_query: { id: "cbq-old", from: { id: 777, is_bot: false }, message: { message_id: 55, date: 1760000000, chat: { id: CHAT_ID, type: "private" } }, data: `appr:${oldToken}` } };
  const cbRes = await (await handleTelegramWebhook(new Request("https://fixture.supabase.co/functions/v1/telegram-inbound", {
    method: "POST", headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify(cb),
  }), h.d)).json();
  assertEq(cbRes.ignored, "approval not resolvable");
  assertEq(approveBodies(h.calls).length, 1, "still exactly one approval");
});

Deno.test("a different chat's / user's yes is refused: no offer of theirs, or an offer owned by another user", async () => {
  // (a) Another allowed sender texting "yes" has no live offer of its own.
  {
    const h = harness();
    await showCard(h);
    const body = await (await tg(h.d, "yes", OTHER_CHAT)).json();
    assertEq(body.approval, undefined, "an ordinary turn, not an approval: " + JSON.stringify(body));
    assertEq(approveBodies(h.calls).length, 0);
    assertEq(h.committed.length, 0);
    assert([...h.admin.approvals.values()].some((r) => !r.consumed_at), "the owner's offer is untouched");
  }
  // (b) The sender's live offer row belongs to a different user (a remapped
  // sender): refused, never approved, offer not consumed.
  {
    const h = harness();
    await showCard(h);
    for (const r of h.admin.approvals.values()) r.user_id = OTHER_USER;
    const body = await (await tg(h.d, "yes")).json();
    assertEq(body.approval, "refused");
    assertEq(body.reason, "foreign");
    assertEq(approveBodies(h.calls).length, 0);
    assertEq(h.committed.length, 0);
  }
  // (c) The core refuses a yes for a run the user does not own, even if one
  // reached it: the owner-scoped read finds nothing.
  {
    const h = harness();
    h.admin.batchRuns.set(RUN, storedRun(RUN, HASH, 10, OTHER_USER));
    const res = await (await tg(h.d, "how is my batch?")).json();
    assertEq(res.approval_offered, undefined, "a foreign run is never offered");
    await tg(h.d, "yes");
    assertEq(approveBodies(h.calls).length, 0);
  }
});

Deno.test("no live offer: 'yes' is an ordinary message, byte-identical to today", async () => {
  const h = harness({ seedIntent: false });
  const body = await (await tg(h.d, "yes")).json();
  assertEq(body.approval, undefined);
  const bodies = agentBodies(h.calls);
  assertEq(bodies.length, 1);
  assertEq(bodies[0].message, "yes");
  assert(!("career_batch" in bodies[0]));
});

Deno.test("WhatsApp: 'yes but not 2' over the Twilio adapter approves the same card minus its 2nd application", async () => {
  const h = harness();
  const AUTH = "fixture-auth";
  const HOOK = "https://fixture.supabase.co/functions/v1/whatsapp-inbound";
  async function wa(text: string) {
    const params: Record<string, string> = { From: "whatsapp:+15550001111", To: "whatsapp:+15550009999", Body: text, MessageSid: `SM${++msgId}`, NumMedia: "0" };
    const data = HOOK + Object.keys(params).sort().map((k) => k + params[k]).join("");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(AUTH), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))));
    return handleWhatsappWebhook(new Request(HOOK, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, body: new URLSearchParams(params).toString(),
    }), h.d);
  }
  const card = await (await wa("how is my batch?")).json();
  assertEq(card.approval_offered, true, JSON.stringify(card));
  const forms = h.calls.filter((c) => c.url.includes("api.twilio.com")).map((c) => new URLSearchParams(c.init.body).get("Body") ?? "");
  assert(forms.some((b) => b.includes("2. TextYes 2") && b.includes("Reply with a number:")), "numbered list + choices: " + forms.join(" | "));
  const body = await (await wa("yes but not 2")).json();
  assertEq(body.approval, "resolved", JSON.stringify(body));
  const ap = approveBodies(h.calls);
  assertEq(ap.length, 1);
  assertEq(ap[0].career_batch.cardSha256, HASH);
  assertEq(JSON.stringify(ap[0].career_batch.exclude), JSON.stringify([keyOf(2)]));
  assertEq(h.committed.length, 1);
});
