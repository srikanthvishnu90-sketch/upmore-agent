// WORKER BOARD PROVIDER (LOOP J9, tier 2) — the board-provider service
// in the worker process (workers/career-browser/board-service.cjs) and
// the real bridge provider (career_task_bridge.createWorkerBoardProvider)
// that talks to it. Graded at the boundaries the build owns:
//   - the provider factory's fail-closed gating (no transport / no
//     secret / no user / no url -> not a provider -> BOARD_NOT_WIRED);
//   - the service's auth, per-user session binding (cross-user refusal
//     that never touches the board), verdict gate, host gate, session
//     cap, and idle-TTL expiry;
//   - a full module-149 drive (prepare -> doorstep -> approval ->
//     submit, SBX confirmation) through provider + service, twice:
//     once with the double at the transport boundary (an in-process
//     call into the real service core), once over a REAL loopback HTTP
//     wire via the synchronous worker_threads transport.
// The service's board factory is injected with 149's sandbox factory
// (Chromium cannot start sandboxed in this executor — the limit the
// owned-worker doc records); the factory is the service's seam, and
// module 150 remains its default. TEST persona only; no real portal
// is opened by this suite, ever.
// Check: node --test tests/career-board-provider.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Bridge = require(path.join(root, "supabase/functions/_shared/career_task_bridge.js"));
const { createBoardService, startBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));
const { createSyncHttpTransport } = require(path.join(root, "workers/career-browser/board-transport.cjs"));

const SECRET = "test-board-secret";
const USER_A = "user-provider-a";
const USER_B = "user-provider-b";
const NOW = Date.UTC(2026, 9, 15, 17, 0, 0);
const VERDICTS = { greenhouse: true, lever: true, ashby: true };

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
const ATTEST = { certify_true: { value: true, explicit: true } };
const POSTING = {
  canonicalKey: "greenhouse:testco1:software-engineering-intern",
  company: "TestCo 1", title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testco1/jobs/1", status: "open", atsFamily: "greenhouse",
};

// The service's factory seam: 149's sandbox board, declaring the family
// of the URL it serves (the contract 150's real adapter presents).
// Created boards are registered so tests can prove what was (and was
// not) touched.
function makeFactory(registry) {
  return (opts) => {
    const url = opts.url || "";
    const fam = /lever\.co/.test(url) ? "lever" : /ashbyhq\.com/.test(url) ? "ashby" : "greenhouse";
    const board = Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: fam });
    if (registry) registry.push(board);
    return board;
  };
}
function makeService(extra = {}) {
  return createBoardService(Object.assign({ secret: SECRET, familyVerdicts: VERDICTS, boardFactory: makeFactory(extra.registry) }, extra));
}
const inProcess = (service) => (req) => service.handle(req);
function makeProvider(service, extra = {}) {
  return Bridge.createWorkerBoardProvider(Object.assign({
    workerUrl: "http://127.0.0.1:0/board-service", secret: SECRET, userId: USER_A, transport: inProcess(service),
  }, extra));
}
function driveThrough149(board, userId = USER_A) {
  const log = { records: [] };
  const session = Portal.createPortalSession({ userId, board });
  const prep = Portal.runApply(session, { posting: POSTING, profile: PROFILE, log, userId, now: NOW, attestations: ATTEST });
  assert.equal(prep.resultStatus, "prepared", JSON.stringify(prep.stepLog || prep));
  assert.ok(prep.doorstep && prep.doorstep.payloadSha256, "a hash-bound doorstep was prepared");
  const out = Portal.submitDoorstep(session, { approvedByUser: true, payloadSha256: prep.doorstep.payloadSha256 }, { log, now: NOW, posting: POSTING });
  return { prep, out, log };
}

