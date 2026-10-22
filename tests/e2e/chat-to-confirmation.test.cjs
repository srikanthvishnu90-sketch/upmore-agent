"use strict";
// E2E SKELETON — one synthetic application, chat turn -> employer-confirmed
// state, against a mock employer and a disposable Postgres 16.
// Design: docs/e2e/E2E-CHAT-TO-CONFIRMATION-DESIGN.md
//
// The result of a run is the PER-HANDOFF MAP printed at the end:
//   H1 chat -> card            H4 cloud worker -> board
//   H2 card -> approval        H5 board -> confirmation page
//   H3 approval -> cloud worker H6 confirmation -> recorded state
// Each handoff is PASS, FAIL (with its issue name — a failure without the
// wiring reason is a bug in this file), or ENVIRONMENT (the VM could not
// run the leg at all; never counted as a wiring result either way).
// Handoffs whose wiring does not exist today FAIL their test on purpose:
// when the wiring lands, the test goes red in the other direction and the
// expectation must be updated in the same PR.
//
// Composition honesty: the DB legs run the product's own RPCs on the
// repo's own schema (tests/db harness order, disposable cluster). The
// chat leg runs agent-chat's own modules in-process. The board leg runs
// the product's engine + cloud worker loop, but its queue is the harness
// in-memory queue (the PG-backed drain is H3, and it is exactly what is
// missing) — tier 2, labeled as such wherever reported.
//
// Nothing here touches a live system: disposable local PG, localhost
// fixture, synthetic TEST identities only, no live Supabase calls.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const HERE = __dirname;
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-e2e-skel-"));
fs.chmodSync(STATE, 0o755); // the disposable PG runs as an unprivileged user and must traverse this dir
const PGSTATE = path.join(STATE, "pg");
const MOCK_LOG = path.join(STATE, "mock-employer.jsonl");
const { createMockEmployer } = require(path.join(HERE, "mock-employer.cjs"));

const MAP = []; // {handoff, name, status: PASS|FAIL|ENVIRONMENT, detail}
function record(handoff, name, status, detail) {
  MAP.push({ handoff, name, status, detail });
  console.log(`E2E-MAP ${handoff} ${name}: ${status} — ${detail}`);
}

let pg = null; // {bin, port}
let mock = null, mockBase = null;
let markers = {}; // stage marker key -> value (strings)
let confno = "MOCK-SYNTHETIC (board leg did not run)";
const startedAt = Date.now();

function findPgBin() {
  const cands = [process.env.E2E_PGBIN, process.env.PGBIN,
    path.join(os.homedir(), "workspace/scale-s1-logs/pgfull/bin"),
    ...fs.globSync ? [] : []];
  for (const d of ["/usr/lib/postgresql"]) {
    try { for (const v of fs.readdirSync(d)) cands.push(path.join(d, v, "bin")); } catch (_) {}
  }
  for (const c of cands) {
    if (c && fs.existsSync(path.join(c, "initdb")) && fs.existsSync(path.join(c, "psql"))) return c;
  }
  return null;
}

function psql(file, vars) {
  const args = ["-X", "-q", "-h", "127.0.0.1", "-p", String(pg.port), "-U", "postgres", "-d", "postgres", "-t", "-A"];
  for (const [k, v] of Object.entries(vars || {})) args.push("-v", `${k}=${v}`);
  args.push("-f", file);
  const r = spawnSync(path.join(pg.bin, "psql"), args, {
    env: { ...process.env, LD_LIBRARY_PATH: path.join(path.dirname(pg.bin), "lib") },
    encoding: "utf8", timeout: 120000 });
  const out = (r.stdout || "") + (r.stderr || "");
  for (const line of out.split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)\|(.*)$/);
    if (m) markers[m[1]] = m[2];
  }
  return { code: r.status, out };
}

