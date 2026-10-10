const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const AgentLoop=require(path.join(root,'packages/domain/43-agent-loop.js'));
const Registry=require(path.join(root,'packages/capabilities/registry.js'));
const realRegistry=Registry.load(JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8')),rel=>fs.existsSync(path.join(root,rel)));

// A small registry whose entries are proven, so the gate exercises tiers rather than build status.
const caps={ 'ACCT-001':{tier:'T0',name:'read balance'}, 'PAY-001':{tier:'T3',name:'send to saved recipient'},
  'SAVE-001':{tier:'T4',name:'autosave rules'}, 'PAY-002':{tier:'T5',name:'send to new recipient'},
  'CARD-015':{tier:'T2',name:'APR reduction request draft'}, 'PAY-012':{tier:'T3',name:'Zelle',status:'GATED',gate_reason:'needs a bank partner'} };
const registry={get:id=>caps[id]?Object.assign({id,status:'TESTED'},caps[id]):null, answer:id=>({text:`${caps[id].name} is blocked: ${caps[id].gate_reason}`})};
function fakeConnectors(o){
  const calls={read:[],write:[],verify:[]};
  const c={calls,readFails:!!o.readFails,writeThrows:!!o.writeThrows,
    read:async(id,p)=>{calls.read.push([id,p]);if(c.readFails)throw new Error('connector down');return {value:421208,source:'Example Bank',as_of:o.asOf||1000};},
    write:async(id,p,key)=>{calls.write.push([id,p,key]);if(c.writeThrows)throw new Error('socket closed');return {reference:'ref-'+calls.write.length};},
    verify:async(id,key,ref)=>{calls.verify.push([id,key,ref]);return o.verify===undefined?{confirmed:true,source:'Example Bank'}:o.verify;}};
  return c;
}
const clockAt=t=>()=>t.now;
const send={capability_id:'PAY-001',key:'marcus-40',params:{amount_cents:4000,recipient:'marcus'},describe:'send $40.00 to Marcus',confirm:{action:'send',amount:'$40.00',recipient:'Marcus',from:'checking',fee:null,when:'now'}};

test('T0 balance question: answers with the number, source and as-of time; the fact is remembered',async()=>{
  const t={now:5000};const c=fakeConnectors({asOf:4000});
  const loop=AgentLoop.create({registry,connectors:c,clock:clockAt(t),freshness_ms:60000});
  const r=await loop.wake({kind:'message',request:{capability_id:'ACCT-001',params:{account:'checking'},lead:v=>`Your checking is at $${(v/100).toFixed(2)}`}});
  assert.equal(r.outcome,'answer');assert.match(r.message,/\$4212\.08 \(Example Bank, as of 1970-01-01T00:00:04\.000Z\)/);assert.equal(r.stale,false);
  assert.equal(loop.memory.facts.length,1);assert.equal(loop.memory.facts[0].source,'Example Bank');assert.equal(loop.state,'IDLE');
  assert.deepEqual(loop.log.map(e=>e.to),['OBSERVING','DECIDING','IDLE']);
});

test('stale data is said in the same sentence; a failed read answers with the last good value labeled stale',async()=>{
  const t={now:5000};const c=fakeConnectors({asOf:1000});
  const loop=AgentLoop.create({registry,connectors:c,clock:clockAt(t),freshness_ms:1000});
  let r=await loop.wake({kind:'message',request:{capability_id:'ACCT-001'}});
  assert.match(r.message,/which is stale/);
  c.readFails=true;t.now=9000;
  r=await loop.wake({kind:'message',request:{capability_id:'ACCT-001'}});
  assert.match(r.message,/421208/);assert.match(r.message,/stale/);assert.match(r.message,/connector is down/);assert.equal(r.down,true);
  const empty=AgentLoop.create({registry,connectors:fakeConnectors({readFails:true}),clock:clockAt(t)});
  r=await empty.wake({kind:'message',request:{capability_id:'ACCT-001'}});
  assert.match(r.message,/could not read read balance and have no earlier value/);
});

test('T3 send waits for confirmation restating amount, recipient, account, fee and timing; then writes once with an idempotency key and verifies',async()=>{
  const t={now:100};const c=fakeConnectors({});
  const loop=AgentLoop.create({registry,connectors:c,clock:clockAt(t)});
  const r=await loop.wake({kind:'message',request:send});
  assert.equal(r.outcome,'awaiting_confirmation');assert.equal(loop.state,'AWAITING_CONFIRMATION');
  assert.match(r.message,/Confirm: send \$40\.00 to Marcus from checking, no fee, now\. Reply yes/);
  assert.equal(c.calls.write.length,0);
  const busy=await loop.wake({kind:'message',request:{capability_id:'ACCT-001'}});assert.equal(busy.outcome,'busy');
  const bad=await loop.wake({kind:'confirmation',confirmation_id:'confirm-999',approved:true});assert.equal(bad.outcome,'mismatch');assert.equal(c.calls.write.length,0);
  const done=await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});
  assert.equal(done.outcome,'confirmed');assert.match(done.message,/Done: send \$40\.00 to Marcus \(ref ref-1\)\. Confirmed by Example Bank/);
  assert.equal(c.calls.write.length,1);assert.equal(c.calls.write[0][2],'PAY-001:marcus-40');assert.equal(c.calls.verify.length,1);
  assert.deepEqual(loop.log.map(e=>e.to),['OBSERVING','DECIDING','AWAITING_CONFIRMATION','ACTING','VERIFYING','IDLE']);
  assert.equal(loop.memory.outcomes[0].result,'confirmed');assert.equal(loop.state,'IDLE');
});

