"use strict";
/* APPROVAL FAIL-CLOSED (coordinator queue, 2026-10-24): a card that
   does not CARRY the binding fields — or an approval that does not
   SUPPLY them — is NOT BINDABLE. Absent/unparseable expiry or digest
   must refuse, never skip the check. Legacy runs (prepared before
   cardExpiresAt / profileSha256 existed) are the standing example:
   assume they exist. Every non-bind reply carries the shape:
   "re-review needed: I will re-prepare and show a fresh card".
   Binding semantics only; sandbox fixture boards; nothing submits.
   Check: node --test tests/career-batch-approval-failclosed-20261024.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));

const NOW = Date.parse("2026-10-24T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const SHAPE = "re-review needed: I will re-prepare and show a fresh card";

const MASTER = {
  basics: { name: "Alex Testcase", location: "Chicago, IL" },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
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
function boardFor(p) { return Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: p.atsFamily }); }
const MARKET3 = [1, 2, 3].map((n) => ({
  id: `JOB-B-${n}`, job_id: `JOB-B-${n}`, canonicalKey: `greenhouse:testco${n}:software-engineering-intern`,
  company: `TestCo ${n}`, role: "Software Engineering Intern", title: "Software Engineering Intern",
  url: `https://boards.greenhouse.io/testco${n}/jobs/${n}`, status: "open", atsFamily: "greenhouse",
  location: "Chicago, IL", posted_at: "2026-10-10",
  jd_text: "Software engineering intern role. JavaScript, testing, code review, agile team.",
}));

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { threads: new Map() };
  const log = { records: [] };
  let n = 0;
  const say = (userId, text, extra) => {
    const ex = extra || {};
    n += 1;
    const threadId = `t-${userId}`;
    const snap = ex.snapshot !== undefined ? ex.snapshot : (store.threads.get(threadId) || null);
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + (ex.nowOffset != null ? ex.nowOffset : n * 60000), accountPersistence: true, snapshot: snap, account: {}, watchState: {}, postings: ex.postings || [], profile: MASTER });
    ctx.portalProfile = PORTAL_PROFILE;
    ctx.batchDeps = { log, boardFor, attestations: ATTEST };
    if (ex.batchApproval) ctx.batchApproval = ex.batchApproval;
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    return { out, ctx };
  };
  const snapshotOf = (userId) => store.threads.get(`t-${userId}`);
  const submitted = () => log.records.filter((r) => r.status === "submitted").length;
  return { say, snapshotOf, submitted };
}
function prepare(w, U) {
  const { out } = w.say(U, "apply to 3 software engineering intern roles", { postings: MARKET3, nowOffset: 0 });
  assert.equal(out.resultStatus, "awaiting_approval", out.reply);
}
function legacySnapshot(w, U) {
  const snap = clone(w.snapshotOf(U));
  const st = snap.stores.batchApplyState;
  assert.ok(st && st.status === "awaiting_approval", "setup: a ready run stands");
  delete st.cardExpiresAt;   // a run prepared before the binding fields existed
  delete st.profileSha256;
  return snap;
}

test("(i-LEGACY conversational) a legacy run + a chat yes: NOT bindable — the re-review reply, never 'approve it there'", () => {
  const w = makeWorld(); const U = "user-fc-leg-chat";
  prepare(w, U);
  const { out, ctx } = w.say(U, "yes go ahead and submit them", { snapshot: legacySnapshot(w, U), nowOffset: 60000 });
  assert.equal(out.intent, "career_batch_apply", out.reply);
  assert.equal(out.result.sends, 0);
  assert.match(out.reply, /nothing was submitted/i, out.reply);
  assert.ok(out.reply.includes(SHAPE), `reply must carry the re-review shape verbatim: ${out.reply}`);
  assert.ok(!(ctx.batchApplyState.approvals && Object.keys(ctx.batchApplyState.approvals).length), "no approvals minted");
  assert.equal(w.submitted(), 0);
});

test("(i-LEGACY structured) a legacy run + the structured approval: NOT bindable — refused with the re-review shape", () => {
  const w = makeWorld(); const U = "user-fc-leg-struct";
  prepare(w, U);
  const { out, ctx } = w.say(U, "yes", { snapshot: legacySnapshot(w, U), batchApproval: { approvedByUser: true }, nowOffset: 60000 });
  assert.equal(out.resultStatus, "blocked", out.reply);
  assert.ok(out.reply.includes(SHAPE), `reply must carry the re-review shape verbatim: ${out.reply}`);
  assert.equal(ctx.batchApplyState.status, "awaiting_approval", "no approval minted");
  assert.equal(w.submitted(), 0);
});

// ---- unit level: approveRun against a real prepared run -------------
function preparedRun() {
  const w = makeWorld(); const U = "user-fc-unit";
  prepare(w, U);
  const snap = clone(w.snapshotOf(U));
  return Batch.restoreRun(snap.stores.batchApplyState);
}
const goodApproval = (run) => ({ approvedByUser: true, now: NOW + 60000, userId: run.userId, profileSha256: run.profileSha256 });

test("(ii-a) digest present on the run but NONE supplied at approval: does not bind", () => {
  const run = preparedRun();
  assert.ok(run.profileSha256, "setup: the run carries a digest");
  const ap = Batch.approveRun(run, { approvedByUser: true, now: NOW + 60000, userId: run.userId }); // owner supplied; the DIGEST is the missing field
  assert.equal(ap.ok, false, JSON.stringify(ap));
  assert.ok(String(ap.reason).includes(SHAPE), ap.reason);
  assert.equal(run.status, "awaiting_approval");
  assert.ok(!(run.approvals && Object.keys(run.approvals).length));
});

test("(ii-b) expiry missing on an otherwise new-shaped run: does not bind", () => {
  const run = preparedRun();
  delete run.cardExpiresAt;
  const ap = Batch.approveRun(run, goodApproval(run));
  assert.equal(ap.ok, false, JSON.stringify(ap));
  assert.ok(String(ap.reason).includes(SHAPE), ap.reason);
  assert.equal(run.status, "awaiting_approval");
});

test("(ii-c) a non-numeric 'now' at approval: does not bind", () => {
  const run = preparedRun();
  const ap = Batch.approveRun(run, { approvedByUser: true, now: "soon", userId: run.userId, profileSha256: run.profileSha256 }); // owner + digest supplied; NOW is the malformed field
  assert.equal(ap.ok, false, JSON.stringify(ap));
  assert.ok(String(ap.reason).includes(SHAPE), ap.reason);
  assert.equal(run.status, "awaiting_approval");
});

test("(control) a fully shaped run + a fully supplied approval still binds at the unit seam", () => {
  const run = preparedRun();
  const ap = Batch.approveRun(run, goodApproval(run));
  assert.equal(ap.ok, true, JSON.stringify(ap));
  assert.equal(run.status, "approved");
});
