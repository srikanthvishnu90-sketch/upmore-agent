const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','47-save-engine.js','44-agent-earn.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.E=AgentEarnEngine;',ctx);
const E=ctx.E;
const same=(a,b,m)=>assert.equal(JSON.stringify(a),JSON.stringify(b),m);
const tx=(id,account_id,posted_at,amount,merchant_raw,extra)=>Object.assign({id,account_id,posted_at,amount,merchant_raw,is_pending:false,is_transfer:false},extra);

// The synthetic household: a bank bonus mid-requirements, an unclaimed property hit, an ESPP window, expiring points, a class action match.
function household(today){
  return {
    today,
    accounts:[{id:'chk-new',kind:'checking',balance_cents:160000,apy_bps:1},{id:'cc-visa',kind:'credit_card',balance_cents:0,apy_bps:0}],
    transactions:[
      tx('dd1','chk-new','2026-09-05',1250.00,'ACME CORP PAYROLL'),tx('dd2','chk-new','2026-09-19',1250.00,'ACME CORP PAYROLL'),
      tx('d1','chk-new','2026-09-06',-12.40,'STARBUCKS STORE'),tx('d2','chk-new','2026-09-08',-41.10,'TRADER JOE S'),tx('d3','chk-new','2026-09-11',-8.75,'CVS/PHARMACY'),
      tx('t1','chk-new','2026-09-07',-200.00,'ONLINE TRANSFER TO SAV',{is_transfer:true}),
      tx('p1','cc-visa','2026-06-14',-89.99,'FITBIT STORE'),tx('p2','cc-visa','2026-08-02',-15.49,'NETFLIX.COM'),
      tx('old','chk-new','2026-08-20',900.00,'ACME CORP PAYROLL'),
    ],
    offers:[{id:'bigbank-300',bank:'Big Bank',bonus_cents:30000,requirements:{direct_deposit_cents:250000,by:'2026-11-30',debit_count:5},early_closure_days:180,early_closure_fee_cents:30000,time_cost_minutes:40},
            {id:'credit-union-200',bank:'CU',bonus_cents:20000,requirements:{min_balance_cents:1500000,hold_days:90,by:'2026-12-15'},time_cost_minutes:30}],
    enrolled_bonuses:[{offer_id:'bigbank-300',account_id:'chk-new',opened_on:'2026-09-01'}],
    payroll:{salary_cents:9000000,match:{cap_pct:5,employee_contrib_pct:3,match_pct:100},espp:{enrolled:false,discount_pct:15,max_contrib_pct:10,window_open:'2026-10-01',window_close:'2026-10-18'},hsa_seed_cents:50000,hsa_enrolled:false,stipends:[{name:'Wellness stipend',cents:30000,used:false,per:'year'}]},
    user:{names:['Jordan Q Example','J Example'],past_addresses:['12 Elm St Springfield','400 Pine Ave Boise']},
    unclaimed_hits:[{id:'u1',state:'IL',name_on_record:'JORDAN Q EXAMPLE',address_on_record:'12 ELM ST, SPRINGFIELD IL',amount_cents:18420,claim_url:'https://example.invalid/claim'},
                    {id:'u2',state:'TX',name_on_record:'JORDAN EXAMPLE',address_on_record:'9 OAK RD, DALLAS TX',amount_cents:250000}],
    settlements:[{id:'fitbit-2026',name:'Fitbit battery settlement',merchant_keys:['fitbit store'],window_from:'2026-01-01',window_to:'2026-07-01',deadline:'2026-10-05',payout_cents_est:4500,time_cost_minutes:8},
                 {id:'noshow',name:'Unrelated',merchant_keys:['acme widgets'],window_from:'2026-01-01',window_to:'2026-12-31',deadline:'2026-12-31',payout_cents_est:9900}],
    points:[{program:'Chase Ultimate Rewards',balance:42000,cents_per_point_real:1.25,cents_per_point_marketing:2.0},{program:'Hotel Points',balance:12000,cents_per_point_real:0.5,cents_per_point_marketing:1.0,expires_on:'2026-11-10'}],
    referrals:[{program:'Big Bank refer-a-friend',payout_cents:5000,link:'https://example.invalid/ref'}],
    earn_apps:[{app:'Freecash',offer:'Play Coin Quest to level 30',payout_cents:1200,est_minutes:180,cashout_fee_cents:50,balance_cents:2600,cashout_threshold_cents:2500},{app:'Propel',offer:'Survey',payout_cents:150,est_minutes:12,cashout_fee_cents:0,balance_cents:900,cashout_threshold_cents:2500}],
  };
}

