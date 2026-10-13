"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;

(async () => {
  const s = H.session("SC-021", "find-swe-intern-roles");
  s.user("find me software engineering internships for next summer");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live ATS feeds)", { totals: L.feedTotals(r), feeds: L.feedSummary(r) });
  const sweIntern = r.postings.filter((p) => p.role_family === "SWE" && p.seniority_band === "intern");
  const scored = L.scoreAll(sweIntern, prof);
  const shortlist = await J.buildShortlist(scored, { limit: 5 });
  s.agent(`I pulled the live boards just now: ${L.feedTotals(r).deduped} deduped postings from ${L.feedTotals(r).feeds_200}/${L.feedTotals(r).feeds_tried} responding feeds. ${sweIntern.length} are SWE internships. After hard filters and fit scoring, here are your top ${shortlist.length}:`, { card: { title: "SWE intern shortlist (live)", items: shortlist.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score, bucket: x.bucket, reasons: x.reasons.slice(0, 3) })) } });
  s.verify("counts come from the deduped posting rows themselves; every shortlist row is SWE + intern band and not hard-filter excluded", { deduped: r.postings.length, swe_intern_rows: sweIntern.length, excluded_among_swe_intern: scored.filter((x) => x.excluded).length, shortlist_rows: shortlist.map((x) => x.posting.job_id) });
  await s.finish({ status: "COMPLETE", outcome: `${sweIntern.length} live SWE intern postings found across the responding feeds; top-${shortlist.length} scored shortlist delivered with sources named from the feed rows` });
})().catch((e) => { console.error(e); process.exit(1); });
