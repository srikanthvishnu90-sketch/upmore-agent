// Instinct spec doc 07: the save engine. Detect, quantify, act, verify, book; estimates never mix with verified deltas.
// Check: node --test tests/save.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','36-agent-workflows.js','41-agent-recovery.js','49-agent-save.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.S=AgentSave;',ctx);
const S=ctx.S;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const TODAY='2026-10-10';
const MONTHS=['2026-06','2026-07','2026-08','2026-09'];

// The doc 07 synthetic household: 12 subscriptions, 3 negotiable bills, 4 fee events, idle cash, two APR debts, plus controls.
function household(){
  const tx=[];let n=0;
  const add=(acct,date,cents,merchant,extra)=>tx.push(Object.assign({id:'h'+(++n),account_id:acct,posted_at:date,amount:cents/100,merchant_raw:merchant,is_pending:false,is_transfer:false},extra||{}));
  const subs=[['NETFLIX.COM',1549],['HULU',1799],['SPOTIFY USA',1199],['APPLE.COM/BILL APPLE MUSIC',1099],['GOOGLE *ONE',299],['DROPBOX',1199],['ADOBE *CREATIVE',5999],['MICROSOFT*365',999],['PLANET FIT',2499],['NYTIMES',1700],['PELOTON',4400],['HEADSPACE',1299]];
  for(const m of MONTHS){
    add('chk',m+'-01',325000,'PAYROLL DIRECT DEP');add('chk',m+'-15',325000,'PAYROLL DIRECT DEP');
    add('chk',m+'-02',-180000,'RENT PAYMENT PROPERTY MGMT');
    for(const [name,amt] of subs)add('cc1',m+'-05',name==='NETFLIX.COM'&&m==='2026-09'?-1799:-amt,name);
    add('chk',m+'-18',-8999,'COMCAST XFINITY');
    add('chk',m+'-06',-13000,'ONLINE TRANSFER TO SAV',{is_transfer:true});      // control: own transfer
    [475,525,610,450,580,495].forEach((c,i)=>add('cc1',m+'-'+String(3+i*4).padStart(2,'0'),-c,'STARBUCKS')); // control: repeats, not a subscription
    add('cc1',m+'-11',-[6240,7115,5890,6630][MONTHS.indexOf(m)],'TRADER JOE S');add('cc1',m+'-19',-[11875,9930,12410,10255][MONTHS.indexOf(m)],'KROGER'); // groceries vary; a fixed monthly amount would read as a subscription
  }
  add('chk','2026-08-28',-1200,'MONTHLY MAINTENANCE FEE');add('chk','2026-09-28',-1200,'MONTHLY MAINTENANCE FEE'); // recurring fee
  add('chk','2026-09-14',-3500,'OVERDRAFT ITEM FEE');add('chk','2026-09-20',-350,'NON-NETWORK ATM FEE');          // one-time fees
  add('chk','2026-07-20',3500,'OVERDRAFT FEE REFUND');            // control: a reversal credit, not a fee
  add('cc1','2026-09-22',-4299,'TARGET');add('cc1','2026-09-25',-4299,'TARGET'); // control: two real purchases
  return {today:TODAY,transactions:tx,
    accounts:[{id:'chk',kind:'checking',balance_cents:2500000,apy_bps:1},{id:'sav',kind:'savings',balance_cents:400000,apy_bps:15},{id:'cc1',kind:'credit_card',balance_cents:0,apy_bps:0,apr_bps:2499}],
    bills:[{name:'Xfinity internet',amount_cents:8999,market_cents:5999},{name:'Mobile',amount_cents:9500,market_cents:7000},{name:'Gym',amount_cents:4999,market_cents:2999},{name:'Electric',amount_cents:11000,market_cents:11000},{name:'Water',amount_cents:4200,market_cents:4000}],
    debts:[{id:'ccA',balance_cents:520000,apr_bps:2499,min_payment_cents:15000},{id:'ccB',balance_cents:310000,apr_bps:1899,min_payment_cents:9000},{id:'loan1',kind:'loan',balance_cents:2400000,apr_bps:650,min_payment_cents:27000,autopay:false}],
    extra_payment_cents:20000,reference_apy_bps:425};
}
const PLANTED={'duplicate_service:music':1099,'duplicate_service:cloud':299,'price_increase:NETFLIX.COM':250,'bill_above_market:Xfinity internet':3000,'bill_above_market:Mobile':2500,'bill_above_market:Gym':2000,
  'fee_recurring:monthly_maintenance':1200,'fee_refund:overdraft':0,'fee_refund:atm':0,'idle_cash:chk_to_hysa':4240,'avalanche_vs_snowball:extra_200':100,'autopay_discount:loan1':500};

