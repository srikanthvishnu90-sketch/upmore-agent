// FR-395 RENDERED-VALUES CARRIAGE (2026-10-21) — module 149's
// answer-observation escape hatch accepts a fill when the board's
// RENDERED value confirms it (149: board.renderedValues[field]). On
// the production path the board lives behind the board service, and
// rendered values never crossed the wire, so the hatch could never
// fire and correct fills were rejected on vocabulary alone (the
// dropdown-measure lane's finding: "United States" filled, "+1"
// read back -> ANSWER_OBSERVATION_MISMATCH). Proven here:
//   - protocol: the service carries a renderedValues snapshot on call
//     responses; the provider board merges and exposes them;
//   - end to end over the real wire (service child process + sync
//     pump transport + real provider + module 149): a fill confirmed
//     by its rendering reaches the doorstep, and the hatch's use is
//     recorded in the run record (answer_observation_rendered,
//     hatch_only true);
//   - negative control: a board whose readback disagrees with BOTH
//     the fact and its own rendering still stops as drift.
// Check: node --test tests/career-rendered-values.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Bridge = require(path.join(root, "supabase/functions/_shared/career_task_bridge.js"));
const { createBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));
const { createSyncHttpTransport } = require(path.join(root, "workers/career-browser/board-transport.cjs"));

const SECRET = "test-board-secret";
const USER_A = "user-rendered-a";
const NOW = Date.UTC(2026, 9, 15, 17, 0, 0);
const POSTING = {
  canonicalKey: "greenhouse:testco1:software-engineering-intern",
  company: "TestCo 1", title: "Software Engineering Intern",
  url: "https://boards.greenhouse.io/testco1/jobs/1", status: "open", atsFamily: "greenhouse",
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

// ---------------- protocol (in-process service core) ----------------
test("protocol: renderedValues ride the service's call responses and surface on the provider board", () => {
  const rendered = {};
  const inner = Portal.createSandboxBoard({});
  const boardDouble = Object.assign({}, inner, { atsFamily: "greenhouse" });
  Object.defineProperty(boardDouble, "renderedValues", { enumerable: true, get: () => Object.assign({}, rendered) });
  boardDouble.fill = (id, v) => { const r = inner.fill(id, v); if (id === "country") rendered[id] = "+1"; return r; };
  const service = createBoardService({ secret: SECRET, familyVerdicts: { greenhouse: true }, boardFactory: () => boardDouble });
  const transport = (req) => service.handle(req);
  // raw wire shape: the create + a fill call
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport });
  const board = provider.boardFor(POSTING);
  assert.deepEqual(board.renderedValues, {}, "no renderings before any fill");
  board.open();
  board.fill("country", "United States");
  assert.deepEqual(board.renderedValues, { country: "+1" }, "the provider board exposes the service-side rendering after the fill");
  // and the raw response body itself carries the snapshot
  const direct = service.handle({ method: "POST", path: `/board-sessions/${board.workerSessionId}/call`,
    headers: { "x-upmore-board-secret": SECRET }, body: { userId: USER_A, method: "answers", args: [] } });
  assert.deepEqual(direct.body.renderedValues, { country: "+1" }, "the wire body carries renderedValues");
  board.close();
});

test("protocol: a board without renderings omits the field — provider board reads empty, 149 falls back to the fact", () => {
  const service = createBoardService({ secret: SECRET, familyVerdicts: { greenhouse: true },
    boardFactory: (opts) => Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: "greenhouse" }) });
  const provider = Bridge.createWorkerBoardProvider({ workerUrl: "http://127.0.0.1", secret: SECRET, userId: USER_A, transport: (req) => service.handle(req) });
  const board = provider.boardFor(POSTING);
  board.open();
  board.fill("full_name", "Alex Testcase (TEST)");
  assert.deepEqual(board.renderedValues, {}, "sandbox boards render nothing; the getter is an empty map, never undefined");
  board.close();
});

// ---------------- end to end over the real wire ----------------
async function spawnRenderingService(mode) {
  const child = spawn(process.execPath, [path.join(root, "tests/helpers/board-service-rendering.cjs"), SECRET],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, RENDER_MODE: mode } });
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    child.stdout.on("data", (d) => { buf += d; const m = buf.match(/PORT (\d+)/); if (m) resolve(Number(m[1])); });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (code) => reject(new Error(`rendering board service exited early (${code})`)));
    setTimeout(() => reject(new Error("rendering board service did not announce a port")), 10000);
  });
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

function prepareThrough149(board) {
  const log = { records: [] };
  const session = Portal.createPortalSession({ userId: USER_A, board });
  const prep = Portal.runApply(session, { posting: POSTING, profile: PROFILE, log, userId: USER_A, now: NOW, attestations: ATTEST });
  return { prep, log };
}

test("e2e (real wire): a fill confirmed by its rendering is accepted via the hatch and the use is recorded", async () => {
  const { child, baseUrl } = await spawnRenderingService("consistent");
  const transport = createSyncHttpTransport({ baseUrl, timeoutMs: 15000 });
  try {
    const provider = Bridge.createWorkerBoardProvider({ workerUrl: baseUrl, secret: SECRET, userId: USER_A, transport });
    const board = provider.boardFor(POSTING);
    const { prep } = prepareThrough149(board);
    assert.equal(prep.resultStatus, "prepared", `the run reached the doorstep instead of stopping: ${JSON.stringify(prep.stepLog || prep).slice(0, 400)}`);
    assert.ok(prep.doorstep && prep.doorstep.payloadSha256, "a hash-bound doorstep was prepared");
    const hatch = (prep.stepLog || []).find((s) => s.action === "answer_observation_rendered" && s.field_id === "country");
    assert.ok(hatch, "the run record shows the hatch was consulted for the country field");
    assert.equal(hatch.matched, true, "the rendered value matched the readback");
    assert.equal(hatch.hatch_only, true, "the acceptance was hatch-only: the raw fact ('United States') alone would have mismatched the readback ('+1')");
    board.close();
  } finally { transport.close(); child.kill("SIGTERM"); }
});

test("e2e (real wire) negative control: readback drift from BOTH fact and rendering still stops the run", async () => {
  const { child, baseUrl } = await spawnRenderingService("drift");
  const transport = createSyncHttpTransport({ baseUrl, timeoutMs: 15000 });
  try {
    const provider = Bridge.createWorkerBoardProvider({ workerUrl: baseUrl, secret: SECRET, userId: USER_A, transport });
    const board = provider.boardFor(POSTING);
    const { prep } = prepareThrough149(board);
    assert.equal(prep.resultStatus, "blocked", "a drifted readback never reaches the doorstep");
    assert.equal(prep.code, "ANSWER_OBSERVATION_MISMATCH",
      `the stop is the observation mismatch: ${JSON.stringify(prep).slice(0, 300)}`);
    board.close();
  } finally { transport.close(); child.kill("SIGTERM"); }
});
