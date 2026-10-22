"use strict";
// E2E SKELETON — one synthetic application, chat turn -> employer-confirmed
// state, against a mock employer and a disposable Postgres 16.
// Design: docs/e2e/E2E-CHAT-TO-CONFIRMATION-DESIGN.md
//
// The result of a run is the PER-HANDOFF MAP printed at the end:
//   H1 chat -> card            H4 cloud worker -> board
//   H2 card -> approval        H5 board -> confirmation page
//   H3 approval -> cloud worker H6 confirmation -> recorded state
//   H7 confirmed -> receipt in chat + loop status closure (every stage)
// Each handoff is PASS, FAIL (with its issue name — a failure without the
// wiring reason is a bug in this file), or ENVIRONMENT (the VM could not
// run the leg at all; never counted as a wiring result either way).
// Handoffs whose wiring does not exist today FAIL their test on purpose:
// when the wiring lands, the test goes red in the other direction and the
// expectation must be updated in the same PR.
//
// Composition honesty: the DB legs run the product's own RPCs on the
// repo's own schema (tests/db harness order, disposable cluster). The
// chat leg runs agent-chat's own modules in-process. The drain leg (H3)
// runs the product's own drain process (drain.ts -> cloudLoop over the
// PG queue) against the disposable cluster, with a stub engine. The
// board leg still runs the product's engine + cloud worker loop over
// the harness in-memory queue — tier 2, labeled as such wherever
// reported.
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
test("H3a approval -> cloud worker via the CHAT begin: bare begin refused (C9 control), the composed card route claimed (F-030 seam)", () => {
  const s2 = psql(path.join(HERE, "stage-2-route-a.sql"));
  assert.equal(s2.code, 0, "stage-2 failed: " + s2.out);
  // The begin itself works: module 176's cloud door enqueues a claim-shaped row.
  assert.equal(markers.ROUTE_A_BEGIN_ID, "true");
  assert.equal(markers.ROUTE_A_BEGIN_LEASE_NULL, "true");
  assert.equal(markers.ROUTE_A_ROW, "queued/null/0");
  // CONTROL (C9 intact): the bare begin -> claim composition is still
  // refused, by design: the row carries no Messages-card binding (and
  // the agent_batch_hash the binding check forbids), and the card is
  // the only cloud authorization route. A direct enqueue is still not
  // an authorization route — this half must never go green.
  assert.equal(markers.ROUTE_A_REFUSAL, "not_card_approved");
  assert.equal(markers.ROUTE_A_CLAIMED, "0");

  // THE COMPOSED ROUTE (composition A — the chat card mints the
  // binding, the claim enforces it): the same chat user takes an
  // approved application through the bridge's machinery — module
  // 176's beginCloudCardPostings verifies the item binds to the
  // approved entry and shows the card (career_apply_message_cloud_
  // card_show_as); the person's tap (career_apply_message_card_
  // approve_own -> cloud_tap) mints the approval + binding + queue
  // row; the claim takes it. Root cause + fix:
  // docs/apply/ROOT-CAUSE-F030-SEAM-CARD-BINDING-2026-10-22.md.
  const s2b = psql(path.join(HERE, "stage-2b-composed-card.sql"));
  assert.equal(s2b.code, 0, "stage-2b failed: " + s2b.out);
  assert.equal(markers.COMPOSED_CARD_STATE, "approved", "the chat user's tap approves the composed card");
  assert.equal(markers.COMPOSED_JOB, "queued/null/0", "the tap queues the carded payload");
  assert.equal(markers.COMPOSED_BOUND, "1", "exactly one durable card binding owns the composed row");
  assert.equal(markers.COMPOSED_HASH_BINDING, "true", "the claimed row's payload hash is the shown item's hash");
  assert.equal(markers.COMPOSED_REFUSAL, "none", "the composed row passes every refusal predicate");
  assert.equal(markers.COMPOSED_CLAIMED, "1", "the timed claim takes the composed row");
  assert.equal(markers.COMPOSED_JOB_AFTER_CLAIM, "driving/cloud/1");
  record("H3a", "approval->cloud worker (chat begin route)", "PASS",
    "F-030 seam closed by composition (A): the bare chat begin still refuses 'not_card_approved' (C9 control, stage 2), while the composed route — card shown via career_apply_message_cloud_card_show_as, tapped via career_apply_message_card_approve_own — mints the binding and career_apply_cloud_claim_at takes the row (driving/cloud/1, stage 2b, disposable PG)");
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
});