test('every detector finds its target on the household and nothing fires on the control rows',()=>{
  const r=S.detect(household());
  const found=Object.fromEntries(r.opportunities.map(o=>[o.key,o.expected_monthly_cents]));
  assert.deepEqual(Object.keys(found).sort(),Object.keys(PLANTED).sort());
  for(const [k,v] of Object.entries(PLANTED))assert.equal(found[k],v,k);
  const byKey=Object.fromEntries(r.opportunities.map(o=>[o.key,o]));
  assert.equal(byKey['fee_refund:overdraft'].one_time_cents,3500);assert.equal(byKey['fee_refund:atm'].one_time_cents,350);
  assert.equal(r.inventory.length,12,'twelve subscriptions in the inventory');
  assert.ok(!r.inventory.some(i=>/starbucks|transfer|target|rent|fee|xfinity/i.test(i.merchant)));
  same(r.bills_recurring.map(b=>b.merchant),['COMCAST XFINITY','RENT PAYMENT PROPERTY MGMT']);
  assert.equal(r.run_rate_monthly_cents,r.inventory.reduce((s,i)=>s+i.monthly_cents,0));
  for(const o of r.opportunities){assert.ok(o.estimate===true&&o.confidence&&o.tier&&o.capability_id&&o.action&&o.evidence&&o.verify,o.key);assert.ok(Number.isInteger(o.expected_monthly_cents)&&o.expected_monthly_cents>=0);}
  assert.ok(/Estimates/.test(r.note));
  // Netflix and Hulu together are not a duplicate; Spotify and Apple Music are.
  assert.ok(!r.opportunities.some(o=>/duplicate_service:video/.test(o.key)));
  same(byKey['duplicate_service:music'].services.sort(),['APPLE.COM/BILL APPLE MUSIC','SPOTIFY USA']);
  assert.equal(byKey['idle_cash:chk_to_hysa'].excess_cents,1200000);
});

test('tiers and actions: cancellations are T3 minimum, rate and debt plans are T0 information, nothing auto-enrolls',()=>{
  const r=S.detect(household());const by=Object.fromEntries(r.opportunities.map(o=>[o.key,o]));
  for(const o of r.opportunities)if(o.action&&/cancel/.test(o.action.type))assert.equal(o.tier,'T3',o.key);
  assert.equal(by['idle_cash:chk_to_hysa'].tier,'T0');assert.equal(by['idle_cash:chk_to_hysa'].action.tier,'T3');
  assert.equal(by['avalanche_vs_snowball:extra_200'].tier,'T0');
  assert.equal(by['autopay_discount:loan1'].action.type,'enroll_autopay');assert.equal(by['autopay_discount:loan1'].tier,'T3');
  assert.ok(by['fee_refund:overdraft'].action.draft&&by['fee_refund:overdraft'].action.sent_by==='user');
});

