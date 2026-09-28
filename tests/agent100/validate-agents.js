#!/usr/bin/env node
// Validates agents/aNNN.js files:
//   1. schema validity (required fields, known step kinds/assertions)
//   2. coverage (10 lanes x 10 agents, edge cases present)
//   3. material difference (no template clones; pairwise similarity < 0.85)
//
// Usage:
//   node validate-agents.js              (all agents)
//   node validate-agents.js --files a001,a002   (subset: schema + intra-batch similarity)
const fs = require("fs");
const path = require("path");

const AGENTS_DIR = path.join(__dirname, "agents");
const LANES = ["guide-adversarial", "investing", "budgeting", "tracking", "claiming",
  "connectors", "tabs", "honesty", "cfo", "edge"];
const STEP_KINDS = new Set(["guide", "guideThread", "calc", "differential", "static", "backend", "liveBrowser", "judge"]);
const GUIDE_ASSERTS = new Set(["refusal", "contains", "notContains", "noAdvice", "noGuarantee"]);
const CALC_ASSERTS = new Set(["numeric", "defined"]);
const STATIC_FILES = new Set(["template", "index", "privacy", "terms", "policy"]);
const CALC_FNS = new Set(["debtSim", "marginalRate2026", "feeFor", "portfolioSummary", "bucketOf",
  "routeIsBlocked", "earnable", "guideAgeGate", "netWorthCalc", "capitalSuppressed"]);

function loadAgents(files) {
  return files.map((f) => {
    const m = require(path.join(AGENTS_DIR, f));
    m._file = f;
    return m;
  });
}

function checkSchema(a, errors) {
  const id = a.id || a._file;
  if (!/^a\d{3}$/.test(a.id)) errors.push(`${id}: bad id`);
  if (!LANES.includes(a.lane)) errors.push(`${id}: bad lane ${a.lane}`);
  if (!a.title || a.title.length < 8) errors.push(`${id}: title too short`);
  const p = a.persona || {};
  if (typeof p.age !== "number") errors.push(`${id}: persona.age missing`);
  if (p.age < 18 && a.lane !== "edge") errors.push(`${id}: under-18 outside edge lane`);
  if (!p.state || p.state.length !== 2) errors.push(`${id}: persona.state must be 2-letter`);
  if (!Array.isArray(a.modes) || !a.modes.includes("dry")) errors.push(`${id}: modes must include dry`);
  if (!Array.isArray(a.steps) || a.steps.length < 3 || a.steps.length > 8)
    errors.push(`${id}: steps must be 3-8, got ${(a.steps || []).length}`);
  for (const [i, s] of (a.steps || []).entries()) {
    if (!STEP_KINDS.has(s.kind)) { errors.push(`${id} step ${i}: unknown kind ${s.kind}`); continue; }
    if (s.kind === "guide" || s.kind === "backend" || s.kind === "judge") {
      if (!s.prompt || s.prompt.length < 10) errors.push(`${id} step ${i}: prompt too short`);
      for (const as of s.expect || []) {
        if (!GUIDE_ASSERTS.has(as.t)) errors.push(`${id} step ${i}: unknown guide assertion ${as.t}`);
        if ((as.t === "contains" || as.t === "notContains") && !as.re) errors.push(`${id} step ${i}: ${as.t} needs re`);
        if (as.re) { try { new RegExp(as.re, "i"); } catch { errors.push(`${id} step ${i}: bad regex ${as.re}`); } }
      }
    }
    if (s.kind === "guideThread") {
      if (!Array.isArray(s.prompts) || s.prompts.length < 2) errors.push(`${id} step ${i}: guideThread needs >=2 prompts`);
    }
    if (s.kind === "calc" || s.kind === "differential") {
      if (!CALC_FNS.has(s.fn)) errors.push(`${id} step ${i}: unverified fn ${s.fn} (see AGENT_SPEC.md)`);
      if (!Array.isArray(s.args) && s.kind === "calc") errors.push(`${id} step ${i}: calc needs args array`);
      if (s.kind === "calc") for (const as of s.expect || []) {
        if (!CALC_ASSERTS.has(as.t)) errors.push(`${id} step ${i}: unknown calc assertion ${as.t}`);
      };
      if (s.kind === "differential") {
        if (!s.baseArgs || !s.perturb || !s.outPath || !["up", "down", "change"].includes(s.expect))
          errors.push(`${id} step ${i}: differential needs baseArgs/perturb/outPath/expect`);
      }
    }
    if (s.kind === "static") {
      if (!STATIC_FILES.has(s.file)) errors.push(`${id} step ${i}: unknown static file ${s.file}`);
      if (!["contains", "notContains"].includes(s.op)) errors.push(`${id} step ${i}: bad static op`);
      try { new RegExp(s.pattern, "i"); } catch { errors.push(`${id} step ${i}: bad static regex`); }
    }
    if (s.kind === "liveBrowser" && !s.desc) errors.push(`${id} step ${i}: liveBrowser needs desc`);
  }
}