// ---------------- factory gating: fail-closed ----------------
test("provider factory: any missing leg (transport, secret, user, url) resolves to no provider", () => {
  const service = makeService();
  const transport = inProcess(service);
  assert.equal(Bridge.createWorkerBoardProvider(null), null);
  assert.equal(Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A }), null, "no synchronous transport -> not a provider (the Edge runtime's position today)");
  assert.equal(Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", userId: USER_A, transport }), null, "no secret -> not a provider");
  assert.equal(Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, transport }), null, "no bound user -> not a provider");
  assert.equal(Bridge.createWorkerBoardProvider({ secret: SECRET, userId: USER_A, transport }), null, "no worker url -> not a provider");
  assert.equal(Bridge.createCareerBoardFor(Bridge.createWorkerBoardProvider({ secret: SECRET, userId: USER_A, transport })), null, "and the bridge therefore resolves no boardFor");
  const provider = makeProvider(service);
  assert.ok(provider && provider.transport === "career_worker_board" && typeof provider.boardFor === "function", "fully specified -> a provider");
});

// ---------------- the full drive through provider + service ----------------
test("provider + service: a 149 drive prepares, binds, and submits with an employer-shaped confirmation", () => {
  const registry = [];
  const service = makeService({ registry });
  const provider = makeProvider(service);
  const boardFor = Bridge.createCareerBoardFor(provider);
  const board = boardFor(POSTING);
  assert.ok(board, "the bridge passed the provider's board through");
  assert.equal(board.kind, "browser");
  assert.equal(board.browserDriver, true);
  assert.equal(board.sandbox, false);
  assert.equal(board.atsFamily, "greenhouse", "the family is the worker's truth from session creation, not the client's hope");
  assert.ok(board.workerSessionId, "the board carries its worker session id as evidence");
  const { out, log } = driveThrough149(board);
  assert.equal(out.resultStatus, "completed");
  assert.match(out.submission.confirmationId, /^SBX-\d{4}$/);
  assert.equal(log.records.filter((r) => r.status === "submitted").length, 1);
  assert.equal(registry.length, 1, "exactly one worker-side board was created");
  assert.equal(registry[0].calls.submit, 1, "the worker board fired its one submit");
  assert.equal(service.sessionCount(), 1, "the session lives worker-side");
});

test("service: armForSubmit against a board without the wire is a no-op success, never an invented error", () => {
  const service = makeService();
  const provider = makeProvider(service);
  const board = provider.boardFor(POSTING);
  const res = board.armForSubmit({ approvedByUser: true, approvalRef: null, payload: {}, payloadSha256: "0".repeat(64) });
  assert.deepEqual(res, { armed: false, absent: true }, "149 calls armForSubmit only when present; the proxy reproduces the absent-method semantics");
});

// ---------------- auth ----------------
test("service auth: no secret configured, wrong secret, and missing secret are all refused; the provider names it", () => {
  const service = makeService();
  const create = (headers) => service.handle({ method: "POST", path: "/board-sessions", headers, body: { userId: USER_A, url: POSTING.url } });
  assert.equal(create({}).status, 401, "missing secret header");
  assert.equal(create({ "x-upmore-board-secret": "wrong" }).status, 401, "wrong secret");
  const noSecretService = createBoardService({ familyVerdicts: VERDICTS, boardFactory: makeFactory() });
  assert.equal(noSecretService.handle({ method: "POST", path: "/board-sessions", headers: { "x-upmore-board-secret": SECRET }, body: { userId: USER_A, url: POSTING.url } }).status, 401, "a service with no secret configured refuses everything");
  const badProvider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: "wrong", userId: USER_A, transport: inProcess(service) });
  assert.throws(() => badProvider.boardFor(POSTING), (e) => e.code === "WORKER_AUTH_REFUSED", "the provider names the auth refusal exactly");
  assert.equal(Bridge.createCareerBoardFor(badProvider)(POSTING), null, "through the bridge it degrades to no board — BOARD_NOT_WIRED, never a fake drive");
});

