"use strict";
// SC-008 Career onboarding interview — 130 interview: one at a time, stored, never re-asked.
const { H, O, Profile } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-008", "career-onboarding-interview");
  s.user("help me find a job");
  const p = Profile.createProfile({});
  const ctx = { profile: p, interviewAnswer: true };
  let r = O.handleChat("help me find a job", ctx);
  s.tool("CareerOnboarding.handleChat(start)", r);
  s.agent(r.reply);
  const answers = [
    "Land a software engineering or finance internship for next summer",
    "Software Engineer, Investment Banking Analyst",
    "Chicago, New York, Remote",
    "US citizen, no sponsorship needed",
    "$30 an hour",
    "No defense contractors",
    "Start June 2027, graduating May 2028",
  ];
  const askedOrder = [r.pending];
  for (const a of answers) {
    s.user(a);
    r = O.handleChat(a, ctx);
    s.tool(`CareerOnboarding.answerCurrent(${r.answered || "?"})`, r);
    s.agent(r.reply);
    if (!r.done) askedOrder.push(r.pending);
  }
  const again = O.startInterview(p);
  s.tool("CareerOnboarding.startInterview(second run on same profile)", again);
  const ok = r.done === true && askedOrder.join(",") === "goals,roles,locations,visa,comp_floor,deal_breakers,timeline"
    && p.preferences.goals.includes("software engineering") && p.preferences.roles.length === 2
    && p.preferences.locations.length === 3 && p.preferences.remote === true
    && p.constraints.workAuthorization === "US citizen, no sponsorship needed" && p.constraints.needsSponsorship === false
    && p.preferences.compFloor === "$30 an hour" && p.preferences.dealBreakers.join() === "No defense contractors"
    && p.preferences.timeline.includes("June 2027") && again.done === true && O.nextQuestion(p) === null;
  s.verify("profile state after the interview: every answer stored in preferences/constraints; question order was one-at-a-time in the fixed sequence; a second interview asks nothing (nextQuestion = null)", { ok, asked_order: askedOrder, preferences: p.preferences, constraints: p.constraints });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Onboarding asked goals, roles, location, visa, comp floor, deal-breakers and timeline one at a time, stored every answer in the profile, and a repeat interview re-asks nothing." }
    : { status: "LEARN", outcome: "Onboarding interview did not complete/store/re-ask-check as required.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix 130 interview state machine and rerun SC-008." });
})().catch((e) => { console.error(e); process.exit(1); });