test('verify reads the outcome back from later data for every play; failures say why',()=>{
  const h=household();const r=S.detect(h);const by=Object.fromEntries(r.opportunities.map(o=>[o.key,o]));
  const later=h.transactions.filter(t=>!(t.merchant_raw==='DROPBOX'&&t.posted_at>'2026-10-11'));
  // P1: a cancellation is verified only when the billing date passes with no charge
  const claim={merchant:'DROPBOX',created_at:'2026-10-11',expected_billing_date:'2026-11-05',billing_interval:'monthly'};
  assert.equal(S.verify(by['duplicate_service:cloud'],{cancelClaim:claim,transactions:later,today:'2026-11-06',dataThrough:'2026-11-06'}).verified,false,'too early');
  const v1=S.verify(by['duplicate_service:cloud'],{cancelClaim:claim,transactions:later,today:'2026-11-09',dataThrough:'2026-11-09',cancelled_monthly_cents:1199});
  assert.equal(v1.verified,true);assert.equal(v1.verified_monthly_cents,1199,'the cancelled service, not the estimate');
  assert.equal(S.verify(by['duplicate_service:cloud'],{transactions:later,today:'2026-11-09'}).verified,false);
  // P2: next bill lower
  assert.equal(S.verify(by['bill_above_market:Xfinity internet'],{bills:[{name:'Xfinity internet',amount_cents:5999}]}).verified_monthly_cents,3000);
  assert.equal(S.verify(by['bill_above_market:Xfinity internet'],{bills:[{name:'Xfinity internet',amount_cents:8999}]}).verified,false);
  // P3: a one-time fee is recovered when the credit posts; a recurring fee is stopped when a month passes without it
  const credit=h.transactions.concat([{id:'c1',account_id:'chk',posted_at:'2026-10-20',amount:35,merchant_raw:'OVERDRAFT FEE REFUND'}]);
  assert.equal(S.verify(by['fee_refund:overdraft'],{requestSentOn:'2026-10-12',transactions:h.transactions}).verified,false);
  assert.equal(S.verify(by['fee_refund:overdraft'],{requestSentOn:'2026-10-12',transactions:credit}).verified_one_time_cents,3500);
  assert.equal(S.verify(by['fee_recurring:monthly_maintenance'],{requestSentOn:'2026-10-12',today:'2026-11-01',transactions:h.transactions}).verified,false,'a month has not passed');
  assert.equal(S.verify(by['fee_recurring:monthly_maintenance'],{requestSentOn:'2026-10-12',today:'2026-11-20',transactions:h.transactions}).verified,true);
  const feeAgain=h.transactions.concat([{id:'f9',account_id:'chk',posted_at:'2026-10-28',amount:-12,merchant_raw:'MONTHLY MAINTENANCE FEE'}]);
  assert.match(S.verify(by['fee_recurring:monthly_maintenance'],{requestSentOn:'2026-10-12',today:'2026-11-20',transactions:feeAgain}).reason,/posted again on 2026-10-28/);
  // P4: the transfer posted and the receiving account pays the reference rate
  const v4=S.verify(by['idle_cash:chk_to_hysa'],{accounts:[{id:'chk',kind:'checking',balance_cents:1300000,apy_bps:1},{id:'hysa',kind:'hysa',balance_cents:1600000,apy_bps:425}]});
  assert.equal(v4.verified,true);assert.equal(v4.verified_monthly_cents,4240);
  assert.equal(S.verify(by['idle_cash:chk_to_hysa'],{accounts:[{id:'chk',kind:'checking',balance_cents:1300000,apy_bps:1},{id:'sav',kind:'savings',balance_cents:1600000,apy_bps:15}]}).verified,false,'moved to a low-rate account is not the saving');
  // P7 and P8
  assert.equal(S.verify(by['avalanche_vs_snowball:extra_200'],{before_debts:h.debts,debts:[{id:'ccA',balance_cents:480000}]}).verified,true);
  assert.equal(S.verify(by['avalanche_vs_snowball:extra_200'],{before_debts:h.debts,debts:[{id:'ccA',balance_cents:510000}]}).verified,false);
  assert.equal(S.verify(by['autopay_discount:loan1'],{before_debts:h.debts,debts:[{id:'loan1',apr_bps:625,autopay:true}]}).verified,true);
  assert.equal(S.verify(by['autopay_discount:loan1'],{before_debts:h.debts,debts:[{id:'loan1',apr_bps:650,autopay:true}]}).verified,false);
});

