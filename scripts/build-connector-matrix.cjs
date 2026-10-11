#!/usr/bin/env node
// The connector matrix (owner, 2026-10-11): every investing platform the owner named, with the route Upmore uses to
// reach it, what that route can do (trade + track, track only, or nothing), whether Upmore can auto-invest there, and
// how far it is verified. Data: packages/connectors/platforms.json (researched; each row cites its sources). Output:
// docs/connector-matrix/README.md. Rules come from packages/domain/77-brokerage-connectors.js (validate, capability).
//   node scripts/build-connector-matrix.cjs [--check]
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const BC = require(path.join(root, "packages/domain/77-brokerage-connectors.js"));
const data = JSON.parse(fs.readFileSync(path.join(root, "packages/connectors/platforms.json"), "utf8"));
const rows = data.platforms;
const esc = s => String(s == null ? "" : s).replace(/\|/g, "/").replace(/\n/g, " ");

// Auto-invest (recurring buys): only where Upmore itself can place orders. Each run is still one order behind that
// person's yes and the per-order cap (CLAUDE.md, automations rule); Upmore never drives a platform's own recurring
// feature, and never trades through a browser session.
const autoInvest = r => BC.capability(r).trade ? "yes, each run asks for a yes" : "no";

function render() {
  const s = BC.summary(rows);
  const routeName = k => (BC.ROUTES[k] || { name: k }).name;
  const cats = [...new Set(rows.map(r => r.category))];
  const verified = rows.filter(r => r.verification === "verified_live").length;
  const L = [
    "# Connector matrix: where Upmore can reach people's investments",
    "",
    "Generated from `packages/connectors/platforms.json` by `node scripts/build-connector-matrix.cjs`; do not edit.",
    `Researched ${data.researched_on}; every row cites its sources. Routes in the owner's order of preference: the platform's`,
    "own third-party API, SnapTrade (trading where it and the brokerage allow it), Plaid (read-only), guided manual connect",
    "(read-only, last resort). \"Trade + track\" means Upmore can place orders there, each one behind the person's own yes and",
    "the $5 per-order cap; \"track only\" means holdings and balances, never orders.",
    "",
    `**${s.total} platforms: ${s.trade} trade + track, ${s.track_only} track only, ${s.none} can't connect.** ${s.shared} share an account with`,
    `another row (one connection covers both). Adapters: ${s.live || 0} live, ${s.built || 0} built (tested, not live), ${s.not_built || 0} not built.`,
    `Verified live: **${verified} of ${s.total}**. Everything else is researched or marked unverified, never assumed.`,
    "",
    "| Route | Platforms |", "| --- | --- |",
    ...Object.keys(BC.ROUTES).map(k => `| ${routeName(k)} | ${s.by_route[k] || 0} |`),
    "",
    "| Category | Platforms | Trade + track | Track only | Can't connect |", "| --- | --- | --- | --- | --- |",
    ...cats.map(c => { const l = rows.filter(r => r.category === c), cs = l.map(BC.capability); return `| ${c} | ${l.length} | ${cs.filter(x => x.trade).length} | ${cs.filter(x => !x.trade && x.read).length} | ${cs.filter(x => !x.read && !x.trade).length} |`; }),
    "",
    "## Every platform",
    "",
    "| # | Platform | Category | Route | Can do | Auto-invest | Adapter | Verification | Notes | Sources |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(r => `| ${r.n} | ${esc(r.platform)} | ${esc(r.category)} | ${routeName(r.route)} | ${BC.capability(r).label} | ${autoInvest(r)} | ${r.adapter_state.replace("_", " ")} | ${r.verification.replace("_", " ")} | ${esc(r.notes)}${r.same_account_as ? ` (same account as ${esc((rows.find(x => x.id === r.same_account_as) || {}).platform)})` : ""} | ${(r.sources || []).map((u, i) => `[${i + 1}](${u})`).join(" ")} |`),
    "",
  ];
  return L.join("\n");
}

const errors = BC.validate(rows);
const nums = rows.map(r => r.n).sort((a, b) => a - b);
if (nums.length !== 100 || nums.some((n, i) => n !== i + 1)) errors.push(`rows must be numbered 1..100 once each (have ${nums.length})`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
const out = render(), target = path.join(root, "docs/connector-matrix/README.md");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== out) { console.error("docs/connector-matrix/README.md is stale: run node scripts/build-connector-matrix.cjs"); process.exit(1); }
  console.log(`connector matrix verified: ${rows.length} platforms`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out);
  const s = BC.summary(rows);
  console.log(`connector matrix: ${s.total} platforms; trade + track ${s.trade}, track only ${s.track_only}, can't connect ${s.none}`);
}
