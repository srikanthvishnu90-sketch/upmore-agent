-- GB-01 / ON-01: the waitlist let in by invite waves, each wave gated by live health (owner, 2026-10-26: "as many people
-- as much, just pushing the wave to see how much we can achieve"). Idempotent: every object is created if missing or
-- replaced; applying the file twice changes nothing.
--
-- The list: public.site_waitlist (20261019020000_site_capture.sql), written by site-signup: name, phone (E.164), consent,
-- consent_text, consent_at, source, created_at. Signup order is (created_at, id).
--
-- What this adds:
--   career_wave_policy        one row: the first wave's size, the invite lifetime and every gate threshold. Every value
--                             is PROPOSED for the owner (docs/architect/INVITE-WAVES-2026-10-26.md); he changes them here.
--   career_invite_waves       a wave: its size, when it opened, the gate results it opened on, the exact message
--                             template the owner approved (its sha256) and the count he approved.
--   career_invites            one invite per person: a single-use token (only its sha256 is kept once it is sent), the
--                             channel, approved / sent / redeemed, and the waitlist's SMS consent carried with it.
--   career_signup_gate        a redeemed person's sign-up steps: the 18+ question, then the terms and privacy policy.
--   career_consents           every acceptance, with its version, the text's sha256 and where it was given.
--   career_reply_truth_samples  a reply-truth sample (the live verification suite or the owner's own review writes it).
--   career_wave_gate_rows(now) / view career_wave_gates   the gates, from live rows.
--   career_wave_recommendation(now)                       double while every gate passes, hold on a warning, close on a
--                                                         failure.
-- Opening a wave sends nothing. Sending is a separate step the owner approves with the exact template and the exact
-- count; the sender (supabase/functions/_shared/career_invite_send.ts) claims one invite at a time and records each send.
-- STOP on any channel, or the invite's own unsubscribe link, stops every invite to that number at once (trigger).
--
-- ONE invite and admission system (architect, 2026-10-26): 20261026230000 (PR #195) owns the admission core
-- (trainee_admit, trainee_may_act, the triggers that refuse applications of a person not admitted, or of an invitee who
-- has not finished the sign-up steps). This file owns the invites and the waves and plugs in: career_invite_admit (called
-- by trainee_admit by name), and every invite bound to an account records its admission (via 'waitlist').

create table if not exists public.career_wave_policy (
  id int primary key default 1 check (id = 1),
  first_wave_size int not null default 100 check (first_wave_size between 1 and 100000),
  max_wave_size int not null default 100000 check (max_wave_size between 1 and 1000000),
  invite_ttl interval not null default interval '14 days',
  min_sample int not null default 20 check (min_sample >= 1),
  signup_mature interval not null default interval '24 hours',
  signup_pass numeric not null default 0.20, signup_warn numeric not null default 0.10,
  error_pass numeric not null default 0.02, error_warn numeric not null default 0.05,
  truth_pass numeric not null default 0.95, truth_warn numeric not null default 0.90,
  truth_max_age interval not null default interval '24 hours',
  cost_pass_usd numeric not null default 0.50, cost_warn_usd numeric not null default 1.00,
  openai_429_fail int not null default 20, telegram_429_fail int not null default 20,
  telegram_peak_warn_per_min int not null default 900,
  cloud_pause_fail int not null default 3,
  stuck_after interval not null default interval '30 minutes',
  updated_at timestamptz not null default now()
);
insert into public.career_wave_policy (id) values (1) on conflict (id) do nothing;

create table if not exists public.career_invite_waves (
  id bigserial primary key,
  open_key text not null unique check (open_key ~ '^[A-Za-z0-9_-]{4,64}$'),
  size int not null check (size between 1 and 1000000),
  picked int not null default 0,
  status text not null default 'opened' check (status in ('opened', 'approved', 'sent', 'closed')),
  opened_at timestamptz not null,
  gates jsonb not null default '{}'::jsonb,
  override_reason text check (override_reason is null or length(override_reason) between 3 and 500),
  message_text text check (message_text is null or length(message_text) <= 600),
  message_sha256 text check (message_sha256 is null or message_sha256 ~ '^[a-f0-9]{64}$'),
  approved_count int,
  approved_at timestamptz,
  closed_at timestamptz,
  closed_reason text check (closed_reason is null or length(closed_reason) <= 500)
);

create table if not exists public.career_invites (
  id uuid primary key default gen_random_uuid(),
  wave_id bigint not null references public.career_invite_waves(id) on delete cascade,
  waitlist_id uuid unique references public.site_waitlist(id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  channel text not null default 'imessage' check (channel in ('imessage', 'sms')),
  token text check (token is null or token ~ '^[A-Za-z0-9_-]{32}$'), -- only until it is sent; then only the hash
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'ready' check (state in ('ready', 'approved', 'sending', 'sent', 'failed', 'redeemed', 'expired',
    'stopped', 'skipped_opt_out', 'held')),
  sms_consent_text text,
  sms_consent_at timestamptz,
  signed_up_at timestamptz not null, -- the waitlist row's created_at: signup order
  attempts int not null default 0 check (attempts between 0 and 10),
  created_at timestamptz not null,
  approved_at timestamptz,
  sent_at timestamptz,
  provider_id text check (provider_id is null or length(provider_id) <= 200),
  send_error text check (send_error is null or length(send_error) <= 500),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_via text check (redeemed_via is null or redeemed_via in ('telegram', 'web', 'imessage', 'whatsapp')),
  redeemed_contact text,
  redeemed_user uuid unique references auth.users(id) on delete set null,
  stopped_at timestamptz,
  check (state not in ('sent', 'redeemed', 'expired') or (sent_at is not null and expires_at is not null)),
  check (state <> 'sent' or token is null)
);
create unique index if not exists career_invites_phone on public.career_invites (phone);
create index if not exists career_invites_wave_state on public.career_invites (wave_id, state, signed_up_at, id);

create table if not exists public.career_signup_gate (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invite_id uuid references public.career_invites(id) on delete set null,
  step text not null check (step in ('age', 'terms', 'active', 'under18_blocked')),
  age_answer text check (age_answer is null or length(age_answer) <= 200),
  asked_at timestamptz, -- when the current step's question was put to the person (a first message is never read as an answer)
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.career_consents (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('age_18_plus', 'terms', 'privacy', 'sms')),
  version text check (version is null or length(version) between 1 and 64),
  url text check (url is null or url ~ '^https://'),
  text_sha256 text not null check (text_sha256 ~ '^[a-f0-9]{64}$'),
  source text not null check (source in ('chat', 'site_waitlist')),
  channel text check (channel is null or channel in ('web', 'telegram', 'imessage', 'whatsapp', 'site')),
  message_sha256 text check (message_sha256 is null or message_sha256 ~ '^[a-f0-9]{64}$'),
  accepted_at timestamptz not null,
  unique (user_id, kind, version)
);

create table if not exists public.career_reply_truth_samples (
  id bigserial primary key,
  run_at timestamptz not null,
  checked int not null check (checked >= 0),
  passed int not null check (passed between 0 and checked),
  source text not null check (length(source) between 1 and 200)
);

alter table public.career_wave_policy enable row level security;
alter table public.career_invite_waves enable row level security;
alter table public.career_invites enable row level security;
alter table public.career_signup_gate enable row level security;
alter table public.career_consents enable row level security;
alter table public.career_reply_truth_samples enable row level security;
revoke all on public.career_wave_policy, public.career_invite_waves, public.career_invites, public.career_signup_gate,
  public.career_consents, public.career_reply_truth_samples from public, anon, authenticated;
grant all on public.career_wave_policy, public.career_invite_waves, public.career_invites, public.career_signup_gate,
  public.career_consents, public.career_reply_truth_samples to service_role;
grant usage, select on sequence public.career_invite_waves_id_seq, public.career_consents_id_seq,
  public.career_reply_truth_samples_id_seq to service_role;

create or replace function public.career_wave_hours(p interval) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when extract(epoch from p) >= 3600 then trim_scale(round(extract(epoch from p) / 3600, 1))::text || ' hours'
              else (round(extract(epoch from p) / 60))::text || ' minutes' end
$$;

create or replace function public.career_invite_hash(p_token text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- The gates, from live rows. One row per gate: pass, warn, fail or na (nobody invited yet, so it has nothing to measure).
-- The cohort is everyone who redeemed an invite. Rates are over the 24 hours before p_now.
create or replace function public.career_wave_gate_rows(p_now timestamptz)
returns table (gate text, status text, value numeric, n bigint, threshold text, detail text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.career_wave_policy%rowtype;
  since timestamptz := p_now - interval '24 hours';
  cohort uuid[];
  w bigint; den bigint; num bigint; errs bigint; v numeric; t record; peak bigint; unpriced bigint;
  chat_down constant text := 'I couldn''t answer that just now. Try again in a minute.';
begin
  select * into p from public.career_wave_policy where id = 1;
  select coalesce(array_agg(redeemed_user), '{}') into cohort from public.career_invites where redeemed_user is not null;

  -- 1. Sign-up completion: of the latest wave's invites sent at least signup_mature ago, how many finished sign-up.
  select max(wave_id) into w from public.career_invites where sent_at is not null;
  if w is null then
    return query select 'signup_completion', 'na', null::numeric, 0::bigint, format('pass >= %s, warn >= %s', p.signup_pass, p.signup_warn), 'no invite has been sent yet';
  else
    select count(*), count(*) filter (where exists (select from public.career_signup_gate g where g.user_id = i.redeemed_user and g.step = 'active'))
      into den, num from public.career_invites i where i.wave_id = w and i.sent_at is not null and i.sent_at <= p_now - p.signup_mature;
    v := case when den > 0 then round(num::numeric / den, 4) end;
    return query select 'signup_completion',
      case when den = 0 or den < p.min_sample then 'warn' when v >= p.signup_pass then 'pass' when v >= p.signup_warn then 'warn' else 'fail' end,
      v, den, format('pass >= %s, warn >= %s', p.signup_pass, p.signup_warn),
      case when den = 0 then format('wave %s: no invite is %s old yet', w, public.career_wave_hours(p.signup_mature))
           when den < p.min_sample then format('wave %s: %s of %s finished sign-up; fewer than %s invites to judge', w, num, den, p.min_sample)
           else format('wave %s: %s of %s invites sent at least %s ago finished sign-up', w, num, den, public.career_wave_hours(p.signup_mature)) end;
  end if;

  -- 2. Error rate: the cohort's messages in 24 hours that failed to send, plus replies that were the chat-down apology.
  if cardinality(cohort) = 0 then
    return query select 'error_rate', 'na', null::numeric, 0::bigint, format('pass <= %s, warn <= %s', p.error_pass, p.error_warn), 'nobody has redeemed an invite yet';
  else
    select count(*) filter (where o.status in ('delivered', 'failed')),
           count(*) filter (where o.status = 'failed' or (o.kind = 'reply' and o.text = chat_down))
      into den, errs from public.career_outbox o where o.user_id = any(cohort) and o.created_at >= since and o.created_at <= p_now;
    v := case when den > 0 then round(errs::numeric / den, 4) end;
    return query select 'error_rate',
      case when den < p.min_sample then 'warn' when v <= p.error_pass then 'pass' when v <= p.error_warn then 'warn' else 'fail' end,
      v, den, format('pass <= %s, warn <= %s', p.error_pass, p.error_warn),
      format('%s of %s messages to invited people in 24 hours failed or were the chat-down reply%s', errs, den,
        case when den < p.min_sample then format(' (fewer than %s to judge)', p.min_sample) else '' end) || '; web replies are not in the outbox and are not counted';
  end if;

  -- 3. Reply truth: the newest sample, if it is recent enough.
  select * into t from public.career_reply_truth_samples s where s.run_at <= p_now and s.run_at > p_now - p.truth_max_age order by s.run_at desc, s.id desc limit 1;
  if not found then
    return query select 'reply_truth', 'warn', null::numeric, 0::bigint, format('pass >= %s, warn >= %s', p.truth_pass, p.truth_warn), format('no reply-truth sample in the last %s', public.career_wave_hours(p.truth_max_age));
  else
    v := case when t.checked > 0 then round(t.passed::numeric / t.checked, 4) end;
    return query select 'reply_truth',
      case when t.checked = 0 then 'warn' when v >= p.truth_pass then 'pass' when v >= p.truth_warn then 'warn' else 'fail' end,
      v, t.checked::bigint, format('pass >= %s, warn >= %s', p.truth_pass, p.truth_warn),
      format('%s of %s replies true to state (%s, %s)', t.passed, t.checked, t.source, to_char(t.run_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'));
  end if;

  -- 4. Application outcomes: every finished application has its receipt and none is stuck driving. Any silent one fails.
  if cardinality(cohort) = 0 then
    return query select 'silent_outcomes', 'na', null::numeric, 0::bigint, '0 silent', 'nobody has redeemed an invite yet';
  else
    select count(*), count(*) filter (where
        (j.state in ('confirmed', 'submitted_unconfirmed', 'failed', 'not_submitted', 'unknown_outcome') and j.updated_at <= p_now - interval '10 minutes'
          and not exists (select from public.career_apply_receipts r where r.application_id = j.id))
        or (j.state = 'driving' and j.claimed_at <= p_now - p.stuck_after))
      into den, errs from public.career_apply_jobs j where j.user_id = any(cohort);
    return query select 'silent_outcomes', case when errs > 0 then 'fail' else 'pass' end, errs::numeric, den, '0 silent',
      format('%s of %s applications by invited people finished with no receipt or are stuck driving over %s', errs, den, public.career_wave_hours(p.stuck_after));
  end if;

  -- 5. Model cost per active person (anyone with a metered turn in 24 hours, invited or not).
  select coalesce(sum(c.usd_micros), 0), count(distinct c.user_id), coalesce(sum(c.unpriced), 0) into num, den, unpriced
    from public.agent_turn_costs c where c.created_at >= since and c.created_at <= p_now;
  v := case when den > 0 then round(num::numeric / 1000000 / den, 4) end;
  return query select 'cost_per_active_usd',
    case when den = 0 then 'warn' when unpriced > 0 and v <= p.cost_pass_usd then 'warn' when v <= p.cost_pass_usd then 'pass' when v <= p.cost_warn_usd then 'warn' else 'fail' end,
    v, den, format('pass <= $%s, warn <= $%s a person a day', p.cost_pass_usd, p.cost_warn_usd),
    case when den = 0 then 'no metered turn in 24 hours'
      else format('$%s over %s active people in 24 hours%s', round(num::numeric / 1000000, 4), den,
        case when unpriced > 0 then format('; %s calls unpriced, so the cost is a floor', unpriced) else '' end) end;

  -- 6. Capacity.
  select count(*) into num from public.career_outbox o
    where (o.channel = 'telegram' or o.contact like 'tg:%') and o.error like 'Telegram HTTP 429%' and o.created_at >= since and o.created_at <= p_now;
  return query select 'telegram_429', case when num = 0 then 'pass' when num < p.telegram_429_fail then 'warn' else 'fail' end, num::numeric, num,
    format('0 pass, fail at %s', p.telegram_429_fail), format('%s Telegram sends refused with 429 in 24 hours', num);
  select coalesce(max(c), 0) into peak from (select count(*) c from public.career_outbox o
    where (o.channel = 'telegram' or o.contact like 'tg:%') and o.status = 'delivered' and o.delivered_at >= since and o.delivered_at <= p_now
    group by date_trunc('minute', o.delivered_at)) m;
  return query select 'telegram_peak_per_min', case when peak < p.telegram_peak_warn_per_min then 'pass' else 'warn' end, peak::numeric, peak,
    format('warn at %s a minute', p.telegram_peak_warn_per_min), format('busiest minute in 24 hours: %s Telegram messages delivered', peak);
  select count(*) into num from public.agent_provider_events e where e.provider = 'openai' and e.status = 429 and e.created_at >= since and e.created_at <= p_now;
  return query select 'openai_429', case when num = 0 then 'pass' when num < p.openai_429_fail then 'warn' else 'fail' end, num::numeric, num,
    format('0 pass, fail at %s', p.openai_429_fail), format('%s OpenAI calls refused with 429 in 24 hours', num);
  select count(*) into num from public.career_apply_cloud_pauses c where c.scope = 'portal' and c.until > p_now;
  return query select 'cloud_site_pauses', case when num = 0 then 'pass' when num < p.cloud_pause_fail then 'warn' else 'fail' end, num::numeric, num,
    format('0 pass, fail at %s', p.cloud_pause_fail), format('%s sites paused for the cloud sender right now', num);
end $$;

create or replace view public.career_wave_gates as select * from public.career_wave_gate_rows(now());
revoke all on public.career_wave_gates from public, anon, authenticated;
grant select on public.career_wave_gates to service_role;

-- Who could still be invited: consent given with the exact words they agreed to on record (TCPA: a text invite needs
-- the person's prior written consent, so a row without its consent text is never texted), a valid number, the earliest signup per number, no invite yet, not opted
-- out, not already an account on that number.
create or replace function public.career_wave_eligible() returns table (waitlist_id uuid, phone text, consent_text text, consent_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.phone, c.consent_text, c.consent_at, c.created_at from (
    select distinct on (w.phone) w.id, w.phone, w.consent_text, w.consent_at, w.created_at
    from public.site_waitlist w
    where w.consent and length(trim(coalesce(w.consent_text, ''))) > 0 and w.phone ~ '^\+[1-9][0-9]{7,14}$'
    order by w.phone, w.created_at, w.id) c
  where not exists (select from public.career_invites i where i.phone = c.phone)
    and not public.channel_opted_out(c.phone)
    and not exists (select from public.channel_contacts cc where (cc.phone = c.phone or cc.contact = c.phone) and cc.user_id is not null)
$$;

-- The recommendation: double while every gate passes, hold on a warning, close on a failure. The first wave is the
-- policy's first_wave_size. Never more than the people still eligible.
create or replace function public.career_wave_recommendation(p_now timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.career_wave_policy%rowtype; g jsonb; worst text; last_size int; remaining bigint; rec int; action text;
begin
  select * into p from public.career_wave_policy where id = 1;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.gate), '[]') into g from public.career_wave_gate_rows(p_now) r;
  worst := case when exists (select from jsonb_array_elements(g) e where e->>'status' = 'fail') then 'fail'
                when exists (select from jsonb_array_elements(g) e where e->>'status' = 'warn') then 'warn' else 'pass' end;
  select w.picked into last_size from public.career_invite_waves w where w.picked > 0 order by w.id desc limit 1;
  select count(*) into remaining from public.career_wave_eligible();
  if worst = 'fail' then action := 'close'; rec := 0;
  elsif last_size is null or last_size = 0 then action := 'first'; rec := p.first_wave_size;
  elsif worst = 'warn' then action := 'hold'; rec := last_size;
  else action := 'double'; rec := last_size * 2; end if;
  rec := least(rec, p.max_wave_size, remaining::int);
  return jsonb_build_object('status', worst, 'action', action, 'recommended_size', rec, 'last_wave_size', last_size,
    'eligible_remaining', remaining, 'gates', g, 'at', p_now);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Open a wave: the next p_size eligible people in signup order become invites (state ready). Nothing is sent. The same
-- key returns the same wave (a retried call opens nothing new). A wave still in progress, failing gates or a size over
-- the recommendation is refused unless the owner gives a reason, which is recorded on the wave.
create or replace function public.career_wave_open(p_size int, p_key text, p_override_reason text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.career_invite_waves%rowtype; rec jsonb; n int;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{4,64}$' then raise exception 'invalid_key'; end if;
  if p_size is null or p_size < 1 or p_size > 1000000 then raise exception 'invalid_size'; end if;
  if p_now is null then raise exception 'invalid_time'; end if;
  perform pg_advisory_xact_lock(hashtextextended('career_wave_open', 7));
  select * into w from public.career_invite_waves where open_key = p_key;
  if found then
    if w.size <> p_size then raise exception 'key_reused'; end if;
    return jsonb_build_object('wave_id', w.id, 'size', w.size, 'picked', w.picked, 'status', w.status, 'replayed', true);
  end if;
  if exists (select from public.career_invite_waves where status in ('opened', 'approved')) then raise exception 'wave_in_progress'; end if;
  rec := public.career_wave_recommendation(p_now);
  if p_override_reason is null and rec->>'status' = 'fail' then raise exception 'gates_failed'; end if;
  if p_override_reason is null and p_size > (rec->>'recommended_size')::int then raise exception 'over_recommended'; end if;
  insert into public.career_invite_waves (open_key, size, opened_at, gates, override_reason)
  values (p_key, p_size, p_now, rec, p_override_reason) returning * into w;
  insert into public.career_invites (wave_id, waitlist_id, phone, channel, token, token_hash, sms_consent_text, sms_consent_at, signed_up_at, created_at)
  select w.id, e.waitlist_id, e.phone, 'imessage', e.tok, public.career_invite_hash(e.tok), e.consent_text, e.consent_at, e.created_at, p_now
  from (select x.*, left(translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'), 32) tok
        from (select * from public.career_wave_eligible() order by created_at, waitlist_id limit p_size) x) e;
  get diagnostics n = row_count;
  update public.career_invite_waves set picked = n where id = w.id;
  return jsonb_build_object('wave_id', w.id, 'size', p_size, 'picked', n, 'status', 'opened', 'replayed', false,
    'recommendation', rec - 'gates');
end $$;

-- The invite list the owner reviews before approving (the people are his; this is read with the service key only).
create or replace function public.career_wave_invite_list(p_wave bigint)
returns table (invite_id uuid, phone text, state text, signed_up_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.id, i.phone, i.state, i.signed_up_at from public.career_invites i
  where i.wave_id = p_wave order by i.signed_up_at, i.id
$$;

-- The owner's approval of the exact message template and the exact count. The template names Trainee, says how to stop
-- (STOP), and has the person's link ({link}: the web sign-up; {telegram}: Telegram's Start). Nothing else is sent.
create or replace function public.career_wave_approve_send(p_wave bigint, p_text text, p_text_sha256 text, p_count int, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.career_invite_waves%rowtype; n int;
begin
  select * into w from public.career_invite_waves where id = p_wave for update;
  if not found then raise exception 'no_such_wave'; end if;
  if p_text is null or encode(sha256(convert_to(p_text, 'UTF8')), 'hex') <> coalesce(p_text_sha256, '') then raise exception 'text_hash_mismatch'; end if;
  if w.status = 'approved' and w.message_sha256 = p_text_sha256 and w.approved_count = p_count then
    return jsonb_build_object('wave_id', w.id, 'approved', w.approved_count, 'replayed', true);
  end if;
  if w.status <> 'opened' then raise exception 'wave_not_open'; end if;
  if length(p_text) > 600 then raise exception 'text_too_long'; end if;
  if position('Trainee' in p_text) = 0 then raise exception 'text_must_name_trainee'; end if;
  if p_text !~ '\mSTOP\M' then raise exception 'text_must_say_stop'; end if;
  if position('{link}' in p_text) = 0 and position('{telegram}' in p_text) = 0 then raise exception 'text_needs_link'; end if;
  if p_text ~ '\{(?!link\}|telegram\})' then raise exception 'text_unknown_placeholder'; end if;
  select count(*) into n from public.career_invites where wave_id = p_wave and state = 'ready';
  if p_count is distinct from n then raise exception 'count_mismatch: % ready, % approved', n, p_count; end if;
  update public.career_invites set state = 'approved', approved_at = p_now where wave_id = p_wave and state = 'ready';
  -- A wave with nothing left to send (every invite stopped before the approval) is done, so the next one can open.
  update public.career_invite_waves set status = case when n = 0 then 'sent' else 'approved' end, message_text = p_text, message_sha256 = p_text_sha256,
    approved_count = n, approved_at = p_now where id = p_wave;
  return jsonb_build_object('wave_id', p_wave, 'approved', n, 'replayed', false);
end $$;

-- One invite to send, or why not. Quiet hours (47 CFR 64.1200(c)(1): 8 am to 9 pm at the called party's location): sends
-- only 16:00-01:00 UTC, inside 8 am-9 pm in every continental US time zone in both standard and daylight time; numbers in
-- Hawaii, Alaska and the Pacific territories (area codes 808, 907, 671, 670, 684) and outside +1 are held for the owner.
create or replace function public.career_invite_claim_send(p_wave bigint, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.career_invite_waves%rowtype; i public.career_invites%rowtype; h int;
begin
  select * into w from public.career_invite_waves where id = p_wave;
  if not found then return jsonb_build_object('stop', 'no_such_wave'); end if;
  if w.status <> 'approved' then return jsonb_build_object('stop', 'not_approved'); end if;
  h := extract(hour from p_now at time zone 'UTC');
  if not (h >= 16 or h < 1) then return jsonb_build_object('stop', 'quiet_hours'); end if;
  loop
    select * into i from public.career_invites where wave_id = p_wave and state = 'approved' order by signed_up_at, id for update skip locked limit 1;
    if not found then
      if not exists (select from public.career_invites where wave_id = p_wave and state in ('approved', 'sending')) then
        update public.career_invite_waves set status = 'sent' where id = p_wave and status = 'approved';
      end if;
      return jsonb_build_object('done', true);
    end if;
    if public.channel_opted_out(i.phone) then
      update public.career_invites set state = 'skipped_opt_out', stopped_at = p_now where id = i.id; continue;
    end if;
    if i.phone !~ '^\+1' or substr(i.phone, 3, 3) in ('808', '907', '671', '670', '684') then
      update public.career_invites set state = 'held', send_error = 'quiet hours unknown for this number: held for the owner' where id = i.id; continue;
    end if;
    if i.channel <> 'imessage' then
      update public.career_invites set state = 'held', send_error = 'NOT_WIRED: no SMS provider' where id = i.id; continue;
    end if;
    update public.career_invites set state = 'sending', attempts = attempts + 1 where id = i.id;
    return jsonb_build_object('invite_id', i.id, 'phone', i.phone, 'channel', i.channel, 'token', i.token,
      'text', w.message_text, 'text_sha256', w.message_sha256);
  end loop;
end $$;

-- The result of one send. Only a row still sending changes (a STOP that came in meanwhile stays a STOP).
create or replace function public.career_invite_mark_sent(p_invite uuid, p_ok boolean, p_provider_id text, p_error text, p_now timestamptz) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare s text; ttl interval;
begin
  select invite_ttl into ttl from public.career_wave_policy where id = 1;
  if p_ok then
    update public.career_invites set state = 'sent', sent_at = p_now, expires_at = p_now + ttl, token = null,
      provider_id = left(p_provider_id, 200), send_error = null where id = p_invite and state = 'sending' returning state into s;
  else
    update public.career_invites set state = 'failed', send_error = left(coalesce(p_error, 'failed'), 500)
      where id = p_invite and state = 'sending' returning state into s;
  end if;
  return coalesce(s, (select state from public.career_invites where id = p_invite), 'missing');
end $$;

-- Close a wave (the owner, or the sender when a gate fails): what was not sent yet is held.
create or replace function public.career_wave_close(p_wave bigint, p_reason text, p_now timestamptz) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update public.career_invites set state = 'held', send_error = left('wave closed: ' || coalesce(p_reason, ''), 500)
    where wave_id = p_wave and state in ('ready', 'approved');
  get diagnostics n = row_count;
  update public.career_invite_waves set status = 'closed', closed_at = p_now, closed_reason = left(p_reason, 500)
    where id = p_wave and status <> 'closed';
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Redeeming. take: the invite for this token, once. A retry from the same contact before the account was bound picks up
-- where it stopped; anyone else gets 'used'.
create or replace function public.career_invite_take_core(p_id uuid, p_contact text, p_via text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.career_invites%rowtype;
begin
  select * into i from public.career_invites where id = p_id for update;
  if not found then return jsonb_build_object('error', 'invalid'); end if;
  if i.state = 'redeemed' then
    if i.redeemed_user is null and i.redeemed_contact = p_contact then
      return jsonb_build_object('invite_id', i.id, 'phone', i.phone, 'resumed', true);
    end if;
    return jsonb_build_object('error', 'used');
  end if;
  if i.state in ('stopped', 'skipped_opt_out') or public.channel_opted_out(i.phone) then return jsonb_build_object('error', 'stopped'); end if;
  if i.state = 'expired' or (i.state = 'sent' and i.expires_at <= p_now) then
    update public.career_invites set state = 'expired' where id = i.id and state = 'sent';
    return jsonb_build_object('error', 'expired');
  end if;
  if i.state <> 'sent' then return jsonb_build_object('error', 'invalid'); end if;
  update public.career_invites set state = 'redeemed', redeemed_at = p_now, redeemed_via = p_via, redeemed_contact = p_contact where id = i.id;
  return jsonb_build_object('invite_id', i.id, 'phone', i.phone, 'resumed', false);
end $$;

-- A channel's /start inv_<token> (Telegram), from the service role.
create or replace function public.career_invite_redeem_for(p_token text, p_contact text, p_via text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' or p_contact is null or length(p_contact) > 200
     or p_via not in ('telegram', 'imessage', 'whatsapp') then return jsonb_build_object('error', 'invalid'); end if;
  select i.id into id from public.career_invites i where i.token_hash = public.career_invite_hash(p_token);
  if id is null then return jsonb_build_object('error', 'invalid'); end if;
  return public.career_invite_take_core(id, p_contact, p_via, p_now);
end $$;

-- A text from an invited number with no account (iMessage, or WhatsApp with the number): that number's sent invite.
create or replace function public.career_invite_redeem_phone(p_phone text, p_contact text, p_via text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare id uuid;
begin
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' or p_via not in ('imessage', 'whatsapp') then return jsonb_build_object('error', 'invalid'); end if;
  select i.id into id from public.career_invites i where i.phone = p_phone and i.state in ('sent', 'redeemed', 'expired');
  if id is null then return jsonb_build_object('error', 'none'); end if;
  return public.career_invite_take_core(id, p_contact, p_via, p_now);
end $$;

-- The account made for a taken invite: bound once, its sign-up steps begin (the 18+ question first), and the
-- waitlist's SMS consent is recorded with its exact text and time.
create or replace function public.career_invite_bind(p_invite uuid, p_user uuid, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.career_invites%rowtype; g public.career_signup_gate%rowtype;
begin
  select * into i from public.career_invites where id = p_invite for update;
  if not found or i.state <> 'redeemed' then raise exception 'invite_not_taken'; end if;
  if i.redeemed_user is not null and i.redeemed_user <> p_user then raise exception 'invite_bound_elsewhere'; end if;
  if i.redeemed_user is null then
    if exists (select from public.career_invites where redeemed_user = p_user) then raise exception 'user_has_invite'; end if;
    update public.career_invites set redeemed_user = p_user where id = i.id;
  end if;
  insert into public.career_signup_gate (user_id, invite_id, step, created_at, updated_at)
  values (p_user, i.id, 'age', p_now, p_now) on conflict (user_id) do nothing;
  -- The web gate (trainee_admit) admits the same person on every channel.
  insert into public.trainee_admissions (user_id, via, waitlist_id) values (p_user, 'waitlist', i.waitlist_id) on conflict (user_id) do nothing;
  if i.sms_consent_text is not null then
    insert into public.career_consents (user_id, kind, version, text_sha256, source, channel, accepted_at)
    values (p_user, 'sms', 'site_waitlist', encode(sha256(convert_to(i.sms_consent_text, 'UTF8')), 'hex'), 'site_waitlist', 'site', coalesce(i.sms_consent_at, i.created_at))
    on conflict (user_id, kind, version) do nothing;
  end if;
  select * into g from public.career_signup_gate where user_id = p_user;
  return jsonb_build_object('invite_id', i.id, 'user_id', p_user, 'step', g.step);
end $$;

-- The web: the signed-in person redeems the token from their invite link. An account that already holds an invite, or
-- that existed before the invite (it has a sign-up record), takes nothing.
create or replace function public.career_invite_redeem_own(p_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); r jsonb; id uuid;
begin
  if u is null then raise exception 'sign in first'; end if;
  if exists (select from public.career_invites where redeemed_user = u) then return jsonb_build_object('error', 'already_in'); end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then return jsonb_build_object('error', 'invalid'); end if;
  select i.id into id from public.career_invites i where i.token_hash = public.career_invite_hash(p_token);
  if id is null then return jsonb_build_object('error', 'invalid'); end if;
  r := public.career_invite_take_core(id, 'web:' || u::text, 'web', clock_timestamp());
  if r ? 'error' then return r; end if;
  return public.career_invite_bind(id, u, clock_timestamp());
end $$;

-- The invite's unsubscribe (the web page behind the link, no account needed): the token stops that number everywhere.
create or replace function public.career_invite_stop(p_token text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare ph text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then return false; end if;
  select phone into ph from public.career_invites where token_hash = public.career_invite_hash(p_token);
  if ph is null then return false; end if;
  perform public.channel_set_opt_out(ph, true, clock_timestamp());
  return true;
end $$;

-- A sign-up step answered (compare-and-set on the step; a stale answer changes nothing). Consents ride along.
create or replace function public.career_signup_step(p_user uuid, p_from text, p_to text, p_age_answer text, p_consents jsonb, p_now timestamptz) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare s text; c jsonb;
begin
  if p_to not in ('age', 'terms', 'active', 'under18_blocked') then raise exception 'invalid_step'; end if;
  if p_from = p_to then
    -- The step's question put to the person: recorded once, nothing else changes.
    update public.career_signup_gate set asked_at = p_now, updated_at = p_now where user_id = p_user and step = p_from and asked_at is null returning step into s;
    return coalesce(s, 'asked_before');
  end if;
  update public.career_signup_gate set step = p_to, age_answer = coalesce(left(p_age_answer, 200), age_answer), asked_at = null, updated_at = p_now
    where user_id = p_user and step = p_from and asked_at is not null returning step into s;
  if s is null then return coalesce((select step from public.career_signup_gate where user_id = p_user), 'none'); end if;
  for c in select * from jsonb_array_elements(coalesce(p_consents, '[]'::jsonb)) loop
    insert into public.career_consents (user_id, kind, version, url, text_sha256, source, channel, message_sha256, accepted_at)
    values (p_user, c->>'kind', c->>'version', c->>'url', c->>'text_sha256', 'chat', c->>'channel', c->>'message_sha256', p_now)
    on conflict (user_id, kind, version) do nothing;
  end loop;
  return s;
end $$;

-- STOP on any channel (channel_set_opt_out, a blocked bot) stops every invite to that number, and to every number of
-- that person, that is not redeemed yet.
create or replace function public.career_invites_on_opt_out() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.opted_out and (tg_op = 'INSERT' or not old.opted_out) then
    update public.career_invites set state = 'stopped', stopped_at = coalesce(new.opted_out_at, now()), token = null
    where state in ('ready', 'approved', 'sending', 'sent', 'failed', 'held')
      and (phone = new.contact or phone = new.phone
           or (new.user_id is not null and phone in (select c.phone from public.channel_contacts c where c.user_id = new.user_id and c.phone is not null)));
  end if;
  return new;
end $$;
drop trigger if exists career_invites_on_opt_out on public.channel_contacts;
create trigger career_invites_on_opt_out after insert or update of opted_out on public.channel_contacts
  for each row execute function public.career_invites_on_opt_out();

-- ---------------------------------------------------------------------------------------------------------------------
-- The admission core is 20261026230000's (trainee_admit decides: existing, then this hook, then a redeemed invite, then
-- the allow-list, then open). This file plugs into it by name: career_invite_admit(user) admits by an invite only:
--   the account already holds a redeemed invite (bound by career_invite_bind, which recorded the admission), or
--   its CONFIRMED phone matches an invite that was sent and is still unused, which is then taken for this account
--   (redeemed via the web, bound, its admission recorded, the sign-up steps begun).
-- Answers 'waitlist' or null. Expiry, STOP and single use are career_invite_take_core's.
create or replace function public.career_invite_admit(p_user uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare ph text; inv uuid; wl uuid; r jsonb;
begin
  if p_user is null then return null; end if;
  select i.id, i.waitlist_id into inv, wl from public.career_invites i where i.redeemed_user = p_user;
  if inv is not null then
    insert into public.trainee_admissions (user_id, via, waitlist_id) values (p_user, 'waitlist', wl) on conflict (user_id) do nothing;
    return 'waitlist';
  end if;
  select case when u.phone_confirmed_at is not null then public.trainee_phone_digits(u.phone) end into ph from auth.users u where u.id = p_user;
  if ph is null then return null; end if;
  select i.id into inv from public.career_invites i
   where i.state = 'sent' and public.trainee_phone_digits(i.phone) = ph
   order by i.sent_at, i.id limit 1 for update skip locked;
  if inv is null then return null; end if;
  r := public.career_invite_take_core(inv, 'web:' || p_user::text, 'web', clock_timestamp());
  if r ? 'error' then return null; end if;
  perform public.career_invite_bind(inv, p_user, clock_timestamp());
  return 'waitlist';
end $$;
revoke all on function public.career_invite_admit(uuid) from public, anon, authenticated;
grant execute on function public.career_invite_admit(uuid) to service_role;

revoke all on function public.career_wave_hours(interval), public.career_invite_hash(text), public.career_wave_gate_rows(timestamptz), public.career_wave_eligible(),
  public.career_wave_recommendation(timestamptz), public.career_wave_open(int, text, text, timestamptz), public.career_wave_invite_list(bigint),
  public.career_wave_approve_send(bigint, text, text, int, timestamptz), public.career_invite_claim_send(bigint, timestamptz),
  public.career_invite_mark_sent(uuid, boolean, text, text, timestamptz), public.career_wave_close(bigint, text, timestamptz),
  public.career_invite_take_core(uuid, text, text, timestamptz), public.career_invite_redeem_for(text, text, text, timestamptz),
  public.career_invite_redeem_phone(text, text, text, timestamptz), public.career_invite_bind(uuid, uuid, timestamptz),
  public.career_invite_redeem_own(text), public.career_invite_stop(text),
  public.career_signup_step(uuid, text, text, text, jsonb, timestamptz), public.career_invites_on_opt_out()
  from public, anon, authenticated;
grant execute on function public.career_wave_gate_rows(timestamptz), public.career_wave_eligible(),
  public.career_wave_recommendation(timestamptz), public.career_wave_open(int, text, text, timestamptz), public.career_wave_invite_list(bigint),
  public.career_wave_approve_send(bigint, text, text, int, timestamptz), public.career_invite_claim_send(bigint, timestamptz),
  public.career_invite_mark_sent(uuid, boolean, text, text, timestamptz), public.career_wave_close(bigint, text, timestamptz),
  public.career_invite_redeem_for(text, text, text, timestamptz), public.career_invite_redeem_phone(text, text, text, timestamptz),
  public.career_invite_bind(uuid, uuid, timestamptz), public.career_invite_stop(text),
  public.career_signup_step(uuid, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.career_invite_redeem_own(text) to authenticated;
grant execute on function public.career_invite_stop(text) to anon, authenticated;
