"use strict";
/* BATCH APPROVAL BINDING (coordinator add, 2026-10-24): (A) not-ready
   yes, (B) ready payload binding + invalidation, (C) delegate request
   shape. Synthetic fixtures only — the (B) boards are module 149's own
   sandbox boards (the loop suite's doubles; no real portal exists in
   this file), CAREER_AGENT_SUBMIT is never touched, and approval is
   only ever the structured ctx.batchApproval card-tap payload.
   Check: node --test tests/career-batch-approval-binding-20261024.test.cjs
*/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const NOW = Date.parse("2026-10-24T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));

const MASTER = {
  basics: { name: "Alex Testcase", location: "Chicago, IL" },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
    { kind: "skill", name: "SQL", text: "Skill: SQL", fact_id: "F-013", evidence: ["resume lists SQL"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago"], starredCompanies: [] },
};
const PORTAL_PROFILE = {
  name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 000 555 0100", location: "Chicago, IL",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
  },
};
const ATTEST = { certify_true: { value: true, explicit: true } };

function hostWith(extraDeps) {
  return CareerHost.createCareerHost(Object.assign({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  }, extraDeps || {}));
}

// ---------- (A) the not-ready batch: a conversational yes -------------
test("(A) after 'apply to the top 3' on a NOT-READY batch, 'yes go ahead and submit them' submits nothing and explains blocked + next step — never the generic fallback", () => {
  const seam = hostWith();
  const U = "user-bind-a";
  const POSTINGS = JSON.parse(require("node:fs").readFileSync(path.join(root, "evals/career/conversations.json"), "utf8")).postings;
  const mk = (snap) => seam.createTurnCtx({ userId: U, threadId: "t-1", now: NOW, accountPersistence: true, snapshot: snap || null, account: {}, watchState: {}, postings: POSTINGS, profile: MASTER });
  let ctx = mk(null);
  let out = seam.runTurn("find investment banking roles in chicago", ctx);
  assert.equal(out.intent, "career_discovery", out.reply);
  ctx = mk(seam.extractSnapshot(ctx));
  out = seam.runTurn("apply to the top 3 for me", ctx);
  assert.equal(out.intent, "career_batch_apply", out.reply);
  assert.match(out.reply, /0\/1 applications ready/, out.reply); // NOT READY: every selected application stopped (BOARD_NOT_WIRED)
  const yesCtx = mk(seam.extractSnapshot(ctx));
  const yes = seam.runTurn("yes go ahead and submit them", yesCtx);
  assert.equal(yes.intent, "career_batch_apply", `the yes must be claimed by the batch frame, got ${yes.intent}: ${yes.reply}`);
  assert.equal(yes.result.sends, 0);
  assert.match(yes.reply, /nothing was submitted/i, yes.reply);
  assert.match(yes.reply, /not ready/i, yes.reply);
  assert.match(yes.reply, /next step/i, yes.reply);
  const after = yesCtx.batchApplyState;
  assert.ok(after && after.status !== "approved" && !(after.approvals && Object.keys(after.approvals).length), "no approval may be minted by a chat yes");
});

// ---------- (B) the ready payload: binding + invalidation -------------
function boardFor(p) {
  return Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: p.atsFamily });
}
const MARKET3 = [1, 2, 3].map((n) => ({
  id: `JOB-B-${n}`, job_id: `JOB-B-${n}`, canonicalKey: `greenhouse:testco${n}:software-engineering-intern`,
  company: `TestCo ${n}`, role: "Software Engineering Intern", title: "Software Engineering Intern",
  url: `https://boards.greenhouse.io/testco${n}/jobs/${n}`, status: "open", atsFamily: "greenhouse",
  location: "Chicago, IL", posted_at: "2026-10-10",
  jd_text: "Software engineering intern role. JavaScript, testing, code review, agile team.",
}));
function prepareReadyRun(U) {
  const seam = hostWith();
  const log = { records: [] };
  const ctx = seam.createTurnCtx({ userId: U, threadId: "t-1", now: NOW, snapshot: null, profile: MASTER, postings: MARKET3 });
  ctx.portalProfile = PORTAL_PROFILE;
  ctx.batchDeps = { log, boardFor, attestations: ATTEST };
  const out = seam.runTurn("apply to 3 software engineering intern roles", ctx);
  assert.equal(out.resultStatus, "awaiting_approval", out.reply);
  return { seam, log, snap: seam.extractSnapshot(ctx), runState: clone(ctx.batchApplyState) };
}
function approvalTurn(U, seam, snap, extra) {
  const ctx = seam.createTurnCtx({ userId: U, threadId: "t-2", now: NOW + 60000, snapshot: snap, profile: MASTER, postings: [] });
  ctx.portalProfile = PORTAL_PROFILE;
  ctx.batchDeps = { log: (extra && extra.log) || { records: [] }, boardFor, attestations: ATTEST };
  return ctx;
}

