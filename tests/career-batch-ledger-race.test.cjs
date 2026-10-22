"use strict";
// #11-1 — the cap-ledger race, fail-first (S-2, the hard gate for S-1).
// career_batch_save_ledger_v1 replaces the WHOLE records array
// (migration 20261016010000: upsert set records=excluded.records, no
// lock, no version). The executor's prepare/approve paths both do
// ledgerFor -> run mutates -> saveLedger(whole array). Two executors
// draining two approved batches for the SAME user concurrently read
// the same base, each appends only its own submissions, and the last
// save erases the other's records. The ledger is the CAP SOURCE
// (149 capCheck counts it), so the loss silently re-opens cap room
// the user has already spent — parallel drain without a ledger fix
// defeats the 15/day and 1-per-company caps.
// This suite drives the REAL createBatchExecutor + createBatchRpcStore
// against a fake RPC backend that mirrors the migration's semantics
// (JSON copies in/out, whole-array upsert). A read barrier on
// career_batch_ledger_v1 makes the race deterministic: both approves
// must hold the same base before either may save.
// Check: node --test tests/career-batch-ledger-race.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const { createBatchExecutor, createBatchRpcStore } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));

const USER = "user-ledger-race";
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

function posting(id, company, family) {
  return {
    id, job_id: id, canonicalKey: `${family}:${company.toLowerCase()}:software-engineering-intern`,
    company, role: "Software Engineering Intern", title: "Software Engineering Intern",
    url: family === "lever" ? `https://jobs.lever.co/${company.toLowerCase()}/1` : `https://boards.greenhouse.io/${company.toLowerCase()}/jobs/1`,
    status: "open", atsFamily: family, location: "Chicago, IL", posted_at: "2026-10-10",
    jd_text: "Software engineering intern role. JavaScript, testing, code review, agile team.",
  };
}
const RUN_A_POSTINGS = [posting("JOB-A1", "AlphaCo", "greenhouse"), posting("JOB-A2", "BetaCo", "lever")];
const RUN_B_POSTINGS = [posting("JOB-B1", "GammaCo", "greenhouse"), posting("JOB-B2", "DeltaCo", "lever")];

// ---- fake RPC backend: the migration's semantics, faithfully --------
function makeBackend() {
  const intents = new Map(); // intentId -> {userId, binding, request, state, leaseToken}
  const runs = new Map();    // runId -> record
  const ledgers = new Map(); // userId -> records array (the table row)
  let ledgerBarrier = null;  // {n, arrived, release}
  const hop = () => new Promise((r) => setImmediate(r));
  async function call(name, a) {
    await hop();
    switch (name) {
      case "career_batch_pending_v1": {
        const out = [];
        for (const [intentId, i] of intents) if (i.state === "queued") out.push({ userId: i.userId, intentId, binding: clone(i.binding), request: clone(i.request) });
        return { intents: out };
      }
      case "career_batch_claim_v1": {
        const i = intents.get(a.p_intent);
        if (!i || i.state !== "queued") return { claimed: false };
        i.state = "claimed"; i.leaseToken = "lease-" + a.p_intent;
        return { claimed: true, leaseToken: i.leaseToken, binding: clone(i.binding), request: clone(i.request) };
      }
      case "career_batch_finish_v1": {
        const i = intents.get(a.p_intent);
        if (i) { i.state = a.p_state; i.result = clone(a.p_result); }
        return { finished: true };
      }
      case "career_batch_save_run_v1": { runs.set(a.p_run.runId, clone(a.p_run)); return { saved: true }; }
      case "career_batch_result_v1": { const r = runs.get(a.p_run); return { batch: r ? clone(r) : null }; }
      case "career_batch_ledger_v1": {
        if (ledgerBarrier) {
          const b = ledgerBarrier;
          b.arrived += 1;
          if (b.arrived >= b.n) { ledgerBarrier = null; b.release(); }
          else await b.promise;
        }
        return { records: clone(ledgers.get(a.p_user) || []) };
      }
      case "career_batch_save_ledger_v1": {
        // the migration, verbatim in effect: whole-array replace
        ledgers.set(a.p_user, clone(a.p_records || []));
        return { saved: true };
      }
      default: throw new Error("unexpected RPC " + name);
    }
  }
  return {
    call, intents, runs, ledgers,
    armLedgerBarrier(n) { let release; const promise = new Promise((r) => { release = r; }); ledgerBarrier = { n, arrived: 0, promise, release }; },
    seedIntent(intentId, userId, binding, request) { intents.set(intentId, { userId, binding, request, state: "queued", leaseToken: null }); },
  };
}

