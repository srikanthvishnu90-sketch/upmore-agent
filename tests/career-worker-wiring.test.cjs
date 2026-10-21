// WORKER WIRING (Lane E items 2+3 — composition wiring, Feature
// Depth Program v2): the batch executor refused to invent its
// production inputs, and until this lane nothing supplied them:
//   * no RPC transport existed for createBatchRpcStore's injected
//     call(name, args) — Lane D proved the executor against a local
//     file-backed stand-in speaking the same wire shape; production
//     had no caller at all (checklist §2 item 3);
//   * postingsFor / profileFor were operator glue that did not exist
//     (checklist §2 items 4–5) — the executor threw
//     BATCH_DISCOVERY_NOT_WIRED / BATCH_PROFILE_NOT_WIRED without
//     them.
// This suite pins the wiring:
//   * the Supabase transport speaks the exact createBatchRpcStore
//     wire shape against a PostgREST emulator carrying the batch
//     migration's SQL semantics, AND against a file-backed stand-in
//     with Lane D's observed semantics — the same executor cycle
//     (prepare -> card -> approve -> 13 submitted, claim-once, third
//     drain empty) passes over both bindings;
//   * claim-once at the store boundary: a second claim on a
//     completed intent resolves claimed:false / null, never a throw
//     (the production RPC raises 'batch authority revoked'; the
//     store's contract — and its skipped_claimed branch — is a null
//     refusal);
//   * the wired postingsFor serves the KB-backed pool (the same
//     shared mapping the Edge handler uses) and the wired
//     profileFor resolves the user's pack from their stored
//     profile record; a user with no stored profile produces the
//     named stop BATCH_PROFILE_NOT_FOUND — the intent finishes
//     blocked with that code and no profile is fabricated;
//   * the transport fails fast and named when unconfigured, and no
//     error it throws ever carries the service-role key.
// Check: node --test tests/career-worker-wiring.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const CareerJobs = require(path.join(root, "packages/domain/121-career-jobs.js"));
const { createBatchExecutor, createBatchRpcStore } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));
const { createSupabaseTransport } = require(path.join(root, "workers/career-browser/supabase-transport.cjs"));
const { createProductionSources } = require(path.join(root, "workers/career-browser/production-sources.cjs"));

const USER = "00000000-0000-4000-8000-000000000001";
const NOW = Date.UTC(2026, 9, 15, 17, 0, 0);
const KEY = "test-service-role-key-DO-NOT-LOG";
const BASE = "https://db.example.test";
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------------- fixtures: the KB market + the stored profile ----

const FAMS = ["greenhouse", "lever", "ashby"];
const famUrl = (fam, co, n) => fam === "greenhouse" ? `https://boards.greenhouse.io/${co}/jobs/${n}` : fam === "lever" ? `https://jobs.lever.co/${co}/${n}` : `https://jobs.ashbyhq.com/${co}/${n}`;
function kbRow(n, over = {}) {
  const fam = FAMS[n % 3];
  const co = `testco${n}`;
  return Object.assign({
    posting_key: `${fam}:${famUrl(fam, co, n)}`, source: fam, board: co,
    company: `TestCo ${n}`, title: "Software Engineering Intern", location: "Chicago, IL",
    url: famUrl(fam, co, n), posted_at: "2026-10-12T00:00:00Z", fetched_on: "2026-10-14",
    text_excerpt: "Software engineering intern role at a test company. JavaScript, testing, code review, agile team.",
  }, over);
}
const KB_ROWS = [];
for (let n = 1; n <= 20; n++) KB_ROWS.push(kbRow(n));
KB_ROWS[15] = kbRow(16, { company: "TestCo 3", posting_key: "lever:https://jobs.lever.co/testco3/16", source: "lever", board: "testco3", url: "https://jobs.lever.co/testco3/16" }); // duplicate of TestCo 3
KB_ROWS[16] = kbRow(17, { text_excerpt: "Software engineering intern role. An active CPA license is required for this role. JavaScript, testing, code review." }); // knockout in the text

// The user's stored record: agent_flow_state snapshot career stores
// (the 122 master the chat itself maintains) + the account KV row.
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

