// SAVE-022 windfall routing (C30): a deposit well above the learned pattern is detected, classified from its
// descriptor words, and routed with one concrete suggested sweep that executes on the person's yes through the
// loop (43-agent-loop.js) and the money-plans transfer builder (60-agent-money-plans.js) on a fake rail.
// Check: node --test tests/windfall.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','35-agent-intents.js','36-agent-workflows.js','41-agent-recovery.js','42-agent-recipients.js','43-agent-loop.js','45-advice-guard.js','46-voice.js','47-data-guard.js','48-money-math.js','49-agent-save.js','44-agent-earn.js','54-agent-money.js','55-agent-news.js','57-agent-ledger.js','59-agent-alerts.js','60-agent-money-plans.js','56-agent-proactive.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.A=AgentAlerts;this.MP=AgentMoneyPlans;this.Loop=AgentLoop;',ctx);
const A=ctx.A,MP=ctx.MP,Loop=ctx.Loop;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const TODAY='2026-10-15';const NOW=Date.UTC(2026,9,15,14,0,0);
// The learned pattern: semimonthly $1,600 paychecks through the trailing 90 days (median trailing deposit $1,600).
const paychecks=['2026-07-17','2026-07-31','2026-08-14','2026-08-28','2026-09-11','2026-09-25','2026-10-09'].map((d,i)=>({id:'p'+(i+1),account_id:'chk',posted_at:d,amount:1600,merchant_raw:'PAYROLL DIRECT DEP'}));
const accounts=[{id:'chk',kind:'checking',nickname:'checking',balance_cents:500000,available_cents:500000,source:'simplefin',as_of:'2026-10-15T06:00:00Z'},{id:'sav',kind:'savings',nickname:'savings',balance_cents:128000,source:'simplefin',as_of:'2026-10-15T06:00:00Z'}];
// The person's sweep rule (SAVE-001 shape): 25% of a windfall from checking to the named savings account.
const sweepRule={id:'wf-sweep',kind:'windfall_sweep',from:'chk',to:'sav',percent_bps:2500,status:'active'};
const refund={id:'w1',account_id:'chk',posted_at:TODAY,amount:3240,merchant_raw:'IRS TREASURY REFUND'};
const base=(extra,o)=>Object.assign({today:TODAY,transactions:paychecks.concat(extra||[]),accounts,autosave_rules:[sweepRule]},o||{});
const windfalls=input=>A.detect(input).filter(x=>x.kind==='windfall');

test('module: a $3,240 IRS TREASURY REFUND deposit is exactly one windfall: tax refund, evidence words, median, and the sweep the rule supports',()=>{
  const f=windfalls(base([refund]));
  assert.equal(f.length,1);
  const w=f[0];
  assert.equal(w.key,'windfall:w1');assert.equal(w.capability_id,'SAVE-022');assert.equal(w.amount_cents,324000);
  assert.equal(w.evidence.computed.classification,'tax refund');
  same(w.evidence.computed.evidence_words,['IRS','TREASURY','REFUND']);
  assert.equal(w.evidence.computed.trailing_median_cents,160000,'the median of the trailing paycheck deposits');
  assert.equal(w.evidence.computed.sweep_cents,81000,'25% of $3,240.00, from the fixture sweep rule');
  assert.equal(w.evidence.computed.sweep_percent_bps,2500);
  assert.equal(w.evidence.computed.from_account_id,'chk');assert.equal(w.evidence.computed.to_account_id,'sav');
  same(w.evidence.rows,['w1']);assert.equal(w.evidence.source,'your transactions');assert.equal(w.evidence.as_of,TODAY);
  assert.match(w.text,/Your \$3,240\.00 tax refund landed/);
  assert.match(w.text,/IRS, TREASURY, REFUND/,'the words that produced the classification are named');
  assert.match(w.text,/Sweep \$810\.00 \(25% of it\) to savings\?/,'exact dollars and destination from the rule');
  assert.match(w.title,/Tax refund/);
});

test('module: classification comes from descriptor words: bonus, reimbursement, and an unrecognized large credit',()=>{
  const bonus=windfalls(base([{id:'b1',account_id:'chk',posted_at:TODAY,amount:4000,merchant_raw:'ACME CORP BONUS PAYMENT'}]));
  assert.equal(bonus.length,1);assert.equal(bonus[0].evidence.computed.classification,'bonus');same(bonus[0].evidence.computed.evidence_words,['BONUS']);assert.equal(bonus[0].evidence.computed.sweep_cents,100000);
  const reimb=windfalls(base([{id:'r1',account_id:'chk',posted_at:TODAY,amount:3500,merchant_raw:'ACME REIMB EXPENSE'}]));
  assert.equal(reimb.length,1);assert.equal(reimb[0].evidence.computed.classification,'reimbursement');same(reimb[0].evidence.computed.evidence_words,['REIMB','EXPENSE']);
  const odd=windfalls(base([{id:'u1',account_id:'chk',posted_at:TODAY,amount:5000,merchant_raw:'WIRE CREDIT 8842'}]));
  assert.equal(odd.length,1);assert.equal(odd[0].evidence.computed.classification,'unusual deposit');same(odd[0].evidence.computed.evidence_words,[]);
});

