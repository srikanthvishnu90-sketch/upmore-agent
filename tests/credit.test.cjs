// Instinct spec doc 02 CRDT: score monitoring, the report walkthrough with what looks off, factors with the user's numbers, the utilization plan,
// new-account impact in honest ranges, inquiry alerts against known applications, refinance breakeven, student-loan program checks, freeze guidance,
// the authorized-user explainer, and letters that never carry an identity number.
// Check: node --test tests/credit.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const C=require(path.join(__dirname,'..','packages/domain/61-agent-credit.js'));
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const report={bureau:'Experian',as_of:'2026-10-10',score:702,model:'FICO 8',factors:[{code:'high_utilization',text:'Proportion of balances to credit limits is too high'},{code:'many_inquiries'},{code:'zz_unknown',text:'Something the bureau said'}],
  accounts:[{id:'c1',name:'Blue card',type:'credit_card',opened_on:'2018-03-01',limit_cents:400000,balance_cents:142000,status:'open',statement_on:'2026-10-14',payment_history:{late30:1,last_late_on:'2025-02-01'}},{id:'c2',name:'Store card',type:'credit_card',opened_on:'2024-06-01',limit_cents:100000,balance_cents:70000,status:'open'},{id:'l1',name:'Nelnet',type:'student_loan',opened_on:'2016-09-01',balance_cents:1200000,status:'open'},{id:'c0',name:'Old card',type:'credit_card',opened_on:'2012-01-01',limit_cents:200000,balance_cents:5000,status:'closed'}],
  inquiries:[{on:'2026-09-20',by:'Example Bank',kind:'hard'},{on:'2026-04-02',by:'Auto Lender Co',kind:'hard'},{on:'2026-04-05',by:'Auto Lender Two',kind:'hard'},{on:'2026-08-01',by:'Insurer',kind:'soft'}],public_records:[],collections:[]};

test('score monitoring: bands, change since last, 30 and 90 day deltas, a drop of ten or a band change alerts',()=>{
  const h=[{on:'2026-06-01',score:688,bureau:'Experian',model:'FICO 8'},{on:'2026-08-01',score:712,bureau:'Experian',model:'FICO 8'},{on:'2026-10-10',score:702,bureau:'Experian',model:'FICO 8'}];
  const m=C.scoreMonitor(h);same(m.latest,{score:702,on:'2026-10-10',bureau:'Experian',model:'FICO 8',band:'good'});assert.equal(m.change_since_last,-10);assert.equal(m.change_90d,14);assert.equal(m.alert,true);
  assert.equal(m.text,'702 (good) as of 2026-10-10 from Experian, FICO 8, down 10 since 2026-08-01. Worth a look: that is a real move, not noise.');
  assert.equal(C.scoreMonitor([{on:'2026-10-01',score:745}]).alert,false);assert.equal(C.band(745),'very good');assert.equal(C.band(579),'poor');assert.equal(C.band(800),'exceptional');
  assert.equal(C.scoreMonitor([{on:'2026-09-01',score:741},{on:'2026-10-01',score:736}]).alert,true,'a band change alerts even under ten points');
  assert.match(C.scoreMonitor([]).text,/^No score on file yet/);
});

