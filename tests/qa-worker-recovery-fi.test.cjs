// QA LANE independent fault injection for the WORKER_UNREACHABLE fix
// @ fc1ccd31 — written by QA, not by the build lane. Ported from
// qa/worker-recovery-076712eb @c0603560; ONLY the ladder expectations
// were adapted to the new production defaults (0.75/1.5/3s, x2).
// Goes beyond the
// shipped suite (tests/career-worker-recovery.test.cjs) where feasible:
//   A1 DEFAULT-config recovery: unreachable x2 then success using the
//      bridge's OWN defaults (no injected retry config) — real wall
//      clock must show the 0.75s/1.5s ladder actually slept (>= ~1.6s total).
//   A2 DEFAULT-config exhaustion: unreachable x10 -> exactly 4 create
//      attempts, error surfaces as WORKER_UNREACHABLE.
//   A3 Deadline bound with a virtual clock whose time advances ONLY via
//      real elapsed create time + sleeps: attempts stop at deadline.
//   A4 Refusal (SESSION_LIMIT) + WORKER_TRANSPORT_TIMEOUT under DEFAULT
//      config: exactly 1 attempt each. (Duplicates shipped-suite intent
//      but under default config, not the fast injected config.)
//   A5 Flaked non-create board call (scripted): exactly 1 wire attempt,
//      terminal code cached, no re-drive.
//   B1 Serial create->open->close x3, grace 60s (module 150, real
//      Chromium): exactly ONE distinct helper PID across all 3 boards.
//   B2 Same serial pattern, grace 0 (control): helper dies after every
//      close -> 3 distinct helper PIDs (the pre-fix respawn storm).
//   B3 Dead-helper respawn: helper SIGKILLed externally mid-flight; the
//      next board create succeeds on a NEW helper PID.
//   B4 Exit-listener leak: process 'exit' listener count does not grow
//      across the B1-B3 spawn churn (once-per-factory registration).
// Check: node --test tests/qa-worker-recovery-fi.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn, execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const Bridge = require(path.join(root, "supabase/functions/_shared/career_task_bridge.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

const SECRET = "qa-test-board-secret";
const USER_A = "user-qa-recovery";
const POSTING = {
  canonicalKey: "greenhouse:testco1:software-engineering-intern",
  company: "TestCo 1", title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testco1/jobs/1", status: "open", atsFamily: "greenhouse",
};
const unreachable = () => Object.assign(new Error("the career worker board service could not be reached (fetch failed)"), { code: "WORKER_UNREACHABLE" });

function scriptedTransport(script) {
  const calls = [];
  const transport = (req) => {
    calls.push(req.path);
    const step = script[calls.length - 1];
    if (step === "unreachable") throw unreachable();
    if (step === "timeout") throw Object.assign(new Error("the career worker board service did not answer in 120000ms"), { code: "WORKER_TRANSPORT_TIMEOUT" });
    if (step && typeof step === "object") return step;
    if (req.path === "/board-sessions") return { status: 201, body: { sessionId: "b".repeat(32), atsFamily: "greenhouse", host: "boards.greenhouse.io", kind: "browser" } };
    return { status: 200, body: { ok: true, result: { ok: true, captcha: null } } };
  };
  return { transport, calls };
}

// ---------- A: provider create-retry seams, DEFAULT config ----------
test("A1 default config: unreachable x2 then success recovers; real ladder sleeps are visible on the wall clock", { timeout: 60000 }, () => {
  const { transport, calls } = scriptedTransport(["unreachable", "unreachable", "ok"]);
  // NO createRetry, NO sleepSync injection -> production defaults.
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport });
  const t0 = Date.now();
  const board = provider.boardFor(POSTING);
  const elapsed = Date.now() - t0;
  assert.ok(board && board.workerSessionId === "b".repeat(32));
  assert.equal(calls.filter((p) => p === "/board-sessions").length, 3, "3 create attempts");
  // ladder (fc1ccd31, x2): 750*jitter(0.75..1.25) + 1500*jitter = 1687.5..2812.5ms total
  assert.ok(elapsed >= 1600, `default ladder actually slept (elapsed=${elapsed}ms, expect ~1687-2812)`);
  assert.ok(elapsed <= 6000, `default ladder is bounded (elapsed=${elapsed}ms)`);
});

