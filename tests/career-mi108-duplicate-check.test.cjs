// MI-108 (Spec 2 §8.3, harness memo G3): pre-submit duplicate check
// against the user's OWN MANUAL applications. The never-twice rule in
// module 149 used to see only the product's own submissions ledger
// (status "submitted"), so the product could prepare/submit an
// application to a job the user had already applied to by hand — the
// employer's duplicate handling then merges or flags the pair.
//
// Done-test (master list MI-108): a doorstep whose tracker or user
// statement shows a prior manual application to the same canonical
// job stops with a typed ALREADY_APPLIED_BY_USER stop NAMING the
// source of the knowledge; replay guard green.
//
// FAIL-FIRST: written before the fix — on the base module every
// ALREADY_APPLIED_BY_USER case is red (the runs reach a doorstep).
// Check: node --test tests/career-mi108-duplicate-check.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Track = require(path.join(root, "packages/domain/126-career-track.js"));
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));

const USER = "user-alex-test";
const NOW = "2026-10-16T12:00:00Z";
const POSTING = {
  id: "JOB-GH-001",
  canonicalKey: "greenhouse:testsystems:software-engineering-intern",
  company: "TEST Systems",
  role: "Software Engineering Intern",
  title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testsystems/jobs/001",
  status: "open",
  atsFamily: "greenhouse",
};
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply to TEST Systems for the intern role.", confirmed: true, draft: true },
  },
};
const ATTEST = { attestations: { certify_true: { value: true, explicit: true } } };
const newLog = () => ({ records: [] });
function sandboxSession(opts = {}) {
  const board = Portal.createSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const baseRun = (over = {}) => Object.assign({ posting: POSTING, profile: PROFILE, log: newLog(), now: NOW }, ATTEST, over);

// A tracker row in 126's own shape, as written when the user reports a
// manual application in chat (142 logUserApplication -> addApplication
// with event_source "user-reported"; the applied event carries it).
function manualTrackerStore(over = {}) {
  const store = Track.createMemoryStore([]);
  const row = Track.addApplication(store, Object.assign({
    company: "TEST Systems", role: "Software Engineering Intern",
    applied_at: "2026-10-10T12:00:00Z", stage: "Submitted",
    event_source: "user-reported",
  }, over), { now: Date.parse("2026-10-10T12:00:00Z") });
  return { store, row };
}

// ---------- the done-test: tracker shows a prior manual application ----------
test("MI-108 done-test: tracker row from the user's own report (same canonical job) stops the doorstep, naming the tracker as the source", () => {
  const { store } = manualTrackerStore({ canonicalKey: POSTING.canonicalKey });
  const { board, session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({ tracker: store }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(r.source, "tracker", "the stop names the source of the knowledge");
  assert.match(r.sourceDetail, /tracker/i);
  assert.match(r.sourceDetail, /your own report|user-reported|manual/i, "the detail says the tracker row is a manual application from the user's report");
  assert.equal(r.matchedBy, "canonical_key");
  assert.equal(board.calls.open, 0, "the board is never opened for a known duplicate");
  assert.equal(board.calls.submit, 0);
  assert.ok(r.stepLog.some((s) => s.action === "manual_duplicate_stop"), "the stop is on the step log");
});

test("MI-108: tracker match by company + role when the row carries no canonical key (rows written before canonical keys were preserved)", () => {
  const { store } = manualTrackerStore();
  const { board, session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({ trackerStore: store }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(r.source, "tracker");
  assert.equal(r.matchedBy, "company_role");
  assert.equal(board.calls.submit, 0);
});

test("MI-108: a tracker row recorded only as an application in the tracker (no manual marker) still blocks — it is the user's prior application, not the product ledger's", () => {
  const store = Track.createMemoryStore([]);
  Track.addApplication(store, { company: "TEST Systems", role: "Software Engineering Intern", applied_at: "2026-10-09T12:00:00Z", stage: "Confirmed", event_source: "inbox" }, { now: Date.parse("2026-10-09T12:00:00Z") });
  const { session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({ tracker: store }));
  assert.equal(r.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(r.source, "tracker");
  assert.match(r.sourceDetail, /tracker/i);
});

test("MI-108: tracker rows can also arrive as a plain rows array / records list", () => {
  const rows = [{ app_id: "app-x", company: "TEST Systems", role: "Software Engineering Intern", stage: "Submitted", applied_at: "2026-10-10T12:00:00Z",
    events: [{ type: "applied", at: "2026-10-10T12:00:00Z", source: "user-reported", detail: "applied manually" }] }];
  const { session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({ manualApplications: rows }));
  assert.equal(r.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(r.source, "tracker");
});

// ---------- user statement as the source ----------
test("MI-108 done-test: a user statement of a prior manual application stops the doorstep, naming the statement as the source", () => {
  const { board, session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({
    userStatement: "I already applied to TEST Systems manually last week on their site",
  }));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(r.source, "user_statement", "the stop names the user's statement as the source");
  assert.match(r.sourceDetail, /your statement/i);
  assert.match(r.evidence || r.sourceDetail, /already applied to TEST Systems/i, "the statement itself is the evidence, quoted");
  assert.equal(board.calls.open, 0);
  assert.equal(board.calls.submit, 0);
});

test("MI-108: a disclosed prior-application record (141/142 shape) counts as a user statement", () => {
  const { session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({
    priorApplication: { disclosed: true, company: "TEST Systems", role: "Software Engineering Intern", channel: "employer site", at: "2026-10-13" },
  }));
  assert.equal(r.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(r.source, "user_statement");
});

test("MI-108: non-assertions in a statement write no stop — negated, hypothetical and quoted forms do not block", () => {
  for (const stmt of [
    "I didn't apply to TEST Systems — I was going to, but never did",
    "If I applied to TEST Systems manually, would that be a problem?",
    "My friend said \"I applied to TEST Systems manually\" — good for him",
  ]) {
    const { session } = sandboxSession();
    const r = Portal.runApply(session, baseRun({ userStatement: stmt }));
    assert.equal(r.resultStatus, "prepared", stmt);
  }
});

test("MI-108: a statement about a DIFFERENT company does not block this posting", () => {
  const { session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({
    userStatement: "I already applied to Globex Corporation manually last week",
  }));
  assert.equal(r.resultStatus, "prepared");
});

// ---------- controls: no false stops ----------
test("MI-108 control: a tracker row for the same company but a different role does not block", () => {
  const { store } = manualTrackerStore({ role: "Data Analyst Intern" });
  const { session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({ tracker: store }));
  assert.equal(r.resultStatus, "prepared");
});

test("MI-108 control: a tracker row that is only Saved (never applied) does not block", () => {
  const store = Track.createMemoryStore([]);
  const row = Track.addApplication(store, { company: "TEST Systems", role: "Software Engineering Intern", stage: "Saved", event_source: "system" }, { now: Date.parse(NOW) });
  row.events = []; // a saved lead with no applied event at all
  const { session } = sandboxSession();
  const r = Portal.runApply(session, baseRun({ tracker: store }));
  assert.equal(r.resultStatus, "prepared");
});

test("MI-108 control: a rejected tracker row blocks only on an EXACT canonical match, never on the fuzzy company+role path (reapply/cooldown is 126 reapplyCheck's lane)", () => {
  const { store } = manualTrackerStore({ stage: "Rejected" });
  const a = sandboxSession();
  const fuzzy = Portal.runApply(a.session, baseRun({ tracker: store }));
  assert.equal(fuzzy.resultStatus, "prepared", "fuzzy match on a terminal row does not block a reapply");
  const { store: store2 } = manualTrackerStore({ stage: "Rejected", canonicalKey: POSTING.canonicalKey });
  const b = sandboxSession();
  const exact = Portal.runApply(b.session, baseRun({ tracker: store2 }));
  assert.equal(exact.code, "ALREADY_APPLIED_BY_USER", "the same canonical opening was already applied to — exact match blocks at any stage");
});

test("MI-108 control: no tracker and no statement — the clean run still reaches the doorstep (and the product-ledger duplicate still uses its own code)", () => {
  const log = newLog();
  const a = sandboxSession();
  const r1 = Portal.runApply(a.session, baseRun({ log, approval: { approvedByUser: true } }));
  assert.equal(r1.resultStatus, "completed");
  const b = sandboxSession();
  const r2 = Portal.runApply(b.session, baseRun({ log }));
  assert.equal(r2.code, "DUPLICATE_APPLICATION", "§8.3's product-ledger rule is untouched and distinct from ALREADY_APPLIED_BY_USER");
});

// ---------- the submit gate re-checks (doorstep prepared before the manual record landed) ----------
test("MI-108: submitDoorstep re-checks — a manual application recorded after the doorstep stops the submit, unarmed, unclicked", () => {
  const { board, session } = sandboxSession();
  const prep = Portal.runApply(session, baseRun());
  assert.equal(prep.resultStatus, "prepared");
  const { store } = manualTrackerStore({ canonicalKey: POSTING.canonicalKey });
  const out = Portal.submitDoorstep(session,
    { approvedByUser: true, payloadSha256: prep.doorstep.payloadSha256 },
    { log: newLog(), now: NOW, posting: POSTING, tracker: store });
  assert.equal(out.resultStatus, "blocked");
  assert.equal(out.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(out.source, "tracker");
  assert.equal(board.calls.submit, 0, "no click over a known manual duplicate");
});

// ---------- the batch seam (155 passes the sources through) ----------
test("MI-108: a batch prepare (155) carrying the tracker stops the app ALREADY_APPLIED_BY_USER — no doorstep is carded for a manual duplicate", () => {
  const { store } = manualTrackerStore({ canonicalKey: POSTING.canonicalKey });
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 1, now: Date.parse(NOW) });
  Batch.prepareRun(run, {
    postings: [POSTING], profile: PROFILE, log: newLog(), now: Date.parse(NOW),
    attestations: ATTEST.attestations, tracker: store,
    boardFor: () => Portal.createSandboxBoard({}),
  });
  const app = run.apps[POSTING.canonicalKey];
  assert.ok(app, "the app exists on the run");
  assert.equal(app.stage, "stopped");
  assert.equal(app.stop.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(run.card, null, "no approval card is built over a manual duplicate");
});

// ---------- the pure helper + the tracker-side API (126) ----------
test("MI-108: Portal.manualDuplicateCheck is the shared seam — null on clean sources, a named hit on a manual record", () => {
  assert.equal(typeof Portal.manualDuplicateCheck, "function");
  assert.equal(Portal.manualDuplicateCheck(POSTING, {}), null);
  assert.equal(Portal.manualDuplicateCheck(POSTING, { userStatement: "unrelated chatter" }), null);
  const { store } = manualTrackerStore({ canonicalKey: POSTING.canonicalKey });
  const hit = Portal.manualDuplicateCheck(POSTING, { tracker: store });
  assert.ok(hit);
  assert.equal(hit.code, "ALREADY_APPLIED_BY_USER");
  assert.equal(hit.source, "tracker");
  assert.ok(hit.sourceDetail);
});

test("MI-108: 126 manualApplicationCheck answers from the tracker itself, and addApplication preserves the canonical key it is handed", () => {
  assert.equal(typeof Track.manualApplicationCheck, "function");
  const { store, row } = manualTrackerStore({ canonicalKey: POSTING.canonicalKey });
  assert.equal(row.canonicalKey, POSTING.canonicalKey, "addApplication keeps the canonical key so later exact matching is possible");
  const hit = Track.manualApplicationCheck(store, { canonicalKey: POSTING.canonicalKey, company: "TEST Systems", role: "Software Engineering Intern" });
  assert.equal(hit.found, true);
  assert.equal(hit.already_applied, true);
  assert.equal(hit.source, "tracker");
  assert.ok(hit.source_detail);
  const miss = Track.manualApplicationCheck(store, { canonicalKey: "greenhouse:otherco:other-role", company: "OtherCo", role: "Other Role" });
  assert.equal(miss.found, false);
  assert.equal(miss.already_applied, false);
});