test('the walkthrough reads the report\'s own rows, flags unknown accounts, closed accounts with a balance and unexplained inquiries; factors carry the user\'s numbers; unknown codes are not guessed',()=>{
  const w=C.walkthrough(report,{accounts:[{id:'c1'},{id:'l1'},{id:'c0'}],applications:[{on:'2026-09-19',by:'Example Bank'},{on:'2026-04-01',by:'Auto Lender Co'}]});
  assert.equal(w.summary_numbers.utilization_bps,4240,'open cards only: 2120 of 5000');assert.equal(w.summary_numbers.oldest_months,177);assert.equal(w.summary_numbers.inquiries_12m,3);
  same(w.looks_off.map(o=>o.kind),['unknown_account','closed_with_balance','unexplained_inquiry']);
  assert.match(w.looks_off[0].text,/^Store card opened 2024-06-01 is not an account you told me about\. If you do not recognize it, that is a fraud alert/);assert.match(w.looks_off[1].text,/Old card is closed but still reports \$50\.00/);assert.match(w.looks_off[2].text,/^A hard inquiry by Auto Lender Two on 2026-04-05 matches no application you made\./);
  assert.match(w.text,/^Accounts: 3 open, 1 closed\. Oldest 14 years, average age 8\.\d years\. Utilization: 42 percent: \$2,120\.00 across \$5,000\.00 of limits\. One card is above half its limit/);assert.match(w.text,/Payment history: 1 thirty-day, 0 sixty-day, 0 ninety-day lates; latest 2025-02-01\./);
  const f=C.factors(report);assert.equal(f[0].explanation,'You are using 42 percent of your card limits ($2,120.00 of $5,000.00). Under 30 percent helps; under 10 percent helps most. This factor resets every statement, so it recovers fast.');
  assert.match(f[1].explanation,/^3 hard inquiries in the last 12 months\./);assert.equal(f[2].explanation,'Something the bureau said: the bureau did not say more, and I will not guess.');
  assert.equal(C.walkthrough(report).looks_off.length,1,'without a known list only the closed-with-balance item is flagged');
});

test('inquiry alerts name what falls off when; the utilization plan is the cheapest set of pay-downs before statements; new-account impact is in ranges from the report; refinance breakeven is arithmetic',()=>{
  const ia=C.inquiryAlerts(report,[{on:'2026-09-19',by:'Example Bank'},{on:'2026-04-01',by:'Auto Lender Co'}]);assert.equal(ia.count,1);assert.equal(ia.alerts[0].by,'Auto Lender Two');assert.equal(ia.alerts[0].falls_off,'2028-04-05','two calendar years, not 730 days across Feb 29, 2028');assert.match(ia.alerts[0].text,/freeze your reports \(I have the links\) and dispute it/);
  assert.equal(C.inquiryAlerts(report,[{on:'2026-09-19',by:'Example Bank'},{on:'2026-04-01'},{on:'2026-04-05'}]).count,0,'an application without a named lender matches by date');
  const plan=C.utilizationPlan(report,3000,200000);assert.equal(plan.now_bps,4240);same(plan.moves.map(m=>[m.name,m.pay_cents]),[['Blue card',22000],['Store card',40000]]);assert.equal(plan.total_cents,62000);assert.equal(plan.affordable,true);
  assert.equal(plan.text,'To get under 30 percent: pay $220.00 on Blue card before 2026-10-14; pay $400.00 on Store card. Total $620.00. Pay before the statement closes: that is the balance the bureaus see.');
  const tight=C.utilizationPlan(report,3000,30000);assert.equal(tight.affordable,false);assert.match(tight.text,/more than the \$300\.00 you have free; the first move alone still helps/);
  assert.match(C.utilizationPlan({accounts:[{id:'x',type:'credit_card',limit_cents:100000,balance_cents:5000}]},3000).text,/already under 30 percent/);
  const n=C.newAccountImpact(report,'credit_card',500000);assert.equal(n.utilization_bps_before,4240);assert.equal(n.utilization_bps_after,2120);assert.ok(n.average_age_months_after<n.average_age_months_before);assert.match(n.text,/^A hard inquiry: a few points for up to a year, gone from the report in two\. Average account age drops from \d+\.\d to \d+\.\d years; it recovers as the account ages\. Utilization falls from 42 to 21 percent once the new limit reports, which helps\. Exact point changes are not published/);
  const rf=C.refinanceWatch({balance_cents:30000000,apr_bps:675,months_left:300,as_of:'2026-10-10'},[{lender:'Lender A',apr_bps:575,months:300,closing_costs_cents:600000,as_of:'2026-10-09'},{lender:'Lender B',apr_bps:660,months:300,closing_costs_cents:900000,as_of:'2026-10-09'}]);
  assert.equal(rf.current.payment_cents,C.payment(30000000,675,300));assert.equal(rf.best.lender,'Lender A');assert.ok(rf.best.monthly_saving_cents>15000&&rf.best.monthly_saving_cents<20000,String(rf.best.monthly_saving_cents));assert.equal(rf.best.breakeven_months,Math.ceil(600000/rf.best.monthly_saving_cents));assert.ok(rf.best.total_cost_difference_cents<0);
  const b=rf.offers.find(o=>o.lender==='Lender B');assert.equal(b.worth_it,false,'fifteen basis points with high costs never pays back inside the term');assert.match(rf.text,/^Lender A at 5\.75 percent: \$[\d,.]+ a month, \$[\d.]+ less; the \$6,000\.00 costs pay back in \d+ months and you come out \$[\d,.]+ ahead over the term\. Rates move; this is as of 2026-10-09\.$/);
  assert.equal(C.payment(120000,0,12),10000,'zero APR is a straight division');
});

