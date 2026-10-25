"use strict";
/* SUBMIT-STEER-1130 (2026-10-25): the APPLICATION SUBMISSION chat path.
   Fail-first at b382bbc6. Two targets, router layer only:

   (1) ANSWER CAPTURE — when prepare stops an application on an
   UNCOVERED_QUESTION, the chat path must ASK that question, and the
   person's unambiguous reply becomes a CONFIRMED answer the executor
   reads on re-prepare (fact-class keys record on the profile with
   honest chat provenance, per the branch's existing fact rules;
   posting-specific questions record on the application only and must
   not leak to a sibling). Ambiguous / hedged / third-party /
   multi-action replies record NOTHING and draw a clarifying question.
   A correction replaces the recorded answer; the executor reads the
   latest; a profile-answer change after the card invalidates the
   approval through the existing digest gate.

   (2) OUTCOME READBACK — "submitted" is spoken only for an application
   carrying a recorded employer confirmation. A submission the board
   accepted with NO confirmation id reads as sent-not-submitted, never
   "submitted", and never prints a "(null)" confirmation.

   PIN tests (marked PIN) pin behavior that already holds at base —
   duplicate approval, false confirmation text, the attestation
   boundary (the approve-first.ts certification carrier is HELD by
   owner decision; a chat "yes, I certify" is never an answer, an
   approval, or an attestation).

   Sandbox fixture boards only. Nothing submits to a real employer;
   CAREER_AGENT_SUBMIT stays OFF.
   Check: node --test tests/career-submit-chatpath-20261025.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const Portal = D("149-career-portal-apply.js");
const Batch = D("155-career-batch-apply.js");

const NOW = Date.parse("2026-10-25T16:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const SHAPE = "re-review needed: I will re-prepare and show a fresh card";

const MASTER_BASE = {
  basics: {
    name: "Alex Testcase", location: "Chicago, IL",
    email: "alex.testcase@example.test", phone: "+1 000 555 0100",
    resumeFile: "alex-testcase-resume.pdf", resumeSha256: "a".repeat(64),
  },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago"], starredCompanies: [] },
};
const FULL_ANSWERS = {
  work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
  sponsorship: { value: "No", confirmed: true },
  cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
};
const PORTAL_FULL = {
  name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 000 555 0100", location: "Chicago, IL",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: FULL_ANSWERS,
};
const ATTEST = { certify_true: { value: true, explicit: true } };

function posting(n, extra) {
  return Object.assign({
    id: `JOB-S-${n}`, job_id: `JOB-S-${n}`, canonicalKey: `greenhouse:testco${n}:software-engineering-intern`,
    company: `TestCo ${n}`, role: "Software Engineering Intern", title: "Software Engineering Intern",
    url: `https://boards.greenhouse.io/testco${n}/jobs/${n}`, status: "open", atsFamily: "greenhouse",
    location: "Chicago, IL", posted_at: "2026-10-10",
    jd_text: "Software engineering intern role. JavaScript, testing, code review, agile team.",
  }, extra || {});
}
const START_FIELD = { field_id: "earliest_start", label: "What is the earliest date you can start?", kind: "question", question_key: "earliest_start_date", required: true };

function makeWorld(opts) {
  const o = opts || {};
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const master = clone(MASTER_BASE);
  const store = { threads: new Map() };
  const log = { records: [] };
  const boards = []; // { postingId, board } in creation order
  const boardFor = (p) => {
    let b = Portal.createSandboxBoard({});
    if (o.extraFieldFor && o.extraFieldFor(p)) b = Portal.createSandboxBoard({ extraFields: [START_FIELD] });
    if (o.wrapBoard) b = o.wrapBoard(b);
    const wrapped = Object.assign({}, b, { atsFamily: p.atsFamily });
    boards.push({ postingId: p.id, board: wrapped });
    return wrapped;
  };
  let n = 0;
  const say = (userId, text, extra) => {
    const ex = extra || {};
    n += 1;
    const threadId = `t-${userId}`;
    const snap = ex.snapshot !== undefined ? ex.snapshot : (store.threads.get(threadId) || null);
    const input = { userId, threadId, now: NOW + (ex.nowOffset != null ? ex.nowOffset : n * 60000), accountPersistence: true, snapshot: snap, account: {}, watchState: {}, postings: ex.postings || [] };
    if (!ex.omitProfile) input.profile = master;
    const ctx = host.createTurnCtx(input);
    if (o.portalProfile !== undefined) ctx.portalProfile = clone(o.portalProfile);
    ctx.batchDeps = { log, boardFor, attestations: ATTEST };
    if (ex.batchApproval) ctx.batchApproval = ex.batchApproval;
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    return { out, ctx };
  };
  const snapshotOf = (userId) => store.threads.get(`t-${userId}`);
  const runOf = (userId) => { const s = snapshotOf(userId); return s && s.stores ? s.stores.batchApplyState : null; };
  const profileOf = (userId) => { const s = snapshotOf(userId); return s && s.stores ? s.stores.profile : null; };
  const submitted = () => log.records.filter((r) => r.status === "submitted").length;
  const lastBoardFor = (postingId) => { const hits = boards.filter((b) => b.postingId === postingId); return hits.length ? hits[hits.length - 1].board : null; };
  return { say, snapshotOf, runOf, profileOf, submitted, lastBoardFor, master, log };
}

// ---------- (1) the question is ASKED, with its descriptor on the stop ----------

test("prepare that stops on an uncovered question ASKS it in chat, and the stop carries the question descriptor", () => {
  const w = makeWorld({}); // no injected portal profile: the router composes from the master, which holds no answers
  const U = "u-ask";
  const { out } = w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  const run = w.runOf(U);
  assert.ok(run, "a batch run stands");
  const app = Object.values(run.apps)[0];
  assert.equal(app.stop && app.stop.code, "UNCOVERED_QUESTION", "the app stopped on the uncovered question");
  assert.ok(Array.isArray(app.stop.questions) && app.stop.questions.length >= 1,
    "the stop record carries the question descriptor (field_id, question_key, label) — at base it carries only {field_id, reason} asks");
  assert.equal(app.stop.questions[0].field_id, "work_authorization");
  assert.equal(app.stop.questions[0].question_key, "work_authorization");
  assert.ok(out.reply.includes("Are you authorized to work in the US?"),
    `the reply asks the actual question, not a generic stop line: ${out.reply}`);
  assert.ok(out.reply.includes("TestCo 1"), "the question names the application it belongs to");
});

// ---------- (1) fact-class capture: recorded, executor reads it, next question follows ----------

test("an unambiguous answer is recorded as a confirmed chat answer and the executor reads it on re-prepare", () => {
  const w = makeWorld({});
  const U = "u-capture";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  const a1 = w.say(U, "Yes — I am authorized to work in the US", { nowOffset: 60000 });
  const prof = w.profileOf(U);
  assert.ok(prof.answers && prof.answers.work_authorization,
    "the answer is recorded on the profile's answers (the store the executor's composition reads)");
  assert.equal(prof.answers.work_authorization.value, "Yes — I am authorized to work in the US", "verbatim value, no paraphrase");
  assert.equal(prof.answers.work_authorization.confirmed, true);
  assert.equal(prof.answers.work_authorization.source, "chat_answer");
  assert.match(prof.answers.work_authorization.provenance, /chat/i, "provenance honestly says it was stated in chat");
  assert.ok(a1.out.reply.includes("Recorded"), `the reply names what was recorded: ${a1.out.reply}`);
  assert.ok(a1.out.reply.includes("Will you require sponsorship?"),
    `re-prepare surfaces the next open question: ${a1.out.reply}`);
  const a2 = w.say(U, "No", { nowOffset: 120000 });
  const run = w.runOf(U);
  assert.equal(run.status, "awaiting_approval", `after both answers the batch reaches the card: ${a2.out.reply}`);
  assert.equal(w.profileOf(U).answers.sponsorship.value, "No");
  const board = w.lastBoardFor("JOB-S-1");
  assert.ok(board, "the re-prepare drove a board");
  assert.equal(board.answers().work_authorization, "Yes — I am authorized to work in the US",
    "EXECUTOR READ: the value the executor's drive actually filled is the recorded chat answer");
  assert.equal(board.answers().sponsorship, "No", "EXECUTOR READ: the second recorded answer is on the form too");
});

// ---------- (1) ambiguity gates: record NOTHING, ask a clarifying question ----------

test("a hedged reply records nothing and draws a clarifying question naming the open question", () => {
  const w = makeWorld({});
  const U = "u-hedge";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  const before = w.runOf(U).id;
  const { out } = w.say(U, "maybe, I'm not sure yet", { nowOffset: 60000 });
  assert.match(out.reply, /nothing was saved/i, `the clarify reply says nothing was saved: ${out.reply}`);
  assert.ok(out.reply.includes("Are you authorized to work in the US?"), "the clarify reply re-asks the open question");
  const prof = w.profileOf(U);
  assert.ok(!prof.answers || !prof.answers.work_authorization, "no answer was recorded from a hedge");
  assert.equal(w.runOf(U).id, before, "no re-prepare happened");
});

test("a reply about a third party records nothing (the answer must be the person's own assertion)", () => {
  const w = makeWorld({});
  const U = "u-third";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  const { out } = w.say(U, "my brother is authorized, he doesn't need sponsorship", { nowOffset: 60000 });
  assert.match(out.reply, /nothing was saved/i, out.reply);
  const prof = w.profileOf(U);
  assert.ok(!prof.answers || (!prof.answers.work_authorization && !prof.answers.sponsorship),
    "nothing was recorded from a statement about someone else");
});

test("a reply carrying a second action records nothing and does not execute the second action", () => {
  const w = makeWorld({});
  const U = "u-multi";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  const { out } = w.say(U, "Yes — and also cancel the whole batch", { nowOffset: 60000 });
  assert.match(out.reply, /nothing was saved/i, out.reply);
  const prof = w.profileOf(U);
  assert.ok(!prof.answers || !prof.answers.work_authorization, "the bundled answer was not recorded");
  assert.ok(w.runOf(U), "the batch still stands — the bundled second action was not executed either");
  assert.equal(w.submitted(), 0);
});

test("PIN: a turn that is not an answer at all is never captured as one", () => {
  const w = makeWorld({});
  const U = "u-nonanswer";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  w.say(U, "tell Priya her interview moved to Tuesday", { nowOffset: 60000 });
  const prof = w.profileOf(U);
  assert.ok(!prof.answers || (!prof.answers.work_authorization && !prof.answers.sponsorship),
    "a relay instruction about a third party wrote no answer");
  assert.equal(w.submitted(), 0);
});

// ---------- (1) posting-specific scope: binds to its application, never leaks ----------

test("a posting-specific answer records on that application only and the executor reads it there", () => {
  const w = makeWorld({ portalProfile: PORTAL_FULL, extraFieldFor: (p) => p.id === "JOB-S-2" });
  const U = "u-scope";
  const prep = w.say(U, "apply to 2 software engineering intern roles", { postings: [posting(1), posting(2)], nowOffset: 0 });
  assert.ok(prep.out.reply.includes("What is the earliest date you can start?"),
    `the posting-specific question is asked: ${prep.out.reply}`);
  assert.ok(prep.out.reply.includes("TestCo 2"), "and it names its application");
  const ans = w.say(U, "June 1, 2027", { nowOffset: 60000 });
  const run = w.runOf(U);
  assert.equal(run.status, "awaiting_approval", `both applications reach the card after the answer: ${ans.out.reply}`);
  const keyB = Object.keys(run.apps).find((k) => run.apps[k].company === "TestCo 2");
  const keyA = Object.keys(run.apps).find((k) => run.apps[k].company === "TestCo 1");
  assert.equal(run.apps[keyB].answers.earliest_start_date.value, "June 1, 2027",
    "the answer is recorded on the application it was asked for");
  assert.ok(!(run.apps[keyA].answers && run.apps[keyA].answers.earliest_start_date),
    "it did not leak onto the sibling application");
  const prof = w.profileOf(U);
  assert.ok(!prof.answers || !prof.answers.earliest_start_date,
    "a posting-specific answer does not stand as a general profile fact");
  assert.equal(w.lastBoardFor("JOB-S-2").answers().earliest_start, "June 1, 2027",
    "EXECUTOR READ: the re-prepare filled the recorded answer on that application's form");
});

test("the same posting-specific question on a sibling application is NOT answered by the first application's answer", () => {
  const w = makeWorld({ portalProfile: PORTAL_FULL, extraFieldFor: () => true });
  const U = "u-noleak";
  w.say(U, "apply to 2 software engineering intern roles", { postings: [posting(2), posting(3)], nowOffset: 0 });
  const ans = w.say(U, "June 1, 2027", { nowOffset: 60000 });
  const run = w.runOf(U);
  const apps = Object.values(run.apps);
  const stopped = apps.filter((a) => a.stage === "stopped");
  assert.equal(stopped.length, 1, "exactly one sibling is still stopped — the answer bound only to the application it was asked for");
  assert.ok(ans.out.reply.includes("What is the earliest date you can start?"),
    `the sibling's own question is asked next: ${ans.out.reply}`);
  assert.ok(ans.out.reply.includes(stopped[0].company), "and it names the sibling application");
});

// ---------- (1) correction: replaces the record, executor reads the latest, old card superseded ----------

test("a corrected answer replaces the recorded one; re-prepare reads the correction; the earlier card no longer stands", () => {
  const w = makeWorld({});
  const U = "u-correct";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  w.say(U, "Yes — I am authorized to work in the US", { nowOffset: 60000 });
  w.say(U, "No", { nowOffset: 120000 });
  const cardRun = w.runOf(U);
  assert.equal(cardRun.status, "awaiting_approval", "setup: a card stands on the first answer");
  const fix = w.say(U, "actually, change my sponsorship answer to yes", { nowOffset: 180000 });
  assert.equal(w.profileOf(U).answers.sponsorship.value, "yes",
    `the correction replaces the recorded value: ${fix.out.reply}`);
  const run = w.runOf(U);
  assert.notEqual(run.id, cardRun.id, "the batch was re-prepared — the earlier card is superseded, not silently edited");
  assert.ok(run.events.some((e) => e.type === "answer_replaced" && e.question_key === "sponsorship" && e.prior === "No"),
    "the replacement is on the record with the prior value");
  assert.equal(w.lastBoardFor("JOB-S-1").answers().sponsorship, "yes",
    "EXECUTOR READ: the re-prepare filled the corrected answer");
  const ok = w.say(U, "yes", { batchApproval: { approvedByUser: true }, nowOffset: 240000 });
  assert.equal(ok.out.resultStatus, "completed", ok.out.reply);
  assert.equal(w.submitted(), 1, "the corrected batch submits exactly once, on the fresh card");
});

test("wrong-answer gate: an answer changed on the record after the card stands makes the approval refuse (digest), nothing submits", () => {
  const w = makeWorld({});
  const U = "u-digest";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  w.say(U, "Yes — I am authorized to work in the US", { nowOffset: 60000 });
  w.say(U, "No", { nowOffset: 120000 });
  assert.equal(w.runOf(U).status, "awaiting_approval", "setup: a card stands");
  const snap = clone(w.snapshotOf(U));
  snap.stores.profile.answers.sponsorship.value = "Yes, I will need sponsorship";
  const { out } = w.say(U, "yes", { snapshot: snap, omitProfile: true, batchApproval: { approvedByUser: true }, nowOffset: 180000 });
  assert.equal(w.submitted(), 0, "an approval over changed answers must not submit");
  assert.notEqual(out.resultStatus, "completed", out.reply);
  assert.ok(out.reply.includes(SHAPE) || /changed/i.test(out.reply),
    `the refusal names the change / re-review shape: ${out.reply}`);
});

// ---------- (2) readback at the 155 seam: submitted only with a recorded confirmation ----------

function preparedBatchRun(wrapBoard) {
  const log = { records: [] };
  const boardFor = (p) => {
    let b = Portal.createSandboxBoard({});
    if (wrapBoard) b = wrapBoard(b);
    return Object.assign({}, b, { atsFamily: p.atsFamily });
  };
  const run = Batch.createRun({ userId: "u-readback", familyKey: "software-engineering", familyText: "software engineering", count: 1, now: NOW });
  Batch.prepareRun(run, { postings: [posting(1)], profile: clone(Object.assign({ name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 000 555 0100", location: "Chicago, IL", resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) } }, { answers: clone(FULL_ANSWERS) })), log, boardFor, attestations: ATTEST });
  return { run, log, boardFor };
}

test("readback: a submission the employer accepted with NO confirmation recorded is never spoken as submitted", () => {
  const { run, log, boardFor } = preparedBatchRun((b) => Object.assign({}, b, {
    submit() { return { outcome: "accepted" }; },
    submissionState() { return { submitted: true, confirmationId: null }; },
  }));
  assert.equal(Batch.approveRun(run, { approvedByUser: true, now: NOW, userId: run.userId, profileSha256: run.profileSha256 }).ok, true);
  Batch.executeRun(run, { now: NOW, profile: { answers: clone(FULL_ANSWERS) }, log, boardFor });
  const app = Object.values(run.apps)[0];
  assert.equal(app.stage, "submitted", "setup: the drive landed (the board took it)");
  assert.ok(!app.confirmationId, "setup: no employer confirmation is recorded on the row");
  const lines = Batch.speakSummary(run);
  assert.notEqual(lines[0], "1/1 applications submitted.",
    "the headline must not claim submitted without a recorded confirmation");
  assert.ok(lines.some((l) => /not counted as submitted/i.test(l)),
    `the readback says plainly it does not count as submitted: ${lines.join(" | ")}`);
  assert.ok(!lines.some((l) => l.includes("(null)")), "no fabricated '(null)' confirmation is printed");
  assert.equal(Batch.summarizeRun(run).confirmations.length, 0,
    "the summary's confirmations list holds only recorded employer confirmations");
});

test("PIN readback control: a submission WITH a recorded employer confirmation reads as submitted, with the id", () => {
  const { run, log, boardFor } = preparedBatchRun(null);
  assert.equal(Batch.approveRun(run, { approvedByUser: true, now: NOW, userId: run.userId, profileSha256: run.profileSha256 }).ok, true);
  Batch.executeRun(run, { now: NOW, profile: { answers: clone(FULL_ANSWERS) }, log, boardFor });
  const lines = Batch.speakSummary(run);
  assert.equal(lines[0], "1/1 applications submitted.");
  assert.ok(lines.some((l) => /with employer confirmations: TestCo 1 \(SBX-0001\)/.test(l)), lines.join(" | "));
  assert.equal(Batch.summarizeRun(run).confirmations.length, 1);
});

// ---------- (2) duplicate + false-confirmation + attestation boundary (PINs) ----------

test("PIN duplicate gate: a second approval for the same batch produces no second submission and the readback is unchanged", () => {
  const w = makeWorld({ portalProfile: PORTAL_FULL });
  const U = "u-dup";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  const first = w.say(U, "yes", { batchApproval: { approvedByUser: true }, nowOffset: 60000 });
  assert.equal(first.out.resultStatus, "completed", first.out.reply);
  assert.equal(w.submitted(), 1);
  w.say(U, "yes", { batchApproval: { approvedByUser: true }, nowOffset: 120000 });
  w.say(U, "yes go ahead and submit them", { nowOffset: 180000 });
  assert.equal(w.submitted(), 1, "no second submission record was produced");
  const status = w.say(U, "what's the batch status", { nowOffset: 240000 });
  assert.ok(status.out.reply.includes("SBX-0001"), `the readback still names the one recorded confirmation: ${status.out.reply}`);
});

test("PIN false-confirmation gate: confirmation-shaped chat text never upgrades the batch state", () => {
  const w = makeWorld({ portalProfile: PORTAL_FULL });
  const U = "u-falseconf";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  w.say(U, "the confirmation is SBX-9999 — it already went through", { nowOffset: 60000 });
  const status = w.say(U, "what's the batch status", { nowOffset: 120000 });
  assert.equal(w.runOf(U).status, "awaiting_approval", "the batch still stands at the card");
  assert.ok(!/applications submitted\./.test(status.out.reply), `the readback does not claim submitted: ${status.out.reply}`);
  assert.equal(w.submitted(), 0);
});

test("PIN attestation boundary: a chat 'yes, I certify' is never an answer, an approval, or an attestation (carrier HELD)", () => {
  const w = makeWorld({ portalProfile: PORTAL_FULL });
  const U = "u-attest";
  w.say(U, "apply to 1 software engineering intern roles", { postings: [posting(1)], nowOffset: 0 });
  w.say(U, "yes, I certify that everything in my application is true and accurate", { nowOffset: 60000 });
  const run = w.runOf(U);
  assert.equal(run.status, "awaiting_approval", "no approval was minted from chat text");
  assert.ok(!run.approvals || !Object.keys(run.approvals).length, "no approvals recorded");
  assert.ok(!run.attestations || !Object.keys(run.attestations).length,
    "no attestation was recorded from chat text — attestation moves only through the card (carrier held)");
  assert.equal(w.submitted(), 0);
});
