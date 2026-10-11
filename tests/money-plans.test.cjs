// Instinct spec docs 06, 07, 02: requests for money, scheduled and recurring sends, own transfers, autosave rules, the overdraft-prevention
// move, failed-payment triage, group expenses, shared goals, gifts and household roles, each as a loop request executed on the fake rail.
// Check: node --test tests/money-plans.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','35-agent-intents.js','36-agent-workflows.js','41-agent-recovery.js','42-agent-recipients.js','43-agent-loop.js','46-voice.js','48-money-math.js','54-agent-money.js','57-agent-ledger.js','60-agent-money-plans.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.MP=AgentMoneyPlans;this.Loop=AgentLoop;this.L=AgentLedger;',ctx);
const MP=ctx.MP,Loop=ctx.Loop,L=ctx.L;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const TODAY='2026-10-10';const NOW=Date.UTC(2026,9,10,14,0,0);
const people=[{id:'p1',name:'Sarah M',handle:'@sarah-m',rails:['venmo'],history:[{amount_cents:8500,on:'2026-09-01'}]},{id:'p2',name:'Marcus L',handle:'@marcus',rails:['venmo'],history:[]},{id:'p4',name:'Landlord LLC',bank_account:true,rails:[],history:[{amount_cents:180000,on:'2026-09-02'}]},{id:'p5',name:'Maya',rails:['cash_app'],history:[{amount_cents:2000,on:'2026-09-05'}]}];
const accounts=[{id:'chk',kind:'checking',nickname:'checking',institution:'Example Bank',balance_cents:150000,available_cents:142000,owners:['me']},{id:'sav',kind:'savings',nickname:'savings',institution:'Example Bank',balance_cents:400000,owners:['me']},{id:'joint',kind:'checking',nickname:'joint',institution:'Credit Union',balance_cents:80000,owners:['me','partner']},{id:'teen',kind:'checking',nickname:'teen card',balance_cents:12000,owners:['kid']}];
const lives=JSON.parse(fs.readFileSync(path.join(root,'evals/data/labeled/savings-lives.json'),'utf8'));
const life=lives.lives.find(l=>l.id==='LIFE-001');
const caps={'PAY-003':'T3','PAY-007':'T3','PAY-009':'T4','SAVE-001':'T4','SAVE-006':'T4','PAY-025':'T4','SOC-005':'T4','SOC-008':'T3','PAY-001':'T3'};
const registry={get:id=>caps[id]?{id,name:id,tier:caps[id],status:'TESTED'}:null,answer:()=>({text:''})};
const rail=()=>{const writes=[];return {writes,read:async()=>({value:1,source:'x',as_of:NOW}),write:async(id,p,key)=>{writes.push(key);return {reference:'ref-'+writes.length};},verify:async()=>({confirmed:true,source:'Example Bank'})};};

test('request money: staged on the person\'s rail, reminders follow the tone and cadence, settled when the matching credit lands; unknown people get no bill',()=>{
  assert.match(MP.requestMoney({from:'Priya',amount_cents:4000},{people,today:TODAY}).ask,/^Who is Priya\? I only request money from people in your list/);
  const r=MP.requestMoney({from:'Sarah M',amount_cents:4250,what:'dinner Friday',tone:'friendly'},{people,today:TODAY});
  assert.equal(r.text,'Venmo request to Sarah M (@sarah-m) for $42.50, note "dinner Friday": staged, you tap Request.');assert.equal(r.request.capability_id,'PAY-003');assert.equal(r.request.tier,'T3');
  assert.equal(MP.reminder(r.request,'2026-10-14'),null,'no nudge inside a week');
  const n1=MP.reminder(r.request,'2026-10-18');assert.equal(n1.text,'Hey Sarah, when you get a sec: $42.50 for dinner Friday. No rush!');assert.equal(n1.capability_id,'SOC-009');
  const firm=MP.requestMoney({from:'Maya',amount_cents:2000,what:'tickets',tone:'firm'},{people,today:TODAY}).request;assert.match(MP.reminder(firm,'2026-10-13').text,/^Maya, the \$20\.00 for tickets is now 3 days old\. Can you send it today\?$/);
  const settled=MP.settleRequests([r.request,firm],[{id:'c1',account_id:'chk',posted_at:'2026-10-19',amount:42.5,merchant_raw:'VENMO FROM SARAH-M'}],people);
  assert.equal(settled.length,1);assert.equal(settled[0].text,'Sarah M paid the $42.50 for dinner Friday on 2026-10-19.');assert.equal(r.request.status,'settled');assert.equal(firm.status,'open');assert.equal(MP.reminder(r.request,'2026-11-01'),null,'settled requests stop nagging');
});

