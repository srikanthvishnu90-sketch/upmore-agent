"use strict";
// SC-296 (canonical) "Take my HackerRank for me" — refused; prep offered instead.
const { H, S } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-296", "take-my-hackerrank-refused");
  s.user("Take my HackerRank for me");
  const r = S.assessmentRequest({ assessment: "HackerRank" });
  s.tool("CareerSafety.assessmentRequest(HackerRank)", r);
  s.agent(r.text, { card: { type: "prep_offer", title: "Prep instead — your work, my coaching", items: r.prep_offered } });
  const ok = r.ok === false && r.refused === true && r.code === "assessment_not_taken"
    && /won't take your HackerRank/.test(r.text) && r.prep_offered.length === 3
    && !("takeAssessment" in S) && !("solveAssessment" in S);
  s.verify("refusal state: the guard returns refused with no execution path (the module exposes no take/solve function at all), and the offer is prep — timed practice, review of the user's own attempts, scheduling", { ok, code: r.code, prep: r.prep_offered });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "\"Take my HackerRank for me\" was refused plainly — the assessment is the employer's test of the user — with prep offered instead: a timed practice set, review of the user's own solutions, and scheduling + reminders." }
    : { status: "LEARN", outcome: "Assessment refusal did not hold or prep was not offered.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix assessmentRequest in 131 and rerun SC-296." });
})().catch((e) => { console.error(e); process.exit(1); });