test('module: ordinary deposits fire nothing, and a regular paycheck is not a windfall even when small credits drag the median down',()=>{
  assert.equal(windfalls(base([{id:'o1',account_id:'chk',posted_at:TODAY,amount:1600,merchant_raw:'PAYROLL DIRECT DEP'}])).length,0,'a normal paycheck');
  assert.equal(windfalls(base([{id:'o2',account_id:'chk',posted_at:TODAY,amount:200,merchant_raw:'IRS TREASURY REFUND'}])).length,0,'$200 is not over twice the $1,600 median');
  assert.equal(windfalls(base([{id:'o3',account_id:'chk',posted_at:TODAY,amount:-50,merchant_raw:'COFFEE SHOP'}])).length,0,'a debit is not a deposit');
  // Trailing pattern here: three $1,600 paychecks plus four $50 credits, so the overall median is $50 — a fourth
  // ordinary $1,600 paycheck is over 2x that median, but it matches its own merchant's trailing pattern, so it is
  // the regular paycheck, not a windfall.
  const mixed=[1,2,3].map(i=>({id:'mp'+i,account_id:'chk',posted_at:'2026-09-0'+i,amount:1600,merchant_raw:'PAYROLL DIRECT DEP'})).concat([1,2,3,4].map(i=>({id:'mc'+i,account_id:'chk',posted_at:'2026-09-1'+i,amount:50,merchant_raw:'CARD REWARDS CREDIT'})));
  assert.equal(windfalls({today:TODAY,transactions:mixed.concat([{id:'o4',account_id:'chk',posted_at:TODAY,amount:1600,merchant_raw:'PAYROLL DIRECT DEP'}]),accounts,autosave_rules:[sweepRule]}).length,0,'the regular paycheck pattern is excluded');
});

test('module: fire once per deposit — a duplicated row fires once, and a deposit already alerted fires never',()=>{
  const dup=windfalls(base([refund,Object.assign({},refund)]));
  assert.equal(dup.length,1,'same transaction id, one alert');
  const first=windfalls(base([refund]))[0];
  assert.equal(windfalls(base([refund],{alerted_keys:[first.key]})).length,0,'already alerted by key');
  assert.equal(windfalls(base([refund],{alerted_keys:['w1']})).length,0,'already alerted by transaction id');
});

test('module: with no rule the stated share is 50% to a savings account that exists; with no savings account no destination is invented',()=>{
  const noRule=windfalls({today:TODAY,transactions:paychecks.concat([refund]),accounts});
  assert.equal(noRule.length,1);assert.equal(noRule[0].evidence.computed.sweep_cents,162000);assert.match(noRule[0].text,/Sweep \$1,620\.00 \(50% of it\) to savings\?/);
  const noSav=windfalls({today:TODAY,transactions:paychecks.concat([refund]),accounts:[accounts[0]]});
  assert.equal(noSav.length,1);assert.equal(noSav[0].evidence.computed.to_account_id,null);assert.equal(noSav[0].evidence.computed.sweep_cents,null);
  assert.match(noSav[0].text,/No savings account is linked/);assert.ok(!/to savings\?/.test(noSav[0].text),'no invented destination');
});

test('execution: on yes, the suggested sweep moves exactly the swept amount on the fake rail — and nothing moves before the yes',async()=>{
  const w=windfalls(base([refund]))[0];
  const sweep=w.evidence.computed.sweep_cents;assert.equal(sweep,81000);
  // The transfer the alert suggested, built by the money-plans module from the alert's own computed values.
  const built=MP.ownTransfer({from:w.evidence.computed.from_account_id,to:w.evidence.computed.to_account_id,amount_cents:sweep},{accounts,today:TODAY});
  assert.ok(built.request,'the sweep is expressible as an own-account transfer');assert.equal(built.request.params.amount_cents,81000);
  same([built.request.confirm.amount,built.request.confirm.recipient,built.request.confirm.from],['$810.00','savings','checking']);
  // Fake rail: balances live on the rail; a write moves money between the person's own accounts and is verified.
  const balances={chk:500000,sav:128000};const writes=[];
  const rail={read:async()=>({value:1,source:'x',as_of:NOW}),write:async(id,p,key)=>{writes.push(key);balances[p.from]-=p.amount_cents;balances[p.to]+=p.amount_cents;return {reference:'ref-'+writes.length};},verify:async()=>({confirmed:true,source:'Example Bank'})};
  const caps={'PAY-009':'T4','SAVE-001':'T4'};
  const registry={get:id=>caps[id]?{id,name:id,tier:caps[id],status:'TESTED'}:null,answer:()=>({text:''})};
  const loop=Loop.create({registry,connectors:rail,clock:()=>NOW});
  const asked=await loop.wake({kind:'event',request:built.request});
  assert.equal(asked.outcome,'awaiting_confirmation','the loop gate asks first (SAVE/PAY transfer tier)');
  assert.match(asked.message,/\$810\.00 to savings/);
  assert.equal(writes.length,0,'nothing moves before the yes');assert.deepEqual(balances,{chk:500000,sav:128000});
  const done=await loop.wake({kind:'confirmation',confirmation_id:asked.confirmation_id,approved:true});
  assert.equal(done.outcome,'confirmed');assert.equal(writes.length,1);
  assert.deepEqual(balances,{chk:500000-81000,sav:128000+81000},'both balances moved by exactly the swept amount');
  const again=await loop.wake({kind:'event',request:built.request});
  assert.equal(again.outcome,'already_done');assert.equal(writes.length,1);assert.deepEqual(balances,{chk:419000,sav:209000},'the same sweep never moves twice');
});
