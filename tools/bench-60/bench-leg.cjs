"use strict";
/* BENCH-60 harness leg (harness code, NOT product code) — vendored
   verbatim from the chunk-70% parallel-drives ladder leg
   (~/workspace/parallel-harness/leg.cjs) so the bench drives the exact
   production composition: executor -> 155 -> bridge -> sync transport
   -> board service :8471 -> real Greenhouse page, in its OWN process
   (the production shape: legs never share a process). The store is the
   leg's own in-memory store: prepares never write the submissions
   ledger (module 149 capCheck counts status="submitted" records only,
   and the live ledger holds 0), so a per-leg store is the same cap
   state as production tonight. Prepare-only: nothing here can submit —
   the intent is a prepare intent and 155 prepare never submits by
   construction.
   Usage: node bench-leg.cjs <posting_key> <family_text> <out_prefix> */
const fs = require("node:fs");
const path = require("node:path");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const WT = "/home/hatch/workspace/upmore-v2-candidate";
const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));
const { createProductionSources } = require(path.join(WT, "workers/career-browser/production-sources.cjs"));
const { createBatchExecutor } = require(path.join(WT, "workers/career-browser/batch-executor.cjs"));
const Batch = require(path.join(WT, "packages/domain/155-career-batch-apply.js"));
const operatorCfg = require("/home/hatch/worker-config/executor-config.cjs");

const TEST_USER = "b2625909-d67f-41b2-8270-983d212c6052";
const KEY = process.argv[2];
const FAMILY = process.argv[3];
const OUTP = process.argv[4];
const SHARED = process.env.SHARED_STATE || null; // shared store file (all legs of a level)
const INTENT_ID = process.env.INTENT_ID || "i-prepare";
if (!KEY || !FAMILY || !OUTP) { console.error("usage: leg.cjs <key> <family> <out_prefix>"); process.exit(2); }
const clone = (v) => JSON.parse(JSON.stringify(v));
const prog = (o) => { const line = JSON.stringify(Object.assign({ t: new Date().toISOString() }, o)); fs.appendFileSync(OUTP + "-progress.jsonl", line + "\n"); console.log(line); };

function wrapBoard(board, posting) {
  if (!board || typeof board !== "object") return board;
  const tag = `${posting.company}|${(posting.title || "").slice(0, 40)}`;
  const wrapped = {};
  const dataKeys = [];
  for (const k of Object.keys(board)) {
    const v = board[k];
    if (typeof v !== "function") { dataKeys.push(k); wrapped[k] = v; continue; }
    wrapped[k] = function (...args) {
      const t0 = Date.now();
      try {
        const r = v.apply(board, args);
        let detail = null;
        if (k === "fill") detail = { field: args[0] };
        else if (k === "form") detail = { fields: r && r.fields ? r.fields.length : null };
        else if (k === "open") detail = { result: r && typeof r === "object" ? { ok: r.ok, captcha: r.captcha || null } : r };
        prog({ board_call: k, posting: tag, ms: Date.now() - t0, detail });
        return r;
      } catch (e) {
        prog({ board_call: k, posting: tag, ms: Date.now() - t0, error: { code: e && e.code, message: String(e && e.message).slice(0, 200) } });
        throw e;
      } finally {
        for (const dk of dataKeys) { try { wrapped[dk] = board[dk]; } catch (_) {} }
      }
    };
  }
  return wrapped;
}

