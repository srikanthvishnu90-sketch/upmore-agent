"use strict";
/* BENCH-60 harness — bench selection (harness code, NOT product code).
   Mirrors module 155's prepare pipeline gates that run BEFORE a drive,
   using the production code itself: 121's askRoleFamilies / roleFamily
   / seniorityBand for the family filter, and 121's evaluateKnockouts
   against the TEST user's real profile (via production sources) for
   the screen. A candidate is bench-eligible for a family text when
   both gates keep it. (The remaining screen steps — closed status,
   current employer, triage — are checked too where the production
   functions exist; triage runs only when the executor supplies a
   scoring profile, which the leg composition does not.)
   Usage: node select-bench.cjs <candidates.json> <out.json> */
const fs = require("node:fs");
const path = require("node:path");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const WT = "/home/hatch/workspace/upmore-v2-candidate";
const TEST_USER = "b2625909-d67f-41b2-8270-983d212c6052";
const CANDS = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const OUT = process.argv[3];
const TEXTS = ["software engineering and data roles", "software engineering roles"];
(async () => {
  const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));
  const transport = supabaseTransportFromEnv(process.env);
  const { createProductionSources } = require(path.join(WT, "workers/career-browser/production-sources.cjs"));
  const sources = createProductionSources({ transport });
  const { CareerPool } = require(path.join(WT, "supabase/functions/_shared/career_pool.js"));
  const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));
  const profile = await sources.profileFor(TEST_USER, {});
  const master = profile && (profile.master || profile);
  const rows = [];
  for (const c of CANDS) {
    const raw = await transport.readRows({ table: CareerPool.KB_POSTINGS_TABLE, select: CareerPool.KB_POSTINGS_COLUMNS, filters: { posting_key: { eq: c.key } }, limit: 1 });
    const p = raw && raw[0] ? CareerPool.mapKbPosting(raw[0], Jobs) : null;
    if (!p) { rows.push({ key: c.key, company: c.company, title: c.title, error: "MAP_FAILED" }); continue; }
    const fam = p.role_family || Jobs.roleFamily(p.title || p.role || "", p.jd_text || p.jdText || "");
    const band = p.seniority_band || Jobs.seniorityBand(p.title || p.role || "", p.jd_text || p.jdText || "");
    let ko = null;
    try { ko = Jobs.evaluateKnockouts ? Jobs.evaluateKnockouts(p, master) : null; } catch (_) { ko = null; }
    const unmet = (ko && ko.unmet) || [];
    const rec = { key: c.key, company: c.company, title: c.title, url: c.url, fam, band, status: p.status || null, knockoutUnmet: unmet.map((u) => u.reason || String(u.knockout && u.knockout.requirement)) };
    for (const t of TEXTS) {
      const fams = Jobs.askRoleFamilies(t);
      const wantIntern = Jobs.seniorityBand(t, "") === "intern";
      rec[`keep:${t}`] = fams.includes(fam) && (!wantIntern || band === "intern") && (rec.status == null || rec.status === "open") && rec.knockoutUnmet.length === 0;
    }
    rows.push(rec);
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  for (const t of TEXTS) console.log(t, "-> kept", rows.filter((r) => r[`keep:${t}`]).length, "of", rows.length);
  const { Counter } = { Counter: null };
  const dist = {};
  for (const r of rows) dist[`${r.fam}/${r.band}`] = (dist[`${r.fam}/${r.band}`] || 0) + 1;
  console.log("family/band distribution:", JSON.stringify(dist));
  console.log("knockout-blocked:", rows.filter((r) => r.knockoutUnmet && r.knockoutUnmet.length).length, "| not-open:", rows.filter((r) => r.status !== "open").length);
})().catch((e) => { console.error("ERR", e && e.message); process.exit(1); });
