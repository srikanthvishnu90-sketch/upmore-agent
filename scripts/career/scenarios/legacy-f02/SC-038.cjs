"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-038", "company-size-preference");
  s.user("only startups under 500 people");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const split = D.sizeFilter(r.postings, {});
  const scored = L.scoreAll(split.under500.map((x) => x.posting), prof);
  const shortlist = await J.buildShortlist(scored, { limit: 5 });
  s.agent(`Applied where the data supports it — and labeled where it does not. Feeds and CIRs carry NO headcount, so I used a small curated band table (public reports, labeled estimates): of ${r.postings.length} live postings, ${split.under500.length} are at companies banded under 500 (in this feed set: the Linear and Ashby boards), ${split.notUnder.length} are at companies banded 500+, and ${split.unknown.length} are UNKNOWN size — those are labeled unknown and left out of an 'under 500 only' list rather than guessed into it. Your under-500 picks:`, { card: { title: "Under-500 only (banded)", counts: { under_500: split.under500.length, not_under: split.notUnder.length, unknown: split.unknown.length }, unknown_companies: [...new Set(split.unknown.map((x) => x.posting.company))], items: shortlist.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score, size: D.companySize(x.posting.company) })) } });
  s.verify("size split computed by 131.companySize over the live rows; unknown is a first-class bucket, never silently included", { under500: split.under500.length, notUnder: split.notUnder.length, unknown: split.unknown.length, shortlist_sizes: shortlist.map((x) => D.companySize(x.posting.company).band) });
  await s.finish({ status: "COMPLETE", outcome: `Under-500 preference applied from labeled size bands: ${split.under500.length} postings qualify, ${split.unknown.length} honestly labeled unknown and excluded from the under-500 list` });
})().catch((e) => { console.error(e); process.exit(1); });
