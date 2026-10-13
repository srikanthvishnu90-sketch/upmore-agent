"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-118", "salary-band-filter");
  s.user("Salary-band filter: skip roles whose posted band sits under my floor ($70,000)");
  const FLOOR = 70000;
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  const { above, below, noBand } = A3.salaryFilter(r.postings, FLOOR);
  s.tool("132.salaryFilter over live postings (floor $70,000 annualized)", { above: above.length, below: below.length, no_band: noBand.length, below_examples: below.slice(0, 3).map((x) => ({ title: x.posting.title, company: x.posting.company, band: x.band })) });
  const scored = L.scoreAll(above.map((x) => x.posting), prof);
  const shortlist = await J.buildShortlist(scored, { limit: 5 });
  s.agent(`Floor applied at $70,000 (annualized; hourly bands converted at 2,080h and labeled). Of ${r.postings.length} live postings: ${above.length} post a band at or above your floor, ${below.length} post a band entirely under it — those are skipped, e.g. ${below.slice(0, 2).map((x) => `${x.posting.title} at ${x.posting.company} (${x.band.raw})`).join(" | ") || "none in this poll"} — and ${noBand.length} post NO band at all. Those are labeled 'no band posted', never assumed to clear the floor; they stay visible but flagged. Your above-floor shortlist:`, { card: { title: "Above-floor shortlist", counts: { above: above.length, below: below.length, no_band: noBand.length }, items: shortlist.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score, band: A3.parseSalaryBand(x.posting.jd_text) })) } });
  s.verify("bands parsed by 132.parseSalaryBand from each posting's own JD text; below-floor rows are excluded from the scored set entirely", { above: above.length, below: below.length, no_band: noBand.length });
  await s.finish({ status: "COMPLETE", outcome: `Salary floor $70k applied to live bands: ${above.length} at/above, ${below.length} skipped as under-floor, ${noBand.length} honestly labeled no-band` });
})().catch((e) => { console.error(e); process.exit(1); });
