"use strict";
/* batch-executor.cjs — the worker-side batch executor (LOOP J10, Crew B,
   2026-10-15; design of record: joins doc "J10 — THE DEPLOYED-RUNTIME
   TRANSPORT: DESIGN").

   What this is: the process that makes the deployed batch loop real.
   The Edge handler cannot drive boards (the drive stack is
   synchronous; the chat turn may contain no browser effect), so it
   commits career_batch_intent/v1 intents and the worker executes
   them here, in a Node process beside the career_task_intent/v1 task
   worker (service.cjs — untouched). This executor claims intents and
   runs module 155 (CareerBatchApply) itself — the same module the
   chat bundle carries, required from packages/domain, never a fork —
   with every stage engine (121/132/123/149/150) exactly as the
   in-turn path composes them. The only differences from the in-turn
   composition are the ones the runtime forces: postings come from an
   injected discovery source (production: the KB-backed pool via
   production-sources.cjs — Lane E, see the note at the end of this
   header), the profile/attestations are injected per user, the cap
   ledger is the store's per-user ledger, and boards come from an
   injected boardForFor(userId) — in production the J9 provider over
   the synchronous HTTP transport to the board service, which vends
   the sessions in ITS process.

   Intent lifecycle (mirrors the task stack's discipline):
   - prepare intents carry the run skeleton the router seam created.
     The executor restores it, runs prepareRun, and writes the
     prepared run as a user-scoped career_batch_run/v1 record. A
     prepare crash finishes the intent BLOCKED with the code —
     prepare submits nothing, ever (149's doorstep is a stop), so a
     fresh intent may safely retry.
   - approve intents carry the card set hash from the owner's yes.
     The executor re-reads the STORED run and refuses
     (APPROVAL_SET_CHANGED, nothing executed, the stored run left
     untouched at its card) when the hash moved; otherwise
     approveRun re-verifies the set inside 155, mints the Leg-1
     approvalRef, and executeRun submits under it — 149 re-verifies
     every payload at click time (MI-116) and re-checks the caps
     (MI-110), exactly as in-turn.
   - An execute intent is claimed ONCE. A crash mid-execution
     finishes it UNCERTAIN and it is never re-driven: a blind
     re-drive could double-submit, and unknown outcomes belong to
     the resolver posture (MI-115), not to retries.

   The store is injected (all methods async): pending(), claim(),
   finish(), saveRun(), readRun(), ledgerFor(), saveLedger().
   createBatchRpcStore below binds it to the batch RPCs of the
   live migration 20261016010000_career_batch_intents_v1.sql (the
   task stack's RPC shape); tests bind the same interface to an
   in-memory store. The executor never sees a transport it did not
   be given, and it writes nothing the chat layer has not committed
   an intent for.

   Production inputs (Lane E, 2026-10-20): the injected sources
   this header originally left as "the operator's wiring" now exist
   beside this file — supabase-transport.cjs (the `call` transport
   + table reads against the live batch RPCs; the service-role key
   lives only in this host's env) and production-sources.cjs
   (postingsFor from the KB-backed pool through the shared
   career_pool.js loader — the same mapping the Edge handler
   passes into createTurnCtx; profileFor from the user's stored
   profile record, with the named stop BATCH_PROFILE_NOT_FOUND
   when none exists). The operator config is an assembly of those
   two factories plus the board-service binding; see main() below. */
const path = require("node:path");

const Batch = require(path.join(__dirname, "..", "..", "packages", "domain", "155-career-batch-apply.js"));

const RUN_VERSION = "career_batch_run/v1";
const clone = (v) => JSON.parse(JSON.stringify(v));
const coded = (code, message) => Object.assign(new Error(message || code), { code });

