-- WRITTEN / NOT_RUN. Stage checkpoints only; use the separate explicit Python driver.
-- Production up/down NEVER appear here and run as standalone psql -X -v ON_ERROR_STOP=1 -f FILE
-- processes, each in its own session. No outer migration transaction, -1, or SQL include exists.
-- Persistent state lives only in the caller-named qa_card_cloud_rollback_* schema, excluded from
-- baseline/catalog snapshots. Destroy the disposable database after success OR failure.
-- Source fixture contract: pg_temp.bridge_live_source(signature,source_body,source_path,source_commit).
-- Seed contract: pg_temp.bridge_rollback_cases(job_row_id PK,approval_id,card_id,item_index,
-- payload_hash,expires_at,expected_before_state,evidence_path text[],binding_receipt jsonb), plus
-- session marker upmore.bridge_rollback_fixture=synthetic-only. Source/seed and their checkpoint
-- share a fixture-only session so the checkpoint copies temporary inputs into the private QA schema.
-- Seeds use real producer/tap bindings and settled attempted outcomes; no real employer proof claimed.
-- Negative rollback and maintenance/setting-write races remain NOT_RUN, separate-session evidence.
\set ON_ERROR_STOP on
\if :{?bridge_rollback_authorized}
\else
 \echo 'BLOCKED: bridge_rollback_authorized required; NOT_RUN'
 \quit 3
\endif
\if :{?bridge_lifecycle_commits_authorized}
\else
 \echo 'BLOCKED: bridge_lifecycle_commits_authorized required; NOT_RUN'
 \quit 3
\endif
\if :{?bridge_disposable_database}
\else
 \echo 'BLOCKED: bridge_disposable_database required; NOT_RUN'
 \quit 3
\endif
\if :{?bridge_scratch_schema}
\else
 \echo 'BLOCKED: bridge_scratch_schema required; NOT_RUN'
 \quit 3
\endif
\if :{?bridge_run_nonce}
\else
 \echo 'BLOCKED: bridge_run_nonce required; NOT_RUN'
 \quit 3
\endif
\if :{?bridge_stage}
\else
 \echo 'BLOCKED: bridge_stage required; NOT_RUN'
 \quit 3
\endif
select coalesce(:'bridge_rollback_authorized'='true' and :'bridge_lifecycle_commits_authorized'='true'
 and current_database()=:'bridge_disposable_database' and inet_server_addr() is null
 and current_setting('upmore.test.disposable',true)='card-cloud-rollback'
 and :'bridge_scratch_schema'~'^qa_card_cloud_rollback_[a-z0-9_]{1,40}$'
 and :'bridge_run_nonce'~'^[0-9a-f]{32}$'
 and :'bridge_stage' in('baseline','up1','up2','seed','down1','down2','reup'),false) as rb_guard_ok,
 :'bridge_stage'='baseline' as rb_baseline, :'bridge_stage'='up1' as rb_up1,
 :'bridge_stage'='up2' as rb_up2, :'bridge_stage'='seed' as rb_seed,
 :'bridge_stage'='down1' as rb_down1, :'bridge_stage'='down2' as rb_down2,
 :'bridge_stage'='reup' as rb_reup \gset
\if :rb_guard_ok
\else
 \echo 'BLOCKED: authorization/local exact DB/independent marker/schema/nonce/stage mismatch'
 \quit 3
\endif
reset role;
\if :rb_baseline
select to_regnamespace(:'bridge_scratch_schema') is null as rb_fresh \gset
\if :rb_fresh
\else
 \echo 'BLOCKED: scratch schema already exists; refuse stale snapshots'
 \quit 3
\endif
create schema :"bridge_scratch_schema";
revoke all on schema :"bridge_scratch_schema" from public,anon,authenticated,service_role;
\endif
set search_path=:"bridge_scratch_schema",public,pg_temp;
\if :rb_baseline
create table rb_context as select :'bridge_run_nonce'::text nonce,current_database()::text dbname,session_user::text username;
create table rb_progress(stage text not null);
insert into rb_progress values('baseline');
create function rb_ok(ok boolean,label text) returns void language plpgsql set search_path from current as $$
begin if ok is distinct from true then raise exception 'FAIL rollback: %',label; end if;
 raise notice 'ok rollback: %',label; end $$;
create function rb_off_idle() returns boolean language sql set search_path from current as $$
 select not exists(select from public.career_cloud_settings where
 key in('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT') and value='on')
 and not exists(select from public.career_apply_jobs where state='driving') $$;
