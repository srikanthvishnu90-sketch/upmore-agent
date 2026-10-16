'use strict';
// REAL PostgreSQL only in the explicitly named network-none Docker fixture.
// Funding is synthetic and never represents the owner's unanswered $5 balance.
const {test,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const F=require('./helpers/model-boundary-fixture.cjs');
const db=require('./helpers/career-task-sql.cjs')(process.env.CAREER_TEST_CONTAINER,process.env.CAREER_TEST_DATABASE);
const H='a'.repeat(64),q=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
let approvedPrice=H;
beforeEach(()=>{
 approvedPrice=H;
 db.sql('truncate auth.users cascade;delete from career_model_campaign_v1;');
 for(const [u,t]of [[F.U,F.T],[F.V,F.TV]])db.sql(`insert into auth.users values('${u}');insert into agent_threads values('${t}','${u}');insert into agent_flow_state(thread_id,user_id,state)values('${t}','${u}',${q({career:F.snapshot(u)})});`);
});
const fund=(limit=5000000,opening=0,price=H)=>{approvedPrice=price;return db.sql(`insert into career_model_campaign_v1 values('owner-shared-5usd','openai','gpt-5-nano','${price}',${limit},${opening},0,true,now()+interval '1 hour');`);};
const args=(key,u=F.U,t=F.T,bound=500)=>({p_user:u,p_thread:t,p_key:key,p_hash:H,p_payload:H,p_revision:0,p_version:0,p_epoch:0,p_provider:'openai',p_model:'gpt-5-nano',p_price:approvedPrice,p_bound:bound});
const reserve=(key,u=F.U,t=F.T,bound=500)=>db.call('career_model_budget_reserve_v1',args(key,u,t,bound));
const consume=(g,u=F.U)=>db.call('career_model_budget_consume_v1',{p_user:u,p_ticket:g.ticket});
const settle=(g,outcome,cost=null,usage=null,u=F.U)=>db.call('career_model_budget_settle_v1',{p_user:u,p_ticket:g.ticket,p_outcome:outcome,p_cost:cost,p_usage:usage});
const spent=()=>Number(db.sql('select opening_micros+current_micros from career_model_campaign_v1;'));
function threeUnknown(){for(let i=0;i<3;i++){const g=reserve('unknown-'+i);assert.equal(g.ok,true);assert.equal(consume(g).ok,true);assert.equal(settle(g,'unknown').ok,true);}}
test('independent global uncertainty stop revokes an earlier different-owner dispatch ticket',()=>{
 fund();const held=reserve('held',F.V,F.TV);assert.equal(held.ok,true);threeUnknown();assert.equal(reserve('later',F.V,F.TV).reason,'usage_review_required');
 const dispatch=consume(held,F.V);assert.equal(dispatch.ok,false,'a ticket granted before the global stop must not start a new provider request');assert.equal(dispatch.reason,'usage_review_required');
 assert.equal(settle(held,'not_sent',0,{},F.V).ok,true);assert.equal(spent(),1500);
});
test('independent crashed started requests count as uncertain when their receipt deadlines expire',()=>{
 fund();for(let i=0;i<3;i++){const g=reserve('crashed-'+i);assert.equal(consume(g).ok,true);}
 db.sql("update career_model_reservations_v1 set expires_at=now()-interval '1 second' where state='started';");
 assert.equal(reserve('after-crash',F.V,F.TV).reason,'usage_review_required','lost processes must not evade the global unknown-outcome stop');assert.equal(spent(),1500);
});
test('independent overdue calls also revoke an unconsumed different-owner ticket',()=>{
 fund();const held=reserve('held',F.V,F.TV);for(let i=0;i<3;i++){const g=reserve('crashed-'+i);consume(g);}
 db.sql("update career_model_reservations_v1 set expires_at=now()-interval '1 second' where state='started';");
 assert.equal(consume(held,F.V).ok,false);assert.equal(settle(held,'not_sent',0,{},F.V).ok,true);assert.equal(spent(),1500);
});
test('independent actual staged entry cannot dispatch a held ticket after another owner trips the global stop',async t=>{
 let interrupted=false;
 const f=await F.fixture(t,{async rpc(name,a){
  if(name==='agent_model_call_reserve'&&!interrupted){interrupted=true;threeUnknown();return {data:{ok:true,call_id:require('node:crypto').randomUUID()},error:null};}
  if(name.startsWith('career_model_'))return db.client.rpc(name,a);
 }});
 const gateway=f.entry.exportsFor('_shared/model_gateway.ts'),cfg=gateway.modelConfig({get(){}}),p=gateway.PRICES[cfg.model];
 const price=require('node:crypto').createHash('sha256').update(JSON.stringify({cached:p.cached,input:p.input,model:cfg.model,output:p.output,provider:cfg.provider})).digest('hex');
 fund(5000000,0,price);
 const r=await f.as(F.V).request();assert.equal(interrupted,true);assert.equal(r.status,200);assert.equal(f.requests.length,0,'global stop must be checked immediately before the actual gateway call');
 assert.notEqual(r.body.meta.career_model.status,'generated');assert.equal(spent(),1500);assert.equal(db.sql("select state from career_model_reservations_v1 where user_id='"+F.V+"';"),'not_sent');
});
test('independent global allowance cannot be overbooked by concurrent owners',async()=>{
 fund(2500,1700);const grants=await Promise.all(Array.from({length:12},(_,i)=>db.callAsync('career_model_budget_reserve_v1',args('race-'+i,i%2?F.U:F.V,i%2?F.T:F.TV,200))));
 assert.equal(grants.filter(x=>x.ok).length,4);assert.equal(spent(),2500);assert.equal(Number(db.sql('select sum(bound_micros) from career_model_reservations_v1;')),800);
});
test('independent concurrent same-owner/same-turn retry reserves exactly once',async()=>{
 fund();const replies=await Promise.all(Array.from({length:8},()=>db.callAsync('career_model_budget_reserve_v1',args('same'))));assert.equal(replies.filter(x=>x.ok).length,1);assert.equal(spent(),500);assert.equal(db.sql('select count(*) from career_model_reservations_v1;'),'1');
 assert.equal(db.call('career_model_budget_reserve_v1',{...args('same'),p_hash:'b'.repeat(64)}).reason,'turn_key_conflict');
});
test('independent timeout/crash reservation remains charged and cannot be refunded or replayed',()=>{
 fund();const g=reserve('timeout');consume(g);db.sql("update career_model_reservations_v1 set expires_at=now()-interval '1 hour';");
 assert.equal(consume(g).ok,false);assert.equal(reserve('timeout').reason,'already_reserved');assert.throws(()=>settle(g,'not_sent',0,{}));assert.equal(spent(),500);
 assert.equal(settle(g,'unknown').ok,true);assert.equal(spent(),500);assert.throws(()=>settle(g,'recorded',0,{}));
});
test('independent owner mismatch, STOP and post-erase epochs cannot consume old tickets',()=>{
 fund();const g=reserve('before-erase');assert.equal(consume(g,F.V).ok,false);
 db.sql(`insert into career_watch_kv(user_id,key,value)values('${F.U}','career:account','{"version":1,"epoch":1,"paused":true}');`);
 assert.equal(consume(g).ok,false);assert.equal(settle(g,'not_sent',0,{}).ok,true);assert.equal(spent(),0);assert.equal(reserve('after-erase').ok,false);
});
test('independent no client-role access and no security-definer budget functions',()=>{
 for(const role of ['anon','authenticated']){assert.throws(()=>db.sql('select * from career_model_reservations_v1;',role));assert.throws(()=>db.sql(`select career_model_budget_reserve_v1('${F.U}','${F.T}','probe','${H}','${H}',0,0,0,'openai','gpt-5-nano','${H}',500);`,role));}
 assert.equal(db.sql("select count(*) from pg_proc where proname like 'career_model_%' and prosecdef;"),'0');
});
