const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const I=require(path.join(root,'packages/domain/48-investing.js'));
const G=require(path.join(root,'packages/domain/45-advice-guard.js'));
const H=(account_id,source,symbol,quantity,price_cents,asset_class,extra)=>Object.assign({account_id,source,as_of:'2026-10-10T13:30:00Z',symbol,quantity,price_cents,asset_class},extra);
const holdings=[
  H('fid-brokerage','Fidelity','NVDA',40,18500,'equity',{sector:'tech',geography:'US',lots:[{id:'l1',quantity:40,cost_cents:40*21000,acquired_on:'2025-02-01'}]}),
  H('fid-brokerage','Fidelity','VTI',100,28960,'equity',{sector:'broad',geography:'US',lots:[{id:'l2',quantity:100,cost_cents:100*26000,acquired_on:'2024-01-15'}]}),
  H('schwab-ira','Schwab','VTI',20,28960,'equity',{sector:'broad',geography:'US'}),
  H('schwab-ira','Schwab','BND',150,7200,'bond',{sector:'bonds',geography:'US',lots:[{id:'l3',quantity:150,cost_cents:150*7900,acquired_on:'2026-09-20'}]}),
  H('fid-brokerage','Fidelity','VXUS',60,6500,'equity',{sector:'broad',geography:'ex-US'}),
];

test('consolidation across brokerages: totals, weights, groupings, sources and as-of',()=>{
  const c=I.consolidate(holdings);
  assert.equal(c.total_value_cents,40*18500+120*28960+150*7200+60*6500);
  const vti=c.positions.find(p=>p.symbol==='VTI');assert.equal(vti.quantity,120);assert.deepEqual(vti.accounts,['fid-brokerage','schwab-ira']);
  assert.equal(c.positions[0].symbol,'VTI');assert.deepEqual(c.sources,['Fidelity','Schwab']);assert.equal(c.as_of,'2026-10-10T13:30:00Z');
  assert.equal(Object.values(c.by_asset_class).reduce((n,x)=>n+x.weight_bps,0)>=9999,true);
  assert.throws(()=>I.consolidate([{symbol:'X'}]),/holding needs account_id/);
});

test('concentration is a factual threshold statement that passes the advice guard',()=>{
  const c=I.consolidate(holdings);const r=I.concentration(c,1200);
  assert.ok(r.some(x=>x.symbol==='NVDA'));const nvda=r.find(x=>x.symbol==='NVDA');
  assert.match(nvda.statement,/^NVDA is \d+\.\d% of your invested assets \(\$[\d,]+\.\d\d\), per Fidelity and Schwab as of 2026-10-10T13:30:00Z\.$/);
  assert.equal(G.check(nvda.statement,{kind:'analytics'}).allowed,true);
  assert.deepEqual(I.concentration(c,9000),[]);
});

