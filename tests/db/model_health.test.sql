-- SQL tests for 20261011040000_model_health_and_turn_costs.sql (live finding 2026-10-11: every model call failed for
-- hours and nothing noticed). The verdict over recent provider calls; nobody but the server reads the events; each person
-- reads only their own cost rows.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-0000-0000-0000000000c1','cost1@example.com'),('00000000-0000-0000-0000-0000000000c2','cost2@example.com');
set role service_role;
select t.ok((select public.model_health(15)->>'status')='idle','no calls: idle');
insert into public.agent_provider_events(provider,model,role,ok,status,error_type,detail) values
  ('openai','gpt-5-nano','chat',false,401,'invalid_request_error','Incorrect API key provided: [key]'),
  ('openai','gpt-5-nano','router',false,401,'invalid_request_error','Incorrect API key provided: [key]'),
  ('openai','gpt-5-nano','planner',false,401,'invalid_request_error','Incorrect API key provided: [key]');
select t.ok((select public.model_health(15)->>'status')='down','three failures and no success: down');
select t.ok((select public.model_health(15)->'last_error'->>'error_type')='invalid_request_error','the verdict names the last error');
insert into public.agent_provider_events(provider,model,role,ok,status) values('openai','gpt-5-nano','chat',true,200);
select t.ok((select public.model_health(15)->>'status')='degraded','three of four failed: degraded');
insert into public.agent_provider_events(provider,model,role,ok,status) select 'openai','gpt-5-nano','chat',true,200 from generate_series(1,4);
select t.ok((select public.model_health(15)->>'status')='ok','three of eight failed: ok');
reset role;
update public.agent_provider_events set created_at=now()-interval '1 hour';
set role service_role;
select t.ok((select public.model_health(15)->>'status')='idle','calls older than the window do not count');
select t.ok((select (public.model_health(90)->>'calls')::int)=8,'a wider window sees them');
-- Cost rows: written by the server, read by their owner only.
insert into public.agent_turn_costs(user_id,provider,models,calls,input_tokens,output_tokens,usd_micros) values
  ('00000000-0000-0000-0000-0000000000c1','openai','{gpt-5-nano}',2,1600,900,440),
  ('00000000-0000-0000-0000-0000000000c1','openai','{gpt-5-nano}',1,800,500,241),
  ('00000000-0000-0000-0000-0000000000c2','openai','{gpt-5-nano}',1,100,100,45);
select t.as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select t.ok((select count(*)=2 from public.agent_turn_costs),'a person reads only their own turn costs');
select t.ok((select usd_micros=681 and turns=2 and model_calls=3 from public.agent_daily_costs),'the daily view sums one person''s day');
select t.must_fail($$insert into public.agent_turn_costs(user_id,calls) values('00000000-0000-0000-0000-0000000000c1',0)$$,'permission denied','a person cannot write cost rows');
select t.must_fail($$select count(*) from public.agent_provider_events$$,'permission denied','a person cannot read provider events');
select t.must_fail($$select public.model_health(15)$$,'permission denied','a person cannot run the health verdict');
reset role;
select t.must_fail($$insert into public.agent_provider_events(provider,model,role,ok) values('gemini','x','chat',true)$$,'check','only known providers are recorded');
rollback;
