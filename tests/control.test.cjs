// Instinct spec docs 01 and 02, the control plane: standing instructions never widen authority, envelopes are bounded per action and per week
// and vanish while paused, corrections are verbatim and applied, undo contracts say what can be taken back, the kill switch stops the loop,
// export carries no secret, deletion has a phrase and a window, onboarding asks once, the changelog answers "what version".
// Check: node --test tests/control.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['33-agent-monitors.js','35-agent-intents.js','36-agent-workflows.js','41-agent-recovery.js','43-agent-loop.js','46-voice.js','48-money-math.js','57-agent-ledger.js','58-agent-control.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.C=AgentControl;this.Loop=AgentLoop;',ctx);
const C=ctx.C,Loop=ctx.Loop;
const same=(a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
const NOW=Date.UTC(2026,9,10,14,0,0);const DAY=86400000;
const registry={get:id=>({'SAVE-001':{id:'SAVE-001',name:'autosave sweep',tier:'T4'},'PAY-001':{id:'PAY-001',name:'send to saved recipient',tier:'T3'},'ACCT-001':{id:'ACCT-001',name:'read balance',tier:'T0'},'PAY-009':{id:'PAY-009',name:'transfer between own accounts',tier:'T4'}}[id]||null),answer:()=>({text:''})};
const connectors=()=>{const calls={write:[],read:[]};return {calls,read:async(...a)=>{calls.read.push(a);return {value:421208,source:'simplefin',as_of:NOW};},write:async(...a)=>{calls.write.push(a);return {reference:'ref-'+calls.write.length};},verify:async()=>({confirmed:true,source:'simplefin'})};};

test('standing instructions: restated in plain words, fire once per period with an idempotency key, respect their own limit, pause and revoke, never fire while paused',()=>{
  const c=C.create();
  assert.throws(()=>c.instructions.create({capability_id:'SAVE-001',text:'move $50 to savings'},NOW),/needs a cadence/);
  const si=c.instructions.create({capability_id:'SAVE-001',text:'Move $50.00 to savings',params:{amount_cents:5000,recipient:'savings'},cadence:'monthly',day:1,max_cents:5000,expires_at:NOW+180*DAY},NOW);
  assert.equal(si.restated,'Move $50.00 to savings, every month on the 1st, never more than $50.00 at a time, until 2027-04-08. Anything that needs your approval still asks; this does not raise your limits.');
  same(c.instructions.due(NOW),[],'the 10th is not the 1st');
  const first=Date.UTC(2026,10,1,9,0,0);const due=c.instructions.due(first);assert.equal(due.length,1);assert.equal(due[0].request.idempotency_key,si.id+':2026-11');assert.equal(due[0].request.cadence_requested,true);assert.equal(due[0].request.params.amount_cents,5000);
  c.instructions.fired(si.id,due[0].period);same(c.instructions.due(first+3600000),[],'a second wake in the same period fires nothing');
  assert.equal(c.instructions.due(Date.UTC(2026,11,1,9,0,0)).length,1,'next month fires again');
  const over=c.instructions.create({capability_id:'PAY-001',text:'Send Marcus $80',params:{amount_cents:8000,recipient:'marcus'},cadence:'weekly',day:1,max_cents:5000},NOW);
  const mon=Date.UTC(2026,9,12,9,0,0);const d2=c.instructions.due(mon);assert.equal(d2.find(x=>x.instruction_id===over.id).request.blocked,"over the instruction's $50.00 limit");
  c.instructions.pause(over.id,NOW);assert.ok(!c.instructions.due(mon).some(x=>x.instruction_id===over.id));c.instructions.resume(over.id,NOW);assert.ok(c.instructions.due(mon).some(x=>x.instruction_id===over.id));c.instructions.revoke(over.id,NOW);assert.equal(c.instructions.get(over.id).status,'revoked');
  c.pause.set('user asked',NOW);same(c.instructions.due(Date.UTC(2026,11,1,9,0,0)),[],'paused: nothing fires');c.pause.clear(NOW+1);
  const tr=c.instructions.create({capability_id:'ACCT-001',text:'Tell me when payroll lands',trigger:'deposit_received'},NOW);assert.equal(c.instructions.triggered('deposit_received',NOW).length,1);assert.match(tr.restated,/when deposit_received/);
});

test('envelopes: granted in the user\'s words with per-action and weekly limits, usage cuts what the loop may do, revoked or paused envelopes vanish, the loop acts inside and asks outside',async()=>{
  const c=C.create();
  assert.throws(()=>c.envelopes.grant({capability_id:'SAVE-001',max_cents:5000},NOW),/user's own words/);
  const e=c.envelopes.grant({capability_id:'SAVE-001',max_cents:5000,max_per_week_cents:12000,describe:'move money to savings',granted_by_text:'you can move up to $50 to savings whenever, max $120 a week',expires_at:NOW+30*DAY},NOW);
  assert.equal(e.restated,'Without asking each time, I may move money to savings up to $50.00 per action and $120.00 per week, until 2026-11-09. You get a receipt after each one. First-time recipients still ask. Say "stop" or "revoke" to end it.');
  const conn=connectors();const memory={outcomes:[]};
  const loop=Loop.create({registry,connectors:conn,clock:()=>NOW,memory,envelopes:now=>c.envelopes.forLoop(loop.memory.outcomes,now),control:c.pause});
  const req=n=>({capability_id:'SAVE-001',key:'sweep-'+n,params:{amount_cents:5000,recipient:'savings'},describe:'move $50.00 to savings'});
  for(let n=1;n<=2;n++){const r=await loop.wake({kind:'event',request:req(n)});assert.equal(r.outcome,'confirmed',`sweep ${n}`);}
  assert.equal(conn.calls.write.length,2);const u=c.envelopes.usage(e.id,loop.memory.outcomes,NOW);same(u,{envelope_id:e.id,used_this_week_cents:10000,actions_this_week:2,remaining_this_week_cents:2000});
  assert.equal(c.envelopes.forLoop(loop.memory.outcomes,NOW)[0].max_cents,2000,'the per-action limit is cut to what is left this week');
  const third=await loop.wake({kind:'event',request:Object.assign(req(3),{confirm:{amount:'$50.00',recipient:'savings'}})});assert.equal(third.outcome,'awaiting_confirmation');assert.equal(loop.log.filter(x=>x.to==='AWAITING_CONFIRMATION').pop().input.reason,'outside_envelope');assert.equal(conn.calls.write.length,2);
  await loop.wake({kind:'confirmation',confirmation_id:third.confirmation_id,approved:false});
  const small=await loop.wake({kind:'event',request:{capability_id:'SAVE-001',key:'sweep-4',params:{amount_cents:2000,recipient:'savings'},describe:'move $20.00 to savings'}});assert.equal(small.outcome,'confirmed','what is left this week still runs without asking');
  c.envelopes.revoke(e.id,NOW);same(c.envelopes.forLoop(loop.memory.outcomes,NOW),[]);
  const after=await loop.wake({kind:'event',request:Object.assign(req(5),{confirm:{amount:'$50.00',recipient:'savings'}})});assert.equal(after.outcome,'awaiting_confirmation');assert.equal(loop.log.filter(x=>x.to==='AWAITING_CONFIRMATION').pop().input.reason,'no_envelope');
});

test('kill switch: paused blocks every tier above a read in the loop, reads still answer, standing instructions and envelopes are empty, resume restores',async()=>{
  const c=C.create();const conn=connectors();
  c.envelopes.grant({capability_id:'SAVE-001',max_cents:5000,granted_by_text:'ok up to $50'},NOW);
  const loop=Loop.create({registry,connectors:conn,clock:()=>NOW,envelopes:now=>c.envelopes.forLoop(loop.memory.outcomes,now),control:c.pause});
  c.pause.set('user said stop',NOW);assert.equal(c.pause.status(NOW).paused,true);assert.match(c.pause.status(NOW).text,/^Paused since 2026-10-10 14:00: I answer questions but take no action/);
  const blocked=await loop.wake({kind:'event',request:{capability_id:'SAVE-001',key:'s1',params:{amount_cents:1000,recipient:'savings'},describe:'move $10'}});assert.equal(blocked.outcome,'blocked');assert.equal(blocked.reason,'paused');assert.match(blocked.message,/I'm paused \(user said stop\), so I did not do that\. Say resume/);assert.equal(conn.calls.write.length,0);assert.equal(loop.state,'IDLE');
  const send=await loop.wake({kind:'message',request:{capability_id:'PAY-001',key:'p1',params:{amount_cents:4000,recipient:'marcus'},describe:'send $40',confirm:{amount:'$40.00',recipient:'Marcus'}}});assert.equal(send.outcome,'blocked','a T3 confirmation is not even asked for while paused');
  const read=await loop.wake({kind:'message',request:{capability_id:'ACCT-001',params:{},lead:v=>'Checking is $4,212.08'}});assert.equal(read.outcome,'answer');
  same(c.envelopes.forLoop([],NOW),[]);
  c.pause.clear(NOW+60000);assert.equal(c.pause.status(NOW+60000).paused,false);
  const ok=await loop.wake({kind:'event',request:{capability_id:'SAVE-001',key:'s2',params:{amount_cents:1000,recipient:'savings'},describe:'move $10'}});assert.equal(ok.outcome,'confirmed');
  const timed=C.create();timed.pause.set('travel',NOW,NOW+2*DAY);assert.equal(timed.pause.paused(NOW+DAY),true);assert.equal(timed.pause.paused(NOW+3*DAY),false,'a timed pause ends on its own');
});

test('corrections are verbatim with the action they corrected and the same wrong value is never proposed again; undo contracts and plans',()=>{
  const c=C.create();
  assert.throws(()=>c.corrections.capture('',{capability_id:'PAY-001'},NOW),/verbatim/);
  const k=c.corrections.capture('not marcus chen, marcus lee from work',{capability_id:'PAY-001',params:{amount_cents:4000,recipient:'marcus chen'}},NOW,{field:'recipient',from:'marcus chen',to:'marcus lee'});
  assert.equal(k.text,'not marcus chen, marcus lee from work');assert.equal(k.action.params.recipient,'marcus chen');
  const a=c.corrections.apply({capability_id:'PAY-001',params:{amount_cents:4000,recipient:'Marcus Chen'}});assert.equal(a.request.params.recipient,'marcus lee');same(a.applied,[{correction_id:k.id,field:'recipient',from:'marcus chen',to:'marcus lee'}]);assert.equal(c.corrections.list()[0].applied,1);
  same(c.corrections.apply({capability_id:'SAVE-001',params:{recipient:'marcus chen'}}).applied,[],'a correction scoped to one capability does not leak');
  assert.equal(C.contract('BILL-003').text,'Can be undone within 30 days: resubscribe or unpause; most merchants restore the same plan within the billing period. If the price changed, the old rate is usually gone; I will say so before you confirm.');
  assert.equal(C.contract('PAY-001').undo.possible,false);assert.match(C.contract('PAY-001').text,/^Cannot be undone\. A P2P send to the wrong person cannot be pulled back/);
  assert.match(C.contract('PAY-011').text,/wire recall is a request, not a right/i);assert.match(C.contract('INV-011').text,/a filled order is final/i);
  assert.match(C.contract('ACCT-001',{tier:'T0'}).text,/^Can be undone: nothing was changed/);assert.match(C.contract('XYZ-001',{tier:'T3'}).text,/^Cannot be undone\. No undo path is on record/);
  const open=C.undoPlan({capability_id:'BILL-003',recorded_at:NOW-5*DAY},NOW);assert.equal(open.possible,true);assert.equal(open.within_days,25);assert.match(open.step,/^Undo: resubscribe/);
  const closed=C.undoPlan({capability_id:'BILL-003',recorded_at:NOW-40*DAY},NOW);assert.equal(closed.possible,false);assert.match(closed.step,/^The 30-day undo window closed 10 day\(s\) ago\. Mitigation:/);
  const never=C.undoPlan({capability_id:'PAY-001',recorded_at:NOW},NOW);assert.equal(never.possible,false);assert.match(never.step,/^Mitigation: a P2P send/);
});

test('export carries no secret and lists every file; deletion needs the phrase, revokes everything and keeps a 7-day window; onboarding asks each question once; the changelog answers version questions',()=>{
  const c=C.create();
  c.envelopes.grant({capability_id:'SAVE-001',max_cents:5000,granted_by_text:'ok'},NOW);c.instructions.create({capability_id:'SAVE-001',text:'sweep',cadence:'daily'},NOW);
  const data={memory:{facts:[{key:'balance',value:1,source:'simplefin',as_of:NOW}],outcomes:[]},log:[{seq:1,to:'IDLE'}],accounts:[{id:'chk',balance_cents:1000,access_token:'tok_123',routing_number:'021000021'}],transactions:[{id:'t1',account_id:'chk',posted_at:'2026-09-01',amount:-12.5,merchant_raw:'CAFE'}],people:[{name:'Marcus',venmo:'@mlee',ssn_last4:'1234'}],connectors:[{id:'simplefin-1',vault_handle:'vh_9'}]};
  const x=c.exportBundle(data,NOW);
  same(Object.keys(x.files).sort(),['accounts.json','control.json','event-log.json','manifest.json','memory.json','people.json','transactions.csv']);
  const all=Object.values(x.files).join('\n');assert.ok(!/tok_123|021000021|1234|vh_9/.test(all),'no token, routing number, identity digits or vault handle in the export');assert.equal(x.manifest.secrets_removed,3);assert.match(x.text,/^Your export has 6 files .* No credentials, tokens or identity numbers are in it \(3 such fields were removed\)\.$/);
  assert.match(x.files['transactions.csv'],/^id,account_id,posted_at,amount,merchant,category,pending,note\nt1,chk,2026-09-01,-12.50,Cafe,dining,posted,$/);
  const plan=c.deletionPlan({connectors:data.connectors},NOW);assert.equal(plan.steps.length,4);same(plan.steps[0].items,['simplefin-1']);assert.equal(plan.steps[1].items.length,2);assert.equal(plan.confirm_phrase,'delete my Upmore account');assert.match(plan.text,/Export first if you want a copy\. Type "delete my Upmore account" to confirm; you have 7 days/);
  assert.equal(c.deletionConfirm('yes delete',NOW).confirmed,false);
  const ok=c.deletionConfirm('Delete my Upmore account',NOW);assert.equal(ok.confirmed,true);assert.equal(ok.purge_after,new Date(NOW+7*DAY).toISOString());assert.ok(c.envelopes.list().every(e=>!e.active));assert.ok(c.instructions.list().every(i=>i.status==='revoked'));
  const o=C.create();let q=o.onboarding.next();assert.equal(q.question,'accounts');assert.equal(q.of,5);
  assert.equal(o.onboarding.answer('accounts',[],NOW).accepted,false);
  q=o.onboarding.answer('accounts',[{institution:'Example Bank',kind:'checking'}],NOW);assert.equal(q.accepted,true);assert.equal(q.question,'goals');
  o.onboarding.answer('goals',[{name:'emergency fund',target_cents:600000}],NOW);o.onboarding.answer('people',['Marcus'],NOW);
  assert.equal(o.onboarding.answer('quiet_hours',{start:22},NOW).ask_again,'Two hours, 0 to 23.');o.onboarding.answer('quiet_hours',{start:22,end:7},NOW);
  const done=o.onboarding.answer('autonomy','nothing',NOW);assert.equal(done.done,true);same(done.preferences.quiet_hours,{start:22,end:7});assert.equal(o.onboarding.next().done,true);same(o.onboarding.progress(),{answered:5,of:5,done:true});
  const log=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8');const v=C.version(log);assert.equal(v.version,'0.3.0');assert.equal(v.date,'2026-10-10');assert.match(v.text,/^Upmore 0\.3\.0 \(2026-10-10\): Ledger and analytics/);
  const wn=C.whatsNew(log,'0.1.0');same(wn.versions,['0.3.0','0.2.0']);assert.ok(wn.changes.length>=6);assert.match(C.whatsNew(log,'0.3.0').text,/^Nothing new since 0\.3\.0\.$/);
  const f=C.create();assert.throws(()=>f.freezes.record('Equifax','frozen',NOW,'PIN 123456'),/Never store a freeze PIN/);f.freezes.record('Equifax','frozen',NOW,'password manager');f.freezes.record('Experian','frozen',NOW);const st=f.freezes.status();assert.equal(st.all_frozen,false);assert.equal(st.text,'Equifax: frozen, Experian: frozen, TransUnion: unknown.');
  f.credentials.record('simplefin-1','password',NOW-200*DAY,180);f.credentials.record('plaid-1','password',NOW-10*DAY,180);const due=f.credentials.due(NOW);assert.equal(due.length,1);assert.match(due[0].text,/^simplefin-1 password: last rotated 200 days ago; your interval is 180 days\. I never see or store the new one\.$/);
});