function makeExecutor(backend, postingsByFamily) {
  const store = createBatchRpcStore({ call: backend.call });
  return createBatchExecutor({
    store,
    postingsFor: async (userId, familyText) => clone(postingsByFamily[familyText] || []),
    profileFor: async () => ({ profile: PROFILE, profileMaster: MASTER, attestations: ATTEST }),
    boardForFor: () => (p) => Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: p.atsFamily }),
    now: () => NOW,
  });
}

async function prepareRunSeeded(backend, executor, tag, postings) {
  const run = Batch.createRun({ userId: USER, familyText: tag, count: postings.length, now: NOW });
  backend.seedIntent(`intent-prepare-${tag}`, USER,
    { action: "prepare", run_id: run.id, family_text: tag },
    { run: JSON.parse(JSON.stringify(run)) });
  const [byFamily] = [ { [tag]: postings } ];
  void byFamily;
  const res = await executor.runBatchPending();
  const prep = res.find((r) => r.action === "prepare");
  assert.ok(prep && !prep.error, `prepare ${tag} completed: ${JSON.stringify(prep)}`);
  const record = backend.runs.get(run.id);
  assert.ok(record && record.run, `run ${tag} stored`);
  const stored = Batch.restoreRun(clone(record.run));
  assert.equal(stored.summary.doorstep, postings.length, `run ${tag}: all postings reached the doorstep`);
  return { runId: run.id, cardSha256: stored.cardSha256 };
}

test("ledger race: two concurrent approves for one user must BOTH land in the cap ledger", async () => {
  const backend = makeBackend();
  const postingsByFamily = { raceA: RUN_A_POSTINGS, raceB: RUN_B_POSTINGS };
  const E1 = makeExecutor(backend, postingsByFamily);
  const E2 = makeExecutor(backend, postingsByFamily);

  // sequential prepares (the doorstep phase is not where the race is)
  const a = await prepareRunSeeded(backend, E1, "raceA", RUN_A_POSTINGS);
  const b = await prepareRunSeeded(backend, E1, "raceB", RUN_B_POSTINGS);
  assert.equal((backend.ledgers.get(USER) || []).length, 0, "prepares submitted nothing");

  backend.seedIntent("intent-approve-raceA", USER, { action: "approve", run_id: a.runId, card_sha256: a.cardSha256 }, null);
  backend.seedIntent("intent-approve-raceB", USER, { action: "approve", run_id: b.runId, card_sha256: b.cardSha256 }, null);

  // both approves read the ledger before either saves — the production
  // interleaving whenever two drains overlap on one user
  backend.armLedgerBarrier(2);
  const [r1, r2] = await Promise.all([E1.runBatchPending(), E2.runBatchPending()]);

  const approves = [...r1, ...r2].filter((r) => r.action === "approve" && r.status === "completed");
  assert.equal(approves.length, 2, `both approve intents completed: ${JSON.stringify([...r1, ...r2])}`);
  const submittedTotal = approves.reduce((n, r) => n + (r.submitted || 0), 0);
  assert.equal(submittedTotal, 4, "both runs executed their submissions (2 + 2)");

  const records = backend.ledgers.get(USER) || [];
  const submitted = records.filter((r) => r.status === "submitted");
  assert.equal(submitted.length, 4,
    `the cap ledger must hold ALL 4 submissions — it holds ${submitted.length} (${submitted.map((r) => r.company).join(", ")}); ` +
    "the other run's records were erased by the whole-array save, and every cap count downstream now under-reads by the lost amount");
  assert.deepEqual(submitted.map((r) => r.company).sort(), ["AlphaCo", "BetaCo", "DeltaCo", "GammaCo"]);
});
