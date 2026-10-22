-- HELD. Read-only preflight for the live apply of 20261021220430 (card) then 20261024130000 (bridge). Raises on any
-- surprise; writes nothing. Run immediately before 02 and again before 03 (the second run allows the card to be live).
do $$
declare card_live boolean := to_regprocedure('public.career_apply_message_card_approve_own(uuid,text)') is not null;
begin
 -- Prerequisites the bridge checks too, already live since 2026-10-21.
 if to_regprocedure('public.career_apply_cloud_waiver_left(uuid,text,timestamp with time zone)') is null
  or to_regprocedure('public.career_apply_extension_begin_agent_own(jsonb,text,text)') is null
  or to_regprocedure('public.career_apply_cloud_ask(uuid,uuid,jsonb)') is null
  or to_regprocedure('public.career_apply_agent_submit_enabled()') is null
  or to_regclass('public.agent_threads') is null or to_regclass('public.agent_messages') is null then
  raise exception 'preflight: a live prerequisite is missing'; end if;
 -- The bridge is not live yet; the card is either not live (before 02) or live with its ledger row (before 03).
 if to_regclass('career_message_approval_private.cloud_card_enrollments') is not null
  or exists (select 1 from public.upmore_migration_ledger where filename = '20261024130000_career_apply_card_cloud_bridge.sql') then
  raise exception 'preflight: the bridge is already applied'; end if;
 if card_live <> exists (select 1 from public.upmore_migration_ledger where filename = '20261021220430_career_apply_message_cards.sql') then
  raise exception 'preflight: card functions and ledger disagree'; end if;
 -- Nothing in flight, nothing on.
 if public.career_apply_cloud_enabled() or public.career_apply_agent_submit_enabled() then
  raise exception 'preflight: a switch is on (CAREER_CLOUD_APPLY or CAREER_AGENT_SUBMIT): stop and ask the owner'; end if;
 if exists (select 1 from public.career_apply_jobs where state in ('queued', 'driving')) then
  raise exception 'preflight: queued or driving jobs exist'; end if;
 -- The functions the bridge replaces (the card replaces none) are exactly the shape this package was rehearsed on and
 -- 90-rollback-bridge.sql restores (read from production 2026-10-22, equal to tests/db/run.sh's rolled-back shape).
 -- Anything else: stop, rebuild and re-rehearse; the rollback would not restore what is live.
 if (select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || md5(p.prosrc), ' '
   order by p.proname, pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('career_apply_cloud_refusal', 'career_apply_cloud_claim_at', 'career_apply_claim_own',
    'career_apply_extension_begin_own', 'career_apply_batch_revoke_own', 'career_apply_cloud_optin_as', 'career_apply_cloud_optin_get'))
  is distinct from
   'career_apply_batch_revoke_own():15f9bb2c5f51238d19de5f2ed12b12a5'
   ' career_apply_claim_own(p_limit integer):7b7f51daa6d6781d39e020fa6e5c38f5'
   ' career_apply_claim_own(p_limit integer, p_source text):0fb3585eed5dc7209a3b8da4236e6978'
   ' career_apply_cloud_claim_at(p_limit integer, p_now timestamp with time zone):c2a2ccd1fa81e2aa3f5c47ad3bb69b45'
   ' career_apply_cloud_optin_as(p_user uuid, p_on boolean, p_terms text):fbf0f1ff4bbe9f63372a226daa8cb593'
   ' career_apply_cloud_optin_get(p_user uuid):3a5f6c52ef948ee8fb31b2b23bb82b6a'
   ' career_apply_cloud_refusal(j career_apply_jobs, p_now timestamp with time zone):699430a5cefc43f88660a00f73051d1b'
   ' career_apply_extension_begin_own(p_payload jsonb, p_approval text):a414b81aec5a5c73988ff60204b97c98' then
  raise exception 'preflight: a function the bridge replaces differs from the rehearsed live shape: rebuild and re-rehearse'; end if;
end $$;
-- For the record (paste into the apply record):
select now() as at,
 to_regprocedure('public.career_apply_message_card_approve_own(uuid,text)') is not null as card_live,
 (select count(*) from public.career_apply_jobs) as jobs, (select count(*) from public.career_apply_batch_approvals) as batch_approvals,
 (select count(*) from public.career_apply_cloud_gate_waivers) as waivers, (select count(*) from public.career_apply_cloud_optin) as optins,
 (select coalesce(string_agg(key || '=' || value, ', '), 'none') from public.career_cloud_settings) as settings,
 (select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || md5(p.prosrc), ' '
  order by p.proname, pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('career_apply_cloud_refusal', 'career_apply_cloud_claim_at', 'career_apply_claim_own',
   'career_apply_extension_begin_own', 'career_apply_batch_revoke_own', 'career_apply_cloud_optin_as', 'career_apply_cloud_optin_get')) as replaced_function_md5;
