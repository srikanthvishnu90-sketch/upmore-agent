"use strict";
// Depth Lane B fresh-corpus runner (2026-10-16). Drives the corpus in
// corpus.cjs through the product chat path (pilot-lib: 120 -> 130 -> 142
// -> 141, containment on), one fresh gauntlet profile + one shared ctx
// per conversation so thread state must carry the way the host carries it.
// Usage: node run-corpus.cjs [--out report.json] [--transcripts]
// Metrics per family and per band (M1/M2/M3): fallback turns, turn-pass,
// chains complete. The verdict band is the WORST band, per owner order.
const fs = require("fs");
const path = require("path");
const L = require("../gauntlet/pilot-lib.cjs");
const CORPUS = require("./corpus.cjs");

const FALLBACK_RE = /I didn't catch that|I'm Trainee, a career agent: I find roles/;
function judge(turn, delivered, r) {
  const fallback = !r || !r.handler || FALLBACK_RE.test(delivered) || (r.result && r.result.intent === "career_fallback");
  const passRes = (turn.pass || []).map((p) => new RegExp(p, "i"));
  const failRes = (turn.fail || []).map((p) => new RegExp(p, "i"));
  const passOk = passRes.every((re) => re.test(delivered));
  const failHit = failRes.some((re) => re.test(delivered));
  return { fallback, pass: !fallback && passOk && !failHit, passOk, failHit };
}

function main() {
  const args = process.argv.slice(2);
  const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const showTranscripts = args.includes("--transcripts");
  const rows = [];
  for (const conv of CORPUS) {
    const profile = L.gauntletProfile("p1-early-career-swe");
    const s = L.H.session(conv.id, "grand");
    const ctx = { profile };
    conv.turns.forEach((turn, i) => {
      const r = L.chatTurn(s, turn.say, ctx);
      const delivered = (r.delivered || []).join("\n");
      const j = judge(turn, delivered, r);
      rows.push({ conv: conv.id, family: conv.family, band: conv.band, turn: i + 1, say: turn.say,
        handler: r.handler || null, intent: r.result ? r.result.intent : null,
        fallback: j.fallback, pass: j.pass, delivered });
      if (showTranscripts) {
        console.log(`\n[${conv.id} t${i + 1}] (${conv.family}/${conv.band}) USER: ${turn.say}`);
        console.log(`  -> handler=${r.handler} intent=${r.result ? r.result.intent : "-"} fallback=${j.fallback} pass=${j.pass}`);
        console.log("  " + delivered.replace(/\n/g, "\n  "));
      }
    });
  }
  const agg = (key) => {
    const groups = {};
    for (const row of rows) {
      const g = groups[row[key]] || (groups[row[key]] = { turns: 0, fallback: 0, pass: 0 });
      g.turns += 1; if (row.fallback) g.fallback += 1; if (row.pass) g.pass += 1;
    }
    for (const g of Object.values(groups)) {
      g.fallbackPct = Math.round((g.fallback / g.turns) * 1000) / 10;
      g.passPct = Math.round((g.pass / g.turns) * 1000) / 10;
    }
    return groups;
  };
  const chains = {};
  for (const conv of CORPUS) {
    const cr = rows.filter((r) => r.conv === conv.id);
    chains[conv.id] = { family: conv.family, band: conv.band, turns: cr.length, complete: cr.every((r) => r.pass), fallbackTurns: cr.filter((r) => r.fallback).length };
  }
  const chainAgg = {};
  for (const [id, c] of Object.entries(chains)) {
    const g = chainAgg[c.family] || (chainAgg[c.family] = { chains: 0, complete: 0 });
    g.chains += 1; if (c.complete) g.complete += 1;
  }
  const report = { generated_at: new Date().toISOString(), turns: rows.length,
    byFamily: agg("family"), byBand: agg("band"), byFamilyBand: (() => { const o = {}; for (const row of rows) { const k = row.family + "/" + row.band; const g = o[k] || (o[k] = { turns: 0, fallback: 0, pass: 0 }); g.turns += 1; if (row.fallback) g.fallback += 1; if (row.pass) g.pass += 1; } for (const g of Object.values(o)) { g.fallbackPct = Math.round((g.fallback / g.turns) * 1000) / 10; g.passPct = Math.round((g.pass / g.turns) * 1000) / 10; } return o; })(),
    chains, chainAgg, rows };
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ turns: report.turns, byFamily: report.byFamily, byBand: report.byBand, byFamilyBand: report.byFamilyBand, chainAgg: report.chainAgg,
    failedTurns: rows.filter((r) => !r.pass).map((r) => `${r.conv} t${r.turn} (${r.family}/${r.band})${r.fallback ? " FALLBACK" : ""}`) }, null, 2));
}
if (require.main === module) main();
module.exports = { judge };
