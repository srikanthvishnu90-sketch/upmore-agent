// @ts-nocheck
// H7 guards — chat-loop closure + receipts (lane muse/2026-10-22-e2e-h7;
// design + root cause: docs/e2e/H7-LOOP-CLOSURE-ROOT-CAUSE.md).
//
//   deno test --no-check -A tests/edge/channel-loop-receipt.test.ts
//
// The loop: card offered (H1) -> tap approves (H2 predicates) -> the
// cloud row walks queued -> driving -> submitted_unconfirmed ->
// confirmed (H3/H6). This suite proves the chat surface closes the
// loop back to the user, driving the REAL composition the handlers
// run (runChannelTurnRich -> presentReply / offerApproval /
// takeApproval -> runChannelApproval) with doubles only at the fetch
// (agent-chat wire) and supabase-js boundaries:
//   (a) a confirmed row yields a receipt composed ONLY from the row's
//       own recorded evidence (company, job id, the employer's
//       confirmation number, payload hash, confirmed timestamp);
//   (b) a row that is only submitted_unconfirmed gets NO receipt —
//       page evidence alone never produces one;
//   (c) a status turn at EVERY loop stage answers with the recorded
//       state, never the generic fallback;
//   (d) a foreign user's rows leak nothing into this user's chat;
//   (e) the tap path entered from the chat-offered token enqueues
//       exactly once — a double tap is still one binding (the real
//       planCareerBatchIntent runs behind the wire double, exactly as
//       handler-career.ts routes it).
// Fail-first: on the base (f0f900f2) the loop readback and the
// byte-bound receipt do not exist, so (a)-(d) fail while the
// pre-existing tap discipline in (e) already holds.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import * as bridge from "../../supabase/functions/_shared/channel_bridge.ts";
import * as receipts from "../../supabase/functions/_shared/career_apply_receipts.ts";
import {
  detectBatchCard,
  offerApproval,
  presentReply,
  takeApproval,
} from "../../supabase/functions/_shared/channel_present.ts";
import { planCareerBatchIntent } from "../../supabase/functions/_shared/career_task_bridge.js";
import {
  FakeAdminApprovals,
  fakeFetchRich,
  envOf,
  TEST_USER,
  SUPABASE_URL,
  SERVICE_KEY,
} from "./lib/channel_fixture.ts";

const SENDER = "6836694463";
const THREAD = "thread-1";
const RUN = "batch-h7-0001";
const HASH = "a".repeat(64);
const OTHER_USER = "11111111-2222-4333-8444-555555555555";
const FALLBACK = "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.";
const CONF_NO = "MOCK-AB12CD34";
const PAYLOAD_HASH = "b".repeat(64);
const CONFIRMED_AT = "2026-10-22T15:04:05.000Z";

function storedRun(status: string) {
  return {
    version: "career_batch_run/v1",
    runId: RUN,
    userId: TEST_USER,
    status,
    run: { id: RUN, cardSha256: HASH },
    summary: null,
  };
}

function seedIntent(admin: FakeAdminApprovals) {
  admin.batchIntents.set(`${TEST_USER}:intent-1`, {
    user_id: TEST_USER,
    intent_id: "intent-1",
    thread_id: THREAD,
    run_id: RUN,
    binding: { version: "career_batch_intent/v1", action: "prepare", run_id: RUN },
    created_at: "2026-10-22T10:00:00.000Z",
  });
}

function loopRow(over: Record<string, unknown> = {}) {
  return {
    id: "apply-row-h7-1",
    user_id: TEST_USER,
    job_id: "lever:mockco:1",
    company: "MockCo",
    url: "https://jobs.lever.co/mockco/1",
    state: "queued",
    reason: null,
    confirmation_id: null,
    payload_hash: PAYLOAD_HASH,
    email_confirmed_at: null,
    confirmation_mail_hash: null,
    evidence: {},
    source: "cloud",
    created_at: "2026-10-22T10:05:00.000Z",
    updated_at: "2026-10-22T10:05:00.000Z",
    ...over,
  };
}

function confirmedRow() {
  return loopRow({
    state: "confirmed",
    confirmation_id: CONF_NO,
    email_confirmed_at: CONFIRMED_AT,
    confirmation_mail_hash: "c".repeat(64),
    evidence: { page_confirmation: true, confirmation_id: CONF_NO },
    updated_at: CONFIRMED_AT,
  });
}

function makeDeps(admin: FakeAdminApprovals, chat: (body: any) => any) {
  const { fn, calls } = fakeFetchRich({ chat });
  const deps = {
    env: envOf({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY }),
    fetchFn: fn,
    createAdmin: () => admin,
    paceMs: 0,
  };
  return { deps, calls };
}

