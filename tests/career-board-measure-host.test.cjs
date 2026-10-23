// MEASUREMENT HOST (submit-disabled board service) — the deny tests.
//
// The variant under test is workers/career-browser/board-service-
// measure.cjs: a board service for a measurement-only host, built so
// the write surface (fill / answers / atReview / armForSubmit /
// submit / submissionState) is denied BY CONSTRUCTION — the
// dispatcher refuses those methods before any session or board is
// touched, and the boards it creates are wrapped in a restricted
// facade that does not expose the write methods at all. Module 150's
// own gate (BUG-063) made REAL_SUBMIT_DISABLED the default and arming
// the exception; this host removes the exception — there is no
// arming wire in the process to assert with.
//
// FAIL-FIRST: this file's service module is selectable so the same
// assertions can be run against the PRE-DENY code — the production
// board service — where every deny assertion must FAIL:
//   MEASURE_HOST_SERVICE_UNDER_TEST=workers/career-browser/board-service.cjs \
//     node --test tests/career-board-measure-host.test.cjs
// Default (no env): the variant. No Chromium, no network beyond
// loopback, no live site: the board factory is a spy.
// Check: node --test tests/career-board-measure-host.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

const SERVICE_UNDER_TEST = process.env.MEASURE_HOST_SERVICE_UNDER_TEST
  ? path.resolve(root, process.env.MEASURE_HOST_SERVICE_UNDER_TEST)
  : path.join(root, "workers/career-browser/board-service-measure.cjs");
const svcModule = require(SERVICE_UNDER_TEST);
const createService = svcModule.createMeasureBoardService || svcModule.createBoardService;
const startService = svcModule.startMeasureBoardService || svcModule.startBoardService;

const SECRET = "test-measure-secret";
const USER_A = "user-measure-a";
const USER_B = "user-measure-b";
const VERDICTS = { greenhouse: true, lever: true };
const POSTING_URL = "https://boards.greenhouse.io/testco1/jobs/1";
const DENIED = ["fill", "answers", "atReview", "armForSubmit", "submit", "submissionState"];

// A board double that records EVERY invocation. On the production
// service these spies are what a fill/submit would land on; on the
// variant they must stay at zero for every write method.
function makeSpyBoard() {
  const invocations = [];
  const rec = (name, result) => (...args) => { invocations.push({ method: name, args }); return result; };
  const board = {
    kind: "browser", sandbox: false, browserDriver: true,
    atsFamily: "greenhouse", host: "boards.greenhouse.io", accountName: null,
    renderedValues: {},
    open: rec("open", { ok: true, captcha: null }),
    form: rec("form", { fields: [{ field_id: "full_name", kind: "text", required: true }], captchaAt: null }),
    fill: rec("fill", "filled"),
    answers: rec("answers", { full_name: "Spy" }),
    atReview: rec("atReview", { ok: true, captcha: null }),
    armForSubmit: rec("armForSubmit", { armed: true, approvalRef: "spy-ref" }),
    submit: rec("submit", { outcome: "accepted", confirmationId: "SPY-0001" }),
    submissionState: rec("submissionState", { submitted: true, confirmationId: "SPY-0001" }),
    screenshot: rec("screenshot", "/tmp/spy-evidence.png"),
    close: rec("close", undefined),
  };
  const count = (name) => invocations.filter((i) => i.method === name).length;
  return { board, invocations, count };
}

