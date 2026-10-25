"use strict";
// #11-3 — S-1 sharding prototype (Tier 2, synthetic only).
// ONE approved batch of 6, planned into 6 per-posting shards, drained
// by separate worker PROCESSES over the real RPC store (HTTP backend
// process) with the real 155 executeRun per shard and the v2 ledger
// append per shard. Two configurations over identical fresh state:
//   serial:   1 worker drains all 6 shards
//   parallel: 2 workers drain concurrently
// Proves the S-1 mechanics end to end: claim-once per shard, every
// shard executed exactly once, the shared cap ledger ends with all 6
// submissions exactly once, and parallel wall-clock beats serial.
// Drive latency: sandbox drives are ~ms; real drives take seconds
// per posting, so workers run with S1_DRIVE_MS=250 of declared
// stand-in latency per drive call. Nothing here is a live drain:
// the ledger migration is a draft, the store is a fake backend, the
// boards are sandboxes, and the flags/caps of the live host are
// untouched by construction (this suite never opens a socket to it).
// Check: node --test tests/career-s1-shard-prototype.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const { createBatchExecutor, createBatchRpcStore } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));

const USER = "user-s1-proto";
const NOW = Date.UTC(2026, 9, 15, 17, 0, 0);
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test",
  phone: "+1 000 555 0100", location: "Chicago, IL",
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

const COMPANIES = ["ShardA", "ShardB", "ShardC", "ShardD", "ShardE", "ShardF"];
function posting(i) {
  const family = i % 2 ? "lever" : "greenhouse";
  const co = COMPANIES[i];
  return {
    id: `JOB-S1-${i}`, job_id: `JOB-S1-${i}`, canonicalKey: `${family}:${co.toLowerCase()}:software-engineering-intern`,
    company: co, role: "Software Engineering Intern", title: "Software Engineering Intern",
    url: family === "lever" ? `https://jobs.lever.co/${co.toLowerCase()}/1` : `https://boards.greenhouse.io/${co.toLowerCase()}/jobs/1`,
    status: "open", atsFamily: family, location: "Chicago, IL", posted_at: "2026-10-10",
    jd_text: "Software engineering intern role. JavaScript, testing, code review, agile team.",
  };
}
const POSTINGS = COMPANIES.map((_, i) => posting(i));

function spawnHelper(script, args, env = {}) {
  const child = spawn(process.execPath, [path.join(root, "tests/helpers", script), ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });
  return { child, out: () => out, err: () => err };
}
function waitExit(h) {
  return new Promise((resolve, reject) => {
    h.child.on("exit", (code) => (code === 0 ? resolve(h.out()) : reject(new Error(`helper exited ${code}: ${h.err()}`))));
    setTimeout(() => reject(new Error("helper timeout: " + h.err())), 90000);
  });
}
async function spawnBackend() {
  const h = spawnHelper("s1-backend-server.cjs", []);
  const port = await new Promise((resolve, reject) => {
    const iv = setInterval(() => { const m = h.out().match(/PORT (\d+)/); if (m) { clearInterval(iv); resolve(Number(m[1])); } }, 25);
    setTimeout(() => { clearInterval(iv); reject(new Error("backend did not announce a port: " + h.err())); }, 10000);
  });
  return { h, baseUrl: `http://127.0.0.1:${port}` };
}
async function rpcCall(baseUrl, name, args) {
  const res = await fetch(baseUrl + "/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, args }) });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error) || "rpc failed");
  return data;
}
async function seedIntent(baseUrl, intentId, userId, binding, request) {
  const res = await fetch(baseUrl + "/seed-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intentId, userId, binding, request }) });
  if (!res.ok) throw new Error("seed failed");
}
async function getState(baseUrl) {
  const res = await fetch(baseUrl + "/state");
  return res.json();
}

async function runScenario(workerCount) {
  const { h: backendProc, baseUrl } = await spawnBackend();
  try {
    const call = (name, args) => rpcCall(baseUrl, name, args);
    const store = createBatchRpcStore({ call });
    const executor = createBatchExecutor({
      store,
      postingsFor: async () => clone(POSTINGS),
      profileFor: async () => ({ profile: PROFILE, profileMaster: MASTER, attestations: ATTEST }),
      boardForFor: () => (p) => Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: p.atsFamily }),
      now: () => NOW,
    });
    // one batch: prepare all 6 to the doorstep through the real executor
    const run = Batch.createRun({ userId: USER, familyText: "s1proto", count: 6, now: NOW });
    await seedIntent(baseUrl, "intent-prepare-s1", USER, { action: "prepare", run_id: run.id, family_text: "s1proto" }, { run: JSON.parse(JSON.stringify(run)) });
    const [prep] = await executor.runBatchPending();
    assert.equal(prep.status, "completed", `prepare completed: ${JSON.stringify(prep)}`);
    // approve the parent ONCE (the real approveRun mints the ref)
    const record = await store.readRun({ userId: USER, runId: run.id });
    const parent = Batch.restoreRun(clone(record.run));
    assert.equal(parent.summary.doorstep, 6, "all 6 at the doorstep");
    const ap = Batch.approveRun(parent, { approvedByUser: true, now: NOW, userId: parent.userId, profileSha256: parent.profileSha256 });
    assert.ok(ap.ok, "parent approved");
    await store.saveRun({ version: record.version, runId: parent.id, userId: USER, status: parent.status, run: Batch.serializeRun(parent), summary: parent.summary, updatedAt: new Date(NOW).toISOString() });
    // the planner: per-posting shards of the one approved batch
    assert.equal(parent.selected.length, 6);
    for (let i = 0; i < parent.selected.length; i++) {
      await seedIntent(baseUrl, `intent-shard-${i}`, USER, { action: "shard", run_id: parent.id, shard_keys: [parent.selected[i]] }, null);
    }
    // drain
    const t0 = Date.now();
    const workers = [];
    for (let w = 0; w < workerCount; w++) workers.push(spawnHelper("s1-shard-worker.cjs", [baseUrl], { S1_DRIVE_MS: "250" }));
    const outputs = await Promise.all(workers.map(waitExit));
    const wallMs = Date.now() - t0;
    const reports = outputs.map((o) => JSON.parse(o.trim().split("\n").pop()));
    const drained = reports.map((r) => r.drained);
    const stubCalls = reports.reduce((n, r) => n + (r.stubCalls || 0), 0);
    const stubMs = reports.reduce((n, r) => n + (r.stubMs || 0), 0);
    const state = await getState(baseUrl);
    return { wallMs, drained, stubCalls, stubMs, state };
  } finally {
    backendProc.child.kill();
  }
}

