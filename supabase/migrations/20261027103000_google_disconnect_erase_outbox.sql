-- Family email (PR #212's pending test, 2026-10-27): the disconnect erase also deletes the undelivered deadline
-- reminder. 20261026200011's trigger deletes what mail tracking kept from the person's Gmail (events, drafts, read
-- cursor) when the career Google row is deleted, but the deadline reminder queued from one of those emails lives in
-- career_outbox, not in the mail tables (career_apply_confirm's remind(): key status:deadline:<message hash>, kind
-- "status", deliver_at before the deadline). Left alone it would still be delivered after the person took Trainee's
-- access away, repeating an email's words. So the same trigger now also deletes the person's UNDELIVERED rows of
-- exactly that key. A reminder already delivered stays: it is already in the person's chat, their own history, like
-- the delivered messages the privacy policy keeps. Every other outbox kind and key (alerts, reports, cards,
-- replies, connect confirmations) is not read from Gmail and stays.
-- Idempotent: the function is replaced whole, with its deletes in the same order as 20261026200011 plus this one;
-- the trigger is dropped and recreated.
create or replace function public.google_career_disconnect_erase() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.provider = 'google_career' then
    delete from public.career_mail_events where user_id = old.user_id;
    delete from public.career_mail_drafts where user_id = old.user_id;
    delete from public.career_mail_cursors where user_id = old.user_id;
    delete from public.career_outbox where user_id = old.user_id and key like 'status:deadline:%' and delivered_at is null;
  end if;
  return old;
end $$;
revoke all on function public.google_career_disconnect_erase() from public, anon, authenticated;
drop trigger if exists user_oauth_connections_google_erase on public.user_oauth_connections;
create trigger user_oauth_connections_google_erase after delete on public.user_oauth_connections
  for each row execute function public.google_career_disconnect_erase();