test('bank bonus requirement tracker follows the account transactions and the deadline',()=>{
  const c=E.detect(household('2026-09-28')).find(c=>c.key==='bonus:bigbank-300');
  assert.equal(c.subtype,'in_progress');assert.equal(c.days_left,63);
  const dd=c.checks.find(x=>x.requirement==='direct_deposit'),db=c.checks.find(x=>x.requirement==='debit_count');
  assert.equal(dd.have_cents,250000,'only deposits after opening count; the August payroll is excluded');assert.equal(dd.met,true);
  assert.equal(db.have,3,'transfers are not debit purchases');assert.equal(db.met,false);
  assert.equal(c.effective_hourly_cents,45000);assert.equal(c.early_closure.ends_on,'2027-02-28');assert.equal(c.bonus_posted,false);
  const later={...household('2026-10-20')};later.transactions.push(tx('d4','chk-new','2026-10-02',-5,'DUNKIN'),tx('d5','chk-new','2026-10-03',-9,'TARGET'),tx('b','chk-new','2026-10-18',300,'BIG BANK BONUS CREDIT'));
  const done=E.detect(later).find(c=>c.key==='bonus:bigbank-300');
  assert.equal(done.subtype,'bonus_posted');assert.equal(done.verification.verified_cents,30000);assert.equal(done.posted_txn,'b');
  const avail=E.detect(household('2026-09-28')).find(c=>c.key==='offer:credit-union-200');
  assert.equal(avail.subtype,'available');assert.equal(avail.action.tier,'T3');assert.match(avail.action.describe,/never applies for you/);
});

test('employer benefits audit quantifies match left on the table, the ESPP discount, the HSA seed and unused stipends',()=>{
  const out=E.detect(household('2026-09-28')).filter(c=>c.play==='E2_benefits');
  const match=out.find(c=>c.key==='benefit:401k_match');assert.equal(match.expected_cents,180000,'2% of $90k at 100% match');
  const espp=out.find(c=>c.key==='benefit:espp');assert.equal(espp.expected_cents,135000,'10% of salary at a 15% discount');assert.equal(espp.window.closes,'2026-10-18');
  assert.equal(out.find(c=>c.key==='benefit:hsa_seed').expected_cents,50000);assert.equal(out.find(c=>c.key==='benefit:stipend:wellness_stipend').expected_cents,30000);
  for(const c of out)assert.ok(c.action.tier!=='T4'&&c.action.tier!=='T5','no auto-enrollment');
  const enrolled=household('2026-09-28');enrolled.payroll.espp.enrolled=true;enrolled.payroll.match.employee_contrib_pct=6;enrolled.payroll.hsa_enrolled=true;enrolled.payroll.stipends[0].used=true;
  same(E.detect(enrolled).filter(c=>c.play==='E2_benefits'),[],'nothing left on the table');
});

test('found money: unclaimed property is money only after name AND address verify; class actions match purchase history',()=>{
  const out=E.detect(household('2026-09-28')).filter(c=>c.play==='E3_found_money');
  const good=out.find(c=>c.key==='unclaimed:IL:u1'),bad=out.find(c=>c.key==='unclaimed:TX:u2');
  assert.equal(good.subtype,'unclaimed_property');assert.equal(good.expected_cents,18420);assert.equal(good.action.tier,'T3');
  assert.equal(bad.subtype,'needs_verification');assert.equal(bad.surfaced,false);assert.equal(bad.expected_cents,0);assert.equal(bad.verification.address,false);
  const settle=out.find(c=>c.key==='settlement:fitbit-2026');assert.ok(settle);assert.equal(settle.evidence[0].id,'p1');assert.equal(settle.days_left,7);
  assert.equal(out.find(c=>c.key==='settlement:noshow'),undefined,'no purchase, no claim');
});

