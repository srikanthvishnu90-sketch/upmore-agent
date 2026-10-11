// Depth protocol, CORE-005 autonomy envelopes: one test per sub-capability (docs/depth/CORE-005.md), each tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Domain loads from UPMORE_DOMAIN_DIR when set.
// Check: node --test tests/depth-CORE-005.test.cjs && node evals/depth/run.cjs CORE-005
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const domainDir=process.env.UPMORE_DOMAIN_DIR||path.join(root,'packages/domain');
const ctx=vm.createContext({});
vm.runInContext(['35-agent-intents.js','43-agent-loop.js','46-voice.js','48-money-math.js','58-agent-control.js'].map(f=>fs.readFileSync(path.join(domainDir,f),'utf8')).join('\n')+'\nthis.C=AgentControl;this.Loop=AgentLoop;',ctx);
const C=ctx.C,Loop=ctx.Loop;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const T0=Date.UTC(2026,9,10,14,0,0);const DAY=86400000;
const caps={'SAVE-001':{tier:'T4',name:'autosave sweep'},'PAY-009':{tier:'T4',name:'transfer between own accounts'},'PAY-001':{tier:'T3',name:'send to saved recipient'},'PAY-002':{tier:'T5',name:'send to new recipient'}};
const registry={get:id=>caps[id]?Object.assign({id,status:'TESTED'},caps[id]):null,answer:id=>({text:`${id} is not available.`})};
function rail(){const r={writes:[]};r.conn={read:async()=>({value:1,source:'x',as_of:T0}),write:async(id,p,key)=>{r.writes.push({key,params:p});return {reference:'ref-'+r.writes.length};},verify:async(id,key,ref)=>({confirmed:true,source:'Example Bank',reference:ref})};return r;}
const sweep=(n,amount,extra)=>Object.assign({capability_id:'SAVE-001',key:'sweep-'+n,params:{amount_cents:amount,recipient:'savings'},describe:`move ${(amount/100).toFixed(2)} to savings`,confirm:{amount:`$${(amount/100).toFixed(2)}`,recipient:'savings'}},extra||{});
function world(extra){const c=C.create();const r=rail();const t={now:T0};const loop=Loop.create(Object.assign({registry,connectors:r.conn,clock:()=>t.now,envelopes:now=>c.envelopes.forLoop(loop.memory.outcomes,now),control:c.pause},extra||{}));return {c,r,t,loop};}
const earn=(c,cap)=>{for(let i=0;i<3;i++)c.envelopes.clean(cap);};
const grant=(c,now,over)=>c.envelopes.grant(Object.assign({capability_id:'SAVE-001',tier:'T4',max_cents:5000,max_per_week_cents:12000,recipient:'savings',describe:'move money to savings',granted_by_text:'you can move up to $50 to savings whenever, max $120 a week'},over||{}),now);
const asked=(loop)=>loop.log.filter(e=>e.to==='AWAITING_CONFIRMATION').length;

