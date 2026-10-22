// BENCH-60 FIX ROUND (2026-10-22) — crash handling in the drive path:
// reap-on-crash in the board service, F-036 (a mid-drive throw must
// still land a saved run record), F-035 (the worker's refusal reason
// must survive the bridge into the stop's name). Root-cause note:
// docs/apply/ROOT-CAUSE-BENCH60-FIX-2026-10-22.md; measured evidence:
// docs/apply/BENCH-60-2026-10-22.md (48 of 84 legs erased, 409
// SESSION_LIMIT ×8 mislabeled BOARD_NOT_WIRED).
// Fail-first: every test here fails on the base tree for the named
// reason. TEST persona + fake/sandbox boards only; no real portal.
// Check: node --test tests/career-bench60-fixes.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Bridge = require(path.join(root, "supabase/functions/_shared/career_task_bridge.js"));
const { createBoardService, createShardedBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));
const { createBatchExecutor } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));
const crashFactory = require(path.join(root, "tests/helpers/crash-fake-board.cjs"));
const CRASH_MODULE = path.join(root, "tests/helpers/crash-fake-board.cjs");

const SECRET = "test-board-secret";
const H = { "x-upmore-board-secret": SECRET };
const NOW = Date.UTC(2026, 9, 22, 10, 0, 0);
const GH_URL = "https://boards.greenhouse.io/testco1/jobs/1";
const coded = (code, message) => Object.assign(new Error(message), { code });

const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
  },
};
const MASTER = {
  basics: { name: "Alex Testcase (TEST)", email: "alex.testcase@example.test" },
  facts: [
    { id: "F-T-001", kind: "skill", text: "JavaScript and Node.js development", confirmed: true },
    { id: "F-T-002", kind: "experience", text: "Built web applications as a student developer", confirmed: true },
    { id: "F-T-003", kind: "education", text: "Computer Science student", confirmed: true },
  ],
};
const ATTEST = { certify_true: { value: true, explicit: true } };
const POSTING_A = {
  id: "JOB-T-A", job_id: "JOB-T-A",
  canonicalKey: "greenhouse:testco1:software-engineering-intern",
  company: "TestCo 1", role: "Software Engineering Intern", title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testco1/jobs/1", status: "open", atsFamily: "greenhouse",
  location: "Chicago, IL", posted_at: "2026-10-10",
  jd_text: "Software engineering intern role at a test company. JavaScript, testing, code review, agile team.",
};
const POSTING_B = {
  id: "JOB-T-B", job_id: "JOB-T-B",
  canonicalKey: "greenhouse:testco2:software-engineering-intern",
  company: "TestCo 2", role: "Software Engineering Intern", title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testco2/jobs/2", status: "open", atsFamily: "greenhouse",
  location: "Chicago, IL", posted_at: "2026-10-10",
  jd_text: "Software engineering intern role at a test company. JavaScript, testing, code review, agile team.",
};

// ---------------- reap-on-crash: the core ----------------
function makeCrashService(extra = {}) {
  return createBoardService(Object.assign({
    secret: SECRET, familyVerdicts: { greenhouse: true }, boardFactory: crashFactory, now: () => NOW,
  }, extra));
}
const create = (svc, userId = "u1") => svc.handle({ method: "POST", path: "/board-sessions", headers: H, body: { userId, url: GH_URL } });
const call = (svc, id, method, args, userId = "u1") => svc.handle({ method: "POST", path: `/board-sessions/${id}/call`, headers: H, body: { userId, method, args } });

