'use strict';
// Frozen before exercising recovery/commit races. Actual raw text entry,
// native PostgreSQL and controlled provider bytes, never a quality evaluation.
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./interview-entry-fixture.cjs')(),N=require('./native-controlled-provider.cjs');
const TEXT='Help me explain my class calculator honestly.';
function seed(){F.seed();F.sql(`insert into agent_flow_state(thread_id,user_id,state)values('${F.T}','${F.U}',${F.q({career:require('../helpers/career-model-fixture.cjs').initial(F.U)})}::jsonb)`);N.fund(F);}
async function app(t,p,timeoutMs=5000){return await F.app(t,{env:N.env,dependencies:{nativePair:{request:p.request,timeoutMs,evidenceLabel:'CONTROLLED_NATIVE_RESPONSES'}}});}
const send=(a,key='native-authority')=>a.requestBody({thread_id:F.T,turn_key:key,message:TEXT});
const exec=()=>JSON.parse(F.sql(`select value from career_watch_kv where user_id='${F.U}'and key like 'career:native-execution:%'limit 1`));
function fault(on){F.sql(on?"create function native_reject_save()returns trigger language plpgsql as $$begin if NEW.role='assistant'then raise exception 'CONTROLLED native commit fault';end if;return NEW;end$$;create trigger native_reject_save before insert on agent_messages for each row execute function native_reject_save();":"drop trigger native_reject_save on agent_messages;drop function native_reject_save();");}
function newer(){const key='newer-owned',hash='b'.repeat(64),l=F.call('career_host_load',{p_user:F.U,p_thread:F.T,p_key:key,p_hash:hash}),s=l.snapshot;s.stores.conversationState.safetyMarker='NEWER OWNED VALUE';assert.ok(F.call('career_host_commit',{p_user:F.U,p_thread:F.T,p_key:key,p_hash:hash,p_revision:l.revision,p_account_version:l.accountVersion,p_snapshot:s,p_patch:{},p_input:'Newer owned turn',p_response:{thread_id:F.T,turn_key:key,reply:'Newer owned value saved.',action:null,reminders:[]}}).response);}
test('accepted native provider result survives an atomic save fault without another dispatch on exact retry',async t=>{
 seed();const p=N.provider(),a=await app(t,p);fault(true);try{assert.equal((await send(a)).status,503);assert.equal(p.calls.length,2);assert.equal(F.sql('select count(*)from agent_messages'),'0');assert.equal(F.sql("select count(*)from career_watch_kv where key like 'career:native-context:%'"),'0');assert.equal(exec().result.status,'generated');}finally{fault(false);}
 const r=await send(a);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(p.calls.length,2);assert.equal(F.sql('select count(*)from agent_messages'),'2');assert.equal(F.sql("select publication_state from career_model_pairs_v2"),'published');
});
test('an older uncertain native snapshot cannot overwrite a later owned turn when its failed save is retried',async t=>{
 seed();const p=N.provider({unknownFirst:true}),a=await app(t,p,15);fault(true);try{assert.equal((await send(a)).status,503);assert.equal(p.calls.length,1);assert.equal(exec().result.status,'unknown');}finally{fault(false);}
 newer();const before=F.sql(`select state from agent_flow_state where thread_id='${F.T}'`),r=await send(a);
 assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(F.sql(`select state from agent_flow_state where thread_id='${F.T}'`),before);assert.match(before,/NEWER OWNED VALUE/);assert.equal(p.calls.length,1);assert.equal(F.sql("select count(*)from career_watch_kv where key like 'career:native-context:%'"),'0');
});
test('two simultaneous identical raw requests never dispatch the same native operation twice',async t=>{
 seed();let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const p=N.provider({async onRequest({generation}){if(generation){entered();await gate;}}}),a=await app(t,p);
 const first=send(a);await ready;let second;try{second=await send(a);}finally{release();}const original=await first;
 assert.equal(second.status,200,JSON.stringify(second.body));assert.equal(original.status,409,JSON.stringify(original.body));assert.equal(p.calls.length,1);assert.equal(F.sql('select count(*)from career_model_pairs_v2'),'1');assert.equal(F.sql('select count(*)from agent_messages'),'2');assert.equal(F.sql('select count(*)from agent_usage'),'1');
});
test('client roles cannot invoke native authority RPCs or read the private execution context',async t=>{
 seed();for(const role of ['anon','authenticated']){assert.throws(()=>F.sql(`select career_native_read_v1('${F.U}','${F.T}','k','${'a'.repeat(64)}')`,role));assert.throws(()=>F.sql(`select value from career_watch_kv where key like 'career:native-%'`,role));}assert.equal(F.sql("select count(*)from pg_proc where proname like 'career_native_%'and prosecdef"),'0');
});
test('paid checker provenance cannot be replaced by a local-cost receipt even with both real controlled usage records',async t=>{
 seed();const p=N.provider(),a=await app(t,p);assert.equal((await send(a)).status,200);const e=exec(),forged=structuredClone(e.result);forged.meta.verification.cost_policy='local_no_external_calls';F.sql(`update career_watch_kv set value=(value-'result')||'{"state":"claimed"}'::jsonb where user_id='${F.U}'and key like 'career:native-execution:%'`);
 assert.throws(()=>F.call('career_native_outcome_v1',{p_user:F.U,p_thread:F.T,p_key:'native-authority',p_execution:e.execution_id,p_result:forged}));assert.equal(p.calls.length,2);assert.equal(F.sql('select count(*)from agent_usage'),'2');
});