test('declining a confirmation changes nothing and is remembered',async()=>{
  const c=fakeConnectors({});const loop=AgentLoop.create({registry,connectors:c,clock:clockAt({now:1})});
  const r=await loop.wake({kind:'message',request:send});
  const d=await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:false});
  assert.equal(d.outcome,'declined');assert.equal(c.calls.write.length,0);assert.equal(loop.memory.outcomes[0].result,'declined');assert.equal(loop.state,'IDLE');
});

test('T4 acts without confirmation inside the envelope, asks outside it, at the limit is inside, first-time recipient always asks',async()=>{
  const env=[{id:'env-1',capability_id:'SAVE-001',max_cents:5000,recipient:'savings'}];
  const mk=()=>{const c=fakeConnectors({});return {c,loop:AgentLoop.create({registry,connectors:c,clock:clockAt({now:1}),envelopes:env})};};
  let {c,loop}=mk();
  let r=await loop.wake({kind:'event',request:{capability_id:'SAVE-001',key:'sweep-1',params:{amount_cents:5000,recipient:'savings'},amount_cents:5000,recipient:'savings',describe:'move $50.00 to savings'}});
  assert.equal(r.outcome,'confirmed');assert.equal(c.calls.write.length,1);assert.match(r.message,/Done: move \$50\.00 to savings/);
  ({c,loop}=mk());
  r=await loop.wake({kind:'event',request:{capability_id:'SAVE-001',params:{amount_cents:5001},amount_cents:5001,recipient:'savings',confirm:{amount:'$50.01',recipient:'savings'}}});
  assert.equal(r.outcome,'awaiting_confirmation');assert.equal(c.calls.write.length,0);assert.equal(loop.log.find(e=>e.to==='AWAITING_CONFIRMATION').input.reason,'outside_envelope');
  ({c,loop}=mk());
  r=await loop.wake({kind:'event',request:{capability_id:'SAVE-001',amount_cents:100,recipient:'cousin'}});
  assert.equal(r.outcome,'awaiting_confirmation');assert.equal(loop.log.find(e=>e.to==='AWAITING_CONFIRMATION').input.reason,'outside_envelope');
  ({c,loop}=mk());
  r=await loop.wake({kind:'event',request:{capability_id:'SAVE-001',amount_cents:100,recipient:'savings',first_time:true}});
  assert.equal(r.outcome,'awaiting_confirmation');assert.equal(loop.log.find(e=>e.to==='AWAITING_CONFIRMATION').input.reason,'first_time_is_T5');
  const none=AgentLoop.create({registry,connectors:fakeConnectors({}),clock:clockAt({now:1})});
  r=await none.wake({kind:'event',request:{capability_id:'SAVE-001',amount_cents:100,recipient:'savings'}});
  assert.equal(r.outcome,'awaiting_confirmation');assert.equal(none.log.find(e=>e.to==='AWAITING_CONFIRMATION').input.reason,'no_envelope');
  const expired=AgentLoop.create({registry,connectors:fakeConnectors({}),clock:clockAt({now:10}),envelopes:[{...env[0],expires_at:5}]});
  r=await expired.wake({kind:'event',request:{capability_id:'SAVE-001',amount_cents:100,recipient:'savings'}});
  assert.equal(r.outcome,'awaiting_confirmation');
});

