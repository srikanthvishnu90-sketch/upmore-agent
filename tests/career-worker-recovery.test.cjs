// WORKER RECOVERY (2026-10-21) — the WORKER_UNREACHABLE fix, proven at
// the seams the build owns. Root-cause note:
// docs/career/worker-unreachable-root-cause-2026-10-21.md.
//   - provider session-CREATE retry: ONLY the WORKER_UNREACHABLE class,
//     bounded (attempts, backoff ladder, total deadline) — proven with a
//     scripted transport AND by fault injection over the real HTTP stack
//     (a flaked create recovers; the session then drives end to end);
//   - deterministic refusals (FAMILY_NOT_DRIVEABLE / WORKER_AUTH_REFUSED
//     / SESSION_LIMIT) and WORKER_TRANSPORT_TIMEOUT are attempted
//     exactly once — a refusal is a decision, not a flake;
//   - board CALLS are never retried: a mid-sequence transport flake
//     still terminates the session (the ambiguity boundary, held);
//   - module 150 helper lifecycle: with an idle grace, the last board's
//     close keeps the helper warm and the next board reuses it (same
//     helper process); with grace 0 the helper shuts down on last close
//     (the pre-fix behavior, kept as the control arm).
// Check: node --test tests/career-worker-recovery.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn, execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const Bridge = require(path.join(root, "supabase/functions/_shared/career_task_bridge.js"));
const { createSyncHttpTransport } = require(path.join(root, "workers/career-browser/board-transport.cjs"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

const SECRET = "test-board-secret";
const USER_A = "user-recovery-a";
const POSTING = {
  canonicalKey: "greenhouse:testco1:software-engineering-intern",
  company: "TestCo 1", title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testco1/jobs/1", status: "open", atsFamily: "greenhouse",
};
const unreachable = () => Object.assign(new Error("the career worker board service could not be reached (fetch failed)"), { code: "WORKER_UNREACHABLE" });

// A scripted in-process transport for the provider-level proofs.
function scriptedTransport(script) {
  const calls = [];
  const transport = (req) => {
    calls.push(req.path);
    const step = script[calls.length - 1];
    if (step === "unreachable") throw unreachable();
    if (step === "timeout") throw Object.assign(new Error("the career worker board service did not answer in 120000ms"), { code: "WORKER_TRANSPORT_TIMEOUT" });
    if (step && typeof step === "object") return step;
    if (req.path === "/board-sessions") return { status: 201, body: { sessionId: "a".repeat(32), atsFamily: "greenhouse", host: "boards.greenhouse.io", kind: "browser" } };
    return { status: 200, body: { ok: true, result: { ok: true, captcha: null } } };
  };
  return { transport, calls };
}
const fastRetry = (extra = {}) => Object.assign({
  createRetry: { maxAttempts: 4, baseDelayMs: 100, deadlineMs: 30000 },
  sleepSync: () => {},
}, extra);

// ---------------- create retry: recovers ----------------
test("create retry: two lost creates, third lands — boardFor succeeds, backoff ladder honored", () => {
  const { transport, calls } = scriptedTransport(["unreachable", "unreachable", "ok"]);
  const sleeps = [];
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport,
    createRetry: { maxAttempts: 4, baseDelayMs: 100, deadlineMs: 30000 }, sleepSync: (ms) => sleeps.push(ms) });
  const board = provider.boardFor(POSTING);
  assert.ok(board && board.workerSessionId === "a".repeat(32), "the session was created on the third attempt");
  assert.equal(calls.filter((p) => p === "/board-sessions").length, 3, "exactly three create attempts");
  assert.equal(sleeps.length, 2, "one sleep per retry");
  // ladder: base 100 -> 100, 300, with +/-25% jitter
  assert.ok(sleeps[0] >= 75 && sleeps[0] <= 125, `first backoff on the ladder (got ${sleeps[0]})`);
  assert.ok(sleeps[1] >= 225 && sleeps[1] <= 375, `second backoff on the ladder (got ${sleeps[1]})`);
});

