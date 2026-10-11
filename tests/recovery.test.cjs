const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['36-agent-workflows.js','41-agent-recovery.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.AgentRecovery=AgentRecovery;',ctx);
const R=ctx.AgentRecovery;
let n=0;
const tx=(o)=>Object.assign({account_id:'chk',provider_transaction_id:'t'+(++n),fact_hash:'h'+n,currency:'USD',presence:'observed',is_pending:false,merchant_key:null,merchant_raw:'',amount_cents:-100,posted_on:'2026-10-01'},o);
const scan=(rows,o)=>R.scan(rows,Object.assign({today:'2026-10-10'},o));

test('names common bank fees and ignores reversals and ordinary merchants',()=>{
  assert.equal(R.feeKind({merchant_raw:'OVERDRAFT ITEM FEE'}),'overdraft');
  assert.equal(R.feeKind({merchant_raw:'Insufficient Funds Fee'}),'nsf');
  assert.equal(R.feeKind({merchant_raw:'MONTHLY MAINTENANCE FEE'}),'monthly_maintenance');
  assert.equal(R.feeKind({merchant_raw:'Non-Network ATM Fee'}),'atm');
  assert.equal(R.feeKind({merchant_raw:'FOREIGN TRANSACTION FEE'}),'foreign_transaction');
  assert.equal(R.feeKind({merchant_raw:'LATE PAYMENT FEE'}),'late_payment');
  assert.equal(R.feeKind({merchant_raw:'OVERDRAFT FEE REFUND'}),null);
  assert.equal(R.feeKind({merchant_raw:'Starbucks'}),null);
  assert.equal(R.feeKind({merchant_raw:'ATMOSPHERE RESTAURANT'}),null);
});

test('an open fee is a candidate with an unsent, approval-gated draft, never recovered money',()=>{
  const fee=tx({merchant_raw:'OVERDRAFT FEE',amount_cents:-3500,posted_on:'2026-10-02'});
  const r=scan([fee],{institution:'Example Bank'});
  assert.equal(r.candidates.length,1);
  const c=r.candidates[0];
  assert.equal(c.kind,'bank_fee');assert.equal(c.fee_kind,'overdraft');assert.equal(c.status,'open');
  assert.equal(c.amount_cents,3500);assert.equal(c.recovered_cents,null);
  assert.equal(c.action.executes,false);assert.equal(c.action.requires_user_approval,true);assert.equal(c.action.sent_by,'user');
  assert.match(c.action.text,/Example Bank/);assert.match(c.action.text,/\$35\.00/);assert.match(c.action.text,new RegExp(fee.provider_transaction_id));
  assert.equal(r.open_candidate_cents,3500);assert.equal(r.verified_recovered_cents,0);
  assert.equal(c.evidence[0].fact_hash,fee.fact_hash);
});

test('a later observed credit is only an unverified refund lead on the same account',()=>{
  const fee=tx({merchant_raw:'OVERDRAFT FEE',amount_cents:-3500,posted_on:'2026-10-02'});
  const otherAccount=tx({account_id:'sav',merchant_raw:'OVERDRAFT FEE REFUND',amount_cents:3500,posted_on:'2026-10-03'});
  const before=tx({merchant_raw:'OVERDRAFT FEE REFUND',amount_cents:3500,posted_on:'2026-10-01'});
  const pendingCredit=tx({merchant_raw:'OVERDRAFT FEE REFUND',amount_cents:3500,posted_on:'2026-10-04',is_pending:true});
  let r=scan([fee,otherAccount,before,pendingCredit]);
  assert.equal(r.candidates[0].status,'open');assert.equal(r.verified_recovered_cents,0);
  const reversal=tx({merchant_raw:'OVERDRAFT FEE REFUND',amount_cents:3500,posted_on:'2026-10-05'});
  r=scan([fee,reversal]);
  assert.equal(r.candidates[0].status,'open');assert.equal(r.candidates[0].recovered_cents,null);
  assert.notEqual(r.candidates[0].action,null);assert.equal(r.candidates[0].reversal,null);
  assert.equal(r.candidates[0].possible_refund.transaction_id,reversal.provider_transaction_id);
  assert.equal(r.candidates[0].refund_linkage_status,'unverified');
  assert.equal(r.open_candidate_cents,3500);assert.equal(r.verified_recovered_cents,0);
});