test('T5 always asks even with an envelope; T2 drafts never send; GATED and unbuilt capabilities are refused honestly',async()=>{
  const c=fakeConnectors({});
  const loop=AgentLoop.create({registry,connectors:c,clock:clockAt({now:1}),envelopes:[{id:'e',capability_id:'PAY-002',max_cents:1e9}]});
  let r=await loop.wake({kind:'message',request:{capability_id:'PAY-002',amount_cents:1,recipient:'new'}});
  assert.equal(r.outcome,'awaiting_confirmation');
  await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:false});
  r=await loop.wake({kind:'message',request:{capability_id:'CARD-015',params:{letter:'Please lower my APR'},describe:'APR letter'}});
  assert.equal(r.outcome,'awaiting_confirmation');assert.equal(r.draft_only,true);assert.match(r.message,/Nothing is sent until you approve/);
  const a=await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});
  assert.equal(a.outcome,'draft_approved');assert.equal(c.calls.write.length,0);assert.equal(loop.memory.outcomes.pop().result,'draft_approved');
  r=await loop.wake({kind:'message',request:{capability_id:'PAY-012'}});
  assert.equal(r.outcome,'blocked');assert.equal(r.reason,'gated');assert.match(r.message,/needs a bank partner/);
  r=await loop.wake({kind:'message',request:{capability_id:'NOPE-001'}});
  assert.equal(r.outcome,'blocked');assert.equal(r.reason,'unknown_capability');assert.match(r.message,/not something Upmore can do/);
  const real=AgentLoop.create({registry:realRegistry,connectors:c,clock:clockAt({now:1})});
  r=await real.wake({kind:'message',request:{capability_id:'PAY-001'}});
  assert.equal(r.outcome,'blocked');assert.equal(r.reason,'not_built');assert.match(r.message,/planned but not built yet/);
  assert.equal(c.calls.write.length,0);
});

test('a crashed send is recovered from the event log without a second execution',async()=>{
  const t={now:100};const c=fakeConnectors({});const persisted=[];
  const first=AgentLoop.create({registry,connectors:c,clock:clockAt(t),persist:e=>persisted.push(e)});
  const r=await first.wake({kind:'message',request:send});
  // Crash right after the write is issued: simulate by a connector whose verify never returns before the process dies.
  c.verify=async()=>{throw new Error('process died');};
  const crashed=await first.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});
  assert.equal(crashed.outcome,'unknown');assert.equal(c.calls.write.length,1);assert.match(crashed.message,/could not confirm whether send \$40\.00 to Marcus went through\. I have not retried/);
  assert.equal(first.state,'FOLLOW_UP_SCHEDULED');
  // Restart from the persisted log with a healthy connector: reconcile, never re-send.
  c.verify=async(id,key,ref)=>{c.calls.verify.push([id,key,ref]);return {confirmed:true,source:'Example Bank'};};
  const second=AgentLoop.create({registry,connectors:c,clock:clockAt(t),log:persisted.slice()});
  assert.equal(second.state,'FOLLOW_UP_SCHEDULED');
  const rec=await second.wake({kind:'follow_up'});
  assert.equal(rec.outcome,'confirmed');assert.equal(c.calls.write.length,1,'no double execution');
  assert.equal(c.calls.verify[c.calls.verify.length-1][1],'PAY-001:marcus-40');assert.equal(second.state,'IDLE');
  // A duplicate delivery of the same request after recovery is answered as already done, never re-confirmed or re-sent.
  const again=await second.wake({kind:'message',request:send});
  assert.equal(again.outcome,'already_done');assert.match(again.message,/already done earlier \(ref ref-1\)\. I did not do it again/);
  assert.equal(c.calls.write.length,1,'same idempotency key never writes twice');assert.equal(second.state,'IDLE');
});

