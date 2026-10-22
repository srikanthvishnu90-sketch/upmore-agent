"use strict";
/* BENCH-60 harness — candidate picker (harness code, NOT product code).
   Pulls the shelf's Greenhouse postings (career_kb_postings via the
   worker host's read-only transport — the same read the production
   pool loader uses), keeps greenhouse.io URLs only, maps them through
   CareerPool.mapKbPosting exactly as the drive path does, and emits a
   company-round-robin candidate list: one posting per company first
   (intern/analyst titles preferred), then a second per company, etc.
   Prepares never trip the module-149 caps (capCheck counts ledger
   records with status "submitted" only; this bench submits nothing),
   so several distinct postings per company are code-legal bench legs.
   Usage: node pick-candidates.cjs <out.json> */
const fs = require("node:fs");
const path = require("node:path");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const WT = "/home/hatch/workspace/upmore-v2-candidate";
const OUT = process.argv[2];
if (!OUT) { console.error("usage: pick-candidates.cjs <out.json>"); process.exit(2); }
(async () => {
  const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));
  const transport = supabaseTransportFromEnv(process.env);
  const { CareerPool } = require(path.join(WT, "supabase/functions/_shared/career_pool.js"));
  const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));
  const seen = new Map();
  for (const filter of [{ source: { eq: "greenhouse" } }, { board: { eq: "greenhouse" } }]) {
    const rows = await transport.readRows({ table: CareerPool.KB_POSTINGS_TABLE, select: CareerPool.KB_POSTINGS_COLUMNS, filters: filter, order: { column: "url", ascending: true }, limit: 1000 });
    for (const r of rows || []) if (!seen.has(r.posting_key)) seen.set(r.posting_key, r);
  }
  const rows = [...seen.values()];
  const byCo = new Map();
  let ghUrl = 0, mapped = 0;
  for (const r of rows) {
    if (!r.url || !/greenhouse\.io/.test(r.url)) continue;
    ghUrl++;
    const p = CareerPool.mapKbPosting(r, Jobs); if (!p) continue;
    mapped++;
    const co = (p.company || "").trim(); if (!co) continue;
    const k = co.toLowerCase();
    if (!byCo.has(k)) byCo.set(k, []);
    byCo.get(k).push({ key: r.posting_key, company: co, title: p.title || p.role, url: p.url });
  }
  const score = (t) => (/intern/i.test(t || "") ? 0 : /analyst|associate|engineer/i.test(t || "") ? 1 : 2);
  for (const v of byCo.values()) v.sort((a, b) => score(a.title) - score(b.title) || a.url.localeCompare(b.url));
  const companies = [...byCo.values()].sort((a, b) => score(a[0].title) - score(b[0].title) || a[0].company.localeCompare(b[0].company));
  const out = [];
  for (let round = 0; round < 30; round++) for (const v of companies) if (v[round]) out.push(v[round]);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  const dist = {}; for (const v of companies) dist[v[0].company] = v.length;
  console.log(JSON.stringify({ rowsTotal: rows.length, greenhouseIoRows: ghUrl, mapped, distinctCompanies: byCo.size, candidates: out.length, distribution: dist }));
})().catch((e) => { console.error("ERR", e && e.message); process.exit(1); });