test('one credit is suggested for at most one fee; another fee-kind credit is not a lead',()=>{
  const a=tx({merchant_raw:'OVERDRAFT FEE',amount_cents:-3500,posted_on:'2026-10-02'});
  const b=tx({merchant_raw:'OVERDRAFT FEE',amount_cents:-3500,posted_on:'2026-10-03'});
  const atmRefund=tx({merchant_raw:'ATM FEE REFUND',amount_cents:3500,posted_on:'2026-10-04'});
  const odRefund=tx({merchant_raw:'OVERDRAFT FEE REVERSAL',amount_cents:3500,posted_on:'2026-10-05'});
  const r=scan([a,b,atmRefund,odRefund]);
  assert.equal(r.candidates.map(c=>c.status).sort().join(),'open,open');
  assert.equal(r.candidates.filter(c=>c.possible_refund).length,1);
  assert.equal(r.verified_recovered_cents,0);assert.equal(r.open_candidate_cents,7000);
});

test('a credit larger than the fee or outside the window is not a suggested linkage',()=>{
  const fee=tx({merchant_raw:'MONTHLY SERVICE FEE',amount_cents:-1200,posted_on:'2026-07-01'});
  const big=tx({merchant_raw:'SERVICE FEE REFUND',amount_cents:5000,posted_on:'2026-07-02'});
  const late=tx({merchant_raw:'SERVICE FEE REFUND',amount_cents:1200,posted_on:'2026-09-15'});
  assert.equal(scan([fee,big,late]).candidates[0].status,'open');
  assert.equal(R.feeKind({merchant_raw:'SERVICE FEE'}),'monthly_maintenance');
  const exact=tx({merchant_raw:'SERVICE FEE REFUND',amount_cents:1200,posted_on:'2026-07-03'});
  assert.equal(scan([fee,exact]).candidates[0].status,'open');
  assert.equal(scan([fee,exact]).candidates[0].possible_refund.transaction_id,exact.provider_transaction_id);
  const partial=tx({merchant_raw:'SERVICE FEE REFUND',amount_cents:600,posted_on:'2026-07-03'});
  const pr=scan([fee,partial]),p=pr.candidates[0];assert.equal(p.status,'open');assert.equal(p.recovered_cents,null);
  assert.equal(p.possible_refund.amount_cents,600);assert.equal(p.remaining_cents,1200);
  assert.notEqual(p.action,null);assert.match(p.action.review_note,/Confirm which charge/);
  assert.equal(pr.open_candidate_cents,1200);assert.equal(pr.verified_recovered_cents,0);
});

test('a duplicate pair split across two accounts is not a duplicate',()=>{
  const a=tx({account_id:'chk',merchant_key:'spotify',amount_cents:-1199,posted_on:'2026-10-01'});
  const b=tx({account_id:'card',merchant_key:'spotify',amount_cents:-1199,posted_on:'2026-10-01'});
  assert.equal(scan([a,b]).candidates.length,0);
});

test('duplicate charges need same account, merchant identity and amount within three days',()=>{
  const a=tx({merchant_key:'netflix',merchant_raw:'NETFLIX.COM',amount_cents:-1549,posted_on:'2026-10-01'});
  const b=tx({merchant_key:'netflix',merchant_raw:'NETFLIX.COM',amount_cents:-1549,posted_on:'2026-10-01'});
  const far=tx({merchant_key:'netflix',merchant_raw:'NETFLIX.COM',amount_cents:-1549,posted_on:'2026-10-09'});
  const otherAmount=tx({merchant_key:'netflix',amount_cents:-1550,posted_on:'2026-10-01'});
  const otherAccount=tx({account_id:'card',merchant_key:'netflix',amount_cents:-1549,posted_on:'2026-10-01'});
  const r=scan([a,b,far,otherAmount,otherAccount]);
  const d=r.candidates.filter(c=>c.kind==='duplicate_charge');
  assert.equal(d.length,1);assert.equal(d[0].amount_cents,1549);assert.equal(d[0].confidence,'likely');
  assert.match(d[0].caveat,/legitimate/);assert.equal(d[0].evidence.length,2);
  assert.equal(scan([a,tx({merchant_key:'netflix',amount_cents:-1549,posted_on:'2026-10-03'})]).candidates[0].confidence,'possible');
});

