-- P1 text yes (20261024140000): an approve intent may leave named applications of THE card off ("yes but not 2").
-- The database commits it only when every excluded key is a doorstep application of the stored run whose card hash the
-- yes names, and at least one remains; without exclude_keys the commit is exactly the one before.
begin;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000a21','textyes@example.test');
insert into profiles(id) values('00000000-0000-4000-8000-000000000a21');
insert into agent_threads(id,user_id) values('00000000-0000-4000-8000-000000000aa1','00000000-0000-4000-8000-000000000a21');
create or replace function pg_temp.turn0() returns text language sql as $$
 select public.career_host_commit('00000000-0000-4000-8000-000000000a21','00000000-0000-4000-8000-000000000aa1','ty0',repeat('a',64),0,0,
  jsonb_build_object('scope',jsonb_build_object('userId','00000000-0000-4000-8000-000000000a21')),'{}'::jsonb,'TEST turn',
  jsonb_build_object('reply','TEST reply','thread_id','00000000-0000-4000-8000-000000000aa1'))->>'error' $$;
select t.ok(pg_temp.turn0() is null,'the first turn creates the account');
-- A stored run at its card: three doorstep applications (k1..k3) and one stopped (k4), card hash H.
insert into public.career_batch_runs_v1(user_id,run_id,state,run) values('00000000-0000-4000-8000-000000000a21','batch-TEST-ty1','awaiting_approval',
 jsonb_build_object('id','batch-TEST-ty1','cardSha256',repeat('b',64),'selected',jsonb_build_array('k1','k2','k3','k4'),
  'apps',jsonb_build_object('k1',jsonb_build_object('stage','doorstep'),'k2',jsonb_build_object('stage','doorstep'),
   'k3',jsonb_build_object('stage','doorstep'),'k4',jsonb_build_object('stage','stopped'))));
-- One approve turn through the real commit; returns the error text, or null on success.
create or replace function pg_temp.approve(p_key text, p_rev bigint, p_hash text, p_ex jsonb) returns text language plpgsql as $$
declare u text:='00000000-0000-4000-8000-000000000a21'; th text:='00000000-0000-4000-8000-000000000aa1'; i jsonb;
begin
 i:=jsonb_build_object('version','career_batch_intent/v1','intent_id',encode(sha256(convert_to(p_key,'UTF8')),'hex'),'user_id',u,
  'thread_id',th,'turn_key',p_key,'request_hash',repeat('a',64),'action','approve','event_id','ev-'||p_key,'run_id','batch-TEST-ty1',
  'card_sha256',p_hash,'authority_account_version',p_rev+1,'privacy_epoch',0);
 if p_ex is not null then i:=i||jsonb_build_object('exclude_keys',p_ex); end if;
 return public.career_batch_turn_commit_v1(jsonb_build_object('p_user',u,'p_thread',th,'p_key',p_key,'p_hash',repeat('a',64),
  'p_revision',p_rev,'p_account_version',p_rev,'p_snapshot',jsonb_build_object('scope',jsonb_build_object('userId',u)),'p_patch','{}'::jsonb,
  'p_input','Approve batch batch-TEST-ty1','p_response',jsonb_build_object('reply','TEST reply','thread_id',th,
   'batch',jsonb_build_object('intent_id',i->>'intent_id','userId',u,'id','batch-TEST-ty1','bindings',i))),i)->>'error';
exception when others then return sqlerrm;
end $$;
create or replace function pg_temp.binding(text) returns jsonb language sql as $$
 select binding from public.career_batch_intents_v1 where user_id='00000000-0000-4000-8000-000000000a21' and turn_key=$1 $$;

select t.ok(pg_temp.approve('ty-x1',1,repeat('b',64),'["k9"]') = 'batch exclusion not on card','a key not on the card is refused');
select t.ok(pg_temp.approve('ty-x2',1,repeat('b',64),'["k4"]') = 'batch exclusion not on card','a stopped (non-card) application cannot be excluded');
select t.ok(pg_temp.approve('ty-x3',1,repeat('b',64),'["k1","k2","k3"]') = 'batch exclusion not on card','leaving every card application out is refused');
select t.ok(pg_temp.approve('ty-x4',1,repeat('b',64),'["k1","k1"]') = 'invalid batch exclusion','duplicate keys are refused');
select t.ok(pg_temp.approve('ty-x5',1,repeat('b',64),'[]') = 'invalid batch exclusion','an empty exclusion list is refused (omit the field)');
select t.ok(pg_temp.approve('ty-x6',1,repeat('b',64),'"k1"') = 'invalid batch exclusion','a non-array is refused');
select t.ok(pg_temp.approve('ty-x7',1,repeat('c',64),'["k2"]') = 'batch card mismatch','a yes for a moved card is refused before its exclusions are read');
select t.ok((select count(*) from public.career_batch_intents_v1 where user_id='00000000-0000-4000-8000-000000000a21')=0,'no refused yes left an intent');
select t.ok(pg_temp.approve('ty-ok1',1,repeat('b',64),'["k2"]') is null,'"yes but not 2" commits');
select t.ok(pg_temp.binding('ty-ok1')->'exclude_keys' = '["k2"]'::jsonb and pg_temp.binding('ty-ok1')->>'card_sha256'=repeat('b',64),
 'the committed intent carries the exclusion and the card hash');
select t.ok(pg_temp.approve('ty-ok2',2,repeat('b',64),null) is null and not (pg_temp.binding('ty-ok2') ? 'exclude_keys'),
 'a plain yes commits exactly as before (no exclusion field)');
rollback;