// A loop world: the thread remembers the batch's prepare intent, the
// stored run is past its card, and the apply row sits at `row` (or
// none). The plain core answers every turn with the generic fallback —
// the measured live answer to a status ask the readback did not cover.
function loopWorld(row: any) {
  const admin = new FakeAdminApprovals();
  admin.threads.set(`telegram:${SENDER}`, { thread_id: THREAD, last_message_id: null });
  seedIntent(admin);
  admin.batchRuns.set(RUN, storedRun("approved"));
  if (row) admin.applyJobs.set(row.id, row);
  const { deps } = makeDeps(admin, () => ({ reply: FALLBACK }));
  return { admin, deps };
}

function statusTurn(deps: any, messageId: string) {
  return bridge.runChannelTurnRich(deps, {
    channel: "telegram", senderKey: SENDER, userId: TEST_USER,
    text: "What's the batch status?", messageId,
  });
}

Deno.test("confirmedReceiptText: null unless the row is confirmed by the employer's email", () => {
  assertEquals(typeof receipts.confirmedReceiptText, "function");
  assertEquals(receipts.confirmedReceiptText(loopRow({ state: "queued" })), null);
  assertEquals(receipts.confirmedReceiptText(loopRow({ state: "driving" })), null);
  assertEquals(receipts.confirmedReceiptText(loopRow({ state: "submitted_unconfirmed", evidence: { page_confirmation: true } })), null);
  // Confirmed on a page only (no employer-email stamp): still no receipt.
  assertEquals(receipts.confirmedReceiptText(loopRow({ state: "confirmed", confirmation_id: CONF_NO })), null);
});

Deno.test("confirmedReceiptText: every rendered field traces to the confirmed row", () => {
  const row = confirmedRow();
  const text = receipts.confirmedReceiptText(row);
  assert(typeof text === "string" && text.length > 0);
  for (const field of [row.company, row.job_id, CONF_NO, PAYLOAD_HASH, CONFIRMED_AT, row.url]) {
    assertStringIncludes(text, field);
  }
  // Mutating any single recorded field changes the receipt, and the
  // new value is what renders — the text is bound to the row.
  for (const [key, value] of Object.entries({
    company: "OtherCo", job_id: "lever:otherco:9", confirmation_id: "MOCK-ZZ999999",
    payload_hash: "d".repeat(64), email_confirmed_at: "2026-10-23T01:02:03.000Z",
  })) {
    const mutated = receipts.confirmedReceiptText({ ...row, [key]: value });
    assert(mutated !== text, `receipt must change when ${key} changes`);
    assertStringIncludes(mutated, String(value));
  }
});

Deno.test("loop: a confirmed row answers a status turn with its receipt, rendered through presentReply", async () => {
  const row = confirmedRow();
  const { deps } = loopWorld(row);
  const outcome: any = await statusTurn(deps, "m9");
  assertEquals(outcome.kind, "done");
  assertEquals(outcome.replyText, receipts.confirmedReceiptText(row));
  const rendered = presentReply("telegram", outcome.replyText, 4096).join("\n");
  for (const field of [row.company, row.job_id, CONF_NO, PAYLOAD_HASH, CONFIRMED_AT]) {
    assertStringIncludes(rendered, field);
  }
});

Deno.test("loop: submitted_unconfirmed gets NO receipt — page evidence is not confirmation", async () => {
  const row = loopRow({
    state: "submitted_unconfirmed",
    evidence: { page_confirmation: true, confirmation_id: "PAGE-ONLY-1" },
  });
  const { deps } = loopWorld(row);
  const outcome: any = await statusTurn(deps, "m9");
  assertEquals(outcome.kind, "done");
  assert(outcome.replyText !== FALLBACK);
  assertStringIncludes(outcome.replyText, "submitted_unconfirmed");
  assert(!outcome.replyText.includes("Receipt"), "no receipt before the employer's email");
  assert(!outcome.replyText.includes(PAYLOAD_HASH), "no payload hash before confirmation");
  assert(!outcome.replyText.includes("PAGE-ONLY-1"), "a page confirmation number is not the employer's confirmation");
  assertStringIncludes(outcome.replyText, "confirmation email is the proof");
});

Deno.test("loop: status turns at queued and driving answer with the recorded state", async () => {
  for (const state of ["queued", "driving"]) {
    const row = loopRow({ state });
    const { deps } = loopWorld(row);
    const outcome: any = await statusTurn(deps, "m9");
    assertEquals(outcome.kind, "done");
    assertEquals(outcome.replyText, receipts.applyLoopText(row));
    assertStringIncludes(outcome.replyText, state);
    assertStringIncludes(outcome.replyText, row.company);
    assertStringIncludes(outcome.replyText, row.job_id);
    assert(outcome.replyText !== FALLBACK);
  }
});

Deno.test("loop: a foreign user's rows leak nothing into this user's chat", async () => {
  const foreign = { ...confirmedRow(), id: "apply-row-foreign", user_id: OTHER_USER, company: "ForeignCo", confirmation_id: "FOREIGN-1" };
  const { admin, deps } = loopWorld(foreign);
  const outcome: any = await statusTurn(deps, "m9");
  assertEquals(outcome.replyText, FALLBACK);
  assert(!JSON.stringify(outcome).includes("ForeignCo"));
  assert(!JSON.stringify(outcome).includes("FOREIGN-1"));
  // The read itself is owner-scoped.
  assertEquals(await bridge.readApplyLoopRow(admin, { userId: TEST_USER }), null);
  const own = await bridge.readApplyLoopRow(admin, { userId: OTHER_USER });
  assertEquals(own?.id, "apply-row-foreign");
});