test("reap: a Target-crashed call destroys the session at once and frees the cap slot", () => {
  const svc = makeCrashService({ maxSessionsPerUser: 1 });
  const c1 = create(svc);
  assert.equal(c1.status, 201);
  const id = c1.body.sessionId;
  assert.equal(call(svc, id, "fill", ["name", "Alex"]).body.ok, true);
  const crash = call(svc, id, "fill", ["crashme", "x"]);
  assert.equal(crash.status, 200);
  assert.equal(crash.body.ok, false);
  assert.equal(crash.body.code, "DRIVER_ERROR", "the caller still receives the board's own error, unchanged");
  assert.match(crash.body.message, /Target crashed/);
  assert.equal(crash.body.sessionReaped, true, "the response names the reap so the router can drop ownership");
  assert.equal(svc.sessionCount(), 0, "the zombie does not hold its slot until the idle TTL");
  assert.equal(svc.counters().reaped, 1);
  const c2 = create(svc);
  assert.equal(c2.status, 201, "a fresh create succeeds immediately — no 409 from a dead page (base tree: 409 SESSION_LIMIT)");
  const gone = call(svc, id, "answers", []);
  assert.equal(gone.status, 404, "a reaped session answers the ordinary not-found — the client surfaces WORKER_SESSION_GONE");
});

test("reap: DRIVER_TIMEOUT (150 killed the helper; the page died with it) also reaps", () => {
  const svc = makeCrashService({ maxSessionsPerUser: 1 });
  const id = create(svc).body.sessionId;
  const out = call(svc, id, "fill", ["gone", "x"]);
  assert.equal(out.body.ok, false);
  assert.equal(out.body.sessionReaped, true);
  assert.equal(svc.sessionCount(), 0);
  assert.equal(create(svc).status, 201);
});

test("reap: an ordinary live-board refusal never reaps — the session stays drivable", () => {
  const svc = makeCrashService({ maxSessionsPerUser: 1 });
  const id = create(svc).body.sessionId;
  const refusal = call(svc, id, "fill", ["boom", "x"]);
  assert.equal(refusal.body.ok, false);
  assert.equal(refusal.body.code, "BOARD_FILL_FAILED");
  assert.equal(refusal.body.sessionReaped, undefined);
  assert.equal(svc.sessionCount(), 1, "a live board declining a field is not a death");
  const after = call(svc, id, "answers", []);
  assert.equal(after.status, 200);
  assert.equal(after.body.ok, true, "the same session keeps driving after a refusal");
});

// ---------------- reap-on-crash: the sharded router ----------------
test("reap (sharded): the router drops ownership on sessionReaped and the freed slot serves a new create", async () => {
  const svc = createShardedBoardService({
    secret: SECRET, boardShards: 2, maxSessionsPerUser: 2,
    familyVerdicts: { greenhouse: true }, boardFactoryModule: CRASH_MODULE, sweepMs: 0,
  });
  try {
    const mk = () => svc.handleAsync({ method: "POST", path: "/board-sessions", headers: H, body: { userId: "u1", url: GH_URL } });
    const c1 = await mk();
    const c2 = await mk();
    assert.equal(c1.status, 201);
    assert.equal(c2.status, 201);
    assert.equal(svc.sessionCount(), 2, "both shards hold one session each (per-shard cap = ceil(2/2))");
    const crash = await svc.handleAsync({ method: "POST", path: `/board-sessions/${c1.body.sessionId}/call`, headers: H, body: { userId: "u1", method: "fill", args: ["crashme", "x"] } });
    assert.equal(crash.body.ok, false);
    assert.equal(crash.body.sessionReaped, true);
    assert.equal(svc.sessionCount(), 1, "the router's ownership count drops with the core's reap");
    const c3 = await mk();
    assert.equal(c3.status, 201, "the freed slot serves a new session at once (base tree: 409 from the zombie shard)");
  } finally {
    await svc.close();
  }
});