test("A2 default config: persistent unreachable exhausts at exactly 4 attempts and fails named", { timeout: 60000 }, () => {
  const { transport, calls } = scriptedTransport(Array(10).fill("unreachable"));
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport });
  const t0 = Date.now();
  assert.throws(() => provider.boardFor(POSTING), (e) => e.code === "WORKER_UNREACHABLE");
  const elapsed = Date.now() - t0;
  assert.equal(calls.length, 4, "exactly maxAttempts=4 creates");
  // full default ladder slept (fc1ccd31, x2): 0.75s + 1.5s + 3s (jittered) = 3937.5..6562.5ms
  assert.ok(elapsed >= 3800 && elapsed <= 10000, `full ladder slept before giving up (elapsed=${elapsed}ms)`);
});

test("A3 deadline bound: retries stop at the 30s-class deadline even with attempts to spare", () => {
  let clock = 0; const slept = [];
  const { transport, calls } = scriptedTransport(Array(20).fill("unreachable"));
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport,
    createRetry: { maxAttempts: 8, baseDelayMs: 1000, deadlineMs: 30000 }, now: () => clock, sleepSync: (ms) => { slept.push(ms); clock += ms; } });
  assert.throws(() => provider.boardFor(POSTING), (e) => e.code === "WORKER_UNREACHABLE");
  assert.ok(calls.length < 8, `deadline stopped retries before maxAttempts (attempts=${calls.length})`);
  assert.ok(slept.reduce((x, y) => x + y, 0) <= 30000, "total slept never exceeds the deadline");
});

test("A4 default config: SESSION_LIMIT refusal and WORKER_TRANSPORT_TIMEOUT each attempted exactly once", () => {
  const r = scriptedTransport([{ status: 409, body: { error: "SESSION_LIMIT" } }, "ok"]);
  const pR = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport: r.transport });
  assert.throws(() => pR.boardFor(POSTING), (e) => e.code === "SESSION_LIMIT");
  assert.equal(r.calls.length, 1, "refusal attempted exactly once under default config");
  const t = scriptedTransport(["timeout", "ok"]);
  const pT = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport: t.transport });
  assert.throws(() => pT.boardFor(POSTING), (e) => e.code === "WORKER_TRANSPORT_TIMEOUT");
  assert.equal(t.calls.length, 1, "timeout attempted exactly once under default config");
});

test("A5 flaked non-create board call is NOT retried (scripted wire count)", () => {
  const calls = [];
  const transport = (req) => {
    calls.push(req.path);
    if (req.path === "/board-sessions") return { status: 201, body: { sessionId: "c".repeat(32), atsFamily: "greenhouse", host: "boards.greenhouse.io", kind: "browser" } };
    throw unreachable();
  };
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport });
  const board = provider.boardFor(POSTING);
  assert.throws(() => board.open(), (e) => e.code === "WORKER_UNREACHABLE");
  assert.throws(() => board.form(), (e) => e.code === "WORKER_UNREACHABLE", "terminal code cached after the flaked call");
  assert.equal(calls.filter((p) => /\/call$/.test(p)).length, 1, "exactly one board call reached the wire");
});

// ---------- B: module 150 serial lifecycle, real Chromium ----------
let fixtureProc, fixtureBase;
before(async () => {
  if (!process.env.UPMORE_CHROMIUM_SANDBOX) process.env.UPMORE_CHROMIUM_SANDBOX = "off";
  fixtureProc = spawn(process.execPath, [path.join(__dirname, "fixtures", "portal-fixture-server.cjs")], { stdio: ["ignore", "pipe", "inherit"] });
  fixtureBase = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("fixture server did not report a port in 15s")), 15000);
    fixtureProc.stdout.on("data", (d) => { buf += d; const m = buf.match(/FIXTURE_PORT (\d+)/); if (m) { clearTimeout(timer); resolve(`http://127.0.0.1:${m[1]}`); } });
  });
});
after(() => { try { fixtureProc && fixtureProc.kill("SIGTERM"); } catch (_) {} });

