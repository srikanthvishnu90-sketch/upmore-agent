-- HELD. Rolls back 02 (the Messages card, 20261021220430) after 90: everything it added, nothing else (it replaced no
-- existing function). Refuses while the bridge is applied or any card exists.
begin;
do $$ begin
 if to_regclass('career_message_approval_private.cloud_card_enrollments') is not null then raise exception 'roll back the bridge (90) first'; end if;
 if to_regclass('public.career_apply_message_cards') is not null and exists (select 1 from public.career_apply_message_cards) then
  raise exception 'cards exist: stop and ask the owner'; end if;
end $$;
drop trigger if exists career_apply_message_boundary on public.career_apply_jobs;
drop function if exists public.career_apply_message_card_show_as(uuid,uuid,jsonb);
drop function if exists public.career_apply_message_card_read_own(uuid);
drop function if exists public.career_apply_message_card_approve_own(uuid,text);
-- The table first: its read policy depends on the TEST-eligibility function.
drop table if exists public.career_apply_message_cards;
drop function if exists public.career_apply_message_card_test_enabled_own();
drop schema if exists career_message_approval_private cascade;
delete from public.upmore_migration_ledger where filename = '20261021220430_career_apply_message_cards.sql';
commit;
