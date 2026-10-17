'use strict';
// Isolated PostgreSQL quota contracts. Synthetic outbox records only, no
// browser action, employer receipt or applicant fact is generated here.
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto');
const {createTaskAuthority}=require('../../workers/career-browser/authority.cjs');
if(!process.env.CAREER_TEST_CONTAINER){test('durable application admissions',{skip:'explicit owned PostgreSQL required'},()=>{});}else{
 const db=require('../helpers/career-task-sql.cjs')(process.env.CAREER_TEST_CONTAINER,process.env.CAREER_TEST_DATABASE);
 const authority=createTaskAuthority(db),U='00000000-0000-4000-8000-000000000001',V='00000000-0000-4000-8000-000000000002',T='00000000-0000-4000-8000-000000000003';
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),q=s=>"'"+String(s).replaceAll("'","''")+"'";
 const baseline=process.env.UPMORE_TEST_ADMISSION_BASELINE==='1';
 if(!baseline&&db.sql("select to_regprocedure('career_application_admit_v1()') is null")==='t')db.sql(fs.readFileSync('supabase/sql/proposals/career_application_admissions_v1.sql','utf8'));
 let serial=0;
 beforeEach(()=>{serial=0;db.sql("truncate auth.users cascade;insert into auth.users values('"+U+"'),('"+V+"');insert into agent_threads values('"+T+"','"+U+"');insert into career_watch_kv(user_id,key,value)values('"+U+"','career:account','{\"version\":1,\"epoch\":0,\"paused\":false}');");});
 function grant(company,host='boards.greenhouse.io'){
  const key=String(++serial),taskId=hash('task'+key).slice(0,32),resume=hash('resume'),posting={company,url:'https://'+host+'/fixture/'+key,canonicalKey:'synthetic:'+key};
  const prepare={action:'prepare',resume_sha256:resume},approve={action:'approve',resume_sha256:resume};
  for(const [kind,binding,input]of [['prepare',prepare,{posting}],['approve',approve,null]]){
   const id=hash(kind+key);db.sql('insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,private_input,authority_account_version,privacy_epoch,task_id,state)values('+[q(U),q(id),q(T),q(kind+key),q(hash('request'+kind+key)),q(hash('event'+kind+key)),q(JSON.stringify(binding)),input?q(JSON.stringify(input)):'null',1,0,q(taskId),q(kind==='prepare'?'completed':'queued')].join(',')+');');
  }
  return authority.claim({userId:U,intentId:hash('approve'+key),taskId,expected:{action:'approve'}});
 }
 const begin=g=>authority.begin(g,'submit',hash(g.taskId+'submit'));
 test('sixth same-vendor admission is denied across distinct tasks, threads and worker lifetimes',()=>{
  for(let n=0;n<5;n++)begin(grant('Synthetic company '+n));
  const sixth=grant('Synthetic company sixth');
  assert.throws(()=>createTaskAuthority(db).begin(sixth,'submit',hash('sixth')),/TASK_SUBMISSION_CAP_REACHED|cap reached/);
 });
 if(!baseline){
 test('reserved and uncertain admissions count exactly once without claiming submission',()=>{
  const g=grant('Synthetic company'),ticket=begin(g);authority.consume(g,ticket);authority.settle(g,ticket,'uncertain',hash('before'),null);
  assert.throws(()=>begin(g));
  const current=grant('Unrelated healthy company'),history=db.call('career_application_admission_history_v1',{p_user:U,p_intent:current.intentId,p_lease:current.leaseToken,p_task:current.taskId});
  assert.equal(history.records.length,1);assert.equal(history.records[0].status,'submission_admitted');assert.equal(history.records[0].company,'synthetic company');
  assert.equal(db.sql('select count(*)from career_application_admissions_v1'),'1');
  assert.throws(()=>begin(grant('SYNTHETIC COMPANY','jobs.lever.co')),/TASK_SUBMISSION_CAP_REACHED|cap reached/);
 });
 test('fifteenth daily admission is the limit even across different ATS vendors',()=>{
  for(const host of ['boards.greenhouse.io','jobs.lever.co','jobs.ashbyhq.com'])for(let n=0;n<5;n++)begin(grant(host+' company '+n,host));
  assert.throws(()=>begin(grant('Company sixteen','jobs.smartrecruiters.com')),/TASK_SUBMISSION_CAP_REACHED|cap reached/);
  assert.equal(db.sql('select count(*)from career_application_admissions_v1'),'15');
 });
 test('concurrent admission contenders share the owner lock and cannot take the same final vendor slot',async()=>{
  for(let n=0;n<4;n++)begin(grant('Existing company '+n));
  const contenders=[grant('Concurrent A'),grant('Concurrent B')];
  const outcomes=await Promise.allSettled(contenders.map(g=>db.callAsync('career_task_begin_effect_v1',{p_user:U,p_intent:g.intentId,p_lease:g.leaseToken,p_task:g.taskId,p_operation:'submit',p_effect_key:hash(g.taskId+'race'),p_bindings:g.binding})));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected'&&/cap reached/.test(r.reason.message)).length,1);
  assert.equal(db.sql('select count(*)from career_application_admissions_v1'),'5');
 });
 test('past unknown usage, foreign owner, pause, erase and stale context cannot yield empty permissive history',()=>{
  const old=grant('Older task');begin(old);db.sql('delete from career_application_admissions_v1');const g=grant('Current task');
  const args={p_user:U,p_intent:g.intentId,p_lease:g.leaseToken,p_task:g.taskId};
  assert.throws(()=>db.call('career_application_admission_history_v1',args),/history incomplete/);assert.throws(()=>begin(g),/TASK_SUBMISSION_HISTORY_INCOMPLETE|history incomplete/);
  assert.throws(()=>db.call('career_application_admission_history_v1',{...args,p_user:V}),/authority revoked/);
  for(const patch of [{paused:true},{version:2},{epoch:1}]){
   db.sql("update career_watch_kv set value='"+JSON.stringify({version:1,epoch:0,paused:false,...patch})+"' where user_id='"+U+"' and key='career:account'");
   assert.throws(()=>db.call('career_application_admission_history_v1',args),/authority revoked/);
  }
 });
 test('unknown vendor and erased preparation fail closed; browser cannot supply a quota bucket',()=>{
  assert.throws(()=>begin(grant('Synthetic company','unmapped.example.test')),/TASK_SUBMISSION_ACCOUNTING_REQUIRED|binding missing/);
  const g=grant('Original company');db.sql("update career_task_intents_v1 set private_input=null where user_id='"+U+"' and binding->>'action'='prepare'");assert.throws(()=>begin(g),/TASK_SUBMISSION_ACCOUNTING_REQUIRED|binding missing/);
 });
 test('client roles cannot read admission metadata or call its scoped RPC',()=>{
  for(const role of ['anon','authenticated']){assert.throws(()=>db.sql('select * from career_application_admissions_v1',role));assert.throws(()=>db.sql("select career_application_admission_history_v1('"+U+"','x',null,'x')",role));}
 });
 }
}