// ---------------- the gates at creation ----------------
test("service gates: an unlisted host is refused by the host gate; a family with no driveable verdict is refused by name", () => {
  const service = makeService();
  const provider = makeProvider(service);
  assert.throws(() => provider.boardFor({ url: "https://example.com/jobs/1" }), (e) => e.code === "DRIVER_HOST_REFUSED", "§6.3 host gate fires before any session exists");
  const greenhouseOnly = createBoardService({ secret: SECRET, familyVerdicts: { greenhouse: true }, boardFactory: makeFactory() });
  const p2 = makeProvider(greenhouseOnly);
  assert.throws(() => p2.boardFor({ url: "https://jobs.lever.co/testco2/2" }), (e) => e.code === "FAMILY_NOT_DRIVEABLE" && /lever/.test(e.message), "no verdict for lever -> refused, the family named");
  const noVerdicts = createBoardService({ secret: SECRET, boardFactory: makeFactory() });
  assert.throws(() => makeProvider(noVerdicts).boardFor(POSTING), (e) => e.code === "FAMILY_NOT_DRIVEABLE", "no verdict source at all -> fail-closed, nothing is driveable");
});

// ---------------- cross-user: the reachability standard ----------------
test("service: a session can only ever be addressed by its creating user — a cross-user call is refused and the board is untouched", () => {
  const registry = [];
  const service = makeService({ registry });
  const H = { "x-upmore-board-secret": SECRET };
  const created = service.handle({ method: "POST", path: "/board-sessions", headers: H, body: { userId: USER_A, url: POSTING.url } });
  assert.equal(created.status, 201);
  const id = created.body.sessionId;
  const callsBefore = registry[0].calls.open + registry[0].calls.fill + registry[0].calls.submit;
  const cross = service.handle({ method: "POST", path: `/board-sessions/${id}/call`, headers: H, body: { userId: USER_B, method: "open", args: [] } });
  assert.equal(cross.status, 403);
  assert.equal(cross.body.error, "user_mismatch");
  assert.ok(!("result" in cross.body) && !("board" in cross.body), "no session content crosses to the wrong owner");
  assert.equal(registry[0].calls.open + registry[0].calls.fill + registry[0].calls.submit, callsBefore, "the refused call never reached the board");
  const crossClose = service.handle({ method: "POST", path: `/board-sessions/${id}/close`, headers: H, body: { userId: USER_B } });
  assert.equal(crossClose.status, 403, "a cross-user close is refused too");
  const own = service.handle({ method: "POST", path: `/board-sessions/${id}/call`, headers: H, body: { userId: USER_A, method: "open", args: [] } });
  assert.equal(own.status, 200, "the owner's own call still works after the refused attempts");
  const unknown = service.handle({ method: "POST", path: `/board-sessions/${"0".repeat(32)}/call`, headers: H, body: { userId: USER_A, method: "open", args: [] } });
  assert.equal(unknown.status, 404);
  assert.deepEqual(Object.keys(unknown.body), ["error"], "an unknown session id answers with an error code and nothing else");
});

// ---------------- lifecycle: cap + expiry ----------------
test("service: the per-user session cap refuses excess sessions by name", () => {
  const service = makeService({ maxSessionsPerUser: 2 });
  const provider = makeProvider(service);
  provider.boardFor(POSTING);
  provider.boardFor(POSTING);
  assert.throws(() => provider.boardFor(POSTING), (e) => e.code === "SESSION_LIMIT");
  const other = makeProvider(service, { userId: USER_B });
  assert.ok(other.boardFor(POSTING), "the cap is per-user — another user is unaffected");
});

test("service: an expired session is destroyed and can never be driven — no stale-session anything", () => {
  let clock = NOW;
  const registry = [];
  const service = makeService({ registry, now: () => clock, sessionTtlMs: 60000 });
  const provider = makeProvider(service);
  const board = provider.boardFor(POSTING);
  assert.deepEqual(board.open(), { ok: true, captcha: null }, "the session drives while fresh");
  clock += 61000;
  assert.throws(() => board.form(), (e) => e.code === "SESSION_EXPIRED", "the client names the expiry exactly");
  assert.throws(() => board.submit(), (e) => e.code === "SESSION_EXPIRED", "and stays dead — later calls rethrow the cached code without touching the wire");
  assert.equal(service.sessionCount(), 0, "the expired session was destroyed worker-side");
  assert.equal(registry[0].calls.submit, 0, "no submit ever reached the board");
  assert.equal(service.counters().refused.expired, 1, "exactly one expiry was served — the cached client never re-asked");
});