test('the ledger books only verified deltas, and the motivating message is computed from verified entries alone',()=>{
  const h=household();const r=S.detect(h);const by=Object.fromEntries(r.opportunities.map(o=>[o.key,o]));
  const L=S.ledger();
  assert.throws(()=>L.book(by['idle_cash:chk_to_hysa'],{verified:false,reason:'nothing moved'},'2026-10-12'),/verified deltas only/);
  assert.throws(()=>L.book(by['idle_cash:chk_to_hysa'],null,'2026-10-12'));
  L.book(by['bill_above_market:Xfinity internet'],S.verify(by['bill_above_market:Xfinity internet'],{bills:[{name:'Xfinity internet',amount_cents:5999}]}),'2026-10-20');
  L.book(by['idle_cash:chk_to_hysa'],S.verify(by['idle_cash:chk_to_hysa'],{accounts:[{id:'chk',kind:'checking',balance_cents:1300000,apy_bps:1},{id:'hysa',kind:'hysa',balance_cents:1600000,apy_bps:425}]}),'2026-11-03');
  const credit=h.transactions.concat([{id:'c1',account_id:'chk',posted_at:'2026-10-20',amount:35,merchant_raw:'OVERDRAFT FEE REFUND'}]);
  L.book(by['fee_refund:overdraft'],S.verify(by['fee_refund:overdraft'],{requestSentOn:'2026-10-12',transactions:credit}),'2026-10-20');
  assert.equal(L.entries.length,3);
  same(L.summary('2026-10-31'),{verified_monthly_cents:3000,verified_one_time_cents:3500,count:2});
  same(L.summary(),{verified_monthly_cents:7240,verified_one_time_cents:3500,count:3});
  assert.equal(L.sinceDelta('2026-09-30','2026-11-30'),7240);
  assert.equal(L.message('2026-09-30','2026-11-30'),"You're saving $72.40 a month more than in 2026-09, verified.");
  assert.equal(L.message('2026-11-30','2026-11-30'),null);
  // booking the same verification twice is idempotent
  L.book(by['bill_above_market:Xfinity internet'],{verified:true,verified_monthly_cents:3000},'2026-10-20');assert.equal(L.entries.length,3);
});

test('the queue ranks verified dollars first, then estimates by confidence, and every item states the reason the user cares',()=>{
  const h=household();const r=S.detect(h);const by=Object.fromEntries(r.opportunities.map(o=>[o.key,o]));
  const L=S.ledger();L.book(by['bill_above_market:Gym'],{verified:true,verified_monthly_cents:1500},'2026-10-20');
  const q=S.rank(r.opportunities,L);
  assert.equal(q[0].key,'bill_above_market:Gym');assert.equal(q[0].verified,true);assert.equal(q[0].estimate,false);assert.match(q[0].reason,/verified: \$15\.00 a month/);
  for(let i=1;i<q.length;i++)assert.ok(q[i-1].score>=q[i].score);
  assert.equal(q[1].key,'idle_cash:chk_to_hysa');assert.match(q[1].reason,/estimated \$42\.40 a month \(high confidence\)/);
  assert.ok(q.find(o=>o.key==='fee_refund:atm').score<q.find(o=>o.key==='fee_refund:overdraft').score,'low confidence ranks below medium at similar dollars');
  for(const o of q)assert.ok(o.reason&&o.estimate===!o.verified);
});

test('on the 40 synthetic lives every planted play is found with its labeled value and no play fires where it was not planted',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(root,'evals/data/labeled/savings-lives.json'),'utf8'));
  let found=0,controls=0;
  for(const l of data.lives){
    const r=S.detect({today:l.today,transactions:l.transactions,accounts:l.accounts,bills:l.bills,debts:l.debts,extra_payment_cents:data.detector_inputs.extra_payment_cents,reference_apy_bps:data.detector_inputs.reference_apy_bps});
    const byPlay=k=>r.opportunities.filter(o=>o.play===k).map(o=>o.key).sort();
    const labeled=k=>l.opportunities.filter(o=>o.play===k).map(o=>o.key).sort();
    for(const play of ['P1_subscription','P2_negotiation','P3_fee','P4_rate','P7_debt','P8_structural']){
      same(byPlay(play),labeled(play),`${l.id} ${play}`);
      for(const lab of l.opportunities.filter(o=>o.play===play)){
        const o=r.opportunities.find(x=>x.key===lab.key);found++;
        if(lab.one_time_cents)assert.equal(o.one_time_cents,lab.one_time_cents,`${l.id} ${lab.key} one-time`);
        else assert.ok(Math.abs(o.expected_monthly_cents-lab.expected_monthly_cents)<=1,`${l.id} ${lab.key}: ${o.expected_monthly_cents} vs ${lab.expected_monthly_cents}`);
      }
    }
    controls+=l.opportunities.filter(o=>o.play==='control').length;
    assert.ok(!r.inventory.some(i=>/starbucks/i.test(i.merchant)),`${l.id}: coffee is not a subscription`);
  }
  assert.ok(found>=100&&controls>=80,`found ${found}, controls ${controls}`);
});