// ---------------- F-035: the refusal reason survives the bridge ----------------
test("F-035: a provider's coded refusal is recorded on the wrapper, not erased", () => {
  let refuse = true;
  const provider = {
    boardFor() {
      if (refuse) throw coded("SESSION_LIMIT", "this user already holds 64 live board sessions (cap 64)");
      return Portal.createSandboxBoard({});
    },
  };
  const boardFor = Bridge.createCareerBoardFor(provider);
  assert.equal(boardFor(POSTING_A), null, "the wrapper still fails closed to null");
  assert.equal(boardFor.lastRefusal && boardFor.lastRefusal.code, "SESSION_LIMIT", "the refusal is attached where 155 can name it");
  assert.match(boardFor.lastRefusal.message, /64 live board sessions/);
  refuse = false;
  const board = boardFor(POSTING_A);
  assert.ok(board && typeof board.open === "function", "a later success returns the board");
  assert.equal(boardFor.lastRefusal, null, "a success clears the recorded refusal — no stale naming");
});

test("F-035: 155 names the stop SESSION_LIMIT (workerRefusal carried), never BOARD_NOT_WIRED", () => {
  const provider = { boardFor() { throw coded("SESSION_LIMIT", "this user already holds 64 live board sessions (cap 64)"); } };
  const run = Batch.createRun({ userId: "user-f035", familyText: "software engineering intern", count: 1, now: NOW });
  Batch.prepareRun(run, {
    postings: [POSTING_A], profile: PROFILE, profileMaster: MASTER,
    log: { records: [] }, now: NOW, attestations: ATTEST, boardFor: Bridge.createCareerBoardFor(provider),
  });
  const app = run.apps[POSTING_A.canonicalKey];
  assert.equal(app.stage, "stopped");
  assert.equal(app.stop.code, "SESSION_LIMIT", "the stop names the worker's refusal (base tree: BOARD_NOT_WIRED)");
  assert.equal(app.stop.workerRefusal, "SESSION_LIMIT");
});

test("F-035 boundary: a transport-family failure (worker down) keeps BOARD_NOT_WIRED, code carried as workerRefusal", () => {
  const provider = { boardFor() { throw coded("WORKER_UNREACHABLE", "the career worker board service could not be reached"); } };
  const run = Batch.createRun({ userId: "user-f035t", familyText: "software engineering intern", count: 1, now: NOW });
  Batch.prepareRun(run, {
    postings: [POSTING_A], profile: PROFILE, profileMaster: MASTER,
    log: { records: [] }, now: NOW, attestations: ATTEST, boardFor: Bridge.createCareerBoardFor(provider),
  });
  const app = run.apps[POSTING_A.canonicalKey];
  assert.equal(app.stop.code, "BOARD_NOT_WIRED", "no answer ever arrived — the standing not-wired degradation (loop-acceptance's guard)");
  assert.equal(app.stop.workerRefusal, "WORKER_UNREACHABLE", "the transport's code is still on the record as evidence");
});

test("F-035 control: a plain null board (no provider refusal) still stops BOARD_NOT_WIRED", () => {
  const run = Batch.createRun({ userId: "user-f035c", familyText: "software engineering intern", count: 1, now: NOW });
  Batch.prepareRun(run, {
    postings: [POSTING_A], profile: PROFILE, profileMaster: MASTER,
    log: { records: [] }, now: NOW, attestations: ATTEST, boardFor: () => null,
  });
  const app = run.apps[POSTING_A.canonicalKey];
  assert.equal(app.stop.code, "BOARD_NOT_WIRED", "not-wired keeps meaning exactly one thing");
});

// ---------------- F-036: a mid-drive throw still lands a run record ----------------
function crashingBoard() {
  const page = Portal.createSandboxBoard({});
  const rendered = {};
  let fills = 0;
  const board = {
    sandbox: true, atsFamily: "greenhouse",
    open: (...a) => page.open(...a),
    form: (...a) => page.form(...a),
    fill(fid, v) {
      fills += 1;
      if (fills >= 2) throw coded("DRIVER_ERROR", "elementHandle.evaluate: Target crashed");
      const r = page.fill(fid, v);
      rendered[fid] = v;
      return r;
    },
    answers: (...a) => page.answers(...a),
    atReview: (...a) => page.atReview(...a),
    submit: (...a) => page.submit(...a),
    close: () => { try { page.close && page.close(); } catch (_) { /* best effort */ } },
  };
  Object.defineProperty(board, "renderedValues", { get: () => Object.assign({}, rendered) });
  return board;
}
function normalBoard() {
  return Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: "greenhouse" });
}

