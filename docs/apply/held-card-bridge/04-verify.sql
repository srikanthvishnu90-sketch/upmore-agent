-- HELD. Read-only verify-after for 02 + 03. Raises on any surprise; writes nothing.
do $$
begin
 if not exists (select 1 from public.upmore_migration_ledger where filename = '20261021220430_career_apply_message_cards.sql')
  or not exists (select 1 from public.upmore_migration_ledger where filename = '20261024130000_career_apply_card_cloud_bridge.sql') then
  raise exception 'verify: a ledger row is missing'; end if;
 if to_regprocedure('public.career_apply_message_card_approve_own(uuid,text)') is null
  or to_regprocedure('public.career_apply_message_cloud_card_show_as(uuid,uuid,jsonb)') is null
  or to_regprocedure('public.career_apply_message_cloud_authorize(uuid,uuid,text,text)') is null
  or to_regclass('career_message_approval_private.cloud_card_enrollments') is null then
  raise exception 'verify: a card or bridge object is missing'; end if;
 -- Empty by default: no enrollment, no TEST user, no card, no binding (C10: enrollment is separately authorized).
 if exists (select 1 from career_message_approval_private.cloud_card_enrollments)
  or exists (select 1 from career_message_approval_private.test_users)
  or exists (select 1 from public.career_apply_message_cards)
  or exists (select 1 from career_message_approval_private.cloud_bound_jobs) then
  raise exception 'verify: a card table is not empty'; end if;
 -- Switches untouched (both still off), caps as ruled: the cloud opt-in default is 15.
 if public.career_apply_cloud_enabled() or public.career_apply_agent_submit_enabled() then raise exception 'verify: a switch reads on'; end if;
 if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_cloud_optin'
   and column_name = 'daily') is distinct from '15' then raise exception 'verify: cloud opt-in default is not 15'; end if;
 -- Grants: the tap and read are the signed-in person's; producer, authorize and sources are the service's alone.
 if has_function_privilege('anon', 'public.career_apply_message_card_approve_own(uuid,text)', 'execute')
  or not has_function_privilege('authenticated', 'public.career_apply_message_card_approve_own(uuid,text)', 'execute')
  or has_function_privilege('authenticated', 'public.career_apply_message_cloud_card_show_as(uuid,uuid,jsonb)', 'execute')
  or has_function_privilege('authenticated', 'public.career_apply_message_cloud_authorize(uuid,uuid,text,text)', 'execute')
  or has_function_privilege('authenticated', 'public.career_apply_message_cloud_sources(uuid)', 'execute')
  or has_table_privilege('authenticated', 'career_message_approval_private.cloud_card_enrollments', 'select') then
  raise exception 'verify: a grant is wider than reviewed'; end if;
 -- The claim takes nothing while the switches are off.
 if exists (select 1 from public.career_apply_cloud_claim_at(6, now())) then raise exception 'verify: the claim returned a job'; end if;
end $$;
select now() as at, 'verify passed' as result,
 (select string_agg(filename, ', ' order by filename) from public.upmore_migration_ledger where filename >= '20261021220430') as ledger;