test('a same-merchant credit stays unverified; three identical charges yield one candidate pair',()=>{
  const a=tx({merchant_key:'gym',amount_cents:-4000,posted_on:'2026-10-01'});
  const b=tx({merchant_key:'gym',amount_cents:-4000,posted_on:'2026-10-01'});
  const c=tx({merchant_key:'gym',amount_cents:-4000,posted_on:'2026-10-02'});
  const refund=tx({merchant_key:'gym',merchant_raw:'GYM',amount_cents:4000,posted_on:'2026-10-06'});
  const r=scan([a,b,c,refund]);
  const d=r.candidates.filter(x=>x.kind==='duplicate_charge');
  assert.equal(d.length,1);assert.equal(d[0].status,'open');assert.equal(r.verified_recovered_cents,0);
  assert.equal(d[0].possible_refund.transaction_id,refund.provider_transaction_id);
  assert.equal(d[0].refund_linkage_status,'unverified');
});

test('transfers, missing merchant identity and fees are not treated as duplicates',()=>{
  const t1=tx({merchant_key:'zelle',amount_cents:-5000,is_transfer:true}),t2=tx({merchant_key:'zelle',amount_cents:-5000,is_transfer:true});
  const u1=tx({merchant_key:null,amount_cents:-500}),u2=tx({merchant_key:null,amount_cents:-500});
  const f1=tx({merchant_key:'bank',merchant_raw:'ATM FEE',amount_cents:-300}),f2=tx({merchant_key:'bank',merchant_raw:'ATM FEE',amount_cents:-300});
  const r=scan([t1,t2,u1,u2,f1,f2]);
  assert.equal(r.candidates.filter(c=>c.kind==='duplicate_charge').length,0);
  assert.equal(r.candidates.filter(c=>c.kind==='bank_fee').length,2);
});

test('stale holds are flagged after seven days with a caveat; recent holds are not',()=>{
  const old=tx({is_pending:true,merchant_raw:'HOTEL',amount_cents:-20000,posted_on:'2026-10-01'});
  const fresh=tx({is_pending:true,merchant_raw:'GAS',amount_cents:-10000,posted_on:'2026-10-08'});
  const r=scan([old,fresh]);
  assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].kind,'stale_hold');assert.equal(r.candidates[0].age_days,9);
  assert.match(r.candidates[0].caveat,/may still post/);
});

test('unknown facts stay excluded and conflicting facts stop the scan',()=>{
  const eur=tx({currency:'EUR',merchant_raw:'OVERDRAFT FEE',amount_cents:-3500});
  const gone=tx({presence:'superseded',merchant_raw:'OVERDRAFT FEE',amount_cents:-3500});
  const r=scan([eur,gone]);
  assert.equal(r.candidates.length,0);assert.equal(JSON.stringify(r.excluded),JSON.stringify({unsupported_currency:1,unavailable:1,unknown_hold_date:0}));
  const x=tx({merchant_raw:'OVERDRAFT FEE',amount_cents:-3500});
  assert.throws(()=>scan([x,{...x,amount_cents:-100}]),/Conflicting/);
  assert.deepEqual(scan([x,{...x}]).candidates.length,1);
  assert.throws(()=>scan([tx({amount_cents:1.5})]),/invalid/);
  assert.throws(()=>scan([tx({provider_transaction_id:''})]),/identity/);
  assert.throws(()=>scan([],{today:'2026-13-01'}),/current date/);
});

test('a large debit labeled as a fee is not trusted as a fee',()=>{
  assert.equal(scan([tx({merchant_raw:'LATE FEE',amount_cents:-90000})]).candidates.length,0);
});

