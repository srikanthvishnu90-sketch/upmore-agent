"use strict";
/* measure-pool.cjs — THROUGHPUT LANE M1 (2026-10-21).
   Measures the discovery -> queue feed exactly as production runs it:
   the worker transport + production-sources from the RUNNING worker
   tree (~/workspace/upmore-v2-candidate — the tree the live board
   service and executor were started from), the shared career_pool
   loader, and module 121's own classifiers for yield math.
   Read-only: table reads only, no writes, no intents committed.
   Secrets: read from the worker host env file into this process's
   env only; never printed, never written. */
const fs = require("node:fs");
const path = require("node:path");

for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const WT = "/home/hatch/workspace/upmore-v2-candidate";
const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));
const { createProductionSources } = require(path.join(WT, "workers/career-browser/production-sources.cjs"));
const { CareerPool } = require(path.join(WT, "supabase/functions/_shared/career_pool.js"));
const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));

const GAUNTLET = "2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3";
const FAMILY_TEXT = "software engineering internships";
const t = () => process.hrtime.bigint();
const ms = (a, b) => Number(b - a) / 1e6;

function yields(postings, label) {
  const fams = Jobs.askRoleFamilies(FAMILY_TEXT);
  const wantIntern = Jobs.seniorityBand(FAMILY_TEXT, "") === "intern";
  const gh = postings.filter((p) => p.source === "greenhouse");
  const fam = postings.filter((p) => fams.includes(p.role_family));
  const famBand = postings.filter((p) => fams.includes(p.role_family) && (!wantIntern || p.seniority_band === "intern"));
  const ghFamBand = famBand.filter((p) => p.source === "greenhouse");
  // 1/company/30d cap shape: distinct companies inside the eligible set
  const companies = new Set(ghFamBand.map((p) => (p.company || "").toLowerCase()));
  console.log(JSON.stringify({
    label, rows: postings.length, greenhouse: gh.length,
    family: fam.length, familyBand: famBand.length,
    greenhouseFamilyBand: ghFamBand.length, distinctCompaniesGH: companies.size,
    fams, wantIntern,
  }));
  return { ghFamBand };
}

(async () => {
  const transport = supabaseTransportFromEnv(process.env);
  const sources = createProductionSources({ transport });

  // A1: the production postingsFor, cold, exactly as the executor calls it.
  let a = t();
  const pool = await sources.postingsFor(GAUNTLET, FAMILY_TEXT, 50);
  let b = t();
  console.log(JSON.stringify({ step: "A1 postingsFor (production path, limit=600 default)", ms: Math.round(ms(a, b)), rows: pool.length, postingsPerSec: Math.round(pool.length / (ms(a, b) / 1000)) }));
  yields(pool, "A1 window-600 yield");

  // A2: same call again (warm — connection reuse / PostgREST cache effects).
  a = t();
  const pool2 = await sources.postingsFor(GAUNTLET, FAMILY_TEXT, 50);
  b = t();
  console.log(JSON.stringify({ step: "A2 postingsFor (second call)", ms: Math.round(ms(a, b)), rows: pool2.length }));

  // A3: does a bigger loader limit actually return more rows? (PostgREST cap probe)
  for (const limit of [1200, 2500]) {
    const loader = CareerPool.createKbPoolLoader({ readRows: (spec) => transport.readRows(spec), jobs: Jobs, limit });
    a = t();
    const big = await loader.loadPool();
    b = t();
    console.log(JSON.stringify({ step: `A3 loadPool limit=${limit}`, ms: Math.round(ms(a, b)), rows: big.postings.length, error: big.error }));
    if (limit === 2500) yields(big.postings, "A3 window-2500 yield");
  }

  // A4: TARGETED prototype — per-board reads (the transport's eq
  // filter pages naturally board-by-board; boards ordered largest
  // first per the sb.py census in gh-boards.json), classify as we
  // go, stop at 50 greenhouse+family+intern or shelf exhaustion.
  const COLS = CareerPool.KB_POSTINGS_COLUMNS;
  const boards = JSON.parse(fs.readFileSync(path.join(__dirname, "gh-boards.json"), "utf8"));
  const fams = Jobs.askRoleFamilies(FAMILY_TEXT);
  let scanned = 0; let boardsRead = 0; let found = [];
  a = t();
  for (const board of boards) {
    if (found.length >= 50) break;
    const rows = await transport.readRows({
      table: "career_kb_postings", select: COLS,
      filters: { board: { eq: board } },
      order: { column: "posted_at", ascending: false, nullsFirst: false },
      limit: 1000,
    });
    boardsRead += 1; scanned += rows.length;
    const mapped = rows.map((r) => CareerPool.mapKbPosting(r, Jobs)).filter(Boolean);
    found = found.concat(mapped.filter((p) => fams.includes(p.role_family) && p.seniority_band === "intern"));
  }
  b = t();
  console.log(JSON.stringify({ step: "A4 targeted per-board greenhouse reads to 50 eligible", ms: Math.round(ms(a, b)), boardsRead, rowsScanned: scanned, eligibleFound: found.length, distinctCompanies: new Set(found.map((p) => (p.company || "").toLowerCase())).size }));
})().catch((e) => { console.error("MEASURE_FAILED", e && e.code, e && e.message); process.exit(1); });