function createBatchExecutor(deps) {
  const d = deps || {};
  const store = d.store;
  if (!store || typeof store.pending !== "function" || typeof store.claim !== "function" || typeof store.finish !== "function"
    || typeof store.saveRun !== "function" || typeof store.readRun !== "function"
    || typeof store.ledgerFor !== "function" || typeof store.saveLedger !== "function") {
    throw coded("BATCH_STORE_NOT_WIRED", "createBatchExecutor: a store with pending/claim/finish/saveRun/readRun/ledgerFor/saveLedger is required");
  }
  if (typeof d.postingsFor !== "function") throw coded("BATCH_DISCOVERY_NOT_WIRED", "createBatchExecutor: postingsFor(userId, familyText, count) is required — the executor never invents a discovery source");
  if (typeof d.profileFor !== "function") throw coded("BATCH_PROFILE_NOT_WIRED", "createBatchExecutor: profileFor(userId) is required");
  if (typeof d.boardForFor !== "function") throw coded("BATCH_BOARDS_NOT_WIRED", "createBatchExecutor: boardForFor(userId) is required");
  const nowOf = typeof d.now === "function" ? d.now : () => Date.now();
  const track = typeof d.track === "function" ? d.track : null;

  function recordOf(run) {
    return {
      version: RUN_VERSION, runId: run.id, userId: run.userId, status: run.status,
      run: Batch.serializeRun(run), summary: run.summary || Batch.summarizeRun(run),
      updatedAt: new Date(nowOf()).toISOString(),
    };
  }

  // #11-2 (S-2, the cap-ledger race): persist only the records THIS
  // run added, through the store's append path when it has one. The
  // v1 whole-array save let the last of two concurrent drains erase
  // the other's submission records — and the ledger is the cap
  // source. Where the store's append path reports itself not wired
  // (the v2 RPC not yet applied), fall back to the v1 save: exactly
  // today's behavior, never worse. Parallel drains (S-1) must run
  // against a store whose append path is live — the fallback is a
  // compatibility bridge, not a parallel-safe mode.
  async function persistLedger(userId, log, baseRecords) {
    const all = (log && log.records) || [];
    if (typeof store.appendLedger === "function") {
      const base = new Set(baseRecords || []);
      const delta = all.filter((r) => !base.has(r));
      if (!delta.length) return;
      try { await store.appendLedger(userId, delta); return; }
      catch (e) { if (!e || e.code !== "APPEND_LEDGER_NOT_WIRED") throw e; }
    }
    await store.saveLedger(userId, all);
  }

  async function buildDeps(userId, postings) {
    const pack = (await d.profileFor(userId)) || {};
    const log = await store.ledgerFor(userId);
    // WO-094: no standing attestations ride into a drive — the card's yes
    // attests per application (155/149). The board provider is told the
    // stored resume record's sha256 so the board service resolves THAT file.
    const resume = pack.profile && pack.profile.resume ? pack.profile.resume : null;
    return {
      postings: Array.isArray(postings) ? postings : [],
      profile: pack.profile || null,
      profileMaster: pack.profileMaster || null,
      log,
      boardFor: d.boardForFor(userId, { resumeSha256: resume && resume.sha256 ? resume.sha256 : null }),
      now: nowOf(),
      track: track || undefined,
    };
  }

  async function executePrepare(intent) {
    const binding = intent.binding || {};
    const skeleton = intent.request && intent.request.run;
    if (!skeleton || skeleton.id !== binding.run_id || skeleton.userId !== intent.userId) {
      throw coded("BATCH_RUN_INVALID", "the prepare intent carries no run skeleton bound to its user and run id");
    }
    const run = Batch.restoreRun(clone(skeleton));
    if (!run) throw coded("BATCH_RUN_INVALID", "the prepare intent's run skeleton does not restore");
    const postings = await d.postingsFor(intent.userId, binding.family_text || run.familyText, run.requested);
    const deps = await buildDeps(intent.userId, postings);
    const baseRecords = ((deps.log && deps.log.records) || []).slice();
    Batch.prepareRun(run, deps);
    await store.saveRun(recordOf(run));
    await persistLedger(intent.userId, deps.log, baseRecords);
    return { runId: run.id, runStatus: run.status, doorstep: run.summary ? run.summary.doorstep : 0, submitted: 0 };
  }

  async function executeApprove(intent) {
    const binding = intent.binding || {};
    // Pre-execution refusals are clean BLOCKS (nothing was driven, a
    // corrected intent may follow); only a crash after execution
    // begins is UNCERTAIN — the distinction is made here, before the
    // caller's try/catch, on purpose.
    const record = await store.readRun({ userId: intent.userId, runId: binding.run_id });
    if (!record || !record.run) return { blocked: "BATCH_RUN_NOT_FOUND", runId: binding.run_id || null, runStatus: null };
    const run = Batch.restoreRun(clone(record.run));
    if (!run) return { blocked: "BATCH_RUN_INVALID", runId: binding.run_id || null, runStatus: null };
    if (run.cardSha256 !== binding.card_sha256) {
      // The yes was for a different card than the stored run now
      // shows. Terminal for THIS intent; the stored run stays at its
      // card so a corrected yes can still land.
      return { blocked: "APPROVAL_SET_CHANGED", runId: run.id, runStatus: run.status };
    }
    // P1 text yes: the applications the owner left off the card ride the
    // approve intent (exclude_keys); 155 refuses any key not on the card.
    const exclude = Array.isArray(binding.exclude_keys) ? binding.exclude_keys : [];
    // CURRENT FACTS AT THE COMMITMENT BOUNDARY (2026-10-24): the
    // approval must bind the profile as it stands NOW, not as it
    // stood at prepare. The executor CAN read the current profile
    // — profileFor(userId) is a required dep (buildDeps reads it
    // for execution) — so it is read BEFORE approveRun and the
    // digest is computed over the CURRENT facts. The earlier shape
    // replayed the run's STORED digest, which asserts nothing
    // about today: a profile edited after the card still bound.
    // A profile record that no longer exists blocks named here
    // (the same stop the prepare side uses), never a replay.
    const pack = (await d.profileFor(intent.userId)) || {};
    if (!pack.profile) return { blocked: "BATCH_PROFILE_NOT_FOUND", runId: run.id, runStatus: run.status };
    const ap = Batch.approveRun(run, { approvedByUser: true, now: nowOf(), userId: intent.userId || null, profileSha256: typeof Batch.profileDigestOf === "function" ? Batch.profileDigestOf(pack.profile) : null, ...(exclude.length ? { exclude } : {}) });
    if (!ap.ok) return { blocked: ap.code || "APPROVAL_REFUSED", runId: run.id, runStatus: run.status };
    const deps = await buildDeps(intent.userId, []);
    const baseRecords = ((deps.log && deps.log.records) || []).slice();
    Batch.executeRun(run, deps);
    await store.saveRun(recordOf(run));
    await persistLedger(intent.userId, deps.log, baseRecords);
    return { runId: run.id, runStatus: run.status, submitted: run.summary ? run.summary.submitted : 0, confirmations: run.summary ? run.summary.confirmations : [] };
  }

  async function runBatchPending() {
    const results = [];
    const intents = await store.pending();
    for (const intent of intents) {
      const binding = intent.binding || {};
      const grant = await store.claim({ userId: intent.userId, intentId: intent.intentId });
      if (!grant) { results.push({ intentId: intent.intentId, status: "skipped_claimed" }); continue; }
      if (binding.action === "prepare") {
        try {
          const result = await executePrepare(intent);
          await store.finish({ userId: intent.userId, intentId: intent.intentId, state: "completed", result });
          results.push({ intentId: intent.intentId, action: "prepare", status: "completed", ...result });
        } catch (e) {
          const code = (e && e.code) || "BATCH_PREPARE_FAILED";
          // BUG-QA-2026-10-21-01: the record keeps the bounded message
          // alongside the code — a code-only record made cold DRIVER_ERRORs
          // undiagnosable from every log the seams keep.
          const message = String((e && e.message) || e).slice(0, 300);
          await store.finish({ userId: intent.userId, intentId: intent.intentId, state: "blocked", result: { code, message } });
          results.push({ intentId: intent.intentId, action: "prepare", status: "blocked", code, message });
        }
      } else if (binding.action === "approve") {
        try {
          const result = await executeApprove(intent);
          if (result.blocked) {
            await store.finish({ userId: intent.userId, intentId: intent.intentId, state: "blocked", result });
            results.push({ intentId: intent.intentId, action: "approve", status: "blocked", ...result });
          } else {
            await store.finish({ userId: intent.userId, intentId: intent.intentId, state: "completed", result });
            results.push({ intentId: intent.intentId, action: "approve", status: "completed", ...result });
          }
        } catch (e) {
          // Claimed once, never re-driven: an execution crash leaves
          // outcomes unknown by definition (MI-115's posture).
          const code = (e && e.code) || "BATCH_EXECUTION_UNCERTAIN";
          const message = String((e && e.message) || e).slice(0, 300);
          await store.finish({ userId: intent.userId, intentId: intent.intentId, state: "uncertain", result: { code, message } });
          results.push({ intentId: intent.intentId, action: "approve", status: "uncertain", code, message });
        }
      } else {
        await store.finish({ userId: intent.userId, intentId: intent.intentId, state: "blocked", result: { code: "BATCH_ACTION_UNKNOWN" } });
        results.push({ intentId: intent.intentId, status: "blocked", code: "BATCH_ACTION_UNKNOWN" });
      }
    }
    return results;
  }

  return { runBatchPending };
}

