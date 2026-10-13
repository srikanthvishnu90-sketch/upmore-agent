"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-057", "current-employer-guard");
  s.user("apply to this role at TEST Systems Inc");
  const g = L.Apply.checkCurrentEmployer(L.persona(), "TEST Systems Inc");
  s.tool("132-career-apply checkCurrentEmployer", g);
  s.agent(`Refused. ${g.reason}. ${g.exceptionPath}`);
  s.verify("guard blocked=true, matched to the profile's own experience fact (F-002, Software Engineering Intern at TEST Systems Inc), and an exception path was stated", { blocked: g.blocked, factId: g.employer && g.employer.factId, exceptionStated: /intentional/.test(g.exceptionPath || "") });
  await s.finish({ status: g.blocked ? "COMPLETE" : "LEARN", outcome: "Application to the persona's own employer (TEST Systems Inc, fact F-002) refused; rule + exception path stated.", reason: g.blocked ? null : "guard did not fire", unblock: g.blocked ? null : "Fix checkCurrentEmployer in 132." });
})();
