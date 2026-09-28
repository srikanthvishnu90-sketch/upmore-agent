#!/usr/bin/env node
// agent100 runner — 100 end-to-end test agents for Upmore.
//
//   node harness/runner.js --mode dry --all
//   node harness/runner.js --mode dry --agents a001,a002
//   node harness/runner.js --mode dry --lane guide-adversarial
//   node harness/runner.js --mode dry --all --only-failed     (fix-loop)
//   node harness/runner.js --print-cost --mode live [--judge-sample 5]
//   node harness/runner.js --mode live --founder-confirm "APPROVE LIVE" [--yes]
//
// Modes:
//   dry  — $0. Local sandbox only: Guide engine, calculators, static file
//          checks. backend/liveBrowser/judge steps are SKIPPED (judge runs
//          only with --judge-sample N and counts against budget).
//   live — real agent-chat backend calls (<=12/agent hard cap) + optional
//          judge sample. liveBrowser steps are marked deferred for the
//          parent agent (browser delegation), never executed here.
//          Requires --founder-confirm "APPROVE LIVE" (+ interactive confirm).
const fs = require("fs");
const path = require("path");
const { loadApp } = require("./extract");
const steps = require("./steps");
const { gateLive, printProjection, BACKEND_CALLS_PER_AGENT } = require("./budget");
const { writeRun, failedIds } = require("./report");

const AGENTS_DIR = path.join(__dirname, "..", "agents");

function parseArgs(argv) {
  const o = { mode: "dry", agents: null, lane: null, onlyFailed: false, judgeSample: 0, printCost: false, founderConfirm: null, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") o.mode = argv[++i];
    else if (a === "--agents") o.agents = argv[++i].split(",").map((s) => s.trim());
    else if (a === "--lane") o.lane = argv[++i];
    else if (a === "--only-failed") o.onlyFailed = true;
    else if (a === "--judge-sample") o.judgeSample = parseInt(argv[++i], 10);
    else if (a === "--print-cost") o.printCost = true;
    else if (a === "--founder-confirm") o.founderConfirm = argv[++i];
    else if (a === "--yes") o.yes = true;
    else if (a === "--help" || a === "-h") { console.log(HELP); process.exit(0); }
  }
  return o;
}
const HELP = `agent100 runner
  --mode dry|live            dry=$0 sandbox; live=real backend (gated)
  --all | --agents a001,a002 | --lane <lane>
  --only-failed               fix-loop: re-run failed agents from results/latest.json
  --judge-sample N            run LLM judge on N sampled judge steps (budgeted)
  --print-cost                print projected worst-case live cost and exit
  --founder-confirm "APPROVE LIVE"   required for --mode live
  --yes                       skip interactive confirm (still needs --founder-confirm)`;

function loadAgents() {
  return fs.readdirSync(AGENTS_DIR)
    .filter((f) => /^a\d{3}\.js$/.test(f) || /^smoke-[a-z-]+\.js$/.test(f))
    .sort()
    .map((f) => {
      const m = require(path.join(AGENTS_DIR, f));
      m._file = f;
      return m;
    });
}

async function runAgent(agent, opts, judgeState) {
  const t0 = Date.now();
  const app = loadApp();
  steps.applyPersona(app, agent.persona || {});
  const budget = { used: 0, cap: BACKEND_CALLS_PER_AGENT };
  const out = { id: agent.id, title: agent.title, lane: agent.lane, pass: true, steps: [], apiCalls: 0, ms: 0 };
  let idx = 0;
  for (const st of agent.steps) {
    idx++;
    const rec = { index: idx, kind: st.kind, ok: true, failures: [], ms: 0 };
    const dryRunnable = steps.DRY_RUNNABLE.has(st.kind);
    if (opts.mode === "dry" && !dryRunnable) {
      if (st.kind === "judge" && opts.judgeSample > 0 && judgeState.remaining > 0) {
        // budgeted judge sample in dry mode
        judgeState.remaining--;
        try {
          const g = app.guide(st.prompt);
          const { judgeReply } = require("./judge");
          const r = await judgeReply({ prompt: st.prompt, reply: g.text, personaNote: (agent.persona || {}).notes });
          budget.used++;
          out.apiCalls++;
          if (r.verdict.verdict !== "PASS") {
            rec.ok = false;
            rec.failures.push({ category: "judge_quality", detail: `${r.verdict.why} :: ${r.verdict.quote || ""}`.slice(0, 300) });
          }
          rec.ms = 0;
        } catch (e) {
          rec.ok = false;
          rec.failures.push({ category: "crash", detail: `judge failed: ${e.message}` });
        }
      } else {
        rec.skipped = st.kind === "judge" ? "judge-sample-exhausted" : `live-only (${st.kind})`;
      }
      out.steps.push(rec);
      continue;
    }
    try {
      let r;
      if (st.kind === "guide") r = steps.runGuide(app, st);
      else if (st.kind === "guideThread") r = steps.runGuideThread(app, st);
      else if (st.kind === "calc") r = steps.runCalc(app, st);
      else if (st.kind === "differential") r = steps.runDifferential(app, st);
      else if (st.kind === "static") r = steps.runStatic(st);
      else if (st.kind === "backend") {
        if (opts.mode !== "live") { rec.skipped = "live-only"; out.steps.push(rec); continue; }
        const b = await backendCall(app, st.prompt, budget);
        out.apiCalls += b.apiCalls || 0;
        rec.ms = b.ms || 0;
        if (!b.ok) { rec.ok = false; rec.failures = b.failures; }
        else {
          rec.reply = (b.text || "").slice(0, 400);
          for (const a of st.expect || []) {
            const er = steps.evalGuideAssertion(a, b.text || "");
            if (!er.ok) rec.failures.push({ ...er, prompt: (st.prompt || "").slice(0, 120) });
          }
          rec.ok = rec.failures.length === 0;
        }
        out.steps.push(rec);
        if (!rec.ok) out.pass = false;
        continue;
      } else if (st.kind === "liveBrowser") {
        rec.deferred = true;
        rec.note = "liveBrowser steps require parent-agent browser delegation; not executed by runner";
        out.steps.push(rec);
        continue;
      } else if (st.kind === "judge") {
        // live mode judge, or dry with sample handled above
        if (opts.mode === "live" && (opts.judgeSample <= 0 || judgeState.remaining > 0)) {
          if (opts.judgeSample > 0) judgeState.remaining--;
          const g = app.guide(st.prompt);
          const { judgeReply } = require("./judge");
          const r2 = await judgeReply({ prompt: st.prompt, reply: g.text, personaNote: (agent.persona || {}).notes });
          budget.used++; out.apiCalls++;
          if (r2.verdict.verdict !== "PASS") {
            rec.ok = false;
            rec.failures.push({ category: "judge_quality", detail: `${r2.verdict.why}`.slice(0, 300) });
          }
        } else { rec.skipped = "judge-sample-exhausted"; }
        out.steps.push(rec);
        continue;
      } else {
        rec.ok = false; rec.failures.push({ category: "crash", detail: `unknown step kind: ${st.kind}` });
        out.steps.push(rec); out.pass = false;
        continue;
      }
      Object.assign(rec, { ok: r.ok, failures: r.failures, ms: r.ms });
      if (r.reply) rec.reply = r.reply;
      if (r.result) rec.result = r.result;
      if (r.detail) rec.detail = r.detail;
    } catch (e) {
      rec.ok = false;
      rec.failures.push({ category: "crash", detail: `step threw: ${e.message}` });
    }
    if (!rec.ok && !rec.skipped && !rec.deferred) out.pass = false;
    out.steps.push(rec);
  }
  out.ms = Date.now() - t0;
  return out;
}