// The production store: the batch RPCs of the live migration
// 20261016010000, called through an injected async caller
// (name, args) -> data (workers/career-browser/supabase-transport.cjs;
// throws on RPC/transport error, which the executor surfaces as the
// intent's coded failure — with one translation in claim, below).
function createBatchRpcStore({ call }) {
  if (typeof call !== "function") throw coded("BATCH_RPC_NOT_WIRED", "createBatchRpcStore: an async call(name, args) transport is required");
  const leases = new Map(); // intentId -> leaseToken, held from claim to finish
  return {
    async pending() { const data = await call("career_batch_pending_v1", {}); return (data && data.intents) || []; },
    async claim({ userId, intentId }) {
      let data;
      try {
        data = await call("career_batch_claim_v1", { p_user: userId, p_intent: intentId });
      } catch (e) {
        // CLAIM-REFUSAL TRANSLATION (Lane E): the production RPC
        // RAISES on a refusal — 'batch intent missing' / 'batch
        // authority revoked' (the intent was claimed by another
        // drain, expired, paused, or its authority moved between
        // pending() and claim) — where Lane D's file-backed
        // stand-in RESOLVES {claimed:false} for the same state.
        // The store's contract is the stand-in's: a refusal is a
        // null claim, which runBatchPending records as
        // skipped_claimed and moves on. Without this translation
        // the raise escapes the drain loop (claim is awaited
        // outside its try/catch) and one raced intent starves
        // every intent behind it. ONLY the RPC's two refusal
        // messages translate — a transport or server failure
        // still throws, so an outage can never masquerade as a
        // skip.
        const msg = (e && (e.pgMessage || e.message)) || "";
        if (/batch authority revoked|batch intent missing/.test(msg)) return null;
        throw e;
      }
      if (data && data.claimed && data.leaseToken) leases.set(intentId, data.leaseToken);
      return data && data.claimed ? data : null;
    },
    async finish({ userId, intentId, state, result }) { const data = await call("career_batch_finish_v1", { p_user: userId, p_intent: intentId, p_lease: leases.get(intentId) || null, p_state: state, p_result: result || null }); leases.delete(intentId); return data; },
    async saveRun(record) { return call("career_batch_save_run_v1", { p_user: record.userId, p_run: record }); },
    async readRun({ userId, runId }) { const data = await call("career_batch_result_v1", { p_user: userId, p_run: runId }); return (data && data.batch) || null; },
    async ledgerFor(userId) { const data = await call("career_batch_ledger_v1", { p_user: userId }); return { records: (data && data.records) || [] }; },
    async saveLedger(userId, records) { return call("career_batch_save_ledger_v1", { p_user: userId, p_records: records || [] }); },
    // v2 append (migration 20261022010000, DRAFT — owner-run): merges
    // only the new records under the per-user advisory lock, deduped
    // by confirmation identity. While the RPC is absent the transport
    // surfaces PGRST202; translate it to the coded refusal the
    // executor's persistLedger falls back on.
    async appendLedger(userId, records) {
      try { return await call("career_batch_append_ledger_v2", { p_user: userId, p_records: records || [] }); }
      catch (e) {
        // Absence surfaces differently per transport: PostgREST's
        // PGRST202, a message naming the function, or a stand-in's
        // "unexpected RPC". All three mean the same thing here —
        // the v2 write is not available on this backend — and the
        // executor's fallback (the v1 save) is today's behavior.
        const msg = String((e && e.message) || e);
        if ((e && e.code === "PGRST202") || /career_batch_append_ledger_v2/.test(msg) || /unexpected RPC/i.test(msg)) {
          throw coded("APPEND_LEDGER_NOT_WIRED", "career_batch_append_ledger_v2 is not available on this backend (draft migration 20261022010000 is owner-run)");
        }
        throw e;
      }
    },
  };
}

