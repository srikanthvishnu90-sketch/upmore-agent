"use strict";
/* bench-50.cjs — BENCH-50: the 50-in-30 stopwatch harness.
   Runbook: docs/bench50-runbook.md — read it before quoting a number.

   WHAT THIS IS: an end-to-end stopwatch over the product's REAL batch
   composition — workers/career-browser/batch-executor.cjs (the worker
   executor, unmodified) + production-sources.cjs (the worker's own
   postingsFor/profileFor, unmodified) + domain modules 155/149/132/
   123/121 (unmodified) — bound to TEST-world seams:

     * the batch RPC store is createBatchRpcStore over a faithful
       in-memory stand-in whose semantics mirror the live migration
       20261016010000_career_batch_intents_v1.sql (the same stand-in
       idiom as tests/career-worker-wiring.test.cjs) — label: TEST;
     * the KB pool + stored profile ride the REAL supabase transport
       over a fake PostgREST fetch backed by seeded tables — the
       transport and sources code are production code, the data is a
       synthetic market — label: TEST;
     * boards are module 149's createSandboxBoard, the product's own
       test sink (SBX- confirmations; never an employer claim) —
       label: SYNTHETIC;
     * prepare stops at the doorstep by the product's own design —
       label: DOORSTEP.

   CAPS (owner ruling 2026-10-21 12:06 CDT): module 149's SPEC_CAPS
   (15/day, 5/vendor/day, 1/company/30d) are enforced by the product
   on every drive in this harness — nothing here weakens, bypasses,
   or parameterizes them. The batch drain reports
   "submitted: N (cap-bound)" beside "prepared+approved: 50" as
   separate numbers; raw drive capacity is measured separately and
   labeled CAPACITY (see the runbook for the full reasoning).

   Usage:
     node evals/bench50/bench-50.cjs [--count 50] [--family greenhouse|mixed]
       [--market default|window-stress] [--mode full|doorstep]
       [--out report.json] [--quiet]
   The default invocation IS the dry run: in-process stand-ins,
   synthetic boards, no network, no env, no live writes. */
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

const root = path.resolve(__dirname, "..", "..");
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const CareerJobs = require(path.join(root, "packages/domain/121-career-jobs.js"));
const { createBatchExecutor, createBatchRpcStore } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));
const { createSupabaseTransport } = require(path.join(root, "workers/career-browser/supabase-transport.cjs"));
const { createProductionSources } = require(path.join(root, "workers/career-browser/production-sources.cjs"));

const clone = (v) => JSON.parse(JSON.stringify(v));
const nowMs = () => performance.now();
const sec = (ms) => Math.round(ms) / 1000;

// ---------------- args ----------------
function parseArgs(argv) {
  const a = { count: 50, family: "greenhouse", market: "default", mode: "full", out: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--count") a.count = Number(argv[++i]);
    else if (k === "--family") a.family = argv[++i];
    else if (k === "--market") a.market = argv[++i];
    else if (k === "--mode") a.mode = argv[++i];
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--quiet") a.quiet = true;
    else if (k === "--help") { console.log("usage: node evals/bench50/bench-50.cjs [--count 50] [--family greenhouse|mixed] [--market default|window-stress] [--mode full|doorstep] [--out report.json] [--quiet]"); process.exit(0); }
    else { console.error(`unknown arg: ${k}`); process.exit(2); }
  }
  if (!Number.isSafeInteger(a.count) || a.count < 1) { console.error("--count must be a positive integer"); process.exit(2); }
  if (!["greenhouse", "mixed"].includes(a.family)) { console.error("--family must be greenhouse|mixed"); process.exit(2); }
  if (!["default", "window-stress"].includes(a.market)) { console.error("--market must be default|window-stress"); process.exit(2); }
  if (!["full", "doorstep"].includes(a.mode)) { console.error("--mode must be full|doorstep"); process.exit(2); }
  return a;
}

// ---------------- the test persona (synthetic stored record) ----------------
const USER = "00000000-0000-4000-8000-0000000000b5"; // bench persona — synthetic, never a real account
const FAMILY_TEXT = "software engineering intern";
const STORED_MASTER = {
  basics: { name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100", location: "Chicago, IL" },
  facts: [
    { id: "F-T-001", kind: "skill", text: "JavaScript and Node.js development", confirmed: true },
    { id: "F-T-002", kind: "experience", text: "Built web applications as a student developer", confirmed: true },
    { id: "F-T-003", kind: "education", text: "Computer Science student", confirmed: true },
  ],
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
  },
  attestations: { certify_true: { value: true, explicit: true } },
};

