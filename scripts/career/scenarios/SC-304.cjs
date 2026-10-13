"use strict";
// SC-304 Fact-mining interview — thin entry triggers the digging questions; answers stored as new facts.
const { H, Profile } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-304", "fact-mining-interview");
  s.user("(profile has a thin experience entry)");
  const p = Profile.createProfile({});
  const thin = Profile.addFact(p, { kind: "experience", title: "Built a dashboard (TEST)", text: "Built a dashboard", source: "user" });
  const qs = Profile.factMiningQuestions(thin);
  s.tool("CareerProfile.factMiningQuestions(thin entry)", qs);
  s.agent(`That experience entry is thin — a tailored resume can't do much with "built a dashboard" yet. Let me dig:\n${qs.map((q, i) => `${i + 1}. ${q}`).join("\n")}`);
  s.user("It was React and Python with PostgreSQL. About 200 internal users used it. It replaced a manual spreadsheet workflow and cut weekly reporting time by 40%.");
  const enriched = Profile.updateFact(p, thin.id, {
    text: "Built a dashboard in React and Python with PostgreSQL for 200 internal users. It replaced a manual spreadsheet workflow and cut weekly reporting time by 40%.",
    bullets: ["Built a reporting dashboard in React and Python used by 200 internal users, replacing a manual spreadsheet workflow", "Cut weekly reporting time by 40%"],
    skills: ["React", "Python", "PostgreSQL"],
  });
  s.tool("CareerProfile.updateFact(same ID, mined answers)", enriched);
  const after = Profile.factMiningQuestions(Profile.getFact(p, thin.id));
  s.tool("CareerProfile.factMiningQuestions(enriched entry)", after);
  s.agent("Saved — those answers are now part of that same fact, and it no longer reads as thin.");
  const joined = qs.join(" ").toLowerCase();
  const ok = qs.length >= 3 && /stack|tools/.test(joined) && /how many users/.test(joined) && /replace/.test(joined) && /metric/.test(joined)
    && enriched.id === thin.id && after.length < qs.length && /200 internal users/.test(enriched.text) && /40%/.test(enriched.text);
  s.verify("fact-mining state: the thin entry produced stack/users/replaced/metric questions; the user's answers were stored on the SAME fact ID; re-running the miner on the enriched entry asks materially fewer questions", { ok, questions_before: qs.length, questions_after: after.length, fact_id: enriched.id });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "The thin experience entry triggered the digging questions (stack, users, what it replaced, metric); the answers were stored on the same fact and the entry no longer counts as thin." }
    : { status: "LEARN", outcome: "Fact-mining did not dig or store as required.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix factMiningQuestions/updateFact in 122 and rerun SC-304." });
})().catch((e) => { console.error(e); process.exit(1); });
