"use strict"; const {H,OS,fixture}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-274","network-upkeep-cold-list");
  s.user("Network upkeep: my 12 warmest contacts \u2014 who's going cold");
  const fx=fixture("test-career-os-w14.json"); const store=OS.createStore({relationships:fx.relationships}); const up=OS.networkUpkeep(store,{now:"2026-10-13T12:00:00Z"}); s.tool("129.networkUpkeep (12 TEST contacts)",up);
  s.agent(`Your twelve warmest, coldest first: ${up.ranked.map(r=>`${r.name} (${r.days_since}d)`).join(", ")}. Going coldest: ${up.coldest_warm.name} \u2014 last touch ${up.coldest_warm.days_since} days ago. A restart draft is on an approval card; nothing sends without your tap.`);
  s.verify("12 contacts ranked by days_since from stored relationships; restart draft requires approval, sent=false",{count:up.ranked.length,coldest:up.coldest_warm,card:up.card});
  await s.finish({status:up.ranked.length===12?"COMPLETE":"LEARN",outcome:"12 warm TEST contacts ranked by coldness; coldest flagged with an approval-gated restart draft (not sent)"}); })();