test('rewards are valued at real rates with the marketing overstatement shown; expiring balances are flagged',()=>{
  const out=E.detect(household('2026-09-28')).filter(c=>c.play==='E4_rewards');
  const ur=out.find(c=>c.key==='points:chase_ultimate_rewards');assert.equal(ur.real_value_cents,52500);assert.equal(ur.overstated_by_cents,31500);assert.equal(ur.subtype,'valuation');
  const hotel=out.find(c=>c.key==='points:hotel_points');assert.equal(hotel.subtype,'expiring');assert.equal(hotel.days_left,43);assert.equal(hotel.action.capability_id,'EARN-012');
});

test('earn apps show the effective hourly rate after fees and alert only when a payout unlocks; referrals never contact anyone',()=>{
  const out=E.detect(household('2026-09-28'));
  const game=out.find(c=>c.key==='earnapp:freecash:play_coin_quest_to_level_30');assert.equal(game.effective_hourly_cents,383);assert.match(game.honest_note,/\$3\.83\/hour after fees/);
  const survey=out.find(c=>c.key==='earnapp:propel:survey');assert.equal(survey.effective_hourly_cents,750);
  assert.ok(out.find(c=>c.key==='earnapp:freecash:cashout'&&c.subtype==='payout_unlocked'&&c.expected_cents===2550));
  assert.equal(out.find(c=>c.key==='earnapp:propel:cashout'),undefined,'below threshold: no nag');
  const ref=out.find(c=>c.play==='E5_referrals');assert.equal(ref.action.tier,'T3');assert.match(ref.sharing,/user-initiated/);
  for(const c of out.filter(c=>c.expected_cents>0))assert.ok(Number.isInteger(c.time_cost_minutes),`${c.key} carries a time cost`);
});

test('deadline alerts fire at 7 days and 1 day, and 30 days before an early-closure window ends',()=>{
  const c7=E.detect(household('2026-09-28'));
  const a7=E.deadlineAlerts(c7,'2026-09-28');
  assert.ok(a7.some(a=>a.key==='deadline:settlement:fitbit-2026:7d'&&!a.urgent));
  const a1=E.deadlineAlerts(E.detect(household('2026-10-04')),'2026-10-04');
  assert.ok(a1.some(a=>a.key==='deadline:settlement:fitbit-2026:1d'&&a.urgent));
  const a30=E.deadlineAlerts(E.detect(household('2027-01-29')),'2027-01-29');
  assert.ok(a30.some(a=>a.key==='closure:bonus:bigbank-300:30d'&&/\$300\.00/.test(a.text)));
  same(E.deadlineAlerts(E.detect(household('2026-09-29')),'2026-09-29').filter(a=>a.key.startsWith('deadline:settlement')),[],'no alert on day 6');
  for(const a of [...a7,...a1,...a30])assert.ok(a.reason,'every alert states its reason');
});

test('earnings ledger keeps expected and verified apart and reports minutes next to dollars',()=>{
  const out=E.detect(household('2026-09-28'));const L=E.ledger({});
  const u=L.book(out.find(c=>c.key==='unclaimed:IL:u1'),'2026-09-28'),s=L.book(out.find(c=>c.key==='settlement:fitbit-2026'),'2026-09-28');
  assert.equal(L.book(out.find(c=>c.key==='unclaimed:IL:u1')).id,u.id);
  assert.equal(L.summary().verified_cents,0);assert.equal(L.summary().expected_unverified_cents,18420+4500);
  assert.throws(()=>L.verify(u.id,184.2),/observed integer/);
  L.verify(u.id,18420,'2026-10-20',{txn:'state-check'});L.verify(s.id,0,'2026-11-01');
  const sum=L.summary('2026-10-01');assert.equal(sum.verified_cents,18420);assert.equal(sum.minutes,20);assert.match(sum.message,/\$184\.20 found this period, about 20 minutes/);
  assert.equal(L.state.entries.find(e=>e.id===s.id).status,'did_not_pay');assert.equal(L.summary().expected_unverified_cents,0);
  assert.throws(()=>E.detect({transactions:[]}),/needs transactions and today/);
});