test('drift against the user-set target computes the trade list but never instructs',()=>{
  const c=I.consolidate(holdings);const d=I.drift(c,{equity:7000,bond:3000});
  assert.equal(d.rows.find(r=>r.asset_class==='bond').target_bps,3000);
  const net=d.rows.reduce((n,r)=>n+r.to_target_cents,0);assert.ok(Math.abs(net)<=2,'trades net to zero');
  assert.ok(d.computed_trade_list.length===2);assert.match(d.statement,/executes only if you approve it/);
  assert.equal(G.check(d.statement,{kind:'analytics'}).allowed,true,JSON.stringify(G.check(d.statement,{kind:'analytics'}).findings));
  assert.throws(()=>I.drift(c,{equity:5000}),/sum to 10000/);assert.throws(()=>I.drift(c,null),/user's own target/);
});

test('screener runs only the user\'s criteria and reports matches as data',()=>{
  const universe=[{symbol:'AAA',pe:15,rev_growth_pct:25,sector:'tech'},{symbol:'BBB',pe:30,rev_growth_pct:40,sector:'tech'},{symbol:'CCC',pe:12,rev_growth_pct:22,sector:'health'},{symbol:'DDD',pe:18,rev_growth_pct:null}];
  const s=I.screen(universe,{pe:{lt:20},rev_growth_pct:{gt:20}});
  assert.deepEqual(s.matches,['AAA','CCC']);assert.equal(s.criteria_text,'pe under 20, rev_growth_pct over 20');
  assert.equal(G.check(s.statement+' Per Polygon data as of 9:30 am.',{kind:'screen',criteria:s.criteria_text}).allowed,true);
  assert.deepEqual(I.screen(universe,{sector:{in:['health']}}).matches,['CCC']);
  assert.throws(()=>I.screen(universe,{}),/user-defined criteria/);
});

test('harvest candidates are math with the wash-sale window stated; wash-sale check is a factual rule',()=>{
  const prices={NVDA:18500,VTI:28960,BND:7200};
  const h=I.harvestCandidates(holdings,prices,'2026-10-10',[{symbol:'BND',date:'2026-09-20'}]);
  assert.equal(h.total_unrealized_loss_cents,40*(21000-18500)+150*(7900-7200));
  const nvda=h.candidates.find(c=>c.symbol==='NVDA');assert.equal(nvda.long_term,true);assert.equal(nvda.wash_sale_risk,false);
  const bnd=h.candidates.find(c=>c.symbol==='BND');assert.equal(bnd.wash_sale_risk,true);assert.match(bnd.wash_sale_reason,/within 30 days/);
  assert.match(h.statement,/harvesting them offsets that much in gains/);assert.equal(G.check(h.statement+' Per Fidelity as of 1:30 pm.',{kind:'analytics'}).allowed,true);
  assert.equal(I.washSale('VTI','2026-10-10',[{symbol:'VTI',date:'2026-08-01'}]).at_risk,false);
  assert.equal(I.harvestCandidates(holdings,{NVDA:30000,VTI:30000,BND:9000},'2026-10-10',[]).statement,'No lots with unrealized losses.');
});

test('order flow restates the exact decision, confirms before the fake rail fires, and the real rail is gated',()=>{
  const quote={price_cents:41280,source:'Schwab',as_of:'10:04 am ET'};
  const r=I.orderRestatement({side:'buy',symbol:'MSFT',quantity:10,type:'market'},quote,{name:'Schwab brokerage'});
  assert.equal(r.estimated_cents,412800);
  assert.equal(r.text,'Order to confirm: buy 10 shares of MSFT, market order, Schwab brokerage, estimated cost $4,128.00 at $412.80 (per Schwab quote, as of 10:04 am ET). Reply confirm to place it.');
  assert.equal(G.check(r.text,{kind:'execution',user_directed_order:true}).allowed,true);
  const placed=[];const rail={mode:'fake',name:'Fake Broker',place:(o,key)=>{placed.push(key);return {reference:'FB-1',fill:{quantity:o.quantity,price_cents:41290}};}};
  const no=I.executeOrder(r,rail,false,'k1');assert.equal(no.placed,false);assert.equal(placed.length,0);
  const yes=I.executeOrder(r,rail,true,'k1');assert.equal(yes.verified,true);assert.deepEqual(placed,['k1']);assert.match(yes.message,/^Filled: 10 MSFT at \$412\.90, \$4,129\.00 total, per Fake Broker confirmation FB-1\./);
  const gated=I.executeOrder(r,{mode:'real'},true,'k2');assert.equal(gated.placed,false);assert.equal(gated.reason,'rail_gated');
  const limit=I.orderRestatement({side:'sell',symbol:'RIVN',quantity:30,type:'limit',limit_cents:1450},{price_cents:1431,source:'Schwab',as_of:'10:05 am ET'},{name:'Schwab brokerage'});
  assert.match(limit.text,/sell 30 shares of RIVN, limit order at \$14\.50, Schwab brokerage, estimated proceeds \$435\.00/);
  assert.throws(()=>I.orderRestatement({side:'buy',symbol:'X',quantity:1,type:'limit'},quote,{name:'a'}),/limit_cents/);
  assert.throws(()=>I.orderRestatement({side:'hold',symbol:'X',quantity:1,type:'market'},quote,{name:'a'}),/side buy\/sell/);
});

test('contribution room and dividends are mechanics with estimates labeled',()=>{
  const room=I.contributionRoom({ira:700000,'401k':2350000},{ira:200000});
  assert.equal(room.ira.room_cents,500000);assert.equal(room['401k'].room_cents,2350000);
  const d=I.dividends(I.consolidate(holdings),{VTI:85,BND:20},[{amount_cents:12000},{amount_cents:3000}]);
  assert.equal(d.paid_trailing_cents,15000);assert.equal(d.forward_estimate_cents,120*85+150*20);assert.equal(d.estimate,true);
});