test('account scope limits candidates; results are deterministic regardless of input order',()=>{
  const rows=[tx({merchant_raw:'ATM FEE',amount_cents:-300}),tx({account_id:'card',merchant_raw:'LATE FEE',amount_cents:-2900}),
    tx({merchant_key:'m',amount_cents:-999,posted_on:'2026-10-02'}),tx({merchant_key:'m',amount_cents:-999,posted_on:'2026-10-02'})];
  assert.equal(scan(rows,{accountId:'card'}).candidates.length,1);
  assert.deepEqual(JSON.stringify(scan(rows)),JSON.stringify(scan([...rows].reverse())));
});

test('an unrelated same-merchant credit cannot prove that a possible duplicate was refunded',()=>{
  const a=tx({merchant_key:'gym',amount_cents:-4000,posted_on:'2026-10-01'});
  const b=tx({merchant_key:'gym',amount_cents:-4000,posted_on:'2026-10-01'});
  const credit=tx({merchant_key:'gym',merchant_raw:'GYM PROMOTIONAL CREDIT',amount_cents:4000,posted_on:'2026-10-03'});
  const r=scan([a,b,credit]);
  assert.equal(r.candidates[0].status,'open');
  assert.equal(r.candidates[0].recovered_cents,null);
  assert.equal(r.verified_recovered_cents,0);
});

test('a generic fee refund keyword is unverified without a trusted charge-specific linkage',()=>{
  const fee=tx({merchant_raw:'OVERDRAFT FEE',amount_cents:-3500,posted_on:'2026-10-02'});
  const credit=tx({merchant_raw:'OVERDRAFT FEE REFUND',amount_cents:3500,posted_on:'2026-10-03'});
  const r=scan([fee,credit]);
  assert.equal(r.candidates[0].status,'open');
  assert.equal(r.candidates[0].reversal,null);
  assert.equal(r.verified_recovered_cents,0);
});

test('caller assertions and untrusted fact labels cannot grant recovery verification',()=>{
  const fee=tx({merchant_raw:'OVERDRAFT FEE',amount_cents:-3500,posted_on:'2026-10-02'});
  const credit=tx({merchant_raw:'OVERDRAFT FEE REFUND',amount_cents:3500,posted_on:'2026-10-03',
    verified:true,refund_of:fee.provider_transaction_id,user_id:'another-owner'});
  const r=scan([fee,credit],{verified:true,confirmed:true,approval:{status:'approved'}});
  assert.equal(r.candidates[0].status,'open');
  assert.equal(r.verified_recovered_cents,0);
});

test('missing dates and nonexistent calendar dates fail closed instead of creating stale holds',()=>{
  for(const today of [null,undefined,'','2026-02-29','2026-04-31'])
    assert.throws(()=>scan([],{today}),/current date/);
  for(const posted_on of ['2026-02-29','2026-04-31'])
    assert.throws(()=>scan([tx({posted_on,is_pending:true})]),/invalid date/);
  const leap=scan([tx({posted_on:'2024-02-29',is_pending:true})],{today:'2024-03-07'});
  assert.equal(leap.candidates[0].age_days,7);
});

test('unknown hold age is explicitly excluded while valid fees remain reviewable',()=>{
  const rows=[tx({merchant_raw:'ATM FEE',amount_cents:-300}),
    ...[null,undefined,''].map(posted_on=>tx({posted_on,is_pending:true})),
    tx({currency:'EUR'}),tx({presence:'superseded'}),tx({account_id:'other'})];
  rows.push({...rows[0]});
  const r=scan(rows,{accountId:'chk'});
  assert.equal(r.candidates.length,1);
  assert.equal(r.excluded.unknown_hold_date,3);
  assert.equal(r.coverage.input_rows,8);assert.equal(r.coverage.unique_facts,7);
  assert.equal(r.coverage.duplicate_rows,1);assert.equal(r.coverage.out_of_scope,1);
  assert.equal(r.coverage.included_posted,1);assert.equal(r.coverage.included_pending,0);
  assert.throws(()=>scan([tx({posted_on:null})]),/invalid date/);
});