select rb_ok(rb_off_idle(),'PRECONDITION: both OFF and no driving/uncertain active lease');
select rb_ok(to_regclass('career_message_approval_private.cloud_bound_jobs') is null
 and to_regclass('career_message_approval_private.cloud_bound_approvals') is null
 and to_regclass('career_message_approval_private.cloud_card_enrollments') is null
 and to_regclass('career_message_approval_private.cloud_tap_receipts') is null,'PRECONDITION: unbridged live014 baseline');
-- All required baseline functions must exist BEFORE an up file is included. Absence is setup failure.
create table rb_required(signature text primary key, source_path text not null);
insert into rb_required values
 ('public.career_apply_cloud_refusal(public.career_apply_jobs,timestamp with time zone)','supabase/migrations/20261024120000_career_apply_cloud_gate_waiver.sql'),
 ('public.career_apply_cloud_claim_at(integer,timestamp with time zone)','supabase/migrations/20261024120000_career_apply_cloud_gate_waiver.sql'),
 ('public.career_apply_claim_own(integer,text)','supabase/migrations/20261021080000_career_apply_cloud.sql'),
 ('public.career_apply_claim_own(integer)','supabase/migrations/20261021080000_career_apply_cloud.sql'),
 ('career_message_approval_private.guard_queue()','supabase/migrations/20261021220430_career_apply_message_cards.sql'),
 ('career_message_approval_private.immutable_card()','supabase/migrations/20261021220430_career_apply_message_cards.sql'),
 ('public.career_apply_message_card_approve_own(uuid,text)','supabase/migrations/20261021220430_career_apply_message_cards.sql'),
 ('public.career_apply_message_card_show_as(uuid,uuid,jsonb)','supabase/migrations/20261021220430_career_apply_message_cards.sql'),
 ('public.career_apply_message_card_read_own(uuid)','supabase/migrations/20261021220430_career_apply_message_cards.sql'),
 ('public.career_apply_message_card_test_enabled_own()','supabase/migrations/20261021220430_career_apply_message_cards.sql'),
 ('public.career_apply_extension_begin_own(jsonb,text)','supabase/migrations/20261021120000_career_apply_form_answers.sql'),
 ('public.career_apply_extension_begin_agent_own(jsonb,text,text)','supabase/migrations/20261024100000_career_apply_agent_contract.sql'),
 ('public.career_apply_batch_revoke_own()','supabase/migrations/20261024090000_career_apply_agent_submit.sql'),
 ('public.career_apply_cloud_optin_as(uuid,boolean,text)','supabase/migrations/20261021080000_career_apply_cloud.sql'),
 ('public.career_apply_cloud_optin_get(uuid)','supabase/migrations/20261021080000_career_apply_cloud.sql');
select rb_ok(not exists(select from rb_required where to_regprocedure(signature) is null),
 'PRECONDITION: waiver-era cloud, integer/text own-claim, Messages guard and entrypoints installed');
create table bridge_live_source as select * from pg_temp.bridge_live_source;
select rb_ok(not exists(select from rb_required r left join bridge_live_source s using(signature)
 left join pg_proc p on p.oid=to_regprocedure(r.signature)
 where s.signature is null or s.source_path is distinct from r.source_path
 or s.source_commit is distinct from '01401cb456bc2982d67316165e183bbd275581c9'
 or regexp_replace(trim(p.prosrc),'\s+',' ','g') is distinct from
    regexp_replace(trim(s.source_body),'\s+',' ','g')),
 'PRECONDITION: normalized DDL bodies match exact pinned source files, especially 20261024120000');
-- Definition MD5 is byte-sensitive; raw ACL, owner and OID also must be restored exactly.
create table rb_live_functions as select p.oid,p.oid::regprocedure::text signature,
 md5(pg_get_functiondef(p.oid)) definition_md5,p.proacl::text acl,p.proowner
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','career_message_approval_private') and p.prokind in ('f','p');
create function rb_restore_functions(stage text) returns void language plpgsql set search_path from current as $$
begin perform rb_ok(not exists(select from rb_live_functions b left join pg_proc p on p.oid=b.oid
 where p.oid is null or md5(pg_get_functiondef(p.oid)) is distinct from b.definition_md5
 or p.proacl::text is distinct from b.acl or p.proowner is distinct from b.proowner),
 stage||': byte-exact live definitions/MD5, function identities, owners and ACLs restored'); end $$;