test("create retry: attempts and deadline bound the loop — a dead worker fails named, not forever", () => {
  // max-attempts bound
  const a = scriptedTransport(Array(10).fill("unreachable"));
  const pA = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport: a.transport,
    createRetry: { maxAttempts: 4, baseDelayMs: 1, deadlineMs: 60000 }, sleepSync: () => {} });
  assert.throws(() => pA.boardFor(POSTING), (e) => e.code === "WORKER_UNREACHABLE");
  assert.equal(a.calls.length, 4, "exactly maxAttempts creates were tried");
  // deadline bound: fake clock advanced only by the recorded sleeps
  let clock = 0; const slept = [];
  const b = scriptedTransport(Array(10).fill("unreachable"));
  const pB = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport: b.transport,
    createRetry: { maxAttempts: 8, baseDelayMs: 1000, deadlineMs: 1500 }, now: () => clock, sleepSync: (ms) => { slept.push(ms); clock += ms; } });
  assert.throws(() => pB.boardFor(POSTING), (e) => e.code === "WORKER_UNREACHABLE");
  assert.ok(b.calls.length <= 3, `the deadline stopped the retries (attempts=${b.calls.length})`);
  assert.ok(slept.reduce((x, y) => x + y, 0) <= 1500, "total slept never exceeds the deadline");
});

// ---------------- create retry: never retries decisions ----------------
test("create retry: deterministic refusals are attempted exactly once", () => {
  const cases = [
    [{ status: 403, body: { error: "FAMILY_NOT_DRIVEABLE" } }, "FAMILY_NOT_DRIVEABLE"],
    [{ status: 403, body: { error: "DRIVER_HOST_REFUSED" } }, "DRIVER_HOST_REFUSED"],
    [{ status: 401, body: { error: "unauthorized" } }, "WORKER_AUTH_REFUSED"],
    [{ status: 409, body: { error: "SESSION_LIMIT" } }, "SESSION_LIMIT"],
  ];
  for (const [resp, code] of cases) {
    const { transport, calls } = scriptedTransport([resp, resp, resp]);
    const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport, ...fastRetry() });
    assert.throws(() => provider.boardFor(POSTING), (e) => e.code === code, `${code} surfaces unchanged`);
    assert.equal(calls.length, 1, `${code} was attempted exactly once`);
  }
});

test("create retry: WORKER_TRANSPORT_TIMEOUT is attempted exactly once", () => {
  const { transport, calls } = scriptedTransport(["timeout", "timeout"]);
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport, ...fastRetry() });
  assert.throws(() => provider.boardFor(POSTING), (e) => e.code === "WORKER_TRANSPORT_TIMEOUT");
  assert.equal(calls.length, 1, "a timeout already waited out the transport budget — never re-asked");
});

// ---------------- fault injection over the real HTTP stack ----------------
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

test("fault injection (real wire): a flaked session create recovers and the session drives end to end", async () => {
  const { child, baseUrl } = await spawnBoardService();
  const real = createSyncHttpTransport({ baseUrl, timeoutMs: 15000 });
  let createPosts = 0;
  const flaky = (req) => {
    if (req.path === "/board-sessions") { createPosts += 1; if (createPosts === 1) throw unreachable(); }
    return real(req);
  };
  try {
    const provider = Bridge.createWorkerBoardProvider({ workerUrl: baseUrl, secret: SECRET, userId: USER_A, transport: flaky,
      createRetry: { maxAttempts: 4, baseDelayMs: 10, deadlineMs: 5000 }, sleepSync: () => {} });
    const board = provider.boardFor(POSTING);
    assert.ok(board && /^[a-f0-9]{32}$/.test(board.workerSessionId), "a real session crossed the wire after the flake");
    assert.equal(createPosts, 2, "the create was re-asked exactly once");
    assert.deepEqual(board.open(), { ok: true, captcha: null }, "the recovered session opens");
    const form = board.form();
    assert.ok(form && Array.isArray(form.fields) && form.fields.length > 0, "the recovered session serves its form");
    board.close();
  } finally { real.close(); child.kill("SIGTERM"); }
});

