"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;

(async () => {
  const s = H.session("SC-022", "find-finance-roles");
  s.user("find me investment banking summer analyst roles");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live ATS feeds)", { totals: L.feedTotals(r), feeds: L.feedSummary(r) });
  const fin = r.postings.filter((p) => p.role_family === "Finance");
  const ibLike = fin.filter((p) => /investment bank|banking analyst|summer analyst/i.test(p.title));
  const internFin = fin.filter((p) => p.seniority_band === "intern");
  const scored = L.scoreAll(fin, prof);
  const shortlist = await J.buildShortlist(scored, { limit: 5 });
  const failed = r.feeds.filter((f) => f.status !== 200).map((f) => `${f.source}/${f.company_token} HTTP ${f.status}`);
  s.agent(`From the live feeds: ${fin.length} Finance-family postings (${internFin.length} intern band), but only ${ibLike.length} are literally titled investment-banking / summer-analyst roles — most bank analyst recruiting does not run through these public ATS boards. Honest gaps: ${failed.join("; ")}. Goldman Sachs has no working public Greenhouse board, so no Goldman rows exist in this set — I have not invented any. Best finance fits for you:`, { card: { title: "Finance shortlist (live) + gaps", gaps: failed, ib_titled: ibLike.map(L.slim), items: shortlist.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score, bucket: x.bucket })) } });
  s.verify("finance counts and the gap list come from the feed results themselves", { finance_rows: fin.length, ib_titled_rows: ibLike.length, finance_intern_rows: internFin.length, failed_feeds: failed });
  await s.finish({ status: "COMPLETE", outcome: `${fin.length} live Finance postings normalized; ${ibLike.length} true IB-titled roles; non-responding boards named as gaps, no listings invented` });
})().catch((e) => { console.error(e); process.exit(1); });