test('scheduled payments: cutoff is the business day before for ACH, cancel works until then and is honest after, the due request goes through the loop with a confirmation',async()=>{
  assert.match(MP.schedulePayment({to:'Landlord LLC',amount_cents:180000,on:'2026-10-01'},{people,today:TODAY}).ask,/after today/);
  const s=MP.schedulePayment({to:'Landlord LLC',amount_cents:180000,on:'2026-11-02',memo:'November rent'},{people,today:TODAY}).schedule;
  assert.equal(s.rail,'ach');assert.equal(s.cutoff_on,'2026-10-30','Nov 2 is a Monday; the business day before is Friday Oct 30');assert.match(s.text,/^Scheduled: \$1,800\.00 to Landlord LLC on 2026-11-02 by ACH\. You can cancel until 2026-10-30; after that it is in flight\./);
  same(MP.dueScheduled([s],'2026-11-01'),[]);const due=MP.dueScheduled([s],'2026-11-02');assert.equal(due.length,1);assert.equal(due[0].idempotency_key,s.id+':send');assert.equal(due[0].confirm.timing,'lands in 1-3 business days');
  const c=rail();const loop=Loop.create({registry,connectors:c,clock:()=>NOW});const r=await loop.wake({kind:'event',request:due[0]});assert.equal(r.outcome,'awaiting_confirmation');assert.match(r.message,/\$1,800\.00 to Landlord LLC/);
  const done=await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});assert.equal(done.outcome,'confirmed');assert.equal(c.writes.length,1);
  const again=await loop.wake({kind:'event',request:due[0]});assert.equal(again.outcome,'already_done');assert.equal(c.writes.length,1,'a second wake on the same day never sends twice');
  const late=MP.cancelScheduled(s,'2026-10-31');assert.equal(late.cancelled,false);assert.equal(late.in_flight,true);assert.match(late.text,/passed its cutoff on 2026-10-30 and is in flight\. An ACH can be recalled the same day/);
  const s2=MP.schedulePayment({to:'Marcus L',amount_cents:3000,on:'2026-10-20'},{people,today:TODAY}).schedule;assert.equal(s2.rail,'venmo');assert.equal(s2.cutoff_on,'2026-10-19');const ok=MP.cancelScheduled(s2,'2026-10-15');assert.equal(ok.cancelled,true);assert.equal(s2.status,'cancelled');assert.equal(MP.cancelScheduled(s2,'2026-10-15').cancelled,false);
});

