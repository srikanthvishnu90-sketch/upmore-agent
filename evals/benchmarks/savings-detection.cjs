#!/usr/bin/env node
// Benchmark: savings-play detection on the 40 labeled lives (doc 07 / doc 13 layer 3).
// Upmore's save engine versus a named baseline: a Rocket-Money-style recurring-charge finder that groups by raw
// descriptor and only reports subscriptions (what single-app detectors do). Both run on identical fixtures;
// metrics are recall, precision against the planted set, dollar accuracy, and false positives on control rows.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..", "..");
const ctx = vm.createContext({});
vm.runInContext(["33-agent-monitors.js", "47-save-engine.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.M=AgentMonitors;this.E=AgentSaveEngine;", ctx);
const { M, E } = ctx;
const lives = JSON.parse(fs.readFileSync(path.join(root, "evals/data/labeled/savings-lives.json"), "utf8")).lives;
const sig = o => `${o.play}|${o.key}`;

// Baseline: raw-descriptor recurring detection, subscriptions only, no normalization, no fees/rates/debt/structure.
function baseline(l) {
  const out = [];
  for (const r of M.recurring(l.transactions, l.today)) {
    if (r.dormant) continue;
    const slug = E.slugOf(r.rows[0].merchant, Math.round(r.amount * 100));
    if (!slug) continue;
    out.push({ play: "P1_subscription", key: `merchant:${slug}`, expected_monthly_cents: Math.round(r.amount * 100) });
  }
  return out;
}
function score(detect) {
  let planted = 0, found = 0, exactDollars = 0, controlHits = 0, extras = 0;
  const byPlay = {};
  for (const l of lives) {
    const got = detect(l), gotBy = new Map(got.map(c => [sig(c), c]));
    const plays = l.opportunities.filter(o => o.play !== "control"), controls = l.opportunities.filter(o => o.play === "control");
    const plantedSigs = new Set(plays.map(sig));
    for (const o of plays) {
      planted++; const p = byPlay[o.play] || (byPlay[o.play] = { planted: 0, found: 0 }); p.planted++;
      const c = gotBy.get(sig(o)); if (c) { found++; p.found++; if (c.expected_monthly_cents === o.expected_monthly_cents) exactDollars++; }
    }
    for (const o of controls) if (got.some(c => c.key === o.key)) controlHits++;
    for (const c of got) if (!plantedSigs.has(sig(c))) extras++;
  }
  return { planted, found, recall: +(found / planted).toFixed(3), exact_dollars: exactDollars, dollar_accuracy: +(exactDollars / Math.max(1, found)).toFixed(3), control_hits: controlHits, unplanted: extras, by_play: byPlay };
}
const input = l => ({ today: l.today, transactions: l.transactions, accounts: l.accounts, bills: l.bills, debts: l.debts, usage: l.usage_signals, market: l.market });
const upmore = score(l => E.detect(input(l))), base = score(baseline);
const result = { benchmark: "savings-detection", lives: lives.length, baseline: "raw-descriptor recurring finder (subscriptions only)",
  upmore, baseline_scores: base, ok: upmore.recall >= base.recall && upmore.control_hits === 0 && upmore.recall >= 0.95 };
if (process.argv.includes("--json")) console.log(JSON.stringify(result));
else {
  console.log(`savings detection on ${lives.length} lives`);
  console.log(`  upmore   recall ${upmore.recall} (${upmore.found}/${upmore.planted})  dollar accuracy ${upmore.dollar_accuracy}  control hits ${upmore.control_hits}  unplanted ${upmore.unplanted}`);
  console.log(`  baseline recall ${base.recall} (${base.found}/${base.planted})  dollar accuracy ${base.dollar_accuracy}  control hits ${base.control_hits}  unplanted ${base.unplanted}`);
  for (const p of Object.keys(upmore.by_play).sort()) console.log(`    ${p.padEnd(16)} upmore ${upmore.by_play[p].found}/${upmore.by_play[p].planted}   baseline ${(base.by_play[p] || { found: 0 }).found}/${upmore.by_play[p].planted}`);
  console.log(result.ok ? "BETTER: upmore meets the bar" : "NOT BETTER");
}
process.exit(result.ok ? 0 : 1);
