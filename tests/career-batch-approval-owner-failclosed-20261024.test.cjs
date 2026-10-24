"use strict";
/* OWNER FAIL-CLOSED (coordinator item (1), 2026-10-24): the account
   comparison refused only when BOTH sides named an owner — a run
   with no userId, or an approval with no userId, bound anyway. A
   missing owner on EITHER side now fails closed with the re-review
   line. Same decision point (155 approveRun), consulted before
   the set hash, expiry and digest.
   The EXECUTOR half: executeApprove (workers/career-browser/
   batch-executor.cjs) used to replay the run's STORED profile
   digest at the commitment boundary. The executor CAN read the
   current profile — profileFor(userId) is a required dep — so it
   now reads it BEFORE approving and digests the CURRENT facts;
   a changed profile refuses, a vanished profile blocks named.
   What a fake still covers, named: profileFor here is an
   in-memory fake; the production profileFor reads the user's
   stored profile record through the pool assembly (batch-
   executor.cjs main()) — that read is not exercised here.
   Sandbox boards; nothing submits for real.
   Check: node --test tests/career-batch-approval-owner-failclosed-20261024.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const { createBatchExecutor } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));

const NOW = Date.UTC(2026, 9, 24, 15, 0, 0);
const SHAPE = "re-review needed: I will re-prepare and show a fresh card";
const clone = (v) => JSON.parse(JSON.stringify(v));
const PROFILE = {
  name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 000 555 0100", location: "Chicago, IL",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
  },
};
const MASTER = {
  basics: { name: "Alex Testcase", location: "Chicago, IL" },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago"], starredCompanies: [] },
};
const MARKET3 = [1, 2, 3].map((n) => ({
  id: `JOB-O-${n}`, job_id: `JOB-O-${n}`, canonicalKey: `greenhouse:testco${n}:software-engineering-intern`,
  company: `TestCo ${n}`, role: "Software Engineering Intern", title: "Software Engineering Intern",
  url: `https://boards.greenhouse.io/testco${n}/jobs/${n}`, status: "open", atsFamily: "greenhouse",
  location: "Chicago, IL", posted_at: "2026-10-10",
  jd_text: "Software engineering intern role. JavaScript, testing, code review, agile team.",
}));
const ATTEST = { certify_true: { value: true, explicit: true } };
function boardFor(p) { return Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: p.atsFamily }); }
function readyRun(userId) {
  const log = { records: [] };
  const run = Batch.createRun({ userId, familyText: "software engineering intern", count: 3, now: NOW });
  Batch.prepareRun(run, { postings: MARKET3, profile: PROFILE, profileMaster: MASTER, log, boardFor, attestations: ATTEST, now: NOW });
  assert.equal(run.status, "awaiting_approval", JSON.stringify(run.summary));
  return run;
}
const fullApproval = (run, over) => Object.assign({ approvedByUser: true, now: NOW + 60000, userId: run.userId, profileSha256: run.profileSha256 }, over || {});

// ---------- approveRun unit seam -------------------------------------
test("(owner) a run with NO owner + a full approval: fails closed with the re-review line", () => {
  const run = readyRun("user-own-1");
  run.userId = null; // a run record that names no owning account
  const ap = Batch.approveRun(run, fullApproval(run, { userId: "user-own-1" }));
  assert.equal(ap.ok, false, JSON.stringify(ap));
  assert.equal(ap.code, "APPROVAL_REVIEW_NEEDED", ap.reason);
  assert.ok(String(ap.reason).includes(SHAPE), ap.reason);
  assert.equal(run.status, "awaiting_approval");
  assert.ok(!(run.approvals && Object.keys(run.approvals).length));
});

test("(owner) an approval with NO owner + an owned run: fails closed with the re-review line", () => {
  const run = readyRun("user-own-2");
  const ap = Batch.approveRun(run, fullApproval(run, { userId: null }));
  assert.equal(ap.ok, false, JSON.stringify(ap));
  assert.equal(ap.code, "APPROVAL_REVIEW_NEEDED", ap.reason);
  assert.ok(String(ap.reason).includes(SHAPE), ap.reason);
  assert.equal(run.status, "awaiting_approval");
});

test("(owner) a DIFFERENT owner still refuses as a mismatch; the SAME owner binds (controls)", () => {
  const run = readyRun("user-own-3");
  const foreign = Batch.approveRun(run, fullApproval(run, { userId: "user-own-other" }));
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, "APPROVAL_ACCOUNT_MISMATCH", foreign.reason);
  const own = Batch.approveRun(run, fullApproval(run));
  assert.equal(own.ok, true, JSON.stringify(own));
  assert.equal(run.status, "approved");
});

// ---------- executor commitment boundary ------------------------------
function memStore() {
  const db = { intents: new Map(), state: new Map(), runs: new Map(), ledgers: new Map() };
  return {
    db,
    async pending() { return [...db.intents.values()].filter((i) => (db.state.get(i.intentId) || {}).state === undefined); },
    async claim({ intentId }) { if (db.state.has(intentId)) return null; db.state.set(intentId, { state: "claimed" }); return { claimed: true }; },
    async finish({ intentId, state, result }) { db.state.set(intentId, { state, result }); },
    async saveRun(record) { db.runs.set(record.runId, clone(record)); },
    async readRun({ userId, runId }) { const r = db.runs.get(runId); return r && r.userId === userId ? clone(r) : null; },
    async ledgerFor(userId) { if (!db.ledgers.has(userId)) db.ledgers.set(userId, { records: [] }); return db.ledgers.get(userId); },
    async saveLedger(userId, records) { db.ledgers.set(userId, { records }); },
  };
}
const USER = "user-exec-1";
async function executorWorld(profileHolder) {
  const store = memStore();
  const submits = [];
  const boardForFor = () => (p) => { const b = Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: p.atsFamily }); const sub = b.submit; b.submit = () => { submits.push(p.canonicalKey); return sub(); }; return b; };
  const executor = createBatchExecutor({
    store, postingsFor: async () => clone(MARKET3),
    profileFor: async () => profileHolder.current,
    boardForFor, now: () => NOW,
  });
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 3, now: NOW });
  run.status = "queued_prepare";
  store.db.intents.set("prep-1", { userId: USER, intentId: "prep-1", binding: { action: "prepare", run_id: run.id, family_text: run.familyText }, request: { run: clone(run) } });
  const prep = await executor.runBatchPending();
  assert.equal(prep[0].status, "completed", JSON.stringify(prep));
  const record = store.db.runs.get(run.id);
  assert.equal(record.status, "awaiting_approval");
  const queueApprove = () => store.db.intents.set("appr-1", { userId: USER, intentId: "appr-1", binding: { action: "approve", run_id: run.id, card_sha256: record.run.cardSha256 }, request: null });
  return { store, executor, submits, queueApprove, runId: run.id };
}

test("(executor) the profile CHANGES between prepare and approve: the boundary refuses on the CURRENT digest, nothing submits", async () => {
  const holder = { current: { profile: clone(PROFILE), profileMaster: MASTER } };
  const w = await executorWorld(holder);
  const changed = clone(PROFILE);
  changed.answers.cover_note = { value: "A different note the user never saw on the card.", confirmed: true, draft: true };
  holder.current = { profile: changed, profileMaster: MASTER }; // the stored profile record moved after the card
  w.queueApprove();
  const res = await w.executor.runBatchPending();
  const ap = res.find((r) => r.action === "approve");
  assert.equal(ap.status, "blocked", JSON.stringify(ap));
  assert.equal(ap.blocked, "APPROVAL_PROFILE_CHANGED", JSON.stringify(ap));
  assert.equal(w.submits.length, 0, "nothing submitted");
  assert.equal(w.store.db.runs.get(w.runId).run.status, "awaiting_approval");
});

test("(executor) the profile is GONE at approve time: the boundary blocks named, nothing submits", async () => {
  const holder = { current: { profile: clone(PROFILE), profileMaster: MASTER } };
  const w = await executorWorld(holder);
  holder.current = {}; // profileFor finds no stored profile record anymore
  w.queueApprove();
  const res = await w.executor.runBatchPending();
  const ap = res.find((r) => r.action === "approve");
  assert.equal(ap.status, "blocked", JSON.stringify(ap));
  assert.equal(ap.blocked, "BATCH_PROFILE_NOT_FOUND", JSON.stringify(ap));
  assert.equal(w.submits.length, 0);
});

test("(executor control) the CURRENT profile is unchanged: the approve binds and submits at the boundary", async () => {
  const holder = { current: { profile: clone(PROFILE), profileMaster: MASTER } };
  const w = await executorWorld(holder);
  w.queueApprove();
  const res = await w.executor.runBatchPending();
  const ap = res.find((r) => r.action === "approve");
  assert.equal(ap.status, "completed", JSON.stringify(ap));
  assert.equal(w.submits.length, 3, "all three sandbox submits land");
});
