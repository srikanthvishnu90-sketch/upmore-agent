#!/usr/bin/env node
// Eval harness (Instinct spec doc 13): runs every layer against the as-built system, stores versioned results, and gates.
//   node evals/runner.cjs                 the suite: acceptance, scenarios, benchmark, judged, safety; a release verdict
//   node evals/runner.cjs --label name    results land in evals/results/<label>/results.json (default: the short commit)
//   node evals/runner.cjs --mutations     seed the 10 defects in evals/mutations.cjs one at a time; each must fail and name its layer
//   node evals/runner.cjs --only scenarios,safety   a diagnostic subset; never a release verdict
//   node evals/runner.cjs --json
// Layers 2 to 5 run in process over modules loaded from source, so a mutation can be injected without touching
// the files. Layer 1 runs the registry's own test files as child processes against the real tree.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const Adversarial = require(path.join(root, "evals/data/run-adversarial.cjs"));
const Scenarios = require(path.join(root, "evals/scenarios/operating-model.cjs"));
const NaiveAgent = require(path.join(root, "evals/baselines/naive-agent.cjs"));
const NaiveFinder = require(path.join(root, "evals/baselines/subscription-finder-naive.cjs"));
const NewsBench = require(path.join(root, "evals/news/benchmark.cjs"));
const rubric = JSON.parse(fs.readFileSync(path.join(root, "evals/judges/voice-rubric.json"), "utf8"));
const gates = JSON.parse(fs.readFileSync(path.join(root, "evals/gates/release.json"), "utf8"));
const DOMAIN = ["33-agent-monitors.js", "35-agent-intents.js", "36-agent-workflows.js", "41-agent-recovery.js", "43-agent-loop.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "49-agent-save.js", "44-agent-earn.js", "45-advice-guard.js", "50-agent-invest.js", "55-agent-news.js"];
const NAMES = { "33-agent-monitors.js": "AgentMonitors", "35-agent-intents.js": "AgentIntents", "36-agent-workflows.js": "AgentWorkflows", "41-agent-recovery.js": "AgentRecovery", "43-agent-loop.js": "AgentLoop", "46-voice.js": "AgentVoice", "47-data-guard.js": "DataGuard", "48-money-math.js": "MoneyMath", "49-agent-save.js": "AgentSave", "44-agent-earn.js": "AgentEarn", "45-advice-guard.js": "AdviceGuard", "50-agent-invest.js": "AgentInvest", "55-agent-news.js": "AgentNews" };

// Load the domain modules from source into one sandbox, applying string patches first (each must match exactly once).
function loadModules(patches) {
  const src = {};
  for (const f of DOMAIN) src[f] = fs.readFileSync(path.join(root, "packages/domain", f), "utf8");
  src["registry.js"] = fs.readFileSync(path.join(root, "packages/capabilities/registry.js"), "utf8");
  for (const p of patches || []) { const n = src[p.file].split(p.find).length - 1; if (n !== 1) throw new Error(`patch for ${p.file} matches ${n} times`); src[p.file] = src[p.file].replace(p.find, p.replace); }
  const ctx = vm.createContext({ console });
  vm.runInContext(DOMAIN.map(f => src[f]).join("\n") + "\n" + src["registry.js"] + "\nthis.__m = {" + DOMAIN.map(f => `${NAMES[f]}: typeof ${NAMES[f]} !== "undefined" ? ${NAMES[f]} : undefined`).join(", ") + ", CapabilityRegistry: typeof CapabilityRegistry !== 'undefined' ? CapabilityRegistry : undefined };", ctx);
  return ctx.__m;
}
const registryJson = () => JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8"));
const exists = rel => fs.existsSync(path.join(root, rel));

// Layer 1: capability acceptance. Every test_ref the registry cites runs, and the registry refuses a status its tests do not back.
function acceptance(m) {
  const reg = registryJson(), refs = [...new Set(reg.capabilities.filter(c => c.test_ref).map(c => c.test_ref))].sort();
  const files = refs.map(ref => {
    const abs = path.join(root, ref); const isNodeTest = /\.cjs$/.test(ref) || /\.test\.js$/.test(ref);
    const r = isNodeTest ? spawnSync("node", /\.cjs$/.test(ref) ? ["--test", abs] : [abs], { cwd: root, encoding: "utf8", timeout: 600000 }) : { status: null };
    const out = (r.stdout || "") + (r.stderr || "");
    const skipped = !isNodeTest; // browser and watcher runs are recorded by their own harnesses (evidence ledger), not re-run here
    return { test_ref: ref, capabilities: reg.capabilities.filter(c => c.test_ref === ref).map(c => c.id), pass: skipped ? null : r.status === 0 && !/^# fail [1-9]/m.test(out), skipped, summary: (out.match(/^# (pass|fail) \d+/mg) || []).join(" ") };
  });
  const errors = m.CapabilityRegistry.validate(reg, exists);
  // The registry must refuse an overclaim: a TESTED entry without a test is an error.
  const refused = m.CapabilityRegistry.validate({ capabilities: [{ id: "ZZZ-001", name: "x", domain: "x", domain_code: "ZZZ", owner_doc: "02", tier: "T0", status: "TESTED", test_ref: null }] }, exists).length > 0;
  const ok = files.every(f => f.pass !== false) && errors.length === 0 && refused;
  return { ok, files, registry_errors: errors, refuses_overclaim: refused, proven: reg.capabilities.filter(c => c.status === "TESTED" || c.status === "VERIFIED").length };
}

// Layer 2: scenarios through the assembled operating model, and the reviewed gold conversations through the composer.
async function scenarios(m) {
  const make = o => m.AgentLoop.create(Object.assign({ registry: Scenarios.registry, clock: () => Scenarios.NOW, guard: m.DataGuard }, o));
  const makeNaive = o => NaiveAgent.create(Object.assign({ registry: Scenarios.registry }, o));
  const run = async (factory) => { const out = []; for (const s of Scenarios.scenarios) { let checks; try { checks = await s.run(factory); } catch (e) { checks = [{ name: "threw", ok: false, detail: String(e && e.message || e) }]; } out.push({ id: s.id, title: s.title, pass: checks.every(c => c.ok), failed: checks.filter(c => !c.ok).map(c => c.name) }); } return out; };
  const upmore = await run(make), naive = await run(makeNaive);
  const gold = JSON.parse(fs.readFileSync(path.join(root, "evals/data/gold/drafts.json"), "utf8")).conversations.filter(c => c.review === "reviewed");
  const goldResults = gold.map(g => { const bad = []; for (const t of g.turns) { if (!t.agent) continue; try { const out = m.AgentVoice.compose(t.agent.kind, t.agent.fields, t.agent.ctx); if (JSON.stringify(out.bubbles) !== JSON.stringify(t.expected)) bad.push(t.agent.kind); } catch (e) { bad.push(t.agent.kind + ": " + e.message); } } return { id: g.id, pass: bad.length === 0, bad }; });
  return { ok: upmore.every(s => s.pass) && goldResults.every(g => g.pass), scenarios: { total: upmore.length, passed: upmore.filter(s => s.pass).length, failures: upmore.filter(s => !s.pass) }, baseline_naive: { total: naive.length, passed: naive.filter(s => s.pass).length, failures: naive.filter(s => !s.pass).map(s => s.id) }, gold: { total: goldResults.length, passed: goldResults.filter(g => g.pass).length, failures: goldResults.filter(g => !g.pass) } };
}

// Layer 3: benchmarks against named baselines on the 40 synthetic lives, outputs captured and versioned.
function benchmark(m, label) {
  const data = JSON.parse(fs.readFileSync(path.join(root, "evals/data/labeled/savings-lives.json"), "utf8"));
  const SUBS = ["netflix com", "spotify usa", "apple com bill", "hulu", "amazon prime", "disney plus", "google one", "planet fit", "nytimes", "adobe creative", "microsoft 365", "peloton", "apple com bill apple music"];
  const plays = ["P1_subscription", "P2_negotiation", "P3_fee", "P4_rate", "P7_debt", "P8_structural"];
  let tp = 0, fp = 0, fn = 0, invTp = 0, invFp = 0, invFn = 0, nTp = 0, nFp = 0, nFn = 0;
  const perPlay = {};
  for (const l of data.lives) {
    const r = m.AgentSave.detect({ today: l.today, transactions: l.transactions, accounts: l.accounts, bills: l.bills, debts: l.debts, extra_payment_cents: data.detector_inputs.extra_payment_cents, reference_apy_bps: data.detector_inputs.reference_apy_bps });
    for (const play of plays) { const got = new Set(r.opportunities.filter(o => o.play === play).map(o => o.key)), want = new Set(l.opportunities.filter(o => o.play === play).map(o => o.key)); const p = perPlay[play] || (perPlay[play] = { tp: 0, fp: 0, fn: 0 }); for (const k of got) { if (want.has(k)) { tp++; p.tp++; } else { fp++; p.fp++; } } for (const k of want) if (!got.has(k)) { fn++; p.fn++; } }
    const truth = new Set(l.transactions.map(t => m.AgentMonitors.merchantKey(t.merchant_raw)).filter(k => SUBS.includes(k)));
    const inv = new Set(r.inventory.map(i => i.key)); for (const k of inv) { if (truth.has(k)) invTp++; else invFp++; } for (const k of truth) if (!inv.has(k)) invFn++;
    const naive = new Set(NaiveFinder.inventory(l.transactions).map(i => i.key)); for (const k of naive) { if (truth.has(k)) nTp++; else nFp++; } for (const k of truth) if (!naive.has(k)) nFn++;
  }
  const pr = (a, b, c) => ({ precision: a + b ? +(a / (a + b)).toFixed(4) : 1, recall: a + c ? +(a / (a + c)).toFixed(4) : 1, tp: a, fp: b, fn: c });
  const upmore = { plays: pr(tp, fp, fn), per_play: Object.fromEntries(Object.entries(perPlay).map(([k, v]) => [k, pr(v.tp, v.fp, v.fn)])), subscription_inventory: pr(invTp, invFp, invFn) };
  const baseline = { name: "naive subscription finder (stand-in for Rocket Money / Monarch-style detectors; a model of their behavior, not their code)", subscription_inventory: pr(nTp, nFp, nFn), plays: { note: "finds no plays beyond listing repeats; every listed repeat is claimed as a saving, nothing verified" } };
  // Ledger discipline: estimates never book.
  let ledgerOk = false; try { m.AgentSave.ledger().book({ key: "x", play: "P2_negotiation", expected_monthly_cents: 100 }, { verified: false }, "2026-10-10"); } catch (e) { ledgerOk = /verified/.test(String(e.message)); }
  // News relevance on the labeled week (doc 10): brief precision, alert recall, interruptions, clustering, vs the raw feed and a generic app's pings.
  const news = NewsBench.run(m.AgentNews);
  const g = gates.required.benchmark;
  const newsOk = news.totals.brief_precision_min >= g.news_brief_precision_min && news.totals.alert_recall_min >= g.news_alert_recall_min && news.totals.false_alerts_per_week_max <= g.news_false_alerts_per_week_max && news.totals.duplicate_alerts_per_week_max <= g.news_duplicate_alerts_per_week_max && news.totals.merged_clusters <= g.news_merged_clusters_max;
  const ok = upmore.plays.recall >= g.save_play_recall_min && upmore.plays.precision >= g.save_play_precision_min && upmore.subscription_inventory.precision >= g.subscription_inventory_precision_min && upmore.subscription_inventory.recall >= g.subscription_inventory_recall_min && ledgerOk === g.ledger_books_verified_only && newsOk;
  const captured = { label, lives: data.lives.length, upmore, baseline, ledger_books_verified_only: ledgerOk, news: { ok: newsOk, stories: news.stories, totals: news.totals, personas: Object.fromEntries(Object.entries(news.personas).map(([k, v]) => [k, { brief_precision: v.upmore.brief.precision, brief_items: v.upmore.brief.items, alert_recall: v.upmore.alerts.recall, false_alerts_per_week: v.upmore.alerts.false_per_week, duplicate_alerts_per_week: v.upmore.alerts.duplicate_per_week, raw_feed_precision: v.baselines.raw_firehose.precision, generic_app_pings_per_week: v.baselines.generic_app_notifications.interruptions_per_week, generic_app_false_per_week: v.baselines.generic_app_notifications.false_per_week }])) } };
  const dir = path.join(root, "evals/baselines/captured"); fs.mkdirSync(dir, { recursive: true }); if (label) fs.writeFileSync(path.join(dir, label + ".json"), JSON.stringify(captured, null, 1) + "\n");
  return Object.assign({ ok }, captured);
}

// Layer 4: judged quality with the rubric's deterministic judge over the calibration set: clean turns clean, flagged samples flagged with the named class.
function judged(m) {
  const gold = JSON.parse(fs.readFileSync(path.join(root, "evals/data/gold/drafts.json"), "utf8")).conversations.filter(c => c.review === "reviewed");
  const cleanFailures = []; for (const g of gold) for (const t of g.turns) if (t.agent) { const f = m.AgentVoice.lint(t.expected.join(" "), { severity: t.agent.ctx && t.agent.ctx.severity }); if (f.length) cleanFailures.push({ id: g.id, findings: f }); }
  const flaggedFailures = []; const classes = {}; for (const [cls, text] of rubric.calibration_set.flagged) { const f = m.AgentVoice.lint(text, { severity: cls === "wrong_gravity" ? "high" : undefined, requires_source: cls === "ungrounded_money" }); classes[cls] = (classes[cls] || 0) + 1; if (!f.some(x => x.rule === cls)) flaggedFailures.push({ class: cls, text, got: f.map(x => x.rule) }); }
  return { ok: cleanFailures.length === 0 && flaggedFailures.length === 0, judge: rubric.judge, clean_turns: gold.reduce((n, g) => n + g.turns.filter(t => t.agent).length, 0), clean_failures: cleanFailures, flagged_samples: rubric.calibration_set.flagged.length, flagged_failures: flaggedFailures, llm_judge: "not run" };
}

// Layer 5: safety and boundary gates.
async function safety(m) {
  const r = await Adversarial.run({ guard: true, modules: { AgentLoop: m.AgentLoop, DataGuard: m.DataGuard, MoneyMath: m.MoneyMath, AdviceGuard: m.AdviceGuard } });
  return { ok: r.ok, injection: { total: r.injection.total, failed: r.injection.failed }, traps: { total: r.traps.total, failed: r.traps.failed }, advice: { total: r.advice.total, failed: r.advice.failed, by_set: r.advice.by_set }, failures: { injection: r.injection.failures.map(f => f.id), traps: r.traps.failures.map(f => f.id), advice: r.advice.failures.map(f => f.id) } };
}

const commit = () => { try { return spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(); } catch (e) { return "unknown"; } };
async function runLayers(m, only, label) {
  const layers = {};
  const want = l => !only || only.includes(l);
  if (want("acceptance")) layers.acceptance = acceptance(m);
  if (want("scenarios")) layers.scenarios = await scenarios(m);
  if (want("benchmark")) layers.benchmark = benchmark(m, label);
  if (want("judged")) layers.judged = judged(m);
  if (want("safety")) layers.safety = await safety(m);
  return layers;
}
async function run(opts) {
  const o = opts || {}, label = o.label || commit(), m = loadModules(o.patches);
  const layers = await runLayers(m, o.only, o.only ? null : label);
  const required = ["acceptance", "scenarios", "benchmark", "judged", "safety"];
  const verdict = o.only ? "diagnostic only, not a release verdict" : (required.every(l => layers[l] && layers[l].ok) ? "RELEASE OK" : "BLOCKED by " + required.filter(l => !layers[l] || !layers[l].ok).join(", "));
  const result = { label, commit: commit(), observed_at: new Date().toISOString(), layers, gates: gates.required, verdict, ok: !o.only && required.every(l => layers[l] && layers[l].ok) };
  if (!o.only && !o.noWrite) { const dir = path.join(root, "evals/results", label); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "results.json"), JSON.stringify(result, null, 1) + "\n"); }
  return result;
}
// Mutation testing: each seeded defect must be caught by the in-process layers, and the expected layer must be among those that catch it.
async function mutations() {
  const list = require(path.join(root, "evals/mutations.cjs")), out = [];
  for (const mu of list) {
    const m = loadModules(mu.patches);
    const layers = {};
    layers.acceptance = { ok: (() => { try { const refused = m.CapabilityRegistry.validate({ capabilities: [{ id: "ZZZ-001", name: "x", domain: "x", domain_code: "ZZZ", owner_doc: "02", tier: "T0", status: "TESTED", test_ref: null }] }, exists).length > 0; return refused; } catch (e) { return false; } })() };
    layers.scenarios = await scenarios(m); layers.benchmark = benchmark(m, null); layers.judged = judged(m); layers.safety = await safety(m);
    const caught = Object.keys(layers).filter(l => !layers[l].ok);
    out.push({ id: mu.id, title: mu.title, expected_layer: mu.layer, caught_by: caught, pass: caught.includes(mu.layer) });
  }
  return { ok: out.every(x => x.pass), mutations: out, caught: out.filter(x => x.pass).length, total: out.length };
}
function table(r) {
  const L = r.layers, row = (n, ok, d) => `${(ok ? "PASS" : "FAIL").padEnd(5)} ${n.padEnd(11)} ${d}`;
  const lines = [`eval ${r.label} @ ${r.commit}`];
  if (L.acceptance) lines.push(row("acceptance", L.acceptance.ok, `${L.acceptance.files.filter(f => f.pass).length}/${L.acceptance.files.filter(f => !f.skipped).length} test files pass, ${L.acceptance.files.filter(f => f.skipped).length} recorded elsewhere, ${L.acceptance.proven} proven capabilities, registry ${L.acceptance.registry_errors.length ? "INVALID" : "valid"}, refuses overclaim: ${L.acceptance.refuses_overclaim}`));
  if (L.scenarios) lines.push(row("scenarios", L.scenarios.ok, `${L.scenarios.scenarios.passed}/${L.scenarios.scenarios.total} operating model, ${L.scenarios.gold.passed}/${L.scenarios.gold.total} gold; naive baseline ${L.scenarios.baseline_naive.passed}/${L.scenarios.baseline_naive.total} (fails ${L.scenarios.baseline_naive.failures.join(",")})`));
  if (L.benchmark) lines.push(row("benchmark", L.benchmark.ok, `plays P/R ${L.benchmark.upmore.plays.precision}/${L.benchmark.upmore.plays.recall}; subscriptions P/R ${L.benchmark.upmore.subscription_inventory.precision}/${L.benchmark.upmore.subscription_inventory.recall} vs naive ${L.benchmark.baseline.subscription_inventory.precision}/${L.benchmark.baseline.subscription_inventory.recall}; ledger verified-only ${L.benchmark.ledger_books_verified_only}; news brief precision min ${L.benchmark.news.totals.brief_precision_min}, alert recall min ${L.benchmark.news.totals.alert_recall_min}, false alerts/wk max ${L.benchmark.news.totals.false_alerts_per_week_max} vs raw feed precision ${L.benchmark.news.totals.baseline_raw_precision_max}`));
  if (L.judged) lines.push(row("judged", L.judged.ok, `${L.judged.clean_turns} clean turns, ${L.judged.flagged_samples} flagged samples, ${L.judged.clean_failures.length + L.judged.flagged_failures.length} misses; LLM judge ${L.judged.llm_judge}`));
  if (L.safety) lines.push(row("safety", L.safety.ok, `injection ${L.safety.injection.total - L.safety.injection.failed}/${L.safety.injection.total}, traps ${L.safety.traps.total - L.safety.traps.failed}/${L.safety.traps.total}, advice ${L.safety.advice.total - L.safety.advice.failed}/${L.safety.advice.total}`));
  lines.push(`verdict: ${r.verdict}`);
  return lines.join("\n");
}
if (require.main === module) {
  const a = process.argv.slice(2), flag = n => { const i = a.indexOf(n); return i >= 0 ? (a[i + 1] || true) : null; };
  (async () => {
    if (a.includes("--mutations")) { const r = await mutations(); if (a.includes("--json")) console.log(JSON.stringify(r, null, 1)); else { for (const x of r.mutations) console.log(`${x.pass ? "CAUGHT " : "MISSED "} ${x.id} ${x.title} -> expected ${x.expected_layer}, caught by [${x.caught_by.join(", ")}]`); console.log(`${r.caught}/${r.total} mutations caught and attributed`); } process.exit(r.ok ? 0 : 1); }
    const r = await run({ label: typeof flag("--label") === "string" ? flag("--label") : undefined, only: typeof flag("--only") === "string" ? flag("--only").split(",") : null });
    console.log(a.includes("--json") ? JSON.stringify(r, null, 1) : table(r));
    process.exit(r.ok ? 0 : 1);
  })().catch(e => { console.error(e); process.exit(2); });
}
module.exports = { run, mutations, loadModules, acceptance, scenarios, benchmark, judged, safety, table };
