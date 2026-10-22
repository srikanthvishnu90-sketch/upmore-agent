"use strict";
// BUG-QA-2026-10-21-01 — cold-stack DRIVER_ERROR on board open was
// undiagnosable: the seams' records kept only the code and dropped the
// helper/driver error message. QA's proposed permanent guards:
//   (1) the board-service /call error message survives the whole wire to
//       the provider client, alongside the code;
//   (2) a cold-start regression test: a fresh service's first open works.
// This file additionally pins the two RECORD seams the production prepare
// path keeps — module 155's per-app stop record and the batch executor's
// intent finish record — because a message that reaches the client but is
// dropped from every record is still undiagnosable after the fact.
// Check: node --test tests/career-qa-bug01-wire-message.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const Bridge = require(path.join(root, "supabase/functions/_shared/career_task_bridge.js"));
const { createSyncHttpTransport } = require(path.join(root, "workers/career-browser/board-transport.cjs"));
const { startBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const { createBatchExecutor } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));

const SECRET = "test-board-secret";
const USER = "user-bug01";
const MSG = "cold open exploded: proxy handshake reset (probe-bug01)";

const throwingBoard = () => ({
  kind: "browser", browserDriver: true, sandbox: false, atsFamily: "greenhouse",
  host: "boards.greenhouse.io", contextId: "stub-bug01",
  open() { throw Object.assign(new Error(MSG), { code: "DRIVER_ERROR" }); },
  form() { return { fields: [] }; }, fill() {}, answers() { return {}; },
  atReview() { return { ok: true }; }, submit() {}, close() {},
});
const POSTING = {
  canonicalKey: "greenhouse:testco1:software-engineering-intern",
  company: "TestCo 1", title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testco1/jobs/1", status: "open", atsFamily: "greenhouse",
};

// ---------- leg 1: the /call wire, raw and through the provider ----------
let svc, svcPort;
before(async () => {
  svc = startBoardService({ port: 0, secret: SECRET, boardFactory: () => throwingBoard(), familyVerdicts: { greenhouse: true }, sweepMs: 0 });
  await new Promise((r) => svc.server.on("listening", r));
  svcPort = svc.server.address().port;
});
after(() => { try { svc.server.close(); } catch (_) {} });

function rawReq(p, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const r = http.request({ host: "127.0.0.1", port: svcPort, path: p, method: "POST",
      headers: { "content-type": "application/json", "x-upmore-board-secret": SECRET, "content-length": Buffer.byteLength(data) } },
      (res) => { const c = []; res.on("data", (x) => c.push(x)); res.on("end", () => {
        let b = null; try { b = JSON.parse(Buffer.concat(c).toString("utf8")); } catch (_) {}
        resolve({ status: res.statusCode, body: b }); }); });
    r.on("error", reject); r.end(data);
  });
}

test("wire: /call error body carries code AND bounded message", async () => {
  const s = await rawReq("/board-sessions", { userId: USER, url: POSTING.url });
  assert.equal(s.status, 201);
  const call = await rawReq(`/board-sessions/${s.body.sessionId}/call`, { userId: USER, method: "open", args: [] });
  assert.equal(call.status, 200);
  assert.equal(call.body.ok, false);
  assert.equal(call.body.code, "DRIVER_ERROR");
  assert.ok(typeof call.body.message === "string" && call.body.message.includes("proxy handshake reset"),
    `message must survive the wire, got: ${JSON.stringify(call.body)}`);
  assert.ok(call.body.message.length <= 300, "message is bounded");
  await rawReq(`/board-sessions/${s.body.sessionId}/close`, { userId: USER });
});

test("wire: provider client rethrows code AND message", async () => {
  // The service runs in its OWN process: the sync transport blocks this
  // thread, so an in-process server could never answer it.
  const proc = spawn(process.execPath, [path.join(__dirname, "helpers", "board-service-throwing.cjs"), SECRET], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    const port = await new Promise((resolve, reject) => {
      let buf = ""; const t = setTimeout(() => reject(new Error("throwing service did not report a port")), 20000);
      proc.stdout.on("data", (d) => { buf += d; const m = buf.match(/PORT (\d+)/); if (m) { clearTimeout(t); resolve(Number(m[1])); } });
    });
    const transport = createSyncHttpTransport({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 30000 });
    try {
      const provider = Bridge.createWorkerBoardProvider({ workerUrl: `http://127.0.0.1:${port}`, secret: SECRET, userId: USER, transport });
      const board = provider.boardFor(POSTING);
      assert.throws(() => board.open(), (e) => e.code === "DRIVER_ERROR" && String(e.message).includes("proxy handshake reset"));
    } finally { transport.close(); }
  } finally { proc.kill("SIGTERM"); }
});