// ---------------- the synthetic KB market ----------------
const FAM_URL = {
  greenhouse: (co, n) => `https://boards.greenhouse.io/${co}/jobs/${n}`,
  lever: (co, n) => `https://jobs.lever.co/${co}/${n}`,
  ashby: (co, n) => `https://jobs.ashbyhq.com/${co}/${n}`,
};
const FAMS = ["greenhouse", "lever", "ashby"];
function kbRow(n, fam, postedAt, over = {}) {
  const co = `benchco${n}`;
  return Object.assign({
    posting_key: `${fam}:${FAM_URL[fam](co, n)}`, source: fam, board: co,
    company: `BenchCo ${n}`, title: "Software Engineering Intern", location: "Chicago, IL",
    url: FAM_URL[fam](co, n), posted_at: postedAt, fetched_on: "2026-10-20",
    text_excerpt: "Software engineering intern role at a test company. JavaScript, testing, code review, agile team.",
  }, over);
}
// default: 90 eligible (distinct companies), newest first so the first
// --count selected are clean; the noise rows (one duplicate opening,
// one CPA knockout, the captcha + uncovered-question companies) sit
// just below the clean band — screening processes them (found/eligible
// counts show them) and they enter the selection only past the clean
// band (--count > 60). window-stress: 900 rows; the eligible interns
// are posted OLD, 700 newer non-intern rows fill the loader's 600-row
// recency window first (the F-005 shape).
function buildMarket(args) {
  const famOf = (n) => (args.family === "mixed" ? FAMS[n % 3] : "greenhouse");
  const rows = [];
  const base = Date.parse("2026-10-20T00:00:00Z");
  const iso = (ms) => new Date(ms).toISOString();
  if (args.market === "window-stress") {
    for (let n = 1; n <= 700; n++) { // newer non-intern filler fills the window
      const fam = famOf(n);
      rows.push(kbRow(1000 + n, fam, iso(base - n * 3600e3), {
        company: `FillerCo ${n}`, title: "Senior Platform Engineer",
        text_excerpt: "Senior platform engineer role. Kubernetes, distributed systems, on-call rotation.",
      }));
    }
    for (let n = 1; n <= 90; n++) { // eligible interns, all older than the filler
      rows.push(kbRow(n, famOf(n), iso(base - (720 + n) * 3600e3)));
    }
    for (let n = 1; n <= 110; n++) { // older filler tail
      const fam = famOf(n);
      rows.push(kbRow(2000 + n, fam, iso(base - (900 + n) * 3600e3), {
        company: `TailCo ${n}`, title: "Senior Platform Engineer",
        text_excerpt: "Senior platform engineer role. Kubernetes, distributed systems, on-call rotation.",
      }));
    }
    return rows;
  }
  for (let n = 1; n <= 60; n++) rows.push(kbRow(n, famOf(n), iso(base - n * 3600e3))); // clean eligible band
  for (let n = 61; n <= 90; n++) rows.push(kbRow(n, famOf(n), iso(base - (120 + n) * 3600e3))); // older eligible
  rows.push(kbRow(3, famOf(4), iso(base - 200 * 3600e3), { company: "BenchCo 3" })); // duplicate opening (same company+role, other board)
  rows.push(kbRow(91, famOf(91), iso(base - 201 * 3600e3), { // CPA knockout in the text
    text_excerpt: "Software engineering intern role. An active CPA license is required for this role. JavaScript, testing, code review.",
  }));
  return rows;
}

