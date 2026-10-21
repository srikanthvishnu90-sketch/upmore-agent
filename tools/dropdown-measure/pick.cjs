"use strict";
/* pick.cjs — DROPDOWN-MEASURE lane (2026-10-21). Lists driveable
   Greenhouse postings from the live shelf (career_kb_postings via the
   production transport). The shelf's `board` column is the company
   TOKEN, not the ATS family — the family comes from the URL host, so
   this keeps only *.greenhouse.io URLs (the §6.3 host gate's
   driveable shape) and dedupes by token, most recent first.
   Read-only. Usage: node pick.cjs [tokensCsv] [limitPerToken] */
const fs = require("node:fs");
const path = require("node:path");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const WT = "/home/hatch/workspace/upmore-v2-candidate";
const { CareerPool } = require(path.join(WT, "supabase/functions/_shared/career_pool.js"));
const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));
const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));

(async () => {
  const want = (process.argv[2] || "").split(",").map((s) => s.trim()).filter(Boolean);
  const per = Number(process.argv[3] || 3);
  const transport = supabaseTransportFromEnv(process.env);
  const rows = await transport.readRows({
    table: "career_kb_postings", select: CareerPool.KB_POSTINGS_COLUMNS,
    order: { column: "posted_at", ascending: false, nullsFirst: false }, limit: 1000,
  });
  const postings = rows.map((r) => CareerPool.mapKbPosting(r, Jobs)).filter(Boolean);
  const byToken = new Map();
  for (const p of postings) {
    let host = "", token = "";
    try { const u = new URL(p.url); host = u.host; token = u.pathname.split("/").filter(Boolean)[0] || ""; } catch (_) { continue; }
    if (!/^(job-boards|boards)\.greenhouse\.io$/.test(host)) continue;
    if (want.length && !want.includes(token)) continue;
    if (!byToken.has(token)) byToken.set(token, []);
    const arr = byToken.get(token);
    if (arr.length < per) arr.push({ token, host, company: p.company, title: p.title, url: p.url });
  }
  for (const arr of byToken.values()) for (const r of arr) console.log(JSON.stringify(r));
  console.error(`greenhouse-host tokens in window: ${byToken.size}, shelf rows scanned: ${postings.length}`);
})().catch((e) => { console.error("PICK_FAILED", e && e.code, e && e.message); process.exit(1); });
