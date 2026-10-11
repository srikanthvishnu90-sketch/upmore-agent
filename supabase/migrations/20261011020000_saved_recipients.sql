-- Recipient memory for every person-to-person money flow (pay, split, request). Rail 1, BUILD-STATUS.
-- A row exists only after a completed send (the debit posted, or the rail confirmed) or an explicitly confirmed save
-- (the person typed the handle back and said SAVE). A name mentioned in a message is never a row. The resolution order
-- (exact handle, then full name, then first name; two matches ask; a look-alike handle is named) lives in
-- packages/domain/42-agent-recipients.js and reads these rows through the caller's RLS-scoped client.
--
-- Columns beyond the spec, each needed for a reason:
--   rail          the app the handle belongs to (venmo, zelle, cash_app, paypal). @sarah on Venmo and @sarah on
--                 Cash App are different people, so a handle without its rail cannot be paid safely.
--   evidence_ref  what made the save legitimate: the posted transaction id or rail reference for a completed send, the
--                 read-back confirmation id for an explicit save. A row with no evidence cannot be written.
-- channel is the conversation channel the save was confirmed on (imessage, sms, whatsapp, in-app).
create table if not exists public.saved_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  handle text,
  display_name text,
  channel text check (channel is null or channel in ('imessage', 'sms', 'whatsapp', 'in-app')),
  source text not null check (source in ('completed_send', 'confirmed')),
  rail text check (rail is null or rail in ('venmo', 'zelle', 'cash_app', 'paypal')),
  evidence_ref text not null check (length(btrim(evidence_ref)) between 1 and 200),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  check (coalesce(btrim(handle), '') <> '' or coalesce(btrim(display_name), '') <> ''),
  check (handle is null or length(handle) <= 100),
  check (display_name is null or length(display_name) <= 100),
  -- Never identity digits: a card or account number is not a handle, and is refused by the table itself.
  check (coalesce(handle, '') !~ '\d{13,}' and coalesce(display_name, '') !~ '\d{9,}')
);
-- One row per handle per rail per person; the agent touches last_used_at instead of adding a duplicate.
create unique index if not exists saved_recipients_handle_unique
  on public.saved_recipients (user_id, coalesce(rail, ''), lower(handle)) where handle is not null;
create index if not exists saved_recipients_user_name on public.saved_recipients (user_id, lower(display_name));

alter table public.saved_recipients enable row level security;
revoke all on public.saved_recipients from anon, authenticated;
grant select, insert, update, delete on public.saved_recipients to authenticated;
-- The messaging bridge runs as service_role, which bypasses row-level security (BYPASSRLS), so it can read and write
-- recipients for the user whose message it is handling. It is never exposed to a client.
grant all on public.saved_recipients to service_role;
drop policy if exists saved_recipients_owner_read on public.saved_recipients;
create policy saved_recipients_owner_read on public.saved_recipients for select to authenticated using (user_id = auth.uid());
drop policy if exists saved_recipients_owner_insert on public.saved_recipients;
create policy saved_recipients_owner_insert on public.saved_recipients for insert to authenticated with check (user_id = auth.uid());
drop policy if exists saved_recipients_owner_update on public.saved_recipients;
create policy saved_recipients_owner_update on public.saved_recipients for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists saved_recipients_owner_delete on public.saved_recipients;
create policy saved_recipients_owner_delete on public.saved_recipients for delete to authenticated using (user_id = auth.uid());