// ---------------- the batch RPC stand-in (migration 20261016010000 semantics) ----------------
// Mirrors tests/career-worker-wiring.test.cjs's state machine: pending
// returns queued intents in RPC shape; claim takes the row (a refusal
// resolves {claimed:false} here — Lane D's stand-in semantics; the
// production RPC raises and createBatchRpcStore translates);
// finish requires the lease; runs/ledgers are user-scoped.
function emptyState() { return { intents: new Map(), runs: new Map(), ledgers: new Map(), tables: { agent_flow_state: [], career_kb_postings: [] } }; }
function seedIntent(state, { userId, intentId, binding, run }) {
  state.intents.set(intentId, { user_id: userId, intent_id: intentId, binding: clone(binding), private_input: run ? { run: clone(run) } : null, state: "queued", lease_token: null, result: null, run_id: binding.run_id || null });
}
function applyRpc(state, name, args) {
  const fail = (message) => { throw Object.assign(new Error(message), { pgRaise: true }); };
  switch (name) {
    case "career_batch_pending_v1": {
      const intents = [...state.intents.values()].filter((i) => i.state === "queued")
        .map((i) => ({ userId: i.user_id, intentId: i.intent_id, binding: clone(i.binding), request: clone(i.private_input) }));
      return { intents };
    }
    case "career_batch_claim_v1": {
      const i = state.intents.get(args.p_intent);
      if (!i || i.user_id !== args.p_user) fail("batch intent missing");
      if (i.state !== "queued") return { claimed: false };
      i.state = "claimed"; i.lease_token = crypto.randomUUID();
      return { claimed: true, intentId: i.intent_id, userId: i.user_id, leaseToken: i.lease_token, binding: clone(i.binding), request: clone(i.private_input) };
    }
    case "career_batch_finish_v1": {
      const i = state.intents.get(args.p_intent);
      if (!i || args.p_lease !== i.lease_token) fail("batch result owner mismatch");
      if (!["completed", "blocked", "uncertain"].includes(args.p_state) || i.state !== "claimed") fail("invalid batch finish");
      i.state = args.p_state; i.result = clone(args.p_result);
      return { state: args.p_state };
    }
    case "career_batch_save_run_v1": state.runs.set(`${args.p_user}|${args.p_run.runId}`, clone(args.p_run)); return { saved: true };
    case "career_batch_result_v1": { const rec = state.runs.get(`${args.p_user}|${args.p_run}`); return { batch: rec ? clone(rec) : null }; }
    case "career_batch_ledger_v1": return { records: clone(state.ledgers.get(args.p_user) || []) };
    case "career_batch_save_ledger_v1": state.ledgers.set(args.p_user, clone(args.p_records)); return { saved: true };
    default: fail(`unexpected RPC ${name}`);
  }
}

// ---------------- fake PostgREST fetch over the seeded tables ----------------
function createFakePostgrestFetch(state, key) {
  const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  return async (url, init = {}) => {
    const u = new URL(url);
    const headers = init.headers || {};
    if (headers.apikey !== key || headers.Authorization !== `Bearer ${key}`) return respond(401, { code: "401", message: "Invalid API key" });
    const table = u.pathname.match(/^\/rest\/v1\/([a-z0-9_]+)$/);
    if (table && (init.method || "GET") === "GET") {
      let rows = clone(state.tables[table[1]] || []);
      for (const [k, v] of u.searchParams.entries()) {
        if (["select", "order", "limit", "offset"].includes(k)) continue;
        const m = v.match(/^eq\.(.*)$/);
        if (m) rows = rows.filter((r) => String(r[k]) === m[1]);
      }
      const order = u.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(".");
        rows.sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (dir === "desc" ? -1 : 1));
      }
      const limit = Number(u.searchParams.get("limit") || rows.length);
      return respond(200, rows.slice(0, limit));
    }
    return respond(404, { code: "PGRST205", message: "not found" });
  };
}

// ---------------- instrumentation ----------------
// Per-call timers on every injected seam. `phase` tags board calls with
// the drain that made them (prepare | approve | capacity).
function makeTimers() {
  return { phase: "boot", seams: new Map(), boards: [] };
}
function timed(timers, bucket, name, fn) {
  return async (...args) => {
    const t0 = nowMs();
    try { return await fn(...args); }
    finally {
      const ms = nowMs() - t0;
      const key = `${bucket}:${name}`;
      const s = timers.seams.get(key) || { calls: 0, ms: 0 };
      s.calls += 1; s.ms += ms; timers.seams.set(key, s);
    }
  };
}
function seamMs(timers, bucket, name) {
  const s = timers.seams.get(`${bucket}:${name}`);
  return s ? s.ms : 0;
}
function timedStore(timers, store) {
  const out = {};
  for (const m of ["pending", "claim", "finish", "saveRun", "readRun", "ledgerFor", "saveLedger"]) out[m] = timed(timers, "store", m, store[m].bind(store));
  return out;
}
function timedBoardFactory(timers, boardFor) {
  return (posting) => {
    const board = boardFor(posting);
    if (!board) return board;
    const wrapped = {};
    for (const [k, v] of Object.entries(board)) {
      if (typeof v !== "function") { wrapped[k] = v; continue; }
      wrapped[k] = (...a) => {
        const t0 = nowMs();
        try { return v(...a); }
        finally { timers.boards.push({ phase: timers.phase, postingKey: posting.posting_key || posting.canonicalKey || posting.id || null, method: k, ms: nowMs() - t0 }); }
      };
    }
    // non-enumerable / symbol props are not part of the board contract; the
    // sandbox board is a plain object of functions + data fields.
    return wrapped;
  };
}
function boardMs(timers, phase) {
  return timers.boards.filter((b) => b.phase === phase).reduce((s, b) => s + b.ms, 0);
}
function dist(values) {
  // values are milliseconds; reported in ms at 3 decimals — in-process
  // drives are sub-millisecond and a seconds rounding would read 0.
  const r3 = (x) => Math.round(x * 1000) / 1000;
  if (!values.length) return { n: 0, min_ms: null, median_ms: null, max_ms: null, mean_ms: null };
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { n: s.length, min_ms: r3(s[0]), median_ms: r3(mid), max_ms: r3(s[s.length - 1]), mean_ms: r3(s.reduce((x, y) => x + y, 0) / s.length) };
}