test('approval gaps: confirmations expire, the envelope is checked against the values written, money confirmations must restate amount and recipient',async()=>{
  const t={now:1000};let c=fakeConnectors({});
  let loop=AgentLoop.create({registry,connectors:c,clock:clockAt(t),confirm_ttl_ms:60000});
  let r=await loop.wake({kind:'message',request:send});
  t.now=1000+60001;
  let x=await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});
  assert.equal(x.outcome,'expired');assert.match(x.message,/expired after 1 minutes, so I did not act/);assert.equal(c.calls.write.length,0);assert.equal(loop.state,'IDLE');
  assert.equal(loop.memory.outcomes.pop().result,'confirmation_expired');
  // Envelope: the caller's summary says $1.00 but the params that would be written say $90.00.
  c=fakeConnectors({});loop=AgentLoop.create({registry,connectors:c,clock:clockAt({now:1}),envelopes:[{id:'e',capability_id:'SAVE-001',max_cents:5000}]});
  r=await loop.wake({kind:'event',request:{capability_id:'SAVE-001',amount_cents:100,params:{amount_cents:9000},confirm:{amount:'$90.00',recipient:'savings'}}});
  assert.equal(r.outcome,'awaiting_confirmation');assert.equal(loop.log.find(e=>e.to==='AWAITING_CONFIRMATION').input.reason,'outside_envelope');assert.equal(c.calls.write.length,0);
  // Money confirmation without the exact amount and recipient is refused before anything is asked.
  c=fakeConnectors({});loop=AgentLoop.create({registry,connectors:c,clock:clockAt({now:1})});
  r=await loop.wake({kind:'message',request:{capability_id:'PAY-001',params:{amount_cents:4000,recipient:'marcus'},describe:'send $40'}});
  assert.equal(r.outcome,'blocked');assert.equal(r.reason,'confirmation_incomplete');assert.equal(loop.state,'IDLE');assert.equal(c.calls.write.length,0);
  // Re-approving a completed key is answered as already done at the moment of the ask, with no second confirmation prompt.
  c=fakeConnectors({});loop=AgentLoop.create({registry,connectors:c,clock:clockAt({now:1})});
  r=await loop.wake({kind:'message',request:send});await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});
  const dup=await loop.wake({kind:'message',request:send});
  assert.equal(dup.outcome,'already_done');assert.equal(dup.confirmation_id,undefined);assert.equal(c.calls.write.length,1);
  const fresh=await loop.wake({kind:'message',request:{...send,key:'marcus-40-second'}});
  assert.equal(fresh.outcome,'awaiting_confirmation','a new key is a new action');
});

test('a write failure stops without a blind retry and reports the outcome as unknown',async()=>{
  const c=fakeConnectors({writeThrows:true});const loop=AgentLoop.create({registry,connectors:c,clock:clockAt({now:1})});
  const r=await loop.wake({kind:'message',request:send});
  const u=await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});
  assert.equal(u.outcome,'unknown');assert.equal(c.calls.write.length,1);assert.equal(loop.state,'FOLLOW_UP_SCHEDULED');
  assert.equal(loop.memory.outcomes[0].result,'unknown');assert.equal(loop.memory.outcomes[0].error,'socket closed');
  c.writeThrows=false;
  const f=await loop.wake({kind:'follow_up'});
  assert.equal(c.calls.write.length,1,'reconcile reads back, never writes again');assert.equal(f.outcome,'confirmed');
});

test('a rail rejection is reported as failed, not unknown and not success',async()=>{
  const c=fakeConnectors({verify:{confirmed:false,reason:'insufficient funds'}});const loop=AgentLoop.create({registry,connectors:c,clock:clockAt({now:1})});
  const r=await loop.wake({kind:'message',request:send});
  const f=await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});
  assert.equal(f.outcome,'failed');assert.match(f.message,/did not go through \(insufficient funds\), per the rail\. Nothing posted on their side/);assert.equal(loop.state,'IDLE');
});

test('decision order: a fraud alert preempts a queued proactive message; a direct request beats a watch; silence is the default',async()=>{
  const loop=AgentLoop.create({registry,connectors:fakeConnectors({}),clock:clockAt({now:1})});
  let r=await loop.wake({kind:'event',safety:[{text:'A $900 charge at a merchant you have never used posted at 3:12 am.'}],proactive:[{key:'p',text:'Switch to a HYSA',reason:'earns $18/month more'}]});
  assert.equal(r.outcome,'alert');assert.equal(r.priority,'high');assert.match(r.message,/\$900 charge/);
  r=await loop.wake({kind:'message',request:{capability_id:'ACCT-001'},watches:[{key:'w',text:'Checking dipped below $500'}]});
  assert.equal(r.outcome,'answer');
  r=await loop.wake({kind:'event',watches:[{key:'w',text:'Checking dipped below $500'}]});
  assert.equal(r.outcome,'notify');assert.match(r.message,/\(you asked me to watch this\)/);
  r=await loop.wake({kind:'event'});
  assert.equal(r.outcome,'silent');
  r=await loop.wake({kind:'event',commitments:[{due_at:9,ask:'not due yet'}]});
  assert.equal(r.outcome,'silent','a future commitment is not acted on early');
  r=await loop.wake({kind:'event',commitments:[{due_at:1,ask:'Your Chase bonus deadline is tomorrow; move the deposit?'}],watches:[{key:'w',text:'x'}]});
  assert.equal(r.outcome,'ask');assert.match(r.message,/Chase bonus/);
});

