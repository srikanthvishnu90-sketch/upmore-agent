"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-036", "new-grad-vs-intern-split");
  s.user("only show me new-grad roles, not internships");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const bands = {}; for (const p of r.postings) bands[p.seniority_band] = (bands[p.seniority_band] || 0) + 1;
  const ng = r.postings.filter((p) => p.seniority_band === "new_grad");
  const scored = L.scoreAll(ng, prof);
  const shortlist = await J.buildShortlist(scored, { limit: 5 });
  s.agent(`Split from the normalized data: ${bands.intern || 0} intern postings excluded, leaving ${ng.length} new-grad postings. Your new-grad-only top ${shortlist.length}:`, { card: { title: "New-grad only", band_counts: bands, items: shortlist.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score })) } });
  s.verify("every shortlist row has seniority_band new_grad; the intern count excluded is stated from the same rows", { band_counts: bands, shortlist_bands: shortlist.map((x) => x.posting.seniority_band) });
  await s.finish({ status: "COMPLETE", outcome: `Intern/new-grad split stated from live rows (${bands.intern || 0} intern excluded, ${ng.length} new-grad kept); shortlist is 100% new-grad band` });
})().catch((e) => { console.error(e); process.exit(1); });