// ---------- leg 2: module 155's per-app record keeps the message ----------
test("155 prepare: a board open DRIVER_ERROR stops the app NAMED with its message, never escapes", () => {
  const run = Batch.createRun({ userId: USER, familyText: "test", count: 1, now: 1760000000000 });
  let res;
  assert.doesNotThrow(() => {
    res = Batch.prepareRun(run, {
      postings: [POSTING], profile: { name: "Test Person" }, log: { records: [] },
      boardFor: () => throwingBoard(), now: 1760000000000,
    });
  });
  const app = res.apps[POSTING.canonicalKey];
  assert.ok(app, "the app is recorded");
  assert.equal(app.stage, "stopped");
  assert.ok(app.stop && app.stop.code === "DRIVER_ERROR", `stop code names the failure, got ${JSON.stringify(app.stop)}`);
  assert.ok(String(app.stop.reason || "").includes("proxy handshake reset"),
    `stop reason carries the driver message, got ${JSON.stringify(app.stop)}`);
});

// ---------- leg 3: the executor's intent record keeps the message ----------
test("executor: a prepare crash finishes the intent with code AND bounded message", async () => {
  const finishes = [];
  const store = {
    async pending() {
      const run = Batch.createRun({ userId: USER, familyText: "test", count: 1, now: 1760000000000 });
      return [{ userId: USER, intentId: "intent-bug01", binding: { action: "prepare", run_id: run.id, family_text: "test" }, request: { run } }];
    },
    async claim() { return { ok: true }; },
    async finish(rec) { finishes.push(rec); },
    async saveRun() {}, async readRun() { return null; },
    async ledgerFor() { return { records: [] }; }, async saveLedger() {},
  };
  const exec = createBatchExecutor({
    store,
    postingsFor: async () => { throw Object.assign(new Error(MSG), { code: "DRIVER_ERROR" }); },
    profileFor: async () => ({ profile: { name: "Test Person" } }),
    boardForFor: () => () => throwingBoard(),
    now: () => 1760000000000,
  });
  const results = await exec.runBatchPending();
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].state, "blocked");
  assert.equal(finishes[0].result.code, "DRIVER_ERROR");
  assert.ok(String(finishes[0].result.message || "").includes("proxy handshake reset"),
    `finish record must carry the message, got ${JSON.stringify(finishes[0].result)}`);
  assert.ok(String(finishes[0].result.message || "").length <= 300, "message is bounded");
  assert.ok(String((results[0] || {}).message || "").includes("proxy handshake reset"), "the results entry carries it too");
});

// ---------- leg 4: cold start — a fresh service's FIRST open succeeds ----------
test("cold start: fresh board service (real 150 factory + helper), first fixture open succeeds", { timeout: 240000 }, async () => {
  if (!process.env.UPMORE_CHROMIUM_SANDBOX) process.env.UPMORE_CHROMIUM_SANDBOX = "off";
  const fixture = spawn(process.execPath, [path.join(__dirname, "fixtures", "portal-fixture-server.cjs")], { stdio: ["ignore", "pipe", "inherit"] });
  const fixtureBase = await new Promise((resolve, reject) => {
    let buf = ""; const t = setTimeout(() => reject(new Error("fixture server did not report a port")), 20000);
    fixture.stdout.on("data", (d) => { buf += d; const m = buf.match(/FIXTURE_PORT (\d+)/); if (m) { clearTimeout(t); resolve(`http://localhost:${m[1]}`); } });
  });
  const svcProc = spawn(process.execPath, [path.join(__dirname, "helpers", "board-service-cold-open.cjs"), SECRET],
    { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env } });
  try {
    const port = await new Promise((resolve, reject) => {
      let buf = ""; const t = setTimeout(() => reject(new Error("cold service did not report a port")), 20000);
      svcProc.stdout.on("data", (d) => { buf += d; const m = buf.match(/PORT (\d+)/); if (m) { clearTimeout(t); resolve(Number(m[1])); } });
    });
    const transport = createSyncHttpTransport({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 120000 });
    try {
      const provider = Bridge.createWorkerBoardProvider({ workerUrl: `http://127.0.0.1:${port}`, secret: SECRET, userId: USER, transport });
      const board = provider.boardFor({ ...POSTING, url: `${fixtureBase.replace("localhost", "127.0.0.1")}/gh-form` }); // 127.0.0.1 classifies local_test at the service gate; "localhost" classifies sandbox with no family verdict
      const opened = board.open();
      assert.ok(opened && opened.ok !== false, `first cold open succeeds, got ${JSON.stringify(opened)}`);
      board.close();
    } finally { transport.close(); }
  } finally { svcProc.kill("SIGTERM"); fixture.kill("SIGTERM"); }
});