// ---------------- the shared batch state machine (both bindings) --
// Mirrors supabase/migrations/20261016010000_career_batch_intents_v1.sql:
// pending returns queued intents in RPC shape; claim takes the row
// (SQL raises 'batch authority revoked' when not queued — the
// `strictClaim` binding — while Lane D's file-backed stand-in
// returned {claimed:false}); finish requires the lease + claimed
// state; result/ledger are user-scoped.
function emptyState() { return { intents: new Map(), runs: new Map(), ledgers: new Map(), tables: { agent_flow_state: [], career_kb_postings: [] } }; }
function seedIntent(state, { userId, intentId, binding, run }) {
  state.intents.set(intentId, { user_id: userId, intent_id: intentId, binding: clone(binding), private_input: run ? { run: clone(run) } : null, state: "queued", lease_token: null, result: null, run_id: binding.run_id || null });
}
function applyRpc(state, name, args, { strictClaim = false } = {}) {
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
      if (i.state !== "queued") { if (strictClaim) fail("batch authority revoked"); return { claimed: false }; }
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
    case "career_batch_save_run_v1": {
      state.runs.set(`${args.p_user}|${args.p_run.runId}`, clone(args.p_run));
      return { saved: true };
    }
    case "career_batch_result_v1": {
      const rec = state.runs.get(`${args.p_user}|${args.p_run}`);
      return { batch: rec ? clone(rec) : null };
    }
    case "career_batch_ledger_v1": return { records: clone(state.ledgers.get(args.p_user) || []) };
    case "career_batch_save_ledger_v1": state.ledgers.set(args.p_user, clone(args.p_records)); return { saved: true };
    default: fail(`unexpected RPC ${name}`);
  }
}

// Binding A: Lane D's file-backed stand-in — the same call(name,
// args) shape, state persisted to a JSON file after every call.
function createFileStandIn(file, state) {
  const persist = () => fs.writeFileSync(file, JSON.stringify({ intents: [...state.intents.values()], runs: [...state.runs.entries()], ledgers: [...state.ledgers.entries()] }));
  return {
    async call(name, args) { const out = applyRpc(state, name, args, { strictClaim: false }); persist(); return out; },
  };
}

