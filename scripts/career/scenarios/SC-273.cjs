"use strict"; const {H,OS,fixture}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-273","passive-watch-ping");
  s.user("Passive watch: a perfect-fit role posts while I'm employed \u2014 I get pinged");
  const fx=fixture("test-career-os-w14.json"); const store=OS.createStore(); const watch=OS.createWatch(store,{companies:["TESTCO Beta"],role_families:["Software engineering"]},{now:"2026-10-13T12:00:00Z"}); s.tool("129.createWatch",watch);
  const diff=OS.watchDiff(watch,fx.postings_prior,fx.postings_current); s.tool("129.watchDiff (prior vs current TEST feed)",diff);
  s.agent(diff.ping||"No new matching posting \u2014 no ping sent. Silence means no match, not a broken watch.");
  s.verify("watch stored in rail state; diff hit is a job_id absent from the prior snapshot",{stored:store.watches,diff});
  await s.finish({status:diff.hits.length?"COMPLETE":"LEARN",outcome:"Passive watch ping fired for the new perfect-fit TEST posting while user is employed",reason:diff.hits.length?undefined:"no hit",unblock:diff.hits.length?undefined:"a matching new posting"}); })();
