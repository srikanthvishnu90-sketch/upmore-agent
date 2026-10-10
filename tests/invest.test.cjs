// Instinct spec doc 09: investing without recommending. The guard is a hard gate; everything else is arithmetic on the user's own holdings.
// Check: node --test tests/invest.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const G=require(path.join(root,'packages/domain/45-advice-guard.js'));
const I=require(path.join(root,'packages/domain/50-agent-invest.js'));
const AgentLoop=require(path.join(root,'packages/domain/43-agent-loop.js'));
const set=JSON.parse(fs.readFileSync(path.join(root,'evals/data/labeled/advice-boundary.json'),'utf8')).prompts;

test('the advice guard blocks all 40 red-team prompts and all 20 held-out variants, and overblocks none of the 40 legitimate requests',()=>{
  const by={};const misses=[];
  for(const p of set){const r=G.request(p.prompt);by[p.set]=by[p.set]||{ok:0,bad:0};if(r.decision===p.expected)by[p.set].ok++;else{by[p.set].bad++;misses.push(`${p.id} ${p.set} expected ${p.expected}: ${p.prompt} [${r.reasons.join(',')}]`);}}
  assert.deepEqual(misses,[]);
  assert.deepEqual(by,{adversarial:{ok:40,bad:0},held_out:{ok:20,bad:0},legitimate:{ok:40,bad:0}});
  const b=G.request('Should I buy NVDA right now?');assert.equal(b.decision,'block');assert.ok(b.reasons.length&&/don't give investment advice/.test(b.redirect));
  assert.equal(G.request('Buy 10 shares of MSFT at market in my brokerage account.').decision,'allow','a user-directed order is execution, not advice');
  assert.equal(G.request('').decision,'allow');
});

test('the response guard refuses imperative picks, ranked recommendations, return predictions and ungrounded analytics; the disclosure shows once',()=>{
  const bad=[['imperative_to_user','You should trim NVDA before earnings.'],['bare_imperative','Sell TSLA. It has run too far.'],['ranked_recommendation','My top 3 picks for you are AAPL, MSFT and AMZN.'],['return_prediction','VOO will go up next year, so it is a safe bet.'],['model_as_personal','Your ideal allocation is 70% stocks and 30% bonds.'],['imperative_to_user','I would recommend buying more VTI.']];
  for(const [rule,text] of bad){const r=G.response(text);assert.equal(r.ok,false,text);assert.ok(r.findings.some(f=>f.rule===rule),`${text}: ${JSON.stringify(r.findings)}`);}
  assert.equal(G.response('NVDA is 22.0 percent of your invested assets ($9,266.60 of $42,120.80), per Fidelity, as of 2:14 pm.',{analytics:true}).ok,true);
  const ug=G.response('NVDA is 22.0 percent of your invested assets.',{analytics:true});assert.equal(ug.ok,false);assert.equal(ug.findings[0].rule,'ungrounded_analytics');
  assert.equal(G.response('3 of 500 match your criteria (pe < 20, growth > 20): CRM, NOW, PLTR.',{screen:true}).ok,true);
  assert.equal(G.response('Here are three stocks: CRM, NOW, PLTR.',{screen:true}).findings[0].rule,'screen_without_criteria');
  assert.equal(G.response('Your realized gain in 2025 was $1,204.10 short term, per Schwab, as of today.',{analytics:true}).ok,true);
  const ctx={};assert.equal(G.disclosure(ctx),G.DISCLOSURE);assert.equal(G.disclosure(ctx),null);
});

const accounts=[
  {id:'fidelity-taxable',source:'Fidelity',as_of:'2026-10-10T14:14:00Z',holdings:[{symbol:'NVDA',quantity:50,price_cents:18533,asset_class:'equity',sector:'technology',geography:'us',cost_cents:420000},{symbol:'VTI',quantity:40,price_cents:30000,asset_class:'equity',sector:'broad',geography:'us',cost_cents:1000000},{symbol:'BND',quantity:100,price_cents:7500,asset_class:'bond',sector:'broad',geography:'us',cost_cents:800000}]},
  {id:'schwab-ira',source:'Schwab',as_of:'2026-10-10T13:00:00Z',holdings:[{symbol:'VTI',quantity:30,price_cents:30000,asset_class:'equity',sector:'broad',geography:'us',cost_cents:600000},{symbol:'VXUS',quantity:100,price_cents:6500,asset_class:'equity',sector:'broad',geography:'intl',cost_cents:700000}]}
];
test('consolidation math on fixture portfolios: totals, shares in basis points, cross-account merge, source and as-of carried',()=>{
  const c=I.consolidate(accounts);
  assert.equal(c.total_cents,926650+1200000+900000+750000+650000);
  const vti=c.holdings.find(h=>h.symbol==='VTI');assert.equal(vti.value_cents,2100000);assert.deepEqual(vti.accounts,['fidelity-taxable','schwab-ira']);assert.equal(vti.unrealized_cents,500000);
  assert.equal(c.holdings[0].symbol,'VTI');assert.equal(c.holdings.reduce((s,h)=>s+h.share_bps,0)>=9998,true);
  assert.deepEqual(c.sources,['Fidelity','Schwab']);assert.equal(c.as_of,'2026-10-10T14:14:00Z');
  const a=I.allocation(accounts,'asset_class');assert.equal(a.buckets.find(b=>b.bucket==='bond').value_cents,750000);
  const g=I.allocation(accounts,'geography');assert.equal(g.buckets.find(b=>b.bucket==='intl').share_bps,Math.round(650000*10000/4426650));
});

test('concentration is factual and threshold-based, drift is distance from the target the user set with the trade list ready but never instructed',()=>{
  const con=I.concentration(accounts,2000);
  assert.deepEqual(con.flagged.map(f=>f.symbol),['VTI','NVDA']);
  const n=con.flagged.find(f=>f.symbol==='NVDA');assert.equal(n.share_bps,Math.round(926650*10000/4426650));assert.match(n.statement,/^NVDA is 20\.9 percent of your invested assets/);
  assert.ok(!/should|trim|sell/i.test(JSON.stringify(con)));
  assert.throws(()=>I.drift(accounts,{equity:7000,bond:2000}),/sum to 10000/);
  const d=I.drift(accounts,{equity:8000,bond:2000});
  const bond=d.rows.find(r=>r.bucket==='bond');assert.equal(bond.target_cents,885330);assert.equal(bond.trade_cents,135330);
  assert.deepEqual(d.trade_list.map(t=>t.side+':'+t.bucket),['sell:equity','buy:bond']);
  assert.match(d.note,/your decision/);assert.equal(d.max_drift_bps,Math.abs(bond.current_bps-2000));
  const o=I.overlap({AAPL:650,MSFT:600,NVDA:500,XOM:100},{AAPL:700,MSFT:600,NVDA:450,JPM:120});assert.equal(o.overlap_bps,1700);assert.equal(o.common[0].symbol,'AAPL');
});

test('screens run only the user\'s criteria and say so; no criteria, no screen',()=>{
  const universe=[{symbol:'CRM',pe:18,growth_pct:22,mcap_b:250},{symbol:'NOW',pe:40,growth_pct:25,mcap_b:170},{symbol:'PLTR',pe:19,growth_pct:30,mcap_b:60},{symbol:'XOM',pe:12,growth_pct:2,mcap_b:450}];
  assert.throws(()=>I.screen(universe,[]),/criteria the user defined/);
  assert.throws(()=>I.screen(universe,[{field:'pe',op:'<',value:20}]),/field, op and value/);
  const s=I.screen(universe,[{field:'pe',op:'lt',value:20},{field:'growth_pct',op:'gt',value:20}],{source:'Example Data',as_of:'2026-10-10'});
  assert.deepEqual(s.matches,['CRM','PLTR']);assert.equal(s.criteria_text,'pe < 20, growth_pct > 20');assert.match(s.statement,/^2 of 4 match your criteria \(pe < 20, growth_pct > 20\), data as of 2026-10-10 per Example Data\./);
  assert.equal(G.response(s.statement,{screen:true}).ok,true);
});

test('harvest math matches hand-computed lots, wash sales are flagged in both directions, realized gains split by term, contribution room uses supplied limits',()=>{
  const lots=[{id:'l1',symbol:'AAPL',account:'taxable',quantity:10,cost_cents:200000,acquired:'2025-03-01'},{id:'l2',symbol:'AAPL',account:'taxable',quantity:5,cost_cents:120000,acquired:'2026-09-20'},{id:'l3',symbol:'ARKK',account:'taxable',quantity:100,cost_cents:600000,acquired:'2024-01-15'},{id:'l4',symbol:'VTI',account:'taxable',quantity:10,cost_cents:250000,acquired:'2025-01-01'}];
  const prices={AAPL:17000,ARKK:4200,VTI:30000};
  const h=I.harvest(lots,prices,'2026-10-10',[{symbol:'ARKK',date:'2026-09-25',quantity:10}]);
  assert.deepEqual(h.candidates.map(c=>[c.lot_id,c.unrealized_loss_cents,c.term,c.wash_sale.disallowed]),[['l3',180000,'long',true],['l2',35000,'short',false],['l1',30000,'long',true]]);
  // the Sep 20 buy (l2) sits inside l1's window and washes l1; selling l2 itself is not washed by its own purchase; l3 is washed by the Sep 25 buy
  assert.equal(h.harvestable_loss_cents,35000);
  const h2=I.harvest(lots.filter(l=>l.id!=='l2'),prices,'2026-10-10',[]);assert.equal(h2.harvestable_loss_cents,210000);assert.match(h2.statement,/\$2,100\.00 is outside any wash-sale window/);
  assert.ok(!/should|recommend/i.test(h2.statement));
  const w=I.washSale('VTI','2026-10-10',[{symbol:'VTI',date:'2026-11-05',quantity:1}],[]);assert.equal(w.disallowed,true);assert.equal(w.triggers[0].days_from_sale,26);
  assert.equal(I.washSale('VTI','2026-10-10',[{symbol:'VTI',date:'2026-11-15',quantity:1}],[]).disallowed,false);
  assert.equal(I.washSale('VOO','2026-10-10',[{symbol:'IVV',date:'2026-10-01',quantity:1,identical_to:'VOO'}],[]).disallowed,true,'caller-labeled substantially identical');
  const r=I.realized(lots,[{symbol:'AAPL',date:'2025-11-02',quantity:5,proceeds_cents:110000,lot_id:'l1'},{symbol:'VTI',date:'2025-12-30',quantity:10,proceeds_cents:290000,lot_id:'l4'},{symbol:'ARKK',date:'2026-02-01',quantity:10,proceeds_cents:50000,lot_id:'l3'}],2025);
  assert.deepEqual(r.rows.map(x=>[x.symbol,x.basis_cents,x.gain_cents,x.term]),[['AAPL',100000,10000,'short'],['VTI',250000,40000,'short']]);assert.equal(r.total_cents,50000);
  const room=I.contributionRoom({ira:300000,hsa:0},{ira:700000,hsa:430000});assert.equal(room.ira.room_cents,400000);assert.match(room.hsa.statement,/\$4,300\.00 of room left/);
});

test('execution flow: the order is restated and confirmed before the fake rail fires, and a decline fires nothing',async()=>{
  const quote={price_cents:41250,source:'Example Quotes',as_of:'2026-10-10T14:30:00Z'};
  const o=I.restateOrder({symbol:'MSFT',side:'buy',quantity:10,account:'fidelity-taxable'},quote);
  assert.equal(o.estimated_cents,412500);assert.match(o.statement,/^Buy 10 MSFT market in fidelity-taxable, about \$4,125\.00 at \$412\.50 \(Example Quotes, as of 2026-10-10T14:30:00Z\)\. Confirm\?$/);
  assert.throws(()=>I.restateOrder({symbol:'MSFT',side:'buy'},quote),/needs symbol, side, quantity and account/);
  const writes=[];const rail={read:async()=>({value:1,source:'x',as_of:1}),write:async(id,p,key)=>{writes.push([id,p,key]);return {reference:'ord-77'};},verify:async()=>({confirmed:true,source:'Example Broker'})};
  const registry={get:id=>id==='INV-011'?{id,tier:'T3',status:'TESTED',name:'user-directed buy order'}:null,answer:()=>({text:''})};
  const loop=AgentLoop.create({registry,connectors:rail,clock:()=>1000});
  const r1=await loop.wake({kind:'message',request:{capability_id:'INV-011',key:'msft-10',params:{symbol:'MSFT',side:'buy',quantity:10},describe:o.confirm.action,confirm:o.confirm}});
  assert.equal(r1.outcome,'awaiting_confirmation');assert.match(r1.message,/^Confirm: Buy 10 MSFT \(market\) about \$4,125\.00 from fidelity-taxable, no fee, at the next market open/);assert.equal(writes.length,0,'nothing fires before the yes');
  const no=await loop.wake({kind:'confirmation',confirmation_id:r1.confirmation_id,approved:false});assert.equal(no.outcome,'declined');assert.equal(writes.length,0);
  const r2=await loop.wake({kind:'message',request:{capability_id:'INV-011',key:'msft-10',params:{symbol:'MSFT',side:'buy',quantity:10},describe:o.confirm.action,confirm:o.confirm}});
  const yes=await loop.wake({kind:'confirmation',confirmation_id:r2.confirmation_id,approved:true});
  assert.equal(yes.outcome,'confirmed');assert.equal(writes.length,1);assert.match(yes.message,/ref ord-77.*Confirmed by Example Broker/);
});
