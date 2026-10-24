"use strict";
/* APPROVAL INVALIDATION beyond set/payload (coordinator queue item (1),
   2026-10-24): EXPIRY and ACCOUNT CHANGE. A structured approval binds
   only while the card it was shown on still stands: inside its
   validity window, and against the profile the card's answers were
   built from. Pause and erase are covered as account changes too.
   Binding semantics only — the boards are module 149's sandbox
   fixtures; nothing real submits, ever.
   Check: node --test tests/career-batch-approval-invalidation-20261024.test.cjs */
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
  const store = { accounts: new Map(), threads: new Map() };
  const log = { records: [] };
  let n = 0;
  const say = (userId, text, extra) => {
    const ex = extra || {};
    n += 1;
    const threadId = `t-${userId}`;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + (ex.nowOffset != null ? ex.nowOffset : n * 60000), accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: {}, postings: ex.postings || [], profile: MASTER });
    ctx.portalProfile = ex.portalProfile || PORTAL_PROFILE;
    ctx.batchDeps = { log, boardFor, attestations: ATTEST };
    if (ex.batchApproval) ctx.batchApproval = ex.batchApproval;
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    if (ctx._hostPatch) {
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true, epoch: ((store.accounts.get(userId) || {}).epoch || 0) + 1 });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return { out, ctx };
  };
  const submitted = () => log.records.filter((r) => r.status === "submitted").length;
  return { say, submitted };
}
function prepare(w, U) {
  const { out, ctx } = w.say(U, "apply to 3 software engineering intern roles", { postings: MARKET3, nowOffset: 0 });
  assert.equal(out.resultStatus, "awaiting_approval", out.reply);
  return ctx.batchApplyState;
}

test("(EXPIRY-structured) the card's window passes: the structured approval no longer binds — refused as expired, nothing submits", () => {
  const w = makeWorld(); const U = "user-inv-exp";
  prepare(w, U);
  const { out, ctx } = w.say(U, "yes", { batchApproval: { approvedByUser: true }, nowOffset: 11 * 60000 });
  assert.equal(out.resultStatus, "blocked", out.reply);
  assert.equal(out.result && out.result.code, "APPROVAL_CARD_EXPIRED", out.reply);
  assert.match(out.reply, /did not submit anything/i, out.reply);
  assert.match(out.reply, /expired/i, out.reply);
  assert.equal(ctx.batchApplyState.status, "awaiting_approval", "no approval minted against an expired card");
  assert.ok(!(ctx.batchApplyState.approvals && Object.keys(ctx.batchApplyState.approvals).length));
  assert.equal(w.submitted(), 0);
});

test("(EXPIRY-conversational) the card's window passes: a chat yes hears expired + the next step, never 'approve it there'", () => {
  const w = makeWorld(); const U = "user-inv-expc";
  prepare(w, U);
  const { out } = w.say(U, "yes go ahead and submit them", { nowOffset: 11 * 60000 });
  assert.equal(out.intent, "career_batch_apply", out.reply);
  assert.equal(out.result.sends, 0);
  assert.match(out.reply, /nothing was submitted/i, out.reply);
  assert.match(out.reply, /expired/i, out.reply);
  assert.match(out.reply, /prepare the batch again|re-prepare/i, out.reply);
  assert.equal(w.submitted(), 0);
});

test("(EDIT-structured) a profile answer changes after presentation: the structured approval no longer binds", () => {
  const w = makeWorld(); const U = "user-inv-edit";
  prepare(w, U);
  const edited = clone(PORTAL_PROFILE);
  edited.answers.sponsorship = { value: "Yes, I will need sponsorship", confirmed: true };
  const { out, ctx } = w.say(U, "yes", { batchApproval: { approvedByUser: true }, portalProfile: edited, nowOffset: 120000 });
  assert.equal(out.resultStatus, "blocked", out.reply);
  assert.equal(out.result && out.result.code, "APPROVAL_PROFILE_CHANGED", out.reply);
  assert.match(out.reply, /did not submit anything/i, out.reply);
  assert.match(out.reply, /profile changed/i, out.reply);
  assert.equal(ctx.batchApplyState.status, "awaiting_approval");
  assert.equal(w.submitted(), 0);
});

test("(CONTROL) same profile, inside the window: the structured approval still binds", () => {
  const w = makeWorld(); const U = "user-inv-ctl";
  prepare(w, U);
  const { out, ctx } = w.say(U, "yes", { batchApproval: { approvedByUser: true }, nowOffset: 5 * 60000 });
  assert.equal(out.intent, "career_batch_apply", out.reply);
  assert.equal(ctx.batchApplyState.summary.submitted, 3, out.reply);
  assert.equal(w.submitted(), 3, "submissions only at the sandbox fixture boards");
});

test("(PAUSE) the account is paused after presentation: the structured approval turn submits and approves nothing", () => {
  const w = makeWorld(); const U = "user-inv-pause";
  prepare(w, U);
  w.say(U, "pause everything for now");
  const { out, ctx } = w.say(U, "yes", { batchApproval: { approvedByUser: true }, nowOffset: 180000 });
  assert.equal(w.submitted(), 0, `nothing may submit while the account is paused (reply: ${out.reply})`);
  const st = ctx.batchApplyState;
  assert.ok(!st || st.status !== "approved" && !(st.approvals && Object.keys(st.approvals).length), "no approval minted while paused");
});

test("(ERASE) the account is erased after presentation: the structured approval turn finds nothing to bind", () => {
  const w = makeWorld(); const U = "user-inv-erase";
  prepare(w, U);
  const er = w.say(U, "forget my career profile");
  assert.equal(er.out.intent, "career_profile_erased", er.out.reply);
  const { out, ctx } = w.say(U, "yes", { batchApproval: { approvedByUser: true }, nowOffset: 180000 });
  assert.equal(w.submitted(), 0, `nothing may submit after an erase (reply: ${out.reply})`);
  const st = ctx.batchApplyState;
  assert.ok(!st || !(st.approvals && Object.keys(st.approvals).length), "no approval minted after erase");
});
