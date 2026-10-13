"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-039", "two-role-family-morning");
  s.user("send me both SWE and finance picks today");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const scored = L.scoreAll(r.postings, prof);
  const fb = [];
  const swe = await J.buildShortlist(scored.filter((x) => x.posting.role_family === "SWE"), { limit: 3, feedbackStore: fb });
  const fin = await J.buildShortlist(scored.filter((x) => x.posting.role_family === "Finance"), { limit: 3, feedbackStore: fb });
  s.agent(`One shortlist, two labeled sections, both from this morning's live rows:`, { card: { title: "Today: SWE + Finance", SWE: swe.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score })), Finance: fin.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score })) } });
  s.user("no to the finance ones today");
  await J.recordFeedback(fb, { decision: "no", role_family: "Finance" });
  const swe2 = await J.buildShortlist(scored.filter((x) => x.posting.role_family === "SWE"), { limit: 3, feedbackStore: fb });
  const fin2 = await J.buildShortlist(scored.filter((x) => x.posting.role_family === "Finance"), { limit: 3, feedbackStore: fb });
  const finNudge = fin2.length ? fin2[0].feedback_nudge : null; const sweNudge = swe2.length ? swe2[0].feedback_nudge : null;
  s.agent(`Applied per family: Finance rows now carry a ${finNudge} nudge; SWE rows are untouched (${sweNudge}). Training is family-scoped, exactly as recorded in the feedback store.`, { card: { title: "After per-family training", SWE_nudge: sweNudge, Finance_nudge: finNudge } });
  s.verify("feedback row is family-scoped: Finance adjusted scores move, SWE nudges stay 0", { feedback: fb, swe_nudge: sweNudge, finance_nudge: finNudge });
  await s.finish({ status: finNudge < 0 && sweNudge === 0 ? "COMPLETE" : "LEARN", outcome: `One live shortlist with labeled SWE (${swe.length}) and Finance (${fin.length}) sections; a Finance 'no' nudged Finance only (${finNudge}) and left SWE at ${sweNudge}`, reason: finNudge >= 0 ? "family feedback did not apply" : undefined });
})().catch((e) => { console.error(e); process.exit(1); });
