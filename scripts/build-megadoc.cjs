#!/usr/bin/env node
// corpus/upmore-scenario-megadoc.txt (owner, 2026-10-11) -> evals/scenarios/megadoc.json: 240 scenarios with ID, domain,
// MSG, DO, OUTCOME, VERIFY. Edit the .txt, never the JSON.
//   node scripts/build-megadoc.cjs           rebuild
//   node scripts/build-megadoc.cjs --check   fail when the JSON is stale or the count is not the doc's own TOTAL
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
function parse(text) {
  const out = []; let domain = null, cur = null;
  for (const line of text.split(/\r?\n/)) {
    const d = /^DOMAIN ([A-Q])\. (.+)$/.exec(line); if (d) { domain = { letter: d[1], name: d[2].trim() }; continue; }
    const h = /^\[([A-Q]\d{2})\] #(\d+)\s*$/.exec(line); if (h) { cur = { id: h[1], n: Number(h[2]), domain: domain && domain.letter, domain_name: domain && domain.name, msg: null, do: "", outcome: "", verify: "" }; out.push(cur); continue; }
    if (!cur) continue;
    const f = /^(MSG|DO|OUTCOME|VERIFY):\s*(.*)$/.exec(line);
    if (f) { const k = f[1].toLowerCase(); cur[k] = k === "msg" ? f[2].replace(/^"|"$/g, "") : f[2]; cur._last = k; continue; }
    if (line.trim() && cur._last && !/^=+$/.test(line) && !/^(COVERAGE|KNOWN GAPS|TOTAL)/.test(line)) cur[cur._last] += " " + line.trim();
    if (/^=+$/.test(line) || /^COVERAGE SUMMARY/.test(line)) cur = null;
  }
  return out.map(({ _last, ...s }) => s);
}
const text = fs.readFileSync(path.join(root, "corpus/upmore-scenario-megadoc.txt"), "utf8");
const scenarios = parse(text), total = Number((/^TOTAL: (\d+)/m.exec(text) || [])[1]);
if (scenarios.length !== total) { console.error(`parsed ${scenarios.length} scenarios, the doc says TOTAL: ${total}`); process.exit(1); }
const bad = scenarios.filter(s => !s.msg || !s.do || !s.outcome || !s.verify).map(s => s.id);
if (bad.length) { console.error(`scenarios missing a field: ${bad.join(", ")}`); process.exit(1); }
const json = JSON.stringify({ source: "corpus/upmore-scenario-megadoc.txt (owner, 2026-10-11)", count: scenarios.length, scenarios }, null, 1) + "\n";
const target = path.join(root, "evals/scenarios/megadoc.json");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== json) { console.error("evals/scenarios/megadoc.json is stale: run node scripts/build-megadoc.cjs"); process.exit(1); }
  console.log(`megadoc verified: ${scenarios.length} scenarios`);
} else { fs.writeFileSync(target, json); console.log(`wrote evals/scenarios/megadoc.json: ${scenarios.length} scenarios`); }
module.exports = { parse };