test('[S01] a grant needs the user\'s own words and a positive per-action limit, and is restated with every limit',()=>{
  const {c}=world();earn(c,'SAVE-001');
  assert.throws(()=>c.envelopes.grant({capability_id:'SAVE-001',tier:'T4',max_cents:5000},T0),/user's own words/);
  assert.throws(()=>c.envelopes.grant({capability_id:'SAVE-001',tier:'T4',granted_by_text:'ok do whatever'},T0),/positive per-action limit/);
  assert.throws(()=>c.envelopes.grant({capability_id:'SAVE-001',tier:'T4',max_cents:0,granted_by_text:'ok'},T0),/positive per-action limit/);
  const e=grant(c,T0,{expires_at:T0+30*DAY});
  assert.match(e.restated,/^Without asking each time, I may move money to savings to savings up to \$50\.00 per action and \$120\.00 per week, until 2026-11-09\. You get a receipt after each one\. First-time recipients still ask\./);
  assert.equal(e.granted_by_text,'you can move up to $50 to savings whenever, max $120 a week');assert.equal(e.max_cents,5000);assert.equal(e.max_per_week_cents,12000);assert.equal(e.recipient,'savings');
});

test('[S02] an envelope is offered only after three clean confirmations of the same capability and shape; a correction resets the count; before the offer a grant is refused',()=>{
  const {c}=world();
  assert.throws(()=>grant(c,T0),/offered after three clean confirmations of SAVE-001; 0 so far/);
  c.envelopes.clean('SAVE-001');c.envelopes.clean('SAVE-001');assert.equal(c.envelopes.offer('SAVE-001',null,5000),null,'two is not three');assert.throws(()=>grant(c,T0),/2 so far/);
  c.envelopes.correction('SAVE-001');c.envelopes.clean('SAVE-001');assert.equal(c.envelopes.offer('SAVE-001',null,5000),null,'a correction reset the count');assert.throws(()=>grant(c,T0),/1 so far/);
  c.envelopes.clean('SAVE-001');c.envelopes.clean('SAVE-001');assert.equal(c.envelopes.offer('SAVE-001',null,5000),'I can just do this under $50.00 from now on, with a receipt each time. Want that?');
  const e=grant(c,T0);assert.ok(e.id);assert.equal(c.envelopes.offer('SAVE-001',null,5000),null,'granted: no second offer');
  assert.throws(()=>grant(c,T0,{capability_id:'PAY-009',describe:'move between my accounts'}),/offered after three clean confirmations of PAY-009; 0 so far/,'the ladder is per capability');
});

test('[S03] inside the envelope the action runs with no question and the receipt says so and how to stop',async()=>{
  const {c,r,loop}=world();earn(c,'SAVE-001');const e=grant(c,T0);
  const a=await loop.wake({kind:'event',request:sweep(1,4000)});assert.equal(a.outcome,'confirmed');assert.equal(asked(loop),0);assert.equal(r.writes.length,1);assert.equal(a.envelope_id,e.id);
  assert.equal(a.message,`Done: move 40.00 to savings (ref ref-1). Confirmed by Example Bank. No question asked because of your envelope ${e.id}; say stop to end it.`);
  assert.equal(loop.memory.outcomes[0].envelope_id,e.id);assert.equal(loop.memory.outcomes[0].amount_cents,4000);
});

test('[S04] the per-action limit is checked against the exact params written: one cent over asks, and a summary that lies asks',async()=>{
  const {c,r,loop}=world();earn(c,'SAVE-001');grant(c,T0);
  const over=await loop.wake({kind:'event',request:sweep(1,5001)});assert.equal(over.outcome,'awaiting_confirmation');assert.equal(loop.log.filter(e=>e.to==='AWAITING_CONFIRMATION').pop().input.reason,'outside_envelope');assert.equal(r.writes.length,0);await loop.wake({kind:'confirmation',confirmation_id:over.confirmation_id,approved:false});
  const lie=await loop.wake({kind:'event',request:Object.assign(sweep(2,9000),{amount_cents:100})});assert.equal(lie.outcome,'awaiting_confirmation','the summary says $1.00, the params say $90.00');assert.equal(r.writes.length,0);await loop.wake({kind:'confirmation',confirmation_id:lie.confirmation_id,approved:false});
  const exact=await loop.wake({kind:'event',request:sweep(3,5000)});assert.equal(exact.outcome,'confirmed','the limit itself is inside');assert.equal(r.writes.length,1);
});

test('[S05] the weekly cap cuts what remains: after $100 of a $120 week a $40 sweep asks and a $20 one runs; the audit names what is left',async()=>{
  const {c,r,loop,t}=world();earn(c,'SAVE-001');const e=grant(c,T0);
  for(const [n,amt] of [[1,5000],[2,5000]]){t.now+=60000;const a=await loop.wake({kind:'event',request:sweep(n,amt)});assert.equal(a.outcome,'confirmed',`sweep ${n}`);}
  same(c.envelopes.usage(e.id,loop.memory.outcomes,t.now),{envelope_id:e.id,used_this_week_cents:10000,actions_this_week:2,remaining_this_week_cents:2000});
  assert.equal(c.envelopes.forLoop(loop.memory.outcomes,t.now)[0].max_cents,2000);
  const big=await loop.wake({kind:'event',request:sweep(3,4000)});assert.equal(big.outcome,'awaiting_confirmation');assert.equal(r.writes.length,2);await loop.wake({kind:'confirmation',confirmation_id:big.confirmation_id,approved:false});
  const small=await loop.wake({kind:'event',request:sweep(4,2000)});assert.equal(small.outcome,'confirmed');assert.equal(r.writes.length,3);
  assert.match(c.envelopes.report(loop.memory.outcomes,t.now).text,/\$0\.00 left this week/);
  const spent=await loop.wake({kind:'event',request:sweep(5,100)});assert.equal(spent.outcome,'awaiting_confirmation','a spent envelope asks for a single dollar');
});

test('[S06] a recipient-bound envelope asks for anyone else, even at a fitting amount',async()=>{
  const {c,r,loop}=world();earn(c,'SAVE-001');grant(c,T0);
  const other=await loop.wake({kind:'event',request:Object.assign(sweep(1,4000),{params:{amount_cents:4000,recipient:'checking'}})});assert.equal(other.outcome,'awaiting_confirmation');assert.equal(loop.log.pop().input.reason,'outside_envelope');assert.equal(r.writes.length,0);
});

test('[S07] a first-time recipient is never inside an envelope',async()=>{
  const {c,r,loop}=world();earn(c,'SAVE-001');grant(c,T0);
  const first=await loop.wake({kind:'event',request:Object.assign(sweep(1,4000),{first_time:true})});assert.equal(first.outcome,'awaiting_confirmation');assert.equal(loop.log.pop().input.reason,'first_time_is_T5');assert.equal(r.writes.length,0);
});

test('[S08] an expired envelope asks; the grant stated its date; a renewal is a new grant in the user\'s words',async()=>{
  const {c,r,loop,t}=world();earn(c,'SAVE-001');const e=grant(c,T0);assert.match(e.restated,/until 2027-01-08/);
  t.now=T0+90*DAY+1;const late=await loop.wake({kind:'event',request:sweep(1,4000)});assert.equal(late.outcome,'awaiting_confirmation');assert.equal(loop.log.pop().input.reason,'no_envelope');assert.equal(r.writes.length,0);await loop.wake({kind:'confirmation',confirmation_id:late.confirmation_id,approved:false});
  same(c.envelopes.forLoop(loop.memory.outcomes,t.now),[]);
  assert.throws(()=>grant(c,t.now),/offered after three clean confirmations/,'a renewal is earned again, not assumed');earn(c,'SAVE-001');const again=grant(c,t.now,{granted_by_text:'yes keep doing the $50 sweeps'});assert.equal(again.granted_by_text,'yes keep doing the $50 sweeps');
  t.now+=60000;assert.equal((await loop.wake({kind:'event',request:sweep(2,4000)})).outcome,'confirmed');
});

test('[S09] "stop", "revoke" and "end the envelope" end it before the next action; "revoke all" ends every envelope; the reply names what ended',async()=>{
  const {c,r,loop}=world();earn(c,'SAVE-001');const e=grant(c,T0);
  const cmd=c.envelopes.command('stop',T0);same(cmd.revoked,[e.id]);assert.equal(cmd.text,'Ended the "move money to savings" envelope. I ask before every one of those again.');
  const a=await loop.wake({kind:'event',request:sweep(1,4000)});assert.equal(a.outcome,'awaiting_confirmation');assert.equal(r.writes.length,0);await loop.wake({kind:'confirmation',confirmation_id:a.confirmation_id,approved:false});
  assert.equal(c.envelopes.command('stop',T0).text,'No envelope was active.');assert.equal(c.envelopes.command('how are you',T0),null,'not every message is a command');
  earn(c,'SAVE-001');grant(c,T0);earn(c,'PAY-009');grant(c,T0,{capability_id:'PAY-009',describe:'move between my accounts',recipient:null});
  const which=c.envelopes.command('revoke',T0);same(which.revoked,[]);assert.match(which.text,/^Which one: move money to savings or move between my accounts\? Say "revoke all"/);
  const all=c.envelopes.command('revoke all',T0);assert.equal(all.revoked.length,2);assert.match(all.text,/^Ended 2 envelopes: move money to savings; move between my accounts\. I ask before every action again\.$/);
  assert.ok(c.envelopes.list().every(x=>!x.active));
  earn(c,'SAVE-001');grant(c,T0);assert.equal(c.envelopes.command('end the move money to savings envelope',T0).revoked.length,1);
});

test('[S10] paused means no envelope: the action is blocked without asking; resume restores the envelope unchanged',async()=>{
  const {c,r,loop}=world();earn(c,'SAVE-001');const e=grant(c,T0);
  c.pause.set('user said stop',T0);same(c.envelopes.forLoop(loop.memory.outcomes,T0),[]);
  const b=await loop.wake({kind:'event',request:sweep(1,4000)});assert.equal(b.outcome,'blocked');assert.equal(b.reason,'paused');assert.equal(asked(loop),0);assert.equal(r.writes.length,0);
  c.pause.clear(T0+1);assert.equal(c.envelopes.forLoop(loop.memory.outcomes,T0+1)[0].id,e.id);assert.equal((await loop.wake({kind:'event',request:sweep(2,4000)})).outcome,'confirmed');
});

test('[S11] an envelope never lowers a tier: grants for T3 and T5 capabilities are refused, and a T5 action asks even if an envelope names it',async()=>{
  const {c,r}=world();earn(c,'PAY-001');earn(c,'PAY-002');
  assert.throws(()=>c.envelopes.grant({capability_id:'PAY-001',tier:'T3',max_cents:5000,granted_by_text:'you can send Sarah $50 whenever'},T0),/Only a T4 capability can run under an envelope; PAY-001 is T3: sends to people and first-time recipients are confirmed every time\./);
  assert.throws(()=>c.envelopes.grant({capability_id:'PAY-002',tier:'T5',max_cents:5000,granted_by_text:'ok'},T0),/PAY-002 is T5/);
  assert.throws(()=>c.envelopes.grant({capability_id:'PAY-001',max_cents:5000,granted_by_text:'ok'},T0),/of unknown tier/);
  const loop=Loop.create({registry,connectors:r.conn,clock:()=>T0,envelopes:[{id:'bypass',capability_id:'PAY-002',max_cents:100000,active:true}]});
  const t5=await loop.wake({kind:'message',request:{capability_id:'PAY-002',key:'x',params:{amount_cents:4000,recipient:'dave'},describe:'send $40 to Dave',confirm:{amount:'$40.00',recipient:'Dave'}}});assert.equal(t5.outcome,'awaiting_confirmation');assert.equal(r.writes.length,0);
  const t3=await Loop.create({registry,connectors:r.conn,clock:()=>T0,envelopes:[{id:'bypass',capability_id:'PAY-001',max_cents:100000,active:true}]}).wake({kind:'message',request:{capability_id:'PAY-001',key:'y',params:{amount_cents:4000,recipient:'p1'},describe:'send $40 to Sarah',confirm:{amount:'$40.00',recipient:'Sarah'}}});assert.equal(t3.outcome,'awaiting_confirmation');assert.equal(r.writes.length,0);
});

test('[S12] a standing instruction does not widen an envelope: inside the limits it runs, outside them it confirms',async()=>{
  const {c,r,loop}=world();earn(c,'SAVE-001');grant(c,T0);
  const big=c.instructions.create({capability_id:'SAVE-001',text:'Move $200 to savings',params:{amount_cents:20000,recipient:'savings'},cadence:'daily'},T0);
  const small=c.instructions.create({capability_id:'SAVE-001',text:'Move $40 to savings',params:{amount_cents:4000,recipient:'savings'},cadence:'daily'},T0);
  const due=c.instructions.due(T0);assert.equal(due.length,2);
  const rb=await loop.wake({kind:'event',request:due.find(d=>d.instruction_id===big.id).request});assert.equal(rb.outcome,'awaiting_confirmation');assert.equal(loop.log.pop().input.reason,'outside_envelope');assert.equal(r.writes.length,0);await loop.wake({kind:'confirmation',confirmation_id:rb.confirmation_id,approved:false});
  const rs=await loop.wake({kind:'event',request:due.find(d=>d.instruction_id===small.id).request});assert.equal(rs.outcome,'confirmed');assert.equal(r.writes.length,1);
});

test('[S13] every envelope action is in the audit with date, amount and reference, plus what is left this week',async()=>{
  const {c,loop,t}=world();earn(c,'SAVE-001');const e=grant(c,T0);
  await loop.wake({kind:'event',request:sweep(1,4000)});t.now=T0+DAY;await loop.wake({kind:'event',request:sweep(2,3000)});
  const rep=c.envelopes.report(loop.memory.outcomes,t.now);const row=rep.envelopes.find(x=>x.envelope_id===e.id);
  same(row.actions.map(a=>[a.at,a.amount_cents,a.reference]),[['2026-10-10',4000,'ref-1'],['2026-10-11',3000,'ref-2']]);assert.equal(row.remaining_this_week_cents,5000);
  assert.equal(rep.text,'On my own this week: 2026-10-10 $40.00 (ref ref-1), 2026-10-11 $30.00 (ref ref-2) under "move money to savings". Live envelopes: move money to savings up to $50.00 per action, $50.00 left this week. Say stop to end one.');
  assert.equal(C.create().envelopes.report([],T0).text,'Nothing ran on its own this week. No envelope is live; I ask before every action.');
});

test('[S14] a surprise suspends the envelope and resets the ladder; the next action asks; it resumes only in the user\'s words',async()=>{
  const {c,r,loop}=world();earn(c,'SAVE-001');const e=grant(c,T0);
  assert.equal((await loop.wake({kind:'event',request:sweep(1,4000)})).outcome,'confirmed');
  const s=c.envelopes.surprise(e.id,T0+60000,'wait, why did you move $40?');assert.equal(s.text,'I\'ve paused the "move money to savings" envelope: nothing runs under it until you say so. The $50.00 limit is still on record; say "resume the envelope" to restore it, or "revoke" to end it.');
  const a=await loop.wake({kind:'event',request:sweep(2,4000)});assert.equal(a.outcome,'awaiting_confirmation');assert.equal(r.writes.length,1);await loop.wake({kind:'confirmation',confirmation_id:a.confirmation_id,approved:false});
  assert.equal(c.envelopes.offer('SAVE-001',null,5000),null,'the ladder reset');assert.equal(c.state.ladder['SAVE-001|*'].clean,0);
  assert.throws(()=>c.envelopes.resume(e.id,T0+120000),/user's own words/);c.envelopes.resume(e.id,T0+120000,'resume the envelope, that one was fine');
  assert.equal((await loop.wake({kind:'event',request:sweep(3,4000)})).outcome,'confirmed');assert.equal(r.writes.length,2);
});

test('[S15] the thread always knows an envelope is acting: the grant is restated with how to stop, each receipt says no question was asked, and the live envelopes are listable',async()=>{
  const {c,loop}=world();earn(c,'SAVE-001');const e=grant(c,T0);
  assert.match(e.restated,/Say "stop" or "revoke" to end it\.$/);
  const a=await loop.wake({kind:'event',request:sweep(1,4000)});assert.match(a.message,/No question asked because of your envelope env-\d+; say stop to end it\.$/);
  assert.match(c.envelopes.report(loop.memory.outcomes,T0).text,/Live envelopes: move money to savings up to \$50\.00 per action, \$80\.00 left this week\. Say stop to end one\.$/);
  c.envelopes.command('stop',T0);assert.match(c.envelopes.report(loop.memory.outcomes,T0).text,/No envelope is live; I ask before every action\.$/);
});

test('[ADV] the adversarial log in docs/depth/CORE-005.md, every row',async()=>{
  const {c,r,loop,t}=world();earn(c,'SAVE-001');earn(c,'PAY-001');
  assert.throws(()=>c.envelopes.grant({capability_id:'SAVE-001',tier:'T4',granted_by_text:'ok do whatever'},T0),/positive per-action limit/);
  assert.throws(()=>c.envelopes.grant({capability_id:'PAY-001',tier:'T3',max_cents:5000,granted_by_text:'you can send Sarah $50 whenever'},T0),/Only a T4 capability/);
  const e=grant(c,T0);
  assert.equal((await loop.wake({kind:'event',request:Object.assign(sweep(1,9000),{amount_cents:100})})).outcome,'awaiting_confirmation');await loop.wake({kind:'confirmation',confirmation_id:loop.pendingConfirmation().id,approved:false});
  assert.equal((await loop.wake({kind:'event',request:sweep(2,5000)})).outcome,'confirmed');t.now+=60000;assert.equal((await loop.wake({kind:'event',request:sweep(3,5000)})).outcome,'confirmed');t.now+=60000;assert.equal((await loop.wake({kind:'event',request:sweep(4,5000)})).outcome,'awaiting_confirmation','$150 of $120');await loop.wake({kind:'confirmation',confirmation_id:loop.pendingConfirmation().id,approved:false});
  c.envelopes.command('stop',t.now);assert.equal((await loop.wake({kind:'event',request:sweep(5,1000)})).outcome,'awaiting_confirmation');await loop.wake({kind:'confirmation',confirmation_id:loop.pendingConfirmation().id,approved:false});
  earn(c,'SAVE-001');const e2=grant(c,t.now);c.pause.set('stop',t.now);assert.equal((await loop.wake({kind:'event',request:sweep(6,1000)})).outcome,'blocked');c.pause.clear(t.now);
  t.now=T0+91*DAY;assert.equal((await loop.wake({kind:'event',request:sweep(7,1000)})).outcome,'awaiting_confirmation','day 91');await loop.wake({kind:'confirmation',confirmation_id:loop.pendingConfirmation().id,approved:false});
  earn(c,'SAVE-001');const e3=grant(c,t.now);assert.equal((await loop.wake({kind:'event',request:Object.assign(sweep(8,1000),{params:{amount_cents:1000,recipient:'checking'}})})).outcome,'awaiting_confirmation');await loop.wake({kind:'confirmation',confirmation_id:loop.pendingConfirmation().id,approved:false});
  assert.equal((await loop.wake({kind:'event',request:sweep(9,1000)})).outcome,'confirmed');c.envelopes.surprise(e3.id,t.now,'wait, why did you move $10?');assert.equal((await loop.wake({kind:'event',request:sweep(10,1000)})).outcome,'awaiting_confirmation');await loop.wake({kind:'confirmation',confirmation_id:loop.pendingConfirmation().id,approved:false});
  c.envelopes.resume(e3.id,t.now,'resume it');const si=c.instructions.create({capability_id:'SAVE-001',text:'Move $200 to savings',params:{amount_cents:20000,recipient:'savings'},cadence:'daily'},t.now);
  assert.equal((await loop.wake({kind:'event',request:c.instructions.due(t.now).find(d=>d.instruction_id===si.id).request})).outcome,'awaiting_confirmation','an instruction cannot widen the envelope');
  assert.equal(r.writes.length,3,'only the three in-envelope sweeps ever wrote');
});
