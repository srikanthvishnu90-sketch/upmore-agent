// A holding or a company named in words, not a ticker (response-style corpus 3.05: "sell all my palantir"). A sell resolves
// against the person's OWN positions, each named from the broker's asset record (Alpaca GET /v2/assets/{symbol}); a buy may
// use the broker's asset list (GET /v2/assets) only when exactly one tradable instrument matches. One match is the normal
// card (fresh yes, $5.00 cap unchanged); several or none ask, listing what matches; nothing is guessed, and nothing the
// person does not hold is ever staged for a sale.
// Everything runs against the MOCK Alpaca Trading API server (tests/fixtures/alpaca-mock.cjs) over real HTTP: the adapter,
// connectors, loop and trade flow are production code; the broker is a mock, named "Alpaca mock server" on every source.
// Check: node --test tests/trade-by-name.test.cjs
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const domainDir=process.env.UPMORE_DOMAIN_DIR||path.join(root,'packages/domain');
const Mock=require('./fixtures/alpaca-mock.cjs');
const ctx=vm.createContext({fetch,AbortController,setTimeout,clearTimeout,URL,btoa,Buffer});
vm.runInContext(['35-agent-intents.js','43-agent-loop.js','45-advice-guard.js','46-voice.js','47-data-guard.js','48-money-math.js','50-agent-invest.js','53-compliance.js','66-agent-trade.js','67-agent-cards.js','71-alpaca.js','76-connect-cards.js','73-broker-accounts.js'].map(f=>fs.readFileSync(path.join(domainDir,f),'utf8')).join('\n')+'\nthis.T=AgentTrade;this.A=AlpacaTrading;this.C=Compliance;',ctx);
const {T,A,C}=ctx;
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
const registry=Registry.load(JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8')),rel=>fs.existsSync(path.join(root,rel)));
const T0=Date.UTC(2026,9,12,14,0,0);
const LIVE_PARTNER={broker_dealer:{live:true,paper:false,name:'Alpaca (your account)'}};
const TOKEN='tok-person-1',ACCT='acct-live-1';
// MOCK asset records, in Alpaca's long-name style.
const ASSETS={
  PLTR:{name:'Palantir Technologies Inc. Class A Common Stock',fractionable:true,tradable:true},
  APLE:{name:'Apple Hospitality REIT, Inc. Common Shares',fractionable:true,tradable:true},
  PNPL:{name:'Pineapple Energy Inc. Common Stock',fractionable:true,tradable:true},
  PLTX:{name:'Palantir Holdings Trust (delisted)',fractionable:false,tradable:false},
  FORD:{name:'Forward Industries, Inc. Common Stock',fractionable:true,tradable:true},
  F:{name:'Ford Motor Company Common Stock',fractionable:true,tradable:true},
};
const QUOTES={PLTR:[4100,4110],TSLA:[25000,25010],AAPL:[22000,22010],APLE:[1500,1510],PNPL:[200,210],FORD:[300,310],F:[1100,1110]};
const servers=[];after(async()=>{for(const s of servers)await s.close();});
async function world(positions,opts){
  const o=opts||{};const t={now:T0};
  const m=await Mock.start({now:()=>t.now,account:ACCT,tokens:{[TOKEN]:ACCT},positions,assets:ASSETS,quotes:QUOTES});servers.push(m);
  const adapter=A.create({base:m.base,mock:true,token:TOKEN,account_id:ACCT,clock:()=>t.now}); // the owner's $5.00 default cap
  const conn0=A.connectors(adapter,{clock:()=>t.now});
  const conn=o.wrap?o.wrap(conn0):conn0;
  const s=T.create({registry,connectors:conn,clock:()=>t.now,instruments:[],partners:LIVE_PARTNER,compliance:C});
  return {t,m,s};
}
const posts=m=>m.writes().filter(r=>r.method==='POST');
const listReads=m=>m.state.requests.filter(r=>r.method==='GET'&&r.path==='/v2/assets');

test('name match is word by word against the name or the ticker; filler alone and look-alike substrings never match',()=>{
  const list=Object.entries(ASSETS).map(([symbol,a])=>({symbol,name:a.name})).concat([{symbol:'AAPL',name:'Apple Inc. Common Stock'}]);
  assert.deepEqual([...T.nameMatch('palantir',list)].map(x=>x.symbol),['PLTR','PLTX']);
  assert.deepEqual([...T.nameMatch('apple',list)].map(x=>x.symbol).sort(),['AAPL','APLE'],'"pineapple" is never "apple"');
  assert.deepEqual([...T.nameMatch('apple inc',list)].map(x=>x.symbol).sort(),['AAPL','APLE'],'"inc" is filler, so both still match and the flow asks');
  assert.deepEqual([...T.nameMatch('pltr',list)].map(x=>x.symbol),['PLTR'],'the ticker itself matches');
  assert.deepEqual([...T.nameMatch('the stock',list)],[],'filler alone matches nothing');
  assert.deepEqual([...T.nameMatch('pa',list)],[],'two letters are not a prefix match');
  // "I" and "A" are words before they are tickers; money words are not instruments (the existing parse rule).
  assert.equal(T.parse('sell all I own').query,null);assert.equal(T.parse('buy 800 NVDA with 300 in cash').query,'NVDA');
  assert.equal(T.parse('sell all my palantir').query,'palantir');assert.equal(T.parse('sell 3 dollars of palantir').query,'palantir');
});

test('sell by company name, one holding matches: the normal sell card with the quote source and time, nothing before the yes, one yes places one order for that holding',async()=>{
  const w=await world({PLTR:18.5,AAPL:7});
  const c=await w.s.start('sell 3 dollars of palantir');
  assert.equal(c.outcome,'confirm',c.text);assert.equal(c.order.symbol,'PLTR');assert.equal(c.order.side,'sell');assert.equal(c.order.notional_cents,300);
  assert.match(c.text,/^LIVE: Sell \$3\.00 of PLTR/);assert.match(c.text,/Quote \$41\.00 \(Alpaca mock server, IEX bid, 13:59 UTC\)/);
  assert.equal(posts(w.m).length,0,'nothing before the yes');assert.equal(listReads(w.m).length,0,'a sell never reads the market-wide asset list');
  w.t.now+=30000;const y=await w.s.reply('yes');assert.equal(y.outcome,'filled',y.text);
  const p=posts(w.m);assert.equal(p.length,1);assert.equal(p[0].body.symbol,'PLTR');assert.equal(p[0].body.side,'sell');assert.equal(p[0].body.notional,'3.00');
});

test('"sell all my palantir": the one matching holding is named with its source and time, and the $5.00 cap stops it before any card',async()=>{
  const w=await world({PLTR:18.5});
  for(const text of ['sell all my palantir','Sell all my Palantir!!','sell all my palantir rn pls']){
    const r=await w.s.start(text);
    assert.equal(r.outcome,'stop',r.text);assert.equal(r.reason,'order_cap');
    assert.match(r.text,/^You hold 18\.5 PLTR \(Palantir Technologies Inc\. Class A Common Stock\), per Alpaca mock server, as of 14:00 UTC\. That's about \$[\d,]+\.\d\d; live orders are limited to \$5\.00 each while Upmore is in testing\. Nothing was placed\.$/);
  }
  assert.equal(posts(w.m).length,0);
});

test('several holdings match: asked, each listed by name and ticker; nothing staged; the answer by ticker gets the card',async()=>{
  const w=await world({AAPL:7,APLE:10});
  const r=await w.s.start('sell $3 of apple');
  assert.equal(r.outcome,'ask');assert.equal(r.reason,'holding_ambiguous');assert.deepEqual([...r.matches].sort(),['AAPL','APLE']);
  assert.match(r.text,/AAPL \(Apple Inc\. Common Stock\)/);assert.match(r.text,/APLE \(Apple Hospitality REIT, Inc\. Common Shares\)/);assert.match(r.text,/Which one should I sell\?$/);
  assert.equal(posts(w.m).length,0);
  const c=await w.s.start('sell $3 of APLE');assert.equal(c.outcome,'confirm');assert.equal(c.order.symbol,'APLE');
});

test('no holding matches: asked with the person\'s own holdings listed; a listed company the person does not hold is never staged for a sale',async()=>{
  const w=await world({AAPL:7});
  const r=await w.s.start('sell $3 of palantir');
  assert.equal(r.outcome,'ask');assert.equal(r.reason,'holding_unknown');assert.deepEqual([...r.holdings],['AAPL']);
  assert.match(r.text,/^None of your holdings in your Alpaca account matches "palantir" \(Alpaca mock server, as of 14:00 UTC\)\. You hold AAPL \(Apple Inc\. Common Stock\)\. Which one should I sell\?$/);
  assert.equal(r.order,undefined);assert.equal(posts(w.m).length,0);assert.equal(listReads(w.m).length,0);
  const none=await world({});const n=await none.s.start('sell all my palantir');assert.equal(n.outcome,'stop');assert.equal(n.reason,'no_position');assert.match(n.text,/shows no positions \(Alpaca mock server, as of 14:00 UTC\), so there is nothing to sell\. Nothing was placed\.$/);
});

test('a listed ticker the person does not hold, and a company they do: the holding is offered back with a question; a yes gets its card, a no places nothing',async()=>{
  const w=await world({F:2});
  const r=await w.s.start('sell $3 of ford');
  assert.equal(r.outcome,'ask');assert.equal(r.reason,'holding_suggest');assert.equal(r.suggest,'F');
  assert.match(r.text,/shows no FORD to sell, but you hold 2 F \(Ford Motor Company Common Stock\) \(Alpaca mock server, as of 14:00 UTC\)\. Sell F\? Say yes to use F\.$/);
  const y=await w.s.reply('yes');assert.equal(y.outcome,'confirm',y.text);assert.equal(y.order.symbol,'F');assert.equal(y.order.side,'sell');
  await w.s.reply('no');
  const n=await w.s.start('sell $3 of ford');assert.equal(n.reason,'holding_suggest');assert.equal((await w.s.reply('no')).outcome,'declined');
  assert.equal(posts(w.m).length,0);
  const plain=await world({AAPL:7});const s=await plain.s.start('sell all my TSLA');assert.equal(s.outcome,'stop');assert.equal(s.reason,'no_position','a ticker with no matching holding still stops plainly');
});

test('buy by company name: exactly one tradable match in the broker\'s asset list gets the normal card; several ask; none asks for the ticker; a non-tradable look-alike is never offered',async()=>{
  const w=await world({});
  const c=await w.s.start('buy $3 of palantir');
  assert.equal(c.outcome,'confirm',c.text);assert.equal(c.order.symbol,'PLTR','PLTX is not tradable, so PLTR is the one tradable match');assert.match(c.text,/^LIVE: Buy \$3\.00 of PLTR/);assert.match(c.text,/Quote \$41\.10 \(Alpaca mock server, IEX ask, 13:59 UTC\)/);
  assert.equal(listReads(w.m).length,1);assert.match(listReads(w.m)[0].query,/status=active/);
  await w.s.reply('no');
  const a=await w.s.start('buy $3 of apple');assert.equal(a.outcome,'ask');assert.equal(a.reason,'symbol_ambiguous');assert.deepEqual([...a.matches].sort(),['AAPL','APLE']);assert.doesNotMatch(a.text,/PNPL/);
  const u=await w.s.start('buy $3 of zebracorp');assert.equal(u.outcome,'ask');assert.equal(u.reason,'symbol_unknown');
  const over=await w.s.start('buy $6 of palantir');assert.equal(over.outcome,'stop');assert.equal(over.reason,'order_cap','the $5.00 cap is unchanged for a name match');
  assert.equal(posts(w.m).length,0);
});

test('the broker cannot be asked: a name lookup that fails is said plainly and nothing is guessed',async()=>{
  const wrap=c=>Object.assign({},c,{read:async(kind,p)=>{if(kind==='assets'||kind==='holdings')throw new Error('the broker did not answer (mock outage)');return c.read(kind,p);}});
  const w=await world({PLTR:18.5},{wrap});
  const b=await w.s.start('buy $3 of palantir');assert.equal(b.outcome,'ask');assert.equal(b.reason,'broker_unreachable');
  const s=await w.s.start('sell $3 of palantir');assert.equal(s.outcome,'ask');assert.equal(s.reason,'position_unreadable');
  assert.equal(posts(w.m).length,0);
});
