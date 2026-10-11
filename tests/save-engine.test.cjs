const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','47-save-engine.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.E=AgentSaveEngine;',ctx);
const E=ctx.E;
const lives=JSON.parse(fs.readFileSync(path.join(root,'evals/data/labeled/savings-lives.json'),'utf8')).lives;
const input=l=>({today:l.today,transactions:l.transactions,accounts:l.accounts,bills:l.bills,debts:l.debts,usage:l.usage_signals,market:l.market});
const sig=o=>`${o.play}|${o.key}`;

function score(){
  const byPlay={},misses=[],controlHits=[],dollarErrors=[],extras=[];
  for(const l of lives){
    const found=E.detect(input(l));const foundBy=new Map(found.map(c=>[sig(c),c]));
    const planted=l.opportunities.filter(o=>o.play!=='control'),controls=l.opportunities.filter(o=>o.play==='control');
    for(const o of planted){
      const p=byPlay[o.play]||(byPlay[o.play]={planted:0,found:0});p.planted++;
      const c=foundBy.get(sig(o));
      if(!c){misses.push(`${l.id} ${o.play} ${o.key} (${o.subtype})`);continue;}
      p.found++;
      if(c.expected_monthly_cents!==o.expected_monthly_cents)dollarErrors.push(`${l.id} ${o.key}: engine ${c.expected_monthly_cents} vs planted ${o.expected_monthly_cents}`);
    }
    for(const o of controls)if(found.some(c=>c.key===o.key))controlHits.push(`${l.id} ${o.key} (${o.subtype}): ${found.filter(c=>c.key===o.key).map(c=>c.subtype).join(',')}`);
    const plantedSigs=new Set(planted.map(sig));
    for(const c of found)if(!plantedSigs.has(sig(c)))extras.push(`${l.id} ${c.play} ${c.key} ${c.subtype}`);
  }
  return {byPlay,misses,controlHits,dollarErrors,extras};
}

test('every planted savings play in the 40 synthetic lives is detected with the planted dollar value, and no control row is flagged',()=>{
  const s=score();
  const planted=Object.values(s.byPlay).reduce((n,p)=>n+p.planted,0),found=Object.values(s.byPlay).reduce((n,p)=>n+p.found,0);
  assert.deepEqual(s.controlHits,[],'control rows must never be flagged');
  assert.deepEqual(s.misses,[],`recall ${found}/${planted}; missed plays`);
  assert.deepEqual(s.dollarErrors,[],'quantification must match the planted value exactly');
  for(const [play,p] of Object.entries(s.byPlay))assert.equal(p.found,p.planted,play);
  // Precision: the fixture labels one play per subtype per life, but the data it carries supports more true findings
  // (a second storage service, every kept plan with a cheaper annual option, other cards accruing while cash idles).
  // Those are expected and checked for consistency below; anything else beyond the planted set fails here.
  const explained=/ (duplicate_service|annual_pay_discount|card_accruing_while_cash_idle)$/;
  const unexplained=s.extras.filter(x=>!explained.test(x));
  assert.deepEqual(unexplained,[],'unplanted detections outside the known under-labeled subtypes');
  assert.ok(s.extras.length<=planted*0.2,`extras ${s.extras.length}/${planted}`);
});

test('unlabeled-but-true extras are internally consistent with the life data',()=>{
  for(const l of lives){
    const planted=new Set(l.opportunities.map(sig));
    for(const c of E.detect(input(l))){
      if(planted.has(sig(c)))continue;
      if(c.subtype==='annual_pay_discount'){const a=l.market.annual_plans[c.key];assert.ok(a,c.key);assert.equal(c.expected_monthly_cents,a.monthly_cents-Math.floor(a.annual_cents/12));}
      else if(c.subtype==='card_accruing_while_cash_idle'){const acc=l.accounts.find(a=>`account:${a.id}`===c.key);assert.ok(acc.balance_cents>0&&acc.apr_bps>0);assert.ok(l.accounts.filter(a=>a.kind==='savings').reduce((n,a)=>n+a.balance_cents,0)>=acc.balance_cents);}
      else if(c.subtype==='duplicate_service'){assert.ok(c.evidence.pair.length>=2);assert.ok(c.evidence.pair.every(p=>p.startsWith('merchant:')));}
      else assert.fail(`${l.id} unexplained extra ${sig(c)} ${c.subtype}`);
    }
  }
});

test('hard lives (noisy descriptors, pending duplicates, refunds) are detected as well as clean ones',()=>{
  for(const l of lives.filter(x=>x.hard)){
    const found=new Set(E.detect(input(l)).map(sig));
    for(const o of l.opportunities.filter(o=>o.play!=='control'))assert.ok(found.has(sig(o)),`${l.id} ${o.key}`);
  }
});

test('every candidate carries evidence, an action with a capability id and tier, and is labeled an estimate',()=>{
  for(const l of lives.slice(0,8))for(const c of E.detect(input(l))){
    assert.ok(c.evidence&&(c.evidence.rows||c.evidence.computed),c.id);
    assert.match(c.action.capability_id,/^[A-Z]{3,4}-\d{3}$/);assert.match(c.action.tier,/^T[0-5]$/);
    assert.equal(c.estimate,true);assert.ok(Number.isSafeInteger(c.expected_monthly_cents)&&c.expected_monthly_cents>0);
    assert.ok(['high','medium','low'].includes(c.confidence));
  }
});

