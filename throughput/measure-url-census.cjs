"use strict";
/* measure-url-census.cjs — M1c: of the shelf's SWE-intern-greenhouse
   supply, how many postings carry a driver-reachable URL? The §6.3
   host gate (module 150 hostAllowed) refuses employer-site wrapper
   URLs (e.g. databricks.com/...?gh_jid=) at session creation, so a
   posting whose stored url is not on an ATS host is undriveable as
   stored. Read-only. */
const fs = require("node:fs");
const path = require("node:path");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const WT = "/home/hatch/workspace/upmore-v2-candidate";
const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));
const { CareerPool } = require(path.join(WT, "supabase/functions/_shared/career_pool.js"));
const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));
const PortalBrowser = require(path.join(WT, "packages/domain/150-career-portal-browser.js"));

(async () => {
  const transport = supabaseTransportFromEnv(process.env);
  const boards = JSON.parse(fs.readFileSync(path.join(__dirname, "gh-boards.json"), "utf8"));
  let eligible = 0; let driveable = 0; const hosts = {};
  const examples = [];
  for (const board of boards) {
    const rows = await transport.readRows({
      table: "career_kb_postings", select: CareerPool.KB_POSTINGS_COLUMNS,
      filters: { board: { eq: board } },
      order: { column: "posted_at", ascending: false, nullsFirst: false }, limit: 1000,
    });
    for (const r of rows) {
      const p = CareerPool.mapKbPosting(r, Jobs);
      if (!p || p.role_family !== "SWE" || p.seniority_band !== "intern" || p.source !== "greenhouse") continue;
      eligible += 1;
      let host = "?"; try { host = new URL(p.url).hostname; } catch (_) { /* counted below */ }
      hosts[host] = (hosts[host] || 0) + 1;
      const gate = typeof PortalBrowser.hostAllowed === "function" ? PortalBrowser.hostAllowed(p.url) : null;
      if (gate && gate.allowed) driveable += 1;
      else if (examples.length < 5) examples.push({ host, url: p.url.slice(0, 110) });
    }
  }
  console.log(JSON.stringify({ eligibleSweInternGreenhouse: eligible, driveableByHostGate: driveable, hosts, refusedExamples: examples }));
})().catch((e) => { console.error("MEASURE_FAILED", e && e.code, e && e.message); process.exit(1); });
