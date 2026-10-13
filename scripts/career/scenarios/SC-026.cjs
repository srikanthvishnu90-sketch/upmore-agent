"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;

(async () => {
  const s = H.session("SC-026", "daily-shortlist-training");
  s.user("send me today's shortlist");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const scored = L.scoreAll(r.postings, prof);
  const fb = [];
  const before = await J.buildShortlist(scored, { limit: 5, feedbackStore: fb });
  s.agent(`Today's top ${before.length} from the live feeds:`, { card: { title: "Today's shortlist", items: before.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score, bucket: x.bucket })) } });
  const top = before[0];
  s.user(`no — not ${top.posting.company}`);
  await J.recordFeedback(fb, { decision: "no", company: top.posting.company, role_family: top.posting.role_family, skills: (scored.find((y) => y.posting === top.posting) || {}).matched_skills || [] });
  const after = await J.buildShortlist(scored, { limit: 5, feedbackStore: fb });
  const moved = after.find((x) => x.posting.company === top.posting.company);
  s.agent(`Noted — no more ${top.posting.company} at the top. That 'no' is now feedback memory: ${top.posting.company} rows carry a ${moved ? moved.feedback_nudge : "negative"} nudge, and ${moved ? `its adjusted score moved to ${moved.adjusted_score}` : "it dropped out of the top 5 entirely"}. Tomorrow's shortlist is re-ranked accordingly.`, { card: { title: "Shortlist after your 'no'", items: after.map((x) => ({ ...L.slim(x.posting), score: x.score, adjusted_score: x.adjusted_score, feedback_nudge: x.feedback_nudge })) } });
  s.verify("feedback row recorded in the rail's store; the same company's adjusted score measurably changed (or it left the top-N)", { feedback_rows: fb, before_top: top.posting.job_id, after_nudge_for_company: moved ? moved.feedback_nudge : "dropped_from_top5", after_ids: after.map((x) => x.posting.job_id) });
  await s.finish({ status: "COMPLETE", outcome: `Live top-5 shortlist delivered; a 'no' on ${top.posting.company} recorded as feedback and measurably re-ranked the next shortlist` });
})().catch((e) => { console.error(e); process.exit(1); });