test('the savings ledger never mixes estimates with verified deltas, and the queue ranks verified dollars first',()=>{
  const l=lives[0];const found=E.detect(input(l));
  const L=E.ledger({});
  const a=L.book(found[0],'cancel',l.today),b=L.book(found[1],'negotiate',l.today);
  assert.equal(L.book(found[0]).id,a.id,'booking twice returns the same entry');
  let s=L.summary();assert.equal(s.verified_monthly_cents,0);assert.equal(s.expected_unverified_monthly_cents,a.expected_monthly_cents+b.expected_monthly_cents);assert.match(s.message,/estimates are estimates/);
  assert.throws(()=>L.verify(a.id,12.5),/observed integer/);
  L.verify(a.id,a.expected_monthly_cents,'2026-11-01',{rows:['next cycle: no charge']});
  s=L.summary();assert.equal(s.verified_monthly_cents,a.expected_monthly_cents);assert.equal(s.expected_unverified_monthly_cents,b.expected_monthly_cents);assert.match(s.message,/verified\.$/);
  L.verify(b.id,0,'2026-11-01');assert.equal(L.state.entries.find(e=>e.id===b.id).status,'did_not_hold');assert.equal(L.summary().expected_unverified_monthly_cents,0);
  const ranked=E.rank(found,L.state);assert.equal(ranked[0].id,a.id,'verified entry ranks first regardless of size');
  const rest=ranked.slice(1);
  for(let i=1;i<rest.length;i++){const w={high:1,medium:.6,low:.3};assert.ok(rest[i-1].expected_monthly_cents*w[rest[i-1].confidence]>=rest[i].expected_monthly_cents*w[rest[i].confidence]);}
  const L2=E.ledger(JSON.parse(JSON.stringify(L.state)));assert.equal(L2.summary().verified_monthly_cents,a.expected_monthly_cents,'ledger state round-trips');
});

test('detector boundaries: one charge is not recurring, transfers are never fees, at-market savings is not idle cash',()=>{
  const tx=(id,date,amount,merchant_raw,extra)=>Object.assign({id,account_id:'chk',posted_at:date,amount,merchant_raw,is_pending:false,is_transfer:false},extra);
  const base={today:'2026-09-20',accounts:[],bills:[],debts:[],usage:{},market:{hysa_apy_bps:425,annual_plans:{'merchant:netflix':{monthly_cents:1549,annual_cents:12000}},family_plans:{}}};
  let out=E.detect({...base,transactions:[tx('a','2026-08-03',-15.49,'NETFLIX.COM')]});
  assert.equal(JSON.stringify(out.filter(c=>c.play!=='P3_fee').map(c=>c.id)),'[]','a single charge is not a subscription, so no annual-plan suggestion either');
  out=E.detect({...base,transactions:[tx('a','2026-08-03',-15.49,'NETFLIX.COM'),tx('b','2026-09-03',-15.49,'NETFLIX.COM')]});
  assert.ok(out.some(c=>c.subtype==='annual_pay_discount'),'two charges in two months is recurring');
  out=E.detect({...base,transactions:[tx('t','2026-09-01',-35,'OVERDRAFT FEE REIMBURSEMENT TRANSFER',{is_transfer:true}),tx('c','2026-09-02',35,'OVERDRAFT FEE REFUND')]});
  assert.equal(JSON.stringify(out.filter(c=>c.play==='P3_fee')),'[]','transfers and credits are never fee candidates');
  out=E.detect({...base,transactions:[],accounts:[{id:'s',kind:'savings',balance_cents:2000000,apy_bps:425},{id:'s2',kind:'savings',balance_cents:2000000,apy_bps:380}]});
  assert.equal(JSON.stringify(out.filter(c=>c.subtype==='idle_cash')),'[]','savings within 1% of the best rate is not idle; small gaps are not worth a move');
  out=E.detect({...base,transactions:[],accounts:[{id:'s',kind:'savings',balance_cents:2000000,apy_bps:1}]});
  assert.equal(out.filter(c=>c.subtype==='idle_cash').length,1);assert.equal(out[0].expected_monthly_cents,Math.floor(Math.floor(2000000*424/10000)/12));
  out=E.detect({...base,transactions:[],accounts:[{id:'s',kind:'savings',balance_cents:100000,apy_bps:1}]});
  assert.equal(JSON.stringify(out),'[]','below the idle-cash floor nothing is suggested');
});

test('merchant normalization resolves noisy descriptors and keeps Apple bills apart by price',()=>{
  assert.equal(E.slugOf('CHECKCARD 0912 NETFLIX.COM LOS GATOS CA'),'netflix');assert.equal(E.slugOf('GOOGLE *YOUTUBEPREMIUM g.co/helppay#'),'youtube_premium');
  assert.equal(E.slugOf('APPLE.COM/BILL 866-712-7753 CA',1099),'apple_music');assert.equal(E.slugOf('APPLE.COM/BILL CUPERTINO CA 0912',299),'icloud');
  assert.equal(E.slugOf('AMZN DIGITAL*AUDIBLE K12XY3'),'audible');assert.equal(E.slugOf('SQ *BLUE BOTTLE COFFEE'),null);
  assert.throws(()=>E.detect({transactions:[]}),/needs transactions and today/);
});
