// MI-118 — per-run telemetry / proof layer (149/150 run paths).
// FAIL-FIRST: written against the contract in
// docs/career/contracts/mi-118-per-run-telemetry.md before the code.
// Every application run must leave a structured record in the SAME
// ledger the caps count from, carrying: application_id, platform,
// schema_source (census-fresh vs cached), tokens_consumed,
// execution_seconds, captcha_encountered (a STOP metric), and
// delivery_status as the employer's END STATE. A per-run cost/latency
// summary must be producible from the records alone.
// Check: node --test tests/career-portal-telemetry.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Browser = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

const USER = "user-alex-test";
const POSTING = {
  id: "JOB-GH-001",
  canonicalKey: "greenhouse:testsystems:software-engineering-intern",
  company: "TEST Systems",
  role: "Software Engineering Intern",
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
const ATTEST = { certify_true: { value: true, explicit: true } };
const newLog = () => ({ records: [] });
function sandboxSession(opts = {}) {
  const board = Portal.createSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const baseRun = (over = {}) => Object.assign({ posting: POSTING, profile: PROFILE, log: newLog(), attestations: ATTEST }, over);
// a fake clock the test advances by hand: each call returns the current
// fake instant; advance(ms) moves it. Deterministic execution_seconds.
function fakeClock(startIso = "2026-10-16T15:00:00.000Z") {
  let ms = Date.parse(startIso);
  const clock = () => ms;
  clock.advance = (delta) => { ms += delta; };
  clock.iso = () => new Date(ms).toISOString();
  return clock;
}
const telemetryRecords = (log) => (log.records || []).filter((r) => r && (r.record_type === "run_telemetry" || r.telemetry === true));
const FIELDS = ["application_id", "platform", "schema_source", "tokens_consumed", "execution_seconds", "captcha_encountered", "delivery_status"];
function assertEveryField(rec, label) {
  for (const f of FIELDS) assert.ok(f in rec, `${label}: telemetry record carries ${f}`);
  assert.equal(rec.applicationId, rec.application_id, `${label}: applicationId alias matches`);
  assert.equal(rec.appId, rec.application_id, `${label}: appId alias matches`);
  assert.equal(rec.target_platform, rec.platform, `${label}: target_platform alias matches`);
}

// ---------- prepare phase: the doorstep run leaves a full record ----------
test("MI-118: a prepared doorstep run writes ONE telemetry record with every field", () => {
  const { session } = sandboxSession();
  const log = newLog();
  const clock = fakeClock();
  // wrap the board's form read so the fake clock advances during the run
  const origForm = session.board.form.bind(session.board);
  let advanced = false;
  session.board.form = () => { if (!advanced) { advanced = true; clock.advance(2500); } return origForm(); };
  const r = Portal.runApply(session, baseRun({ log, clock, tokens: 1234 }));
  assert.equal(r.resultStatus, "prepared");
  const recs = telemetryRecords(log);
  assert.equal(recs.length, 1, "exactly one record for one prepare run");
  const rec = recs[0];
  assertEveryField(rec, "prepared");
  assert.equal(rec.phase, "prepare");
  assert.equal(rec.platform, "greenhouse");
  assert.equal(rec.schema_source, "cached", "the sandbox board's fixed field set is a cached (fixture) schema, honestly labeled");
  assert.equal(rec.tokens_consumed, 1234);
  assert.equal(rec.execution_seconds, 2.5, "end - start from the injected clock");
  assert.equal(rec.captcha_encountered, false);
  assert.equal(rec.delivery_status, "not_submitted", "a doorstep delivered nothing to the employer");
  assert.equal(rec.outcome_code, null);
  assert.equal(rec.canonicalKey, POSTING.canonicalKey);
  assert.equal(rec.userId, USER);
  assert.equal(r.telemetry, rec, "the result carries the same record object");
  assert.equal(log.records.filter((x) => x.status === "submitted").length, 0, "no submission was recorded");
});

// ---------- captcha: a STOP metric on the record, at open and at review ----------
test("MI-118: captcha at open records captcha_encountered + CAPTCHA_HANDOFF, delivery not_submitted", () => {
  const { session } = sandboxSession({ board: { captchaAt: "open" } });
  const log = newLog();
  const r = Portal.runApply(session, baseRun({ log, clock: fakeClock() }));
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  const recs = telemetryRecords(log);
  assert.equal(recs.length, 1);
  assertEveryField(recs[0], "captcha-open");
  assert.equal(recs[0].captcha_encountered, true);
  assert.equal(recs[0].captcha_at, "open");
  assert.equal(recs[0].delivery_status, "not_submitted");
  assert.equal(recs[0].outcome_code, "CAPTCHA_HANDOFF");
  assert.equal(recs[0].schema_source, "not_read", "the run stopped before any form read — no schema claim");
});

test("MI-118: captcha at review records captcha_encountered at review", () => {
  const { session } = sandboxSession({ board: { captchaAt: "review" } });
  const log = newLog();
  const r = Portal.runApply(session, baseRun({ log, clock: fakeClock() }));
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  const rec = telemetryRecords(log)[0];
  assert.equal(rec.captcha_encountered, true);
  assert.equal(rec.captcha_at, "review");
  assert.equal(rec.delivery_status, "not_submitted");
});

// ---------- accepted submit: the telemetry record IS the submission record ----------
test("MI-118: an inline-approved submit writes prepare + submit records sharing one application_id; the submit record is the ledger's one submitted record", () => {
  const { session } = sandboxSession();
  const log = newLog();
  const clock = fakeClock();
  const r = Portal.runApply(session, baseRun({ log, clock, tokens: 500, approval: { approvedByUser: true, approvalRef: "batch:test:1" } }));
  assert.equal(r.resultStatus, "completed");
  const recs = telemetryRecords(log);
  assert.equal(recs.length, 2, "prepare record + submit record");
  const [prep, sub] = recs;
  assert.equal(prep.phase, "prepare");
  assert.equal(sub.phase, "submit");
  assert.equal(sub.application_id, prep.application_id, "phases join on application_id");
  assertEveryField(sub, "submit");
  assert.equal(sub.status, "submitted", "the submit telemetry record keeps the ledger's submitted status");
  assert.equal(sub.delivery_status, "submitted");
  assert.equal(sub.confirmation_id, "SBX-0001");
  assert.equal(sub.confirmationId, "SBX-0001");
  assert.equal(sub.captcha_encountered, false);
  assert.equal(log.records.filter((x) => x.status === "submitted").length, 1, "caps/duplicate guard still count exactly one submission");
  const caps = Portal.capCheck(log, USER, POSTING, clock.iso(), session.board);
  assert.equal(caps.counts.perDay, 1);
  // and the duplicate guard still sees it
  const s2 = sandboxSession();
  const dup = Portal.runApply(s2.session, baseRun({ log }));
  assert.equal(dup.code, "DUPLICATE_APPLICATION");
});

// ---------- telemetry rows never inflate caps or the duplicate guard ----------
test("MI-118: telemetry-only records (doorsteps, stops) never count as submissions", () => {
  const log = newLog();
  for (let i = 0; i < 15; i++) {
    const { session } = sandboxSession();
    const posting = Object.assign({}, POSTING, { canonicalKey: `greenhouse:testsystems:role-${i}` });
    Portal.runApply(session, baseRun({ log, posting, clock: fakeClock() }));
  }
  assert.equal(telemetryRecords(log).length, 15);
  const caps = Portal.capCheck(log, USER, POSTING, "2026-10-16T16:00:00.000Z", null);
  assert.equal(caps.counts.perDay, 0, "15 doorstep telemetry records are 0 submissions");
  assert.equal(caps.ok, true);
});

// ---------- standalone submit leg: blocked attempts are recorded too ----------
test("MI-118: submitDoorstep without approval writes a submit-phase record, delivery not_submitted", () => {
  const { session } = sandboxSession();
  const log = newLog();
  Portal.runApply(session, baseRun({ log, clock: fakeClock() }));
  const out = Portal.submitDoorstep(session, { approvedByUser: false }, { log, now: "2026-10-16T15:05:00.000Z" });
  assert.equal(out.code, "APPROVAL_REQUIRED");
  const subs = telemetryRecords(log).filter((r) => r.phase === "submit");
  assert.equal(subs.length, 1);
  assertEveryField(subs[0], "blocked-submit");
  assert.equal(subs[0].delivery_status, "not_submitted");
  assert.equal(subs[0].outcome_code, "APPROVAL_REQUIRED");
  assert.equal(subs[0].status, undefined, "a blocked submit record carries no submitted status");
});

// ---------- unknown outcome + reconcile flips the SAME record ----------
test("MI-118: a submit timeout records unknown_outcome; reconcile() updates that same record to the employer's end state", () => {
  const { board, session } = sandboxSession({ board: { submitOutcome: "timeout_receipt" } });
  const log = newLog();
  const prep = Portal.runApply(session, baseRun({ log, clock: fakeClock() }));
  assert.equal(prep.resultStatus, "prepared");
  const out = Portal.submitDoorstep(session, { approvedByUser: true, approvalRef: "batch:test:2", payloadSha256: prep.doorstep.payloadSha256 }, { log, now: "2026-10-16T15:06:00.000Z" });
  assert.equal(out.resultStatus, "unknown_outcome");
  const sub = telemetryRecords(log).find((r) => r.phase === "submit");
  assert.equal(sub.delivery_status, "unknown_outcome", "honest unknown — never spoken as sent");
  assert.equal(sub.status, undefined);
  const rec = Portal.reconcile(session);
  assert.equal(rec.resultStatus, "completed");
  assert.equal(board.calls.submit, 1, "reconcile never re-clicks");
  assert.equal(sub.delivery_status, "submitted", "the same ledger record now carries the employer's confirmed end state");
  assert.equal(sub.confirmation_id, "SBX-0001");
});

// ---------- schema source: fresh discovery vs cached attestation ----------
test("MI-118: a browser board whose form() is read live in the run records census-fresh; a board attesting cached records cached", () => {
  const mkDouble = (extra) => {
    const answers = {};
    const fields = Portal.SANDBOX_FIELDS.map((f) => Object.assign({}, f));
    return Object.assign({
      kind: "browser", sandbox: false, browserDriver: true, atsFamily: "greenhouse", host: "boards.greenhouse.io",
      accountName: "Alex Testcase (TEST)",
      open: () => ({ ok: true, captcha: null }),
      form: () => ({ fields, captchaAt: null }),
      fill: (id, v) => { answers[id] = v; return v; },
      answers: () => Object.assign({}, answers),
      atReview: () => ({ ok: true, captcha: null, atFinalReview: true }),
      submit: () => ({ outcome: "accepted", confirmationId: "GH-1" }),
      submissionState: () => ({ submitted: false, confirmationId: null }),
    }, extra || {});
  };
  const logA = newLog();
  const sA = Portal.createPortalSession({ userId: USER, board: mkDouble() });
  const rA = Portal.runApply(sA, baseRun({ log: logA, clock: fakeClock() }));
  assert.equal(rA.resultStatus, "prepared");
  assert.equal(telemetryRecords(logA)[0].schema_source, "census-fresh");
  assert.equal(telemetryRecords(logA)[0].platform, "greenhouse");

  const logB = newLog();
  const sB = Portal.createPortalSession({ userId: USER, board: mkDouble({ schemaSource: "cached" }) });
  Portal.runApply(sB, baseRun({ log: logB, clock: fakeClock() }));
  assert.equal(telemetryRecords(logB)[0].schema_source, "cached", "the board's censused attestation is honored");

  const logC = newLog();
  const sC = Portal.createPortalSession({ userId: USER, board: mkDouble() });
  Portal.runApply(sC, baseRun({ log: logC, clock: fakeClock(), schemaSource: "cached" }));
  assert.equal(telemetryRecords(logC)[0].schema_source, "cached", "a caller attestation wins over the board's");
});

// ---------- module 150 attests its own schema source ----------
test("MI-118 (150): a browser board reports opts.schemaSource before discovery and census-fresh after a live form() discovery", () => {
  const b = Browser.createBrowserBoard({ url: "https://boards.greenhouse.io/testsystems/jobs/001", userId: USER, schemaSource: "cached" });
  assert.equal(b.schemaSource, "cached");
  const b2 = Browser.createBrowserBoard({ url: "https://boards.greenhouse.io/testsystems/jobs/001", userId: USER });
  assert.equal(b2.schemaSource, null, "no attestation and no discovery yet — no claim");
  // state.defs is only set by a live discover through the helper; the
  // getter's fresh branch is exercised end-to-end by the 149 double
  // above and by the browser-tier suites. Here we pin the contract
  // surface: the getter exists and never fabricates "census-fresh".
  assert.notEqual(b2.schemaSource, "census-fresh");
});

// ---------- honesty: unmetered / unmeasured are null, never fabricated ----------
test("MI-118: without a meter or a clock the record carries null tokens / null seconds, named by the summary", () => {
  const { session } = sandboxSession();
  const log = newLog();
  Portal.runApply(session, baseRun({ log }));
  const rec = telemetryRecords(log)[0];
  assert.equal(rec.tokens_consumed, null);
  assert.equal(rec.execution_seconds, null);
  const sum = Portal.summarizeTelemetry(log.records);
  assert.equal(sum.runs, 1);
  assert.equal(sum.unmetered_runs, 1);
  assert.equal(sum.unmeasured_runs, 1);
  assert.equal(sum.total_tokens, 0, "unmetered runs contribute nothing and are counted separately — not silently zero-cost");
});

// ---------- thrown submit still leaves its record (and still throws) ----------
test("MI-118: a board submit that throws (unarmed real board) writes its telemetry record and the error propagates", () => {
  const answers = {};
  const fields = [{ field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true }];
  const board = {
    kind: "browser", sandbox: false, browserDriver: true, atsFamily: "greenhouse", host: "boards.greenhouse.io",
    open: () => ({ ok: true, captcha: null }),
    form: () => ({ fields, captchaAt: null }),
    fill: (id, v) => { answers[id] = v; return v; },
    answers: () => Object.assign({}, answers),
    atReview: () => ({ ok: true, captcha: null, atFinalReview: true }),
    submit: () => { const e = new Error("not armed"); e.code = "REAL_SUBMIT_DISABLED"; throw e; },
    submissionState: () => ({ submitted: false, confirmationId: null }),
  };
  const session = Portal.createPortalSession({ userId: USER, board });
  const log = newLog();
  const profile = { name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", answers: {} };
  const prep = Portal.runApply(session, { posting: POSTING, profile, log, clock: fakeClock() });
  assert.equal(prep.resultStatus, "prepared");
  assert.throws(
    () => Portal.submitDoorstep(session, { approvedByUser: true, approvalRef: "batch:test:3", payloadSha256: prep.doorstep.payloadSha256 }, { log, now: "2026-10-16T15:07:00.000Z" }),
    (e) => e.code === "REAL_SUBMIT_DISABLED",
  );
  const sub = telemetryRecords(log).find((r) => r.phase === "submit");
  assert.ok(sub, "the thrown submit still left its record");
  assert.equal(sub.outcome_code, "REAL_SUBMIT_DISABLED");
  assert.equal(sub.delivery_status, "not_submitted");
});

// ---------- the summary: producible from the records alone ----------
test("MI-118: summarizeTelemetry computes per-run cost/latency + delivery from ledger records alone", () => {
  const log = newLog();
  // one submitted application (inline approval), one captcha stop, one doorstep
  const a = sandboxSession();
  Portal.runApply(a.session, baseRun({ log, clock: fakeClock(), tokens: 100, approval: { approvedByUser: true, approvalRef: "batch:test:4" } }));
  const b = sandboxSession({ board: { captchaAt: "open" } });
  Portal.runApply(b.session, baseRun({ log, clock: fakeClock(), tokens: 40, posting: Object.assign({}, POSTING, { canonicalKey: "greenhouse:testsystems:role-b" }) }));
  const c = sandboxSession();
  Portal.runApply(c.session, baseRun({ log, clock: fakeClock(), tokens: 10, posting: Object.assign({}, POSTING, { canonicalKey: "greenhouse:testsystems:role-c" }) }));
  const sum = Portal.summarizeTelemetry(log.records);
  assert.equal(sum.runs, 4, "2 phases for the submitted app + captcha run + doorstep run");
  assert.equal(sum.applications, 3);
  assert.equal(sum.total_tokens, 150, "prepare tokens are carried per phase record (100 submit-phase run incl. its prepare tokens counted once per record: 100 + 40 + 10 across the three prepare records, submit record unmetered)");
  assert.equal(sum.captcha_encounters, 1);
  assert.equal(sum.by_delivery_status.submitted, 1);
  assert.equal(sum.by_delivery_status.not_submitted, 3);
  assert.equal(sum.by_platform.greenhouse.runs, 4);
  assert.equal(sum.by_platform.greenhouse.submitted, 1);
  assert.equal(sum.rows.length, 4);
  for (const row of sum.rows) for (const f of FIELDS) assert.ok(f in row, `summary row carries ${f}`);
});

// ---------- resolver keeps delivery_status in sync ----------
test("MI-118: resolveUnknownOutcomes syncs delivery_status on telemetry records it resolves", () => {
  const rec = {
    record_type: "run_telemetry", telemetry: true, phase: "submit",
    application_id: "app-x", userId: USER, canonicalKey: POSTING.canonicalKey,
    status: "unknown_outcome", delivery_status: "unknown_outcome", timestamp: "2026-10-14T00:00:00Z",
  };
  const report = Portal.resolveUnknownOutcomes({
    records: [rec], now: "2026-10-16T00:00:00Z",
    readers: () => ({ state: "submitted", confirmationId: "GH-9" }),
  });
  assert.equal(report.resolved.length, 1);
  assert.equal(rec.status, "submitted");
  assert.equal(rec.delivery_status, "submitted");
});
