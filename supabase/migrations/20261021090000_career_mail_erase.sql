-- An erase ("forget everything": career_host_commit writes the account with a new epoch) also deletes what mail tracking
-- (20261020100000_career_mail_tracking.sql) kept about the person: the status events read from their mail and the
-- follow-up and thank-you drafts. It missed both until now (review 2026-10-20). The mail cursor stays: it is only a time,
-- and keeping it stops the next run from reading the same mail again and re-creating what was just erased.
-- Same pattern as WO-033's career_outreach_on_erase: a trigger on the account write, so career_host_commit is unchanged.
create or replace function public.career_mail_on_erase() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if new.key = 'career:account' and coalesce((new.value->>'epoch')::bigint, 0) >
    (case when tg_op = 'UPDATE' then coalesce((old.value->>'epoch')::bigint, 0) else 0 end) then
  delete from public.career_mail_events where user_id = new.user_id;
  delete from public.career_mail_drafts where user_id = new.user_id;
 end if;
 return new;
end $$;
revoke all on function public.career_mail_on_erase() from public, anon, authenticated;
drop trigger if exists career_mail_on_erase on public.career_watch_kv;
create trigger career_mail_on_erase after insert or update on public.career_watch_kv
 for each row when (new.key = 'career:account') execute function public.career_mail_on_erase();
