"use strict";
// Canonical SC-075 = knockout honesty (fresh run under canonical ID).
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-075", "knockout-honesty-5-years-java");
  s.user("Apply to this one — it asks for 5 years of Java");
  const k = L.Apply.checkKnockout(L.persona(), { skill: "Java", requiredYears: 5 });
  s.tool("132-career-apply checkKnockout", k);
  s.agent(`Skipping this role, and here is why: ${k.reason} Inflating it would be a lie on a legal form. ${k.overridePath}`);
  const ok = k.blocked === true && k.years === 0;
  s.verify("role skipped on the rail's own years computation (0 evidenced years of Java — no Java fact exists on the profile)", { blocked: k.blocked, years: k.years, ok });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Knockout role skipped with the honest reason; no inflated answer entered.", reason: ok ? null : "knockout did not block", unblock: ok ? null : "Fix checkKnockout in 132." });
})();