// ---------------- the client board's terminal honesty ----------------
test("provider: a dead transport kills the board once — the code is cached and the wire is not hammered", () => {
  const service = makeService();
  let calls = 0;
  let down = false;
  const transport = (req) => { calls += 1; if (down) throw new Error("connect ECONNREFUSED 127.0.0.1"); return service.handle(req); };
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport });
  const board = provider.boardFor(POSTING);
  down = true;
  const before = calls;
  assert.throws(() => board.open(), (e) => e.code === "WORKER_UNREACHABLE");
  assert.throws(() => board.answers(), (e) => e.code === "WORKER_UNREACHABLE", "the same code, from the cache");
  assert.equal(calls, before + 1, "exactly one call hit the dead wire; the rest were answered by the cached terminal state");
});

// ---------------- the real wire ----------------
// The service runs in a CHILD PROCESS (tests/helpers/
// board-service-sandbox.cjs): the synchronous transport blocks the
// calling thread on Atomics.wait by design, so its server can never
// share this process's event loop — the production topology, not a
// shortcut.
const { spawn } = require("node:child_process");
async function spawnBoardService() {
  const child = spawn(process.execPath, [path.join(root, "tests/helpers/board-service-sandbox.cjs"), SECRET], { stdio: ["ignore", "pipe", "pipe"] });
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    child.stdout.on("data", (d) => { buf += d; const m = buf.match(/PORT (\d+)/); if (m) resolve(Number(m[1])); });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (code) => reject(new Error(`board service helper exited early (${code})`)));
    setTimeout(() => reject(new Error("board service helper did not announce a port")), 10000);
  });
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

test("wire: provider + synchronous HTTP transport + the real service over loopback HTTP drives a full 149 submission", async () => {
  const { child, baseUrl } = await spawnBoardService();
  const transport = createSyncHttpTransport({ baseUrl, timeoutMs: 15000 });
  try {
    const provider = Bridge.createWorkerBoardProvider({ workerUrl: baseUrl, secret: SECRET, userId: USER_A, transport });
    const board = Bridge.createCareerBoardFor(provider)(POSTING);
    assert.ok(board, "a board crossed the real wire");
    const { out } = driveThrough149(board);
    assert.equal(out.resultStatus, "completed");
    assert.match(out.submission.confirmationId, /^SBX-\d{4}$/, "the confirmation crossed back over the wire");
    board.close();
    assert.throws(() => board.open(), (e) => e.code === "BOARD_CLOSED", "a closed board stays closed on the client");
    const board2 = provider.boardFor(POSTING);
    assert.ok(board2 && board2.workerSessionId !== board.workerSessionId, "the service keeps vending fresh sessions after a close");
  } finally {
    transport.close();
    child.kill("SIGTERM");
  }
});

test("wire: a service that is not there answers boardFor with WORKER_UNREACHABLE, never a board", async () => {
  const { server } = startBoardService({ port: 0, secret: SECRET, familyVerdicts: VERDICTS, boardFactory: makeFactory(), sweepMs: 0 });
  await new Promise((r) => server.on("listening", r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await new Promise((r) => server.close(r)); // the worker is down before the drive starts
  const transport = createSyncHttpTransport({ baseUrl, timeoutMs: 15000 });
  try {
    const provider = Bridge.createWorkerBoardProvider({ workerUrl: baseUrl, secret: SECRET, userId: USER_A, transport });
    assert.throws(() => provider.boardFor(POSTING), (e) => e.code === "WORKER_UNREACHABLE");
    assert.equal(Bridge.createCareerBoardFor(provider)(POSTING), null, "through the bridge: no board — the loop's BOARD_NOT_WIRED stop");
  } finally {
    transport.close();
  }
});
