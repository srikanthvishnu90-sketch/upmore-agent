"use strict";
/* ACCOUNT BINDING (coordinator queue item (2), 2026-10-24): a run
   prepared for user A must NOT bind an approval arriving as user B —
   even with an IDENTICAL profile digest. A digest binds a profile;
   it is not account identity. The run stores its owner at creation
   (155 createRun: run.userId, from the creating ctx); the binding
   check must compare it against the approval's arriving account
   BEFORE any digest/expiry value is consulted.
   The seam composition (B's turn carrying A's snapshot) is the
   artificial part: production carriage is per-user (career_host_load
   enforces thread ownership), so this test proves the BINDING CHECK
   itself does not rely on carriage. Sandbox boards; nothing submits.
   Check: node --test tests/career-batch-approval-account-20261024.test.cjs */
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
const MASTER = {
  basics: { name: "Alex Testcase", location: "Chicago, IL" },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago"], starredCompanies: [] },
};
// ONE portal profile, used for BOTH users — the digests are identical
// by construction, so only account identity can separate them.
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
const host = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
});
const log = { records: [] };
function turn(userId, text, opts) {
  const o = opts || {};
  const ctx = host.createTurnCtx({ userId, threadId: o.threadId || "t-1", now: NOW + (o.nowOffset || 0), accountPersistence: true, snapshot: o.snapshot || null, account: {}, watchState: {}, postings: o.postings || [], profile: MASTER });
  ctx.portalProfile = PORTAL_PROFILE;
  ctx.batchDeps = { log, boardFor, attestations: ATTEST };
  if (o.batchApproval) ctx.batchApproval = o.batchApproval;
  const out = host.runTurn(text, ctx);
  return { out, ctx, snap: host.extractSnapshot(ctx) };
}

test("(ACCOUNT carriage) the host refuses a foreign snapshot outright: createTurnCtx throws on owner mismatch", () => {
  const A = "user-acct-a";
  const prep = turn(A, "apply to 3 software engineering intern roles", { postings: MARKET3 });
  assert.equal(prep.out.resultStatus, "awaiting_approval", prep.out.reply);
  assert.throws(
    () => turn("user-acct-b", "yes", { snapshot: prep.snap, batchApproval: { approvedByUser: true } }),
    /career_snapshot_owner_mismatch/,
    "production carriage is the first line of defense — B cannot even restore A's snapshot",
  );
});

test("(ACCOUNT seam) A's run record inside B's thread state + B's approval (identical digest): the BINDING CHECK refuses", () => {
  const A = "user-acct-a"; const B = "user-acct-b";
  const prep = turn(A, "apply to 3 software engineering intern roles", { postings: MARKET3 });
  assert.equal(prep.out.resultStatus, "awaiting_approval", prep.out.reply);
  assert.equal(prep.ctx.batchApplyState.userId, A, "setup: the run stores its owner");
  // Compose the state a carriage bug (or a future loader) could
  // produce: B's own snapshot shell carrying A's run record. The
  // stores restore verbatim; only the binding check can catch it.
  const foreign = clone(prep.snap);
  foreign.scope.userId = B;
  const before = log.records.filter((r) => r.status === "submitted").length;
  const asB = turn(B, "yes", { snapshot: foreign, batchApproval: { approvedByUser: true }, nowOffset: 60000 });
  assert.equal(asB.out.resultStatus, "blocked", asB.out.reply);
  assert.equal(asB.out.result && asB.out.result.code, "APPROVAL_ACCOUNT_MISMATCH", asB.out.reply);
  assert.match(asB.out.reply, /did not submit anything/i, asB.out.reply);
  assert.match(asB.out.reply, /different account/i, asB.out.reply);
  assert.ok(!(asB.ctx.batchApplyState.approvals && Object.keys(asB.ctx.batchApplyState.approvals).length), "no approvals minted for B");
  assert.equal(log.records.filter((r) => r.status === "submitted").length, before, "nothing submitted");
});

test("(ACCOUNT unit) approveRun refuses a foreign account before digest/expiry are consulted; the owner binds", () => {
  const A = "user-acct-a";
  const prep = turn(A, "apply to 3 software engineering intern roles", { postings: MARKET3, threadId: "t-unit" });
  const run = Batch.restoreRun(clone(prep.ctx.batchApplyState));
  const foreign = Batch.approveRun(run, { approvedByUser: true, now: NOW + 60000, profileSha256: run.profileSha256, userId: "user-acct-b" });
  assert.equal(foreign.ok, false, JSON.stringify(foreign));
  assert.equal(foreign.code, "APPROVAL_ACCOUNT_MISMATCH", foreign.reason);
  assert.equal(run.status, "awaiting_approval");
  const own = Batch.approveRun(run, { approvedByUser: true, now: NOW + 60000, profileSha256: run.profileSha256, userId: A });
  assert.equal(own.ok, true, JSON.stringify(own));
  assert.equal(run.status, "approved");
});
