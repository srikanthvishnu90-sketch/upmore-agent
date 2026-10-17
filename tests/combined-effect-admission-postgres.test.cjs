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

 test('effect admission rechecks wall-clock lease after an owner-lock wait',async()=>{
  const i=commit(),g=claim(owned,i),ticket=owned.begin(g,'open',hash('lock-wait-effect'));
  const {spawn}=require('node:child_process'),container=process.env.CAREER_TEST_CONTAINER,database=process.env.CAREER_TEST_DATABASE;
  const holder=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1']);
  let output='',holderError='';holder.stderr.on('data',x=>holderError+=x);
  const closed=new Promise((resolve,reject)=>{holder.on('close',code=>code?reject(Error(holderError)):resolve());holder.on('error',reject);});
  const locked=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('owner lock holder did not start')),5000);holder.stdout.on('data',x=>{output+=x;if(output.includes('OWNER_LOCK_HELD')){clearTimeout(timer);resolve();}});});
  holder.stdin.write("begin;select pg_advisory_xact_lock(hashtextextended('"+U+"',0));\n\\echo OWNER_LOCK_HELD\n");
  let outcome,waiting;
  try{
   await locked;
   db.sql("update career_task_intents_v1 set claim_lease_until=clock_timestamp()+interval '1200 milliseconds' where user_id='"+U+"';");
   const pending=db.callAsync('career_task_consume_effect_v1',{p_user:U,p_token:ticket.token}).then(value=>({value}),error=>({error:String(error)}));
   for(let n=0;n<100;n++){
    waiting=JSON.parse(db.sql("select coalesce(jsonb_agg(jsonb_build_object('blocked',true,'transactionStartedBeforeExpiry',s.xact_start<i.claim_lease_until,'expires',i.claim_lease_until,'xactStart',s.xact_start)), '[]') from pg_stat_activity s cross join career_task_intents_v1 i where s.datname=current_database() and s.wait_event_type='Lock' and s.query like 'select public.career_task_consume_effect_v1%' and i.user_id='"+U+"';"));
    if(waiting.length)break;await new Promise(r=>setTimeout(r,20));
   }
   assert.equal(waiting.length,1,'consume must actually wait for owner lock');assert.equal(waiting[0].transactionStartedBeforeExpiry,true,'consume must start before expiry');
   for(let n=0;n<150;n++){if(db.sql("select clock_timestamp()>=claim_lease_until from career_task_intents_v1 where user_id='"+U+"';")==='t')break;await new Promise(r=>setTimeout(r,20));}
   assert.equal(db.sql("select clock_timestamp()>=claim_lease_until from career_task_intents_v1 where user_id='"+U+"';"),'t');
   holder.stdin.end('commit;\n');await closed;outcome=await pending;
   const state=db.sql("select state from career_task_effects_v1 where token='"+ticket.token+"';");
   console.log(JSON.stringify({probe:'EFFECT_ADMISSION_AFTER_LOCK_WAIT',waiting,outcome,effectState:state,physicalEffects:0}));
   assert.match(outcome.error||'',/task owned lease revoked/,'expired admission must be refused');assert.equal(state,'reserved','expired attempt must not consume reservation');
  }finally{if(holder.exitCode===null){holder.stdin.end('rollback;\n');await closed;}}
 });
}
