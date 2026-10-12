-- Monthly rent as a standing flow (real-world C110; spec 16 item S16-15 "pay my rent"; packages/domain/81-standing-rent.js).
-- A row is the person's own standing rule, saved only on their yes to a card that restated it in exact terms (who, how
-- much, which day of the month, which app, from which account). It is a per-person toggle (owner's automation rule,
-- 2026-10-11): one message ("stop rent") sets status to 'stopped'. A row never moves money: each month the agent offers
-- that month's card, and only the person's yes to it STAGES the payment for them to send in their own app. Upmore has
-- no rail that sends rent itself, so rail is one of the handoff apps.
--
-- Columns beyond the spec, each needed for a reason:
--   kind               'rent' only for now; the table is named for standing payments so a bill can join it later.
--   payee_handle       the payee's handle on that app when it is saved (public.saved_recipients); null when the person
--                      picks them in the app themselves. Never an account or card number (refused below).
--   last_staged_month  'YYYY-MM' of the last month staged on the person's yes, so a month is never staged twice and the
--                      scheduler does not offer a month that is already staged.
create table if not exists public.standing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'rent' check (kind in ('rent')),
  payee_name text not null check (length(btrim(payee_name)) between 1 and 100),
  payee_handle text check (payee_handle is null or length(btrim(payee_handle)) between 1 and 100),
  rail text not null check (rail in ('zelle', 'venmo', 'cash_app', 'paypal')),
  amount_cents bigint not null check (amount_cents > 0),
  day_of_month smallint not null check (day_of_month between 1 and 28),
  funding text not null default 'checking' check (length(btrim(funding)) between 1 and 60),
  status text not null default 'active' check (status in ('active', 'stopped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_staged_month text check (last_staged_month is null or last_staged_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- Never identity digits: a card or account number is not a handle, a name or an account label.
  check (coalesce(payee_handle, '') !~ '\d{13,}' and payee_name !~ '\d{9,}' and funding !~ '\d{6,}')
);
-- One active rent rule per person; a stopped one stays as history and a new setup adds a row.
create unique index if not exists standing_payments_one_active_rent
  on public.standing_payments (user_id) where kind = 'rent' and status = 'active';
create index if not exists standing_payments_user on public.standing_payments (user_id, status);

alter table public.standing_payments enable row level security;
revoke all on public.standing_payments from anon, authenticated;
grant select, insert, update, delete on public.standing_payments to authenticated;
-- The scheduler (agent-proactive) and the messaging bridge run as service_role, which bypasses row-level security; it is
-- never exposed to a client.
grant all on public.standing_payments to service_role;
drop policy if exists standing_payments_owner_read on public.standing_payments;
create policy standing_payments_owner_read on public.standing_payments for select to authenticated using (user_id = auth.uid());
drop policy if exists standing_payments_owner_insert on public.standing_payments;
create policy standing_payments_owner_insert on public.standing_payments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists standing_payments_owner_update on public.standing_payments;
create policy standing_payments_owner_update on public.standing_payments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists standing_payments_owner_delete on public.standing_payments;
create policy standing_payments_owner_delete on public.standing_payments for delete to authenticated using (user_id = auth.uid());

-- The scheduler's once-only log gains the month's rent offer as a kind (_shared/proactive.ts, key rent:<rule id>:<YYYY-MM>).
alter table public.agent_proactive_log drop constraint if exists agent_proactive_log_kind_check;
alter table public.agent_proactive_log add constraint agent_proactive_log_kind_check
  check (kind in ('safety','watch','finding','morning_brief','weekly_recap','monthly_close','standing_report','connection','standing_payment')); -- every kind so far: each migration that widens this list restates all of them
