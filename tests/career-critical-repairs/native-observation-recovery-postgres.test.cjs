'use strict';
// Frozen recovery expectations against the ordinary raw POST and real local SQL.
// Controlled provider fixtures prove plumbing only; no paid calls or quality claim.
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./interview-entry-fixture.cjs')(),N=require('./native-controlled-provider.cjs');
const TEXT='Help me explain my class calculator honestly.',KEY='native-observation-recovery';
function seed(){F.seed();F.sql(`insert into agent_flow_state(thread_id,user_id,state)values('${F.T}','${F.U}',${F.q({career:require('../helpers/career-model-fixture.cjs').initial(F.U)})}::jsonb)`);N.fund(F);}
async function app(t,p){return await F.app(t,{env:N.env,dependencies:{nativePair:{request:p.request,evidenceLabel:'CONTROLLED_NATIVE_RESPONSES'}}});}
const send=a=>a.requestBody({thread_id:F.T,turn_key:KEY,message:TEXT});
const execution=()=>JSON.parse(F.sql(`select value from career_watch_kv where user_id='${F.U}'and key='career:native-execution:${F.T}:${KEY}'`));
function fault(kind){F.sql(`create function native_observation_fault()returns trigger language plpgsql as $$begin if NEW.key like 'career:native-execution:%'and NEW.value#>'{observations,${kind}}'is distinct from OLD.value#>'{observations,${kind}}'then raise exception 'CONTROLLED ${kind} observation write fault';end if;return NEW;end$$;create trigger native_observation_fault before update on career_watch_kv for each row execute function native_observation_fault();`);}
const clearFault=()=>F.sql('drop trigger native_observation_fault on career_watch_kv;drop function native_observation_fault();');
function accounting(r,count){
 assert.equal(r.status,200,JSON.stringify(r.body));const m=r.body.meta.career_model;
 assert.equal(m.status,'unavailable');assert.equal(m.accounting_state,'settled');assert.equal(m.known_cost_micros,11*count);assert.equal(m.uncertain_micros,0);assert.equal(m.provider_calls_confirmed,count);assert.equal(m.provider_calls_possible,count);
 assert.ok(!r.body.reply.includes('CONTROLLED native response'));assert.match(r.body.reply,/No generated advice is being published/);
 for(const [i,kind]of ['generation','checker'].entries()){const leg=m.legs[kind];assert.equal(leg.final,true);assert.equal(leg.state,i<count?'recorded':'not_sent');assert.equal(leg.cost_micros,i<count?11:0);if(i<count){assert.deepEqual(leg.provider_request_ids,['chatcmpl-controlled-native-'+(i+1)]);assert.equal(leg.raw_usage_receipt.response_id,leg.provider_request_ids[0]);}}
 assert.equal(F.sql('select count(*)from agent_usage'),String(count));assert.equal(F.sql('select sum(cost_micros)from career_model_reservations_v1'),String(11*count));assert.equal(F.sql("select count(*)from career_model_pairs_v2 where publication_state='published'"),'0');
}
for(const [kind,count]of [['generation',1],['verification',2]])test(kind+' observation storage failure settles once and returns truthful fallback on every exact retry',async t=>{
 seed();const p=N.provider(),a=await app(t,p);fault(kind);let first;try{first=await send(a);}finally{clearFault();}
 const before=F.sql('select current_micros from career_model_campaign_v1'),retry=await send(a),again=await send(a),e=execution();
 console.log(JSON.stringify({evidence:'NATIVE_OBSERVATION_WRITE_FAILURE',kind,first,retry,again,observations:e.observations,pair:F.call('career_model_pair_read_v2',{p_user:F.U,p_pair:e.pair_id}),paidCalls:0}));
 assert.equal(p.calls.length,count);assert.equal(F.sql('select current_micros from career_model_campaign_v1'),before);assert.equal(e.observations[kind],undefined);accounting(first,count);accounting(retry,count);assert.deepEqual(again.body,retry.body);
});
for(const [blocked,count]of [['generation',1],['checker',2]])test(blocked+' concurrent duplicate unknown is an as-of snapshot; exact retry reconciles settled usage without resending or changing memory',async t=>{
 seed();let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r),p=N.provider({async onRequest({generation}){if(generation===(blocked==='generation')){entered();await gate;}}}),a=await app(t,p);
 const first=send(a);await ready;let duplicate;try{duplicate=await send(a);}finally{release();}const original=await first;
 assert.equal(duplicate.status,200);assert.equal(duplicate.body.meta.career_model.status,'unknown');assert.equal(duplicate.body.meta.career_model.legs[blocked].final,false);assert.equal(original.status,409);assert.equal(p.calls.length,count);
 const before=F.sql(`select jsonb_build_object('flow',(select state from agent_flow_state where thread_id='${F.T}'),'messages',(select jsonb_agg(to_jsonb(m)order by m.id)from agent_messages m),'context',(select value from career_watch_kv where key='career:native-context:${F.T}'),'version',(select value from career_watch_kv where key='career:account'))`);
 const reconciled=await send(a),again=await send(a);
 console.log(JSON.stringify({evidence:'DUPLICATE_AS_OF_UNKNOWN_AFTER_SETTLEMENT',duplicate,original,reconciled,again,paidCalls:0}));
 accounting(reconciled,count);assert.deepEqual(again.body,reconciled.body);assert.equal(p.calls.length,count);assert.equal(F.sql(`select jsonb_build_object('flow',(select state from agent_flow_state where thread_id='${F.T}'),'messages',(select jsonb_agg(to_jsonb(m)order by m.id)from agent_messages m),'context',(select value from career_watch_kv where key='career:native-context:${F.T}'),'version',(select value from career_watch_kv where key='career:account'))`),before);
});
for(const [kind,count]of [['generation',1],['verification',2]])test(kind+' missing observation plus failed fallback save recovers from pair records without inventing text',async t=>{
 seed();const p=N.provider(),a=await app(t,p);fault(kind);
 F.sql("create function native_outcome_fault()returns trigger language plpgsql as $$begin if NEW.value?'result'and not(OLD.value?'result')then raise exception 'CONTROLLED native outcome fault';end if;return NEW;end$$;create trigger native_outcome_fault before update on career_watch_kv for each row when(NEW.key like 'career:native-execution:%')execute function native_outcome_fault();");
 try{assert.equal((await send(a)).status,503);assert.equal(execution().result,undefined);}finally{F.sql('drop trigger native_outcome_fault on career_watch_kv;drop function native_outcome_fault();');clearFault();}
 const retry=await send(a);accounting(retry,count);assert.equal(p.calls.length,count);assert.equal(execution().observations[kind],undefined);assert.deepEqual((await send(a)).body,retry.body);
});
test('reconciliation cannot bypass owner, request, pause, erasure or newer-context barriers',async t=>{
 seed();const p=N.provider(),a=await app(t,p);fault('generation');try{accounting(await send(a),1);}finally{clearFault();}
 const e=execution(),args={p_user:F.U,p_thread:F.T,p_key:KEY,p_hash:e.request_hash};
 for(const role of ['anon','authenticated'])assert.throws(()=>F.sql(`select career_native_replay_v1('${F.U}','${F.T}','${KEY}','${e.request_hash}')`,role));
 assert.equal(F.call('career_native_replay_v1',{...args,p_user:F.V}).error,'owned_thread_missing');assert.equal(F.call('career_model_pair_read_v2',{p_user:F.V,p_pair:e.pair_id}).reason,'not_found');
 assert.equal(F.call('career_native_replay_v1',{...args,p_hash:'a'.repeat(64)}).error,'turn_key_conflict');
 const control=(key,patch)=>{const hash='b'.repeat(64),l=F.call('career_host_load',{p_user:F.U,p_thread:F.T,p_key:key,p_hash:hash});return F.call('career_host_commit',{p_user:F.U,p_thread:F.T,p_key:key,p_hash:hash,p_revision:l.revision,p_account_version:l.accountVersion,p_snapshot:l.snapshot,p_patch:patch,p_input:'Owned control',p_response:{thread_id:F.T,turn_key:key,reply:'Owned control saved.',action:null,reminders:[]}});};
 control('newer-owned-turn',{});assert.equal(F.call('career_native_replay_v1',args).error,'career_model_context_changed');assert.equal((await send(a)).status,409);
 control('owned-pause',{paused:true});assert.equal(F.call('career_native_replay_v1',args).error,'career_model_context_changed');assert.equal((await send(a)).status,409);
 control('owned-erase',{erase:true});assert.equal(F.call('career_native_replay_v1',args).error,'privacy_epoch_changed');assert.equal((await send(a)).status,409);assert.equal(F.sql("select count(*)from career_watch_kv where key like 'career:native-%'"),'0');assert.equal(p.calls.length,1);
});
test('settled receipts alone cannot authorize generated publication without either observation',async t=>{
 for(const [kind,count]of [['generation',1],['verification',2]]){
  seed();const p=N.provider(),a=await app(t,p);fault(kind);try{accounting(await send(a),count);}finally{clearFault();}
  const e=execution(),forged={...e.result,status:'generated',candidate:N.candidate,rendered_sha256:N.sha(e.result.rendered_response),meta:{...e.result.meta,status:'generated'}};
  // Even with the execution fence reset in this disposable adversarial fixture,
  // ledger proof must never replace the absent provider observation text.
  F.sql(`update career_watch_kv set value=(value-'result')||'{"state":"claimed"}'::jsonb where key='career:native-execution:${F.T}:${KEY}'`);
  assert.throws(()=>F.call('career_native_outcome_v1',{p_user:F.U,p_thread:F.T,p_key:KEY,p_execution:e.execution_id,p_result:forged}),/native independent checker proof missing/);
  assert.equal(F.sql("select count(*)from career_model_pairs_v2 where publication_state='published'"),'0');assert.equal(p.calls.length,count);
 }
});
