'use strict';
// STRUCTURAL_ONLY, real isolated PostgreSQL and mocked browser. No employer IO.
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hash}=require('../workers/career-browser/store.cjs');
const {createTaskAuthority}=require('../workers/career-browser/authority.cjs');
const {claimIdentity,workerIdentity}=require('../workers/career-browser/worker-identity.cjs');
if(!process.env.CAREER_TEST_CONTAINER){test('owned claim recovery real PostgreSQL',{skip:'explicit isolated PostgreSQL required'},()=>{});}else{
 const db=require('./helpers/career-task-sql.cjs')(process.env.CAREER_TEST_CONTAINER,process.env.CAREER_TEST_DATABASE);
 const U='00000000-0000-4000-8000-000000000001',V='00000000-0000-4000-8000-000000000002',T='00000000-0000-4000-8000-000000000003';
 const W='00000000-0000-4000-8000-000000000004',X='00000000-0000-4000-8000-000000000005',TASK='c'.repeat(32),SHA='a'.repeat(64);
 const owned=createTaskAuthority({...db,workerId:W}),foreign=createTaskAuthority({...db,workerId:X});
 const posting={canonicalKey:'local:test-role',company:'TEST ONLY',role:'Test role',status:'open',url:'http://localhost:8123/form'};
 function commit(input={}){
  const l=db.call('career_host_load',{p_user:U,p_thread:T,p_key:'prepare',p_hash:hash('prepare')});
  const i={version:'career_task_intent/v1',intent_id:hash('prepare'),user_id:U,thread_id:T,turn_key:'prepare',request_hash:hash('prepare'),action:'prepare',task_id:null,event_id:'prepare',artifact_id:input.artifactId||'synthetic-resume',resume_sha256:input.resumeSha256||SHA,payload_sha256:null,profile_sha256:null,destination:posting.url,authority_account_version:l.accountVersion+1,privacy_epoch:l.account.epoch||0};
  const base={p_user:U,p_thread:T,p_key:'prepare',p_hash:hash('prepare'),p_revision:l.revision,p_account_version:l.accountVersion,p_snapshot:{v:1,scope:{userId:U},stores:{posting}},p_patch:{},p_input:'Synthetic test',p_response:{thread_id:T,reply:'Synthetic reply',action:null,reminders:[],task:{version:i.version,id:null,userId:U,status:'queued',kind:'pending_task_intent',intent_id:i.intent_id,bindings:i}}};
  assert.equal(db.call('career_task_turn_commit_v1',{p_base:base,p_intent:i}).error,undefined);return i;
 }
 const claim=(a,i,taskId=TASK)=>a.claim({userId:U,intentId:i.intent_id,taskId,expected:{action:'prepare'}});
 const expire=()=>db.sql("update career_task_intents_v1 set claim_lease_until=now()-interval '1 second';");
 beforeEach(()=>db.sql("truncate auth.users cascade;insert into auth.users values('"+U+"'),('"+V+"');insert into agent_threads values('"+T+"','"+U+"');"));
 test('lost committed claim acknowledgement is read back once without redispatch',()=>{
  const i=commit();let lost=true,claims=0,reads=0;
  const a=createTaskAuthority({workerId:W,call(name,args){const value=db.call(name,args);if(name==='career_task_claim_owned_v1'){claims++;if(lost){lost=false;throw Error('MOCK lost response after commit');}}if(name==='career_task_claim_readback_v1')reads++;return value;}});
  const g=claim(a,i);assert.equal(g.generation,1);assert.equal(claims,1);assert.equal(reads,1);assert.equal(g.claimRequest,claimIdentity(W,U,i.intent_id,TASK));assert.equal(owned.pending().length,1);assert.equal(foreign.pending().length,0);
 });
 test('death before task checkpoint recovers on the same durable worker identity and prepares once',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-claim-restart-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const workerId=workerIdentity(path.join(root,'identity'));assert.equal(workerIdentity(path.join(root,'identity')),workerId);
  const authority=createTaskAuthority({...db,workerId});const f=require('./fixtures/owned-worker-fixture.cjs').fixture(root,{authority,userId:U});const i=commit(f.input);
  // Crash injection is immediately after the SQL commit, before store.put.
  let lost=false;const crashing=createTaskAuthority({workerId,call(name,args){const out=db.call(name,args);if(name==='career_task_claim_owned_v1'&&!lost){lost=true;throw Error('MOCK process death');}if(name==='career_task_claim_readback_v1')throw Error('MOCK process dead');return out;}});
  const crashed=require('./fixtures/owned-worker-fixture.cjs').fixture(root,{authority:crashing,userId:U});
  assert.throws(()=>crashed.worker.receive(U,{...f.input,eventId:'prepare',intentId:i.intent_id}));assert.equal(f.store.list().length,0);
  const results=f.worker.runPending({limit:1});assert.equal(results[0].status,'review_ready');assert.equal(f.count().opens,1);assert.equal(f.count().clicks,0);assert.equal(f.worker.runPending({limit:1}).length,0);
 });
 test('foreign owner, worker, request and live-lease takeover are refused',()=>{
  const i=commit(),g=claim(owned,i);assert.throws(()=>claim(foreign,i));
  for(const [user,worker,request]of [[V,W,g.claimRequest],[U,X,g.claimRequest],[U,W,'00000000-0000-4000-8000-000000000006']])assert.throws(()=>db.call('career_task_claim_readback_v1',{p_user:user,p_intent:i.intent_id,p_worker:worker,p_request:request}));
  assert.equal(claim(owned,i).leaseToken,g.leaseToken);
 });
 test('expired queued checkpoint refreshes its local lease before the first browser command',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-expired-checkpoint-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const f=require('./fixtures/owned-worker-fixture.cjs').fixture(root,{authority:owned,userId:U}),i=commit(f.input),q=f.worker.receive(U,{...f.input,eventId:'prepare',intentId:i.intent_id}),old=f.store.get(q.id).authority.leaseToken;
  expire();const result=f.worker.runPending({limit:1})[0];assert.equal(result.status,'review_ready');assert.notEqual(f.store.get(q.id).authority.leaseToken,old);assert.equal(f.count().opens,1);assert.equal(f.count().clicks,0);
 });
 test('expired claim requires generation CAS, rotates lease and fences stale worker',()=>{
  const i=commit(),old=claim(owned,i);expire();
  const args={p_user:U,p_intent:i.intent_id,p_task:TASK,p_worker:X,p_request:claimIdentity(X,U,i.intent_id,TASK)};
  assert.throws(()=>db.call('career_task_claim_owned_v1',{...args,p_generation:0}));
  const fresh=db.call('career_task_claim_owned_v1',{...args,p_generation:old.generation});assert.equal(fresh.generation,2);assert.notEqual(fresh.leaseToken,old.leaseToken);
  assert.throws(()=>owned.begin(old,'open',hash('stale')));assert.throws(()=>db.call('career_task_claim_owned_v1',{...args,p_worker:W,p_generation:old.generation}));
  const ticket=foreign.begin(fresh,'open',hash('fresh'));expire();assert.throws(()=>foreign.consume(fresh,ticket));
 });
 test('unknown submit fence survives missing checkpoint and can never be reclaimed or repeated',()=>{
  const i=commit();db.sql("update career_task_intents_v1 set binding=jsonb_set(binding,'{action}','\"approve\"');");
  const g=owned.claim({userId:U,intentId:i.intent_id,taskId:TASK,expected:{action:'approve'}}),ticket=owned.begin(g,'submit',hash('submit'));owned.consume(g,ticket);
  assert.equal(owned.pending().length,0);assert.equal(db.call('career_task_claim_readback_v1',{p_user:U,p_intent:i.intent_id,p_worker:W,p_request:g.claimRequest}).state,'uncertain');expire();
  assert.throws(()=>db.call('career_task_claim_owned_v1',{p_user:U,p_intent:i.intent_id,p_task:TASK,p_worker:W,p_request:g.claimRequest,p_generation:g.generation}));
  assert.throws(()=>owned.begin(g,'submit',hash('repeat')));assert.equal(db.sql("select count(*) from career_task_effects_v1 where operation='submit';"),'1');
 });
 test('new recovery RPCs remain inaccessible to client roles',()=>{
  assert.equal(db.sql("select count(*) from pg_proc where proname='career_task_pending_owned_v1';"),'1');
  for(const role of ['anon','authenticated'])assert.throws(()=>db.sql("select career_task_pending_owned_v1('"+W+"');",role));
 });
}
