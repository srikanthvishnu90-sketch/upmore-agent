// FDSE-MISMATCH (2026-10-21) — two guards from the live batch-5ab08dedd45c
// stop (root-cause note: docs/apply/ROOT-CAUSE-FDSE-MISMATCH-2026-10-21.md):
//
// (a) OBSERVABILITY: an ANSWER_OBSERVATION_MISMATCH stop must NAME its
//     field and carry the expected and observed values at every seam —
//     149's result, 155's per-app stop record, and the run summary. On
//     the live run, 149 knew the field (its blocked result carries
//     field_id) but not the values, and 155's generic blocked path
//     (stopApp(res.code, res.reason)) discarded even the field, so the
//     stored record could not say which of 15 fills had "differed".
//
// (b) WRAPPER-PROOF FR-395 HATCH: the production board exposes its
//     rendered values ONLY through a getter (career_task_bridge.js).
//     The drive harness's observation wrapper copied every non-function
//     own property once at wrap time, freezing renderedValues at its
//     initial {} — the hatch silently never fired and a CORRECT fill
//     ("DePaul University (Driehaus College of Business)" rendered by
//     the board as "DePaul University") stopped as drift. Boards now
//     also expose renderedValue(fieldId) as a METHOD (methods survive
//     delegation wrappers — the way every observation harness wraps
//     boards), and 149 prefers the method when present. The third test
//     composes 149 over a provider board wrapped in the harness's exact
//     snapshot shape: red before the fix, prepared after it; the drift
//     negative control still stops, now with the values on the record.
//
// Check: node --test tests/career-observation-stop-record.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Bridge = require(path.join(root, "supabase/functions/_shared/career_task_bridge.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));
const { createBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));

const SECRET = "test-board-secret";
const USER = "user-observation-a";
const NOW = Date.UTC(2026, 9, 15, 17, 0, 0);
const POSTING = {
  canonicalKey: "greenhouse:testco1:software-engineering-intern",
  company: "TestCo 1", title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testco1/jobs/1", status: "open", atsFamily: "greenhouse",
  location: "Chicago, IL",
  jd_text: "Software engineering intern role. JavaScript, testing, code review.",
};
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  country: "United States",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
  },
};
const ATTEST = { certify_true: { value: true, explicit: true } };
const COUNTRY_FIELD = { field_id: "country", label: "Country", kind: "standard", profile_key: "country", required: false };

// A sandbox board with one extra standard field (country) whose readback
// is forced to `readback` — drift from the confirmed fact, with NO
// rendered value to consult, so the gate must stop and (after fix (a))
// the record must say exactly what it expected and what it saw.
function driftingBoard(readback) {
  const base = Portal.createSandboxBoard({});
  const board = Object.assign({}, base, { atsFamily: "greenhouse" });
  board.form = () => {
    const f = base.form();
    f.fields = f.fields.concat([Object.assign({}, COUNTRY_FIELD)]);
    return f;
  };
  board.answers = () => {
    const a = base.answers();
    a.country = readback;
    return a;
  };
  return board;
}

// A rendering board behind the real board service (the FR-395 helper's
// shape): filling country with the fact renders "+1"; the readback shows
// the rendering (consistent) or a third value (drift).
function renderingFactory(mode) {
  return () => {
    const base = Portal.createSandboxBoard({});
    const rendered = {};
    const board = Object.assign({}, base, { atsFamily: "greenhouse" });
    // NB: the getter must be defined, not assigned — Object.assign would
    // evaluate it once and freeze the (then-empty) snapshot.
    Object.defineProperty(board, "renderedValues", { enumerable: true, get: () => Object.assign({}, rendered) });
    board.form = () => {
      const f = base.form();
      f.fields = f.fields.concat([Object.assign({}, COUNTRY_FIELD)]);
      return f;
    };
    board.fill = (fieldId, value) => {
      const r = base.fill(fieldId, value);
      if (fieldId === "country") rendered[fieldId] = "+1";
      return r;
    };
    board.answers = () => {
      const a = base.answers();
      if (rendered.country) a.country = mode === "drift" ? "+44" : rendered.country;
      return a;
    };
    return board;
  };
}

