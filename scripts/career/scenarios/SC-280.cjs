"use strict"; const {H,OS,fixture}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-280","market-shift-alert");
  s.user("Market-shift alert: my role's pay band moved \u2014 shown with the data");
  const fx=fixture("test-career-os-w14.json"); const cur=fx.postings_current.filter(p=>p.company==="TESTCO Beta"); const shift=OS.compBandShift("TESTCO Beta",fx.postings_prior,fx.postings_current); s.tool("129.compBandShift (TEST postings)",shift);
  s.agent(shift.statement+"\nEvidence \u2014 prior: "+shift.evidence.prior.map(e=>`${e.title} $${e.range.low.toLocaleString()}\u2013$${e.range.high.toLocaleString()}`).join("; ")+" | current: "+shift.evidence.current.map(e=>`${e.title} $${e.range.low.toLocaleString()}\u2013$${e.range.high.toLocaleString()}`).join("; "));
  s.verify("shift computed from stated ranges in the TEST postings themselves; evidence lists exact postings",shift);
  await s.finish({status:shift.shift?"COMPLETE":"LEARN",outcome:"Market-shift alert fired: TESTCO Beta stated-range envelope moved up, shown with the exact posting evidence",reason:shift.shift?undefined:"no shift detected",unblock:shift.shift?undefined:"postings whose stated ranges actually moved"}); })();