-- Snapshot every preexisting public/private/auth/storage table, including account cap settings,
-- Messages, approvals, questions, resumes, waivers, opt-in and employer-attempted outcomes.
create table rb_base_tables as select c.oid,c.oid::regclass::text name
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','career_message_approval_private','auth','storage') and c.relkind='r';
create function rb_rows(rel regclass) returns jsonb language plpgsql set search_path from current as $$
declare result jsonb; begin execute format(
 'select coalesce(jsonb_agg(v order by v::text),''[]''::jsonb) from (select to_jsonb(x) v from %s x) s',rel)
 into result; return result; end $$;
create table rb_data(stage text,oid oid,name text,rows jsonb,primary key(stage,oid));
create function rb_save_data(stage text) returns void language sql set search_path from current as $$
 insert into rb_data select $1,oid,name,rb_rows(oid::regclass) from rb_base_tables
$$;
create function rb_same_data(stage text,except_jobs boolean default false) returns void language plpgsql set search_path from current as $$
declare b record; begin for b in select * from rb_data where rb_data.stage=rb_same_data.stage loop
 if except_jobs and b.oid='public.career_apply_jobs'::regclass then continue; end if;
 perform rb_ok(to_regclass(b.name)::oid=b.oid and rb_rows(b.oid::regclass)=b.rows,
 stage||': preserved table identity/data '||b.name); end loop; end $$;
create function rb_catalog() returns jsonb language sql set search_path from current as $$
 select jsonb_build_object(
 'schemas',(select jsonb_agg(jsonb_build_array(n.oid,n.nspname,n.nspowner,n.nspacl::text) order by n.oid)
  from pg_namespace n where n.nspname in ('public','career_message_approval_private')),
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proowner,p.proacl::text)
  order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','career_message_approval_private') and p.prokind in ('f','p')),
 'tables',(select jsonb_agg(jsonb_build_array(c.oid,n.nspname,c.relname,c.relowner,c.relacl::text,
   c.relrowsecurity,c.relforcerowsecurity) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','career_message_approval_private') and c.relkind in ('r','S')),
 'columns',(select jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.attnotnull,
   pg_get_expr(d.adbin,d.adrelid)) order by a.attrelid,a.attnum) from pg_attribute a
  join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where n.nspname in ('public','career_message_approval_private') and a.attnum>0 and not a.attisdropped),
 'constraints',(select jsonb_agg(jsonb_build_array(c.conrelid,c.conname,pg_get_constraintdef(c.oid))
  order by c.conrelid,c.conname) from pg_constraint c join pg_namespace n on n.oid=c.connamespace
  where n.nspname in ('public','career_message_approval_private')),
 'indexes',(select jsonb_agg(jsonb_build_array(i.indexrelid,pg_get_indexdef(i.indexrelid)) order by i.indexrelid)
  from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','career_message_approval_private')),
 'triggers',(select jsonb_agg(jsonb_build_array(t.tgrelid,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid))
  order by t.tgrelid,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal
  and n.nspname in ('public','career_message_approval_private')),
 'policies',(select jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname)
  from pg_policies p where p.schemaname in ('public','career_message_approval_private')))
$$;
create table rb_catalogs(stage text primary key,value jsonb);
insert into rb_catalogs values('live014',rb_catalog());
select rb_save_data('before_up');


revoke all on all tables in schema :"bridge_scratch_schema" from public,anon,authenticated,service_role;
revoke all on all functions in schema :"bridge_scratch_schema" from public,anon,authenticated,service_role;
\else
select rb_ok((select nonce=:'bridge_run_nonce' and dbname=current_database() and username=session_user from rb_context),
 'checkpoint belongs to this exact authorized run/user/database');
select rb_ok((select stage=case :'bridge_stage' when 'up1' then 'baseline' when 'up2' then 'up1'
 when 'seed' then 'up2' when 'down1' then 'seed' when 'down2' then 'down1' when 'reup' then 'down2' end
 from rb_progress),'strict checkpoint order');
\if :rb_up1
select rb_same_data('before_up');
select rb_ok(rb_off_idle(),'up: no switch enable or active drive');
select rb_ok(to_regclass('career_message_approval_private.cloud_bound_jobs') is not null
 and to_regclass('career_message_approval_private.cloud_bound_approvals') is not null
 and to_regclass('career_message_approval_private.cloud_card_enrollments') is not null
 and to_regclass('career_message_approval_private.cloud_tap_receipts') is not null,
 'up: proposed private metadata installed (missing symbols are setup/implementation unavailable)');