if (require.main === module) {
  // Operator-owned configuration only, never loaded from chat (the
  // board-service.cjs pattern): the config module exports
  // { call, postingsFor, profileFor, boardForFor }. The production
  // assembly (Lane E) is an assembly, not new logic:
  //   const { supabaseTransportFromEnv } = require("<repo>/workers/career-browser/supabase-transport.cjs");
  //   const { createProductionSources } = require("<repo>/workers/career-browser/production-sources.cjs");
  //   const transport = supabaseTransportFromEnv(process.env); // SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (host env only)
  //   const sources = createProductionSources({ transport });
  //   module.exports = { call: transport.call, postingsFor: sources.postingsFor,
  //     profileFor: sources.profileFor, boardForFor: <the operator's
  //     board-service binding for the §2 board-service process> };
  // boardForFor(userId, { resumeSha256 }) receives the stored resume
  // record's sha256 (WO-094): pass it to createWorkerBoardProvider's
  // resumeSha256 so the board service (configured with resume-store.cjs
  // createStoredResumeResolver) resolves that file or refuses, named.
  if (!process.argv[2] || !path.isAbsolute(process.argv[2])) throw new Error("usage: node batch-executor.cjs /absolute/operator-config.cjs");
  const cfg = require(process.argv[2]);
  const executor = createBatchExecutor({ store: createBatchRpcStore({ call: cfg.call }), postingsFor: cfg.postingsFor, profileFor: cfg.profileFor, boardForFor: cfg.boardForFor, track: cfg.track });
  executor.runBatchPending()
    .then((results) => console.log(JSON.stringify({ batchExecutor: "drained", results })))
    .catch((e) => { console.error("batch executor failed:", e && e.message); process.exit(1); });
}

module.exports = { createBatchExecutor, createBatchRpcStore };