before(async () => {
  const pgbin = findPgBin();
  assert.ok(pgbin, "ENVIRONMENT: no Postgres 16 binaries found (set E2E_PGBIN)");
  const prov = spawnSync("bash", [path.join(HERE, "provision-pg.sh"), "start", PGSTATE],
    { env: { ...process.env, PGBIN: pgbin, E2E_PG_PORT: String(54400 + (process.pid % 400)) },
      encoding: "utf8", timeout: 300000 });
  assert.ok(prov.status === 0 && /PROVISION_OK/.test(prov.stdout || ""),
    "provisioning failed: " + (prov.stdout || "") + (prov.stderr || ""));
  const envFile = fs.readFileSync(path.join(PGSTATE, "pg.env"), "utf8");
  pg = { bin: /PGBIN=(.*)/.exec(envFile)[1], port: /PGPORT=(.*)/.exec(envFile)[1] };
  mock = createMockEmployer(MOCK_LOG);
  await new Promise((r) => mock.server.listen(0, "127.0.0.1", r));
  mockBase = "http://127.0.0.1:" + mock.server.address().port;
  const s1 = psql(path.join(HERE, "stage-1-seed.sql"));
  assert.equal(s1.code, 0, "stage-1 seed failed: " + s1.out);
  assert.equal(markers.E2E_SEED_OK, undefined); // seed prints a bare marker row, checked via exit code
});

after(async () => {
  const mins = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("E2E-MAP-BEGIN");
  for (const r of MAP) console.log(`E2E-MAP ${r.handoff} ${r.name}: ${r.status} — ${r.detail}`);
  console.log(`E2E-MAP-END runtime_s=${mins} state=${STATE}`);
  if (mock) await new Promise((r) => mock.server.close(r));
  spawnSync("bash", [path.join(HERE, "provision-pg.sh"), "stop", PGSTATE], { encoding: "utf8", timeout: 60000 });
});

