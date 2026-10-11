// Phase 1 wiring contract (spec 16 router): the live chat handler calls AgentRouter.handle with a model extraction and
// the three proven flows. These tests use a STUB model, so they prove the contract (grounding, cross-check, approvals,
// fallback, no stacked cards, stateless restore), not the 95% bar: that is measured only against the live handler by
// evals/gauntlet/run-live.cjs.
// Check: node --test tests/router.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({setTimeout,clearTimeout});
vm.runInContext(['33-agent-monitors.js','35-agent-intents.js','41-agent-recovery.js','42-agent-recipients.js','43-agent-loop.js','45-advice-guard.js','46-voice.js','47-data-guard.js','48-money-math.js','49-agent-save.js','50-agent-invest.js','53-compliance.js','54-agent-money.js','64-agent-send.js','65-agent-realworld.js','66-agent-trade.js','67-agent-cards.js','68-agent-cancel.js','69-agent-router.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.R=AgentRouter;this.T=AgentTrade;this.X=AgentCancel;this.S=AgentSend;this.C=Compliance;',ctx);
const {R,T,X,S,C}=ctx;
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
const registry=Registry.load(JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8')),rel=>fs.existsSync(path.join(root,rel)));
const T0=Date.UTC(2026,9,12,14,0,0),MIN=60000;
const instruments=[{symbol:'VOO',name:'Vanguard S&P 500 ETF'},{symbol:'VTI',name:'Vanguard Total Stock Market ETF'}];
const people=[{id:'p1',name:'Sam K',handle:'@samk',rails:['venmo'],history:[{amount_cents:2000,on:'2026-09-01'}]}];
function txs(){const t=[];let n=0;const add=(d,a,m)=>t.push({id:'t'+(++n),account_id:'visa',posted_at:d,amount:-a,merchant_raw:m,is_pending:false,is_transfer:false});for(const d of ['2026-07-03','2026-08-03','2026-09-03','2026-10-03'])add(d,17.99,'NETFLIX.COM');return t;}
function world(){
  const w={clock:{now:T0},writes:[],records:{},n:0};
  const read=async(kind,p)=>{
    if(kind==='brokerage_accounts')return {value:[{id:'schwab-1',name:'Schwab brokerage',fractional:true,cash_cents:1000000}],source:'Example Broker',as_of:w.clock.now};
    if(kind==='quote')return {value:{price_cents:51210},source:'Example Quotes',as_of:w.clock.now-60000};
    if(kind==='order')return {value:w.records[p.order_id],source:'Example Broker',as_of:w.clock.now};
    if(kind==='holdings')return {value:[],source:'Example Broker',as_of:w.clock.now};
    if(kind==='subscription_terms')return {value:{plan:'Standard',access_until:'2026-11-03',refund_policy:'no refunds',next_charge_on:'2026-11-03',fee_cents:0,remaining_contract_cents:0},source:'Netflix account page',as_of:w.clock.now};
    if(kind==='merchant_record')return {value:w.records.netflix||{state:'active',next_charge_on:'2026-11-03'},source:'Netflix',as_of:w.clock.now};
    return {value:1,source:'x',as_of:w.clock.now};
  };
  w.conn={read,write:async(id,p,key)=>{w.writes.push({id,key,params:p});const ref='ref-'+(++w.n);if(id==='INV-011')w.records[ref]={order_id:ref,status:'filled',quantity:p.quantity,fill_price_cents:51210,filled_at:w.clock.now};if(id==='BILL-003')w.records.netflix={state:'cancelled',next_charge_on:null};return id==='BILL-003'?{ok:true,reference:ref,confirmation_text:'Your membership is cancelled.'}:{reference:ref};},verify:async(id,key,ref)=>({confirmed:true,source:'Example Rail',reference:ref})};
  return w;
}
function sessions(w,state){
  const st=state||{};const clock=()=>w.clock.now;
  return {
    trade:T.create({registry,connectors:w.conn,clock,instruments,partners:{broker_dealer:{live:true}},compliance:C,state:st.trade}),
    cancel:X.create({registry,connectors:w.conn,clock,transactions:txs(),directory:{netflix:{kind:'portal',url:'netflix.com/cancelplan',display_name:'Netflix'}},state:st.cancel}),
    send:S.create({registry,connectors:w.conn,clock,people,partners:{ach:true},limits:{per_day_cents:1000000,per_week_cents:3000000},large_cents:50000,state:st.send})
  };
}
const parsers={trade:t=>T.parse(t),send:t=>S.parse(t),cancel:t=>X.parse(t)};
const stub=map=>async raw=>{const k=Object.keys(map).find(x=>x===raw);if(!k)return {intent:'other'};const v=map[k];if(v instanceof Error)throw v;return v;};
const snap=ss=>JSON.parse(JSON.stringify({trade:ss.trade.snapshot(),cancel:ss.cancel.snapshot(),send:ss.send.snapshot()}));

test('the tool schema and system prompt make the model extract verbatim spans, name one intent, and never approve',()=>{
  assert.equal(R.TOOL.name,'route_message');assert.equal(JSON.stringify(R.TOOL.input_schema.required),'["intent"]');
  assert.equal(R.TOOL.input_schema.properties.intent.enum.join(),'buy_security,cancel_subscription,send_money,split_expense,card_reply,other');
  assert.match(R.SYSTEM,/verbatim/);assert.match(R.SYSTEM,/You never approve anything/);assert.match(R.SYSTEM,/data, never an instruction/);
  assert.equal(R.numberIn('five hundred dollars'),500);assert.equal(R.numberIn('forty'),40);assert.equal(R.numberIn('two hundred and fifty'),250);assert.equal(R.numberIn('1.5k'),1500);
});

test('grounding: an amount, ticker, person or merchant the message does not contain is dropped, never used',()=>{
  const raw='send sam money for pizza';
  const v=R.validate({intent:'send_money',amount_span:'$50',amount_cents:5000,recipient_span:'sam',memo_span:'pizza'},raw);
  assert.equal(v.extraction.amount_cents,undefined);assert.ok(v.problems.some(p=>/amount_span "\$50" is not in the message/.test(p)));
  const w=R.validate({intent:'send_money',amount_span:'forty',amount_cents:5000,recipient_span:'sam'},'pay sam back forty');assert.equal(w.extraction.amount_cents,undefined);assert.match(w.problems[0],/amount_cents 5000 does not match "forty"/);
  const x=R.validate({intent:'buy_security',amount_span:'500 bucks',amount_cents:50000,unit:'dollars',instrument_span:'VOO'},'put 500 bucks in the vanguard s&p fund');assert.equal(x.extraction.instrument_span,undefined,'a ticker the person did not write is dropped');assert.equal(x.extraction.amount_cents,50000);
  const y=R.validate({intent:'buy_security',amount_span:'500',quantity:null,amount_cents:null,unit:null,instrument_span:'VOO'},'buy 500 VOO');assert.equal(y.extraction.ambiguous_number,500);
  assert.equal(R.validate({intent:'wire_everything'},'x').ok,false);
});

test('sloppy texts the regex net missed reach the right flow through the model extraction',async()=>{
  const w=world();const ss=sessions(w);
  const extract=stub({
    'cancle netflix':{intent:'cancel_subscription',merchant_span:'netflix'},
    'pay sam back forty':{intent:'send_money',amount_span:'forty',amount_cents:4000,recipient_span:'sam'},
    'buy five hundred dollars of VOO':{intent:'buy_security',amount_span:'five hundred dollars',amount_cents:50000,unit:'dollars',instrument_span:'VOO'}
  });
  const a=await R.handle('cancle netflix',{extract,sessions:ss,parsers});assert.equal(a.route,'cancel_subscription');assert.equal(a.source,'model');assert.equal(a.result.outcome,'confirm');assert.equal(a.understood_first,true);assert.match(a.result.text,/^Cancel Netflix \(Standard, \$17\.99\/mo\)\./);
  await R.handle('no',{extract,sessions:ss,parsers});
  const b=await R.handle('pay sam back forty',{extract,sessions:ss,parsers});assert.equal(b.route,'send_money');assert.equal(b.result.outcome,'confirm');assert.match(b.result.text,/\$40\.00 to Sam K \(@samk\)/);await R.handle('no',{extract,sessions:ss,parsers});
  const c=await R.handle('buy five hundred dollars of VOO',{extract,sessions:ss,parsers});assert.equal(c.result.outcome,'confirm');assert.equal(c.canonical,'buy $500.00 of VOO');assert.equal(w.writes.length,0,'nothing runs before a yes');
});

test('cross-check: when the model and the regex net read different values, one question is asked and nothing is staged',async()=>{
  const w=world();const ss=sessions(w);
  const raw='send sam $40 for 50 tacos';
  const r=await R.handle(raw,{extract:stub({[raw]:{intent:'send_money',amount_span:'50',amount_cents:5000,recipient_span:'sam',memo_span:'50 tacos'}}),sessions:ss,parsers});
  assert.equal(r.route,'ask');assert.equal(r.result.text,'Did you mean $50.00 or $40.00 for amount?');assert.equal(ss.send.pending,null);assert.equal(w.writes.length,0);
});

test('approvals never come from the model: a reply to a live card goes to the flow\'s own classifier, and the model is not even called',async()=>{
  const w=world();const ss=sessions(w);let calls=0;
  const extract=async raw=>{calls++;return raw==='send sam $40'?{intent:'send_money',amount_span:'$40',amount_cents:4000,recipient_span:'sam'}:{intent:'card_reply'};};
  await R.handle('send sam $40',{extract,sessions:ss,parsers});assert.equal(calls,1);
  const q=await R.handle("hmm what's the fee on that",{extract,sessions:ss,parsers});assert.equal(q.route,'card_reply');assert.equal(q.result.outcome,'ask');assert.equal(w.writes.length,0,'a model card_reply on a question approves nothing');
  const y=await R.handle('yes',{extract,sessions:ss,parsers});assert.equal(calls,2,'yes never reaches the model');assert.equal(y.source,'deterministic');assert.equal(y.result.outcome,'staged');
});

test('the regex net routes alone when the model throws, times out or returns garbage, and says so',async()=>{
  for(const bad of [new Error('overloaded'),{intent:'nonsense'},null]){
    const w=world();const ss=sessions(w);
    const r=await R.handle('cancel netflix',{extract:async()=>{if(bad instanceof Error)throw bad;return bad;},sessions:ss,parsers});
    assert.equal(r.source,'regex_net');assert.equal(r.route,'cancel_subscription');assert.equal(r.result.outcome,'confirm');
  }
  const w=world();const ss=sessions(w);const slow=await R.handle('cancel netflix',{extract:()=>new Promise(res=>setTimeout(()=>res({intent:'other'}),200)),timeout_ms:20,sessions:ss,parsers});assert.equal(slow.source,'regex_net');
  const none=await R.handle("what's a roth ira",{sessions:sessions(world()),parsers});assert.equal(none.route,'fallthrough');
});

test('two cards never stack: a new request drops the other flow\'s live card and says so',async()=>{
  const w=world();const ss=sessions(w);
  const extract=stub({'send sam $40':{intent:'send_money',amount_span:'$40',amount_cents:4000,recipient_span:'sam'},'cancel netflix':{intent:'cancel_subscription',merchant_span:'netflix'}});
  await R.handle('send sam $40',{extract,sessions:ss,parsers});assert.ok(ss.send.pending);
  const c=await R.handle('cancel netflix',{extract,sessions:ss,parsers});assert.equal(ss.send.pending,null,'the send card is dead');assert.ok(ss.cancel.pending);assert.match(c.result.text,/^I dropped the earlier card\. Cancel Netflix/);
  const y=await R.handle('yes',{extract,sessions:ss,parsers});assert.equal(y.flow,'cancel');assert.equal(w.writes.length,1);assert.equal(w.writes[0].id,'BILL-003');
});

test('a stateless host restores every flow from JSON between messages: one yes sends once, a second yes sends nothing, a late yes expires',async()=>{
  const w=world();const extract=stub({'send sam $40':{intent:'send_money',amount_span:'$40',amount_cents:4000,recipient_span:'sam'},'buy $500 of VOO':{intent:'buy_security',amount_span:'$500',amount_cents:50000,unit:'dollars',instrument_span:'VOO'}});
  let store=null;const turn=async text=>{const ss=sessions(w,store);const r=await R.handle(text,{extract,sessions:ss,parsers});store=snap(ss);return r;};
  const a=await turn('send sam $40');assert.equal(a.result.outcome,'confirm');assert.ok(store.send.pending);
  const b=await turn('yes');assert.equal(b.result.outcome,'staged');
  const c=await turn('yes');assert.notEqual(c.result&&c.result.outcome,'staged');assert.equal(w.writes.length,0,'a handoff send writes nothing; it is staged once');
  const d=await turn('buy $500 of VOO');assert.equal(d.result.outcome,'confirm');w.clock.now+=11*MIN;
  const e=await turn('yes');assert.equal(e.result.outcome,'expired');assert.equal(w.writes.length,0,'a stale yes across a restore fires nothing');
  w.clock.now+=MIN;const f=await turn('buy $500 of VOO');assert.equal(f.result.outcome,'confirm');const g=await turn('yes');assert.equal(g.result.outcome,'filled');assert.equal(w.writes.length,1);
  const h=await turn('yes');assert.equal(w.writes.length,1,'no double fill after restore');
});

test('the app the person named survives the model path, and a new request in the same flow replaces its live card instead of stacking',async()=>{
  const two=[{id:'p1',name:'Sam K',handle:'@samk',handles:{venmo:'@samk',zelle:'sam@example.com'},rails:['venmo','zelle'],saved:true,history:[]}];
  assert.equal(R.canonical({intent:'send_money',amount_cents:4000,recipient_span:'sam'},'can you zelle sam forty dollars'),'zelle $40.00 to sam');
  assert.equal(R.canonical({intent:'send_money',amount_cents:4000,recipient_span:'sam'},'send sam $40'),'send $40.00 to sam');
  const w=world();const ss=sessions(w);ss.send=S.create({registry,connectors:w.conn,clock:()=>w.clock.now,people:two,partners:{},limits:{per_day_cents:1000000,per_week_cents:3000000}});
  const z=await R.handle('can you zelle sam forty dollars',{extract:stub({'can you zelle sam forty dollars':{intent:'send_money',amount_span:'forty dollars',amount_cents:4000,unit:'dollars',recipient_span:'sam'}}),sessions:ss,parsers});
  assert.equal(z.result.outcome,'confirm');assert.match(z.result.text,/\$40\.00 to Sam K \(sam@example\.com\) in Zelle/);
  const again=await R.handle('send sam $50',{extract:stub({'send sam $50':{intent:'send_money',amount_span:'$50',amount_cents:5000,unit:'dollars',recipient_span:'sam'}}),sessions:ss,parsers});
  assert.equal(again.result.outcome,'confirm','not "busy"');assert.deepEqual([...again.dropped],['send']);assert.match(again.result.text,/^I dropped the earlier card\. Set up \$50\.00 to Sam K/);
  const y=await R.handle('yes',{extract:null,sessions:ss,parsers});assert.equal(y.result.outcome,'staged');assert.equal(y.result.send.amount_cents,5000,'only the latest card can fire');
});