test("(B1) READY + structured approval in ctx: the yes binds to the presented card — approvals minted against its hash, submissions only at the fixture boards", () => {
  const U = "user-bind-b1";
  const { seam, log, snap, runState } = prepareReadyRun(U);
  const ctx = approvalTurn(U, seam, snap, { log });
  ctx.batchApproval = { approvedByUser: true };
  const out = seam.runTurn("yes", ctx);
  assert.equal(out.intent, "career_batch_apply", out.reply);
  const after = ctx.batchApplyState;
  assert.equal(after.summary.submitted, 3, out.reply);
  assert.ok(after.approvalRef, "an approval ref is minted");
  assert.equal(after.approvalRef, `batch:${runState.id}:${runState.cardSha256}`, "the ref binds THIS run and THIS card set hash — the presented payload, nothing else");
  assert.equal(log.records.filter((r) => r.status === "submitted").length, 3, "submissions happen only against the sandbox fixture boards");
});

test("(B2) MUTATION — an answer/payload changes after presentation: the same structured yes no longer binds (APPROVAL_SET_CHANGED), nothing submits", () => {
  const U = "user-bind-b2";
  const { seam, log, snap } = prepareReadyRun(U);
  const tampered = clone(snap);
  const st = tampered.stores.batchApplyState;
  const key = st.selected.find((k) => st.apps[k] && st.apps[k].stage === "doorstep");
  st.apps[key].payloadSha256 = "f".repeat(64); // an answer changed after the card was shown
  const ctx = approvalTurn(U, seam, tampered, { log });
  ctx.batchApproval = { approvedByUser: true };
  const out = seam.runTurn("yes", ctx);
  assert.equal(out.intent, "career_batch_apply", out.reply);
  assert.equal(out.resultStatus, "blocked", out.reply);
  assert.equal(out.result.code, "APPROVAL_SET_CHANGED", out.reply);
  assert.match(out.reply, /did not submit anything/i, out.reply);
  assert.equal(ctx.batchApplyState.status, "awaiting_approval", "no approval minted against a changed set");
  assert.equal(log.records.filter((r) => r.status === "submitted").length, 0);
});

test("(B3) MUTATION — a role leaves the presented set after presentation: the yes no longer binds", () => {
  const U = "user-bind-b3";
  const { seam, log, snap } = prepareReadyRun(U);
  const tampered = clone(snap);
  const st = tampered.stores.batchApplyState;
  const key = st.selected.find((k) => st.apps[k] && st.apps[k].stage === "doorstep");
  delete st.apps[key]; // a role changed/removed after the card was shown
  const ctx = approvalTurn(U, seam, tampered, { log });
  ctx.batchApproval = { approvedByUser: true };
  const out = seam.runTurn("yes", ctx);
  assert.equal(out.resultStatus, "blocked", out.reply);
  assert.equal(out.result.code, "APPROVAL_SET_CHANGED", out.reply);
  assert.equal(log.records.filter((r) => r.status === "submitted").length, 0);
});

test("(B4) NO BLANKET YES: a READY batch + a conversational yes WITHOUT the structured approval approves nothing and says where approval lives", () => {
  const U = "user-bind-b4";
  const { seam, log, snap } = prepareReadyRun(U);
  const ctx = approvalTurn(U, seam, snap, { log });
  const out = seam.runTurn("yes go ahead and submit them", ctx);
  assert.equal(out.intent, "career_batch_apply", `the yes must be answered by the batch frame, got ${out.intent}: ${out.reply}`);
  assert.equal(out.result.sends, 0);
  assert.match(out.reply, /card/i, out.reply);
  assert.equal(ctx.batchApplyState.status, "awaiting_approval", "the run still waits — a chat yes is not an approval");
  assert.ok(!(ctx.batchApplyState.approvals && Object.keys(ctx.batchApplyState.approvals).length), "no approvals minted");
  assert.equal(log.records.filter((r) => r.status === "submitted").length, 0);
});

// ---------- (C) the delegate request the seam emits -------------------
test("(C) delegate mode: the seam emits only a prepare REQUEST — skeleton run + {phase, runId} marker; nothing is committed or executed at this layer", () => {
  const seam = hostWith({ delegateBatch: true });
  const U = "user-bind-c";
  const ctx = seam.createTurnCtx({ userId: U, threadId: "t-1", now: NOW, snapshot: null, profile: MASTER, postings: MARKET3 });
  ctx.portalProfile = PORTAL_PROFILE;
  const out = seam.runTurn("apply to 3 software engineering intern roles", ctx);
  assert.equal(out.intent, "career_batch_apply", out.reply);
  assert.equal(out.resultStatus, "queued", out.reply);
  assert.deepEqual(Object.keys((out.result || {}).batchDelegate || {}).sort(), ["phase", "runId"], "the request marker carries exactly phase + runId");
  assert.equal(out.result.batchDelegate.phase, "prepare");
  assert.equal(out.result.batchDelegate.runId, ctx.batchApplyState.id);
  assert.equal(ctx.batchApplyState.status, "queued_prepare", "the skeleton is never mistaken for a prepared card");
  assert.equal(out.result.sends, 0);
  assert.equal(out.result.batchIntent, undefined, "no intent is committed at the router layer — committing is the handler's step (career_task_bridge.planCareerBatchPrepare), gated on CAREER_BATCH_EXECUTOR in handler-career.ts");
  assert.equal((ctx.batchApplyState.summary || {}).submitted || 0, 0, "nothing executes the request in this composition");
  assert.equal(Object.keys(ctx.batchApplyState.apps || {}).length, 0, "the skeleton carries no prepared applications — preparation is exactly what the request asks the worker to do");
});
