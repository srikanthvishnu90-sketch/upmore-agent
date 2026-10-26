-- Trainee sign-up in waves, enforced in the database (launch readiness B7/X1; review of PR #195).
--
-- Who may act: a person is admitted once, and the way is recorded (trainee_admissions.via):
--   existing   every account that exists the first time this runs (nobody who uses Trainee today is locked out);
--   allowlist  their CONFIRMED PHONE is on TRAINEE_ALLOWED_CONTACTS (the edge function checks the env; an email never
--              counts: an email can be confirmed without its owner when Supabase Auth auto-confirms);
--   invite     they redeemed a single-use invite (FEATURE WAVES, career_invites.redeemed_user: the one invite system);
--   open       the owner opened sign-up (trainee_set_signup('open')).
-- The mode lives here, not in an env: trainee_settings.web_signup, 'invite' (closed) unless the owner opens it.
--
-- Enforced where applications are made: a row of a person not admitted is refused (not_admitted) on insert into the
-- prepared applications, the cards, the queue and the apply wants, whoever writes it (the person's RPCs:
-- career_apply_prepare_own, career_apply_card_open_own, career_apply_card_answer_own via career_apply_enqueue, the
-- extension and message-card paths; or a service path). A person who came in by invite and has not finished the
-- sign-up steps (career_signup_gate.step not 'active') is refused the same way.
-- Nothing here sends a message. Idempotent: every statement can run again.

create table if not exists public.trainee_settings (
  key text primary key check (key in ('web_signup')),
  value text not null,
  updated_at timestamptz not null default now(),
  check (key <> 'web_signup' or value in ('invite', 'open'))
);
alter table public.trainee_settings enable row level security;
revoke all on public.trainee_settings from anon, authenticated;
grant select, insert, update on public.trainee_settings to service_role;
insert into public.trainee_settings (key, value) values ('web_signup', 'invite') on conflict (key) do nothing;

create table if not exists public.trainee_admissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- 'waitlist': an invite bound by FEATURE WAVES from a waitlist row (waitlist_id), the same as 'invite' here.
  via text not null check (via in ('existing', 'allowlist', 'invite', 'waitlist', 'open')),
  waitlist_id uuid references public.site_waitlist(id) on delete set null,
  admitted_at timestamptz not null default now()
);
alter table public.trainee_admissions enable row level security;
drop policy if exists trainee_admissions_read_own on public.trainee_admissions;
create policy trainee_admissions_read_own on public.trainee_admissions for select to authenticated using (user_id = auth.uid());
revoke all on public.trainee_admissions from anon, authenticated;
grant select on public.trainee_admissions to authenticated;
grant select, insert, update, delete on public.trainee_admissions to service_role;

-- Every account that exists the first time this runs keeps working. The table's comment marks that it ran, so running
-- the file again later never admits the accounts created since.
do $$ begin
  if obj_description('public.trainee_admissions'::regclass, 'pg_class') is distinct from 'trainee admissions: existing accounts admitted' then
    insert into public.trainee_admissions (user_id, via) select id, 'existing' from auth.users on conflict (user_id) do nothing;
    comment on table public.trainee_admissions is 'trainee admissions: existing accounts admitted';
  end if;
end $$;

-- The digits of a phone, or null when there are too few to be one (shared with FEATURE WAVES).
create or replace function public.trainee_phone_digits(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) between 10 and 15 then regexp_replace(p, '\D', '', 'g') end
$$;

create or replace function public.trainee_signup_mode() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from public.trainee_settings where key = 'web_signup'), 'invite')
$$;