test('proactivity budget: one per day, four per week, urgent and deadlines bypass, every message carries its reason',()=>{
  const B=AgentLoop.budgetAllows,DAY=86400000;
  assert.equal(B([],{reason:'saves $18/month'},0).allowed,true);
  assert.equal(B([],{text:'x'},0).reason,'no_stated_reason');
  assert.equal(B([DAY-1],{reason:'r'},DAY).reason,'daily_budget');
  assert.equal(B([0,DAY,2*DAY,3*DAY],{reason:'r'},5*DAY).reason,'weekly_budget');
  assert.equal(B([0,DAY,2*DAY,3*DAY],{reason:'r',urgent:true},5*DAY).reason,'urgent');
  assert.equal(B([0,DAY,2*DAY,3*DAY],{reason:'r',deadline:5*DAY+DAY},5*DAY).reason,'deadline');
  assert.equal(B([0,DAY,2*DAY,3*DAY],{reason:'r',deadline:5*DAY+5*DAY},5*DAY).reason,'weekly_budget');
  assert.equal(B([0,DAY,2*DAY,3*DAY],{reason:'r',cadence_requested:true},5*DAY).reason,'cadence_requested');
  assert.equal(B([0,DAY,2*DAY,3*DAY],{reason:'r'},8*DAY).allowed,true,'the week window rolls');
});

test('the budget is enforced inside the loop and suppressed items are reported, not dropped silently',async()=>{
  const t={now:0};const loop=AgentLoop.create({registry,connectors:fakeConnectors({}),clock:clockAt(t)});
  let r=await loop.wake({kind:'event',proactive:[{key:'a',text:'A',reason:'saves $5'},{key:'b',text:'B',reason:'saves $9'}]});
  assert.equal(r.outcome,'notify');assert.match(r.message,/^A \(saves \$5\)/);
  r=await loop.wake({kind:'event',proactive:[{key:'b',text:'B',reason:'saves $9'}]});
  assert.equal(r.outcome,'silent');assert.deepEqual(r.suppressed,[{key:'b',reason:'daily_budget'}]);
  t.now=86400000+1;
  r=await loop.wake({kind:'event',proactive:[{key:'b',text:'B',reason:'saves $9'}]});
  assert.equal(r.outcome,'notify');
});

test('memory: facts need source and as-of, corrections are stored verbatim, every transition is logged with inputs and outputs',async()=>{
  const c=fakeConnectors({});const loop=AgentLoop.create({registry,connectors:c,clock:clockAt({now:1})});
  assert.throws(()=>loop.remember('facts',{value:1}),/source and an as-of time/);
  assert.throws(()=>loop.remember('outcomes',{correction:{text:'no'}}),/verbatim/);
  assert.throws(()=>loop.remember('secrets',{}),/Unknown memory store/);
  loop.remember('outcomes',{capability_id:'PAY-001',result:'confirmed',correction:'I said Marcus Lee, not Marcus Chen'});
  assert.equal(loop.memory.outcomes[0].correction,'I said Marcus Lee, not Marcus Chen');
  loop.remember('relationships',{name:'Marcus Lee',handle:'$marcuslee'});loop.remember('preferences',{quiet_hours:'22-07'});
  const r=await loop.wake({kind:'message',request:send});await loop.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});
  for(const e of loop.log){assert.ok(AgentLoop.STATES.includes(e.to));assert.ok('input'in e&&'output'in e&&typeof e.seq==='number'&&typeof e.at==='number');}
  assert.deepEqual(loop.log.map(e=>e.seq),loop.log.map((_,i)=>i+1));
  assert.equal(loop.log.find(e=>e.to==='ACTING').input.idempotency_key,'PAY-001:marcus-40');
  assert.equal(loop.log[loop.log.length-1].output.outcome,'confirmed');
});

test('a pending confirmation does not survive a restart as something executable',async()=>{
  const c=fakeConnectors({});const persisted=[];const t={now:1};
  const first=AgentLoop.create({registry,connectors:c,clock:clockAt(t),persist:e=>persisted.push(e)});
  const r=await first.wake({kind:'message',request:send});
  const second=AgentLoop.create({registry,connectors:c,clock:clockAt(t),log:persisted.slice()});
  const res=await second.wake({kind:'confirmation',confirmation_id:r.confirmation_id,approved:true});
  assert.equal(res.outcome,'lost_pending');assert.equal(c.calls.write.length,0);assert.equal(second.state,'IDLE');
});
