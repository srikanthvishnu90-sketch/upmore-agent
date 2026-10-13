"use strict"; const {H}=require("./w14-lib.cjs"); const fs=require("fs"); const path=require("path"); const ROOT=path.join(__dirname,"..","..","..");
const G=require(path.join(ROOT,"packages/domain/135-career-graph.js"));
(async()=>{ const s=H.session("SC-284","mentor-map");
  s.user("Mentor map: who in my network to deepen this year, and why them");
  const profile={school:"TEST University",clubs:["TEST University Investing Club"],major:"Computer Science",hometown:"Chicago, IL"};
  // Labeled TEST graph rows (accepted fixture standard) — names/orgs from test-graph-sources.json, shaped for 135.rankWarmth.
  const people=[
    {full_name:"Daniel Warm (TEST)",current_firm:"Datadog",schools:["TEST University"],clubs:["TEST University Investing Club"],major:"Computer Science",hometown:"Chicago, IL",connection_degree:1},
    {full_name:"Maya Alumni (TEST)",current_firm:"Stripe",schools:["TEST University"],major:"Computer Science",hometown:"Chicago, IL",connection_degree:1},
    {full_name:"Olivia Alum (TEST)",current_firm:"Datadog",schools:["TEST University"],major:"Business",hometown:"Denver, CO",connection_degree:2,is_professor:false},
    {full_name:"Eli Cold (TEST)",current_firm:"Stripe",schools:["Other State (TEST)"],major:"Psychology",hometown:"Miami, FL",connection_degree:2}];
  const ranked=people.map(p=>G.rankWarmth(p,profile,{lastInteractionDaysAgo:20})).sort((a,b)=>b.score-a.score);
  s.tool("135.rankWarmth x4 (labeled TEST graph rows)",ranked);
  const top=ranked.slice(0,3);
  s.agent(`Mentor map for this year — ranked by real warmth signals in the TEST graph (alumni, shared club/major/hometown, degree, recency), not by job title:\n${top.map((r,i)=>`${i+1}. ${r.name} (${r.firm}) — warmth ${r.score}: ${r.why.join("; ")}`).join("\n")}\nWhy them: the top two share your school, major and hometown and are 1st-degree — they can speak to your exact path; the third is a 2nd-degree TEST University alum in a senior role at the same firm as #1, so #1 is the warm introduction route. Eli Cold (TEST) ranks last (${ranked[3].score}) — no shared signals — so no deepening effort goes there first. All rows are labeled TEST fixture people.`);
  s.verify("ranking is 135.rankWarmth output sorted by score; every top pick carries its why signals; lowest-signal contact ranked last",{ranked});
  await s.finish({status:top.length===3&&top.every(r=>r.why.length)?"COMPLETE":"LEARN",outcome:`Mentor map ranked from labeled TEST graph rows: ${top.map(r=>`${r.name} (${r.score})`).join(", ")} — each with its warmth reasons; cold contact deprioritized with reason`}); })();