// ---------------- the board double (loop-acceptance pattern) ----------------
function benchBoardFor(p) {
  const fam = { atsFamily: p.atsFamily };
  // The two named-stop boards sit BELOW the clean 50 band (companies
  // 53/57 are eligible but outside a count-50 selection); they enter
  // the selection — and stop named — at --count > 52. See runbook.
  if (/BenchCo 57$/.test(p.company || "")) return Object.assign({}, Portal.createSandboxBoard({ captchaAt: "open" }), fam);
  if (/BenchCo 53$/.test(p.company || "")) {
    const base = Portal.createSandboxBoard({});
    return Object.assign({}, base, fam, {
      form() {
        const f = base.form();
        f.fields = f.fields.concat([{ field_id: "start_date", label: "Earliest start date", kind: "screening", question_key: "start_date", required: true }]);
        return f;
      },
    });
  }
  return Object.assign({}, Portal.createSandboxBoard({}), fam);
}

// ---------------- main ----------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timers = makeTimers();
  const report = {
    bench: "BENCH-50 (50-in-30 stopwatch)",
    started_at: new Date().toISOString(),
    inputs: { count: args.count, family: args.family, market: args.market, mode: args.mode, family_text: FAMILY_TEXT, persona: "Alex Testcase (TEST) — synthetic stored record" },
    world: "TEST (stand-in batch RPC store, real executor + production sources over a fake PostgREST; boards SYNTHETIC sandbox)",
    legs: {},
    not_run: [
      { leg: "approval via the LIVE career_batch_* RPCs", label: "NOT_RUN", missing: "an operator env + a chat-committed intent for a real user — this harness never writes live intents; the approval leg runs at the identical wire shape against the stand-in store and is labeled TEST" },
      { leg: "drain against LIVE boards via the worker host board service", label: "NOT_RUN", missing: "the board-service binding on the worker host (the throughput lane's live drives own that seam); this harness's drain is SYNTHETIC (sandbox boards) inside the submit gate, or DOORSTEP in --mode doorstep" },
      { leg: "agent-submit approval RPC (career_apply_batch_approve_own, WO-101)", label: "NOT_RUN", missing: "the closure schema (career_apply_* stack) is not live on the project yet; the batch approval measured here is the live 20261016010000 intent + card-hash path" },
    ],
  };

  // ---- assemble the test world (all production code, seeded data) ----
  const state = emptyState();
  state.tables.career_kb_postings = buildMarket(args);
  state.tables.agent_flow_state = [{
    thread_id: "00000000-0000-4000-8000-0000000000b6", user_id: USER, updated_at: "2026-10-20T16:00:00Z",
    state: { career: { v: 1, stores: { profile: clone(STORED_MASTER) } } },
  }];
  const KEY = "bench-test-service-role-key-DO-NOT-LOG";
  const transport = createSupabaseTransport({ baseUrl: "https://db.bench.test", serviceRoleKey: KEY, fetchImpl: createFakePostgrestFetch(state, KEY) });
  const sources = createProductionSources({ transport, jobs: CareerJobs });
  const rpcStore = createBatchRpcStore({ call: async (name, a) => applyRpc(state, name, a) });
  const store = timedStore(timers, rpcStore);

  const postingsFor = timed(timers, "sources", "postingsFor", sources.postingsFor);
  const profileFor = timed(timers, "sources", "profileFor", sources.profileFor);
  const boardForFor = () => timedBoardFactory(timers, benchBoardFor);
  const newExecutor = () => createBatchExecutor({ store, postingsFor, profileFor, boardForFor, now: () => Date.now() });

  const e2e0 = nowMs();

  // ---- legs 1+2: the prepare drain (discovery + prepare) ----
  timers.phase = "prepare";
  const skeleton = Batch.serializeRun(Batch.createRun({ userId: USER, familyText: FAMILY_TEXT, count: args.count, now: Date.now() }));
  seedIntent(state, { userId: USER, intentId: "bench-prepare-1", binding: { action: "prepare", run_id: skeleton.id, family_text: FAMILY_TEXT }, run: skeleton });
  const seamMark = new Map(timers.seams);
  const drain1T0 = nowMs();
  const drain1 = await newExecutor().runBatchPending();
  const drain1Ms = nowMs() - drain1T0;
  const seamDelta = (bucket, name) => {
    const before = seamMark.get(`${bucket}:${name}`) || { ms: 0 };
    return seamMs(timers, bucket, name) - before.ms;
  };
  const storeProfileMsPrepare = ["pending", "claim", "finish", "saveRun", "readRun", "ledgerFor", "saveLedger"].reduce((s, m) => s + seamDelta("store", m), 0)
    + seamDelta("sources", "profileFor");
  const leg1Ms = seamDelta("sources", "postingsFor");
  const leg2Ms = Math.max(0, drain1Ms - leg1Ms - storeProfileMsPrepare);
  const prepBoardsMs = boardMs(timers, "prepare");

  const preparedRecord = await rpcStore.readRun({ userId: USER, runId: skeleton.id });
  if (!preparedRecord || !preparedRecord.run) throw new Error(`prepare produced no stored run: ${JSON.stringify(drain1)}`);
  const prepRun = preparedRecord.run;
  const prepSummary = preparedRecord.summary || {};
  const doorstepApps = Object.values(prepRun.apps || {}).filter((a) => a.stage === "doorstep");
  report.legs.leg1_discovery = {
    label: "TEST", seconds: sec(leg1Ms),
    pool_postings_served: prepRun.found != null ? prepRun.found : null,
    postings_per_min: leg1Ms > 0 && prepRun.found ? Math.round((prepRun.found / (leg1Ms / 1000)) * 60) : null,
    note: "the worker's own postingsFor over the shared KB pool loader (600-row recency window); served = rows the window yielded, before screening",
  };
  // Family fidelity of the selection: 155 screens knockouts, not role
  // family — if the recency window serves off-family postings, they
  // fill the queue (the F-005 shape). Counted from the postings' own
  // titles so the report can name it.
  const selectedPostings = (prepRun.selected || []).map((k) => prepRun.postings[k]).filter(Boolean);
  const selectedMatching = selectedPostings.filter((p) => /intern/i.test(p.title || "")).length;
  const stoppedApps = Object.values(prepRun.apps || {}).filter((a) => a.stage === "stopped" || a.stage === "captcha_handoff");
  report.legs.leg2_prepare = {
    label: "TEST (ends DOORSTEP by design)",
    seconds: sec(leg2Ms),
    residual_note: "prepare drain wall − leg 1 − wrapped store/profile seams; includes 155 screen + tailor and the per-posting doorstep drives",
    found: prepRun.found, duplicates_removed: prepRun.duplicatesRemoved, screened_out: (prepRun.screenedOut || []).length,
    eligible: prepRun.eligible, selected: (prepRun.selected || []).length,
    selected_matching_family: selectedMatching,
    selected_off_family: (prepRun.selected || []).length - selectedMatching,
    prepare_stops: stoppedApps.map((a) => ({ company: a.company, code: a.stop && a.stop.code })),
    doorstep: prepSummary.doorstep != null ? prepSummary.doorstep : doorstepApps.length,
    per_posting_prepare_s: (prepRun.selected || []).length ? sec(leg2Ms / (prepRun.selected || []).length) : null,
    prepare_doorstep_drives_s: sec(prepBoardsMs),
    card_sha256: prepRun.cardSha256 || null,
    run_status: prepRun.status,
  };

  // ---- capacity drain (TEST world throughput proof; see runbook) ----
  // Each approved doorstep driven through the real 149 submit path as
  // an independent one-application drive with its own test ledger —
  // every drive runs 149's real cap check, payload-hash gate and
  // arming wire. Labeled CAPACITY: it measures the drive path's
  // marginal cost, never a batch submission count.
  let capacity = null;
  if (args.mode === "full") {
    timers.phase = "capacity";
    const pack = await sources.profileFor(USER);
    const approvalRef = `batch:${prepRun.id}:${prepRun.cardSha256}`;
    const drives = [];
    for (const app of doorstepApps) {
      const posting = prepRun.postings[app.postingKey];
      const t0 = nowMs();
      const board = benchBoardFor(posting);
      const session = Portal.createPortalSession({ userId: USER, board });
      const driveLog = { records: [] };
      const prep = Portal.runApply(session, { posting, profile: pack.profile, log: driveLog, userId: USER, now: Date.now(), attestations: pack.attestations || {} });
      let outcome = prep && prep.resultStatus === "prepared" ? "doorstep_only" : `stopped:${(prep && prep.code) || "NO_RESULT"}`;
      if (prep && prep.resultStatus === "prepared") {
        const out = Portal.submitDoorstep(session, { approvedByUser: true, payloadSha256: app.payloadSha256, approvalRef }, { log: driveLog, now: Date.now(), posting, approvalRef });
        outcome = out && out.resultStatus === "completed" ? "submitted_synthetic" : `${(out && out.code) || (out && out.resultStatus) || "NO_RESULT"}`;
      }
      drives.push({ postingKey: app.postingKey, company: app.company, ms: nowMs() - t0, outcome });
    }
    const totalMs = drives.reduce((s, d) => s + d.ms, 0);
    capacity = {
      label: "CAPACITY (per-drive marginals through the real 149 submit gate; boards SYNTHETIC)",
      drives: drives.length,
      submitted_synthetic: drives.filter((d) => d.outcome === "submitted_synthetic").length,
      total_drive_s: sec(totalMs),
      per_drive: dist(drives.map((d) => d.ms)),
      outcomes: drives.reduce((m, d) => { m[d.outcome] = (m[d.outcome] || 0) + 1; return m; }, {}),
    };
    report.capacity_drain = capacity;
  } else {
    report.not_run.push({ leg: "drain (all forms)", label: "NOT_RUN", missing: "--mode doorstep stops at the submit seam by request: legs 1–3 measured, the batch sits at its doorsteps (DOORSTEP)" });
  }

  // ---- legs 3+4: the approve drain (one batch approval + batch drain) ----
  if (args.mode === "full") {
    // The approval mint, measured directly: the real approveRun on a
    // restored clone of the stored prepared run (in-memory only — the
    // recorded approval is the executor's, in the drain below). This
    // isolates the card-hash re-verification + per-application
    // approval mint from executeRun's loop, which shares the drain.
    const mintClone = Batch.restoreRun(clone(prepRun));
    const mintT0 = nowMs();
    const mint = Batch.approveRun(mintClone, { approvedByUser: true });
    const mintMs = nowMs() - mintT0;

    timers.phase = "approve";
    const seamMark2 = new Map(timers.seams);
    seedIntent(state, { userId: USER, intentId: "bench-approve-1", binding: { action: "approve", run_id: skeleton.id, card_sha256: prepRun.cardSha256 } });
    const drain2T0 = nowMs();
    const drain2 = await newExecutor().runBatchPending();
    const drain2Ms = nowMs() - drain2T0;
    const seamDelta2 = (bucket, name) => {
      const before = seamMark2.get(`${bucket}:${name}`) || { ms: 0 };
      return seamMs(timers, bucket, name) - before.ms;
    };
    const storeProfileMsApprove = ["pending", "claim", "finish", "saveRun", "readRun", "ledgerFor", "saveLedger"].reduce((s, m) => s + seamDelta2("store", m), 0)
      + seamDelta2("sources", "profileFor");
    const leg4Ms = boardMs(timers, "approve");
    // leg 3 = the approval's own measured parts: the intent seams that
    // carry it (pending/claim/readRun) + the mint measured above.
    const leg3Ms = seamDelta2("store", "pending") + seamDelta2("store", "claim") + seamDelta2("store", "readRun") + mintMs;
    // what remains of the approve drain is executeRun's non-board CPU
    // (session rebuilds, runApply payload work, cap checks) — leg 4's
    // overhead, reported there, never folded into the approval leg.
    const execOverheadMs = Math.max(0, drain2Ms - leg4Ms - storeProfileMsApprove - mintMs);

    const finalRecord = await rpcStore.readRun({ userId: USER, runId: skeleton.id });
    const finalRun = finalRecord && finalRecord.run;
    const finSummary = (finalRecord && finalRecord.summary) || {};
    const approveResult = drain2[0] || {};
    const deferredCap = finalRun ? (finalRun.deferred || []).filter((x) => x.code === "CAP_REACHED") : [];
    const capStops = {};
    for (const app of finalRun ? Object.values(finalRun.apps || {}) : []) {
      if (app.stage === "deferred_cap" && app.stop && app.stop.code) capStops[app.stop.code] = (capStops[app.stop.code] || 0) + 1;
    }
    const ledger = await rpcStore.ledgerFor(USER);
    // per-drive distribution inside the batch drain: regroup board
    // calls by posting within the approve phase.
    const perDrive = new Map();
    for (const b of timers.boards) {
      if (b.phase !== "approve") continue;
      perDrive.set(b.postingKey, (perDrive.get(b.postingKey) || 0) + b.ms);
    }
    report.legs.leg3_approval = {
      label: "TEST (stand-in store, real RPC shape + real 155 hash re-verification)",
      seconds: sec(leg3Ms),
      attribution: "pending+claim+readRun seams in the approve drain + approveRun's card-hash re-verification and approval mint timed directly on a restored clone of the stored run (the recorded approval is the executor's own, in the same drain)",
      mint_measured_s: sec(mintMs),
      mint_ok: mint.ok === true,
      approvals_recorded: finalRun && finalRun.approvals ? Object.keys(finalRun.approvals).length : 0,
      approval_ref: finalRun ? finalRun.approvalRef || null : null,
      drain_result: approveResult.status || null,
    };
    report.legs.leg4_drain_batch = {
      label: "TEST + SYNTHETIC boards (policy outcome — caps enforced by real 149, unmodified)",
      seconds: sec(drain2Ms),
      board_time_s: sec(leg4Ms),
      execution_overhead_s: sec(execOverheadMs),
      execution_overhead_note: "approve drain wall − board calls − store/profile seams − the approval mint: executeRun's in-process loop cost (per-posting session rebuild + runApply payload rebuild + cap check) across ALL selected postings, including the ones the caps then deferred",
      prepared_plus_approved: report.legs.leg3_approval.approvals_recorded,
      submitted: finSummary.submitted != null ? finSummary.submitted : (approveResult.submitted || 0),
      submitted_cap_bound: deferredCap.length > 0,
      deferred_cap: deferredCap.length,
      cap_stops: capStops,
      confirmations_synthetic: (approveResult.confirmations || []).length,
      ledger_submitted_records: ledger.records.filter((r) => r.status === "submitted").length,
      per_drive_board_time: dist([...perDrive.values()]),
      run_status: finalRun ? finalRun.status : null,
      note: "executeRun's loop is serial: one posting's drive completes before the next begins; drives re-run the doorstep drive before submitting (sessions do not survive between the prepare and approve invocations). Board-call time here is in-process (µs-scale against the sandbox board) — the per-drive cost that matters is measured whole in the CAPACITY drain.",
    };
  }

  // ---- totals + projection + binding constraint ----
  const e2eMs = nowMs() - e2e0;
  report.totals = {
    end_to_end_s: sec(e2eMs),
    prepared_plus_approved: report.legs.leg3_approval ? report.legs.leg3_approval.approvals_recorded : report.legs.leg2_prepare.doorstep,
    submitted_batch: report.legs.leg4_drain_batch ? report.legs.leg4_drain_batch.submitted : 0,
    submitted_batch_cap_bound: report.legs.leg4_drain_batch ? report.legs.leg4_drain_batch.submitted_cap_bound : null,
  };
  if (capacity && capacity.per_drive.mean_ms) {
    const fixedS = sec((report.legs.leg1_discovery.seconds + report.legs.leg2_prepare.seconds + (report.legs.leg3_approval ? report.legs.leg3_approval.seconds : 0)) * 1000);
    const perDriveS = capacity.per_drive.mean_ms / 1000;
    report.projection = {
      label: "PROJECTION from measured marginals (TEST world, SYNTHETIC boards)",
      basis_note: "the per-drive marginal is IN-PROCESS cost (149 payload build, gates, sandbox board) — it excludes live-board latency (browser launch, page loads, network), which is the NOT_RUN live-board leg owned by the throughput lane. Read this projection as the pipeline's CPU-side ceiling, never as a live submission rate.",
      fixed_cost_s: fixedS,
      per_drive_mean_s: sec(perDriveS * 1000),
      projected_in_30min: perDriveS > 0 ? Math.max(0, Math.floor((1800 - fixedS) / perDriveS)) : null,
      batch_of_count_capacity_s: sec((fixedS + perDriveS * args.count) * 1000),
      note: "capacity projection — what the pipeline can physically drive in 30 min; the policy outcome for one user's batch is leg 4's submitted (cap-bound) number, reported separately and never merged with this one",
    };
  }
  const constraints = [];
  if (report.legs.leg2_prepare.selected_matching_family < args.count) {
    constraints.push(`discovery fidelity (F-005 shape): only ${report.legs.leg2_prepare.selected_matching_family} of the ${args.count} selected postings match the requested family — the 600-row recency window filled the queue with off-family postings while eligible intern postings sit outside it; leg 1 binds before any drive happens`);
  }
  if (report.legs.leg1_discovery.pool_postings_served != null && report.legs.leg2_prepare.eligible != null && report.legs.leg2_prepare.eligible < args.count) {
    constraints.push(`discovery yield: the pool window served ${report.legs.leg1_discovery.pool_postings_served} postings, ${report.legs.leg2_prepare.eligible} eligible after screening — fewer than the ${args.count} requested (leg 1 / the 600-row recency window binds before any drive happens)`);
  }
  if (report.legs.leg4_drain_batch && report.legs.leg4_drain_batch.submitted_cap_bound) {
    constraints.push(`product caps (by design, owner ruling): the batch drain stopped at ${report.legs.leg4_drain_batch.submitted} submitted with ${report.legs.leg4_drain_batch.deferred_cap} deferred CAP_REACHED — caps are the binding constraint on single-user submissions in any world; throughput is not`);
  }
  if (capacity) {
    const fixedS = report.projection ? report.projection.fixed_cost_s : 0;
    if (fixedS > capacity.total_drive_s) constraints.push(`prepare dominates: fixed legs (discovery+prepare+approval) ${fixedS}s exceed total drive time ${capacity.total_drive_s}s — per-posting tailor + doorstep drives in prepare, plus the execute phase re-driving every doorstep, are the throughput cost`);
    else constraints.push(`serial drain: executeRun drives one posting at a time; capacity is ${capacity.per_drive.mean_ms}ms/drive serial in-process — on live boards the per-drive latency (browser + network, NOT_RUN here) is the lever, and the loop's serial shape multiplies it`);
  }
  report.binding_constraint = constraints[0] || "none measured";
  report.all_constraints = constraints;
  report.finished_at = new Date().toISOString();

  // ---- output ----
  const L = report.legs;
  const lines = [
    `BENCH-50 — ${args.count} postings, family=${args.family}, market=${args.market}, mode=${args.mode} [${report.world}]`,
    `leg 1 DISCOVERY  [${L.leg1_discovery.label}] ${L.leg1_discovery.seconds}s — pool served ${L.leg1_discovery.pool_postings_served} postings (${L.leg1_discovery.postings_per_min}/min)`,
    `leg 2 PREPARE    [${L.leg2_prepare.label}] ${L.leg2_prepare.seconds}s — found ${L.leg2_prepare.found}, dupes −${L.leg2_prepare.duplicates_removed}, screened out ${L.leg2_prepare.screened_out}, eligible ${L.leg2_prepare.eligible}, selected ${L.leg2_prepare.selected} (${L.leg2_prepare.selected_matching_family} matching family, ${L.leg2_prepare.selected_off_family} off-family), doorstep ${L.leg2_prepare.doorstep} (${L.leg2_prepare.per_posting_prepare_s}s/posting; doorstep drives ${L.leg2_prepare.prepare_doorstep_drives_s}s of it)`,
  ];
  if (L.leg3_approval) lines.push(`leg 3 APPROVAL   [${L.leg3_approval.label}] ${L.leg3_approval.seconds}s — ONE batch approval, ${L.leg3_approval.approvals_recorded} hash-bound approvals recorded, ref ${L.leg3_approval.approval_ref}`);
  if (L.leg4_drain_batch) lines.push(`leg 4 DRAIN      [${L.leg4_drain_batch.label}] ${L.leg4_drain_batch.seconds}s — prepared+approved: ${report.totals.prepared_plus_approved} · submitted: ${L.leg4_drain_batch.submitted}${L.leg4_drain_batch.submitted_cap_bound ? " (cap-bound)" : ""} · deferred CAP_REACHED: ${L.leg4_drain_batch.deferred_cap} · board time ${L.leg4_drain_batch.board_time_s}s, per-drive ${JSON.stringify(L.leg4_drain_batch.per_drive_board_time)}`);
  if (capacity) lines.push(`CAPACITY DRAIN   [${capacity.label}] ${capacity.total_drive_s}s for ${capacity.drives} drives — per-drive mean ${capacity.per_drive.mean_ms}ms, median ${capacity.per_drive.median_ms}ms, max ${capacity.per_drive.max_ms}ms; synthetic submissions ${capacity.submitted_synthetic}`);
  if (report.projection) lines.push(`PROJECTION       [${report.projection.label}] fixed ${report.projection.fixed_cost_s}s + ${report.projection.per_drive_mean_s}s/drive → ${report.projection.projected_in_30min} drives in 30 min (CPU ceiling on synthetic boards; live-board latency excluded — see basis note in the JSON report); a batch of ${args.count} at capacity takes ${report.projection.batch_of_count_capacity_s}s`);
  lines.push(`END TO END ${report.totals.end_to_end_s}s · BINDING CONSTRAINT: ${report.binding_constraint}`);
  for (const n of report.not_run) lines.push(`NOT_RUN [${n.label}] ${n.leg} — missing: ${n.missing}`);
  const text = lines.join("\n");
  if (!args.quiet) console.log(text);
  if (args.out) { fs.writeFileSync(args.out, JSON.stringify(report, null, 2)); console.log(`report written: ${args.out}`); }
  return report;
}

main().catch((e) => { console.error("bench-50 failed:", e && e.stack || e); process.exit(1); });