select rb_ok(not exists(select from career_message_approval_private.cloud_card_enrollments)
 and not exists(select from career_message_approval_private.cloud_bound_approvals)
 and not exists(select from career_message_approval_private.cloud_bound_jobs)
 and not exists(select from career_message_approval_private.cloud_tap_receipts),'up: no seeds or permissions minted');
select rb_ok(not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='career_message_approval_private'
 and c.relname in ('cloud_bound_jobs','cloud_bound_approvals','cloud_card_enrollments','cloud_tap_receipts')
 and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
 or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))),'up: private RLS/client grants');
insert into rb_catalogs values('up_once',rb_catalog());
create table rb_up_functions as select p.oid::regprocedure::text signature,
 md5(pg_get_functiondef(p.oid)) definition_md5,p.proacl::text acl,p.proowner
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','career_message_approval_private') and p.prokind in ('f','p');
create table rb_up_grants as select n.nspname,c.relname,c.relacl::text acl,c.relrowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','career_message_approval_private') and c.relkind='r';
\endif
\if :rb_up2
select rb_ok(rb_catalog()=(select value from rb_catalogs where stage='up_once'),
 'up/up: same identities, definitions, grants, limits, indexes, policies and triggers');
select rb_same_data('before_up');
select rb_ok(rb_off_idle(),'up/up: both OFF and no drive');
select rb_ok(not exists(select from career_message_approval_private.cloud_card_enrollments)
 and not exists(select from career_message_approval_private.cloud_bound_jobs)
 and not exists(select from career_message_approval_private.cloud_bound_approvals)
 and not exists(select from career_message_approval_private.cloud_tap_receipts),'up/up: no new permissions or seeds');
\endif
\if :rb_seed
create table bridge_rollback_cases as select * from pg_temp.bridge_rollback_cases;
alter table bridge_rollback_cases add primary key(job_row_id);
select rb_ok(current_setting('upmore.bridge_rollback_fixture',true)='synthetic-only',
 'PRECONDITION: explicit synthetic fixture marker');
select rb_ok((select count(*)>=3 from bridge_rollback_cases)
 and not exists(select s from unnest(array['queued','submitted_unconfirmed','unknown_outcome']) s
  where not exists(select from bridge_rollback_cases c where c.expected_before_state=s)),
 'PRECONDITION: queued and two settled attempted cases present');
-- Caller supplies only the receipt layout, not permission to ignore its immutable contents.
select rb_ok(not exists(select from bridge_rollback_cases c
 left join public.career_apply_jobs j on j.id=c.job_row_id
 left join career_message_approval_private.cloud_bound_jobs b on b.job_row_id=j.id
 left join career_message_approval_private.cloud_bound_approvals a on a.approval_id=b.approval_id
 left join career_message_approval_private.cloud_tap_receipts r on r.card_id=b.card_id and r.user_id=b.user_id
 where j.id is null or j.state is distinct from c.expected_before_state
 or b.approval_id is distinct from c.approval_id or b.card_id is distinct from c.card_id
 or b.item_index is distinct from c.item_index or a.expires_at is distinct from c.expires_at
 or j.payload_hash is distinct from c.payload_hash or j.approval_hash is distinct from c.payload_hash
 or b.user_id is distinct from j.user_id or a.user_id is distinct from j.user_id or r.receipt is null
 or c.evidence_path is distinct from array['card_cloud_bridge_receipt']
 or c.binding_receipt is distinct from jsonb_build_object('card_id',b.card_id,'item_index',b.item_index,
  'approval_id',b.approval_id,'payload_hash',a.payload_hash,'approved_at',a.approved_at,'expires_at',a.expires_at,
  'card_hash',r.card_hash,'tap_receipt',r.receipt)
 or not jsonb_path_exists(c.binding_receipt,'$.** ? (@ == $v)',jsonb_build_object('v',c.card_id))
 or not jsonb_path_exists(c.binding_receipt,'$.** ? (@ == $v)',jsonb_build_object('v',c.approval_id))
 or not jsonb_path_exists(c.binding_receipt,'$.** ? (@ == $v)',jsonb_build_object('v',c.item_index))
 or not jsonb_path_exists(c.binding_receipt,'$.** ? (@ == $v)',jsonb_build_object('v',c.payload_hash))
 or not jsonb_path_exists(c.binding_receipt,'$.** ? (@ == $v)',jsonb_build_object('v',c.expires_at))
 or (j.state='queued' and (j.attempts<>0 or j.source is not null))
 or (j.state<>'queued' and (j.attempts<>1 or j.source is distinct from 'cloud'))),
 'PRECONDITION: actual durable origin/deadline/Hq and attempted outcomes, full expected receipt');