test('student-loan programs are checked structurally against a dated rules table; freeze guidance links the bureaus and tracks what is done; letters carry no identity number',()=>{
  const e=C.studentLoanEligibility({type:'direct'},{employer_kind:'nonprofit_501c3',qualifying_payments:84,plan:'idr',income_cents:5200000});
  const pslf=e.programs.find(p=>p.program==='pslf');assert.equal(pslf.verdict,'on track');assert.match(pslf.text,/^Public Service Loan Forgiveness: on track \(84 of 120 payments\); yes: loan type direct, yes: employer government or nonprofit_501c3, no: 120 qualifying payments, yes: on idr or standard_10\.$/);
  assert.equal(e.programs.find(p=>p.program==='idr').verdict,'likely');assert.equal(e.programs.find(p=>p.program==='consolidation').verdict,'unlikely');assert.equal(e.rules_as_of,'2026-10');assert.match(e.caveat,/the servicer's count and the current rules decide/);
  assert.equal(C.studentLoanEligibility({type:'ffel'},{employer_kind:'private'}).programs.find(p=>p.program==='consolidation').verdict,'likely');
  const fg=C.freezeGuidance({bureaus:[{bureau:'Equifax',state:'frozen'}]});same(fg.remaining,['Experian','TransUnion']);assert.match(fg.text,/^A freeze is free, takes minutes per bureau, and blocks new accounts in your name while leaving your existing ones alone/);assert.match(fg.text,/Equifax: frozen; Experian: https:\/\/www\.experian\.com\/freeze\/center\.html/);assert.match(fg.text,/Keep each PIN somewhere I never see\.$/);
  assert.equal(C.authorizedUserExplainer({accounts_count:1,oldest_months:10}).thin_file,true);assert.match(C.authorizedUserExplainer({accounts_count:6,oldest_months:170}).text,/your file already has history so the gain is smaller/);assert.match(C.authorizedUserExplainer({}).text,/You are not liable for the debt as an authorized user/);
  const v=C.collectorResponse({kind:'validation',collector:'ABC Recovery',contact_on:'2026-10-01',account_last4:'7710',amount_cents:48000});assert.match(v.text,/^To ABC Recovery: I received your communication dated 2026-10-01 regarding account ending 7710 \(\$480\.00\)\. I dispute this debt and request validation under the Fair Debt Collection Practices Act/);assert.match(v.timing,/^Send within 30 days/);assert.equal(v.contains_identity_numbers,false);
  assert.match(C.collectorResponse({kind:'pay_for_delete',collector:'ABC',amount_cents:48000,offer_cents:20000}).text,/I will pay \$200\.00 as settlement in full if you agree in writing, before payment, to delete/);assert.match(C.collectorResponse({kind:'not_mine',collector:'ABC'}).text,/is not mine/);assert.match(C.collectorResponse({kind:'cease'}).text,/cease all communication/);
  const d=C.disputeDraft(report,{name:'Store card',number:'4111 2222 3333 7710',opened_on:'2024-06-01',evidence:['police report number','identity theft affidavit']},'I did not open this account');
  assert.match(d.text,/^To Experian: I dispute the following item on my report as of 2026-10-10: Store card, opened 2024-06-01\. Reason: I did not open this account\. Please investigate/);assert.ok(!/4111|2222|3333/.test(d.text),'no card number in the letter');assert.equal(d.contains_identity_numbers,false);assert.equal(d.capability_id,'CRDT-004');
});
