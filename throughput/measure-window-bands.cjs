"use strict";
/* measure-window-bands.cjs — M1b: band distribution inside the
   production 600 window + where intern-banded SWE Greenhouse rows
   sit in global recency order. Read-only. */
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

(async () => {
  const transport = supabaseTransportFromEnv(process.env);
  const loader = CareerPool.createKbPoolLoader({ readRows: (s) => transport.readRows(s), jobs: Jobs, limit: 600 });
  const { postings } = await loader.loadPool();
  const bands = {};
  for (const p of postings) bands[p.seniority_band] = (bands[p.seniority_band] || 0) + 1;
  const swe = postings.filter((p) => p.role_family === "SWE");
  const sweIntern = swe.filter((p) => p.seniority_band === "intern");
  const sweInternGh = sweIntern.filter((p) => p.source === "greenhouse");
  console.log(JSON.stringify({ window: postings.length, bands, swe: swe.length, sweIntern: sweIntern.length, sweInternGreenhouse: sweInternGh.length }));

  // Global recency scan in 1000-row slices is impossible through this
  // transport (no offset; limit caps at 1000). Instead: per-board
  // newest-first reads (65 greenhouse boards), merge, sort by
  // posted_at desc, and find the recency RANK of the 1st/10th/50th
  // SWE-intern-greenhouse posting in the full shelf ordering.
  const boards = JSON.parse(fs.readFileSync(path.join(__dirname, "gh-boards.json"), "utf8"));
  const all = [];
  for (const board of boards) {
    const rows = await transport.readRows({
      table: "career_kb_postings", select: CareerPool.KB_POSTINGS_COLUMNS,
      filters: { board: { eq: board } },
      order: { column: "posted_at", ascending: false, nullsFirst: false }, limit: 1000,
    });
    for (const r of rows) { const p = CareerPool.mapKbPosting(r, Jobs); if (p) all.push(p); }
  }
  all.sort((x, y) => String(y.posted_at || "").localeCompare(String(x.posted_at || "")));
  const hits = [];
  all.forEach((p, i) => { if (p.role_family === "SWE" && p.seniority_band === "intern" && p.source === "greenhouse") hits.push(i + 1); });
  console.log(JSON.stringify({
    shelfScanned: all.length, sweInternGreenhouseTotal: hits.length,
    rankOf1st: hits[0] || null, rankOf10th: hits[9] || null, rankOf50th: hits[49] || null,
    inFirst600: hits.filter((r) => r <= 600).length, inFirst1000: hits.filter((r) => r <= 1000).length,
  }));
})().catch((e) => { console.error("MEASURE_FAILED", e && e.code, e && e.message); process.exit(1); });
