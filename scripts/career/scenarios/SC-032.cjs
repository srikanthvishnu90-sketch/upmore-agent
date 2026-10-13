"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-032", "seniority-guard");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r), persona_level: prof.level });
  const seniors = r.postings.filter((p) => (p.seniority_band === "senior" || p.seniority_band === "staff"));
  const pick = seniors.map((p) => ({ p, fit: J.scoreFit(p, prof) })).find((x) => x.fit.excluded && x.fit.reasons.some((y) => /seniority/i.test(y)) && x.fit.matched_skills !== undefined) || seniors.map((p) => ({ p, fit: J.scoreFit(p, prof) })).find((x) => x.fit.excluded);
  const scored = L.scoreAll(r.postings, prof);
  const shortlist = await J.buildShortlist(scored, { limit: 10 });
  const inShortlist = shortlist.some((x) => x.posting.job_id === pick.p.job_id);
  s.user(`(I am a sophomore; this Senior SWE posting matches my skills: ${pick.p.title} at ${pick.p.company})`);
  s.agent(`Excluded, and never scored: ${pick.fit.reasons.join("; ")}. Seniority is a hard filter for a sophomore profile, so this role cannot enter your shortlist no matter how well the skills match — verified: it is ${inShortlist ? "PRESENT (bug)" : "absent"} from today's top-10. Across the live set, ${seniors.length} senior/staff postings were screened the same way.`, { card: { title: "Seniority guard", posting: L.slim(pick.p), fit: pick.fit, in_shortlist: inShortlist } });
  s.verify("scoreFit returns excluded=true with a seniority reason; buildShortlist output does not contain the posting", { excluded: pick.fit.excluded, reasons: pick.fit.reasons, in_shortlist: inShortlist, senior_staff_rows_screened: seniors.length });
  await s.finish({ status: !inShortlist && pick.fit.excluded ? "COMPLETE" : "LEARN", outcome: `Senior posting (${pick.p.title}, ${pick.p.company}) excluded on seniority for the sophomore persona and verified absent from the shortlist`, reason: inShortlist ? "excluded posting reached the shortlist" : undefined });
})().catch((e) => { console.error(e); process.exit(1); });
