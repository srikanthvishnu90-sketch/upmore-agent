"use strict";
/* measure-executor.cjs — THROUGHPUT LANE M2 (2026-10-21).
   The full batch cycle in TEST world, in-process: the REAL batch
   executor + module 155/149/123 from the candidate tree, the REAL
   targeted queue feed over the live shelf (read-only), the REAL
   stored gauntlet profile (read-only), and module 149's sandbox
   boards (the test board — full cycle incl. submit + confirmation,
   no real pages, no real submissions). This isolates everything
   except real-page drive cost (measured in M3): feed assembly,
   screening, tailoring, doorstep drives, the approval, the execute
   loop, and the in-engine caps (SPEC_CAPS in 149 are code
   constants — they bind here exactly as coded; the owner's ruling
   keeps them on live permanently and takes them as a boundary).
   Usage: node measure-executor.cjs [count] */
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
const { createQueueFeed } = require("/home/hatch/workspace/throughput-wt/workers/career-browser/queue-feed.cjs");
const Batch = require(path.join(WT, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(WT, "packages/domain/149-career-portal-apply.js"));
const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));

const GAUNTLET = "2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3";
const COUNT = Number(process.argv[2] || 50);
const FAMILY = "software engineering intern roles";
const clone = (v) => JSON.parse(JSON.stringify(v));
const now = () => Number(process.hrtime.bigint() / 1000000n);

(async () => {
  const transport = supabaseTransportFromEnv(process.env);
  const sources = createProductionSources({ transport });
  const boards = JSON.parse(fs.readFileSync(path.join(__dirname, "gh-boards.json"), "utf8"));
  const feed = createQueueFeed({ readRows: (s) => transport.readRows(s), jobs: Jobs, boardsFor: async () => boards });

  // The boards census order from A4 is largest-first; the feed
  // assembles window + targeted top-up exactly as wired in the fix.
  let feedOut = null;
  const postingsFor = async () => { feedOut = await feed.postingsForTargeted(GAUNTLET, FAMILY, COUNT); return feedOut.postings; };

  const db = { intents: new Map(), states: new Map(), runs: new Map(), ledgers: new Map() };
  const store = {
    async pending() {
      const out = [];
      for (const it of db.intents.values()) {
        const st = db.states.get(it.intentId);
        if (st && st.state !== "queued") continue;
        out.push({ userId: GAUNTLET, intentId: it.intentId, binding: it.binding, request: it.binding.action === "prepare" ? { run: it.run } : null });
      }
      return out;
    },
    async claim({ intentId }) { const st = db.states.get(intentId); if (st && st.state !== "queued") return null; db.states.set(intentId, { state: "claimed" }); return { claimed: true }; },
    async finish({ intentId, state, result }) { db.states.set(intentId, { state, result }); },
    async saveRun(record) { db.runs.set(record.runId, clone(record)); },
    async readRun({ runId }) { const r = db.runs.get(runId); return r ? clone(r) : null; },
    async ledgerFor(userId) { if (!db.ledgers.has(userId)) db.ledgers.set(userId, { records: [] }); return db.ledgers.get(userId); },
    async saveLedger(userId, records) { db.ledgers.set(userId, { records }); },
  };
  // Fixture-profile mode (argv[3] === 'fixture'): the delegation
  // suite's own TEST profile/master, whose confirmed answers cover
  // the sandbox board's form — the gauntlet's real bank does not
  // (measured: UNCOVERED_QUESTION stops). Attestations ride the
  // approve context only, mirroring production profileFor.
  const FIXTURE = {
    profile: {
      name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100", location: "Chicago, IL",
      resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
      answers: {
        work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
        sponsorship: { value: "No", confirmed: true },
        cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
      },
    },
    profileMaster: {
      basics: { name: "Alex Testcase (TEST)", email: "alex.testcase@example.test" },
      facts: [
        { id: "F-T-001", kind: "skill", text: "JavaScript and Node.js development", confirmed: true },
        { id: "F-T-002", kind: "experience", text: "Built web applications as a student developer", confirmed: true },
        { id: "F-T-003", kind: "education", text: "Computer Science student", confirmed: true },
      ],
    },
  };
  const fixtureMode = process.argv[3] === "fixture";
  const executor = createBatchExecutor({
    store,
    postingsFor,
    profileFor: fixtureMode
      ? async (uid, ctx) => ({ profile: FIXTURE.profile, profileMaster: FIXTURE.profileMaster, attestations: ctx && ctx.action === "approve" ? { certify_true: { value: true, explicit: true } } : {} })
      : (uid, ctx) => sources.profileFor(uid, ctx),
    boardForFor: () => (posting) => Portal.createSandboxBoard({}),
  });

  const run = Batch.createRun({ userId: GAUNTLET, familyText: FAMILY, count: COUNT, now: Date.now() });
  db.intents.set("i-prepare", { intentId: "i-prepare", binding: { action: "prepare", run_id: run.id, family_text: FAMILY }, run: Batch.serializeRun(run) });

  let a = now();
  const prepResults = await executor.runBatchPending();
  const prepMs = now() - a;
  const stored = db.runs.get(run.id);
  console.log(JSON.stringify({
    phase: "prepare drain (test world)", ms: prepMs, results: prepResults,
    feedStats: feedOut && feedOut.stats,
    runStatus: stored && stored.run.status,
    summary: stored && stored.summary,
  }));

  if (stored && stored.run.cardSha256) {
    db.intents.set("i-approve", { intentId: "i-approve", binding: { action: "approve", run_id: run.id, card_sha256: stored.run.cardSha256 } });
    a = now();
    const apprResults = await executor.runBatchPending();
    const apprMs = now() - a;
    const after = db.runs.get(run.id);
    const stages = {};
    for (const k of Object.keys(after.run.apps || {})) stages[after.run.apps[k].stage] = (stages[after.run.apps[k].stage] || 0) + 1;
    console.log(JSON.stringify({ phase: "approve drain (test world)", ms: apprMs, results: apprResults, runStatus: after.run.status, stages, summary: after.summary }));
  }
  process.exit(0);
})().catch((e) => { console.error("EXEC_MEASURE_FAILED", e && e.code, e && e.message); process.exit(1); });
