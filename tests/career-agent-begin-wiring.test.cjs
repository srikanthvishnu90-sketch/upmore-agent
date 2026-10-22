// CHAT-SIDE BEGIN-CALLER (176) — the wiring guard (chunk 40%).
//
// Proves the seam, default OFF:
// 1. Host composition: createCareerHost WITHOUT an agentBegin dep
//    attaches no batchDeps.agentBegin (the approval turn is the old
//    in-turn executeRun path); WITH `agentBegin: true` the dep rides
//    ctx.batchDeps — runtime only: extractSnapshot never persists it
//    (batchDeps is not a STATE_KEYS entry), so no snapshot can carry
//    or resurrect the mode.
// 2. Router approval turn: with the mode on, a standing
//    awaiting_approval batch + a structured approval mints via 155's
//    approveRun and returns batchDelegate {phase:"begin", approvalRef
//    = the deterministic mint} INSTEAD of executing in-turn; with the
//    mode off the same turn runs the old executeRun path (here:
//    BOARD_NOT_WIRED stop, completed_with_stops, no delegate).
//
// Check: node --test tests/career-agent-begin-wiring.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const Router = D("142-career-router.js");

const USER = "begin-wiring-user";
const SHA = "d".repeat(64);
const CARDSHA = crypto.createHash("sha256").update(`k1:${SHA}`).digest("hex");

const DEPS = {
  CareerAccess: D("120-career-access.js"),
  CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"),
  CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"),
  CareerContainment: D("143-career-containment.js"),
};

test("host: agentBegin dep rides batchDeps runtime-only; absent by default; never snapshotted", () => {
  const plain = CareerHost.createCareerHost(DEPS);
  const ctxPlain = plain.createTurnCtx({ userId: USER, threadId: "t", now: Date.now(), snapshot: null });
  assert.equal((ctxPlain.batchDeps || {}).agentBegin, undefined);

  const wired = CareerHost.createCareerHost({ ...DEPS, agentBegin: true });
  const ctx = wired.createTurnCtx({ userId: USER, threadId: "t", now: Date.now(), snapshot: null });
  assert.equal(ctx.batchDeps.agentBegin, true);
  const snap = wired.extractSnapshot(ctx);
  assert.equal(JSON.stringify(snap).includes("agentBegin"), false);
});

function mkRun() {
  return {
    id: "batch-wiringtest", userId: USER, familyText: "test roles", requested: 1, status: "awaiting_approval",
    createdAt: Date.now(), found: 1, duplicatesRemoved: 0, screenedOut: [], eligible: 1, selected: ["k1"], deferred: [],
    postings: { k1: { company: "Test Co", title: "Intern", url: "https://jobs.example.test/1" } },
    apps: { k1: { postingKey: "k1", company: "Test Co", role: "Intern", url: "https://jobs.example.test/1", stage: "doorstep", stop: null, payloadSha256: SHA, confirmationId: null, tailored: null } },
    approvals: {}, approvalRef: null, card: null, cardSha256: CARDSHA, events: [], summary: null,
  };
}
function mkCtx(agentBegin) {
  return {
    userId: USER, threadId: "t1", now: Date.now(), profile: { basics: { name: "Test" } },
    batchApplyState: mkRun(), batchApproval: { approvedByUser: true },
    batchDeps: agentBegin ? { agentBegin: true } : {},
  };
}

test("router: mode OFF — the approval turn executes in-turn as before (no delegate)", () => {
  const out = Router.handleChat("yes, apply to them", mkCtx(false));
  assert.equal(out.intent, "career_batch_apply");
  assert.equal(out.batchDelegate, undefined);
  assert.equal(out.resultStatus, "completed_with_stops"); // BOARD_NOT_WIRED inside executeRun — the old path, named
});

test("router: mode ON — the approval turn mints and delegates the begin, executing nothing", () => {
  const ctx = mkCtx(true);
  const out = Router.handleChat("yes, apply to them", ctx);
  assert.equal(out.intent, "career_batch_apply");
  assert.equal(out.resultStatus, "approved");
  assert.deepEqual(out.batchDelegate, { phase: "begin", runId: "batch-wiringtest", approvalRef: `batch:batch-wiringtest:${CARDSHA}` });
  assert.equal(ctx.batchApplyState.status, "approved");
  assert.equal(ctx.batchApplyState.apps.k1.stage, "doorstep"); // untouched: no drive ran
});
