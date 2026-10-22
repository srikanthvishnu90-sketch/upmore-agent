"use strict";
// #11-3 prototype shard worker — a separate PROCESS that drains
// per-posting SHARDS of one approved batch, the S-1 shape. Everything
// it persists goes through the REAL createBatchRpcStore (over HTTP
// to the backend server process); execution is the REAL 155
// executeRun on a shard view of the approved parent run (selected /
// approvals / apps / postings filtered to the shard's keys — the
// approval itself was minted once, on the parent, by the real
// approveRun). The only prototype-new code is this loop and the view.
// Drive latency: real portal drives take seconds per posting; the
// sandbox drive is ~ms, so a fixed sync delay (env S1_DRIVE_MS,
// default 0) stands in for it in wall-clock measurements — declared,
// not hidden.
// Usage: node tests/helpers/s1-shard-worker.cjs <backendBaseUrl>
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const { createBatchRpcStore } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));

const baseUrl = process.argv[2];
const DRIVE_MS = Number(process.env.S1_DRIVE_MS || 0);
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

async function call(name, args) {
  const res = await fetch(baseUrl + "/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, args }) });
  const data = await res.json();
  if (!res.ok) { const e = new Error((data && data.error) || ("rpc " + name + " HTTP " + res.status)); e.code = "RPC_HTTP_" + res.status; throw e; }
  return data;
}

function sleepSync(ms) { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, ms); }
function boardFor(posting) {
  const base = Portal.createSandboxBoard({});
  const board = Object.assign({}, base, { atsFamily: posting.atsFamily });
  if (DRIVE_MS > 0) {
    // wrap the drive-touching methods with the declared latency
    for (const m of ["open", "fill", "submit"]) {
      if (typeof board[m] === "function") { const orig = board[m]; board[m] = (...a) => { sleepSync(DRIVE_MS); return orig(...a); }; }
    }
  }
  return board;
}

async function main() {
  const store = createBatchRpcStore({ call });
  let drained = 0;
  for (;;) {
    const intents = await store.pending();
    const shard = intents.find((i) => i.binding && i.binding.action === "shard");
    if (!shard) break;
    const grant = await store.claim({ userId: shard.userId, intentId: shard.intentId });
    if (!grant) continue;
    const { run_id, shard_keys } = shard.binding;
    try {
      const record = await store.readRun({ userId: shard.userId, runId: run_id });
      if (!record || !record.run) throw new Error("parent run not found");
      const parent = Batch.restoreRun(clone(record.run));
      if (!parent || parent.status !== "approved") throw new Error("parent run is not approved");
      const view = clone(parent);
      view.selected = parent.selected.filter((k) => shard_keys.includes(k));
      view.apps = {}; view.postings = {}; view.approvals = {};
      for (const k of view.selected) { view.apps[k] = parent.apps[k]; view.postings[k] = parent.postings[k]; view.approvals[k] = parent.approvals[k]; }
      const log = await store.ledgerFor(shard.userId);
      const baseRecords = (log.records || []).slice();
      const deps = {
        postings: [], profile: PROFILE, profileMaster: MASTER, attestations: ATTEST,
        log, now: NOW, boardFor,
      };
      const out = Batch.executeRun(view, deps);
      // the executor's persistLedger contract, shard edition: append
      // only this shard's new records, through the v2 path
      const delta = (log.records || []).filter((r) => !baseRecords.includes(r));
      if (delta.length) await store.appendLedger(shard.userId, delta);
      await store.finish({ userId: shard.userId, intentId: shard.intentId, state: "completed", result: { ok: out.ok, submitted: view.summary ? view.summary.submitted : 0, shardKeys: shard_keys } });
      drained += 1;
    } catch (e) {
      await store.finish({ userId: shard.userId, intentId: shard.intentId, state: "uncertain", result: { code: "SHARD_EXECUTION_UNCERTAIN", message: String((e && e.message) || e).slice(0, 300) } });
    }
  }
  console.log(JSON.stringify({ worker: process.pid, drained }));
}

main().catch((e) => { console.error(e); process.exit(1); });