test('future dated posted charges, credits and holds cannot influence current recovery candidates',()=>{
  for(const patch of [{},{amount_cents:100},{is_pending:true}])
    assert.throws(()=>scan([tx({...patch,posted_on:'2026-10-11'})]),/future/);
});

test('indexed matching preserves earliest eligible unused credit and greedy duplicate pairing',()=>{
  const rows=[tx({merchant_raw:'ATM FEE',amount_cents:-300,posted_on:'2026-10-01'}),
    tx({merchant_raw:'ATM FEE',amount_cents:-300,posted_on:'2026-10-02'}),
    tx({merchant_raw:'ATM FEE REFUND',amount_cents:999,posted_on:'2026-10-03',provider_transaction_id:'credit-too-large'}),
    tx({merchant_raw:'ATM FEE REFUND',amount_cents:200,posted_on:'2026-10-04',provider_transaction_id:'credit-first'}),
    tx({merchant_raw:'ATM FEE REFUND',amount_cents:100,posted_on:'2026-10-05',provider_transaction_id:'credit-second'}),
    ...['2026-10-01','2026-10-05','2026-10-06','2026-10-07','2026-10-08'].map(posted_on=>tx({merchant_key:'gym',amount_cents:-2000,posted_on})),
    tx({merchant_key:'gym',amount_cents:1000,posted_on:'2026-10-08',provider_transaction_id:'gym-credit'})];
  const r=scan(rows),fees=r.candidates.filter(c=>c.kind==='bank_fee'),pairs=r.candidates.filter(c=>c.kind==='duplicate_charge');
  assert.equal(fees[0].possible_refund.transaction_id,'credit-first');
  assert.equal(fees[1].possible_refund.transaction_id,'credit-second');
  assert.equal(pairs.length,2);
  assert.equal(pairs[0].evidence.map(e=>e.posted_on).join(),'2026-10-05,2026-10-06');
  assert.equal(pairs[1].evidence.map(e=>e.posted_on).join(),'2026-10-07,2026-10-08');
  assert.equal(pairs[0].possible_refund.transaction_id,'gym-credit');assert.equal(pairs[1].possible_refund,null);
  assert.equal(JSON.stringify(scan([...rows].reverse())),JSON.stringify(r));
});

test('large unrelated histories and oversized credit pools have bounded indexed work',()=>{
  const rows=[];
  for(let i=0;i<2000;i++) {
    rows.push(tx({merchant_key:'merchant-'+i,amount_cents:-1000}));
    rows.push(tx({merchant_raw:'ATM FEE',amount_cents:-300}));
    rows.push(tx({merchant_raw:'ATM FEE REFUND',amount_cents:301}));
  }
  const r=scan(rows);
  assert.equal(r.candidates.length,2000);assert.equal(r.verified_recovered_cents,0);
  assert.equal(r.work.duplicate_pair_checks,0);
  assert.ok(r.work.credit_index_node_visits<=2000*30,'no full credit scan per fee');
});

test('a credit indexed as both merchant and fee remains single use across candidate types',()=>{
  const rows=[tx({merchant_raw:'ATM FEE',amount_cents:-300}),
    tx({merchant_key:'bank',amount_cents:-300}),tx({merchant_key:'bank',amount_cents:-300}),
    tx({merchant_key:'bank',merchant_raw:'ATM FEE REFUND',amount_cents:300,posted_on:'2026-10-02'})];
  const r=scan(rows);
  assert.equal(r.candidates.filter(c=>c.possible_refund).length,1);
  assert.equal(r.candidates.find(c=>c.kind==='duplicate_charge').possible_refund,null);
});

test('credit window endpoints are inclusive without calendar overflow',()=>{
  for(const [posted_on,credit_on,today,matched] of [
    ['2026-08-01','2026-09-30','2026-10-10',true],
    ['2026-08-01','2026-10-01','2026-10-10',false],
    ['9999-12-30','9999-12-31','9999-12-31',true]]) {
    const r=scan([tx({merchant_raw:'ATM FEE',amount_cents:-300,posted_on}),
      tx({merchant_raw:'ATM FEE REFUND',amount_cents:100,posted_on:credit_on})],{today});
    assert.equal(!!r.candidates[0].possible_refund,matched);
  }
});