-- The owner's switch (SQL editor, service role): 'open' lets anyone who signs in use Trainee; 'invite' closes it again.
-- Closing it later keeps everyone already admitted.
create or replace function public.trainee_set_signup(p_mode text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_mode is null or p_mode not in ('invite', 'open') then raise exception 'sign-up is invite or open'; end if;
  insert into public.trainee_settings (key, value, updated_at) values ('web_signup', p_mode, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  return p_mode;
end $$;

-- Whether the person holds a redeemed invite (FEATURE WAVES). Read by name so this file applies with or without it.
create or replace function public.trainee_invited(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ok boolean := false;
begin
  if to_regclass('public.career_invites') is null then return false; end if;
  execute 'select exists (select 1 from public.career_invites where redeemed_user = $1 and state = ''redeemed'')' into ok using p_user;
  return coalesce(ok, false);
end $$;

-- Whether an invitee is still in the sign-up steps (18+, terms): they may chat (the steps are chat) but not apply.
create or replace function public.trainee_signup_unfinished(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare st text;
begin
  if to_regclass('public.career_signup_gate') is null then return false; end if;
  execute 'select step from public.career_signup_gate where user_id = $1' into st using p_user;
  return st is not null and st <> 'active';
end $$;

-- Admit a person if they may use Trainee; return how, or null (not yet). p_allowlisted: the edge function's own check of
-- TRAINEE_ALLOWED_CONTACTS against the account's confirmed phone (never a claim from the person).
create or replace function public.trainee_admit(p_user uuid, p_allowlisted boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v text;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'invalid admission'; end if;
  perform pg_advisory_xact_lock(hashtextextended('trainee_admit:' || p_user::text, 0));
  select via into v from public.trainee_admissions where user_id = p_user;
  if v is not null then return v; end if;
  -- FEATURE WAVES may admit by its own rules (a sent invite matching the account's confirmed phone, taken once): its
  -- career_invite_admit(user) answers 'invite', 'waitlist' or null, and records nothing else here. Called by name.
  if to_regprocedure('public.career_invite_admit(uuid)') is not null then
    execute 'select public.career_invite_admit($1)' into v using p_user;
    if v is not null then
      select via into v from public.trainee_admissions where user_id = p_user; -- what it recorded, if it did
      if v is not null then return v; end if;
      v := 'invite';
    end if;
  end if;
  v := coalesce(v, case when public.trainee_invited(p_user) then 'invite'
            when coalesce(p_allowlisted, false) then 'allowlist'
            when public.trainee_signup_mode() = 'open' then 'open' end);
  if v is null then return null; end if;
  insert into public.trainee_admissions (user_id, via) values (p_user, v);
  return v;
end $$;

-- Whether the person may make applications now (the database's own check, every writer).
create or replace function public.trainee_may_act(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_user is not null
     and (exists (select 1 from public.trainee_admissions where user_id = p_user) or public.trainee_invited(p_user)
          or public.trainee_signup_mode() = 'open')
     and not public.trainee_signup_unfinished(p_user)
$$;

create or replace function public.trainee_require_admitted() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.trainee_may_act(new.user_id) then
    raise exception 'not_admitted' using hint = 'This account has not been let in to Trainee yet.';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['career_apply_prepared', 'career_apply_cards', 'career_apply_jobs', 'career_apply_wanted',
                           'career_apply_message_cards', 'career_apply_batch_approvals'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trainee_admitted on public.%I', t);
      execute format('create trigger trainee_admitted before insert on public.%I for each row execute function public.trainee_require_admitted()', t);
    end if;
  end loop;
end $$;

revoke all on function public.trainee_phone_digits(text), public.trainee_signup_mode(), public.trainee_set_signup(text), public.trainee_invited(uuid),
  public.trainee_signup_unfinished(uuid), public.trainee_admit(uuid, boolean), public.trainee_may_act(uuid),
  public.trainee_require_admitted() from public, anon, authenticated;
grant execute on function public.trainee_phone_digits(text), public.trainee_signup_mode(), public.trainee_set_signup(text), public.trainee_invited(uuid),
  public.trainee_signup_unfinished(uuid), public.trainee_admit(uuid, boolean), public.trainee_may_act(uuid) to service_role;
