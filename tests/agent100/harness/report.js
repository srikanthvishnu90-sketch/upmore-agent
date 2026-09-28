// Results aggregation + fix-loop support for agent100.
const fs = require("fs");
const path = require("path");

const RESULTS_DIR = path.join(__dirname, "..", "results");

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function summarize(run) {
  const agents = run.agents;
  const byLane = {}, byCategory = {};
  let pass = 0, steps = 0, stepsPass = 0, apiCalls = 0, ms = 0;
  for (const a of agents) {
    if (a.pass) pass++;
    steps += a.steps.length;
    stepsPass += a.steps.filter((s) => s.ok).length;
    apiCalls += a.apiCalls || 0;
    ms += a.ms || 0;
    byLane[a.lane] = byLane[a.lane] || { pass: 0, total: 0 };
    byLane[a.lane].total++;
    if (a.pass) byLane[a.lane].pass++;
    for (const s of a.steps) {
      for (const f of s.failures || []) {
        byCategory[f.category] = (byCategory[f.category] || 0) + 1;
      }
    }
  }
  return {
    runId: run.runId, mode: run.mode, at: run.at,
    agents: agents.length, pass, fail: agents.length - pass,
    passRate: agents.length ? pass / agents.length : 0,
    steps, stepsPass, stepPassRate: steps ? stepsPass / steps : 0,
    apiCalls, totalMs: ms,
    byLane, byCategory,
  };
}

function writeRun(run) {
  ensureDir(RESULTS_DIR);
  const dir = path.join(RESULTS_DIR, run.runId);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "agents.json"), JSON.stringify(run.agents, null, 1));
  const summary = summarize(run);
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 1));
  fs.writeFileSync(path.join(dir, "summary.md"), renderMarkdown(run, summary));
  fs.writeFileSync(path.join(RESULTS_DIR, "latest.json"), JSON.stringify({ runId: run.runId, summary }, null, 1));
  return { dir, summary };
}

function renderMarkdown(run, s) {
  const L = [];
  L.push(`# agent100 run ${s.runId} (${s.mode}) — ${s.at}`);
  L.push(`Agents: ${s.pass}/${s.agents} pass (${(s.passRate * 100).toFixed(1)}%) · Steps: ${s.stepsPass}/${s.steps} (${(s.stepPassRate * 100).toFixed(1)}%) · API calls: ${s.apiCalls} · ${Math.round(s.totalMs / 1000)}s`);
  L.push(`\n## By lane`);
  for (const [lane, v] of Object.entries(s.byLane))
    L.push(`- ${lane}: ${v.pass}/${v.total}`);
  L.push(`\n## Failures by category`);
  const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  if (!cats.length) L.push(`- none`);
  for (const [c, n] of cats) L.push(`- ${c}: ${n}`);
  const failed = run.agents.filter((a) => !a.pass);
  if (failed.length) {
    L.push(`\n## Failed agents (fix-loop: re-run with --only-failed)`);
    for (const a of failed) {
      L.push(`\n### ${a.id} — ${a.title} [${a.lane}]`);
      for (const st of a.steps.filter((x) => !x.ok)) {
        L.push(`- step ${st.index} (${st.kind}):`);
        for (const f of st.failures) L.push(`  - [${f.category}] ${f.detail}`);
      }
    }
  }
  return L.join("\n");
}

// Fix-loop: read results/latest.json, return ids of failed agents.
function failedIds() {
  const p = path.join(RESULTS_DIR, "latest.json");
  if (!fs.existsSync(p)) throw new Error("no results/latest.json — run the suite once first");
  const latest = JSON.parse(fs.readFileSync(p, "utf8"));
  const dir = path.join(RESULTS_DIR, latest.runId);
  const agents = JSON.parse(fs.readFileSync(path.join(dir, "agents.json"), "utf8"));
  return agents.filter((a) => !a.pass).map((a) => a.id);
}

module.exports = { writeRun, summarize, failedIds, RESULTS_DIR };
