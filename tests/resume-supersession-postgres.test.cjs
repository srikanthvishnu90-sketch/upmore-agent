'use strict';
// Actual staged HTTP handler and REAL local PostgreSQL commit/CAS/erase RPCs.
// Synthetic owners/auth only; no network outside the network-none test fixture.
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const F=require('./helpers/resume-supersession-fixture.cjs'),M=require('../packages/domain/130-career-onboarding.js');
const db=require('./helpers/career-task-sql.cjs')(process.env.CAREER_TEST_CONTAINER,process.env.CAREER_TEST_DATABASE),H='a'.repeat(64);
const q=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
beforeEach(()=>{db.sql('truncate auth.users cascade;');for(let i=0;i<2;i++)db.sql(`insert into auth.users values('${F.OWNERS[i]}');insert into agent_threads values('${F.THREADS[i]}','${F.OWNERS[i]}');insert into agent_flow_state(thread_id,user_id,state)values('${F.THREADS[i]}','${F.OWNERS[i]}',${q({career:F.snapshot(F.OWNERS[i],F.profile(i?'2031':'2027'))})});`);});
const state=(i=0)=>JSON.parse(db.sql(`select state->'career' from agent_flow_state where thread_id='${F.THREADS[i]}';`));
const load=(key,i=0)=>db.call('career_host_load',{p_user:F.OWNERS[i],p_thread:F.THREADS[i],p_key:key,p_hash:H});
const commit=(l,key,snapshot,i=0,patch={})=>db.call('career_host_commit',{p_user:F.OWNERS[i],p_thread:F.THREADS[i],p_key:key,p_hash:H,p_revision:l.revision,p_account_version:l.accountVersion,p_snapshot:snapshot,p_patch:patch,p_input:'Synthetic owned fixture context update',p_response:{thread_id:F.THREADS[i],turn_key:key,reply:'Synthetic owned fixture context committed',reminders:[],action:null}});
// Fixture-only hydration through the existing transaction, not a new upload API.
function source(text,key,i=0,profile){const l=load(key,i),s=F.copy(l.snapshot);s.stores.resumeTexts={new:text};if(profile)s.stores.profile=F.copy(profile);assert.ok(commit(l,key,s,i).response);}
async function app(t,hook){return F.fixture(t,{async rpc(name,args){if(name==='agent_rl_bump')return {data:true,error:null};if(hook)await hook(name,args);return db.client.rpc(name,args);}});}
test('real SQL repeated source adoption, identical-key replay and fresh-handler persisted recall',async t=>{
 const f=await app(t);assert.equal((await f.request()).body.meta.result_status,'completed');source(F.NEW('2033'),'import-2033');const saved=await f.request(0,F.CORRECT,'second');assert.equal(saved.body.meta.result_status,'completed');let p=state().stores.profile;assert.equal(p.constraints.graduationDate,'2033');assert.equal(p.fact_version,2);assert.equal(p.profile_corrections[1].changes[0].from,'2028');
 const messages=db.sql('select count(*) from agent_messages;');assert.deepEqual(await f.request(0,F.CORRECT,'second'),saved);assert.equal(db.sql('select count(*) from agent_messages;'),messages);
 source(F.NEW('2030'),'import-2030');assert.equal((await f.request(0,F.CORRECT,'third')).body.meta.result_status,'completed');p=state().stores.profile;assert.equal(p.constraints.graduationDate,'2030');assert.equal(p.fact_version,3);assert.equal(p.profile_corrections.length,3);
 const fresh=await app(t);assert.match((await fresh.request(0,F.RECALL,'fresh')).body.reply,/2030/);assert.deepEqual(state().stores.profile,p);assert.match((await fresh.request(1,F.RECALL,'b')).body.reply,/2031/);
});
test('real SQL rollback of a repeated correction preserves old facts and does not mark its source adopted',async t=>{
 const f=await app(t);await f.request();source(F.NEW('2033'),'import');const before=state().stores.profile,messages=db.sql('select count(*) from agent_messages;');
 db.sql("create function resume_test_reject() returns trigger language plpgsql as $$begin if NEW.role='assistant' then raise exception 'synthetic resume rollback';end if;return NEW;end$$;create trigger resume_test_reject before insert on agent_messages for each row execute function resume_test_reject();");
 try {assert.equal((await f.request(0,F.CORRECT,'second')).status,503);assert.deepEqual(state().stores.profile,before);assert.equal(db.sql('select count(*) from agent_messages;'),messages);}
 finally {db.sql('drop trigger resume_test_reject on agent_messages;drop function resume_test_reject();');}
 assert.match((await f.request(1,F.RECALL,'b')).body.reply,/2031/);assert.equal((await f.request(0,F.CORRECT,'second')).body.meta.result_status,'completed');assert.equal(state().stores.profile.constraints.graduationDate,'2033');assert.equal(state().stores.profile.profile_corrections.length,2);
});
test('real revision race rejects stale 2033 and preserves winning 2030 without any process-local source replay',async t=>{
 let armed=false;
 const f=await app(t,async(name,args)=>{if(name==='career_host_commit'&&args.p_key==='loser'&&armed){armed=false;const l=load('winner'),s=F.copy(l.snapshot);s.stores.resumeTexts={new:F.NEW('2030')};assert.equal(M.applyProfileCorrection(s.stores.profile,F.CORRECT,{resumeTexts:s.stores.resumeTexts}).ok,true);assert.ok(commit(l,'winner',s).response);}});
 await f.request();source(F.NEW('2033'),'import');armed=true;const r=await f.request(0,F.CORRECT,'loser');assert.equal(r.status,409);assert.equal(r.body.error,'revision_conflict');const p=state().stores.profile;assert.equal(p.constraints.graduationDate,'2030');assert.equal(p.profile_corrections.length,2);assert.ok(!JSON.stringify(p.profile_corrections).includes('2033'));assert.match((await f.request(1,F.RECALL,'b')).body.reply,/2031/);
 // The failed source was not adopted or put in a global "used source" cache.
 source(F.NEW('2033'),'import-again');assert.equal((await f.request(0,F.CORRECT,'retry-fresh')).body.meta.result_status,'completed');assert.equal(state().stores.profile.constraints.graduationDate,'2033');
});
test('real erase epoch clears source hashes and rejects old receipts; explicit reimport starts a fresh owned history',async t=>{
 const f=await app(t);const text=F.NEW('2028');source(text,'import-old');await f.request();source(F.NEW('2033'),'import-new');await f.request(0,F.CORRECT,'second');assert.equal(state().stores.profile.constraints.graduationDate,'2033');
 assert.equal((await f.request(0,'Forget my career profile','erase')).status,200);assert.equal(state().stores.profile,undefined);const replay=await f.request(0,F.CORRECT,'second');assert.equal(replay.status,409);assert.equal(replay.body.error,'privacy_epoch_changed');assert.equal((await f.request(0,'resume career work','resume')).status,200);
 source(F.NEW('2033'),'fresh-import',0,F.profile('2040'));assert.match((await f.request(0,F.RECALL,'before')).body.reply,/2040/);assert.equal((await f.request(0,F.CORRECT,'new-epoch')).body.meta.result_status,'completed');const p=state().stores.profile;assert.equal(p.constraints.graduationDate,'2033');assert.equal(p.fact_version,1);assert.equal(p.profile_corrections.length,1);assert.match((await f.request(1,F.RECALL,'b')).body.reply,/2031/);
});