// ------------------------------------------------- H3 (the drain)
test("H3 approval -> cloud worker (drain): the PG drain claims and finishes a card-bound row", async () => {
  // Structural half: the claimer now exists in-tree — a systemd unit
  // source whose ExecStart is the drain entrypoint, the entrypoint,
  // and the Postgres queue beside worker.ts's restQueue. (The unit is
  // a repo source only: installing/enabling it is an owner step and
  // does not happen here.)
  const systemdDir = path.join(ROOT, "scripts/career/systemd");
  const unit = fs.readFileSync(path.join(systemdDir, "trainee-cloud-drain.service"), "utf8");
  assert.match(unit, /ExecStart=.*workers\/career-cloud\/drain\.ts/, "the drain unit starts the drain entrypoint");
  assert.ok(fs.existsSync(path.join(ROOT, "workers/career-cloud/drain.ts")), "the drain entrypoint exists");
  assert.ok(fs.existsSync(path.join(ROOT, "workers/career-cloud/pg-queue.ts")), "the Postgres queue exists");

  // Behavioral half: stage 5 seeds a card-bound row and leaves it
  // QUEUED; the actual drain (runDrain over pgQueue, the product's
  // cloudLoop) claims it from this disposable cluster and finishes
  // it. The engine is a stub (tier 2 — the real engine leg is
  // H4/H5): it honors the effect protocol (beforeEffect authorizes
  // through the real PG authorization path) and reports the mock
  // employer's confirmation.
  const s5 = psql(path.join(HERE, "stage-5-drain.sql"));
  assert.equal(s5.code, 0, "stage-5 failed: " + s5.out);
  assert.equal(markers.DRAIN_JOB_QUEUED, "queued/null/0", "the drain's row waits queued before the drain runs");

  const dir = fs.mkdtempSync(path.join(STATE, "drain-"));
  const driver = path.join(dir, "drain-driver.ts");
  fs.writeFileSync(driver, `
import { connectPg, pgQueue } from ${JSON.stringify("file://" + path.join(ROOT, "workers/career-cloud/pg-queue.ts"))};
import { runDrain } from ${JSON.stringify("file://" + path.join(ROOT, "workers/career-cloud/drain.ts"))};
const db = await connectPg(${JSON.stringify(`postgres://postgres@127.0.0.1:${pg.port}/postgres`)});
const base = pgQueue(db.executor);
let finishes = 0;
const queue = { ...base, finish: async (...a) => { const r = await base.finish(...a); finishes++; return r; } };
const stubEngine = async (args, _env, controls) => {
  await controls.beforeEffect();
  return { result: { state: "submitted_unconfirmed", confirmation_id: "MOCK-DRAIN-CONF" },
           evidence: { post: { status: 200, destination: args[1] } } };
};
const release = await db.acquireDrainLock();
if (!release) { console.log("DRAIN-LOCK-CONTENDED"); Deno.exit(3); }
try {
  const done = await runDrain({ queue, runEngine: stubEngine, contexts: 1, idleMs: 50,
    tmpRoot: ${JSON.stringify(dir)}, stop: () => finishes >= 1, log: () => {} });
  console.log("DRAIN-DONE " + JSON.stringify(done.map((d) => ({ id: d.id, state: d.state, outcome: d.outcome, recorded: d.recorded }))));
} finally { await release(); await db.close(); }
`);
  const deno = process.env.DENO_BIN || path.join(os.homedir(), ".deno/bin/deno");
  const run = await new Promise((resolve) => {
    const p = spawn(deno, ["run", "-A", "--no-check", driver], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timer = setTimeout(() => p.kill("SIGKILL"), 180000);
    p.on("exit", (code) => { clearTimeout(timer); resolve({ out, err, code }); });
  });
  const doneLine = run.out.split("\n").find((l) => l.startsWith("DRAIN-DONE "));
  assert.ok(doneLine, "the drain produced no result (exit " + run.code + "): " + (run.err || run.out).slice(0, 600));
  const done = JSON.parse(doneLine.slice("DRAIN-DONE ".length));
  assert.equal(done.length, 1, "the drain finished exactly one job");
  assert.equal(done[0].state, "submitted_unconfirmed");
  assert.equal(done[0].recorded, true, "the finish was recorded through the PG queue");

  const s5b = psql(path.join(HERE, "stage-5b-drain-verify.sql"));
  assert.equal(s5b.code, 0, "stage-5b failed: " + s5b.out);
  assert.equal(markers.DRAIN_JOB_STATE, "submitted_unconfirmed/cloud",
    "the row the drain claimed stands submitted_unconfirmed, source cloud");
  assert.equal(markers.DRAIN_CONFIRMATION, "MOCK-DRAIN-CONF",
    "the recorded evidence carries the (stub) employer's confirmation id");
  assert.equal(markers.DRAIN_EVENT, "submitted/", "the cloud telemetry recorded the submitted outcome");
  record("H3", "approval->cloud worker (drain)", "PASS",
    "the missing claimer is built: workers/career-cloud/drain.ts (runDrain -> cloudLoop) over pg-queue.ts claimed the stage-5 card-bound row from disposable PG and finished it submitted_unconfirmed via career_apply_cloud_finish (telemetry 'submitted' recorded); unit source scripts/career/systemd/trainee-cloud-drain.service in-tree, NOT installed. Tier 2: stub engine — the real engine leg is H4/H5");
});

// --------------------------------------------------------- H4 + H5
test("H4 cloud worker -> board and H5 board -> confirmation (mock employer, tier-2 harness queue)", async () => {
  let dir = fs.mkdtempSync(path.join(STATE, "drive-"));
  let repo = ROOT;
  // Staged mode (root test process): Chromium refuses to start its
  // sandbox as root, and this VM's home is untraversable to any other
  // user, so the drive is staged into a world-readable tree and run as
  // an unprivileged user by tests/e2e/stage-unpriv-run.sh, which probes
  // sandboxed contexts first and the product's documented grading-host
  // opt-out last, printing the route it used. Diagnosis + evidence:
  // docs/e2e/H4-DRIVER-ERROR-ROOT-CAUSE.md.
  const staged = typeof process.getuid === "function" && process.getuid() === 0 && !process.env.E2E_NO_STAGE;
  const stageDir = process.env.E2E_STAGE_DIR || "/opt/e2e-stage";
  let route = null; // filled from the runner's SANDBOX_ROUTE line
  if (staged) {
    const runner = path.join(HERE, "stage-unpriv-run.sh");
    const ens = spawnSync("bash", [runner, "ensure", ROOT], { encoding: "utf8", timeout: 600000 });
    assert.equal(ens.status, 0, "staging the drive failed: " + (ens.stdout || "") + (ens.stderr || ""));
    dir = path.join(stageDir, "work", "run-" + process.pid);
    fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
    fs.chmodSync(dir, 0o777); // mkdirSync's mode is umask-masked; the unprivileged drive user must traverse this dir
    repo = path.join(stageDir, "repo");
  }
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
  if (staged) {
    // The drive runs as an unprivileged user; the test process's umask
    // leaves these files root-only (measured rw-rw----), which kills the
    // staged deno before it can even read its own driver.
    for (const f of [resumePath, factsPath, factsFullPath]) fs.chmodSync(f, 0o644);
  }

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
  if (staged) fs.chmodSync(driver, 0o644);
  const deno = staged
    ? path.join(stageDir, "deno-home/bin/deno")
    : process.env.DENO_BIN || path.join(os.homedir(), ".deno/bin/deno");
  const run = await new Promise((resolve) => {
    const cmd = staged
      ? ["bash", [path.join(HERE, "stage-unpriv-run.sh"), "run", ROOT, dir, deno, "run", "-A", "--no-check", driver]]
      : [deno, ["run", "-A", "--no-check", driver]];
    const p = spawn(cmd[0], cmd[1], {
      env: staged ? { ...process.env, E2E_STAGE_DIR: stageDir } : { ...process.env, HOME: dir,
        UPMORE_PLAYWRIGHT_PATH: process.env.UPMORE_PLAYWRIGHT_PATH ||
          path.join(os.homedir(), "workspace/sporve-agent-clone/node_modules/playwright"),
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ||
          path.join(os.homedir(), ".cache/ms-playwright") },
      stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timer = setTimeout(() => p.kill("SIGKILL"), 300000);
    p.on("exit", (code) => { clearTimeout(timer); resolve({ out, err, code }); });
  });
  if (staged) {
    const m = /^SANDBOX_ROUTE (.+)$/m.exec(run.out);
    route = m ? m[1].trim() : null;
    if (run.code === 86 || route === "none") {
      const probes = run.err.split("\n").filter((l) => l.startsWith("PROBE[")).join(" ");
      record("H4", "cloud worker->board", "ENVIRONMENT",
        "stage-unpriv-run.sh probed every browser context this host offers and none could initialize — neither a sandboxed Chromium (as nobody, or root-in-userns) nor the product's documented opt-out route as nobody. Probe evidence: " + (probes || run.err.slice(0, 300)) + " — full diagnosis in docs/e2e/H4-DRIVER-ERROR-ROOT-CAUSE.md. NOT a wiring result.");
      record("H5", "board->confirmation", "ENVIRONMENT", "board leg never ran (see H4)");
      assert.fail("H4 ENVIRONMENT: no runnable browser context on this host (stage-unpriv-run probes all failed)");
    }
  }
  const doorLine = run.out.split("\n").find((l) => l.startsWith("DOORSTEP "));
  const finLine = run.out.split("\n").find((l) => l.startsWith("FINISHED "));
  const notReady = run.out.split("\n").find((l) => l.startsWith("NOT_READY "));
  const posture = !staged ? "browser context: the test process's own"
    : route === "nobody-sandboxed" ? "browser ran as unprivileged user nobody, Chromium sandbox ON"
    : route === "userns-sandboxed" ? "browser ran root-in-userns, Chromium sandbox ON"
    : route === "nobody-optout" ? "browser ran as unprivileged user nobody; Chromium sandbox OFF via the product's documented UPMORE_CHROMIUM_SANDBOX=off grading-host opt-out (portal-browser-helper.cjs posture; the same env this VM's board-service unit sets) — posture named here, never silent"
    : "browser route: " + route;
  if (staged && !doorLine && !finLine) {
    record("H4", "cloud worker->board", "FAIL",
      "the staged drive (route " + route + ") produced no DOORSTEP/FINISHED result — the browser context launched (runner probe) but the engine drive died: " + (run.out + "\n" + run.err).slice(-400));
    record("H5", "board->confirmation", "FAIL", "the board was never driven (see H4)");
    assert.fail("H4 FAIL: staged drive produced no result — see output above");
  }
  if (!doorLine && !finLine) {
    record("H4", "cloud worker->board", "ENVIRONMENT",
      "the Deno/Chromium drive produced no result in this VM (browser launch tier): " + (run.err || run.out).slice(0, 300));
    record("H5", "board->confirmation", "ENVIRONMENT", "board leg never ran (see H4)");
    assert.fail("H4 ENVIRONMENT: Chromium drive unavailable in this VM — classified separately from wiring");
  }
  const doorstep = JSON.parse(doorLine.slice(9));
  console.log("E2E-DOORSTEP " + JSON.stringify(doorstep));
  if (staged) {
    // The product's own sandbox gate is an ENVIRONMENT outcome, not a
    // wiring failure: the cloud seam (portal-browser-helper createSession)
    // refuses to run at all when it cannot have a sandboxed Chromium
    // (BROWSER_SANDBOX_REQUIRED), and the runner's probes have already
    // shown this host cannot initialize one for any user. The drive
    // reaching this named refusal proves the staging end to end — the
    // browser, the env chain and the seam all fired; only the host's
    // sandbox is missing. Full evidence: docs/e2e/
    // H4-DRIVER-ERROR-ROOT-CAUSE.md.
    let notReadyReason = null;
    try { notReadyReason = notReady ? JSON.parse(notReady.slice(10)).reason : null; } catch (_) {}
    const reasons = [doorstep && doorstep.result && doorstep.result.reason, notReadyReason];
    const sandboxRefusal = reasons.find((r) => r === "BROWSER_SANDBOX_REQUIRED" || r === "BROWSER_SANDBOX_UNAVAILABLE");
    if (sandboxRefusal) {
      record("H4", "cloud worker->board", "ENVIRONMENT",
        "the staged drive (route " + route + ") reached the product's own sandbox gate and was refused by name: " + sandboxRefusal + " — the cloud seam never runs unsandboxed (portal-browser-helper.cjs createSession), and this host cannot initialize a sandboxed Chromium for any user (runner probes + root-cause note). The staging, env chain and drive all fired; the missing piece is the host's sandbox, so this is not a wiring result.");
      record("H5", "board->confirmation", "ENVIRONMENT",
        "the drive stopped at the product's sandbox gate before any form interaction (see H4); the confirmation assertions run wherever a sandboxed Chromium can start");
      assert.fail("H4 ENVIRONMENT: product sandbox gate (" + sandboxRefusal + ") on a host with no initializable Chromium sandbox");
    }
  }
  if (staged && (notReady || (doorstep && doorstep.ready === false && doorstep.result && doorstep.result.reason === "DRIVER_ERROR"))) {
    // The runner's probe proved a browser context launches in the mode
    // the drive used (route above), so an engine DRIVER_ERROR here is a
    // product/engine failure, not the host's sandbox wall.
    record("H4", "cloud worker->board", "FAIL",
      "the engine's prepare returned DRIVER_ERROR on the staged route (" + route + ") whose launch probe passed — a product/driver failure, not environment: " + (notReady || JSON.stringify(doorstep)).slice(0, 300));
    record("H5", "board->confirmation", "FAIL", "the board was never driven (see H4)");
    assert.fail("H4 FAIL: engine DRIVER_ERROR on a runner-verified browser context");
  }
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
      "Chromium sandbox cannot initialize for the test process's own context in this VM (probe: " + probe + "); the engine refuses unsandboxed runs by design (BROWSER_SANDBOX_REQUIRED). The unprivileged route IS staged by stage-unpriv-run.sh when the test runs as root; the full measured diagnosis (AppArmor userns restriction, NoNewPrivs=1 at PID 1, crashpad handshake death inside a userns) is in docs/e2e/H4-DRIVER-ERROR-ROOT-CAUSE.md. NOT a wiring result.");
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
    `product engine + cloudLoop drove the mock form end to end (tier-2 harness queue); ${posture}; doorstep probe without EEO/attestation answers: ready=${doorstep.ready} (the uncovered-question stop is the designed behavior — see design doc); finished state=${f.state} outcome=${f.outcome}`);
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

// ------------------------------------------------------------- H7
// Chat-loop closure + receipts (lane muse/2026-10-22-e2e-h7-receipts;
// guards: tests/edge/channel-loop-receipt.test.ts; root cause:
// docs/e2e/H7-LOOP-CLOSURE-ROOT-CAUSE.md). The Route B row's REAL
// recorded states — snapshotted from the disposable PG at each stage
// by stages 3/4 (ROUTE_B_ROW_*_JSON) — are fed to the bridge's loop
// readback, and a status turn at EVERY stage must answer with that
// row's recorded state: the queued/driving state word, the honest
// submitted_unconfirmed wording (page evidence only — NO receipt),
// and at confirmed the full receipt composed from the row's own
// evidence (company, job id, the employer's confirmation number,
// payload hash, confirmed timestamp), rendered through the same
// presentReply path the H1 card uses. The plain core double answers
// the generic fallback, as the live brain did — the readback is what
// must overcome it.
test("H7 confirmed -> receipt in chat: status turns at every loop stage answer from the PG row", async () => {
  const channelBridge = await import("file://" + path.join(ROOT, "supabase/functions/_shared/channel_bridge.ts"));
  const receiptMod = await import("file://" + path.join(ROOT, "supabase/functions/_shared/career_apply_receipts.ts"));
  const present = await import("file://" + path.join(ROOT, "supabase/functions/_shared/channel_present.ts"));

  const USER = "00000000-0000-4000-8000-00000000cb01";
  const THREAD = "00000000-0000-4000-8000-00000000cba1";
  const SENDER = "6836694463";
  const RUN_ID = "batch-e2e0000001";
  const CARD_HASH = "a".repeat(64);
  const FALLBACK = "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.";

  const snaps = {};
  for (const [stage, key] of [
    ["queued", "ROUTE_B_ROW_QUEUED_JSON"],
    ["driving", "ROUTE_B_ROW_DRIVING_JSON"],
    ["submitted_unconfirmed", "ROUTE_B_ROW_SUBMITTED_JSON"],
    ["confirmed", "ROUTE_B_ROW_CONFIRMED_JSON"],
  ]) {
    assert.ok(markers[key], `the PG snapshot ${key} exists (stages 3/4 emit it)`);
    snaps[stage] = JSON.parse(markers[key]);
    assert.equal(snaps[stage].state, stage, `the recorded PG row at this leg really is ${stage}`);
    assert.equal(snaps[stage].user_id, USER, "the row is the chat user's own");
    assert.equal(snaps[stage].job_id, "lever:veeva:synthetic-binding-negative");
  }
  const confirmed = snaps.confirmed;
  assert.ok(confirmed.email_confirmed_at, "the confirmed row carries the employer's email stamp");
  assert.ok(confirmed.evidence && confirmed.evidence.confirmation_number,
    "the confirmed row's evidence carries the employer's confirmation number");

  // The bridge world for one stage: the thread remembers the batch
  // effort (a prepare intent), the stored run is past its card, and
  // the apply table holds exactly this stage's PG row.
  function world(row) {
    const threads = new Map([[SENDER, { thread_id: THREAD, last_message_id: null }]]);
    const intents = [{
      user_id: USER, intent_id: "intent-h7", thread_id: THREAD, run_id: RUN_ID,
      binding: { version: "career_batch_intent/v1", action: "prepare", run_id: RUN_ID },
      created_at: "2026-10-22T10:00:00.000Z",
    }];
    const jobs = [row];
    const runRecord = {
      version: "career_batch_run/v1", runId: RUN_ID, userId: USER, status: "approved",
      run: { id: RUN_ID, cardSha256: CARD_HASH }, summary: null,
    };
    function query(rows) {
      const filters = {}; let lim = null; let ord = null;
      const q = {
        select() { return q; },
        eq(c, v) { filters[c] = v; return q; },
        order(c, o) { ord = { c, asc: !o || o.ascending !== false }; return q; },
        limit(n) { lim = n; return q; },
        then(resolve) {
          let out = rows.filter((r) => Object.entries(filters).every(([c, v]) => r[c] === v));
          if (ord) out = out.sort((a, b) => (String(a[ord.c]) < String(b[ord.c]) ? -1 : 1) * (ord.asc ? 1 : -1));
          if (lim != null) out = out.slice(0, lim);
          resolve({ data: out.map((r) => ({ ...r })), error: null });
        },
      };
      return q;
    }
    const admin = {
      from(table) {
        if (table === "channel_threads") {
          const filters = {};
          const q = {
            select() { return q; },
            eq(c, v) { filters[c] = v; return q; },
            async maybeSingle() { const r = threads.get(filters.sender_key); return { data: r ? { ...r } : null, error: null }; },
            async upsert(r) {
              const prev = threads.get(r.sender_key);
              threads.set(r.sender_key, { thread_id: r.thread_id, last_message_id: r.last_message_id ?? prev?.last_message_id ?? null });
              return { error: null };
            },
          };
          return q;
        }
        if (table === "agent_threads") {
          const q = { insert() { return q; }, select() { return q; }, async single() { return { data: { id: THREAD }, error: null }; } };
          return q;
        }
        if (table === "career_batch_intents_v1") return query(intents);
        if (table === "career_apply_jobs") return query(jobs);
        throw new Error("unexpected table " + table);
      },
      async rpc(name, args) {
        assert.equal(name, "career_batch_result_v1");
        return { data: { batch: args.p_user === USER && args.p_run === RUN_ID ? runRecord : null }, error: null };
      },
    };
    const wire = [];
    const fetchFn = async (url, init) => {
      wire.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ reply: FALLBACK, thread_id: THREAD }), { status: 200 });
    };
    const deps = {
      env: (k) => ({ SUPABASE_URL: "https://e2e.fixture", SUPABASE_SERVICE_ROLE_KEY: "fixture-key" })[k],
      fetchFn, createAdmin: () => admin, paceMs: 0,
    };
    return { deps, wire };
  }

  for (const stage of ["queued", "driving", "submitted_unconfirmed", "confirmed"]) {
    const row = snaps[stage];
    const { deps, wire } = world(row);
    const outcome = await channelBridge.runChannelTurnRich(deps, {
      channel: "telegram", senderKey: SENDER, userId: USER,
      text: "What's the batch status?", messageId: "h7-" + stage,
    });
    assert.equal(outcome.kind, "done");
    assert.notEqual(outcome.replyText, FALLBACK, `${stage}: the loop readback answers, not the fallback`);
    assert.equal(outcome.replyText, receiptMod.applyLoopText(row),
      `${stage}: the chat answer is the recorded row's own loop text`);
    assert.ok(outcome.replyText.includes(stage), `${stage}: the answer carries the recorded state word`);
    assert.ok(outcome.replyText.includes(row.company) && outcome.replyText.includes(row.job_id),
      `${stage}: the answer names the row's company and job id`);
    assert.equal(wire.length, 1, `${stage}: no extra core call — the readback reads the row itself`);
  }

  // The receipt itself, byte-bound to the PG row's recorded evidence.
  const { deps } = world(confirmed);
  const outcome = await channelBridge.runChannelTurnRich(deps, {
    channel: "telegram", senderKey: SENDER, userId: USER,
    text: "What's the batch status?", messageId: "h7-receipt",
  });
  for (const field of [confirmed.company, confirmed.job_id, confirmed.evidence.confirmation_number,
    confirmed.payload_hash, confirmed.email_confirmed_at]) {
    assert.ok(outcome.replyText.includes(field), `the receipt carries the recorded ${field}`);
  }
  const rendered = present.presentReply("telegram", outcome.replyText, 4096).join("\n");
  for (const field of [confirmed.evidence.confirmation_number, confirmed.payload_hash, confirmed.email_confirmed_at]) {
    assert.ok(rendered.includes(field), `the rendered channel parts carry ${field}`);
  }
  // And the stage before it earned NO receipt from the same evidence.
  const sub = snaps.submitted_unconfirmed;
  assert.equal(sub.evidence.page_confirmation, true, "the submitted row holds page evidence only");
  assert.ok(!receiptMod.applyLoopText(sub).includes("Receipt"),
    "submitted_unconfirmed (page evidence alone) produces no receipt");
  assert.ok(!receiptMod.applyLoopText(sub).includes(sub.payload_hash),
    "no payload hash is rendered before the employer's email");

  record("H7", "confirmed->receipt + loop closure", "PASS",
    "status turns at queued/driving/submitted_unconfirmed/confirmed answered from the Route B row's disposable-PG snapshots through runChannelTurnRich's loop readback — never the fallback; the confirmed answer is the receipt composed from the row's own evidence (company, job id, employer confirmation number " +
    confirmed.evidence.confirmation_number + ", payload hash, email_confirmed_at), rendered via presentReply; submitted_unconfirmed (page evidence only) earned no receipt");
});
