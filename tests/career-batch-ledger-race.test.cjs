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
  let backendMutex = Promise.resolve(); // the v2 advisory lock, modeled
  let backendV2 = false;     // the v2 RPC exists only once the owner-run draft migration is applied; tests opt in
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
          // cyclic: readers release in waves of n, so a long drain
          // interleaves deterministically without deadlocking on a
          // wave that can never fill (2 executors => at most 2 reads
          // in flight at once)
          const b = ledgerBarrier;
          b.arrived += 1;
          if (b.arrived >= b.n) {
            b.arrived = 0;
            const rel = b.release;
            b.promise = new Promise((r) => { b.release = r; });
            rel();
          } else await b.promise;
        }
        return { records: clone(ledgers.get(a.p_user) || []) };
      }
      case "career_batch_save_ledger_v1": {
        // the migration, verbatim in effect: whole-array replace
        ledgers.set(a.p_user, clone(a.p_records || []));
        return { saved: true };
      }
      case "career_batch_append_ledger_v2": {
        if (!backendV2) { const e = new Error("Could not find the function public.career_batch_append_ledger_v2 in the schema cache"); e.code = "PGRST202"; throw e; }
        // the DRAFT v2 RPC (migration 20261022010000): appends merge
        // under the per-user advisory lock — modeled here as a mutex
        // chain — deduplicated by confirmation identity.
        const run = async () => {
          const cur = ledgers.get(a.p_user) || [];
          const keyOf = (r) => `${r.canonicalKey}|${r.confirmationId || r.timestamp}`; // canonicalKey + confirmation: an employer string alone is not an identity
          const seen = new Set(cur.map(keyOf));
          const merged = cur.slice();
          for (const rec of a.p_records || []) {
            const k = keyOf(rec);
            if (!seen.has(k)) { seen.add(k); merged.push(clone(rec)); }
          }
          ledgers.set(a.p_user, merged);
          return { records: clone(merged), appended: merged.length - cur.length };
        };
        backendMutex = backendMutex.then(run, run);
        return backendMutex;
      }
      default: throw new Error("unexpected RPC " + name);
    }
  }
  return {
    call, intents, runs, ledgers,
    get v2() { return backendV2; }, set v2(v) { backendV2 = !!v; },
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

test("ledger race (v1 semantics — today's live project): concurrent approves LOSE records", async () => {
  // CHARACTERIZATION of the defect, kept executable forever: on a
  // project without the v2 append (the live project today), two
  // concurrent approves execute 4 submissions and the cap ledger ends
  // holding 2. Written fail-first: against the pre-fix executor this
  // scenario was asserted at its correct end state (4) and failed
  // with exactly this loss (2). If this test ever flips, the v1 path
  // changed — re-derive the guard before trusting it.
  const backend = await twoRunRace(false);
  const submitted = (backend.ledgers.get(USER) || []).filter((r) => r.status === "submitted");
  assert.equal(submitted.length, 2,
    `v1 whole-array saves must demonstrably lose one run's records (got ${submitted.length}: ${submitted.map((r) => r.company).join(", ")}); ` +
    "if this fails, the fallback path stopped reproducing the production race and this suite's evidence is void");
});

// ---------------- #11-2: the v2 append path under the same race -----
async function twoRunRace(useV2) {
  const backend = makeBackend();
  backend.v2 = useV2; // false = the pre-migration project (v2 RPC absent)
  const postingsByFamily = { raceA: RUN_A_POSTINGS, raceB: RUN_B_POSTINGS };
  const E1 = makeExecutor(backend, postingsByFamily);
  const E2 = makeExecutor(backend, postingsByFamily);
  const a = await prepareRunSeeded(backend, E1, "raceA", RUN_A_POSTINGS);
  const b = await prepareRunSeeded(backend, E1, "raceB", RUN_B_POSTINGS);
  backend.seedIntent("intent-approve-raceA", USER, { action: "approve", run_id: a.runId, card_sha256: a.cardSha256 }, null);
  backend.seedIntent("intent-approve-raceB", USER, { action: "approve", run_id: b.runId, card_sha256: b.cardSha256 }, null);
  backend.armLedgerBarrier(2);
  const [r1, r2] = await Promise.all([E1.runBatchPending(), E2.runBatchPending()]);
  const approves = [...r1, ...r2].filter((r) => r.action === "approve" && r.status === "completed");
  assert.equal(approves.length, 2, "both approves completed");
  assert.equal(approves.reduce((n, r) => n + (r.submitted || 0), 0), 4, "2 + 2 submitted");
  return backend;
}

test("ledger fix: with the v2 append live, the same race loses NOTHING", async () => {
  const backend = await twoRunRace(true);
  const submitted = (backend.ledgers.get(USER) || []).filter((r) => r.status === "submitted");
  assert.equal(submitted.length, 4, "all 4 submissions recorded exactly once");
  assert.deepEqual(submitted.map((r) => r.company).sort(), ["AlphaCo", "BetaCo", "DeltaCo", "GammaCo"]);
  assert.equal(new Set(submitted.map((r) => `${r.canonicalKey}|${r.confirmationId}`)).size, 4, "no duplicate records (identity = opening + confirmation)");
});

test("ledger fallback: without the v2 RPC the executor still completes (v1 behavior, never worse)", async () => {
  // sequential drains on an un-migrated project behave exactly as
  // today; the fallback exists so the executor change can ship ahead
  // of the owner-run migration without breaking the live drain.
  const backend = makeBackend(); // v2 absent by default
  const E = makeExecutor(backend, { raceA: RUN_A_POSTINGS, raceB: RUN_B_POSTINGS });
  const a = await prepareRunSeeded(backend, E, "raceA", RUN_A_POSTINGS);
  backend.seedIntent("intent-approve-raceA", USER, { action: "approve", run_id: a.runId, card_sha256: a.cardSha256 }, null);
  const [r] = await E.runBatchPending();
  assert.equal(r.status, "completed");
  assert.equal(r.submitted, 2);
  assert.equal((backend.ledgers.get(USER) || []).filter((x) => x.status === "submitted").length, 2, "the v1 save still landed the records sequentially");
});

test("concurrency guard: 4 runs x 2 postings across 2 executors — zero lost, zero dup, counts exact", async () => {
  const backend = makeBackend();
  backend.v2 = true;
  const sets = {
    gA: [posting("JOB-G1", "NorthCo", "greenhouse"), posting("JOB-G2", "SouthCo", "lever")],
    gB: [posting("JOB-G3", "EastCo", "greenhouse"), posting("JOB-G4", "WestCo", "lever")],
    gC: [posting("JOB-G5", "PeakCo", "greenhouse"), posting("JOB-G6", "ValeCo", "lever")],
    gD: [posting("JOB-G7", "HarborCo", "greenhouse"), posting("JOB-G8", "SummitCo", "lever")],
  };
  const E1 = makeExecutor(backend, sets);
  const E2 = makeExecutor(backend, sets);
  const cards = {};
  for (const tag of Object.keys(sets)) cards[tag] = await prepareRunSeeded(backend, E1, tag, sets[tag]);
  for (const tag of Object.keys(sets)) backend.seedIntent(`intent-approve-${tag}`, USER, { action: "approve", run_id: cards[tag].runId, card_sha256: cards[tag].cardSha256 }, null);
  backend.armLedgerBarrier(2); // waves of the 2 reads that can be in flight
  const [r1, r2] = await Promise.all([E1.runBatchPending(), E2.runBatchPending()]);
  const approves = [...r1, ...r2].filter((r) => r.action === "approve" && r.status === "completed");
  assert.equal(approves.length, 4, "all 4 approves completed");
  assert.equal(approves.reduce((n, r) => n + (r.submitted || 0), 0), 8, "8 submissions executed");
  const submitted = (backend.ledgers.get(USER) || []).filter((r) => r.status === "submitted");
  assert.equal(submitted.length, 8, "the cap ledger holds exactly the 8 — the count 149 enforces against is the truth");
  assert.equal(new Set(submitted.map((r) => `${r.canonicalKey}|${r.confirmationId}`)).size, 8, "no record duplicated by an overlapping append");
  assert.equal(new Set(submitted.map((r) => r.company)).size, 8, "no company double-submitted (1-per-company cap intact in the record)");
});

test("append retry is a no-op: the same delta appended twice lands once (dedupe by confirmation identity)", async () => {
  const backend = makeBackend();
  backend.v2 = true;
  const store = createBatchRpcStore({ call: backend.call });
  const rec = { userId: USER, canonicalKey: "greenhouse:alphaco:software-engineering-intern", status: "submitted", timestamp: NOW, confirmationId: "SBX-0001", vendor: "greenhouse", company: "AlphaCo" };
  await store.appendLedger(USER, [rec]);
  await store.appendLedger(USER, [rec]); // an uncertain-outcome retry
  const records = (await store.ledgerFor(USER)).records;
  assert.equal(records.filter((r) => r.status === "submitted").length, 1, "retry did not double-count the submission against the caps");
});
