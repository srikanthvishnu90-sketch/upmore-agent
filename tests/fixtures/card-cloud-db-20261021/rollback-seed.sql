-- WRITTEN / NOT_RUN. Synthetic rollback inputs, never a migration or real employer submission.
-- The rollback driver invokes this explicit fixture file in a fixture-only psql session.
-- Requires separate authorization for disposable source/TEST setup, temporary local switch writes,
-- real database claim/finish RPCs and committed test data. NO browser or provider is invoked.
\set ON_ERROR_STOP on
\if :{?bridge_lifecycle_commits_authorized}
\else
 \echo 'BLOCKED: explicit lifecycle/fixture authorization required'
 \quit 3
\endif
\if :{?bridge_disposable_database}
\else
 \echo 'BLOCKED: exact disposable database required'
 \quit 3
\endif
select coalesce(:'bridge_lifecycle_commits_authorized'='true'
 and current_database()=:'bridge_disposable_database' and inet_server_addr() is null
 and current_setting('upmore.test.disposable',true)='card-cloud-rollback',false) as rb_seed_allowed \gset
\if :rb_seed_allowed
\else
 \echo 'BLOCKED: synthetic fixture needs the independently marked local disposable database'
 \quit 3
\endif
begin;
reset role;
set local search_path=public,pg_temp;
create function pg_temp.rb_seed_ok(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL rollback seed: %',label;end if;end $$;
select pg_temp.rb_seed_ok(not exists(select from public.career_cloud_settings
 where key in('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT') and value='on')
 and not exists(select from public.career_apply_jobs where state='driving'),
 'both switches OFF and no in-flight drive before synthetic setup');
\ir fixture.sql
select pg_temp.cc_seed_sources();
-- This fixed invented UUID is a local TEST fixture, not a C10 enrollment or a real-user grant.
insert into career_message_approval_private.test_users(user_id,enabled)
 values('00000000-0000-4000-8000-00000000cb01',true)
 on conflict(user_id) do update set enabled=true;
select pg_temp.rb_seed_ok(not exists(select from public.career_apply_jobs
 where user_id='00000000-0000-4000-8000-00000000cb01'),
 'fresh fixture owner has no prior queue or attempted rows');
select public.career_apply_cloud_optin_as('00000000-0000-4000-8000-00000000cb01',true,
 'SYNTHETIC rollback fixture only; no employer sends');
insert into public.career_apply_cloud_gate_waivers(user_id,portal,max_sends,expires_at,note)
 values('00000000-0000-4000-8000-00000000cb01','lever',5,clock_timestamp()+interval'1 hour',
 'SYNTHETIC local rollback claims only; not a real delivery permission');
create temp table rb_seed_card(k text primary key,v jsonb);
grant all on rb_seed_card to authenticated,service_role;
set role service_role;
insert into rb_seed_card values('card',public.career_apply_message_cloud_card_show_as(
 '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-00000000cba1',
 jsonb_build_array(pg_temp.cc_full_item('atomic-first'),pg_temp.cc_full_item('atomic-last'),
 pg_temp.cc_full_item('unknown-top'))));
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000cb01',true);
set role authenticated;
insert into rb_seed_card values('receipt',public.career_apply_message_card_approve_own(
 (select (v->>'id')::uuid from rb_seed_card where k='card'),
 (select v->>'hash' from rb_seed_card where k='card')));
reset role;
select pg_temp.rb_seed_ok((select (v->>'approved_count')::integer=3 and jsonb_array_length(v->'jobs')=3
 from rb_seed_card where k='receipt'),'actual tap minted one exact three-item batch');
-- Fixture-only claim prerequisites. These settings are restored OFF in this same transaction.
insert into public.career_cloud_settings(key,value) values('CAREER_CLOUD_APPLY','on'),('CAREER_AGENT_SUBMIT','on')
 on conflict(key) do update set value=excluded.value;
create temp table rb_seed_claims as select * from public.career_apply_cloud_claim_at(2,clock_timestamp());
select pg_temp.rb_seed_ok((select count(*)=2 and bool_and(user_id='00000000-0000-4000-8000-00000000cb01')
 from rb_seed_claims),'two actual leases; no UUID/order assumption');
-- A genuine database authorization fence runs before each simulated terminal receipt.
-- This is fixture creation, not evidence that an engine or employer saw any submission.
do $$declare j record;ordinal integer:=0;state text;outcome text;authorization jsonb;begin
 for j in select * from rb_seed_claims order by id loop
  authorization:=public.career_apply_message_cloud_authorize(j.id,j.lease_token,j.payload_hash,
   public.career_apply_message_cloud_sources(j.user_id)->>'digest');
  perform pg_temp.rb_seed_ok(authorization->>'authorized'='true','actual current lease/source fence');
  ordinal:=ordinal+1;
  state:=case ordinal when 1 then 'submitted_unconfirmed' else 'unknown_outcome' end;
  outcome:=case ordinal when 1 then 'submitted' else 'interrupted' end;
  perform public.career_apply_cloud_finish(j.id,j.lease_token,state,
   jsonb_build_object('reason','SYNTHETIC simulated terminal receipt for rollback only',
    'engine_invoked',false,'employer_invoked',false),outcome,null);
 end loop;
end $$;
update public.career_cloud_settings set value='off' where key in('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT');
select pg_temp.rb_seed_ok(not exists(select from public.career_apply_jobs where state='driving')
 and not exists(select from public.career_cloud_settings
  where key in('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT') and value='on'),
 'fixture ends OFF with both real claim leases settled');
create temp table bridge_rollback_cases as
 select j.id job_row_id,b.approval_id,b.card_id,b.item_index,j.payload_hash,a.expires_at,
 j.state expected_before_state,array['card_cloud_bridge_receipt']::text[] evidence_path,
 jsonb_build_object('card_id',b.card_id,'item_index',b.item_index,'approval_id',b.approval_id,
  'payload_hash',a.payload_hash,'approved_at',a.approved_at,'expires_at',a.expires_at,
  'card_hash',r.card_hash,'tap_receipt',r.receipt) binding_receipt
 from public.career_apply_jobs j
 join career_message_approval_private.cloud_bound_jobs b on b.job_row_id=j.id
 join career_message_approval_private.cloud_bound_approvals a on a.approval_id=b.approval_id
 join career_message_approval_private.cloud_tap_receipts r on r.card_id=b.card_id and r.user_id=b.user_id
 where b.card_id=(select (v->>'id')::uuid from rb_seed_card where k='card');
alter table bridge_rollback_cases add primary key(job_row_id);
select pg_temp.rb_seed_ok((select count(*)=3 from bridge_rollback_cases)
 and not exists(select from unnest(array['queued','submitted_unconfirmed','unknown_outcome']) s
 where not exists(select from bridge_rollback_cases c where c.expected_before_state=s)),
 'all three required actual bound outcome rows and complete tap receipts exported');
commit;
select set_config('upmore.bridge_rollback_fixture','synthetic-only',false);
-- pg_temp.bridge_rollback_cases persists in this fixture-only session for the immediately following
-- checkpoint to copy into its private QA schema. No caller invents job/approval/card IDs or receipts.