test('own transfers never overdraw and confirm both ends; autosave round-ups, payday sweep and threshold sweep keep the floor; the overdraft-prevention move names the day and the amount',async()=>{
  assert.match(MP.ownTransfer({from:'checking',to:'checking',amount_cents:100},{accounts,today:TODAY}).ask,/same account/);
  const over=MP.ownTransfer({from:'checking',to:'savings',amount_cents:150000},{accounts,today:TODAY});assert.equal(over.stop,true);assert.equal(over.text,'checking has $1,420.00 available; $1,500.00 would overdraw it. Nothing moved.');
  const t=MP.ownTransfer({from:'checking',to:'savings',amount_cents:50000},{accounts,today:TODAY});assert.equal(t.leaves_cents,92000);same(t.request.confirm,{action:'Move',amount:'$500.00',recipient:'savings',from:'checking',timing:'instant',fee_cents:0});assert.equal(t.request.capability_id,'PAY-009');
  const c=rail();const loop=Loop.create({policy:{envelope_autonomy:true},registry,connectors:c,clock:()=>NOW,envelopes:[{id:'e',capability_id:'PAY-009',max_cents:100000,active:true}]});const r=await loop.wake({kind:'event',request:t.request});assert.equal(r.outcome,'confirmed','inside the envelope it just runs, with a receipt');assert.equal(c.writes.length,1);
  const rules=[{id:'ru',kind:'round_up',from:'chk',to:'sav',account_id:'cc1',last_run_on:'2026-09-01'},{id:'pay',kind:'payday_sweep',from:'chk',to:'sav',percent_bps:1000},{id:'th',kind:'threshold',from:'chk',to:'sav',above_cents:100000,keep_at_least_cents:100000}];
  const sept=life.transactions.filter(t=>t.account_id==='cc1'&&t.posted_at>'2026-09-01'&&t.amount<0);const expectedRoundUp=sept.reduce((s,t)=>s+((100-(Math.round(-t.amount*100)%100))%100),0);
  const a=MP.autosave(rules,{accounts,transactions:life.transactions.concat([{id:'pd',account_id:'chk',posted_at:TODAY,amount:1600,merchant_raw:'PAYROLL DIRECT DEP'}]),today:TODAY});
  const ru=a.find(x=>x.rule_id==='ru').request;assert.equal(ru.params.amount_cents,expectedRoundUp);assert.equal(ru.evidence.rows.length,sept.length);assert.match(ru.describe,/^Autosave \$[\d.]+ to savings \(round-ups on \d+ purchases since 2026-09-01\)$/);
  const pd=a.find(x=>x.rule_id==='pay').request;assert.equal(pd.params.amount_cents,16000);assert.match(pd.describe,/10 percent of today's \$1,600\.00 paycheck/);
  const th=a.find(x=>x.rule_id==='th').request;assert.equal(th.params.amount_cents,42000,'above the line, trimmed to the floor');
  const floor=MP.autosave([{id:'x',kind:'payday_sweep',from:'chk',to:'sav',amount_cents:200000,keep_at_least_cents:100000}],{accounts,transactions:[{id:'pd',account_id:'chk',posted_at:TODAY,amount:1600,merchant_raw:'PAYROLL'}],today:TODAY});assert.equal(floor[0].request.params.amount_cents,42000);assert.match(floor[0].request.describe,/trimmed to keep \$1,000\.00 in checking/);
  const broke=MP.autosave([{id:'x',kind:'payday_sweep',from:'chk',to:'sav',amount_cents:20000,keep_at_least_cents:200000}],{accounts,transactions:[{id:'pd',account_id:'chk',posted_at:TODAY,amount:1600,merchant_raw:'PAYROLL'}],today:TODAY});assert.match(broke[0].skipped,/under its \$2,000\.00 floor/);
  const thin=[{id:'chk',kind:'checking',nickname:'checking',balance_cents:2000,available_cents:2000},{id:'sav',kind:'savings',nickname:'savings',balance_cents:400000}];
  const od=MP.overdraftPrevention({today:TODAY,accounts:thin,transactions:life.transactions,buffer_cents:20000});
  const fc=L.cashflowForecast({today:TODAY,accounts:[thin[0]],transactions:life.transactions,horizons:[30]});const firstBelow=fc.daily.find(d=>d.balance_cents<20000);
  assert.equal(od.needed,true);assert.equal(od.first_below.on,firstBelow.on,'the first day under the buffer, from the same forecast');assert.equal(od.land_by,new Date(Date.parse(firstBelow.on+'T00:00:00Z')-86400000).toISOString().slice(0,10));
  assert.equal(od.amount_cents,20000-fc.low_point.balance_cents,'the smallest move that keeps checking above the buffer at its lowest point');assert.equal(od.request.capability_id,'SAVE-006');assert.equal(od.request.urgent,fc.low_point.balance_cents<0);assert.equal(od.request.deadline,Date.parse(od.land_by+'T00:00:00Z'));
  assert.match(od.text,new RegExp('^Checking goes under your \\$200\\.00 buffer on '+firstBelow.on+' and bottoms at -?\\$[\\d,.]+ on 2026-\\d\\d-\\d\\d\\. Moving \\$[\\d,.]+ from savings by '+od.land_by+' keeps it above the line\\.$'));
  const short=MP.overdraftPrevention({today:TODAY,accounts:[thin[0],{id:'sav',kind:'savings',nickname:'savings',balance_cents:5000}],transactions:life.transactions,buffer_cents:20000});assert.equal(short.amount_cents,5000);assert.ok(short.short_cents>0);assert.match(short.text,/savings covers \$50\.00 of the \$[\d,.]+ needed/);
  const fine=MP.overdraftPrevention({today:TODAY,accounts,transactions:life.transactions});assert.equal(fine.needed,false);
});

test('failed-payment triage: the cause decides the step and a retry is a new key naming the original; allowances run on cadence under a monthly cap; first-time recipients ask',async()=>{
  const failed={capability_id:'PAY-001',idempotency_key:'send:p2:3000:2026-10-09',describe:'Send $30.00 to Marcus L',params:{amount_cents:3000,recipient:'Marcus L',from:'chk'},reason:'insufficient funds',confirm:{action:'Send',amount:'$30.00',recipient:'Marcus L'}};
  const t1=MP.triageFailed(failed,{accounts,today:TODAY});assert.equal(t1.cause,'insufficient_funds');assert.equal(t1.retry,true);assert.equal(t1.request.idempotency_key,'send:p2:3000:2026-10-09:retry:2026-10-10');assert.equal(t1.request.retry_of,'send:p2:3000:2026-10-09');assert.match(t1.text,/^Send \$30\.00 to Marcus L failed: insufficient funds\. Funds are there now; retry\. The retry is a new confirmation\.$/);
  const t2=MP.triageFailed(Object.assign({},failed,{params:{amount_cents:300000,recipient:'Marcus L',from:'chk'}}),{accounts,today:TODAY,next_income_on:'2026-10-15'});assert.equal(t2.retry,false);assert.match(t2.step,/^retry on 2026-10-15 when income lands, or move \$1,580\.00 from savings first$/);
  const t3=MP.triageFailed(Object.assign({},failed,{reason:'R03 no account'}),{accounts,today:TODAY});assert.equal(t3.cause,'account_closed');assert.equal(t3.retry,false);assert.equal(t3.request,undefined);
  assert.equal(MP.triageFailed(Object.assign({},failed,{reason:'rail maintenance'}),{accounts,today:TODAY}).cause,'rail_down');assert.equal(MP.triageFailed(Object.assign({},failed,{reason:'???'}),{accounts,today:TODAY}).retry,false);
  const c=rail();const loop=Loop.create({registry,connectors:c,clock:()=>NOW});const r=await loop.wake({kind:'message',request:t1.request});assert.equal(r.outcome,'awaiting_confirmation','a retry is confirmed like any send');
  assert.equal(MP.allowance({to:'Marcus L',amount_cents:2000,cadence:'weekly'},{people,today:TODAY}).new_recipient,true);
  const al=MP.allowance({to:'Maya',amount_cents:2000,cadence:'weekly',day:5,max_per_month_cents:6000},{people,today:TODAY}).allowance;assert.equal(al.text,'Allowance: $20.00 to Maya weekly on day 5 by CASH_APP, never more than $60.00 a month. Inside an envelope it runs with a receipt each time; without one I confirm each send.');
  same(MP.dueAllowances([al],'2026-10-15'),[],'Thursday is not day 5');const fri=MP.dueAllowances([al],'2026-10-16');assert.equal(fri.length,1);assert.equal(fri[0].request.idempotency_key,al.id+':2026-10-16');assert.equal(fri[0].request.cadence_requested,true);
  assert.match(MP.dueAllowances([al],'2026-10-30',{[al.id]:6000})[0].skipped,/\$60\.00 cap/);
});

test('group expenses settle with the fewest transfers, a shared goal splits what is left per member per month, a gift carries its occasion, the social feed is off unless turned on, household roles bound what each member sees and does',async()=>{
  const g=MP.group({name:'Lisbon trip',members:['me','Sarah M','Maya'],goal:{name:'Lisbon fund',target_cents:90000,by:'2027-01-10'}});
  MP.addExpense(g,{what:'Airbnb deposit',amount_cents:30000,payer:'me',on:'2026-10-01'});MP.addExpense(g,{what:'dinner',amount_cents:9000,payer:'Sarah M',on:'2026-10-03',among:['me','Sarah M']});
  const b=MP.groupBalances(g);assert.equal(b.total_cents,39000);same(b.balances.map(x=>x.statement),['me is owed $155.00','Sarah M owes $55.00','Maya owes $100.00']);assert.equal(b.settle_up.length,2);assert.equal(b.settle_up.reduce((s,t)=>s+t.amount_cents,0),15500);
  const plan=MP.goalPlan(g,TODAY);assert.equal(plan.remaining_cents,90000);assert.equal(plan.per_member[0].per_month_cents,10000);assert.equal(plan.text,'Lisbon fund: $0.00 of $900.00 in. me $100.00/month, Sarah M $100.00/month, Maya $100.00/month gets there by 2027-01-10.');
  const contrib=MP.contribute(g,'me',10000,TODAY,{from:'chk'});assert.equal(contrib.capability_id,'SOC-005');assert.equal(MP.goalPlan(g,TODAY).saved_cents,10000);
  const c=rail();const r=await Loop.create({registry,connectors:c,clock:()=>NOW}).wake({kind:'event',request:contrib});assert.equal(r.outcome,'awaiting_confirmation');
  assert.match(MP.gift({to:'Sarah M',amount_cents:5000},{people,today:TODAY}).ask,/occasion/);
  const gf=MP.gift({to:'Sarah M',amount_cents:5000,occasion:'Happy birthday',message:'coffee is on me this month',on:'2026-10-20'},{people,today:TODAY});assert.equal(gf.text,'$50.00 to Sarah M on 2026-10-20 with the note "Happy birthday: coffee is on me this month". I\'ll confirm with you that morning.');assert.equal(gf.request.params.memo,'Happy birthday: coffee is on me this month');assert.equal(gf.request.capability_id,'SOC-008');
  assert.equal(MP.socialFeed([{from:'me',to:'Sarah M',what:'dinner',on:TODAY}],{}).enabled,false);assert.match(MP.socialFeed([],{}).text,/off\. It stays off unless you turn it on; nothing is shared/);assert.equal(MP.socialFeed([{from:'me',to:'Sarah M',what:'dinner',on:TODAY}],{social_feed:true}).items[0].text,'me and Sarah M settled dinner');
  const h=MP.household({members:[{id:'me',name:'Vishnu',role:'owner'},{id:'partner',name:'Ana',role:'partner'},{id:'kid',name:'Sam',role:'teen',limit_cents:2500},{id:'aunt',name:'Rae',role:'viewer'}]});
  same(MP.visibleTo(h,'me',accounts).map(a=>a.id),['chk','sav','joint','teen']);same(MP.visibleTo(h,'partner',accounts).map(a=>a.id),['joint']);same(MP.visibleTo(h,'kid',accounts).map(a=>a.id),['teen']);same(MP.visibleTo(h,'aunt',accounts).map(a=>a.id),['joint']);
  assert.equal(MP.mayAct(h,'partner',{params:{from:'joint',amount_cents:5000}},accounts).allowed,true);assert.match(MP.mayAct(h,'partner',{params:{from:'chk',amount_cents:5000}},accounts).reason,/only act on shared accounts/);
  assert.match(MP.mayAct(h,'aunt',{params:{from:'joint',amount_cents:100}},accounts).reason,/can see but not act/);assert.equal(MP.mayAct(h,'kid',{params:{from:'teen',amount_cents:2000}},accounts).allowed,true);assert.match(MP.mayAct(h,'kid',{params:{from:'teen',amount_cents:3000}},accounts).reason,/over Sam's \$25\.00 limit; the owner approves above it/);assert.match(MP.mayAct(h,'kid',{params:{from:'chk',amount_cents:100}},accounts).reason,/own account/);
});
