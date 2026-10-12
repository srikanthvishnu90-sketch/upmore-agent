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
const autoInvest = r => BC.capability(r).trade ? (BC.today(r, rows).state === "connect" ? "yes, each run asks for a yes" : "once built, each run asks for a yes") : "no";
const AUTH_WORDS = { oauth: "OAuth on the company's site", partner_oauth: "OAuth after the company approves Upmore", personal_api_key: "the person's own API key, through the secure link into the vault", aggregator: "logs in on the company's site through the aggregator", manual_session: "logs in themselves in a live browser window; only the encrypted session is kept", none: "-" };

// Owner, 2026-10-12: every row stays unverified until a real account connects through it, and every update shows the
// verified and unverified counts. Researched means the route is documented with sources, not that it was proven.
const vcount = l => { const verified = l.filter(r => r.verification === "verified_live").length, researched = l.filter(r => r.verification === "researched").length; return { verified, unverified: l.length - verified, researched, unconfirmed: l.length - verified - researched }; };
const VERIFY_WORDS = { verified_live: "verified (real account)", researched: "unverified (researched)", unverified: "unverified (unconfirmed)" };

function render() {
  const s = BC.summary(rows);
  const routeName = k => (BC.ROUTES[k] || { name: k }).name;
  const cats = [...new Set(rows.map(r => r.category))];
  const verified = rows.filter(r => r.verification === "verified_live").length;
  const owner = rows.filter(r => r.n <= 100), extra = rows.filter(r => r.n > 100);
  const so = BC.summary(owner);
  const blocked = rows.filter(r => r.blocked_reason);
  const reasons = [...new Set(blocked.map(r => r.blocked_reason.split(":")[0]))];
  const t = s.today;
  const L = [
    "# Connector matrix: where Upmore can reach people's investments",
    "",
    "Generated from `packages/connectors/platforms.json` by `node scripts/build-connector-matrix.cjs`; do not edit.",
    `Researched ${data.researched_on}; every researched row cites its sources, and a row nobody could confirm says unverified.`,
    "Routes in the owner's order of preference: the platform's own third-party API, SnapTrade (trading where it and the",
    "brokerage allow it), Plaid (read-only), guided manual connect (read-only, last resort). \"Trade + track\" means Upmore",
    "can place orders there, each one behind the person's own yes and the $5 per-order cap; \"track only\" means holdings",
    "and balances, never orders. Nobody ever gives Upmore a password: see the sign-in column.",
    "",
    "## In numbers",
    "",
    `The owner's 100 platforms${extra.length ? ` plus ${extra.map(r => r.platform).join(", ")} (Upmore's first live connection, row ${extra.map(r => r.n).join(", ")})` : ""}.`,
    "",
    "| | Owner's 100 | All rows |", "| --- | --- | --- |",
    `| Trade + track (route can trade, not switched off) | ${so.trade} | ${s.trade} |`,
    `| Track only | ${so.track_only} | ${s.track_only} |`,
    `| Off: owner decision (route could trade: ${s.route_trade - s.trade}) | ${so.blocked} | ${s.blocked} |`,
    `| Can't connect | ${so.none} | ${s.none} |`,
    `| Shares an account with another row | ${so.shared} | ${s.shared} |`,
    `| **Verified with a real account** | **${vcount(owner).verified}** | **${vcount(rows).verified}** |`,
    `| **Unverified** (researched with sources / research could not confirm) | **${vcount(owner).unverified}** (${vcount(owner).researched} / ${vcount(owner).unconfirmed}) | **${vcount(rows).unverified}** (${vcount(rows).researched} / ${vcount(rows).unconfirmed}) |`,
    "",
    `**Research contradictions: ${BC.contradictions(rows).length}.** Every row's route is the one its own research names as best (a shared account follows its parent), no row marked researched relies on a part its research calls unverified, and no row claims trading where its research says read-only (checked by \`contradictions()\` in packages/domain/77-brokerage-connectors.js on every build).`,
    "",
    `**Today:** ${t.connect || 0} connect now (${rows.filter(r => BC.today(r, rows).state === "connect" && BC.capability(r).trade).map(r => r.platform).join(", ") || "none"} with trading; the rest track only, through Plaid), ${t.try || 0} worth a try through Plaid (coverage unverified), ${t.fallback || 0} track now through a fallback while the direct route waits, ${t.not_built || 0} not built, ${t.blocked || 0} off, ${t.none || 0} can't connect.`,
    `Adapters: ${s.live || 0} rows on a live adapter, ${s.built || 0} built (tested, not live), ${s.not_built || 0} not built. Verified with a real account: **${verified} of ${s.total}**; every other row is unverified until one connects through it.`,
    "Live adapter means the code path is deployed (Plaid's production function, Alpaca's OAuth functions); it does not mean",
    "that platform has been connected end to end. Plaid coverage of each institution is the verification column.",
    "",
    "| Route | Platforms |", "| --- | --- |",
    ...Object.keys(BC.ROUTES).map(k => `| ${routeName(k)} | ${s.by_route[k] || 0} |`),
    "",
    "| Category | Platforms | Trade + track | Track only | Off | Can't connect |", "| --- | --- | --- | --- | --- | --- |",
    ...cats.map(c => { const l = rows.filter(r => r.category === c), cs = l.map(r => BC.capability(r)); return `| ${c} | ${l.length} | ${cs.filter(x => x.trade).length} | ${cs.filter(x => !x.trade && x.read).length} | ${cs.filter(x => x.blocked).length} | ${cs.filter(x => !x.read && !x.trade && !x.blocked).length} |`; }),
    "",
    "## Switched off until the owner decides",
    "",
    ...reasons.map(k => `- **${k}** (${blocked.filter(r => r.blocked_reason.startsWith(k)).map(r => r.platform).join(", ")}): ${blocked.find(r => r.blocked_reason.startsWith(k)).blocked_reason.slice(k.length + 1).trim()}`),
    "- Prediction markets, standing rule (owner, 2026-10-11): Upmore never encourages a Kalshi or Polymarket decision. If they",
    "  are ever switched on, anything Upmore says or does there rests on numbers only (prices, implied odds, fees, the",
    "  person's P&L), never a nudge toward a position.",
    "",
    "## Every platform",
    "",
    "| # | Platform | Category | Region | Route | Route can do | Today | Auto-invest | Sign-in | Needs | Verification | Notes | Sources |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(r => `| ${r.n} | ${esc(r.platform)} | ${esc(r.category)} | ${esc(r.region)} | ${routeName(r.route)} | ${BC.capability(r, { route: true }).label} | ${BC.today(r, rows).label} | ${autoInvest(r)} | ${AUTH_WORDS[r.auth] || "-"} | ${esc(r.needs || "-")} | ${VERIFY_WORDS[r.verification]} | ${esc(r.notes)}${r.same_account_as ? ` (same account as ${esc((rows.find(x => x.id === r.same_account_as) || {}).platform)})` : ""} | ${(r.sources || []).map((u, i) => `[${i + 1}](${u})`).join(" ")} |`),
    "",
  ];
  return L.join("\n");
}

const errors = BC.validate(rows).concat(BC.contradictions(rows).map(c => `#${c.n} ${c.id}: research contradiction (${c.kind}): ${c.text}`));
// Rows 1..100 are the owner's list, once each; rows past 100 are platforms Upmore added (Alpaca), numbered on from 101.
const nums = rows.map(r => r.n).sort((a, b) => a - b);
if (nums.length < 100 || nums.some((n, i) => n !== i + 1)) errors.push(`rows must be numbered 1..${Math.max(100, nums.length)} once each (have ${nums.length})`);
for (const r of rows) if (!r.category || !r.region || !r.auth || !r.notes) errors.push(`#${r.n} ${r.platform}: category, region, auth and notes are required`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
const out = render(), target = path.join(root, "docs/connector-matrix/README.md");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== out) { console.error("docs/connector-matrix/README.md is stale: run node scripts/build-connector-matrix.cjs"); process.exit(1); }
  console.log(`connector matrix verified: ${rows.length} platforms`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, out);
  const s = BC.summary(rows);
  console.log(`connector matrix: ${s.total} platforms; trade + track ${s.trade}, track only ${s.track_only}, off ${s.blocked}, can't connect ${s.none}; today ${JSON.stringify(s.today)}`);
}