test("fault injection (real wire): a flaked board CALL still terminates the session — calls are never retried", async () => {
  const { child, baseUrl } = await spawnBoardService();
  const real = createSyncHttpTransport({ baseUrl, timeoutMs: 15000 });
  let callPosts = 0;
  const flaky = (req) => {
    if (/\/call$/.test(req.path)) { callPosts += 1; if (callPosts === 1) throw unreachable(); }
    return real(req);
  };
  try {
    const provider = Bridge.createWorkerBoardProvider({ workerUrl: baseUrl, secret: SECRET, userId: USER_A, transport: flaky, ...fastRetry() });
    const board = provider.boardFor(POSTING);
    assert.throws(() => board.open(), (e) => e.code === "WORKER_UNREACHABLE", "the flaked call surfaces as-is");
    assert.throws(() => board.answers(), (e) => e.code === "WORKER_UNREACHABLE", "the terminal code is cached");
    assert.equal(callPosts, 1, "exactly one call reached the wire — no silent re-drive of an ambiguous call");
    board.close();
  } finally { real.close(); child.kill("SIGTERM"); }
});

// ---------------- module 150 helper lifecycle (real Chromium) ----------------
// The fixture server lives in its own process (150's sync bridge blocks
// this process's event loop while a command is in flight — BUG-045).
let fixtureProc, fixtureBase;
before(async () => {
  // The helper's Chromium cannot sandbox as root on this host — the
  // same operator env the board service unit carries.
  if (!process.env.UPMORE_CHROMIUM_SANDBOX) process.env.UPMORE_CHROMIUM_SANDBOX = "off";
  fixtureProc = spawn(process.execPath, [path.join(__dirname, "fixtures", "portal-fixture-server.cjs")], { stdio: ["ignore", "pipe", "inherit"] });
  fixtureBase = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("fixture server did not report a port in 15s")), 15000);
    fixtureProc.stdout.on("data", (d) => { buf += d; const m = buf.match(/FIXTURE_PORT (\d+)/); if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); } });
  });
});
after(() => { try { fixtureProc && fixtureProc.kill("SIGTERM"); } catch (_) {} });

test("150 lifecycle: last-close keeps the helper warm inside the grace; the next board reuses it", { timeout: 180000 }, async () => {
  const seamTmp = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-worker-recovery-seam-"));
  process.env.UPMORE_SEAM_TMP = seamTmp;
  const helperPids = () => {
    try { return execFileSync("pgrep", ["-f", `portal-browser-helper.cjs ${seamTmp}`], { encoding: "utf8" }).trim().split("\n").filter(Boolean); }
    catch (_) { return []; }
  };
  const waitFor = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 200)); } return fn(); };
  const url = `${fixtureBase}/gh-form`;
  try {
    // Control arm — grace 0 reproduces the pre-fix behavior: the last
    // close shuts the helper down.
    BrowserBoard.setHelperIdleGraceMs(0);
    const a = BrowserBoard.createBrowserBoard({ url, userId: "user-recovery-150" });
    a.open();
    assert.equal(helperPids().length, 1, "one helper is running for board A");
    a.close();
    assert.ok(await waitFor(() => helperPids().length === 0, 8000), "grace 0: the helper shut down on last close (pre-fix behavior)");

    // Grace arm — the helper survives the last close and is reused.
    BrowserBoard.setHelperIdleGraceMs(60000);
    const b = BrowserBoard.createBrowserBoard({ url, userId: "user-recovery-150" });
    b.open();
    const warm = helperPids();
    assert.equal(warm.length, 1, "one helper is running for board B");
    b.close();
    await new Promise((r) => setTimeout(r, 1500));
    assert.deepEqual(helperPids(), warm, "inside the grace the helper is still alive after the last close");
    const c = BrowserBoard.createBrowserBoard({ url, userId: "user-recovery-150" });
    c.open();
    assert.deepEqual(helperPids(), warm, "board C reused the warm helper — no respawn");
    c.close();
  } finally {
    BrowserBoard.shutdownAll();
    await waitFor(() => helperPids().length === 0, 8000);
    delete process.env.UPMORE_SEAM_TMP;
    BrowserBoard.setHelperIdleGraceMs(90000);
  }
});
