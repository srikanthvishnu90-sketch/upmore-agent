// link-liveness-live-check.cjs — the live proof for MUSE-F-003's
// serve-time verifier: runs _shared/link_liveness.js over the exact
// 60 URLs the 2026-10-20 job-link audit sampled and prints the split
// against the audit's verdicts.
// Run: NODE_USE_ENV_PROXY=1 node scripts/career/link-liveness-live-check.cjs [audit.json]
// Default audit path: ~/workspace/your_files/job-link-audit-2026-10-20.json
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const { LinkLiveness } = require(path.join(root, "supabase/functions/_shared/link_liveness.js"));

const auditPath = process.argv[2] || path.join(os.homedir(), "workspace/your_files/job-link-audit-2026-10-20.json");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));

(async () => {
  const lv = LinkLiveness.createLinkLiveness({ timeoutMs: 8000, concurrency: 6 });
  const postings = audit.map((a) => ({ url: a.url }));
  const out = await lv.verifyServing(postings);
  const mine = {};
  for (const [url, v] of Object.entries(out.verdicts)) mine[url] = v.verdict;
  // Board responses vary fetch to fetch (SSR head vs JS shell under
  // load): any first-pass UNCHECKABLE gets ONE fresh re-check, and
  // the second verdict stands. Disclosed here and in the output.
  const recheck = audit.filter((a) => mine[a.url] === "UNCHECKABLE").map((a) => a.url);
  if (recheck.length) {
    const lv2 = LinkLiveness.createLinkLiveness({ timeoutMs: 8000, concurrency: 3 });
    for (const url of recheck) {
      const r = await lv2.check(url);
      mine[url] = r.verdict;
    }
  }
  console.log(`second-pass re-checks: ${recheck.length}`);

  const agree = { "RESOLVES-LIVE": 0, "CLOSED-OR-GONE": 0, "UNCHECKABLE": 0 };
  const disagreements = [];
  for (const a of audit) {
    const m = mine[a.url];
    const match =
      (a.verdict === "RESOLVES-LIVE" && m === "LIVE") ||
      (a.verdict === "CLOSED-OR-GONE" && m === "CONFIRMED-DEAD") ||
      (a.verdict === "UNCHECKABLE" && m === "UNCHECKABLE");
    if (match) agree[a.verdict] += 1;
    else disagreements.push({ url: a.url, audit: a.verdict, mine: m });
  }
  const keptLive = audit.filter((a) => a.verdict === "RESOLVES-LIVE" && mine[a.url] === "LIVE").length;
  const droppedDead = audit.filter((a) => a.verdict === "CLOSED-OR-GONE" && mine[a.url] === "CONFIRMED-DEAD").length;
  const keptUncheckable = audit.filter((a) => a.verdict === "UNCHECKABLE" && mine[a.url] !== "CONFIRMED-DEAD").length;
  const uncheckableNowLive = audit.filter((a) => a.verdict === "UNCHECKABLE" && mine[a.url] === "LIVE").length;

  console.log(`audit file: ${auditPath} (${audit.length} URLs)`);
  console.log(`SPLIT (task terms): confirmed-live KEPT ${keptLive}/31 · confirmed-dead DROPPED ${droppedDead}/3 · uncheckable KEPT ${keptUncheckable}/26 (of which now classified LIVE: ${uncheckableNowLive})`);
  console.log(`agreement: live ${agree["RESOLVES-LIVE"]}/31 · dead ${agree["CLOSED-OR-GONE"]}/3 · uncheckable ${agree["UNCHECKABLE"]}/26`);
  console.log(`verifier totals: dropped ${out.droppedCount} · stats ${JSON.stringify(lv.stats())}`);
  if (disagreements.length) {
    console.log("disagreements:");
    for (const d of disagreements) console.log(`  audit=${d.audit} mine=${d.mine} ${d.url}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
