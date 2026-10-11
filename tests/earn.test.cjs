// Instinct spec doc 08: the earn engine. Detect, quantify with time cost, act at T3 minimum, verify the credit, book.
// Check: node --test tests/earn.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','36-agent-workflows.js','41-agent-recovery.js','49-agent-save.js','44-agent-earn.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.E=AgentEarn;',ctx);
const E=ctx.E;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const TODAY='2026-10-10';

// The doc 08 fixture: the household extended with a bank bonus mid-requirements, an unclaimed property search due, an ESPP window, expiring points, a class action match, a recall, a referral and an earn app, plus controls.
function fixture(){
  const tx=[];let n=0;
  const add=(acct,date,cents,merchant,extra)=>tx.push(Object.assign({id:'e'+(++n),account_id:acct,posted_at:date,amount:cents/100,merchant_raw:merchant,is_pending:false,is_transfer:false},extra||{}));
  for(const m of ['2026-07','2026-08','2026-09']){add('chk',m+'-01',325000,'PAYROLL DIRECT DEP');add('chk',m+'-15',325000,'PAYROLL DIRECT DEP');add('cc1',m+'-11',-6240,'KROGER');add('cc1',m+'-19',-11875,'COSTCO WHSE');}
  // the bonus account, opened Sep 20: one $1,000 direct deposit of the $2,000 required, 6 of 10 debits
  add('bonus','2026-09-25',100000,'ACH DIRECT DEP PAYROLL');
  for(let i=0;i<6;i++)add('bonus','2026-10-0'+(1+i),-(400+i*25),'DUNKIN #221');
  add('bonus','2026-10-03',-350,'MONTHLY SERVICE FEE'); // control: a fee is not a qualifying debit
  add('bonus','2026-10-04',-5000,'ONLINE TRANSFER TO SAV',{is_transfer:true}); // control
  // a second bonus whose requirements are met and whose credit has posted
  add('bonus2','2026-08-02',300000,'PAYROLL DIRECT DEP');add('bonus2','2026-09-15',30000,'NEW ACCOUNT BONUS');
  add('cc1','2026-09-28',-12999,'PELOTON');
  return {today:TODAY,transactions:tx,statesLived:['TX','IL'],lastSearched:{IL:'2026-09-01'},
    bonuses:[{id:'b1',bank:'Example Bank',account_id:'bonus',amount_cents:30000,opened_on:'2026-09-20',requirements:[{kind:'direct_deposit',amount_cents:200000,by:'2026-10-17'},{kind:'debit_count',count:10,by:'2026-11-19'}],early_closure_until:'2027-03-20',time_minutes:30},
             {id:'b2',bank:'Other Bank',account_id:'bonus2',amount_cents:30000,opened_on:'2026-08-01',requirements:[{kind:'direct_deposit',amount_cents:250000,by:'2026-09-30'}],payout_expected_by:'2026-09-30'}],
    benefits:{salary_cents:9000000,contribution_pct:3,match:{up_to_pct:6,rate_pct:50},espp:{enrolled:false,discount_pct:15,max_pct:10,window_closes:'2026-10-17'},hsa_seed_cents:75000,hsa_enrolled:false,stipends:[{name:'Wellness',amount_cents:50000,used_cents:12000,expires_on:'2026-12-31'}]},
    settlements:[{id:'s1',name:'Pork price-fixing settlement',claim_deadline:'2026-10-30',eligibility_merchants:['Kroger','Costco'],eligibility_states:['TX','CA'],proof_required:'none',typical_payout_cents:2500,status:'open'},
                 {id:'s2',name:'Dairy settlement (CA only)',claim_deadline:'2026-11-30',eligibility_merchants:['Kroger'],eligibility_states:['CA'],status:'open'}, // control: wrong state
                 {id:'s3',name:'Old settlement',claim_deadline:'2026-09-01',eligibility_merchants:['Kroger'],eligibility_states:[],status:'open'}], // control: deadline passed
    recalls:[{id:'r1',product:'Peloton Tread',merchant:'Peloton',refund_cents:12999,purchased_after:'2026-01-01',deadline:'2026-10-11'},{id:'r2',product:'Air fryer',merchant:'Best Buy',refund_cents:8999}], // r2 control: no purchase
    rewards:[{program:'Chase Ultimate Rewards',points:40000,real_cents_per_point_x100:125,marketing_cents_per_point_x100:200,expires_on:'2026-11-09',transfer_partners:[{partner:'Hyatt',cents_per_point_x100:170}]},
             {program:'Amex Membership Rewards',points:12000,real_cents_per_point_x100:60,marketing_cents_per_point_x100:100,transfer_partners:[{partner:'ANA',cents_per_point_x100:150}]},
             {program:'Store points',points:900,real_cents_per_point_x100:100}],
    referrals:[{account:'Example Bank',payout_cents:5000,link:'https://example.test/r/abc',referred:[{name:'Sam',status:'signed_up',signed_up_on:'2026-10-01',payout_expected_by:'2026-11-01'},{name:'Lee',status:'paid',signed_up_on:'2026-07-10'}]}],
    earn_apps:[{name:'Freecash',payout_cents:5000,cashout_fee_cents:200,minutes_required:720,earned_cents:2200,threshold_cents:2000},{name:'Prolific',payout_cents:1200,cashout_fee_cents:0,minutes_required:60,earned_cents:600,threshold_cents:1000}],
    accounts:[{id:'chk',kind:'checking',balance_cents:2500000,apy_bps:1},{id:'sav',kind:'hysa',balance_cents:100000,apy_bps:425}],reference_apy_bps:425};
}