// Binding B: a PostgREST emulator behind a fetch double — the real
// transport talks HTTP to it; SQL raise semantics (strict claim).
function createFakePostgrestFetch(state) {
  const requests = [];
  const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const headers = init.headers || {};
    requests.push({ url, method: init.method || "GET", headers });
    if (headers.apikey !== KEY || headers.Authorization !== `Bearer ${KEY}`) return respond(401, { code: "401", message: "Invalid API key" });
    const rpc = u.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
    if (rpc && (init.method || "GET") === "POST") {
      const args = JSON.parse(init.body || "{}");
      try { return respond(200, applyRpc(state, rpc[1], args, { strictClaim: true })); }
      catch (e) { if (e.pgRaise) return respond(400, { code: "P0001", message: e.message }); throw e; }
    }
    const table = u.pathname.match(/^\/rest\/v1\/([a-z0-9_]+)$/);
    if (table && (init.method || "GET") === "GET") {
      let rows = clone(state.tables[table[1]] || []);
      for (const [k, v] of u.searchParams.entries()) {
        if (k === "select" || k === "order" || k === "limit" || k === "offset") continue;
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
  return { fetchImpl, requests };
}

// ---------------- the board double (loop-acceptance pattern) ------

function boardFor(p) {
  const fam = { atsFamily: p.atsFamily };
  if (/TestCo 11/.test(p.company || "")) return Object.assign({}, Portal.createSandboxBoard({ captchaAt: "open" }), fam);
  if (/TestCo 7/.test(p.company || "")) {
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

// ---------------- the full executor cycle over a given store ------

async function runCycle(t, store, sources, state) {
  const skeleton = Batch.serializeRun(Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 15, now: NOW }));
  seedIntent(state, { userId: USER, intentId: "intent-prepare-1", binding: { action: "prepare", run_id: skeleton.id, family_text: "software engineering intern" }, run: skeleton });
  const executor = createBatchExecutor({ store, postingsFor: sources.postingsFor, profileFor: sources.profileFor, boardForFor: () => boardFor, now: () => NOW });

  const drain1 = await executor.runBatchPending();
  assert.equal(drain1.length, 1);
  assert.equal(drain1[0].status, "completed", `prepare completes: ${JSON.stringify(drain1)}`);
  assert.equal(drain1[0].doorstep, 13, "13 doorsteps from the wired pool (20 found, 1 duplicate, 1 knockout, 15 selected, captcha + uncovered named)");

  const record = await store.readRun({ userId: USER, runId: skeleton.id });
  assert.ok(record && record.run, "the prepared run is stored");
  assert.equal(record.status, "awaiting_approval");
  assert.ok(record.run.cardSha256, "the card hash is on the stored run");

  seedIntent(state, { userId: USER, intentId: "intent-approve-1", binding: { action: "approve", run_id: skeleton.id, card_sha256: record.run.cardSha256 } });
  const executor2 = createBatchExecutor({ store, postingsFor: sources.postingsFor, profileFor: sources.profileFor, boardForFor: () => boardFor, now: () => NOW });
  const drain2 = await executor2.runBatchPending();
  assert.equal(drain2.length, 1);
  assert.equal(drain2[0].status, "completed", `approve completes: ${JSON.stringify(drain2)}`);
  assert.equal(drain2[0].submitted, 13, "13 submitted with the wired inputs");
  assert.equal(drain2[0].confirmations.length, 13);
  assert.ok(drain2[0].confirmations.every((c) => /^SBX-/.test(String(c.confirmationId))), "confirmations are the sandbox board's (test composition — no employer claim)");

  const ledger = await store.ledgerFor(USER);
  assert.equal(ledger.records.filter((r) => r.status === "submitted").length, 13, "the cap ledger holds the 13 submissions");

  const drain3 = await executor2.runBatchPending();
  assert.deepEqual(drain3, [], "a third drain re-executes nothing (claim-once)");

  const secondClaim = await store.claim({ userId: USER, intentId: "intent-prepare-1" });
  assert.equal(secondClaim, null, "a direct second claim on a completed intent resolves claimed:false — never a throw, never a re-drive");
}

function seededState() {
  const state = emptyState();
  state.tables.career_kb_postings = clone(KB_ROWS);
  state.tables.agent_flow_state = [{
    thread_id: "00000000-0000-4000-8000-000000000002", user_id: USER, updated_at: "2026-10-15T16:00:00Z",
    state: { career: { v: 1, stores: { profile: clone(STORED_MASTER) } } },
  }];
  return state;
}

// ---------------- transport units ----------------

test("transport: unconfigured construction fails fast and named", () => {
  assert.throws(() => createSupabaseTransport({}), (e) => e.code === "SUPABASE_TRANSPORT_NOT_WIRED");
  assert.throws(() => createSupabaseTransport({ baseUrl: BASE }), (e) => e.code === "SUPABASE_TRANSPORT_NOT_WIRED");
  assert.throws(() => createSupabaseTransport({ serviceRoleKey: KEY }), (e) => e.code === "SUPABASE_TRANSPORT_NOT_WIRED");
});

test("transport: call() speaks PostgREST RPC wire shape; table reads carry filters/order/limit", async () => {
  const state = seededState();
  const { fetchImpl, requests } = createFakePostgrestFetch(state);
  const transport = createSupabaseTransport({ baseUrl: BASE, serviceRoleKey: KEY, fetchImpl });
  const data = await transport.call("career_batch_pending_v1", {});
  assert.deepEqual(data, { intents: [] });
  const rpcReq = requests.find((r) => r.url.includes("/rpc/"));
  assert.equal(rpcReq.url, `${BASE}/rest/v1/rpc/career_batch_pending_v1`);
  assert.equal(rpcReq.method, "POST");
  assert.equal(rpcReq.headers.apikey, KEY);
  assert.equal(rpcReq.headers.Authorization, `Bearer ${KEY}`);

  const rows = await transport.readRows({ table: "career_kb_postings", select: "posting_key,title", order: { column: "posted_at", ascending: false }, limit: 5 });
  assert.equal(rows.length, 5);
  const readReq = requests.find((r) => r.url.includes("career_kb_postings"));
  assert.ok(readReq.url.includes("select=posting_key"), "select is projected");
  assert.ok(readReq.url.includes("order=posted_at.desc"), "order is carried");
  assert.ok(readReq.url.includes("limit=5"), "limit is carried");
});

test("transport: an HTTP failure throws coded and never leaks the key", async () => {
  const failingFetch = async () => new Response(JSON.stringify({ code: "500", message: "internal" }), { status: 500, headers: { "content-type": "application/json" } });
  const transport = createSupabaseTransport({ baseUrl: BASE, serviceRoleKey: KEY, fetchImpl: failingFetch });
  await assert.rejects(() => transport.call("career_batch_pending_v1", {}), (e) => {
    assert.equal(e.code, "BATCH_RPC_TRANSPORT_FAILED");
    assert.ok(!String(e.message).includes(KEY), "the error never carries the service-role key");
    return true;
  });
});

// ---------------- wired sources units ----------------

test("sources: profileFor resolves the pack from the user's stored record — verbatim, nothing fabricated", async () => {
  const state = seededState();
  const { fetchImpl } = createFakePostgrestFetch(state);
  const transport = createSupabaseTransport({ baseUrl: BASE, serviceRoleKey: KEY, fetchImpl });
  const sources = createProductionSources({ transport, jobs: CareerJobs, probeUrl: async () => 200 });
  const pack = await sources.profileFor(USER);
  assert.equal(pack.profileMaster.basics.name, "Alex Testcase (TEST)", "the master is the stored record");
  assert.equal(pack.profile.name, "Alex Testcase (TEST)");
  assert.equal(pack.profile.email, "alex.testcase@example.test");
  assert.equal(pack.profile.phone, "+1 000 555 0100");
  assert.equal(pack.profile.location, "Chicago, IL");
  assert.deepEqual(pack.profile.resume, { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) });
  assert.equal(pack.profile.answers.work_authorization.value, "Yes — authorized to work in the US", "stored answers ride verbatim");
  assert.deepEqual(pack.attestations, { certify_true: { value: true, explicit: true } }, "stored attestations ride verbatim");
});

test("sources: a user with no stored profile gets the named stop, and postingsFor serves the KB pool", async () => {
  const state = seededState();
  state.tables.agent_flow_state = [];
  const { fetchImpl } = createFakePostgrestFetch(state);
  const transport = createSupabaseTransport({ baseUrl: BASE, serviceRoleKey: KEY, fetchImpl });
  const sources = createProductionSources({ transport, jobs: CareerJobs, probeUrl: async () => 200 });
  await assert.rejects(() => sources.profileFor(USER), (e) => e.code === "BATCH_PROFILE_NOT_FOUND");
  const pool = await sources.postingsFor(USER, "software engineering intern", 15);
  assert.equal(pool.length, 20, "the pool is the KB market, mapped");
  assert.ok(pool.every((p) => p.fetched_on === "2026-10-14"), "freshness rides the worker pool too");
  assert.equal(pool[0].role_family, "SWE");
});

// ---------------- the cycle over both store bindings --------------

test("cycle over Lane D's file-backed stand-in: prepare -> approve -> 13 submitted, claim-once", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "career-worker-wiring-"));
  const state = seededState();
  const standIn = createFileStandIn(path.join(dir, "batch-state.json"), state);
  const store = createBatchRpcStore({ call: standIn.call });
  const { fetchImpl } = createFakePostgrestFetch(state);
  const transport = createSupabaseTransport({ baseUrl: BASE, serviceRoleKey: KEY, fetchImpl });
  const sources = createProductionSources({ transport, jobs: CareerJobs, probeUrl: async () => 200 });
  await runCycle(test, store, sources, state);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "batch-state.json"), "utf8"));
  assert.ok(onDisk.intents.find((i) => i.intent_id === "intent-approve-1" && i.state === "completed"), "the stand-in's file holds the completed cycle");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("cycle over the production transport (PostgREST, SQL claim semantics): identical outcome", async () => {
  const state = seededState();
  const { fetchImpl } = createFakePostgrestFetch(state);
  const transport = createSupabaseTransport({ baseUrl: BASE, serviceRoleKey: KEY, fetchImpl });
  const store = createBatchRpcStore({ call: transport.call });
  const sources = createProductionSources({ transport, jobs: CareerJobs, probeUrl: async () => 200 });
  await runCycle(test, store, sources, state);
});