test('indexed duplicate and merchant-credit results match a simple greedy reference across mixed histories',()=>{
  let state=17;const random=()=>{state=(state*1664525+1013904223)>>>0;return state;};
  for(let sample=0;sample<30;sample++) {
    const rows=[];
    for(let i=0;i<60;i++) rows.push(tx({account_id:'a'+random()%3,merchant_key:'m'+random()%4,
      amount_cents:(random()%3===0?1:-1)*(100+random()%3*100),posted_on:'2026-10-'+String(1+random()%9).padStart(2,'0')}));
    const sorted=[...rows].sort((a,b)=>a.posted_on.localeCompare(b.posted_on)||
      JSON.stringify([a.account_id,a.provider_transaction_id]).localeCompare(JSON.stringify([b.account_id,b.provider_transaction_id])));
    const used=new Set(),creditUsed=new Set(),expected=[];
    for(let i=0;i<sorted.length;i++) {
      const a=sorted[i];if(a.amount_cents>=0||used.has(a.provider_transaction_id))continue;
      for(let j=i+1;j<sorted.length;j++) {
        const b=sorted[j],gap=(Date.parse(b.posted_on)-Date.parse(a.posted_on))/86400000;
        if(gap>3)break;
        if(used.has(b.provider_transaction_id)||a.account_id!==b.account_id||a.merchant_key!==b.merchant_key||a.amount_cents!==b.amount_cents)continue;
        used.add(a.provider_transaction_id);used.add(b.provider_transaction_id);
        const credit=sorted.find(c=>!creditUsed.has(c.provider_transaction_id)&&c.account_id===b.account_id&&c.merchant_key===b.merchant_key&&c.amount_cents>0&&c.amount_cents<=-b.amount_cents&&c.posted_on>=b.posted_on);
        if(credit)creditUsed.add(credit.provider_transaction_id);
        expected.push([a.provider_transaction_id,b.provider_transaction_id,credit?.provider_transaction_id||null]);break;
      }
    }
    const actual=scan(rows).candidates.filter(c=>c.kind==='duplicate_charge').map(c=>[...c.evidence.map(e=>e.transaction_id),c.possible_refund?.transaction_id||null]);
    assert.equal(JSON.stringify(actual.sort()),JSON.stringify(expected.sort()));
  }
});

test('depleted credit pools prune used credits without repeated full scans',()=>{
  const rows=[];
  for(let i=0;i<1500;i++)rows.push(tx({merchant_raw:'ATM FEE',amount_cents:-300}));
  for(let i=0;i<750;i++)rows.push(tx({merchant_raw:'ATM FEE REFUND',amount_cents:100}));
  const r=scan(rows);
  assert.equal(r.candidates.filter(c=>c.possible_refund).length,750);
  assert.ok(r.work.credit_index_node_visits<=1500*30);
  assert.equal(r.verified_recovered_cents,0);
});

test('same provider identity with contradictory transfer status or provenance stops in either order',()=>{
  const original=tx({merchant_raw:'OVERDRAFT FEE',amount_cents:-3500,is_transfer:false});
  for(const conflicting of [{...original,is_transfer:true},{...original,fact_hash:'different-retained-fact'}]) {
    assert.throws(()=>scan([original,conflicting]),/Conflicting/);
    assert.throws(()=>scan([conflicting,original]),/Conflicting/);
  }
});

test('large safe-integer amounts retain every cent in duplicate-charge drafts',()=>{
  const amount=9007199254740990;
  const a=tx({merchant_key:'large-purchase',amount_cents:-amount});
  const b=tx({merchant_key:'large-purchase',amount_cents:-amount});
  const r=scan([a,b]);
  assert.equal(r.candidates[0].amount_cents,amount);
  assert.match(r.candidates[0].action.text,/\$90071992547409\.90/);
});
