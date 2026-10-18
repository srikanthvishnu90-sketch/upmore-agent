'use strict';
// Isolated upgrade tests: never use a live/shared database. The enclosing CI
// harness owns and removes the network-none container; each case owns a new DB.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const build=require('../../scripts/career/forward-upgrade/build.cjs');
const enabled=!!process.env.CAREER_TEST_CONTAINER;
const referenceFile=path.join(build.ROOT,'scripts/career/forward-upgrade/reference-catalog.json');
let serial=0,reference;
function fixture(){
 require('./owned-sql.cjs')();
 const container=process.env.CAREER_TEST_CONTAINER,token=process.env.CAREER_TEST_FIXTURE_TOKEN;
 const database='career_test_forward_'+token+'_'+serial++;
 const run=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']}).trim();
 run(['exec',container,'createdb','-U','postgres',database]);
 const raw=s=>run(['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],s);
 raw('comment on database '+database+' is '+build.quote('upmore-ci-fixture:'+token));
 const sql=s=>{
  assert.equal(run(['inspect','--format','{{index .Config.Labels "upmore.ci-fixture"}}',container]),token);
  assert.equal(raw("select shobj_description(oid,'pg_database')from pg_database where datname=current_database()"),'upmore-ci-fixture:'+token);
  return raw(s);
 };
 for(const p of ['tests/fixtures/career-persistence-schema.sql','tests/fixtures/model-gateway-independent/monthly-schema.sql',...build.SKIP])sql(fs.readFileSync(path.join(build.ROOT,p),'utf8'));
 const catalog=()=>JSON.parse(sql('set search_path=pg_catalog,public;'+build.catalogSelect(build.inventory().scope)));
 const seed=`insert into auth.users values('10000000-0000-0000-0000-000000000001');
 insert into profiles values('10000000-0000-0000-0000-000000000001');
 insert into agent_threads values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
 insert into career_watch_kv(user_id,key,value)values('10000000-0000-0000-0000-000000000001','career:account','{"version":1,"epoch":0,"paused":false}');
 insert into career_reminder_outbox(user_id,reminder_id,status,payload,record)values('10000000-0000-0000-0000-000000000001','old-outbox','uncertain','{"fixture":true}','{"outcome":"unknown"}');
 insert into career_task_intents_v1(user_id,intent_id,thread_id,turn_key,request_hash,event_hash,binding,authority_account_version,privacy_epoch,state,task_id)
 select '10000000-0000-0000-0000-000000000001',repeat(n::text,64),'20000000-0000-0000-0000-000000000001','old-'||n,'hash-'||n,'event-'||n,'{}',1,0,s,repeat(n::text,32) from(values(1,'completed'),(2,'uncertain'))v(n,s);
 insert into career_task_effects_v1(user_id,intent_id,effect_key,task_id,operation,state)
 select user_id,intent_id,'old-submit',task_id,'submit',state from career_task_intents_v1;
 insert into agent_model_calls(id,user_id,thread_id,request_id,step,model,state,usage)values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',0,'fixture-only','recorded','{"input_tokens":5,"output_tokens":7}');
 insert into agent_usage(user_id,thread_id,model,input_tokens,output_tokens,call_id)values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','fixture-only',5,7,'30000000-0000-0000-0000-000000000001');`;
 sql(seed);
 const columns=Object.fromEntries(['career_watch_kv','career_reminder_outbox','career_task_intents_v1','career_task_effects_v1','agent_model_calls','agent_usage'].map(t=>[t,JSON.parse(sql("select json_agg(attname order by attnum)from pg_attribute where attrelid='public."+t+"'::regclass and attnum>0 and not attisdropped"))]));
 const rows=()=>Object.fromEntries(Object.entries(columns).map(([t,cols])=>[t,JSON.parse(sql('select coalesce(jsonb_agg(j order by j::text),\'[]\')from(select to_jsonb(x)j from(select '+cols.map(c=>'"'+c+'"').join(',')+' from '+t+')x)y'))]));
 return {sql,catalog,rows};
}
const denied=(f,re)=>{assert.throws(f,e=>{assert.match(String(e.stderr||e.message),re);return true;});};
test('forward upgrade: supported baseline, preservation, transaction rollback and exact rerun',{skip:!enabled},()=>{
 const f=fixture();reference=f.catalog();
 if(process.env.CAREER_GENERATE_FORWARD_REFERENCE==='1'){
  assert.equal(fs.existsSync(referenceFile),false,'generation refuses to overwrite reviewed reference');
  fs.writeFileSync(referenceFile,JSON.stringify(reference,null,2)+'\n');
 }
 assert.deepEqual(build.canonical(reference),build.canonical(JSON.parse(fs.readFileSync(referenceFile,'utf8'))));
 const before=f.rows(),baseline=f.catalog(),candidate=build.render({catalog:reference}).sql;
 denied(()=>f.sql(fs.readFileSync(path.join(build.ROOT,[...build.SKIP][1]),'utf8')),/already exists/);
 denied(()=>f.sql(build.render().sql),/UPGRADE_REVIEWED_CATALOG_REQUIRED/);
 assert.deepEqual(f.rows(),before);assert.deepEqual(f.catalog(),baseline);
 const injected=candidate.replace('-- supabase/sql/proposals/career_application_batch_v1.sql statement 1',"RAISE EXCEPTION 'UPGRADE_TEST_INJECTED_FAILURE';\n-- supabase/sql/proposals/career_application_batch_v1.sql statement 1");
 assert.notEqual(injected,candidate);
 denied(()=>f.sql(injected),/UPGRADE_TEST_INJECTED_FAILURE/);
 assert.deepEqual(f.catalog(),baseline);assert.deepEqual(f.rows(),before);
 assert.equal(f.sql("select to_regclass('public.career_forward_upgrade_v1')is null"),'t');
 f.sql(candidate);assert.deepEqual(f.rows(),before);
 denied(()=>f.sql("BEGIN;update career_task_intents_v1 set state='claimed',lease_token='50000000-0000-0000-0000-000000000001',expires_at=now()+interval '1 hour'where intent_id=repeat('2',64);select career_application_admission_history_v1('10000000-0000-0000-0000-000000000001',repeat('2',64),'50000000-0000-0000-0000-000000000001',repeat('2',32));ROLLBACK;"),/task submission history incomplete/);
 assert.deepEqual(f.rows(),before);
 assert.equal(f.sql('select count(*)from career_model_pair_policy_v2'),'0');
 assert.equal(f.sql('select count(*)from career_model_campaign_v1'),'0');
 const installed=f.catalog();assert.equal(installed.relations.filter(r=>r.exists).length,build.inventory().scope.relations.length);
 for(const r of installed.relations.filter(r=>!baseline.relations.find(b=>b.name===r.name).exists)){
  assert.equal(r.rls,true,r.name);
  assert.equal(r.acl.some(a=>['PUBLIC','anon','authenticated'].includes(a.grantee)),false,r.name);
 }
 f.sql("update agent_model_calls set usage=usage||'{\"reconciled\":true}'::jsonb");const changed=f.rows();
 f.sql(candidate);assert.deepEqual(f.rows(),changed);
 assert.equal(f.sql('select count(*)from career_forward_upgrade_v1'),'1');
 assert.deepEqual(f.catalog(),installed);
 f.sql('grant select on career_application_admissions_v1 to authenticated');
 denied(()=>f.sql(candidate),/UPGRADE_INSTALLED_CATALOG_DRIFT/);assert.deepEqual(f.rows(),changed);
});
test('forward upgrade: unknown function, grant, policy and partial schema refuse without overwrite',{skip:!enabled},()=>{
 const cases=[
  'create function career_task_control_hook_v1(text)returns text language sql as $$select $1$$',
  "alter function career_task_control_hook_v1() set statement_timeout='2s'",
  'grant execute on function career_task_control_hook_v1()to anon',
  'grant select(value)on career_watch_kv to authenticated',
  'alter policy career_task_backend_v1 on career_task_intents_v1 using(false)',
  'create table career_application_admissions_v1(id text)',
  "create or replace function career_task_control_hook_v1()returns trigger language plpgsql as $$begin return null;end$$"
 ];
 for(const drift of cases){const f=fixture();f.sql(drift);const before=f.rows(),catalog=f.catalog();
  denied(()=>f.sql(build.render({catalog:JSON.parse(fs.readFileSync(referenceFile))}).sql),/UPGRADE_BASELINE_CATALOG_MISMATCH/);
  assert.deepEqual(f.rows(),before);assert.deepEqual(f.catalog(),catalog);
 }
});
test('forward upgrade: active leases and effect liabilities require quiescence',{skip:!enabled},()=>{
 for(const change of ["update career_task_effects_v1 set state='started'where state='uncertain'","update career_task_effects_v1 set state='reserved'where state='uncertain'","update career_task_intents_v1 set state='claimed',expires_at=now()+interval '1 hour'where state='uncertain'"]){
  const f=fixture();f.sql(change);const before=f.rows();
  denied(()=>f.sql(build.render({catalog:JSON.parse(fs.readFileSync(referenceFile))}).sql),/UPGRADE_WORKER_QUIESCENCE_REQUIRED/);
  assert.deepEqual(f.rows(),before);assert.equal(f.sql("select to_regclass('public.career_forward_upgrade_v1')is null"),'t');
 }
});