test("executor: a missing stored profile finishes the prepare intent blocked with the named code — nothing fabricated, no run written", async () => {
  const state = seededState();
  state.tables.agent_flow_state = [];
  const standIn = createFileStandIn(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "career-worker-wiring-")), "batch-state.json"), state);
  const store = createBatchRpcStore({ call: standIn.call });
  const { fetchImpl } = createFakePostgrestFetch(state);
  const transport = createSupabaseTransport({ baseUrl: BASE, serviceRoleKey: KEY, fetchImpl });
  const sources = createProductionSources({ transport, jobs: CareerJobs, probeUrl: async () => 200 });
  const skeleton = Batch.serializeRun(Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 15, now: NOW }));
  seedIntent(state, { userId: USER, intentId: "intent-prepare-noprofile", binding: { action: "prepare", run_id: skeleton.id, family_text: "software engineering intern" }, run: skeleton });
  const executor = createBatchExecutor({ store, postingsFor: sources.postingsFor, profileFor: sources.profileFor, boardForFor: () => boardFor, now: () => NOW });
  const drain = await executor.runBatchPending();
  assert.equal(drain.length, 1);
  assert.equal(drain[0].status, "blocked");
  assert.equal(drain[0].code, "BATCH_PROFILE_NOT_FOUND", "the stop is named, in the product's own records");
  assert.equal(state.runs.size, 0, "no run was written from a fabricated profile");
  assert.equal(state.intents.get("intent-prepare-noprofile").state, "blocked");
});