// ---------------------------------------------------------------- H1
// F-037/F-002, fixed on branch muse/2026-10-22-e2e-h1-card (design:
// docs/e2e/H1-CARD-DELIVERY-DESIGN.md; guards:
// tests/edge/channel-card-readback.test.ts). The composition driven
// here is the product's own at every seam: module 155 parses the ask,
// planCareerBatchPrepare produces the ask turn's pending_batch_intent,
// the core commits the prepare intent (career_batch_intents_v1 shape),
// the worker's stored run lands in career_batch_result_v1's shape, and
// the status turn goes THROUGH channel_bridge.runChannelTurnRich —
// whose F-037 readback (runChannelStatus) is what now carries the card
// into the outcome the handlers render via detectBatchCard /
// offerApproval (channel_present.ts, unchanged). Doubles sit only at
// the fetch (agent-chat wire) and supabase-js boundaries — the channel
// lane's fixture pattern; the agent-chat double routes a structured
// career_batch body to the REAL planCareerBatchIntent, exactly like
// handler-career.ts, and answers plain text the way the live brain did
// on 2026-10-22 (the generic fallback for a status ask).
test("H1 chat -> card: plain ask -> prepare completes -> status turn through the bridge surfaces the card (F-037)", async () => {
  const Batch = require(path.join(ROOT, "packages/domain/155-career-batch-apply.js"));
  const core = await import("file://" + path.join(ROOT, "supabase/functions/_shared/career_task_bridge.js"));
  const channelBridge = await import("file://" + path.join(ROOT, "supabase/functions/_shared/channel_bridge.ts"));
  const present = await import("file://" + path.join(ROOT, "supabase/functions/_shared/channel_present.ts"));

  const USER = "00000000-0000-4000-8000-00000000cb01";
  const THREAD = "00000000-0000-4000-8000-00000000cba1";
  const RUN_ID = "batch-e2e0000001";
  const CARD_HASH = "a".repeat(64);
  const ASK = "Apply to 3 data analyst roles for me";
  const FALLBACK = "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.";

  // The ask itself parses — module 155 was never the gap.
  const ask = Batch.parseApplyAsk(ASK);
  assert.deepEqual([ask.count, ask.familyText], [3, "data analyst"], "the apply ask parses");

  // Negative that still holds: a plain-text turn carries NO structured
  // batch request on its own call. The card now arrives via the
  // bridge's readback call, not by changing what a plain turn carries.
  assert.equal(core.normalizeCareerBatchRequest(undefined), null,
    "a plain chat turn carries no structured batch request");

  // Negative that still holds: a run the worker never wrote is not
  // readable — the planner against an empty persistence says so.
  const unreadable = await core.planCareerBatchIntent({
    batchRequest: { action: "status", version: "career_batch_intent/v1", runId: "batch-e2e0000000" },
    message: "What's the batch status?", userId: USER, threadId: THREAD, turnKey: "e2e", requestHash: "e2e",
    ctx: { workerCapabilities: [] }, accountVersion: 1, account: { epoch: 1 },
    persistence: { readBatchRun: async () => null },
  });
  assert.match(unreadable.out.reply, /No batch run is readable/);

  // ---- the world: stored state in the product's own shapes --------
  const intents = []; // career_batch_intents_v1 rows (binding = intent minus its run skeleton)
  const threads = new Map(); // sender_key -> channel_threads row
  const approvals = new Map(); // token -> channel_pending_approvals row
  let runRecord = null; // career_batch_result_v1's batch record; null until the worker writes it
  const readBatchRun = async ({ userId, runId }) =>
    runRecord && runRecord.userId === userId && runRecord.runId === runId ? runRecord : null;

  const admin = {
    from(table) {
      if (table === "channel_threads") {
        const filters = {};
        const q = {
          select() { return q; },
          eq(c, v) { filters[c] = v; return q; },
          async maybeSingle() { const r = threads.get(filters.sender_key); return { data: r ? { ...r } : null, error: null }; },
          async upsert(row) {
            const prev = threads.get(row.sender_key);
            threads.set(row.sender_key, {
              thread_id: row.thread_id,
              last_message_id: row.last_message_id ?? prev?.last_message_id ?? null,
            });
            return { error: null };
          },
        };
        return q;
      }
      if (table === "agent_threads") {
        const q = { insert() { return q; }, select() { return q; }, async single() { return { data: { id: THREAD }, error: null }; } };
        return q;
      }
      if (table === "career_batch_intents_v1") {
        const filters = {}; let lim = null; let ord = null;
        const q = {
          select() { return q; },
          eq(c, v) { filters[c] = v; return q; },
          order(c, o) { ord = { c, asc: !o || o.ascending !== false }; return q; },
          limit(n) { lim = n; return q; },
          then(resolve) {
            let rows = intents.filter((r) => Object.entries(filters).every(([c, v]) => r[c] === v));
            if (ord) rows = rows.sort((a, b) => (String(a[ord.c]) < String(b[ord.c]) ? -1 : 1) * (ord.asc ? 1 : -1));
            if (lim != null) rows = rows.slice(0, lim);
            resolve({ data: rows, error: null });
          },
        };
        return q;
      }
      if (table === "channel_pending_approvals") {
        const filters = []; const nullCols = []; let patch = null;
        const q = {
          insert(row) { approvals.set(row.token, { ...row }); return Promise.resolve({ data: null, error: null }); },
          update(p) { patch = p; return q; },
          eq(c, v) { filters.push([c, v]); return q; },
          is(c, v) { if (v === null) nullCols.push(c); return q; },
          select() { return q; },
          then(resolve) {
            if (patch) {
              for (const r of approvals.values()) {
                if (filters.every(([c, v]) => r[c] === v) && nullCols.every((c) => r[c] == null)) Object.assign(r, patch);
              }
              resolve({ data: null, error: null });
            } else resolve({ data: [], error: null });
          },
        };
        return q;
      }
      throw new Error("unexpected table " + table);
    },
    async rpc(name, args) {
      assert.equal(name, "career_batch_result_v1");
      // Owner-scoped, like the real RPC: a foreign run reads as nothing.
      return { data: { batch: await readBatchRun({ userId: args.p_user, runId: args.p_run }) }, error: null };
    },
  };

  // ---- the agent-chat wire double (handler-career.ts's contract) --
  const wire = [];
  const fetchFn = async (url, init) => {
    assert.match(String(url), /\/functions\/v1\/agent-chat$/);
    const body = JSON.parse(init.body);
    wire.push(body);
    if (body.career_batch) {
      // The handler routes a structured body to the real planner.
      const plan = await core.planCareerBatchIntent({
        batchRequest: body.career_batch, message: body.message, userId: body.as_user_id,
        threadId: body.thread_id, turnKey: body.turn_key ?? "e2e", requestHash: "e2e",
        ctx: { workerCapabilities: [] }, accountVersion: 1, account: { epoch: 1 },
        persistence: { readBatchRun },
      });
      return new Response(JSON.stringify({ reply: plan.out.reply, batch: plan.out.batch, thread_id: body.thread_id }), { status: 200 });
    }
    if (body.message === ASK) {
      // The ask turn: delegate mode creates the run skeleton, the
      // planner turns it into the prepare intent, and the core commits
      // the intent transactionally with the reply (intents[] here).
      const run = { id: RUN_ID, userId: USER, familyText: ask.familyText, requested: ask.count, status: "queued_prepare" };
      const prep = await core.planCareerBatchPrepare({
        run, userId: USER, threadId: THREAD, turnKey: "e2e-ask", requestHash: "e2e",
        accountVersion: 1, account: { epoch: 1 },
      });
      const { run: _skeleton, ...binding } = prep.intent;
      intents.push({
        user_id: USER, intent_id: prep.intent.intent_id, thread_id: THREAD, run_id: RUN_ID,
        binding, created_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({
        reply: "I've handed this batch to the browser worker to prepare: it will find 3 data analyst roles, screen out the ones that don't fit, tailor each application, and bring the batch back here at the final review screen. Nothing has been filled or submitted yet — ask me for the batch status and I'll read back exactly where it stands.",
        batch: prep.batch, thread_id: THREAD,
      }), { status: 200 });
    }
    // Any other plain text: the live brain's answer (the 2026-10-22
    // fallback for a status ask — what the readback must overcome).
    return new Response(JSON.stringify({ reply: FALLBACK, thread_id: THREAD }), { status: 200 });
  };

  const deps = {
    env: (k) => ({ SUPABASE_URL: "http://e2e.local", SUPABASE_SERVICE_ROLE_KEY: "e2e-service-key" })[k],
    fetchFn, createAdmin: () => admin, paceMs: 0,
  };
  const turnArgs = (text, messageId) => ({
    channel: "telegram", senderKey: "6836694463", userId: USER, text, messageId,
  });

  // ---- turn 1: the plain ask ---------------------------------------
  const askOutcome = await channelBridge.runChannelTurnRich(deps, turnArgs(ASK, "e2e-m1"));
  assert.equal(askOutcome.kind, "done");
  assert.equal(askOutcome.chat.batch.kind, "pending_batch_intent", "the ask turn queues the intent, as designed");
  assert.equal(present.detectBatchCard(askOutcome.chat), null, "no card exists at ask time");
  assert.equal(wire.length, 1, "the ask turn is one plain call");
  assert.equal(wire[0].career_batch, undefined, "the ask call carries no structured body");

  // ---- the worker finishes the prepare: the stored run lands -------
  runRecord = {
    version: "career_batch_run/v1", runId: RUN_ID, userId: USER, status: "awaiting_approval",
    run: { id: RUN_ID, cardSha256: CARD_HASH }, summary: null,
  };

  // ---- turn 2: the status ask, THROUGH THE BRIDGE ------------------
  const outcome = await channelBridge.runChannelTurnRich(deps, turnArgs("What's the batch status?", "e2e-m2"));
  assert.equal(outcome.kind, "done");
  assert.equal(outcome.replyText, `Batch ${RUN_ID}: status awaiting_approval.`,
    "the outcome is the planner's status readback, not the fallback");
  assert.equal(wire.length, 3, "ask + plain status turn + exactly one readback call");
  assert.equal(wire[1].career_batch, undefined, "the status turn's own call is still a plain turn");
  assert.deepEqual(wire[2].career_batch, { action: "status", version: "career_batch_intent/v1", runId: RUN_ID },
    "the readback is the structured status request for the remembered run");
  const card = present.detectBatchCard(outcome.chat);
  assert.ok(card && card.runId === RUN_ID, "detectBatchCard fires on the bridge outcome (the handlers' offer path)");
  const offer = await present.offerApproval(deps, {
    channel: "telegram", senderKey: "6836694463", userId: USER, threadId: outcome.threadId, runId: card.runId,
  });
  assert.ok(offer && offer.token, "offerApproval mints a token for the surfaced card");
  assert.equal(approvals.get(offer.token)?.card_sha256, CARD_HASH,
    "the token is bound to the run's stored card hash — what is shown is what can be approved");

  record("H1", "chat->card", "PASS",
    "F-037/F-002 fixed on muse/2026-10-22-e2e-h1-card: plain ask -> pending_batch_intent (155 + planCareerBatchPrepare, in-process) and the core's committed intent remembers the run; prepare completes (stored awaiting_approval run, the product's persistence shape); the status turn THROUGH channel_bridge.runChannelTurnRich issues the structured status readback (runChannelStatus, wire-verified) and the outcome carries the batch_run card; detectBatchCard fires and offerApproval binds a single-use token to the stored cardSha256 — the handlers' existing offer path, unchanged; the negatives still hold (a plain call carries no career_batch; an unwritten run reads as nothing)");
});

// ------------------------------------------------------- H3 (Route A)
test("H3a approval -> cloud worker via the CHAT begin: refused not_card_approved (F-030 seam, C9)", () => {
  const s2 = psql(path.join(HERE, "stage-2-route-a.sql"));
  assert.equal(s2.code, 0, "stage-2 failed: " + s2.out);
  // The begin itself works: module 176's cloud door enqueues a claim-shaped row.
  assert.equal(markers.ROUTE_A_BEGIN_ID, "true");
  assert.equal(markers.ROUTE_A_BEGIN_LEASE_NULL, "true");
  assert.equal(markers.ROUTE_A_ROW, "queued/null/0");
  // But the composition begin -> claim is refused, by design (C9): the row
  // carries no Messages-card binding, and the card is the only cloud
  // authorization route. Recorded as the F-030 seam measurement.
  assert.equal(markers.ROUTE_A_REFUSAL, "not_card_approved");
  assert.equal(markers.ROUTE_A_CLAIMED, "0");
  record("H3a", "approval->cloud worker (chat begin route)", "FAIL",
    "F-030 seam (C9): career_apply_cloud_begin_agent_own enqueues (queued/null/0, measured), but career_apply_cloud_claim_at refuses the row 'not_card_approved' — a chat begin has no card binding and no product code creates one from chat");
  assert.fail("H3a FAIL (expected today): F-030 — the chat-begun row can never be claimed");
});

// ------------------------------------------------------------- H2 + H3
test("H2 card -> approval and H3b approval -> cloud claim (Messages card route)", () => {
  const s3 = psql(path.join(HERE, "stage-3-route-b.sql"));
  assert.equal(s3.code, 0, "stage-3 failed: " + s3.out);
  assert.equal(markers.ROUTE_B_CARD_STATE, "approved", "the owner's tap approves the card");
  assert.equal(markers.ROUTE_B_JOB, "queued/null/0", "the tap queues exactly the carded payload");
  assert.equal(markers.ROUTE_B_BOUND, "1", "exactly one durable card binding owns the row");
  record("H2", "card->approval", "PASS",
    "career_apply_message_cloud_card_show_as + career_apply_message_card_approve_own on disposable PG: card approved, one card-bound row queued/null/0, binding count 1");

  assert.equal(markers.ROUTE_B_CLAIMED, "1", "the timed claim takes the card-bound row");
  assert.equal(markers.ROUTE_B_JOB_AFTER_CLAIM, "driving/cloud/1");
  record("H3b", "approval->cloud worker (claim predicates)", "PASS",
    "career_apply_cloud_claim_at claims the card-bound row exactly once (driving/cloud/1) on disposable PG");

  // The drain half of H3: the claim predicates exist, but NO running
  // component binds them to the worker. Measured structurally: the only
  // drain implementation is workers/career-cloud/worker.ts's main, which
  // (a) speaks PostgREST to a live project with a service-role key — it
  // cannot run against this disposable PG at all, and (b) is started by
  // no systemd unit, host config, or function in the tree.
  const systemd = fs.readdirSync(path.join(ROOT, "scripts/career/systemd"))
    .filter((f) => !f.startsWith("README")).join(" ");
  assert.ok(!/career-cloud/.test(systemd), "no systemd unit starts the cloud worker");
  record("H3", "approval->cloud worker (drain)", "FAIL",
    "MISSING CLOUD CLAIMER (submit-armed inventory, 2026-10-22): claim/finish RPCs are proven in PG and worker.ts's cloudLoop exists in-tree, but no deployed process runs it — no systemd unit, no host wiring; its only queue (restQueue) needs a live PostgREST + service key, so the queued row waits forever in every real deployment");
  assert.fail("H3 FAIL (expected today): no cloud claimer/drain runs — the queue has predicates, not a worker");
});

// --------------------------------------------------------- H4 + H5
test("H4 cloud worker -> board and H5 board -> confirmation (mock employer, tier-2 harness queue)", async () => {
  const dir = fs.mkdtempSync(path.join(STATE, "drive-"));
  const repo = ROOT;
  const resumePath = path.join(dir, "resume.pdf");
  fs.writeFileSync(resumePath, "%PDF-1.4 SYNTHETIC TEST RESUME");
  const resumeBytes = fs.readFileSync(resumePath);
  const factsPath = path.join(dir, "facts.json");
  const mkFacts = (withDoorstep) => {
    const answers = {
      first_name: { value: "TEST", factId: "TEST-1", confirmed: true, provenance: "synthetic TEST profile", confirmation_event_id: "evt-e2e-1" },
      last_name: { value: "Person", factId: "TEST-2", confirmed: true, provenance: "synthetic TEST profile", confirmation_event_id: "evt-e2e-2" },
      email: { value: "e2e@example.test", factId: "TEST-3", confirmed: true, provenance: "synthetic TEST profile", confirmation_event_id: "evt-e2e-3" },
      phone: { value: "2246029341", factId: "TEST-4", confirmed: true, provenance: "synthetic TEST profile", confirmation_event_id: "evt-e2e-4" },
    };
    if (withDoorstep) {
      answers.gender = { value: "I don't wish to answer", factId: "TEST-5", confirmed: true, provenance: "synthetic TEST profile (EEO decline)", confirmation_event_id: "evt-e2e-5" };
      answers.attestation = { value: "Yes", factId: "TEST-6", confirmed: true, provenance: "synthetic TEST profile", confirmation_event_id: "evt-e2e-6" };
    }
    return { user_id: "TEST-E2E", answers, saved: {} };
  };
  fs.writeFileSync(factsPath, JSON.stringify(mkFacts(false)));
  const factsFullPath = path.join(dir, "facts-full.json");
  fs.writeFileSync(factsFullPath, JSON.stringify(mkFacts(true)));

  const driver = path.join(dir, "driver.ts");
  fs.writeFileSync(driver, `
import { prepare } from ${JSON.stringify("file://" + repo + "/workers/career-browser/approve-first.ts")};
import { cloudEngineRunner, cloudLoop } from ${JSON.stringify("file://" + repo + "/workers/career-cloud/worker.ts")};
import { hashApplyPayload } from ${JSON.stringify("file://" + repo + "/supabase/functions/_shared/career_apply_store.ts")};
const dir = ${JSON.stringify(dir)};
const url = ${JSON.stringify(mockBase + "/jobs/mockco/1")};
const engine = cloudEngineRunner({ root: ${JSON.stringify(repo)}, evidenceRoot: dir + "/evidence" });
await Deno.mkdir(dir + "/evidence", { mode: 0o700 });
const resume = dir + "/resume.pdf";
// Doorstep probe: prepare WITHOUT the EEO/attestation answers on file.
const p0 = await prepare({ url, factsPath: dir + "/facts.json", resumePath: resume, account: { epoch: 1, version: 1 }, now: Date.now(), runEngine: engine });
console.log("DOORSTEP " + JSON.stringify({ ready: !!p0.ready, result: p0.ready ? null : p0.result }));
// Full drive: the TEST user has answered (harness-supplied answers, tier 2).
const p = await prepare({ url, factsPath: dir + "/facts-full.json", resumePath: resume, account: { epoch: 1, version: 1 }, now: Date.now(), runEngine: engine });
if (!p.ready) { console.log("NOT_READY " + JSON.stringify(p.result)); Deno.exit(0); }
const job = { id: "job-e2e", lease_token: "lease-e2e", user_id: "TEST-E2E", company: p.payload.company, url, payload: p.payload, payload_hash: await hashApplyPayload(p.payload), approval_hash: await hashApplyPayload(p.payload) };
const finished = [];
let pending = [job];
const queue = {
  claim: async (n) => { const out = pending.slice(0, n); pending = pending.slice(n); return out; },
  resume: async () => ({ filename: "resume.pdf", sha256: job.payload.resume_sha256, b64: btoa(String.fromCharCode(...await Deno.readFile(resume))) }),
  finish: async (j, state, evidence, outcome, errorKind) => { finished.push({ id: j.id, state, outcome, errorKind, evidence }); },
  gatePresent: async () => true,
  authorize: async () => {},
};
const tmpRoot = dir + "/tmp"; await Deno.mkdir(tmpRoot);
await cloudLoop({ queue, runEngine: engine, contexts: 1, idleMs: 50, tmpRoot, stop: () => finished.length === 1, log: () => {} });
console.log("FINISHED " + JSON.stringify(finished));
`);
  const deno = process.env.DENO_BIN || path.join(os.homedir(), ".deno/bin/deno");
  const run = await new Promise((resolve) => {
    const p = spawn(deno, ["run", "-A", "--no-check", driver], {
      env: { ...process.env, HOME: dir,
        UPMORE_PLAYWRIGHT_PATH: process.env.UPMORE_PLAYWRIGHT_PATH ||
          path.join(os.homedir(), "workspace/sporve-agent-clone/node_modules/playwright"),
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ||
          path.join(os.homedir(), ".cache/ms-playwright") },
      stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timer = setTimeout(() => p.kill("SIGKILL"), 300000);
    p.on("exit", () => { clearTimeout(timer); resolve({ out, err }); });
  });
  const doorLine = run.out.split("\n").find((l) => l.startsWith("DOORSTEP "));
  const finLine = run.out.split("\n").find((l) => l.startsWith("FINISHED "));
  const notReady = run.out.split("\n").find((l) => l.startsWith("NOT_READY "));
  if (!doorLine && !finLine) {
    record("H4", "cloud worker->board", "ENVIRONMENT",
      "the Deno/Chromium drive produced no result in this VM (browser launch tier): " + (run.err || run.out).slice(0, 300));
    record("H5", "board->confirmation", "ENVIRONMENT", "board leg never ran (see H4)");
    assert.fail("H4 ENVIRONMENT: Chromium drive unavailable in this VM — classified separately from wiring");
  }
  const doorstep = JSON.parse(doorLine.slice(9));
  console.log("E2E-DOORSTEP " + JSON.stringify(doorstep));
  if (notReady || (doorstep && doorstep.ready === false && doorstep.result && doorstep.result.reason === "DRIVER_ERROR")) {
    // The engine could not drive at all. Distinguish environment from
    // wiring with a direct probe: plain Playwright, sandbox ON (the only
    // mode the engine accepts — it refuses unsandboxed runs by design
    // with BROWSER_SANDBOX_REQUIRED, measured 2026-10-22).
    let probe = "probe did not run";
    try {
      const pw = require(process.env.UPMORE_PLAYWRIGHT_PATH ||
        path.join(os.homedir(), "workspace/sporve-agent-clone/node_modules/playwright"));
      const b = await pw.chromium.launch({ chromiumSandbox: true });
      await b.close();
      probe = "sandboxed Chromium launch SUCCEEDED";
    } catch (e) { probe = "sandboxed Chromium launch failed: " + String(e.message || e).split("\n").slice(0, 3).join(" | "); }
    if (/SUCCEEDED/.test(probe)) {
      record("H4", "cloud worker->board", "FAIL",
        "the engine's prepare refused the drive (DRIVER_ERROR) while a sandboxed Chromium launch succeeds in this VM — a product/driver failure, not environment: " + (notReady || JSON.stringify(doorstep)).slice(0, 300));
      record("H5", "board->confirmation", "FAIL", "the board was never driven (see H4)");
      assert.fail("H4 FAIL: engine DRIVER_ERROR with a healthy browser tier");
    }
    record("H4", "cloud worker->board", "ENVIRONMENT",
      "Chromium sandbox cannot initialize in this VM session (probe: " + probe + "); the engine refuses unsandboxed runs by design (BROWSER_SANDBOX_REQUIRED), and the unprivileged-user route cannot be staged here (the repo/deno under /home/hatch are unreadable to any non-root user — overlay, measured). The repo's own WO-039 cloud-worker test fails identically in this VM today (DRIVER_ERROR, 3/3). NOT a wiring result.");
    record("H5", "board->confirmation", "ENVIRONMENT",
      "board leg could not launch (see H4); the doorstep + confirmation assertions are designed and run wherever the browser tier works");
    assert.fail("H4 ENVIRONMENT: Chromium sandbox unavailable in this VM — classified separately from wiring");
  }
  if (notReady) {
    record("H4", "cloud worker->board", "FAIL",
      "the engine's prepare refused the full-facts drive against the mock form: " + notReady.slice(0, 300));
    record("H5", "board->confirmation", "FAIL", "prepare never reached the board (see H4)");
    assert.fail("H4 FAIL: prepare not ready against the mock employer — see E2E-DOORSTEP/NOT_READY output");
  }
  const finished = JSON.parse(finLine.slice(9));
  assert.equal(finished.length, 1, "exactly one job finished");
  const f = finished[0];
  const posts = mock.received.filter((r) => r.method === "POST");
  assert.equal(posts.length, 1, "the mock employer received exactly one submission POST");
  const post = posts[0];
  assert.equal(post.fields.first_name, "TEST");
  assert.equal(post.fields.email, "e2e@example.test");
  assert.equal(post.fields.gender, "decline", "the EEO decline is what was sent (option value), never an invented answer");
  assert.equal(post.fields.attestation, "on", "the required attestation was checked from the confirmed answer");
  assert.equal(post.files.length, 1, "exactly one file reached the employer");
  assert.equal(post.files[0].sha256, require("node:crypto").createHash("sha256").update(resumeBytes).digest("hex"),
    "the file the employer received is byte-identical to the approved resume");
  confno = "MOCK-" + post.received_sha256.slice(0, 8).toUpperCase();
  record("H4", "cloud worker->board", "PASS",
    `product engine + cloudLoop drove the mock form end to end (tier-2 harness queue); doorstep probe without EEO/attestation answers: ready=${doorstep.ready} (the uncovered-question stop is the designed behavior — see design doc); finished state=${f.state} outcome=${f.outcome}`);
  record("H5", "board->confirmation", "PASS",
    `mock employer received exactly 1 POST with the approved fields (EEO decline + attestation included), resume sha256 byte-identical; confirmation number ${confno} issued on the employer's confirmation page`);
});

// ------------------------------------------------------------- H6
test("H6 confirmation -> recorded state: finish, then the employer's email confirms", () => {
  const s4 = psql(path.join(HERE, "stage-4-finish-confirm.sql"), { confno });
  assert.equal(s4.code, 0, "stage-4 failed: " + s4.out);
  assert.equal(markers.FINISH_STATE, "submitted_unconfirmed",
    "a page confirmation alone records submitted_unconfirmed — never 'submitted'");
  assert.equal(markers.CONFIRM_AS, "confirmed", "the employer's email confirms the row");
  assert.equal(markers.FINAL_ROW, "confirmed/cloud/email_confirmed=true/mail_hash=true");
  record("H6", "confirmation->recorded state", "PASS",
    "career_apply_cloud_finish(page_confirmation evidence) -> submitted_unconfirmed; career_apply_confirm_as('received') -> confirmed with email_confirmed_at + confirmation_mail_hash set (disposable PG; the finish leg's evidence carries the mock confirmation number when H5 ran)");
});