create table rb_case_jobs as select j.id,to_jsonb(j) row_before from public.career_apply_jobs j
 join bridge_rollback_cases c on c.job_row_id=j.id;
create table rb_other_jobs as select id,to_jsonb(j) row_before from public.career_apply_jobs j
 where not exists(select from bridge_rollback_cases c where c.job_row_id=j.id);
select rb_save_data('before_down');
select rb_ok(rb_off_idle(),'down PRECONDITION: both OFF, every active/uncertain drive settled');
\endif
\if :rb_down1
select rb_restore_functions('first down');
select rb_same_data('before_down',true);
select rb_ok(rb_catalog()=(select value from rb_catalogs where stage='live014'),
 'down: only bridge-owned objects removed; original schema/ACL/guard/entrypoints restored');
select rb_ok(rb_off_idle(),'down: switches remain OFF; no late claim');
select rb_ok((select count(*) from public.career_apply_jobs)=
 (select count(*) from rb_case_jobs)+(select count(*) from rb_other_jobs)
 and not exists(select from rb_other_jobs b left join public.career_apply_jobs j on j.id=b.id
  where to_jsonb(j) is distinct from b.row_before),'down: no queue deletion/addition or unrelated job mutation');
select rb_ok(not exists(select from rb_case_jobs b join bridge_rollback_cases c on c.job_row_id=b.id
 left join public.career_apply_jobs j on j.id=b.id where j.id is null
 or (to_jsonb(j)-array['state','reason','evidence','updated_at']) is distinct from
    (b.row_before-array['state','reason','evidence','updated_at'])
 or j.evidence #> c.evidence_path is distinct from c.binding_receipt
 or not j.evidence @> (b.row_before->'evidence')
 or (c.expected_before_state='queued' and (j.state<>'not_submitted' or j.reason is distinct from 'card_cloud_bridge_rolled_back'))
 or (c.expected_before_state<>'queued' and (j.state is distinct from c.expected_before_state
  or j.reason is distinct from b.row_before->>'reason'))),
 'down: queued closed, terminal outcomes/attempts retained, original evidence plus immutable binding receipt');
select rb_save_data('after_down');
\endif
\if :rb_down2
select rb_restore_functions('second down');
select rb_same_data('after_down');
select rb_ok(rb_catalog()=(select value from rb_catalogs where stage='live014'),
 'down/down: exact live definitions/grants/schema; no reset or extra evidence');
select rb_ok(rb_off_idle(),'down/down: still OFF and idle');
\endif
\if :rb_reup
select rb_same_data('after_down');
select rb_ok(rb_off_idle(),'down/up: OFF; no job revival or new lease');
select rb_ok(not exists(select from rb_up_functions b
 left join pg_proc p on p.oid=to_regprocedure(b.signature)
 where p.oid is null or md5(pg_get_functiondef(p.oid)) is distinct from b.definition_md5
 or p.proacl::text is distinct from b.acl or p.proowner is distinct from b.proowner)
 and not exists(select from rb_up_grants b left join pg_namespace n on n.nspname=b.nspname
 left join pg_class c on c.relnamespace=n.oid and c.relname=b.relname
 where c.oid is null or c.relacl::text is distinct from b.acl or c.relrowsecurity is distinct from b.relrowsecurity),
 'down/up: same bridge/live function definitions, owners, ACLs and table RLS/grants');
select rb_ok(not exists(select from career_message_approval_private.cloud_bound_jobs)
 and not exists(select from career_message_approval_private.cloud_bound_approvals)
 and not exists(select from career_message_approval_private.cloud_card_enrollments),
 'down/up: no reconstructed permissions, seeded enrollment or renewed approvals');
select rb_ok(not exists(select from career_message_approval_private.cloud_tap_receipts),'down/up: no reconstructed tap receipts');
\endif
update rb_progress set stage=:'bridge_stage';
revoke all on all tables in schema :"bridge_scratch_schema" from public,anon,authenticated,service_role;
revoke all on all functions in schema :"bridge_scratch_schema" from public,anon,authenticated,service_role;
\endif
-- Checkpoints intentionally persist; production up/down were separate standalone processes.
-- No claim after down. OFF switches remain mandatory until a new owner decision.