test('every detector finds its target on the fixture and controls stay silent',()=>{
  const r=E.detect(fixture());const by=Object.fromEntries(r.opportunities.map(o=>[o.key,o]));
  same(Object.keys(by).sort(),['bank_bonus:b1','bank_bonus:b2','earn_app:freecash','earn_app:prolific','employer_match_gap','espp_not_enrolled','hsa_seed_unclaimed','idle_cash:chk_to_hysa','points_balance:store points','points_expiring:chase ultimate rewards','recall:r1','referral:example bank','settlement:s1','stipend_unused:wellness','transfer_sweet_spot:amex membership rewards','unclaimed_search:TX:first'].sort()); // IL was searched 2026-09-01, so its next search is not due until December
  // E1: requirement tracker follows the account's own transactions; fees and transfers do not count as debits
  const b1=by['bank_bonus:b1'];assert.equal(b1.status,'in_progress');
  same(b1.requirements.map(q=>[q.kind,q.met,q.have_cents!==undefined?q.have_cents:q.have]),[['direct_deposit',false,100000],['debit_count',false,6]]);
  assert.equal(b1.effective_return_bps,1500,'$300 on $2,000 required');assert.equal(b1.expected_cents,30000);
  assert.equal(by['bank_bonus:b2'].status,'paid');assert.equal(by['bank_bonus:b2'].expected_cents,0);assert.equal(by['bank_bonus:b2'].action,null);
  // E2: dollars left on the table are arithmetic on stated terms
  assert.equal(by['employer_match_gap'].expected_cents,135000,'90k x 3% band x 50%');
  assert.equal(by['espp_not_enrolled'].expected_cents,135000,'90k x 10% x 15%');assert.match(by['espp_not_enrolled'].title,/worth about \$1,350\.00 a year and you're not enrolled/);
  assert.equal(by['hsa_seed_unclaimed'].expected_cents,75000);assert.equal(by['stipend_unused:wellness'].expected_cents,38000);
  // E3: found money matches the user's own merchants and states; the wrong state and the past deadline do not match; the recall matches the purchase
  assert.equal(by['settlement:s1'].evidence.rows.length,5);same(by['settlement:s1'].evidence.computed.merchants_matched,['kroger','costco']);
  assert.ok(!by['settlement:s2']&&!by['settlement:s3']&&!by['recall:r2']);
  assert.equal(by['recall:r1'].expected_cents,12999);assert.equal(by['recall:r1'].tier,'T3');
  assert.equal(by['unclaimed_search:TX:first'].tier,'T0');assert.match(by['unclaimed_search:TX:first'].action.note,/free/);
  // E4: points at the real rate, never the marketing rate; a transfer partner above cash is a sweet spot
  const ur=by['points_expiring:chase ultimate rewards'];assert.equal(ur.real_cents,50000);assert.equal(ur.marketing_cents,80000);assert.equal(ur.expected_cents,50000);assert.match(ur.action.note,/Hyatt values them at \$680\.00/);
  assert.equal(by['transfer_sweet_spot:amex membership rewards'].expected_cents,10800,'18,000 at ANA minus 7,200 cash');
  assert.match(by['points_balance:store points'].title,/\$9\.00/);
  // E5 and E6: referral payout pending; effective hourly after fees; the threshold ping
  assert.equal(by['referral:example bank'].expected_cents,5000);assert.equal(by['referral:example bank'].capability_id,'EARN-004');assert.match(by['referral:example bank'].action.note,/User-initiated only/);
  assert.equal(by['earn_app:freecash'].effective_hourly_cents,400,'$48 net over 12 hours');assert.equal(by['earn_app:freecash'].threshold_reached,true);assert.equal(by['earn_app:freecash'].tier,'T1');
  assert.equal(by['earn_app:prolific'].effective_hourly_cents,1200);assert.equal(by['earn_app:prolific'].threshold_reached,false);assert.equal(by['earn_app:prolific'].action,null);
  // E7 shares the rate module with the save engine
  assert.equal(by['idle_cash:chk_to_hysa'].shared_with,'P4_rate');assert.equal(by['idle_cash:chk_to_hysa'].expected_monthly_cents,3533,'payroll into the bonus accounts counts as income too: median month $7,500, buffer $15,000, excess $10,000 at 4.24 points');
  for(const o of r.opportunities){assert.ok(Number.isInteger(o.time_minutes)&&o.time_minutes>=0,o.key);assert.ok(o.estimate===true&&o.confidence&&o.tier&&o.capability_id&&o.evidence&&o.verify,o.key);assert.ok(o.tier!=='T4'&&o.tier!=='T5','no autonomous earn action');}
  assert.ok(/time cost/.test(r.note));
});

test('deadlines: 7-day and 1-day hard alerts, missed ones named, and the early-closure window 30 days ahead',()=>{
  const r=E.detect(fixture());
  const d=Object.fromEntries(r.deadlines.map(x=>[x.what,x]));
  assert.equal(d['Example Bank bonus: direct deposit'].days_left,7);assert.equal(d['Example Bank bonus: direct deposit'].fires_today,true);
  same(d['Example Bank bonus: direct deposit'].alert_days,['2026-10-10','2026-10-16']);
  assert.equal(d['ESPP enrollment window closes'].fires_today,true);
  assert.equal(d['Peloton Tread recall refund deadline'].days_left,1);assert.equal(d['Peloton Tread recall refund deadline'].fires_today,true);
  assert.equal(d['Pork price-fixing settlement claim deadline'].days_left,20);assert.equal(d['Pork price-fixing settlement claim deadline'].fires_today,false);
  assert.equal(d['Example Bank: keep the account open (early-closure fee)'].on,'2027-02-18');
  assert.equal(d['Chase Ultimate Rewards points expire'].days_left,30);
  assert.equal(r.deadlines[0].days_left,1,'soonest first');
  const late=E.deadlines([{key:'x',deadlines:[{what:'gone',on:'2026-10-01'}]}],TODAY);assert.equal(late[0].status,'missed');assert.equal(late[0].fires_today,false);
});

test('verify finds the credit itself; the ledger books verified credits only and reports dollars with their time cost',()=>{
  const f=fixture();const r=E.detect(f);const by=Object.fromEntries(r.opportunities.map(o=>[o.key,o]));
  const later=f.transactions.concat([{id:'v1',account_id:'bonus',posted_at:'2026-11-20',amount:300,merchant_raw:'NEW ACCOUNT BONUS'},{id:'v2',account_id:'chk',posted_at:'2026-12-02',amount:25,merchant_raw:'PORK SETTLEMENT CLAIMS ADMIN'},{id:'v3',account_id:'chk',posted_at:'2026-10-20',amount:129.99,merchant_raw:'PELOTON RECALL REFUND'},{id:'v4',account_id:'chk',posted_at:'2026-11-03',amount:50,merchant_raw:'EXAMPLE BANK REFERRAL BONUS'},{id:'v5',account_id:'chk',posted_at:'2026-10-12',amount:20,merchant_raw:'FREECASH PAYOUT'}]);
  assert.equal(E.verify(by['bank_bonus:b1'],{transactions:f.transactions,since:'2026-09-20'}).verified,false);
  assert.equal(E.verify(by['bank_bonus:b1'],{transactions:later,since:'2026-09-20'}).verified_cents,30000);
  assert.equal(E.verify(by['settlement:s1'],{transactions:later,since:'2026-10-15'}).verified_cents,2500);
  assert.equal(E.verify(by['recall:r1'],{transactions:later,since:'2026-10-11'}).verified_cents,12999);
  assert.equal(E.verify(by['referral:example bank'],{transactions:later,since:'2026-10-01'}).verified_cents,5000);
  assert.equal(E.verify(by['earn_app:freecash'],{transactions:later,since:'2026-10-11'}).verified_cents,2000);
  assert.equal(E.verify(by['employer_match_gap'],{benefits:{contribution_pct:6}}).verified,true);
  assert.equal(E.verify(by['employer_match_gap'],{benefits:{contribution_pct:3}}).verified,false);
  assert.equal(E.verify(by['points_expiring:chase ultimate rewards'],{redeemed_cents:50000}).verified_cents,50000);
  assert.equal(E.verify(by['points_expiring:chase ultimate rewards'],{}).verified,false);
  const L=E.ledger();
  assert.throws(()=>L.book(by['settlement:s1'],{verified:false,reason:'nothing yet'},'2026-11-01'),/verified credits only/);
  L.book(by['recall:r1'],E.verify(by['recall:r1'],{transactions:later,since:'2026-10-11'}),'2026-10-20');
  L.book(by['earn_app:freecash'],E.verify(by['earn_app:freecash'],{transactions:later,since:'2026-10-11'}),'2026-10-12');
  L.book(by['bank_bonus:b1'],E.verify(by['bank_bonus:b1'],{transactions:later,since:'2026-09-20'}),'2026-11-20');
  same(L.summary('2026-10-01','2026-10-31'),{verified_cents:14999,time_minutes:25,count:2});
  assert.equal(L.message('2026-10-01','2026-10-31'),'$149.99 found since 2026-10-01, about 25 minutes of your actions, verified.');
  assert.equal(L.summary().verified_cents,44999);assert.equal(L.message('2027-01-01'),null);
  L.book(by['recall:r1'],{verified:true,verified_cents:12999},'2026-10-20');assert.equal(L.entries.length,3,'idempotent');
});

test('the queue ranks verified first, then dollars weighted by confidence and divided by time, so a $5 play that costs an hour sinks',()=>{
  const f=fixture();const r=E.detect(f);const by=Object.fromEntries(r.opportunities.map(o=>[o.key,o]));
  const L=E.ledger();L.book(by['recall:r1'],{verified:true,verified_cents:12999},'2026-10-20');
  const q=E.rank(r.opportunities,L);
  assert.equal(q[0].key,'recall:r1');assert.equal(q[0].verified,true);assert.match(q[0].reason,/verified: \$129\.99/);
  for(let i=1;i<q.length;i++)assert.ok(q[i-1].score>=q[i].score);
  const pos=k=>q.findIndex(o=>o.key===k);
  assert.ok(pos('employer_match_gap')<pos('earn_app:prolific'),'match gap outranks a low-rate side gig');
  assert.ok(pos('earn_app:freecash')<pos('earn_app:prolific'),'the threshold ping outranks an unreached one');
  assert.ok(pos('points_balance:store points')>pos('hsa_seed_unclaimed'));
  for(const o of q)assert.ok(o.reason&&o.estimate===!o.verified);
});

test('wrong-person protection: a settlement never matches on state alone or merchant alone, and unclaimed searches are per state lived',()=>{
  const f=fixture();
  const none=E.detect(Object.assign({},f,{transactions:f.transactions.filter(t=>!/KROGER|COSTCO/.test(t.merchant_raw))}));
  assert.ok(!none.opportunities.some(o=>o.key==='settlement:s1'),'merchants gone, no match');
  const otherState=E.detect(Object.assign({},f,{statesLived:['NY']}));
  assert.ok(!otherState.opportunities.some(o=>o.key==='settlement:s1'),'state not eligible, no match');
  same(otherState.opportunities.filter(o=>o.key.startsWith('unclaimed_search')).map(o=>o.key),['unclaimed_search:NY:first']);
});
