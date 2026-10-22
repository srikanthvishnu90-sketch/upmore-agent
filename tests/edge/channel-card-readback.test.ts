// F-037 / F-002 guards — the channel card readback
// (supabase/functions/_shared/channel_bridge.ts; design:
// docs/e2e/H1-CARD-DELIVERY-DESIGN.md).
//
// The defect (measured live 2026-10-22): after the worker finishes a
// prepare, a Telegram/WhatsApp user can never see the approval card —
// the bridge sends the structured career_batch request only from the
// approve path, so the planner's status branch (the card's only
// producer) never runs on a text turn. These guards drive the REAL
// composition the handlers run — runChannelTurnRich ->
// detectBatchCard -> offerApproval — with doubles only at the fetch
// (agent-chat wire) and supabase-js boundaries, the channel lane's
// fixture pattern. The agent-chat double obeys the real handler's
// contract: a call WITHOUT career_batch never returns a batch_run;
// a status call answers from the stored run, owner-scoped.
// Run: deno test --no-check -A tests/edge/channel-card-readback.test.ts
import { runChannelTurnRich } from "../../supabase/functions/_shared/channel_bridge.ts";
import { detectBatchCard, offerApproval } from "../../supabase/functions/_shared/channel_present.ts";
import {
  FakeAdminApprovals,
  fakeFetchRich,
  envOf,
  assert,
  assertEq,
  TEST_USER,
  SUPABASE_URL,
  SERVICE_KEY,
} from "./lib/channel_fixture.ts";

const SENDER = "6836694463";
const THREAD = "thread-1";
const RUN = "batch-e2e0001";
const HASH = "a".repeat(64);
const OTHER_USER = "7de0a11a-0000-4000-8000-0000000000f0";
const FOREIGN_RUN = "batch-foreign1";

// The stored run record in career_batch_result_v1's shape (the same
// shape channel_present.readCardHash validates).
function storedRun(userId: string, runId: string, status: string) {
  return {
    version: "career_batch_run/v1",
    runId,
    userId,
    status,
    run: { id: runId, cardSha256: HASH },
    summary: null,
  };
}

function seedIntent(admin: FakeAdminApprovals, over: Record<string, unknown> = {}) {
  const row = {
    user_id: TEST_USER,
    intent_id: "intent-1",
    thread_id: THREAD,
    run_id: RUN,
    binding: { version: "career_batch_intent/v1", action: "prepare", run_id: RUN },
    created_at: "2026-10-22T10:00:00.000Z",
    ...over,
  };
  admin.batchIntents.set(`${row.user_id}:${row.intent_id}`, row);
  return row;
}

// Scripted agent-chat: the plain call answers `plain`; a structured
// status call runs the planner's status-branch behavior against the
// fixture's stored runs (owner-scoped, like career_batch_result_v1).
function makeDeps(admin: FakeAdminApprovals, plain: any) {
  const { fn, calls } = fakeFetchRich({
    chat: (body: any) => {
      const cb = body?.career_batch;
      if (cb && cb.action === "status") {
        const rec = admin.batchRuns.get(cb.runId);
        if (!rec || rec.userId !== body.as_user_id) {
          return { reply: "No batch run is readable under that reference. A batch is only ever readable by its owner, and only once the browser worker has written it." };
        }
        return {
          reply: `Batch ${rec.runId}: status ${rec.status}.`,
          batch: { version: "career_batch_run/v1", id: rec.runId, status: rec.status, kind: "batch_run" },
        };
      }
      return plain;
    },
  });
  const deps = {
    env: envOf({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY }),
    fetchFn: fn,
    createAdmin: () => admin,
    paceMs: 0,
  };
  return { deps, calls };
}

function agentChatBodies(calls: { url: string; init: any }[]) {
  return calls
    .filter((c) => c.url.includes("/functions/v1/agent-chat"))
    .map((c) => JSON.parse(c.init.body));
}

function seedThread(admin: FakeAdminApprovals, threadId = THREAD) {
  admin.threads.set(`telegram:${SENDER}`, { thread_id: threadId, last_message_id: null });
}

function turn(deps: any, text: string, messageId: string) {
  return runChannelTurnRich(deps, {
    channel: "telegram",
    senderKey: SENDER,
    userId: TEST_USER,
    text,
    messageId,
  });
}

Deno.test("F-037 guard 1: a text turn after a completed prepare surfaces the card; the offer binds the stored hash", async () => {
  const admin = new FakeAdminApprovals();
  seedThread(admin);
  seedIntent(admin);
  admin.batchRuns.set(RUN, storedRun(TEST_USER, RUN, "awaiting_approval"));
  const { deps, calls } = makeDeps(admin, { reply: "I didn't catch that. Try naming the job, company, or person." });

  const outcome: any = await turn(deps, "What's the batch status?", "m1");
  assertEq(outcome.kind, "done");
  // The readback replaced the fallback outcome with the planner's
  // status response — the only response shape that can carry the card.
  assertEq(outcome.replyText, `Batch ${RUN}: status awaiting_approval.`);
  const bodies = agentChatBodies(calls);
  assertEq(bodies.length, 2, "plain turn + exactly one readback call");
  assertEq(bodies[0].career_batch, undefined, "the plain turn still carries no structured body");
  assertEq(
    JSON.stringify(bodies[1].career_batch),
    JSON.stringify({ action: "status", version: "career_batch_intent/v1", runId: RUN }),
    "the readback is the structured status request for the remembered run",
  );
  assertEq(bodies[1].message, "What's the batch status?", "the status call carries the user's own words");

  // The handlers' existing offer path, unchanged: detection + binding.
  const card = detectBatchCard(outcome.chat);
  assert(card && card.runId === RUN, "detectBatchCard fires on the readback outcome");
  const offer = await offerApproval(deps as any, {
    channel: "telegram", senderKey: SENDER, userId: TEST_USER, threadId: outcome.threadId, runId: card.runId,
  });
  assert(offer && /^[0-9a-f]{16}$/.test(offer.token), "an offer token is minted");
  const row = admin.approvals.get(offer!.token);
  assert(row, "the offer is stored");
  assertEq(row.run_id, RUN);
  assertEq(row.card_sha256, HASH, "the token is bound to the run's STORED card hash");
});