function assertConsistent(scenario, label) {
  const submitted = ((scenario.state.ledgers[USER] || []).filter((r) => r.status === "submitted"));
  assert.equal(submitted.length, 6, `${label}: the cap ledger holds all 6 submissions`);
  assert.equal(new Set(submitted.map((r) => `${r.canonicalKey}|${r.confirmationId}`)).size, 6, `${label}: each exactly once`);
  assert.deepEqual(submitted.map((r) => r.company).sort(), [...COMPANIES].sort(), `${label}: every company submitted`);
  const shards = Object.entries(scenario.state.intents).filter(([id]) => id.startsWith("intent-shard-"));
  assert.equal(shards.length, 6, `${label}: 6 shard intents`);
  for (const [id, i] of shards) assert.equal(i.state, "completed", `${label}: ${id} completed (not uncertain, not double-claimed)`);
  assert.equal(shards.reduce((n, [, i]) => n + (i.result.submitted || 0), 0), 6, `${label}: shard results sum to the batch total`);
  assert.equal(scenario.drained.reduce((a, b) => a + b, 0), 6, `${label}: workers drained exactly the 6 shards`);
}

test("S-1 prototype: one approved batch, sharded per posting, drained in parallel — consistent ledger, faster wall", async () => {
  const serial = await runScenario(1);
  assertConsistent(serial, "serial");
  const parallel = await runScenario(2);
  console.log(`S-1 walls: serial ${serial.wallMs}ms (1 worker, drained ${serial.drained.join("+")}) -> parallel ${parallel.wallMs}ms (2 workers, drained ${parallel.drained.join("+")})`);
  assertConsistent(parallel, "parallel");
  assert.ok(parallel.drained.every((d) => d >= 1), `both workers carried shards (drained ${parallel.drained.join(" + ")})`);
  // STUB ENGAGEMENT GATE — asserted BEFORE any wall is trusted. The
  // first version of the worker's sleep passed the delay as
  // Atomics.wait's expected-value argument, so the stub never slept
  // and two "passing" wall comparisons were overhead noise
  // (retracted 2026-10-22). Workers now measure and report their
  // stubbed time; unless the measured stub time covers at least one
  // 250ms call per shard (at 80% timing tolerance), this test fails
  // HERE and the walls below mean nothing.
  for (const [label, s] of [["serial", serial], ["parallel", parallel]]) {
    assert.ok(s.stubCalls >= 6, `${label}: the drive stub engaged on every shard (${s.stubCalls} stubbed calls)`);
    assert.ok(s.stubMs >= 6 * 250 * 0.8, `${label}: measured stub time ${s.stubMs}ms proves the latency was real (expected >= ${6 * 250 * 0.8}ms across 6 shards)`);
  }
  assert.ok(parallel.wallMs < serial.wallMs * 0.8,
    `parallel wall ${parallel.wallMs}ms must beat serial ${serial.wallMs}ms by >20% (same work, same measured drive latency)`);
});
