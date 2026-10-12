// Owner rule, standing (2026-10-11): everything is LIVE. No paper trading anywhere, no paper label, no paper fallback.
// A paper account that somehow reaches the trade flow is refused before anything is read, priced or staged.
// Check: node --test tests/live-only.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'packages/domain');
const ctx=vm.createContext({console,setTimeout,clearTimeout,URL});
vm.runInContext(['35-agent-intents.js','43-agent-loop.js','45-advice-guard.js','46-voice.js','47-data-guard.js','48-money-math.js','50-agent-invest.js','53-compliance.js','66-agent-trade.js','67-agent-cards.js'].map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n')+'\nthis.T=AgentTrade;this.C=Compliance;',ctx);
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
const registry=Registry.load(JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8')),rel=>fs.existsSync(path.join(root,rel)));
const T0=Date.UTC(2026,9,12,14,0,0);
function session(account){
  const writes=[];
  const conn={async read(kind){if(kind==='brokerage_accounts')return {value:[account],source:'test broker',as_of:T0};if(kind==='quote')return {value:{price_cents:51210,side:'ask'},source:'test broker',as_of:T0};if(kind==='market_clock')return {value:{is_open:true},source:'test broker',as_of:T0};if(kind==='asset')return {value:{symbol:'VOO',name:'Vanguard S&P 500 ETF',tradable:true,fractionable:true},source:'test',as_of:T0};throw new Error('NOT_WIRED');},
    async write(){writes.push(1);return {reference:'o1'};},async verify(){return {confirmed:true,reference:'o1'};}};
  return {writes,s:ctx.T.create({registry,connectors:conn,clock:()=>T0,instruments:[{symbol:'VOO',name:'Vanguard S&P 500 ETF'}],partners:{broker_dealer:{live:true,paper:false,name:'Alpaca (your account)'}},compliance:ctx.C})};
}
test('a paper account is refused: nothing priced, staged or sent, and the word PAPER never appears',async()=>{
  const w=session({id:'p1',name:'Alpaca paper',paper:true,live:false,fractional:true,cash_cents:1000000,tradable:true});
  const r=await w.s.start('buy $5 of VOO');
  assert.equal(r.outcome,'refuse');assert.equal(r.reason,'paper_account');
  assert.equal(r.text,'That account is a paper (practice) account. Upmore trades only in your own live brokerage account, so nothing was placed.');
  assert.equal(w.s.pending,null);assert.equal(w.writes.length,0);
});
test('a live account trades with LIVE on the card',async()=>{
  const w=session({id:'a1',name:'your Alpaca account',paper:false,live:true,fractional:true,cash_cents:1000000,tradable:true,order_cap_cents:500});
  const r=await w.s.start('buy $5 of VOO');assert.equal(r.outcome,'confirm',r.text);assert.match(r.text,/^LIVE: Buy \$5\.00 of VOO/);
});
test('no paper branch is left in the trade flow',()=>{
  const src=fs.readFileSync(path.join(dir,'66-agent-trade.js'),'utf8');
  assert.doesNotMatch(src,/"PAPER: "|PAPER portfolio|Paper trading: no real money|\(PAPER\)/);
});