Deno.test("F-037 guard 2: a stored run at any other status offers nothing — no status call, plain turn stands", async () => {
  for (const status of ["preparing", "completed", "blocked"]) {
    const admin = new FakeAdminApprovals();
    seedThread(admin);
    seedIntent(admin);
    admin.batchRuns.set(RUN, storedRun(TEST_USER, RUN, status));
    const { deps, calls } = makeDeps(admin, { reply: "Plain brain answer." });
    const outcome: any = await turn(deps, "What's the batch status?", "m1");
    assertEq(outcome.kind, "done");
    assertEq(outcome.replyText, "Plain brain answer.", `status ${status}: the plain turn is the outcome`);
    assertEq(detectBatchCard(outcome.chat), null, `status ${status}: no card detected`);
    assertEq(agentChatBodies(calls).length, 1, `status ${status}: the readback never calls the core`);
    assertEq(admin.approvals.size, 0, `status ${status}: no offer stored`);
  }
});

Deno.test("F-037 guard 3: a run owned by another user offers nothing and leaks nothing", async () => {
  // Shape A: the other user's intents/runs live on THEIR thread; this
  // thread has none of its own.
  {
    const admin = new FakeAdminApprovals();
    seedThread(admin);
    seedIntent(admin, {
      user_id: OTHER_USER, intent_id: "intent-foreign", thread_id: "thread-9", run_id: FOREIGN_RUN,
      binding: { version: "career_batch_intent/v1", action: "prepare", run_id: FOREIGN_RUN },
    });
    admin.batchRuns.set(FOREIGN_RUN, storedRun(OTHER_USER, FOREIGN_RUN, "awaiting_approval"));
    const { deps, calls } = makeDeps(admin, { reply: "Plain brain answer." });
    const outcome: any = await turn(deps, "What's the batch status?", "m1");
    assertEq(outcome.replyText, "Plain brain answer.");
    assertEq(agentChatBodies(calls).length, 1, "no status call for a foreign run");
    assert(!JSON.stringify(outcome).includes(FOREIGN_RUN), "the foreign run id never reaches the outcome");
    assertEq(admin.approvals.size, 0);
  }
  // Shape B: an intent on THIS thread names a run whose stored record
  // belongs to another user — the owner-scoped read returns nothing.
  {
    const admin = new FakeAdminApprovals();
    seedThread(admin);
    seedIntent(admin, { run_id: FOREIGN_RUN, binding: { version: "career_batch_intent/v1", action: "prepare", run_id: FOREIGN_RUN } });
    admin.batchRuns.set(FOREIGN_RUN, storedRun(OTHER_USER, FOREIGN_RUN, "awaiting_approval"));
    const { deps, calls } = makeDeps(admin, { reply: "Plain brain answer." });
    const outcome: any = await turn(deps, "What's the batch status?", "m1");
    assertEq(outcome.replyText, "Plain brain answer.");
    assertEq(agentChatBodies(calls).length, 1, "the owner-scoped read stops the readback before any status call");
    assert(!JSON.stringify(outcome).includes(FOREIGN_RUN), "nothing about the foreign run leaks");
    assertEq(detectBatchCard(outcome.chat), null);
    assertEq(admin.approvals.size, 0);
  }
});

Deno.test("F-037 guard 4: no pending run remembered -> the turn is a plain turn, byte-identical to today", async () => {
  const admin = new FakeAdminApprovals();
  seedThread(admin);
  const plainChat = { reply: "Found 3 roles for you.", thread_id: THREAD };
  const { deps, calls } = makeDeps(admin, plainChat);
  const outcome: any = await turn(deps, "Find me data analyst roles", "m1");
  assertEq(outcome.kind, "done");
  assertEq(outcome.replyText, "Found 3 roles for you.");
  assertEq(JSON.stringify(outcome.chat), JSON.stringify(plainChat), "the chat response passes through untouched");
  const bodies = agentChatBodies(calls);
  assertEq(bodies.length, 1, "exactly one agent-chat call, as today");
  assert(!("career_batch" in bodies[0]), "the single call carries no career_batch field, as today");
});

Deno.test("F-037 guard 5: the ask turn itself is never hijacked by its own just-committed intent", async () => {
  const admin = new FakeAdminApprovals();
  seedThread(admin);
  // The core commits the prepare intent WITH the ask response; the
  // worker has written no run record yet.
  seedIntent(admin);
  const askChat = {
    reply: "I've handed this batch to the browser worker to prepare.",
    batch: { version: "career_batch_intent/v1", id: RUN, status: "queued", kind: "pending_batch_intent" },
  };
  const { deps, calls } = makeDeps(admin, askChat);
  const outcome: any = await turn(deps, "Apply to 3 data analyst roles for me", "m1");
  assertEq(outcome.kind, "done");
  assertEq(outcome.replyText, askChat.reply, "the ask response is the outcome, unchanged");
  assertEq((outcome.chat as any).batch.kind, "pending_batch_intent");
  assertEq(detectBatchCard(outcome.chat), null, "a queued intent is not a card");
  assertEq(agentChatBodies(calls).length, 1, "no readback call on the ask turn");
  assertEq(admin.approvals.size, 0);
});
