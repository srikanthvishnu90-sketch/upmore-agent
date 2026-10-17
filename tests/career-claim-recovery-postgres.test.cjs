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
 function commit(input={},extra={}){
  const key=extra.event_id||'prepare';
  const l=db.call('career_host_load',{p_user:U,p_thread:T,p_key:key,p_hash:hash(key)});
  const i={version:'career_task_intent/v1',intent_id:hash(key),user_id:U,thread_id:T,turn_key:key,request_hash:hash(key),action:'prepare',task_id:null,event_id:'prepare',artifact_id:input.artifactId||'synthetic-resume',resume_sha256:input.resumeSha256||SHA,payload_sha256:null,profile_sha256:null,destination:posting.url,authority_account_version:l.accountVersion+1,privacy_epoch:l.account.epoch||0,...extra};
  const base={p_user:U,p_thread:T,p_key:key,p_hash:hash(key),p_revision:l.revision,p_account_version:l.accountVersion,p_snapshot:{v:1,scope:{userId:U},stores:{posting}},p_patch:{},p_input:i.action==='approve'?'Approve browser task '+i.task_id:'Synthetic test',p_response:{thread_id:T,reply:'Synthetic reply',action:null,reminders:[],task:{version:i.version,id:null,userId:U,status:'queued',kind:'pending_task_intent',intent_id:i.intent_id,bindings:i}}};
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
 function backlog(){
  db.sql("insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,state,created_at) select i.user_id,md5('backlog-intent-'||n)||md5('tail-'||n),i.thread_id,'backlog-'||n,md5('backlog-'||n)||md5('tail-'||n),md5('event-'||n)||md5('event-tail-'||n),jsonb_set(jsonb_set(i.binding,'{action}','\"prepare\"'),'{task_id}','null'),null,i.authority_account_version,i.privacy_epoch,'queued',now()-interval '1 hour' from (select * from career_task_intents_v1 order by created_at desc limit 1)i cross join generate_series(1,60)n;");
 }
 for(const reconcile of [false,true])test('active '+(reconcile?'reconciliation':'approval')+' progresses beyond 60 older unrelated intents',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-scoped-queue-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const f=require('./fixtures/owned-worker-fixture.cjs').fixture(root,{authority:owned,userId:U,throwAfterClick:reconcile});
  const i=commit(f.input),q=f.worker.receive(U,{...f.input,eventId:'prepare',intentId:i.intent_id}),review=f.worker.prepare(U,q.id);assert.equal(review.status,'review_ready');
  let next=commit(f.input,{action:'approve',task_id:q.id,event_id:'approve',payload_sha256:review.review.payloadSha256,resume_sha256:review.review.resumeSha256,destination:review.review.destination,profile_sha256:review.review.profileHash});
  if(reconcile){const unknown=f.worker.approve(U,q.id,{...f.approval(review,'approve'),intentId:next.intent_id});assert.equal(unknown.status,'unknown_outcome');next=commit(f.input,{action:'reconcile',task_id:q.id,event_id:'reconcile'});}
  backlog();assert.equal(owned.pending().length,50);assert.equal(owned.pending().some(i=>i.intentId===next.intent_id),false);
  const results=f.worker.runPending({limit:1,taskId:q.id});assert.equal(results.length,1);assert.equal(results[0].status,'completed');assert.equal(f.count().clicks,1);assert.equal(f.worker.runPending({limit:1,taskId:q.id}).length,0);
 });
 test('scoped SQL pending binds owner, worker and epoch and preserves pause and client guards',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-scoped-guards-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const f=require('./fixtures/owned-worker-fixture.cjs').fixture(root,{authority:owned,userId:U}),i=commit(f.input),q=f.worker.receive(U,{...f.input,eventId:'prepare',intentId:i.intent_id}),review=f.worker.prepare(U,q.id);
  const next=commit(f.input,{action:'approve',task_id:q.id,event_id:'approve',payload_sha256:review.review.payloadSha256,resume_sha256:review.review.resumeSha256,destination:review.review.destination});backlog();
  // A real foreign-owner queue and a foreign-worker task anchor with the same
  // opaque task ID must not become visible through the active owner's scope.
  const VT='00000000-0000-4000-8000-000000000006';
  db.sql("insert into agent_threads values('"+VT+"','"+V+"');insert into career_watch_kv(user_id,key,value) select '"+V+"',key,value from career_watch_kv where user_id='"+U+"' and key='career:account';insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,authority_account_version,privacy_epoch,state,task_id,claim_worker) select '"+V+"',md5('foreign-'||n)||md5('tail-'||n),'"+VT+"','foreign-'||n,request_hash,md5('foreign-event-'||n)||md5('tail-'||n),binding,authority_account_version,privacy_epoch,case when n=1 then 'completed' else 'queued' end,'"+q.id+"',case when n=1 then '"+X+"'::uuid else null end from career_task_intents_v1 cross join generate_series(1,2)n where user_id='"+U+"' and intent_id='"+next.intent_id+"';");
  assert.equal(owned.pending({userId:U,taskId:q.id,limit:1})[0]?.intentId,next.intent_id);
  assert.deepEqual(owned.pending({userId:V,taskId:q.id,limit:1}),[]);assert.deepEqual(foreign.pending({userId:U,taskId:q.id,limit:1}),[]);assert.deepEqual(owned.pending({userId:U,taskId:TASK,limit:1}),[]);
  assert.equal(foreign.pending({userId:V,taskId:q.id,limit:1})[0]?.userId,V);
  for(const limit of [0,51])assert.throws(()=>db.call('career_task_pending_scoped_v1',{p_worker:W,p_user:U,p_task:q.id,p_limit:limit}));
  for(const role of ['anon','authenticated'])assert.throws(()=>db.sql("select career_task_pending_scoped_v1('"+W+"','"+U+"','"+q.id+"',1);",role));
  db.sql("update career_watch_kv set value=jsonb_set(value,'{paused}','true') where user_id='"+U+"' and key='career:account';");assert.deepEqual(owned.pending({userId:U,taskId:q.id,limit:1}),[]);
  db.sql("update career_watch_kv set value=jsonb_set(jsonb_set(value,'{paused}','false'),'{epoch}','1') where user_id='"+U+"' and key='career:account';");assert.deepEqual(owned.pending({userId:U,taskId:q.id,limit:1}),[]);assert.equal(f.count().clicks,0);
 });
 test('new recovery RPCs remain inaccessible to client roles',()=>{
  assert.equal(db.sql("select count(*) from pg_proc where proname='career_task_pending_owned_v1';"),'1');
  for(const role of ['anon','authenticated'])assert.throws(()=>db.sql("select career_task_pending_owned_v1('"+W+"');",role));
 });
}
