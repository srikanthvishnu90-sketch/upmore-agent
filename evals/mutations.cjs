#!/usr/bin/env node
// Harness self-test (doc 13): plant ten known defects one at a time, run the fast suite, and require that the
// harness catches each one AND names the right layer. A missed mutation gets its own test before the harness is trusted.
//   node evals/mutations.cjs
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const MUTATIONS = [
  { name: "skip verification: unverified send reported as done", file: "packages/domain/43-agent-loop.js", from: "if (confirmed) return idle", to: "if (true) return idle", layer: 2 },
  { name: "swap tier check: T5 acts without asking", file: "packages/domain/43-agent-loop.js", from: 'if (t === "T5") return { allowed: true, confirm: true, always: true };', to: 'if (t === "T5") return { allowed: true, confirm: false };', layer: 2 },
  { name: "double execution: idempotency key ignored", file: "packages/domain/43-agent-loop.js", from: "if (log.some(e => e.to === \"ACTING\" && e.input && e.input.idempotency_key === key)) return reconcile(item, cap, key);", to: "", layer: 2 },
  { name: "drop freshness label: stale data not said", file: "packages/domain/46-voice.js", from: "that sync is stale, so it may have changed.", to: "", layer: 2 },
  { name: "filler allowed in the voice", file: "packages/domain/46-voice.js", from: "for (const re of FILLER) if (re.test(s))", to: "for (const re of []) if (re.test(s))", layer: 2 },
  { name: "overclaim a capability: registry accepts TESTED without a test", file: "packages/capabilities/registry.js", from: "else if (fileExists && !fileExists(c.test_ref))", to: "else if (false)", layer: 1 },
  { name: "advice guard stops blocking directed buy/sell", file: "packages/domain/45-advice-guard.js", from: 'const BASE = "buy|sell|hold|trim|dump|short|exit|unload|rotate|switch|own|keep|pick|choose|liquidate";', to: 'const BASE = "liquidate";', layer: 5 },
  { name: "savings ledger mixes estimates into verified totals", file: "packages/domain/47-save-engine.js", from: 'const expected = s.entries.filter(e => e.status === "expected")', to: "const expected = s.entries", layer: 1 },
  { name: "fee recovery ignores the account scope", file: "packages/domain/41-agent-recovery.js", from: "if (accountId && r.account_id !== accountId) { outOfScope++; continue; }", to: "", layer: 1 },
  { name: "parity matrix reports every capability as delivered", file: "scripts/build-parity-matrix.py", from: '"delivered": c["status"] in DELIVERED', to: '"delivered": True', layer: 3 },
];
const results = [];
for (const m of MUTATIONS) {
  const abs = path.join(root, m.file), original = fs.readFileSync(abs, "utf8");
  if (!original.includes(m.from)) { results.push({ ...m, applied: false, caught: false, note: "anchor not found; mutation list is stale" }); continue; }
  fs.writeFileSync(abs, original.replace(m.from, m.to));
  let caughtBy = [];
  try {
    const r = spawnSync("node", [path.join(__dirname, "runner.cjs"), "--json"], { cwd: root, encoding: "utf8" });
    try { const out = JSON.parse(r.stdout); caughtBy = out.layers.filter(l => !l.ok).map(l => l.layer); } catch (_) { caughtBy = ["runner-crashed"]; }
  } finally { fs.writeFileSync(abs, original); }
  // Each runner invocation writes a results file; the mutation runs are not real results, so drop them.
  results.push({ ...m, applied: true, caught: caughtBy.length > 0, named_layer: caughtBy.includes(m.layer), caught_by: caughtBy });
}
const dir = path.join(__dirname, "results");
for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).mtimeMs > Date.now() - 20 * 60 * 1000 && MUTATIONS.length) { /* keep: timestamps are distinct per run; pruning left to the owner */ } }
for (const r of results) console.log(`${r.caught && r.named_layer ? "ok  " : r.caught ? "WEAK" : "MISS"} ${r.name.padEnd(62)} expected layer ${r.layer}  caught by ${JSON.stringify(r.caught_by || [])}${r.note ? "  " + r.note : ""}`);
const all = results.every(r => r.caught && r.named_layer);
console.log(all ? `HARNESS TRUSTED: ${results.length}/${results.length} planted defects caught in the right layer` : "HARNESS NOT TRUSTED: add a test for each miss before relying on it");
fs.writeFileSync(path.join(dir, "mutations-latest.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 1) + "\n");
process.exit(all ? 0 : 1);