// Shared guide-expectation evaluator (used for backend text too).
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let agents = loadAgents();
  if (!agents.length) { console.error("no agents found in agents/ (expected a001..a100)"); process.exit(1); }
  if (opts.onlyFailed) {
    const ids = new Set(failedIds());
    agents = agents.filter((a) => ids.has(a.id));
    console.log(`fix-loop: re-running ${agents.length} failed agents`);
  } else if (opts.agents) {
    const want = new Set(opts.agents);
    agents = agents.filter((a) => want.has(a.id));
  } else if (opts.lane) {
    agents = agents.filter((a) => a.lane === opts.lane);
  } else if (!process.argv.slice(2).some((a) => ["--all", "--agents", "--lane", "--only-failed"].includes(a))) {
    console.error("specify --all, --agents, --lane, or --only-failed");
    process.exit(1);
  }

  const judgeCallsPlanned = opts.judgeSample || 0;
  if (opts.printCost) {
    printProjection(agents.length, judgeCallsPlanned);
    process.exit(0);
  }
  if (opts.mode === "live") {
    await gateLive({ founderConfirm: opts.founderConfirm, yes: opts.yes, agentCount: agents.length, judgeCalls: judgeCallsPlanned });
    // swap fetch to real network for backend calls
    // (sandbox fetch is stubbed; backendCall uses app.sandbox.fetch — override here)
    for (const _ of []) void _;
  }

  const judgeState = { remaining: opts.judgeSample || 0 };
  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const run = { runId, mode: opts.mode, at: new Date().toISOString(), agents: [] };
  for (const a of agents) {
    const res = opts.mode === "live"
      ? await runAgentLive(a, opts, judgeState)
      : await runAgent(a, opts, judgeState);
    run.agents.push(res);
    console.log(`${res.pass ? "PASS" : "FAIL"} ${res.id} ${res.title} (${res.ms}ms)`);
  }
  const { dir, summary } = require("./report").writeRun(run);
  console.log(`\n${summary.pass}/${summary.agents} agents pass (${(summary.passRate * 100).toFixed(1)}%)`);
  console.log(`results: ${dir}`);
}

// Live variant: backend steps use real network fetch instead of the sandbox
// stub. Everything else is identical to runAgent.
let liveFetch = null;
async function runAgentLive(agent, opts, judgeState) {
  liveFetch = fetch;
  try {
    return await runAgent(agent, opts, judgeState);
  } finally {
    liveFetch = null;
  }
}

async function backendCall(app, prompt, budget) {
  if (budget.used >= budget.cap) {
    return { ok: false, failures: [{ category: "budget_exceeded", detail: `per-agent API cap (${budget.cap}) hit` }], ms: 0 };
  }
  budget.used++;
  const t0 = Date.now();
  try {
    const f = liveFetch || app.sandbox.fetch; // sandbox fetch denies network (dry-run safety)
    const res = await f("https://mrwngntwmnaqrqhupvlt.supabase.co/functions/v1/agent-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: true, text: j.reply || "", ms: Date.now() - t0, apiCalls: 1 };
  } catch (e) {
    return { ok: false, failures: [{ category: "crash", detail: `backend call failed: ${e.message}` }], ms: Date.now() - t0 };
  }
}

main().catch((e) => { console.error("runner failed:", e.message); process.exit(1); });
