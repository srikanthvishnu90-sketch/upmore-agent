"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-031", "location-reality-check-chicago");
  s.user("find me SWE roles in Chicago");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const swe = r.postings.filter((p) => p.role_family === "SWE");
  const chi = swe.filter((p) => /chicago/i.test(p.location));
  const chiIntern = chi.filter((p) => p.seniority_band === "intern");
  const nyc = swe.filter((p) => /new york|nyc/i.test(p.location));
  const remote = swe.filter((p) => p.remote === "remote");
  s.agent(`Honest feed reality, counted from the rows: of ${swe.length} live SWE postings, ${chi.length} are located in Chicago — and only ${chiIntern.length} of those are internships. For comparison, ${nyc.length} SWE postings are in New York and ${remote.length} are remote. Chicago SWE intern supply on these public boards is genuinely thin right now; I am not padding the list with non-Chicago roles.`, { card: { title: "SWE in Chicago — real counts", chicago_swe: chi.map(L.slim), counts: { swe_total: swe.length, chicago: chi.length, chicago_intern: chiIntern.length, nyc: nyc.length, remote: remote.length } } });
  s.verify("all counts computed from the deduped live rows by location/family/band", { swe_total: swe.length, chicago: chi.length, chicago_intern: chiIntern.length, nyc: nyc.length, remote: remote.length });
  await s.finish({ status: "COMPLETE", outcome: `Chicago SWE reality from live rows: ${chi.length} Chicago SWE postings (${chiIntern.length} intern) vs ${nyc.length} NYC and ${remote.length} remote` });
})().catch((e) => { console.error(e); process.exit(1); });