(async () => {
  prog({ phase: "start", posting_key: KEY, family: FAMILY });
  const transport = supabaseTransportFromEnv(process.env);
  const sources = createProductionSources({ transport });
  const { CareerPool } = require(path.join(WT, "supabase/functions/_shared/career_pool.js"));
  const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));
  const rows = await transport.readRows({ table: CareerPool.KB_POSTINGS_TABLE, select: CareerPool.KB_POSTINGS_COLUMNS, filters: { posting_key: { eq: KEY } }, limit: 1 });
  const posting = rows && rows[0] ? CareerPool.mapKbPosting(rows[0], Jobs) : null;
  if (!posting) { console.error("POSTING_NOT_FOUND", KEY); process.exit(2); }
  prog({ phase: "posting_ready", company: posting.company, title: posting.title || posting.role });

  const db = { intents: new Map(), states: new Map(), runs: new Map(), ledgers: new Map() };
  const memStore = {
    async pending() { const out = []; for (const it of db.intents.values()) { const st = db.states.get(it.intentId); if (st && st.state !== "queued") continue; out.push({ userId: TEST_USER, intentId: it.intentId, binding: it.binding, request: it.binding.action === "prepare" ? { run: it.run } : null }); } return out; },
    async claim({ intentId }) { const st = db.states.get(intentId); if (st && st.state !== "queued") return null; db.states.set(intentId, { state: "claimed" }); return { claimed: true }; },
    async finish({ intentId, state, result }) { db.states.set(intentId, { state, result }); },
    async saveRun(record) { db.runs.set(record.runId, clone(record)); },
    async readRun({ runId }) { const r = db.runs.get(runId); return r ? clone(r) : null; },
    async ledgerFor(userId) { if (!db.ledgers.has(userId)) db.ledgers.set(userId, { records: [] }); return db.ledgers.get(userId); },
    async saveLedger(userId, records) { db.ledgers.set(userId, { records }); },
  };
  // Shared file store (the production shape across processes): every
  // leg of a level reads/writes ONE state file; pending() is filtered
  // to THIS leg's intent so legs never drain each other's postings.
  const fileStore = (stateFile) => {
    const load = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch (_) { return { intents: {}, states: {}, runs: {}, ledgers: {} }; } };
    const save = (s) => fs.writeFileSync(stateFile, JSON.stringify(s, null, 1));
    return {
      _load: load, _save: save,
      async pending() { const s = load(); const it = s.intents[INTENT_ID]; if (!it) return []; const st = s.states[INTENT_ID]; if (st && st.state !== "queued") return []; return [{ userId: TEST_USER, intentId: INTENT_ID, binding: it.binding, request: it.binding.action === "prepare" ? { run: it.run } : null }]; },
      async claim({ intentId }) { const s = load(); const st = s.states[intentId]; if (st && st.state !== "queued") return null; s.states[intentId] = { state: "claimed" }; save(s); return { claimed: true }; },
      async finish({ intentId, state, result }) { const s = load(); s.states[intentId] = { state, result }; save(s); },
      async saveRun(record) { const s = load(); s.runs[record.runId] = clone(record); save(s); },
      async readRun({ runId }) { const s = load(); const r = s.runs[runId]; return r ? clone(r) : null; },
      async ledgerFor(userId) { const s = load(); if (!s.ledgers[userId]) s.ledgers[userId] = { records: [] }; return s.ledgers[userId]; },
      async saveLedger(userId, records) { const s = load(); s.ledgers[userId] = { records }; save(s); },
    };
  };
  const store = SHARED ? fileStore(SHARED) : memStore;
  const rawBoardFor = operatorCfg.boardForFor(TEST_USER);
  const boardForFor = () => (p) => wrapBoard(rawBoardFor(p), p);
  const executor = createBatchExecutor({ store, postingsFor: async () => [posting], profileFor: (uid, ctx) => sources.profileFor(uid, ctx), boardForFor });
  const run = Batch.createRun({ userId: TEST_USER, familyText: FAMILY, count: 1, now: Date.now() });
  if (SHARED) {
    const s = store._load();
    s.intents[INTENT_ID] = { intentId: INTENT_ID, binding: { action: "prepare", run_id: run.id, family_text: FAMILY }, run: Batch.serializeRun(run) };
    store._save(s);
  } else {
    db.intents.set(INTENT_ID, { intentId: INTENT_ID, binding: { action: "prepare", run_id: run.id, family_text: FAMILY }, run: Batch.serializeRun(run) });
  }
  prog({ phase: "drain_start", run_id: run.id });
  const t0 = Date.now();
  const results = await executor.runBatchPending();
  const ms = Date.now() - t0;
  const stored = SHARED ? await store.readRun({ runId: run.id }) : db.runs.get(run.id);
  fs.writeFileSync(OUTP + "-result.json", JSON.stringify({ world: "live", ms, results, stored }, null, 1));
  const apps = (stored && stored.run && stored.run.apps) || {};
  for (const k of Object.keys(apps)) {
    const a = apps[k];
    prog({ phase: "app", app: { postingKey: a.postingKey, company: a.company, role: a.role, stage: a.stage, stop: a.stop || null, pendingAttestations: a.pendingAttestations || null, carded: !!a.carded } });
  }
  prog({ phase: "drain_done", run_id: run.id, ms, run_status: stored && stored.run && stored.run.status });
  process.exit(0);
})().catch((e) => { prog({ phase: "failed", error: { code: e && e.code, message: String(e && e.message).slice(0, 300) } }); process.exit(1); });