// The live drive harness's wrapper shape (run-live-widgetfix.cjs):
// functions are wrapped by delegation; every non-function own property
// is copied ONCE, at wrap time. This is the shape that froze the
// bridge board's renderedValues getter at {} on batch-5ab08dedd45c.
function snapshotWrap(board) {
  const wrapped = {};
  for (const k of Object.keys(board)) {
    const v = board[k];
    if (typeof v !== "function") { wrapped[k] = v; continue; }
    wrapped[k] = function (...args) { return v.apply(board, args); };
  }
  return wrapped;
}

function providerBoard(mode) {
  const service = createBoardService({ secret: SECRET, familyVerdicts: { greenhouse: true }, boardFactory: renderingFactory(mode) });
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER, transport: (req) => service.handle(req) });
  return provider.boardFor(POSTING);
}

function prepare(board) {
  const session = Portal.createPortalSession({ userId: USER, board });
  return Portal.runApply(session, { posting: POSTING, profile: PROFILE, log: { records: [] }, userId: USER, now: NOW, attestations: ATTEST });
}

// ---------------- (a) the stop record names field + values ----------------
test("(a) 149: an observation-mismatch result carries field_id, expected and observed", () => {
  const res = prepare(driftingBoard("Canada"));
  assert.equal(res.resultStatus, "blocked");
  assert.equal(res.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(res.field_id, "country", "the result names the mismatching field");
  assert.equal(res.expected, "United States", "the result carries the expected (confirmed-fact) value");
  assert.equal(res.observed, "Canada", "the result carries the observed (readback) value");
});

test("(a) 155: the per-app stop record and the run summary keep field, expected and observed", () => {
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 1, now: NOW });
  Batch.prepareRun(run, {
    postings: [POSTING], profile: PROFILE, log: { records: [] }, now: NOW,
    attestations: ATTEST, boardFor: () => driftingBoard("Canada"),
  });
  const app = Object.values(run.apps)[0];
  assert.equal(app.stage, "stopped");
  assert.equal(app.stop.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(app.stop.field_id, "country", "the stored stop record names the field — the live record for batch-5ab08dedd45c could not");
  assert.equal(app.stop.expected, "United States", "the stored stop record carries the expected value");
  assert.equal(app.stop.observed, "Canada", "the stored stop record carries the observed value");
  const summaryStop = (run.summary.stops || [])[0];
  assert.ok(summaryStop, "the run summary carries the stop");
  assert.equal(summaryStop.field_id, "country", "the summary stop names the field");
});

// ---------------- (b) the hatch survives a snapshot wrapper ----------------
test("(b) boards expose renderedValue(fieldId) as a method, beside the property", () => {
  const board = providerBoard("consistent");
  assert.equal(typeof board.renderedValue, "function", "the provider board exposes the method channel");
  assert.equal(board.renderedValue("country"), undefined, "no rendering before any fill");
  board.open();
  board.fill("country", "United States");
  assert.equal(board.renderedValue("country"), "+1", "the method reads the live rendering after the fill");
  assert.deepEqual(board.renderedValues, { country: "+1" }, "the property channel is unchanged");
  board.close();
  const local = BrowserBoard.createBrowserBoard({ url: POSTING.url, userId: USER });
  assert.equal(typeof local.renderedValue, "function", "module 150's board exposes the same method");
  assert.equal(local.renderedValue("country"), undefined, "a fresh local board has no renderings");
});

test("(b) 149 over a snapshot-wrapped provider board: the hatch still fires (the FDSE shape)", () => {
  const board = snapshotWrap(providerBoard("consistent"));
  assert.deepEqual(board.renderedValues, {}, "the snapshot froze the property channel at {} — the live failure shape");
  const res = prepare(board);
  assert.equal(res.resultStatus, "prepared",
    `a fill confirmed by its rendering must reach the doorstep even through a property-copying wrapper: ${JSON.stringify(res.stepLog || res).slice(0, 400)}`);
  const hatch = (res.stepLog || []).find((s) => s.action === "answer_observation_rendered" && s.field_id === "country");
  assert.ok(hatch && hatch.matched === true && hatch.hatch_only === true, "the hatch was consulted via the surviving channel and carried the acceptance");
});

test("(b) negative control: drift from BOTH fact and rendering still stops through the wrapper, values on the record", () => {
  const board = snapshotWrap(providerBoard("drift"));
  const res = prepare(board);
  assert.equal(res.resultStatus, "blocked");
  assert.equal(res.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(res.field_id, "country");
  assert.equal(res.expected, "+1", "when the hatch was consulted, the record's expected value is the board's rendering");
  assert.equal(res.observed, "+44", "the record carries the drifted readback");
});