test("F-036: a mid-drive crash stops the leg DRIVER_ERROR inside a saved run; its sibling still prepares", () => {
  const boards = { [POSTING_A.canonicalKey]: crashingBoard(), [POSTING_B.canonicalKey]: normalBoard() };
  const run = Batch.createRun({ userId: "user-f036", familyText: "software engineering intern", count: 2, now: NOW });
  assert.doesNotThrow(() => Batch.prepareRun(run, {
    postings: [POSTING_A, POSTING_B], profile: PROFILE, profileMaster: MASTER,
    log: { records: [] }, now: NOW, attestations: ATTEST, boardFor: (p) => boards[p.canonicalKey] || null,
  }), "prepareRun must absorb a board throw at the application boundary (base tree: it escapes)");
  const a = run.apps[POSTING_A.canonicalKey];
  assert.equal(a.stage, "stopped");
  assert.equal(a.stop.code, "DRIVER_ERROR");
  assert.match(a.stop.error || "", /Target crashed/, "the verbatim crash signature is preserved in the stop record");
  assert.ok(a.stop.fills && Object.keys(a.stop.fills).length >= 1, "the fills the board rendered before the crash are preserved, not reconstructed");
  const b = run.apps[POSTING_B.canonicalKey];
  assert.equal(b.stage, "doorstep", "the sibling application in the same batch still prepares to its doorstep");
  assert.ok(run.summary, "the run carries its summary — the record the executor saves and 175 reads");
  assert.ok(run.summary.stops.some((s) => s.postingKey === POSTING_A.canonicalKey && s.code === "DRIVER_ERROR"), "the summary names the crashed leg's stop");
});

test("F-036 (executor): the prepare intent COMPLETES and the run record is stored", async () => {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const db = { states: new Map(), runs: new Map(), ledgers: new Map() };
  const skeleton = Batch.serializeRun(Batch.createRun({ userId: "user-f036x", familyText: "software engineering intern", count: 1, now: NOW }));
  const store = {
    async pending() {
      const st = db.states.get("i-f036");
      if (st && st.state !== "queued") return [];
      return [{ userId: "user-f036x", intentId: "i-f036", binding: { action: "prepare", run_id: skeleton.id, family_text: skeleton.familyText }, request: { run: skeleton } }];
    },
    async claim({ intentId }) { const st = db.states.get(intentId); if (st && st.state !== "queued") return null; db.states.set(intentId, { state: "claimed" }); return { claimed: true }; },
    async finish({ intentId, state, result }) { db.states.set(intentId, { state, result }); },
    async saveRun(record) { db.runs.set(record.runId, clone(record)); },
    async readRun({ runId }) { const r = db.runs.get(runId); return r ? clone(r) : null; },
    async ledgerFor(userId) { if (!db.ledgers.has(userId)) db.ledgers.set(userId, { records: [] }); return db.ledgers.get(userId); },
    async saveLedger(userId, records) { db.ledgers.set(userId, { records }); },
  };
  const executor = createBatchExecutor({
    store,
    postingsFor: async () => [POSTING_A],
    profileFor: async () => ({ profile: PROFILE, profileMaster: MASTER, attestations: ATTEST }),
    boardForFor: () => () => crashingBoard(),
    now: () => NOW,
  });
  const results = await executor.runBatchPending();
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "completed", "the intent completes — the crash is the application's outcome, not the batch's erasure (base tree: blocked DRIVER_ERROR)");
  const stored = db.runs.get(skeleton.id);
  assert.ok(stored && stored.run, "a run record was saved (base tree: stored null)");
  const app = stored.run.apps[POSTING_A.canonicalKey];
  assert.equal(app.stop.code, "DRIVER_ERROR");
  assert.match(app.stop.error || "", /Target crashed/);
});
