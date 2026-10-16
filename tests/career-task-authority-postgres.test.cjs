'use strict';
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hash}=require('../workers/career-browser/store.cjs');
const {createTaskAuthority}=require('../workers/career-browser/authority.cjs');
const container=process.env.CAREER_TEST_CONTAINER,database=process.env.CAREER_TEST_DATABASE;
if(!container&&!database){test('task authority real PostgreSQL contracts',{skip:'explicit isolated local Docker/Postgres required'},()=>{});}else{
const db=require('./helpers/career-task-sql.cjs')(container,database),authority=createTaskAuthority(db);
const U='00000000-0000-4000-8000-000000000001',V='00000000-0000-4000-8000-000000000002',T='00000000-0000-4000-8000-000000000003';
const TASK='c'.repeat(32),SHA='a'.repeat(64),posting={canonicalKey:'local:test-role',company:'TEST ONLY',role:'Test role',status:'open',url:'http://localhost:8123/form'};
const snapshot={v:1,scope:{userId:U},stores:{posting}};
const load=(key='prepare')=>db.call('career_host_load',{p_user:U,p_thread:T,p_key:key,p_hash:hash(key)});
function base(key='prepare',patch={}){const l=load(key);return {p_user:U,p_thread:T,p_key:key,p_hash:hash(key),p_revision:l.revision,p_account_version:l.accountVersion,p_snapshot:snapshot,p_patch:patch,p_input:'Synthetic test',p_response:{thread_id:T,reply:'Synthetic reply',action:null,reminders:[]}};}
function args(key='prepare',extra={}){const b=base(key),i={version:'career_task_intent/v1',intent_id:hash(key),user_id:U,thread_id:T,turn_key:key,request_hash:hash(key),action:'prepare',task_id:null,event_id:key,artifact_id:'synthetic-resume',resume_sha256:SHA,payload_sha256:null,profile_sha256:null,destination:posting.url,authority_account_version:b.p_account_version+1,privacy_epoch:load(key).account.epoch||0,...extra};b.p_response.task={version:i.version,id:i.task_id,userId:U,status:'queued',kind:'pending_task_intent',intent_id:i.intent_id,bindings:i};return {p_base:b,p_intent:i};}
function commit(key='prepare',extra={}){const a=args(key,extra);const r=db.call('career_task_turn_commit_v1',a);assert.equal(r.error,undefined);return a.p_intent;}
const claim=i=>authority.claim({userId:U,intentId:i.intent_id,taskId:i.task_id||TASK,expected:{action:i.action}});
function control(patch,key='control'){return db.call('career_host_commit',base(key,patch));}
const effect=g=>authority.begin(g,'open',hash([g.intentId,'open']));
const scalar=q=>JSON.parse(db.sql('select to_json('+q+');'));
beforeEach(()=>{db.sql("truncate auth.users cascade;insert into auth.users values('"+U+"'),('"+V+"');insert into agent_threads values('"+T+"','"+U+"');");});
test('task intent, turn pair, snapshot and structured receipt commit and replay together',()=>{const a=args(),r=db.call('career_task_turn_commit_v1',a);assert.deepEqual(r.response.task.bindings,a.p_intent);assert.deepEqual(db.call('career_task_turn_commit_v1',a).response,r.response);assert.equal(scalar('(select count(*) from agent_messages)'),2);assert.equal(scalar('(select count(*) from career_task_intents_v1)'),1);assert.equal(db.call('career_task_pending_v1').intents.length,1);});
test('late task binding rejection rolls back the already executed base turn',()=>{const a=args();a.p_base.p_response.task.userId=V;assert.throws(()=>db.call('career_task_turn_commit_v1',a),/Command failed/);for(const table of ['agent_messages','agent_flow_state','career_watch_kv','career_task_intents_v1'])assert.equal(scalar('(select count(*) from '+table+')'),0);});
test('missing version/action/identity cannot pass SQL null semantics',()=>{for(const k of ['version','action','intent_id']){const a=args();delete a.p_intent[k];assert.throws(()=>db.call('career_task_turn_commit_v1',a));}assert.equal(scalar('(select count(*) from agent_messages)'),0);});
test('event tombstone rejects the same event under a fresh turn key, even after erase',()=>{commit();control({erase:true,paused:true},'erase');const a=args('new-turn',{event_id:'prepare'});assert.equal(db.call('career_task_turn_commit_v1',a).error,'task_event_conflict');assert.equal(scalar('(select count(*) from agent_messages)'),4);assert.equal(scalar('(select private_input is null and result is null from career_task_intents_v1)'),true);});
for(const [name,patch]of [['STOP',{paused:true}],['erase',{erase:true,paused:true}]])test('committed '+name+' revokes queued claims and pending dispatch',()=>{const i=commit();control(patch);assert.throws(()=>claim(i),{code:'TASK_AUTHORITY_REVOKED'});assert.equal(authority.pending().length,0);});
test('another owner cannot claim, settle or read task evidence',()=>{const i=commit(),g=claim(i),t=effect(g);assert.throws(()=>authority.claim({userId:V,intentId:i.intent_id,taskId:TASK,expected:{}}),{code:'TASK_AUTHORITY_REVOKED'});assert.throws(()=>db.call('career_task_consume_effect_v1',{p_user:V,p_token:t.token}));assert.equal(db.call('career_task_result_v1',{p_user:V,p_task:TASK}).task,null);});
test('STOP between reserve and physical execution rejects consume; no effect is admitted',()=>{const g=claim(commit()),t=effect(g);control({paused:true});assert.throws(()=>authority.consume(g,t),{code:'TASK_AUTHORITY_REVOKED'});assert.equal(db.call('career_task_effect_status_v1',{p_user:U,p_token:t.token}).state,'reserved');});
test('erase after claim rejects the next effect and removes private central copies',()=>{const g=claim(commit());control({erase:true,paused:true});assert.throws(()=>effect(g),{code:'TASK_AUTHORITY_REVOKED'});assert.equal(scalar('(select private_input is null and result is null from career_task_intents_v1)'),true);assert.equal(scalar('(select binding ? \'artifact_id\' from career_task_intents_v1)'),false);});
test('an admitted uncertain effect permanently blocks new DOM work under a new intent',()=>{let g=claim(commit()),t=effect(g);authority.consume(g,t);control({paused:true},'stop');authority.settle(g,t,'uncertain',SHA,null);control({paused:false},'resume');g=claim(commit('fresh'));assert.throws(()=>effect(g),{code:'TASK_AUTHORITY_REVOKED'});assert.equal(scalar('(select count(*) from career_task_effects_v1)'),1);});
test('effect receipts reconcile lost acknowledgements and reject altered replay',()=>{const g=claim(commit()),t=effect(g);authority.consume(g,t);let once=true;const a=createTaskAuthority({call:(name,args)=>{const out=db.call(name,args);if(name==='career_task_settle_effect_v1'&&once){once=false;throw Error('synthetic lost ack');}return out;}});assert.equal(a.settle(g,t,'completed',SHA,SHA).state,'completed');assert.throws(()=>db.call('career_task_settle_effect_v1',{p_user:U,p_token:t.token,p_outcome:'completed',p_before:SHA,p_after:null}));assert.throws(()=>authority.consume(g,t),{code:'TASK_AUTHORITY_REVOKED'});});
test('task result retains exact structured evidence and reconciles lost finish ack',()=>{const g=claim(commit()),task={version:'career_task/v1',id:TASK,userId:U,status:'review_ready',review:{payloadSha256:SHA}};let once=true;const a=createTaskAuthority({call:(name,args)=>{const out=db.call(name,args);if(name==='career_task_finish_v1'&&once){once=false;throw Error('synthetic lost ack');}return out;}});assert.equal(a.finish(g,task).reconciled,true);assert.deepEqual(db.call('career_task_result_v1',{p_user:U,p_task:TASK}).task,task);assert.throws(()=>db.call('career_task_finish_v1',{p_user:U,p_intent:g.intentId,p_lease:g.leaseToken,p_result:{...task,status:'completed'}}));});
test('missing authority and async authority transports fail closed',()=>{assert.throws(()=>createTaskAuthority({}),{code:'TASK_AUTHORITY_NOT_WIRED'});assert.throws(()=>createTaskAuthority({call:async()=>({})}).current(U),{code:'SYNC_AUTHORITY_TRANSPORT_REQUIRED'});});
for(const [name,patch]of [['STOP',{paused:true}],['erase',{erase:true,paused:true}]])test('concurrent '+name+' transaction wins the shared owner lock before a waiting claim',async()=>{
  const port=Number(process.env.CAREER_TEST_PORT);assert.ok(Number.isInteger(port)&&port>0,'explicit isolated local PG wire port required');
  const {Client}=require('pg'),c=new Client({host:'127.0.0.1',port,database,user:'postgres',password:'',ssl:false});await c.connect();
  try{
    const i=commit(),b=base('race-control',patch);await c.query('begin');await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[U]);
    const keys=Object.keys(b);await c.query('select career_host_commit('+keys.map((k,n)=>k+'=>$'+(n+1)).join(',')+')',keys.map(k=>typeof b[k]==='object'?JSON.stringify(b[k]):b[k]));
    let settled=false;const waiting=db.callAsync('career_task_claim_v1',{p_user:U,p_intent:i.intent_id,p_task:TASK,p_lease:null}).then(v=>({value:v}),e=>({error:e})).finally(()=>settled=true);
    await new Promise(resolve=>setTimeout(resolve,80));assert.equal(settled,false,'claim waits on the same owner lock');await c.query('commit');assert.match((await waiting).error?.message||'',/authority revoked/);assert.equal(authority.pending().length,0);
  }finally{await c.query('rollback');await c.end();}
});
test('client roles have neither private table nor task RPC access; all functions are invoker',()=>{for(const role of ['anon','authenticated']){assert.throws(()=>db.sql('select * from career_task_intents_v1;',role));assert.throws(()=>db.sql("select career_task_account_v1('"+U+"');",role));}assert.equal(scalar("(select count(*) from pg_proc where proname like 'career_task_%' and prosecdef)"),0);});
for(const [name,patch]of [['STOP',{paused:true}],['erase',{erase:true,paused:true}]])test('real worker queued task opens no MOCK board after committed '+name,()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'career-sql-worker-'));try{const f=require('./fixtures/owned-worker-fixture.cjs').fixture(root,{authority,userId:U});const i=commit('worker',{artifact_id:f.input.artifactId,resume_sha256:f.input.resumeSha256,destination:f.input.posting.url});const task=f.worker.receive(U,{...f.input,eventId:'worker',intentId:i.intent_id});control(patch);f.worker.runPending();assert.equal(f.count().opens,0);assert.equal(f.count().clicks,0);if(name==='erase'){const saved=f.store.get(task.id);assert.equal(saved.spec,null);assert.equal(saved.review,null);assert.equal(saved.authority,null);}}finally{fs.rmSync(root,{recursive:true,force:true});}});
for(const [name,patch]of [['STOP',{paused:true}],['erase',{erase:true,paused:true}]])test('running worker rechecks committed '+name+' before the next MOCK browser command',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'career-running-sql-worker-'));let opens=0,forms=0,clicks=0;
  try{
    const f=require('./fixtures/owned-worker-fixture.cjs').fixture(root,{authority,userId:U,boardFactory:()=>({kind:'browser',browserDriver:true,sandbox:false,host:'localhost',open(){opens++;control(patch);return {ok:true};},form(){forms++;return {fields:[]};},submit(){clicks++;},close(){}})});
    const i=commit('running',{artifact_id:f.input.artifactId,resume_sha256:f.input.resumeSha256,destination:f.input.posting.url});
    const task=f.worker.receive(U,{...f.input,eventId:'running',intentId:i.intent_id});const result=f.worker.prepare(U,task.id);
    assert.equal(opens,1);assert.equal(forms,0);assert.equal(clicks,0);assert.equal(result.status,'cancelled');
    if(name==='erase'){assert.equal(f.store.get(task.id).spec,null);assert.equal(result.review,null);}
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('actual staged chat -> SQL outbox -> separate worker -> structured evidence; no phantom submit',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'career-staged-sql-worker-'));let app;
  try{
    const f=require('./fixtures/owned-worker-fixture.cjs').fixture(root,{authority,userId:U});
    db.sql("insert into agent_flow_state(thread_id,user_id,state)values('"+T+"','"+U+"','"+JSON.stringify({career:snapshot}).replaceAll("'","''")+"');");
    const client={...db.client,auth:{getUser:async()=>({data:{user:{id:U}}})}};
    client.rpc=async(name,args)=>name==='agent_rl_bump'?{data:true,error:null}:db.client.rpc(name,args);
    client.from=table=>{const filters={},query={select(){return query;},eq(k,v){filters[k]=v;return query;},async upsert(){assert.equal(table,'profiles');return {error:null};},async maybeSingle(){assert.equal(table,'agent_threads');return {data:filters.id===T&&filters.user_id===U?{id:T,user_id:U}:null,error:null};}};return query;};
    app=await require('./helpers/career-staged-entry.cjs')(path.resolve(__dirname,'..'),client);
    const request={action:'prepare',eventId:'staged-prepare',artifactId:f.input.artifactId,resumeSha256:f.input.resumeSha256};
    const queued=await app.request(T,'Prepare the chosen application in the browser','staged-prepare',request);
    assert.equal(queued.status,200,JSON.stringify(queued));assert.equal(queued.body.task.status,'queued');assert.equal(queued.body.task.id,null);assert.equal(f.count().opens,0);assert.equal(f.count().clicks,0);
    assert.deepEqual(await app.request(T,'Prepare the chosen application in the browser','staged-prepare',request),queued);
    assert.equal(scalar('(select count(*) from career_task_intents_v1)'),1);
    const prepared=f.worker.runPending()[0];assert.equal(prepared.status,'review_ready',JSON.stringify(prepared));assert.equal(f.count().clicks,0);
    const status=await app.request(T,'Show my browser task','staged-status',{action:'status',intentId:queued.body.task.intent_id});
    assert.equal(status.status,200);assert.deepEqual(status.body.task,prepared);
    const a=f.approval(prepared,'staged-approval'),approval={action:'approve',taskId:prepared.id,eventId:a.approvalRef,payloadSha256:a.payloadSha256,resumeSha256:a.resumeSha256,destination:a.destination};
    const yes=await app.request(T,'yes','bare-yes',approval);assert.equal(yes.status,200);assert.equal(yes.body.task,undefined);assert.equal(f.count().clicks,0);
    const approved=await app.request(T,'Approve browser task '+prepared.id,'staged-approval',approval);assert.equal(approved.status,200,JSON.stringify(approved));assert.equal(approved.body.task.id,prepared.id);assert.equal(approved.body.task.status,'queued');assert.equal(f.count().clicks,0);
    const done=f.worker.runPending()[0];assert.equal(done.status,'completed',JSON.stringify(done));assert.equal(done.result.receipt.source,'controlled_portal_readback');assert.equal(f.count().clicks,1);
    const observed=await app.request(T,'Show my browser task','staged-done',{action:'status',taskId:prepared.id});assert.deepEqual(observed.body.task,done);
    assert.equal((await app.request(T,'Approve browser task '+prepared.id,'staged-approval',approval)).body.task.id,prepared.id);assert.equal(f.count().clicks,1);
    const reused=await app.request(T,'Approve browser task '+prepared.id,'new-key-same-event',approval);assert.equal(reused.status,409);assert.equal(reused.body.error,'task_event_conflict');assert.equal(f.count().clicks,1);
  }finally{app?.close();fs.rmSync(root,{recursive:true,force:true});}
});
}
