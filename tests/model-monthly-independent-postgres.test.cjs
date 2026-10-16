'use strict';
// Exact staged entry with BOTH real career budget and legacy monthly RPCs.
// Only auth/ownership transport and the provider are synthetic. Local test DB.
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const F=require('./helpers/model-boundary-fixture.cjs'),db=require('./helpers/career-task-sql.cjs')(process.env.CAREER_TEST_CONTAINER,process.env.CAREER_TEST_DATABASE);
const quote=v=>v==null?'NULL':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
const query=(name,args)=>'select public.'+name+'('+Object.entries(args).map(([k,v])=>k+'=>'+quote(v)).join(',')+');';
const row=sql=>JSON.parse(db.sql(sql));
beforeEach(()=>{
 db.sql('truncate auth.users cascade;delete from career_model_campaign_v1;');
 for(const [u,t]of [[F.U,F.T],[F.V,F.TV]])db.sql(`insert into auth.users values('${u}');insert into agent_threads values('${t}','${u}');insert into agent_flow_state(thread_id,user_id,state)values('${t}','${u}',${quote({career:F.snapshot(u)})}::jsonb);`);
});
async function fixture(t,options={}){
 const f=await F.fixture(t,{...options,async rpc(name,args){
  if(!/^(career_[a-z0-9_]+|agent_model_call_(reserve|record))$/.test(name))return undefined;
  try {const raw=db.sql(query(name,args),'service_role');return {data:raw?JSON.parse(raw):null,error:null};}
  catch(e){return {data:null,error:{message:'SYNTHETIC LOCAL RPC FAILURE'}};}
 }});
 const gateway=f.entry.exportsFor('_shared/model_gateway.ts'),cfg=gateway.modelConfig({get(){}}),p=gateway.PRICES[cfg.model];
 const price=crypto.createHash('sha256').update(JSON.stringify({cached:p.cached,input:p.input,model:cfg.model,output:p.output,provider:cfg.provider})).digest('hex');
 db.sql(`insert into career_model_campaign_v1 values('owner-shared-5usd','openai','gpt-5-nano','${price}',5000000,0,0,true,now()+interval '1 hour');`);
 return f;
}
const count=table=>Number(db.sql('select count(*) from '+table+';'));
test('independent real monthly slot and usage receipt agree with global charge and exact owned replay',async t=>{
 const f=await fixture(t),r=await f.request();assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.meta.career_model.status,'generated');
 assert.equal(count('agent_model_calls'),1);assert.equal(count('agent_usage'),1);assert.equal(count('agent_messages'),2);
 const monthly=row('select row_to_json(c) from agent_model_calls c;');assert.equal(monthly.user_id,F.U);assert.equal(monthly.thread_id,F.T);assert.equal(monthly.state,'recorded');
 assert.deepEqual(monthly.usage,{input_tokens:280,output_tokens:80,cache_read_tokens:20,cache_write_tokens:0});
 const campaign=row('select row_to_json(c) from career_model_campaign_v1 c;');assert.equal(campaign.current_micros,47);
 const reservation=row('select row_to_json(r) from career_model_reservations_v1 r;');assert.equal(reservation.state,'recorded');assert.equal(reservation.cost_micros,47);
 assert.deepEqual(await f.request(),r);assert.equal(f.requests.length,1);assert.equal(count('agent_model_calls'),1);assert.equal(count('agent_usage'),1);
});
test('independent real monthly limit denies provider and refunds the known-unsent global reservation',async t=>{
 const f=await fixture(t);db.sql(`insert into agent_model_calls(user_id,thread_id,request_id,step,model) select '${F.U}','${F.T}',gen_random_uuid(),0,'gpt-5-nano' from generate_series(1,900);`);
 const r=await f.request();assert.equal(r.status,200);assert.equal(r.body.meta.career_model.status,'budget_denied');assert.equal(f.requests.length,0);assert.equal(count('agent_model_calls'),900);assert.equal(count('agent_usage'),0);
 assert.equal(db.sql('select state from career_model_reservations_v1;'),'not_sent');assert.equal(db.sql('select current_micros from career_model_campaign_v1;'),'0');
});
test('independent invalid receipt retains monthly slot and full uncertain global reservation',async t=>{
 const f=await fixture(t,{usage:null}),r=await f.request();assert.equal(r.status,200);assert.notEqual(r.body.meta.career_model.status,'generated');assert.equal(f.requests.length,1);assert.equal(count('agent_usage'),0);assert.equal(count('agent_model_calls'),1);
 assert.equal(db.sql('select state from agent_model_calls;'),'reserved');assert.equal(db.sql('select state from career_model_reservations_v1;'),'unknown');assert.equal(db.sql('select current_micros=bound_micros from career_model_campaign_v1 cross join career_model_reservations_v1;'),'t');
 await f.request();assert.equal(f.requests.length,1);assert.equal(count('agent_model_calls'),1);
});
test('independent chat rollback keeps real monthly usage accounted and same-key retry free',async t=>{
 const f=await fixture(t),before=db.sql('select state from agent_flow_state order by thread_id;');
 db.sql("create function model_review_reject() returns trigger language plpgsql as $$begin if NEW.role='assistant' then raise exception 'synthetic chat rollback';end if;return NEW;end$$;create trigger model_review_reject before insert on agent_messages for each row execute function model_review_reject();");
 try {assert.equal((await f.request()).status,503);assert.equal(count('agent_messages'),0);assert.equal(db.sql('select state from agent_flow_state order by thread_id;'),before);assert.equal(count('agent_usage'),1);}
 finally {db.sql('drop trigger model_review_reject on agent_messages;drop function model_review_reject();');}
 assert.equal((await f.request()).status,200);assert.equal(f.requests.length,1);assert.equal(count('agent_usage'),1);assert.equal(count('agent_model_calls'),1);assert.equal(count('agent_messages'),2);
});
test('independent real monthly usage insertion failure cannot refund unknown cost or deliver generated success',async t=>{
 const f=await fixture(t);db.sql("create function model_review_usage_reject() returns trigger language plpgsql as $$begin raise exception 'synthetic usage failure';end$$;create trigger model_review_usage_reject before insert on agent_usage for each row execute function model_review_usage_reject();");
 try {const r=await f.request();assert.equal(r.status,200);assert.notEqual(r.body.meta.career_model.status,'generated');assert.equal(f.requests.length,1);assert.equal(count('agent_usage'),0);assert.equal(db.sql('select state from agent_model_calls;'),'reserved');assert.equal(db.sql('select state from career_model_reservations_v1;'),'unknown');assert.equal(db.sql('select current_micros=bound_micros from career_model_campaign_v1 cross join career_model_reservations_v1;'),'t');}
 finally {db.sql('drop trigger model_review_usage_reject on agent_usage;drop function model_review_usage_reject();');}
});