function makeService(spy, extra = {}) {
  return createService(Object.assign({
    secret: SECRET, familyVerdicts: VERDICTS, boardFactory: () => spy.board,
  }, extra));
}
const H = { "x-upmore-board-secret": SECRET };
function createSession(service, userId = USER_A) {
  const res = service.handle({ method: "POST", path: "/board-sessions", headers: H, body: { userId, url: POSTING_URL } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.sessionId;
}
function call(service, id, body) {
  return service.handle({ method: "POST", path: `/board-sessions/${id}/call`, headers: H, body });
}

// ---------------- the deny ----------------
test("measure host: every write-surface method is hard-denied and never reaches the driver", () => {
  const spy = makeSpyBoard();
  const service = makeService(spy);
  const id = createSession(service);
  for (const method of DENIED) {
    const args = method === "fill" ? ["full_name", "Spy Value"]
      : method === "armForSubmit" ? [{ approvedByUser: true, approvalRef: "self-asserted-ref", payload: {} }]
      : [];
    const res = call(service, id, { userId: USER_A, method, args });
    assert.equal(res.status, 403, `${method}: expected HTTP 403, got ${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(res.body.error, "MEASURE_HOST_METHOD_DISABLED", `${method}: the deny is named`);
    assert.ok(!("result" in res.body) && !("ok" in res.body), `${method}: no board result crosses on a deny`);
    assert.equal(spy.count(method), 0, `${method}: zero invocations reached the driver`);
  }
  assert.equal(service.counters().refused.measureDenied, DENIED.length, "every deny is counted");
  const alive = call(service, id, { userId: USER_A, method: "open", args: [] });
  assert.equal(alive.status, 200, "the session survives the denied calls — measurement continues");
  assert.equal(spy.count("open"), 1);
});

test("measure host: the deny is unconditional — it fires before session ownership, expiry, or existence checks", () => {
  const spy = makeSpyBoard();
  const service = makeService(spy);
  const id = createSession(service);
  const foreign = call(service, id, { userId: USER_B, method: "submit", args: [] });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.error, "MEASURE_HOST_METHOD_DISABLED", "a denied method is denied, whoever asks — the deny precedes the user check");
  const unknown = call(service, "0".repeat(32), { userId: USER_A, method: "fill", args: ["full_name", "x"] });
  assert.equal(unknown.status, 403);
  assert.equal(unknown.body.error, "MEASURE_HOST_METHOD_DISABLED", "and precedes the session-existence check");
  assert.equal(spy.count("submit"), 0);
  assert.equal(spy.count("fill"), 0);
});

test("measure host: the deny holds under a production-shaped config (shards, verdicts, resume resolver present)", () => {
  const spy = makeSpyBoard();
  // The production board-config's shape, copied field for field:
  // sharding on, both verdicts, a stored-resume resolver, a big cap.
  // None of it may re-open a write path — there is no toggle.
  const service = makeService(spy, {
    boardShards: 4, maxSessionsPerUser: 64,
    resolveResumePath: () => "/tmp/measure-spy-resume.pdf",
  });
  const id = createSession(service);
  for (const method of DENIED) {
    const res = call(service, id, { userId: USER_A, method, args: [] });
    assert.equal(res.status, 403, `${method} under production-shaped config`);
    assert.equal(res.body.error, "MEASURE_HOST_METHOD_DISABLED");
    assert.equal(spy.count(method), 0, `${method}: still zero driver invocations`);
  }
});

// ---------------- the facade ----------------
test("measure host: session boards are a restricted facade — the write methods do not exist on them", () => {
  assert.equal(typeof svcModule.restrictBoard, "function", "the variant exports its board restrictor");
  const spy = makeSpyBoard();
  const facade = svcModule.restrictBoard(spy.board);
  for (const method of DENIED) {
    assert.equal(typeof facade[method], "undefined", `facade.${method} is absent, not merely guarded`);
  }
  assert.equal(typeof facade.open, "function");
  assert.equal(typeof facade.form, "function");
  assert.equal(typeof facade.close, "function");
  assert.deepEqual(facade.open(), { ok: true, captcha: null }, "open delegates to the driver");
  assert.equal(facade.form().fields.length, 1, "form delegates to the driver");
  assert.equal(facade.atsFamily, "greenhouse", "session metadata still crosses the facade");
  assert.equal(facade.host, "boards.greenhouse.io");
  facade.close();
  assert.equal(spy.count("open"), 1);
  assert.equal(spy.count("form"), 1);
  assert.equal(spy.count("close"), 1);
});

// ---------------- the measurement surface, intact ----------------
test("measure host: create, open, form, and close all work — the measurement surface survived", () => {
  const spy = makeSpyBoard();
  const service = makeService(spy);
  const id = createSession(service);
  const opened = call(service, id, { userId: USER_A, method: "open", args: [] });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.ok, true);
  assert.deepEqual(opened.body.result, { ok: true, captcha: null });
  const formed = call(service, id, { userId: USER_A, method: "form", args: [] });
  assert.equal(formed.status, 200);
  assert.equal(formed.body.result.fields.length, 1, "the form map crosses — the mapping the engine lane consumes");
  const closed = service.handle({ method: "POST", path: `/board-sessions/${id}/close`, headers: H, body: { userId: USER_A } });
  assert.equal(closed.status, 200);
  assert.deepEqual(closed.body, { ok: true, closed: true });
  assert.equal(service.sessionCount(), 0, "the closed session is gone");
  assert.equal(spy.count("close"), 1, "close reached the driver exactly once");
});

// ---------------- parity with the production service's refusals ----------------
test("measure host: auth, host gate, verdict gate, and per-user binding are unchanged", () => {
  const spy = makeSpyBoard();
  const service = makeService(spy);
  const create = (headers, body) => service.handle({ method: "POST", path: "/board-sessions", headers, body: body || { userId: USER_A, url: POSTING_URL } });
  assert.equal(create({}).status, 401, "missing secret header");
  assert.equal(create({ "x-upmore-board-secret": "wrong" }).status, 401, "wrong secret");
  const noSecret = createService({ familyVerdicts: VERDICTS, boardFactory: () => spy.board });
  assert.equal(noSecret.handle({ method: "POST", path: "/board-sessions", headers: H, body: { userId: USER_A, url: POSTING_URL } }).status, 401, "no secret configured -> fail-closed, everything refused");
  assert.equal(create(H, { userId: USER_A, url: "https://example.com/jobs/1" }).status, 403, "unlisted host refused");
  assert.equal(create(H, { userId: USER_A, url: "https://example.com/jobs/1" }).body.error, "DRIVER_HOST_REFUSED");
  const ghOnly = makeService(makeSpyBoard(), { familyVerdicts: { greenhouse: true } });
  const lever = ghOnly.handle({ method: "POST", path: "/board-sessions", headers: H, body: { userId: USER_A, url: "https://jobs.lever.co/testco2/2" } });
  assert.equal(lever.status, 403);
  assert.equal(lever.body.error, "FAMILY_NOT_DRIVEABLE", "a family with no verdict is refused by name");
  const id = createSession(service);
  const cross = call(service, id, { userId: USER_B, method: "open", args: [] });
  assert.equal(cross.status, 403);
  assert.equal(cross.body.error, "user_mismatch", "an allowed method from the wrong user is still refused");
  assert.equal(spy.count("open"), 0, "and never reached the board");
  const unknownMethod = call(service, id, { userId: USER_A, method: "teleport", args: [] });
  assert.equal(unknownMethod.status, 400, "a method that exists nowhere is refused as before");
  assert.equal(unknownMethod.body.error, "method_not_allowed");
});

// ---------------- the real wire ----------------
test("measure host (wire): the started server denies submit over loopback HTTP and still maps a form", async () => {
  const spy = makeSpyBoard();
  const { server, service } = startService({
    port: 0, secret: SECRET, familyVerdicts: VERDICTS, boardFactory: () => spy.board, sweepMs: 0,
  });
  await new Promise((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (p, body, headers = {}) => {
    const res = await fetch(base + p, {
      method: "POST",
      headers: Object.assign({ "content-type": "application/json", "x-upmore-board-secret": SECRET }, headers),
      body: JSON.stringify(body || {}),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    const created = await post("/board-sessions", { userId: USER_A, url: POSTING_URL });
    assert.equal(created.status, 201);
    const id = created.body.sessionId;
    const submitted = await post(`/board-sessions/${id}/call`, { userId: USER_A, method: "submit", args: [] });
    assert.equal(submitted.status, 403, "submit over the wire is denied");
    assert.equal(submitted.body.error, "MEASURE_HOST_METHOD_DISABLED");
    assert.equal(spy.count("submit"), 0);
    const formed = await post(`/board-sessions/${id}/call`, { userId: USER_A, method: "form", args: [] });
    assert.equal(formed.status, 200);
    assert.equal(formed.body.result.fields.length, 1, "form mapping works over the wire");
    const closed = await post(`/board-sessions/${id}/close`, { userId: USER_A });
    assert.equal(closed.status, 200);
    assert.equal(service.sessionCount(), 0);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
