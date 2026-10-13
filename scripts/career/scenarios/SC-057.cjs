"use strict";
<<<<<<< HEAD
const { H, M, NOW, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-057", "ops-managers-logistics-started-as-analysts");
  const q = M.parseTarget("Find 140 ops managers at logistics companies who started as analysts", PROFILE);
  const records = poolOverFirms(q.firms, 15, { per: (i) => ({ title: "Operations Manager", seniority_band: "manager", first_title: "Analyst" }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  s.user("Find 140 ops managers at logistics companies who started as analysts");
  s.tool("124.parseTarget+buildList", { firm_set: q.firm_set, started_as_analyst: q.background_filters.started_as_analyst, band: q.seniority_band, yield: pool.yield });
  s.agent(`Found ${pool.selected.length} ops managers at logistics companies who started as analysts (15 per firm — exactly at the per-firm cap, none over). Sample: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.current_firm}`).join("; ")}.`);
  s.verify("selection read back: exactly 140, every firm in the logistics set, every person started as an analyst, no firm over the 15 cap", { selected: pool.selected.length, firms_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), trait_ok: pool.selected.every((c) => c.first_title === "Analyst"), max_per_firm: Math.max(...q.firms.map((f) => pool.selected.filter((c) => c.current_firm === f).length)) });
  await s.finish({ status: "COMPLETE", outcome: `140 logistics ops managers who started as analysts selected and verified (new logistics firm set; per-firm cap respected at exactly 15/firm)` });
=======
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-057", "current-employer-guard");
  s.user("apply to this role at TEST Systems Inc");
  const g = L.Apply.checkCurrentEmployer(L.persona(), "TEST Systems Inc");
  s.tool("132-career-apply checkCurrentEmployer", g);
  s.agent(`Refused. ${g.reason}. ${g.exceptionPath}`);
  s.verify("guard blocked=true, matched to the profile's own experience fact (F-002, Software Engineering Intern at TEST Systems Inc), and an exception path was stated", { blocked: g.blocked, factId: g.employer && g.employer.factId, exceptionStated: /intentional/.test(g.exceptionPath || "") });
  await s.finish({ status: g.blocked ? "COMPLETE" : "LEARN", outcome: "Application to the persona's own employer (TEST Systems Inc, fact F-002) refused; rule + exception path stated.", reason: g.blocked ? null : "guard did not fire", unblock: g.blocked ? null : "Fix checkCurrentEmployer in 132." });
>>>>>>> origin/career/sc-f03
})();