// Material difference: feature vector per agent, pairwise cosine-ish similarity.
function features(a) {
  const toks = new Set();
  const p = a.persona || {};
  toks.add("lane:" + a.lane);
  toks.add("ageband:" + (p.age < 18 ? "u18" : p.age < 26 ? "18-25" : p.age < 40 ? "26-39" : p.age < 60 ? "40-59" : "60+"));
  toks.add("state:" + p.state);
  toks.add("income:" + (p.incomeMonthly < 2000 ? "low" : p.incomeMonthly < 6000 ? "mid" : "high"));
  toks.add("debt:" + ((p.debts || []).length ? "yes" : "no"));
  toks.add("tech:" + p.tech);
  toks.add("data:" + p.dataTier);
  toks.add("bank:" + (p.bankConnected ? "y" : "n"));
  for (const g of p.goals || []) for (const w of String(g).toLowerCase().split(/\W+/)) if (w.length > 3) toks.add("goal:" + w);
  const kinds = (a.steps || []).map((s) => s.kind).join(",");
  toks.add("kinds:" + kinds);
  for (const s of a.steps || []) {
    const txt = (s.prompt || "") + " " + (s.prompts || []).join(" ") + " " + (s.desc || "");
    for (const w of txt.toLowerCase().split(/\W+/)) if (w.length > 4) toks.add("w:" + w);
    if (s.fn) toks.add("fn:" + s.fn);
    for (const as of s.expect || []) { toks.add("assert:" + as.t); if (as.re) toks.add("re:" + as.re.slice(0, 40)); }
  }
  return toks;
}

function similarity(a, b) {
  const fa = features(a), fb = features(b);
  let inter = 0;
  for (const t of fa) if (fb.has(t)) inter++;
  return inter / Math.sqrt(fa.size * fb.size);
}

function main() {
  const argv = process.argv.slice(2);
  let files = fs.readdirSync(AGENTS_DIR).filter((f) => /^a\d{3}\.js$/.test(f)).sort();
  const fi = argv.indexOf("--files");
  const partial = fi !== -1;
  if (partial) files = argv[fi + 1].split(",").map((s) => s.trim() + ".js");

  const errors = [];
  const agents = loadAgents(files);
  for (const a of agents) checkSchema(a, errors);

  // intra-batch similarity
  const pairs = [];
  for (let i = 0; i < agents.length; i++)
    for (let j = i + 1; j < agents.length; j++) {
      const s = similarity(agents[i], agents[j]);
      if (s > 0.85) pairs.push([agents[i].id, agents[j].id, s.toFixed(2)]);
    }
  if (pairs.length) {
    errors.push(`similarity > 0.85 for ${pairs.length} pairs (template clones):`);
    for (const [x, y, s] of pairs.slice(0, 15)) errors.push(`  ${x} ~ ${y} (${s})`);
  }

  if (!partial) {
    // coverage: 10 lanes x 10
    const byLane = {};
    for (const a of agents) byLane[a.lane] = (byLane[a.lane] || 0) + 1;
    for (const l of LANES) {
      if ((byLane[l] || 0) !== 10) errors.push(`lane ${l}: got ${byLane[l] || 0}, want 10`);
    }
    if (agents.length !== 100) errors.push(`got ${agents.length} agents, want 100`);
    const ids = new Set(agents.map((a) => a.id));
    for (let i = 1; i <= 100; i++) {
      const id = "a" + String(i).padStart(3, "0");
      if (!ids.has(id)) errors.push(`missing ${id}`);
    }
    // edge cases present
    const hasU18 = agents.some((a) => a.persona.age < 18);
    const hasNoBank = agents.some((a) => a.persona.bankConnected === false && a.persona.dataTier === "none");
    const hasDecline = agents.some((a) => JSON.stringify(a.steps).toLowerCase().includes("decline"));
    if (!hasU18) errors.push("no under-18 agent");
    if (!hasNoBank) errors.push("no no-bank/no-data agent");
    if (!hasDecline) errors.push("no consent-decline path agent");
    // per-lane step-kind diversity
    for (const l of LANES) {
      const la = agents.filter((a) => a.lane === l);
      const withCalc = la.filter((a) => a.steps.some((s) => s.kind === "calc" || s.kind === "differential")).length;
      const withStatic = la.filter((a) => a.steps.some((s) => s.kind === "static")).length;
      if (withCalc < 2) errors.push(`lane ${l}: only ${withCalc} agents with calc/differential (want >=2)`);
      if (withStatic < 2) errors.push(`lane ${l}: only ${withStatic} agents with static (want >=2)`);
    }
  }

  if (errors.length) {
    console.error("VALIDATION FAILED:\n" + errors.join("\n"));
    process.exit(1);
  }
  console.log(`OK: ${agents.length} agents valid` + (partial ? " (partial)" : ", 10 lanes x 10, no clones"));
}
main();
