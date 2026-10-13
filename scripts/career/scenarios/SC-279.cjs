"use strict"; const {H,OS,fixture}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-279","quarterly-checkin");
  s.user("Quarterly check-in: my career goals versus reality, plan adjusted");
  const fx=fixture("test-career-os-w14.json"); const store=OS.createStore({goals:fx.goals}); OS.logWin(store,{text:"TEST win one",date:"2026-09-05"},{now:"2026-10-13T12:00:00Z"}); OS.logWin(store,{text:"TEST win two",date:"2026-10-01"},{now:"2026-10-13T12:00:00Z"}); OS.createWatch(store,{companies:["TESTCO Beta"]},{now:"2026-10-13T12:00:00Z"});
  const chk=OS.goalsCheckin(store,{now:"2026-10-13T12:00:00Z"}); s.tool("129.goalsCheckin",chk);
  s.agent(`Quarterly check-in \u2014 goals vs the log's reality (wins: ${chk.reality.wins_logged}, offers: ${chk.reality.offers_logged}, active watches: ${chk.reality.active_watches}):\n${chk.stated_goals.map(g=>`\u2022 ${g.goal} \u2014 measured ${g.measured} of ${g.target}: ${g.status}`).join("\n")}\n${chk.adjustment_prompt} Proposed adjustment (only saved if you confirm): add one application sprint this month \u2014 the wins goal is a pace problem, not a target problem.`);
  s.verify("check-in measured from stored rail state (wins/offers/watches counts), goals never silently rewritten",chk);
  await s.finish({status:"COMPLETE",outcome:"Quarterly check-in compared stated goals to stored reality; adjustment proposed for confirmation, target not silently lowered"}); })();
