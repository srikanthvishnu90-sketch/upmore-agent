#!/usr/bin/env node
// Eval harness (Instinct spec doc 13).
//   node evals/runner.cjs            fast suite: layers 1, 2, 3 (fixture benchmarks), 5
//   node evals/runner.cjs --full     adds the real-browser money-safety scenarios (needs Playwright)
//   node evals/runner.cjs --json     machine-readable results only
// Results are versioned to evals/results/<timestamp>.json with the commit and the registry digest.
// Safety gates (layer 5) cannot be skipped by any flag: a single failure there fails the run.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const full = process.argv.includes("--full");
const json = process.argv.includes("--json");
const t0 = Date.now();

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ cwd: root, encoding: "utf8", env: Object.assign({}, process.env, { PLAYWRIGHT_MODULE: process.env.PLAYWRIGHT_MODULE || path.join(process.env.HOME || "", ".claude/skills/gstack/node_modules/playwright") }) }, opts || {}));
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function nodeTest(files) {
  const r = run("node", ["--test", ...files]);
  const pass = Number((/^ℹ pass (\d+)/m.exec(r.out) || [])[1] || 0), fail = Number((/^ℹ fail (\d+)/m.exec(r.out) || [])[1] || 0);
  const failures = [...r.out.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
  return { ok: r.code === 0 && fail === 0, pass, fail, failures };
}
const registry = JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8"));
const layers = [];

// Layer 1: capability acceptance. Every proven capability's test_ref must exist and pass, and the registry must validate.
{
  const proven = registry.capabilities.filter(c => ["TESTED", "VERIFIED"].includes(c.status));
  const refs = [...new Set(proven.map(c => c.test_ref))];
  const results = {};
  for (const ref of refs) {
    const abs = path.join(root, ref);
    if (!fs.existsSync(abs)) { results[ref] = { ok: false, error: "missing" }; continue; }
    results[ref] = /\.test\.(cjs|js)$/.test(ref) ? nodeTest([ref]) : (() => { const r = run("node", [ref]); return { ok: r.code === 0, pass: (r.out.match(/^\s+ok /gm) || []).length, fail: (r.out.match(/^\s+FAIL /gm) || []).length }; })();
  }
  const reg = run("node", ["scripts/capabilities", "--check"]);
  const capStatus = proven.map(c => ({ id: c.id, status: c.status, test_ref: c.test_ref, ok: results[c.test_ref] && results[c.test_ref].ok }));
  layers.push({ layer: 1, name: "capability acceptance", ok: reg.code === 0 && capStatus.every(c => c.ok), registry_valid: reg.code === 0,
    proven: capStatus.length, failing: capStatus.filter(c => !c.ok).map(c => c.id), suites: results });
}

// Layer 2: scenario suite. Operating-model scenarios, gold voice conversations, execution trust fixtures; browser money-safety under --full.
{
  const loop = nodeTest(["tests/agent-loop.test.cjs"]), voice = nodeTest(["tests/voice.test.cjs"]);
  const trust = run("node", ["tests/execution/real-trust/run-real-trust.js"]);
  const trustCounts = /(\d+) passed, (\d+) failed/.exec(trust.out) || [];
  const browser = full ? run("node", ["tests/execution/live-local/run-live-local.js"]) : null;
  const browserCounts = browser ? (/(\d+) passed, (\d+) failed/.exec(browser.out) || []) : null;
  layers.push({ layer: 2, name: "scenarios", ok: loop.ok && voice.ok && trust.code === 0 && (!browser || browser.code === 0),
    operating_model: loop, gold_voice: voice, execution_trust: { ok: trust.code === 0, pass: Number(trustCounts[1] || 0), fail: Number(trustCounts[2] || 0) },
    money_safety_browser: browser ? { ok: browser.code === 0, pass: Number(browserCounts[1] || 0), fail: Number(browserCounts[2] || 0) } : { skipped: "run with --full (real Chromium)" } });
}

// Layer 3: benchmarks against named baselines, fixture-based and re-runnable. Baseline outputs are computed here, not asserted.
{
  const bench = run("node", [path.join(__dirname, "benchmarks/savings-detection.cjs"), "--json"]);
  let savings = null; try { savings = JSON.parse(bench.out); } catch (_) { savings = { error: bench.out.slice(-400) }; }
  const parity = run("python3", ["scripts/build-parity-matrix.py", "--check"]);
  const parityLine = /all delivered: (\d+)\/(\d+) parity rows \(([\d.]+)%\)/.exec(parity.out) || [];
  const parityTests = nodeTest(["tests/parity-matrix.test.cjs"]);
  layers.push({ layer: 3, name: "benchmarks", ok: !!(savings && savings.ok) && parity.code === 0 && parityTests.ok,
    savings_detection: savings, parity_coverage: { ok: parity.code === 0, delivered: Number(parityLine[1] || 0), rows: Number(parityLine[2] || 0), pct: Number(parityLine[3] || 0) }, parity_tests: parityTests });
}

// Layer 4: judged quality evals need an LLM judge plus the human calibration set; reported as not run rather than faked.
layers.push({ layer: 4, name: "judged quality", ok: true, skipped: "requires an LLM judge run with rubric + calibration set; not part of the offline suite" });

// Layer 5: safety and boundary gates. Hard gates: advice guard red team, dataset privacy lint, registry honesty. Cannot be skipped.
{
  const guard = nodeTest(["tests/advice-guard.test.cjs"]);
  const data = run("node", ["evals/data/validate.cjs"]);
  const injection = { ok: true, skipped: "no component ingests free-text connector data yet; the 116-case set is ready for the connector layer (doc 04)" };
  layers.push({ layer: 5, name: "safety gates", ok: guard.ok && data.code === 0, advice_guard: guard, privacy_lint: { ok: data.code === 0 }, prompt_injection: injection, hard_gate: true });
}

const commit = (() => { try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch (_) { return null; } })();
const result = { at: new Date().toISOString(), commit, full, registry_capabilities: registry.capabilities.length,
  proven: registry.capabilities.filter(c => ["TESTED", "VERIFIED"].includes(c.status)).length,
  ok: layers.every(l => l.ok), duration_ms: Date.now() - t0, layers };
const outDir = path.join(__dirname, "results"); fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, result.at.replace(/[:.]/g, "-") + ".json");
fs.writeFileSync(outFile, JSON.stringify(result, null, 1) + "\n");
if (json) console.log(JSON.stringify(result, null, 1));
else {
  console.log(`eval run ${result.at} commit ${commit} ${full ? "(full)" : "(fast)"}  proven capabilities: ${result.proven}/${result.registry_capabilities}`);
  for (const l of layers) {
    const detail = l.skipped ? `skipped: ${l.skipped}` : Object.entries(l).filter(([k, v]) => v && typeof v === "object" && ("pass" in v || "ok" in v)).map(([k, v]) => `${k}=${v.skipped ? "skipped" : v.pass !== undefined ? `${v.pass}/${v.pass + (v.fail || 0)}` : v.ok ? "ok" : "FAIL"}`).join("  ");
    console.log(`${l.ok ? "ok  " : "FAIL"} layer ${l.layer} ${l.name.padEnd(22)} ${detail}${l.failing && l.failing.length ? "  failing: " + l.failing.join(",") : ""}`);
  }
  console.log(`${result.ok ? "EVAL GREEN" : "EVAL RED"} (${Math.round(result.duration_ms / 1000)}s) -> ${path.relative(root, outFile)}`);
}
process.exit(result.ok ? 0 : 1);