const seamTmp = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-qa-fi-seam-"));
process.env.UPMORE_SEAM_TMP = seamTmp;
const helperPids = () => {
  try { return execFileSync("pgrep", ["-f", `portal-browser-helper.cjs ${seamTmp}`], { encoding: "utf8" }).trim().split("\n").filter(Boolean); }
  catch (_) { return []; }
};
const waitFor = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 200)); } return fn(); };

test("B1+B2+B3+B4 serial helper lifecycle: grace reuse, grace-0 respawn storm, dead-helper respawn, exit-listener count", { timeout: 300000 }, async () => {
  const url = `${fixtureBase}/gh-form`;
  const exitListenersAtStart = process.listeners("exit").length;
  try {
    // B1: grace arm — 3 serial boards, ONE helper PID total.
    BrowserBoard.setHelperIdleGraceMs(60000);
    const gracePids = new Set();
    for (let i = 0; i < 3; i++) {
      const b = BrowserBoard.createBrowserBoard({ url, userId: "user-qa-150" });
      b.open();
      const pids = helperPids();
      assert.equal(pids.length, 1, `grace arm board ${i}: exactly one helper alive`);
      gracePids.add(pids[0]);
      b.close();
    }
    assert.equal(gracePids.size, 1, `grace arm: 3 serial boards shared ONE helper spawn (distinct=${[...gracePids]})`);
    BrowserBoard.shutdownAll();
    assert.ok(await waitFor(() => helperPids().length === 0, 10000), "shutdownAll reaped the grace helper");

    // B2: control arm — grace 0, helper dies on every last close.
    BrowserBoard.setHelperIdleGraceMs(0);
    const controlPids = new Set();
    for (let i = 0; i < 3; i++) {
      const b = BrowserBoard.createBrowserBoard({ url, userId: "user-qa-150" });
      b.open();
      const pids = helperPids();
      assert.equal(pids.length, 1, `control arm board ${i}: exactly one helper alive`);
      controlPids.add(pids[0]);
      b.close();
      assert.ok(await waitFor(() => helperPids().length === 0, 10000), `control arm board ${i}: helper died on last close`);
    }
    assert.equal(controlPids.size, 3, `control arm: 3 serial boards = 3 distinct helper spawns (distinct=${[...controlPids]})`);

    // B3: dead-helper respawn — kill the helper externally, next board recovers on a new PID.
    BrowserBoard.setHelperIdleGraceMs(60000);
    const d1 = BrowserBoard.createBrowserBoard({ url, userId: "user-qa-150" });
    d1.open();
    const before = helperPids();
    assert.equal(before.length, 1);
    process.kill(Number(before[0]), "SIGKILL");
    assert.ok(await waitFor(() => helperPids().length === 0, 10000), "killed helper is gone from the process table");
    d1.close(); // close against a dead helper must not throw the lane
    const d2 = BrowserBoard.createBrowserBoard({ url, userId: "user-qa-150" });
    d2.open(); // must detect the stale handle and respawn instead of timing out
    const afterKill = helperPids();
    assert.equal(afterKill.length, 1, "a fresh helper spawned after the kill");
    assert.notEqual(afterKill[0], before[0], "respawned helper is a NEW pid");
    d2.close();

    // B4: exit listeners — registered once per factory, not per spawn.
    const exitListenersNow = process.listeners("exit").length;
    assert.ok(exitListenersNow - exitListenersAtStart <= 1,
      `exit listener growth across ${gracePids.size + controlPids.size + 2} spawns: start=${exitListenersAtStart} now=${exitListenersNow}`);
  } finally {
    BrowserBoard.shutdownAll();
    await waitFor(() => helperPids().length === 0, 10000);
    BrowserBoard.setHelperIdleGraceMs(90000);
  }
});