Deno.test("loop: no remembered batch run on the thread — a plain turn is never hijacked", async () => {
  const admin = new FakeAdminApprovals();
  admin.threads.set(`telegram:${SENDER}`, { thread_id: THREAD, last_message_id: null });
  admin.applyJobs.set("apply-row-h7-1", confirmedRow());
  const { deps } = makeDeps(admin, () => ({ reply: FALLBACK }));
  const outcome: any = await statusTurn(deps, "m3");
  assertEquals(outcome.replyText, FALLBACK);
});

Deno.test("tap path: the chat-offered token approves exactly once; a double tap is still one binding", async () => {
  const admin = new FakeAdminApprovals();
  admin.threads.set(`telegram:${SENDER}`, { thread_id: THREAD, last_message_id: null });
  seedIntent(admin);
  admin.batchRuns.set(RUN, storedRun("awaiting_approval"));
  const committed: any[] = [];
  // A local wire double (fakeFetchRich does not await an async chat
  // script, and the planner is async): a structured body goes to the
  // REAL planner, exactly as handler-career.ts routes it; an approved
  // intent is committed transactionally, deduped by intent id.
  const fetchFn = async (_url: any, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    const cb = body?.career_batch;
    if (cb) {
      const plan = await planCareerBatchIntent({
        batchRequest: cb, message: body.message, userId: body.as_user_id,
        threadId: body.thread_id, turnKey: body.turn_key ?? "tap", requestHash: "h7",
        ctx: { workerCapabilities: [] }, accountVersion: 1, account: { epoch: 1 },
        persistence: {
          readBatchRun: async ({ userId, runId }: any) => {
            const rec = admin.batchRuns.get(runId);
            return rec && rec.userId === userId ? { runId: rec.runId, status: rec.status, run: rec.run } : null;
          },
        },
      });
      if (plan.intent && !committed.some((c) => c.intent_id === plan.intent.intent_id)) {
        committed.push(plan.intent);
      }
      return new Response(JSON.stringify({ reply: plan.out.reply, batch: plan.out.batch, thread_id: body.thread_id }), { status: 200 });
    }
    return new Response(JSON.stringify({ reply: FALLBACK, thread_id: body.thread_id }), { status: 200 });
  };
  const deps = {
    env: envOf({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY }),
    fetchFn: fetchFn as any,
    createAdmin: () => admin,
    paceMs: 0,
  };

  // The H1 card surfaces on this thread and the handler offers it.
  const outcome: any = await statusTurn(deps, "m31");
  const card = detectBatchCard(outcome.chat);
  assert(card && card.runId === RUN, "the card must surface before any tap");
  const offer = await offerApproval(deps as any, {
    channel: "telegram", senderKey: SENDER, userId: TEST_USER, threadId: outcome.threadId, runId: card.runId,
  });
  assert(offer && /^[0-9a-f]{16}$/.test(offer.token), "an offer token is minted");
  assertEquals(admin.approvals.get(offer!.token)?.card_sha256, HASH, "the token binds the stored card hash");

  // First tap: token consumed, approval call runs, exactly one binding.
  const taken = await takeApproval(deps as any, { channel: "telegram", senderKey: SENDER, token: offer!.token });
  assert(taken.ok, "the first tap consumes the token");
  if (!taken.ok) return;
  const approved: any = await bridge.runChannelApproval(deps, {
    userId: TEST_USER, threadId: taken.row.thread_id, runId: taken.row.run_id,
    cardSha256: taken.row.card_sha256, eventId: "evt-h7-1", turnKey: "tap-1",
  });
  assertEquals(approved.chat?.batch?.kind, "pending_batch_intent");
  assertEquals(approved.chat?.batch?.status, "queued");
  assertEquals(committed.filter((c) => c.action === "approve" && c.run_id === RUN).length, 1);

  // Double tap on the same button: the token is spent, nothing re-runs.
  const again = await takeApproval(deps as any, { channel: "telegram", senderKey: SENDER, token: offer!.token });
  assertEquals(again.ok, false);
  if (!again.ok) assertEquals(again.reason, "spent");
  assertEquals(committed.filter((c) => c.action === "approve" && c.run_id === RUN).length, 1);

  // Even a replayed approval call with the same turn key derives the
  // same intent id — the commit stays exactly one binding.
  await bridge.runChannelApproval(deps, {
    userId: TEST_USER, threadId: taken.row.thread_id, runId: taken.row.run_id,
    cardSha256: taken.row.card_sha256, eventId: "evt-h7-1", turnKey: "tap-1",
  });
  assertEquals(committed.filter((c) => c.action === "approve" && c.run_id === RUN).length, 1);
});
