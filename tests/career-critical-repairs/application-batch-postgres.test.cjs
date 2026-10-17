'use strict';
// Actual Edge control -> actual SQL outbox -> existing worker. Browser is a
// labeled synthetic board returning UNKNOWN, with no receipt or external IO.
const {test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {hash,createFileTaskStore}=require('../../workers/career-browser/store.cjs');
const {createTaskAuthority}=require('../../workers/career-browser/authority.cjs');
const {createWorker}=require('../../workers/career-browser/service.cjs');
if(!process.env.CAREER_TEST_CONTAINER){test('durable batch actual entry/SQL/worker',{skip:'explicit isolated PostgreSQL required'},()=>{});}else{
 const db=require('../helpers/career-task-sql.cjs')(process.env.CAREER_TEST_CONTAINER,process.env.CAREER_TEST_DATABASE);
 const U='00000000-0000-4000-8000-000000000001',V='00000000-0000-4000-8000-000000000002',T='00000000-0000-4000-8000-000000000003',W='00000000-0000-4000-8000-000000000004';
 const q=v=>"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
 let root,worker,makeWorker,authority,app,postings,ids,clock,clicks,opens,values,requestId,lostApproval,changeQuestion,registeredKeys;
 beforeEach(async()=>{
  db.sql("truncate auth.users cascade;insert into auth.users values('"+U+"'),('"+V+"');insert into agent_threads values('"+T+"','"+U+"');insert into career_watch_kv(user_id,key,value)values('"+U+"','career:account','{\"version\":1,\"epoch\":0,\"paused\":false}');");
  root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-batch-'));clock=Date.now();clicks={};opens={};values={};requestId=0;lostApproval=false;changeQuestion=false;registeredKeys=['a','b','c'];
  const original=require('../../packages/domain/148-career-render.js').renderPdf({header:{name:'SYNTHETIC ONLY'},sections:[{heading:'Fixture',lines:[{type:'bullet',text:'Synthetic original bytes. No applicant or employer fact.'}]}]}).buffer;
  const resumePath=path.join(root,'synthetic.pdf');fs.writeFileSync(resumePath,original);const sha=hash(original);
  postings=['a','b','c'].map(key=>({job_id:'synthetic-'+key,canonicalKey:'synthetic:'+key,url:'http://localhost:8123/form/'+key,
   company:'Synthetic company '+key,title:'Private Equity Analyst Intern',role_family:'Finance',seniority_band:'intern',location:'New York, NY',remote:'onsite',source:'greenhouse',sources:['greenhouse'],source_urls:[],jd_text:'Private equity internship. Excel financial analysis.',status:'open'}));
  ids=postings.map(p=>hash([U,p.url]).slice(0,32));
  for(const [n,posting]of postings.entries()){
   const id=hash('source-'+n),binding={version:'career_task_intent/v1',intent_id:id,user_id:U,thread_id:T,turn_key:'source-'+n,request_hash:hash('request'+n),action:'prepare',task_id:ids[n],event_id:'source-'+n,artifact_id:'synthetic-original',resume_sha256:sha,destination:posting.url,authority_account_version:1,privacy_epoch:0};
   const input={eventId:'source-'+n,posting,artifactId:'synthetic-original',resumeSha256:sha};
   db.sql('insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,state)values('+[q(U),q(id),q(T),q('source-'+n),q(hash('request'+n)),q(hash('event'+n)),q(binding),q(input),1,0,q(ids[n]),q('completed')].join(',')+')');
  }
  authority=createTaskAuthority({...db,workerId:W});
  makeWorker=()=>createWorker({authority,store:createFileTaskStore(path.join(root,'tasks')),now:()=>clock,controlledPortals:postings.filter(p=>registeredKeys.includes(p.url.slice(-1))).map(p=>({url:p.url,submitUrl:p.url+'/submit'})),
   resolveEquipment:(user,artifact,scope)=>({userId:user,accountVersion:scope.accountVersion,privacyEpoch:scope.privacyEpoch,resumePath,
    profile:{name:'SYNTHETIC ONLY',email:'synthetic@example.test',resume:{filename:'synthetic.pdf',sha256:sha}},attestations:{},
    careerProfile:{facts:[{id:'fact-excel',kind:'skill',name:'Excel',evidence:['SYNTHETIC confirmed fixture']}]},
    scoringProfile:{skills:[{name:'Excel',proven:true,fact_id:'fact-excel',evidence:['SYNTHETIC fixture']}],level:'student',experience_years:0,constraints:{work_authorization:'US citizen',needs_sponsorship:false},preferences:{}},
    currentPosting:{posting:postings.find(p=>p.canonicalKey===scope.postingKey),observedAt:new Date(clock).toISOString(),sourceSha256:hash('SYNTHETIC PUBLIC SOURCE '+scope.postingKey)}}),
   boardFactory:opts=>{
    const key=opts.url.slice(-1),filled={};values[key]=filled;
    return {kind:'browser',browserDriver:true,sandbox:false,host:'localhost',open(){opens[key]=(opens[key]||0)+1;return {ok:true};},
     form(){return {fields:[{field_id:'email',kind:'standard',profile_key:'email',label:'Email',required:true},{field_id:'resume',kind:'standard',profile_key:'resume',label:'Resume',required:true},...(key==='b'?[{field_id:'availability',kind:'attestation',label:changeQuestion?'Changed synthetic availability terms':'Exact synthetic availability terms',required:true}]:[])]};},
     fill(id,value){filled[id]=value;},answers(){return {...filled};},atReview(){return {atFinalReview:true};},armForSubmit(a){assert.equal(a.approvedByUser,true);},
     submit(){clicks[key]=(clicks[key]||0)+1;return {outcome:'timeout'};},submissionState(){return {unverifiable:true};},close(){}};
   }});worker=makeWorker();
  app=await require('../helpers/application-batch-entry.cjs')({authenticate:async token=>token==='owner'?{id:U}:token==='foreign'?{id:V}:null,rpc:async(name,args)=>{
   const result=await db.client.rpc(name,args);
   if(result.error)console.log(JSON.stringify({syntheticBatchRpcFailure:result.error.message}));
   if(lostApproval&&args.p_action==='approve'&&!result.error){lostApproval=false;throw Error('SYNTHETIC lost committed acknowledgement');}
   return result;
  }});
 });
 afterEach(()=>{worker?.releaseEvidence({immediate:true});fs.rmSync(root,{recursive:true,force:true});});
 async function command(action,input,key,token='owner'){
  const response=await app.request(new Request('https://synthetic-app.test/career-batch',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({threadId:T,requestId:key||'request_'+(++requestId),action,input})}));
  return {status:response.status,body:await response.json()};
 }
 async function ok(action,input,key){const r=await command(action,input,key);assert.equal(r.status,200,JSON.stringify(r));return r.body;}
 const run=()=>worker.runPending({limit:10});
 async function prepared(){const created=await ok('create',{taskIds:ids});const results=run();assert.equal(results.length,3,JSON.stringify(results));return created.batchId;}
 async function review(batch){return ok('review',{batchId:batch});}
 async function approve(batch,r,key){return ok('approve',{batchId:batch,reviewHash:r.reviewHash,message:r.approvalPhrase},key);}
 async function answer(batch,role,key){const ask=role.task.asks.find(a=>a.required);return ok('answers',{batchId:batch,taskId:role.taskId,questionsHash:role.task.questionsSha256,answers:[{fieldId:ask.field_id,questionSha256:ask.questionSha256,value:true}],message:'Confirm answers for '+role.taskId+' '+role.task.questionsSha256},key);}

 test('one exact batch approval progresses healthy roles while one answer continues independently; lost acknowledgements never duplicate intents',async()=>{
  const batch=await prepared(),r=await review(batch);assert.equal(r.manifest.roles.length,2);assert.equal(r.manifest.withheld.length,1);
  assert.ok(r.manifest.roles.every(v=>v.posting.url&&v.review.payloadSha256&&v.review.resumeSha256&&v.review.profileHash));
  assert.ok(r.manifest.roles[0].review.eligibility.fit.factIds.includes('fact-excel'));
  assert.equal((await command('approve',{batchId:batch,reviewHash:r.reviewHash,message:'yes'})).status,409);
  const input={batchId:batch,reviewHash:r.reviewHash,message:r.approvalPhrase};lostApproval=true;
  assert.equal((await command('approve',input,'lost_approval')).status,503);const recovered=await ok('approve',input,'lost_approval');assert.equal(recovered.approvedTaskIds.length,2);
  assert.equal(db.sql("select count(*)from career_task_intents_v1 where binding->>'action'='approve'"),'2');
  const status=await ok('status',{batchId:batch}),held=status.roles.find(v=>v.taskId===ids[1]);assert.equal(held.status,'awaiting_user');
  await answer(batch,held,'answer_once');await answer(batch,held,'answer_once');assert.equal(db.sql("select value->>'version'from career_watch_kv where user_id='"+U+"' and key='career:account'"),'1');
  const progressed=run();assert.equal(progressed.length,3,JSON.stringify(progressed));assert.deepEqual(clicks,{a:1,c:1});assert.equal(values.b.availability,true);
  const fresh=await review(batch);assert.deepEqual(fresh.manifest.roles.map(v=>v.taskId),[ids[1]]);await approve(batch,fresh);run();assert.deepEqual(clicks,{a:1,b:1,c:1});
  const done=await ok('status',{batchId:batch});assert.ok(done.roles.every(v=>v.status==='unknown_outcome'&&v.employerConfirmed===false));assert.equal(db.sql('select count(*)from career_application_admissions_v1'),'3');
  assert.equal((await command('answers',{batchId:batch,taskId:ids[0],questionsHash:'a'.repeat(64),answers:[],message:'yes'})).status,409);
  await ok('reconcile',{batchId:batch,taskId:ids[0],message:'Reconcile batch role '+ids[0]});run();assert.deepEqual(clicks,{a:1,b:1,c:1});
  const afterReadback=await ok('status',{batchId:batch});assert.ok(afterReadback.roles.every(v=>v.status==='unknown_outcome'));
  worker.releaseEvidence({immediate:true});fs.rmSync(path.join(root,'tasks'),{recursive:true,force:true});worker=makeWorker();
  const restored=await ok('status',{batchId:batch});assert.deepEqual(restored,afterReadback);assert.equal(run().length,0);assert.deepEqual(clicks,{a:1,b:1,c:1});
  const next=await ok('create',{taskIds:ids});assert.ok(next.roles.every(v=>v.status==='unknown_outcome'));assert.equal((await command('review',{batchId:next.batchId})).status,409);assert.equal(run().length,0);
  console.log(JSON.stringify({evidence:'ACTUAL_BATCH_ENTRY_SQL_WORKER_SYNTHETIC_BOARD',healthyRolesProgressed:2,answerContinued:1,admissions:3,physicalSyntheticDispatches:3,employerReceipts:0,modelCalls:0,sharedAccountVersion:1}));
 });
 test('one changed included role rolls back every approval in the immutable batch',async()=>{
  const batch=await prepared(),r=await review(batch),changed=r.manifest.roles[1];
  assert.equal((await command('approve',{batchId:batch,reviewHash:r.reviewHash,message:r.approvalPhrase,manifest:{forged:true}})).status,400);
  db.sql("update career_task_intents_v1 set result=jsonb_set(result,'{review,profileHash}',"+q(JSON.stringify(hash('SYNTHETIC changed context')))+"::jsonb)where user_id='"+U+"'and intent_id="+q(changed.intentId));
  assert.equal((await command('approve',{batchId:batch,reviewHash:r.reviewHash,message:r.approvalPhrase})).status,409);
  assert.equal(db.sql("select count(*)from career_task_intents_v1 where binding->>'action'='approve'"),'0');assert.deepEqual(clicks,{});
 });
 test('changed wording re-asks only the affected role and requires a new exact approval',async()=>{
  const batch=await prepared(),before=await ok('status',{batchId:batch}),held=before.roles.find(v=>v.taskId===ids[1]);await answer(batch,held);changeQuestion=true;run();
  let state=await ok('status',{batchId:batch}),role=state.roles.find(v=>v.taskId===ids[1]);assert.equal(role.status,'awaiting_user');assert.equal(values.b.availability,undefined);
  assert.notEqual(role.task.questionsSha256,held.task.questionsSha256);assert.ok(state.roles.filter(v=>v.status==='review_ready').length===2);
  await answer(batch,role);run();state=await ok('status',{batchId:batch});assert.ok(state.roles.every(v=>v.status==='review_ready'));assert.deepEqual(clicks,{});
 });
 test('foreign owner, stale shared context, pause and erase refuse batch commands and clear private continuations',async()=>{
  const batch=await prepared();assert.equal((await command('status',{batchId:batch},null,'foreign')).status,403);
  db.sql("update career_watch_kv set value='{\"version\":2,\"epoch\":0,\"paused\":true}'where user_id='"+U+"'and key='career:account'");
  assert.equal((await command('status',{batchId:batch})).status,403);assert.equal((await command('review',{batchId:batch})).status,403);
  db.sql("update career_watch_kv set value='{\"version\":3,\"epoch\":1,\"paused\":true}'where user_id='"+U+"'and key='career:account'");
  assert.equal(db.sql('select count(*)from career_application_batches_v1'),'0');assert.equal(db.sql('select count(*)from career_application_batch_commands_v1'),'0');assert.deepEqual(clicks,{});
  for(const role of ['anon','authenticated'])assert.throws(()=>db.sql('select *from career_application_batch_roles_v1',role));
 });
 test('closed current posting is held before any browser open; surviving roles remain reviewable',async()=>{
  const created=await ok('create',{taskIds:ids});postings[1].status='closed';run();
  const status=await ok('status',{batchId:created.batchId});assert.equal(status.roles.find(v=>v.taskId===ids[1]).task.blocker,'JOB_CLOSED');assert.equal(opens.b,undefined);assert.equal((await review(created.batchId)).manifest.roles.length,2);
 });
 test('unregistered destination is durably blocked without starving supported roles',async()=>{
  worker.releaseEvidence({immediate:true});registeredKeys=['a','c'];worker=makeWorker();const batch=await prepared();
  const status=await ok('status',{batchId:batch});assert.equal(status.roles.find(v=>v.taskId===ids[1]).task.blocker,'DESTINATION_NOT_REGISTERED');assert.equal(opens.b,undefined);
  assert.equal((await review(batch)).manifest.roles.length,2);assert.equal(run().length,0);
 });
}
