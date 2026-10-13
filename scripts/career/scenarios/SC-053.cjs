"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-053", "knockout-honesty-5-years-java");
  s.user("apply for me — the form requires 5 years of Java");
  const p = L.persona();
  const k = L.Apply.checkKnockout(p, { skill: "Java", requiredYears: 5 });
  s.tool("132-career-apply checkKnockout", k);
  s.agent(`I stopped this application. ${k.reason} Your profile has no Java fact at all — the evidenced languages are Python, JavaScript, React, Go and SQL from your internship and projects. ${k.overridePath}`);
  s.verify("knockout blocked=true with years computed from the rail (0 for a skill with no profile fact); no override taken because the user never said apply anyway", { blocked: k.blocked, years: k.years, requiredYears: k.requiredYears });
  await s.finish({ status: k.blocked === true && k.years === 0 ? "COMPLETE" : "LEARN", outcome: "Application stopped on the 5-years-of-Java knockout with the honest reason; override path stated, not taken.", reason: k.blocked ? null : "knockout did not block", unblock: k.blocked ? null : "Fix checkKnockout/yearsForSkill in 132." });
})();
