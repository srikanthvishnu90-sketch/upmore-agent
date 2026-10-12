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
vm.runInContext(['33-agent-monitors.js','35-agent-intents.js','41-agent-recovery.js','42-agent-recipients.js','43-agent-loop.js','45-advice-guard.js','46-voice.js','47-data-guard.js','48-money-math.js','49-agent-save.js','50-agent-invest.js','53-compliance.js','54-agent-money.js','64-agent-send.js','65-agent-realworld.js','66-agent-trade.js','67-agent-cards.js','68-agent-cancel.js','69-agent-router.js','81-standing-rent.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.R=AgentRouter;this.T=AgentTrade;this.X=AgentCancel;this.S=AgentSend;this.C=Compliance;this.SR=StandingRent;this.Rec=AgentRecipients;',ctx);
const {R,T,X,S,C,SR,Rec}=ctx;
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
  assert.equal(R.TOOL.input_schema.properties.intent.enum.join(),'buy_security,sell_security,manage_order,cancel_subscription,send_money,split_expense,card_reply,other');
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
  assert.equal(R.tidy('cancle netflix'),'cancel netflix');assert.equal(R.tidy('buy 100 of nvda rn pls'),'buy 100 of nvda');assert.equal(R.tidy('Split dinner 142.60 with 3 friends!!'),'Split dinner 142.60 with 3 friends');
  assert.equal(R.tidy('what is my balance?'),'what is my balance?','a question mark is kept');assert.equal(R.tidy('123456'),'123456','a code is never touched');
  const w=world();const ss=sessions(w);
  const extract=stub({
    // A misspelled leading verb is fixed before the model sees it (AgentRouter.tidy), so the model is asked about the clean text.
    'cancel netflix':{intent:'cancel_subscription',merchant_span:'netflix'},
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

// Live finding 2026-10-11 (spec16 item 15): with the router model down, "pay my rent" went to the person-to-person flow
// (a recipient called "rent") and was answered "How much?". A bill is not a person: the safety net leaves bills to the
// bill workflow, and a bill word in the memo still pays the person.
test('safety net: a bill is not a person; a bill word in the memo still pays the person',async()=>{
  const down=async()=>{throw new Error('router model HTTP 400');};
  for(const t of ['pay my rent','pay rent','pay my electric bill','pay my mortgage','pay my bills','pay my phone bill','pay my credit card']){
    const r=await R.handle(t,{extract:down,sessions:sessions(world()),parsers}).catch(e=>({error:String(e)}));
    assert.ok(!r||r.route!=='send_money',`${t} -> ${r&&r.route}`);
  }
  for(const t of ['pay sam for rent','pay sam $40','venmo sam 40 for the electric bill']){
    const g=await R.handle(t,{extract:down,sessions:sessions(world()),parsers}).catch(e=>({error:String(e)}));
    assert.equal(g&&g.route,'send_money',t);
  }
});

// Live gauntlet, 2026-10-12 (gpt-5-nano, the deployed handler): the model returned these extractions and the flows asked
// "How much?" / "Cancel what?", a dispute photo got the brokerage link, and a bare "no" reached the model. Each case
// below is the model's real omission, replayed through the real flows.
test('live 2026-10-12: a detail the model dropped is filled from the regex net, so the card goes up instead of "How much?"',async()=>{
  const w=world(),ss=sessions(w);
  const extract=stub({
    'send sam $40':{intent:'send_money',recipient_span:'sam',amount_span:null,amount_cents:null},
    'venmo sam 40 for pizza':{intent:'send_money',recipient_span:'sam',memo_span:'pizza'},
    'pay sam back forty':{intent:'send_money',recipient_span:'sam'},
    'can u cancel netflix':{intent:'cancel_subscription',merchant_span:null}, // the router tidies "for me" off before the model reads it
  });
  const a=await R.handle('send sam $40',{extract,sessions:ss,parsers});
  assert.equal(a.result.outcome,'confirm',a.result.text);assert.match(a.result.text,/\$40\.00 to Sam K/);assert.deepEqual(Array.from(a.filled_from_net),['amount']);
  await R.handle('no',{extract,sessions:ss,parsers});
  const b=await R.handle('venmo sam 40 for pizza',{extract,sessions:ss,parsers});
  assert.equal(b.result.outcome,'confirm',b.result.text);assert.match(b.result.text,/\$40\.00 to Sam K/);
  await R.handle('no',{extract,sessions:ss,parsers});
  const c=await R.handle('pay sam back forty',{extract,sessions:ss,parsers});
  assert.equal(c.result.outcome,'confirm',c.result.text);assert.match(c.result.text,/\$40\.00/);
  await R.handle('no',{extract,sessions:ss,parsers});
  const d=await R.handle('can u cancel netflix for me',{extract,sessions:ss,parsers});
  assert.equal(d.result.outcome,'confirm',d.result.text);assert.match(d.result.text,/^Cancel Netflix/);
  assert.equal(w.writes.length,0,'nothing runs before a yes');
});

test('live 2026-10-12: a model reading two different amounts still asks; the net only fills what is missing',async()=>{
  const w=world(),ss=sessions(w);
  const a=await R.handle('send sam $40',{extract:stub({'send sam $40':{intent:'send_money',recipient_span:'sam',amount_span:'$40',amount_cents:4000}}),sessions:ss,parsers});
  assert.deepEqual(Array.from(a.filled_from_net),[],'nothing filled when the model read it');
  assert.equal(a.result.outcome,'confirm');
});

test('live 2026-10-12: "dispute this charge" is never an order, whatever the model says',async()=>{
  const w=world(),ss=sessions(w);
  const r=await R.handle('dispute this charge',{extract:stub({'dispute this charge':{intent:'manage_order'}}),sessions:ss,parsers});
  assert.equal(r.route,'fallthrough');assert.equal(r.reason,'not an order');
  const p=await R.handle('show my portfolio',{extract:stub({'show my portfolio':{intent:'manage_order'}}),sessions:ss,parsers});
  assert.notEqual(p.route,'fallthrough','a real portfolio ask still goes to the trade flow');
});

test('live 2026-10-12: a bare "no" with no live card drops what was asked and says nothing happened, never the model',async()=>{
  const w=world(),ss=sessions(w);let calls=0;
  const extract=async raw=>{calls++;return raw==='send sam'?{intent:'send_money',recipient_span:'sam'}:{intent:'other'};};
  const ask=await R.handle('send sam',{extract,sessions:ss,parsers});
  assert.equal(ask.result.outcome,'ask');
  const n0=calls;
  const no=await R.handle('no',{extract,sessions:ss,parsers});
  assert.equal(no.source,'deterministic');assert.equal(calls,n0,'no model call');
  assert.match(no.result.text,/^Okay(, dropped)?\. Nothing (was sent, bought or cancelled|is waiting on you, and nothing was changed)\.$/);
  const again=await R.handle('nope',{extract,sessions:ss,parsers});
  assert.equal(again.result.text,'Okay. Nothing is waiting on you, and nothing was changed.');
  assert.equal(w.writes.length,0);
});

// Monthly rent as a standing flow (81-standing-rent.js; real-world C110; spec 16 item S16-15). "pay my rent" goes to the
// rent flow from the words alone (no model call, whatever the model would have said); "pay sam 900 for rent" stays a send
// to Sam; the card's yes goes to the rent flow's own classifier; a second yes stages nothing again.
const RENT_RULE={id:'sp-1',kind:'rent',payee_name:'Sam K',payee_handle:'@samk',rail:'venmo',amount_cents:90000,day_of_month:1,funding:'checking',status:'active',created_at:'2026-09-01T00:00:00Z',last_staged_month:null};
function withRent(w,rule,state){const ss=sessions(w,state);ss.rent=SR.create({clock:()=>w.clock.now,rule,recipients:Rec.book({people,clock:()=>w.clock.now}),state:state&&state.rent});return ss;}
test('rent: "pay my rent" routes to the standing rent flow with no model call; "pay sam 900 for rent" stays a send to Sam',async()=>{
  let calls=0;const model=async raw=>{calls++;return raw==='pay sam 900 for rent'?{intent:'send_money',amount_span:'900',amount_cents:90000,recipient_span:'sam',memo_span:'rent'}:{intent:'send_money',recipient_span:'rent'};};
  for(const t of ['pay my rent','pls pay the rent','stop rent','rent is 1500 now']){
    const r=await R.handle(t,{extract:model,sessions:withRent(world(),null),parsers});
    assert.equal(r.route,'pay_rent',t);assert.equal(r.flow,'rent',t);assert.equal(r.source,'deterministic',t);
  }
  assert.equal(calls,0,'rent never costs a model call and never reaches the person-to-person send');
  const ask=await R.handle('pay my rent',{extract:model,sessions:withRent(world(),null),parsers});
  assert.equal(ask.result.text,"Who do you pay rent to, how much, and which day of the month? e.g. 'Mike $1,450 on the 1st via Zelle'");
  assert.equal(ask.understood_first,true,'no rent on file is a data gap, not a misunderstanding');
  const send=await R.handle('pay sam 900 for rent',{extract:model,sessions:withRent(world(),null),parsers});
  assert.equal(send.route,'send_money');assert.equal(send.flow,'send');assert.match(send.result.text,/\$900\.00 to Sam K/);
  const down=async()=>{throw new Error('router model HTTP 400');};
  const net=await R.handle('pay sam 900 for rent',{extract:down,sessions:withRent(world(),null),parsers});
  assert.equal(net.route,'send_money','with the model down too');
  assert.ok(R.maybeFlow('rent is 1500 now')&&R.maybeFlow('stop rent'),'the pre-filter lets rent commands reach the router');
});
test('rent: the answer, the card and the yes stay in the rent flow; the month is staged for the person to send, once; a live send card is dropped',async()=>{
  const w=world();w.clock.now=Date.UTC(2026,9,29,14);const extract=async()=>({intent:'other'});
  let ss=withRent(w,null);
  await R.handle('pay my rent',{extract,sessions:ss,parsers});
  const card=await R.handle('Sam K $900 on the 1st',{extract,sessions:ss,parsers});
  assert.equal(card.route,'card_reply');assert.equal(card.flow,'rent');assert.equal(card.note,'follow-up');
  assert.match(card.result.text,/^Set up rent: \$900\.00 to Sam K on Venmo, monthly on the 1st, from checking, for you to send each month\./);
  const yes=await R.handle('yes',{extract,sessions:ss,parsers});
  assert.equal(yes.flow,'rent');assert.equal(yes.result.outcome,'rent_set');
  // While the rent question is open, a new request is that request, never the rent answer.
  const open=withRent(w,null);await R.handle('pay my rent',{extract,sessions:open,parsers});
  const other=await R.handle('send sam $40',{extract:stub({'send sam $40':{intent:'send_money',amount_span:'$40',amount_cents:4000,recipient_span:'sam'}}),sessions:open,parsers});
  assert.equal(other.flow,'send');assert.match(other.result.text,/\$40\.00 to Sam K/);assert.equal(open.rent.pending,null,'no rent card from a send');
  assert.equal(JSON.parse(JSON.stringify(ss.rent.drain()))[0].op,'insert');
  // Rent on file (as the host reloads it), with a send card live: "pay my rent" drops the send card and puts up November's.
  const memo={};ss=withRent(w,RENT_RULE);
  await R.handle('send sam $40',{extract:stub({'send sam $40':{intent:'send_money',amount_span:'$40',amount_cents:4000,recipient_span:'sam'}}),sessions:ss,parsers,memo});
  assert.ok(ss.send.pending,'a send card is live');
  const month=await R.handle('pay my rent',{extract,sessions:ss,parsers,memo});
  assert.equal(ss.send.pending,null);assert.match(month.result.text,/^I dropped the earlier card\. Rent for November: \$900\.00 to Sam K on Venmo, due Nov 1/);
  const staged=await R.handle('yes',{extract,sessions:ss,parsers,memo});
  assert.equal(staged.flow,'rent');assert.equal(staged.result.outcome,'staged');assert.match(staged.result.text,/Staged, not sent\. In Venmo:/);
  assert.equal(w.writes.length,0,'no rail was written: the person sends it');
  const second=await R.handle('yes',{extract,sessions:ss,parsers,memo:staged.memo});
  assert.equal(second.result.outcome,'already_done');assert.match(second.result.text,/^That's already staged: \$900\.00 to Sam K for you to send in Venmo\. A second yes doesn't stage it again\./);
});

// Megadoc G01 "what do I own" and G06 "what's my biggest position": questions, so they used to fall to the model; the
// live portfolio read answers them now, with no model call, and the biggest position is ranked by the read's own values.
test('portfolio questions reach the live read with no model: "what do I own", "what\'s my biggest position" ranked, an unvalued holding said',async()=>{
  const w=world();const base=w.conn.read;let rows=[{symbol:'PLTR',qty:18.5,market_value_cents:76035},{symbol:'VOO',qty:2,market_value_cents:102420},{symbol:'F',qty:10,market_value_cents:12000}];
  w.conn.read=async(kind,p)=>kind==='holdings'?{value:rows,source:'Example Broker',as_of:w.clock.now}:base(kind,p);
  const ss=sessions(w);const none=async()=>{throw new Error('no model call for a portfolio question');};
  const a=await R.handle('what do I own',{extract:none,sessions:ss,parsers});
  assert.equal(a.result.outcome,'answer');assert.match(a.result.text,/^Portfolio in Schwab brokerage, Example Broker, as of \d\d:\d\d UTC: 18\.5 PLTR \(\$760\.35\), 2 VOO \(\$1,024\.20\), 10 F \(\$120\.00\)\. Buying power \$10,000\.00\.$/);
  const b=await R.handle("what's my biggest position",{extract:none,sessions:ss,parsers});
  assert.match(b.result.text,/^Your biggest position is VOO: \$1,024\.20, 53\.8% of your positions' value\.\nPortfolio in Schwab brokerage/);
  const c=await R.handle("what's my smallest holding",{extract:none,sessions:ss,parsers});
  assert.match(c.result.text,/^Your smallest position is F: \$120\.00, 6\.3% of your positions' value\./);
  rows=[{symbol:'PLTR',qty:18.5,market_value_cents:76035},{symbol:'XYZ',qty:1}];
  const d=await R.handle("what's my biggest position",{extract:none,sessions:ss,parsers});
  assert.match(d.result.text,/^I can't rank your positions: the read doesn't carry a value for XYZ\.\n/);
  assert.equal(w.writes.length,0,'nothing is placed');
  // Still questions for the model: a stock's price, how to invest.
  for(const q of ['what is a position in poker','how do i own a house'])assert.equal((await R.handle(q,{extract:none,sessions:ss,parsers})).route,'fallthrough',q);
});

// Megadoc E16 "what's my order status" and E18 "did my buy fill?": the order this chat placed, read back from the broker
// now and said as its record says, with no model call; nothing placed, nothing promised.
test('order status: the order this chat placed, read back now (filled, working, unreadable), and none placed is said',async()=>{
  const w=world();const ss=sessions(w);const none=async()=>{throw new Error('no model call for an order status');};
  const n=await R.handle("what's my order status",{extract:none,sessions:ss,parsers});
  assert.equal(n.result.text,"I don't see an order placed from this chat, so there's none to read back. Your brokerage app lists every order.");
  const ex=stub({'buy $5 of VOO':{intent:'buy_security',amount_span:'$5',amount_cents:500,unit:'dollars',instrument_span:'VOO'}});
  await R.handle('buy $5 of VOO',{extract:ex,sessions:ss,parsers});await R.handle('yes',{extract:ex,sessions:ss,parsers});
  assert.equal(w.writes.length,1);
  const a=await R.handle('did my buy fill?',{extract:none,sessions:ss,parsers});
  assert.match(a.result.text,/^Filled: bought [\d.]+ VOO at \$512\.10, \$\d+\.\d\d total, order ref-1, filled \d\d:\d\d UTC, per Example Broker \(as of \d\d:\d\d UTC\)\.$/);
  w.records['ref-1'].status='working';
  const b=await R.handle('is my VOO order filled',{extract:none,sessions:ss,parsers});
  assert.match(b.result.text,/^Not filled yet: order ref-1 \(buy [\d.]+ VOO\) is working, per Example Broker \(as of \d\d:\d\d UTC\)\. Ask again anytime, or say "cancel my VOO order" to cancel it\.$/);
  delete w.records['ref-1'];
  const c=await R.handle("what's my order status",{extract:none,sessions:ss,parsers});
  assert.match(c.result.text,/^I can't read order ref-1 \(buy [\d.]+ VOO\) back right now\. When I last read it, it was working\. Try again in a minute, or check your brokerage app\.$/);
  assert.equal(w.writes.length,1,'a status question places nothing');
});

// Megadoc G09 "what's NVDA trading at": the broker's own quote, with its source and time, nothing staged, no model call.
test('a quote question reads the broker quote and stages nothing; an unknown ticker or no quote is said; "price of gas" is not a ticker',async()=>{
  const w=world();const ss=sessions(w);const none=async()=>{throw new Error('no model call for a quote');};
  const a=await R.handle("what's VOO trading at",{extract:none,sessions:ss,parsers});
  assert.equal(a.result.outcome,'answer');
  assert.match(a.result.text,/^VOO \(Vanguard S&P 500 ETF\): \$512\.10 \(Example Quotes, \d\d:\d\d UTC\)\. That's the price a buy would pay right now; it moves while the market is open\.$/);
  const b=await R.handle('how much is vti a share',{extract:none,sessions:ss,parsers});assert.match(b.result.text,/^VTI \(Vanguard Total Stock Market ETF\): \$512\.10 /);
  const c=await R.handle("what's ZZZZ trading at",{extract:none,sessions:ss,parsers});assert.match(c.result.text,/^I don't know the ticker "ZZZZ"\./);
  const base=w.conn.read;w.conn.read=async(k,p)=>k==='quote'?null:base(k,p);
  const d=await R.handle("what's VOO trading at",{extract:none,sessions:ss,parsers});assert.equal(d.result.text,'I have no quote for VOO right now. Ask again in a moment.');
  w.conn.read=base;
  assert.equal(w.writes.length,0,'a quote stages and places nothing');
  assert.notEqual((await R.handle("what's the price of gas",{extract:none,sessions:ss,parsers})).route,'manage_order');
});

// Megadoc G03 "how much did I make on NVDA": the held shares' cost from the broker's average entry against their value
// now; a month or a common word after "make in/on" is never a ticker and never reaches an order.
test('a gain question reads the position\'s cost basis; "how much did I make in August" never becomes an order',async()=>{
  const w=world();const base=w.conn.read;
  w.conn.read=async(k,p)=>k==='holdings'?{value:[{symbol:'VOO',qty:2,avg_entry_cents:45000,market_value_cents:102420}],source:'Example Broker',as_of:w.clock.now}:base(k,p);
  const ss=sessions(w);const none=async()=>{throw new Error('no model call for a gain question');};
  const a=await R.handle('how much did I make on VOO',{extract:none,sessions:ss,parsers});
  assert.match(a.result.text,/^VOO: up \$124\.20 \(\+13\.8%\) on the 2 shares you hold\. They cost \$900\.00 \(average \$450\.00 a share, per Example Broker\) and are worth \$1,024\.20 now \(as of \d\d:\d\d UTC\)\. That's unrealized: shares you sold earlier and dividends aren't in this read\.$/);
  for(const q of ['how much did i make in august','how much did i make on my house','how much did i make last month']){const r=await R.handle(q,{extract:async()=>({intent:'other'}),sessions:ss,parsers});assert.notEqual(r.route,'manage_order',q);assert.ok(!r.result||!/how much\?/i.test(r.result.text||''),q);}
  assert.equal(w.writes.length,0);
});

// Megadoc B05 "make it 50 dollars", C12 "split it", P14 "the other one": with nothing open, asked back with no model call
// and nothing changed; with a card open, "make it 50" still changes that card.
test('follow-ups with nothing open are asked back; with a card open, "make it 50" still corrects it',async()=>{
  const w=world();const ss0=sessions(w);const memo={};const ss=ss0;const none=async()=>{throw new Error('no model call for a follow-up with nothing open');};
  const H=(t,x)=>R.handle(t,Object.assign({extract:none,sessions:ss,parsers,memo},x||{}));
  assert.equal((await R.handle('make it 50 dollars',{extract:none,sessions:ss,parsers})).result.text,'Make what $50.00? Nothing is open; say it in full, like "send Maya $50".');
  assert.match((await R.handle('split it',{extract:none,sessions:ss,parsers})).result.text,/^Split what\? /);
  assert.match((await R.handle('the other one',{extract:none,sessions:ss,parsers})).result.text,/^Which one\? I don't have a list open/);
  const ex=stub({'send sam 40':{intent:'send_money',amount_span:'40',amount_cents:4000,recipient_span:'sam'}});
  const a=await R.handle('send sam 40',{extract:ex,sessions:ss,parsers});assert.equal(a.result.outcome,'confirm');
  const b=await R.handle('make it 50',{extract:ex,sessions:ss,parsers});assert.equal(b.route,'card_reply');assert.match(b.result.text,/\$50\.00 to Sam K/);
  assert.equal(w.writes.length,0);
  // After a card is settled, "make it 60" names it and starts nothing.
  await H('yes',{extract:ex});const n=w.writes.length;
  assert.match((await H('make it 60')).result.text,/^Make what \$60\.00\? The last one, \$50\.00 to Sam K, is already done; say a new one in full/);
  assert.equal(w.writes.length,n);
  // Answering with a name puts up a card for that amount to them; it still needs its own yes (corpus 1.03).
  const c2=await H('sam');assert.equal(c2.result.outcome,'confirm');assert.match(c2.result.text,/\$60\.00 to Sam K/);
  assert.equal(w.writes.length,n,'nothing is sent before a yes');
  await H('no');
});

// Megadoc B07 "send maya 50 and make it 5": two amounts with no correction word are asked, no card; the answer starts that
// send. A self-correction ("no wait, make it 5") still takes the last number.
test('two amounts in one message are asked; the answer picks one; a correction still takes the last',async()=>{
  const w=world();const ss=sessions(w);const memo={};const ex=async(t)=>({intent:'send_money',amount_span:(/\d+/.exec(t)||[''])[0],recipient_span:'sam'});
  const H=t=>R.handle(t,{extract:ex,sessions:ss,parsers,memo});
  const a=await H('send sam 50 and make it 5');assert.equal(a.result.outcome,'ask');assert.equal(a.result.text,'$50.00 or $5.00?');assert.equal(w.writes.length,0);
  const b=await H('5');assert.equal(b.result.outcome,'confirm');assert.match(b.result.text,/\$5\.00 to Sam K/);await H('no');
  const c=await H('send sam 50 no wait make it 5');assert.match(c.result.text,/^Using 5, your last number\. /);await H('no');
  assert.equal(w.writes.length,0);
});
