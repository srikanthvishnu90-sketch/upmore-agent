-- WO-026: the Connector. An opt-in network of Trainee's users (plus opted-in mentors, alumni and recruiters) and
-- double-opt-in warm introductions, one at a time. Consent is load-bearing here:
--   - Nobody is in the network unless they opted in, and nobody is matched while paused or opted out.
--   - A profile is readable only by its owner. There is no directory, no listing and no search by name: no function here
--     takes a name, and none returns another person's profile.
--   - An introduction names nobody to anybody until BOTH people said yes to THAT introduction. Before then each side reads
--     only its own one-line why (written to describe the other side by role and the facts the match rests on) and the
--     other side's role kind; the other person's id comes back only after both said yes, and never to someone they
--     blocked or reported.
--   - Every introduction cites real facts from both profiles (ids that exist in each stored profile): no fact, no intro.
--   - Mentors and recruiters are matched only once verified, and only the service role sets verified.
--   - One pending proposal per person, at most 3 proposals in 7 days per person, a pair is proposed once ever, and a
--     block (either way) stops proposals for good. A report also hides the reporter from the reported person forever and
--     is flagged for human review.
--   - Nothing is proposed until 500 profiles are opted in and not paused (connector_open()); the edge code also needs
--     CONNECTOR_ENABLED=on.
--   - Deleting the account deletes the profile, its introductions and its blocks (cascade).
-- Every write goes through these functions: _own for the signed-in person, _as for the edge functions' service role acting
-- for a texting contact; both call one internal _core function that nobody may execute directly.
create table if not exists public.connector_profiles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 opted_in boolean not null default false,
 role text not null check (role in ('student', 'candidate', 'mentor', 'alumni', 'recruiter')),
 verified boolean not null default false,
 needs jsonb not null default '[]' check (jsonb_typeof(needs) = 'array' and jsonb_array_length(needs) <= 20),
 offers jsonb not null default '[]' check (jsonb_typeof(offers) = 'array' and jsonb_array_length(offers) <= 20),
 facts jsonb not null default '[]' check (jsonb_typeof(facts) = 'array' and jsonb_array_length(facts) <= 60),
 filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object' and octet_length(filters::text) <= 8192),
 paused boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.connector_intros (
 id uuid primary key default gen_random_uuid(),
 a_user uuid not null references public.profiles(id) on delete cascade,
 b_user uuid not null references public.profiles(id) on delete cascade,
 kind text not null check (kind in ('meet', 'intel', 'referral', 'prep')),
 why_a text not null check (length(why_a) between 1 and 600),
 why_b text not null check (length(why_b) between 1 and 600),
 cites jsonb not null check (jsonb_typeof(cites) = 'object'),
 state text not null default 'proposed' check (state in
  ('proposed', 'a_yes', 'b_yes', 'both_yes', 'declined', 'expired', 'introduced', 'met', 'no_meeting', 'no_reply')),
 proposed_at timestamptz not null, decided_at timestamptz, intro_at timestamptz,
 nudge_at timestamptz, checkin_at timestamptz, checkin_nudge_at timestamptz,
 feedback jsonb not null default '{}' check (jsonb_typeof(feedback) = 'object'),
 check (a_user <> b_user)
);
create table if not exists public.connector_blocks (
 blocker uuid not null references public.profiles(id) on delete cascade,
 blocked uuid not null references public.profiles(id) on delete cascade,
 intro_id uuid references public.connector_intros(id) on delete set null,
 reason text check (reason is null or length(reason) <= 500),
 reported boolean not null default false,
 created_at timestamptz not null default now(), reviewed_at timestamptz,
 primary key (blocker, blocked), check (blocker <> blocked)
);
-- A pair is proposed once, ever: a no, a block or a finished introduction is never proposed again.
create unique index if not exists connector_intros_pair on public.connector_intros (least(a_user, b_user), greatest(a_user, b_user));
create index if not exists connector_intros_a on public.connector_intros (a_user, proposed_at desc);
create index if not exists connector_intros_b on public.connector_intros (b_user, proposed_at desc);
create index if not exists connector_blocks_blocked on public.connector_blocks (blocked);
create index if not exists connector_blocks_review on public.connector_blocks (created_at) where reported and reviewed_at is null;

alter table public.connector_profiles enable row level security;
alter table public.connector_intros enable row level security;
alter table public.connector_blocks enable row level security;
revoke all on public.connector_profiles, public.connector_intros, public.connector_blocks from public, anon, authenticated;
-- The person reads their own profile row. Introductions and blocks have no direct read at all: an introduction row
-- holds the other person's id and both whys, and a block row the blocked person's id, which the blocker may never have
-- been told. They are read only through connector_my_proposals_own, which redacts.
grant select on public.connector_profiles to authenticated;
grant all on public.connector_profiles, public.connector_intros, public.connector_blocks to service_role;
drop policy if exists connector_profiles_owner_read on public.connector_profiles;
create policy connector_profiles_owner_read on public.connector_profiles for select to authenticated using ((select auth.uid()) = user_id);

-- Open only with 500 opted-in, unpaused profiles. Says only open or not, never the count or who.
create or replace function public.connector_open() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select count(*) >= 500 from public.connector_profiles where opted_in and not paused
$$;

-- Each item of facts, needs and offers: an object with its own id and the source it came from; needs and offers of a
-- known kind.
create or replace function public.connector_items_ok(p_items jsonb, p_kinds text[]) returns boolean
language sql immutable set search_path = public, pg_temp as $$
 select jsonb_typeof(p_items) = 'array' and not exists (
  select from jsonb_array_elements(p_items) x
  where jsonb_typeof(x) <> 'object' or coalesce(length(x->>'id'), 0) not between 1 and 80
   or coalesce(length(x->>'source'), 0) not between 1 and 400 or coalesce(length(x->>'value'), 0) not between 1 and 200
   or (p_kinds is not null and coalesce(x->>'kind', '') <> all(p_kinds)))
$$;

-- Every id cited for a person exists in that person's stored profile (a fact, a need or an offer).
create or replace function public.connector_cites_ok(p_user uuid, p_ids jsonb) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(jsonb_typeof(p_ids) = 'array' and jsonb_array_length(p_ids) >= 1 and not exists (
  select from jsonb_array_elements(p_ids) x
  where jsonb_typeof(x) <> 'string' or not exists (
   select from public.connector_profiles c, jsonb_array_elements(c.facts || c.needs || c.offers) f
   where c.user_id = p_user and f->>'id' = x #>> '{}')), false)
$$;

create or replace function public.connector_blocked(p_x uuid, p_y uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select exists (select from public.connector_blocks where (blocker = p_x and blocked = p_y) or (blocker = p_y and blocked = p_x))
$$;

-- What one side of an introduction may read. The other side's id only once both said yes, and never when the other side
-- blocked or reported this person. Only this person's own why and feedback.
create or replace function public.connector_view(i public.connector_intros, p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
 select jsonb_build_object(
  'id', i.id, 'kind', i.kind, 'state', i.state, 'side', case when p_user = i.a_user then 'a' else 'b' end,
  'why', case when p_user = i.a_user then i.why_a else i.why_b end,
  'other_role', (select role from public.connector_profiles where user_id = case when p_user = i.a_user then i.b_user else i.a_user end),
  'other_user', case when i.state in ('both_yes', 'introduced', 'met', 'no_meeting', 'no_reply')
    and not exists (select from public.connector_blocks where blocker = case when p_user = i.a_user then i.b_user else i.a_user end and blocked = p_user)
   then case when p_user = i.a_user then i.b_user else i.a_user end end,
  'my_answer', case when i.state in ('both_yes', 'introduced', 'met', 'no_meeting', 'no_reply') then 'yes'
   when (p_user = i.a_user and i.state = 'a_yes') or (p_user = i.b_user and i.state = 'b_yes') then 'yes' end,
  'proposed_at', i.proposed_at, 'decided_at', i.decided_at, 'intro_at', i.intro_at, 'checkin_at', i.checkin_at,
  'my_feedback', i.feedback->(case when p_user = i.a_user then 'a' else 'b' end))
$$;

-- Joining, or updating what the match profile holds. verified is never set here; a changed role clears it.
create or replace function public.connector_opt_in_core(p_user uuid, p_role text, p_needs jsonb, p_offers jsonb, p_facts jsonb,
 p_filters jsonb, p_now timestamptz) returns public.connector_profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.connector_profiles;
begin
 if p_user is null or p_now is null or p_role is null or p_role not in ('student', 'candidate', 'mentor', 'alumni', 'recruiter') then
  raise exception 'invalid connector profile'; end if;
 if not public.connector_items_ok(coalesce(p_needs, '[]'), array['meet', 'intel', 'referral', 'prep'])
  or not public.connector_items_ok(coalesce(p_offers, '[]'), array['advice', 'intel', 'referral'])
  or not public.connector_items_ok(coalesce(p_facts, '[]'), null)
  or (p_filters is not null and jsonb_typeof(p_filters) <> 'object')
  or (select count(*) <> count(distinct x->>'id') from jsonb_array_elements(coalesce(p_needs, '[]') || coalesce(p_offers, '[]') || coalesce(p_facts, '[]')) x) then
  raise exception 'invalid connector profile: every item needs its own id, a value and its source'; end if;
 insert into public.connector_profiles (user_id, opted_in, role, needs, offers, facts, filters, paused, created_at, updated_at)
 values (p_user, true, p_role, coalesce(p_needs, '[]'), coalesce(p_offers, '[]'), coalesce(p_facts, '[]'), coalesce(p_filters, '{}'), false, p_now, p_now)
 on conflict (user_id) do update set opted_in = true, role = excluded.role,
  verified = case when connector_profiles.role = excluded.role then connector_profiles.verified else false end,
  needs = excluded.needs, offers = excluded.offers, facts = excluded.facts,
  filters = coalesce(p_filters, connector_profiles.filters), paused = false, updated_at = p_now
 returning * into r;
 return r;
end $$;

-- Leaving: out of the network, what the profile held is cleared, and anything still waiting for an answer expires.
create or replace function public.connector_opt_out_core(p_user uuid, p_now timestamptz) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare was boolean;
begin
 if p_user is null or p_now is null then raise exception 'invalid connector request'; end if;
 update public.connector_profiles set opted_in = false, needs = '[]', offers = '[]', facts = '[]', updated_at = p_now where user_id = p_user;
 was := found;
 update public.connector_intros set state = 'expired', decided_at = p_now
  where (a_user = p_user or b_user = p_user) and state in ('proposed', 'a_yes', 'b_yes');
 return was;
end $$;

create or replace function public.connector_pause_core(p_user uuid, p_paused boolean, p_now timestamptz) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if p_user is null or p_paused is null or p_now is null then raise exception 'invalid connector request'; end if;
 update public.connector_profiles set paused = p_paused, updated_at = p_now where user_id = p_user;
 if not found then raise exception 'not_in_network'; end if;
 if p_paused then
  update public.connector_intros set state = 'expired', decided_at = p_now
   where (a_user = p_user or b_user = p_user) and state in ('proposed', 'a_yes', 'b_yes');
 end if;
 return p_paused;
end $$;

-- Service only: one proposal, refused unless every rule holds.
create or replace function public.connector_propose_for(p_a uuid, p_b uuid, p_kind text, p_why_a text, p_why_b text, p_cites jsonb,
 p_now timestamptz default null) returns public.connector_intros
language plpgsql security definer set search_path = public, pg_temp as $$
declare now_ timestamptz := coalesce(p_now, clock_timestamp()); r public.connector_intros;
begin
 if p_a is null or p_b is null or p_a = p_b or p_kind is null or p_kind not in ('meet', 'intel', 'referral', 'prep')
  or coalesce(length(trim(p_why_a)), 0) not between 1 and 600 or coalesce(length(trim(p_why_b)), 0) not between 1 and 600 then
  raise exception 'invalid proposal'; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_a, p_b)::text, 26));
 perform pg_advisory_xact_lock(hashtextextended(greatest(p_a, p_b)::text, 26));
 if public.connector_open() is not true then raise exception 'connector_closed: fewer than 500 people have opted in'; end if;
 if (select count(*) from public.connector_profiles where user_id in (p_a, p_b) and opted_in and not paused) <> 2 then
  raise exception 'not_opted_in'; end if;
 if exists (select from public.connector_profiles where user_id in (p_a, p_b) and role in ('mentor', 'recruiter') and not verified) then
  raise exception 'unverified: a mentor or recruiter is matched only once verified'; end if;
 if public.connector_blocked(p_a, p_b) then raise exception 'blocked'; end if;
 if exists (select from public.connector_intros where least(a_user, b_user) = least(p_a, p_b) and greatest(a_user, b_user) = greatest(p_a, p_b)) then
  raise exception 'repeat: this pair was proposed before'; end if;
 if exists (select from public.connector_intros where (a_user in (p_a, p_b) or b_user in (p_a, p_b)) and state in ('proposed', 'a_yes', 'b_yes')) then
  raise exception 'pending: one proposal at a time'; end if;
 if (select count(*) from public.connector_intros where (a_user = p_a or b_user = p_a) and proposed_at > now_ - interval '7 days') >= 3
  or (select count(*) from public.connector_intros where (a_user = p_b or b_user = p_b) and proposed_at > now_ - interval '7 days') >= 3 then
  raise exception 'weekly_cap: 3 proposals in 7 days'; end if;
 if jsonb_typeof(p_cites) is distinct from 'object' or not public.connector_cites_ok(p_a, p_cites->'a') or not public.connector_cites_ok(p_b, p_cites->'b') then
  raise exception 'missing_cites: every intro cites real facts from both profiles'; end if;
 insert into public.connector_intros (a_user, b_user, kind, why_a, why_b, cites, proposed_at)
 values (p_a, p_b, p_kind, trim(p_why_a), trim(p_why_b), p_cites, now_) returning * into r;
 return r;
end $$;

-- One side's yes or no to one proposal. A no closes it. Both yeses make it both_yes, and only then does either side's
-- view carry the other's id. A proposal older than 7 days expires instead.
create or replace function public.connector_answer_core(p_user uuid, p_intro uuid, p_yes boolean, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.connector_intros; side text;
begin
 if p_user is null or p_intro is null or p_yes is null or p_now is null then raise exception 'invalid intro'; end if;
 select * into i from public.connector_intros where id = p_intro and p_user in (a_user, b_user) for update;
 if not found then raise exception 'invalid intro'; end if;
 if i.state in ('declined', 'expired') then raise exception 'intro_closed'; end if;
 if i.state not in ('proposed', 'a_yes', 'b_yes') then raise exception 'intro_answered'; end if;
 side := case when p_user = i.a_user then 'a' else 'b' end;
 if i.proposed_at < p_now - interval '7 days' then
  update public.connector_intros set state = 'expired', decided_at = p_now where id = i.id returning * into i;
 elsif not p_yes or public.connector_blocked(i.a_user, i.b_user) then
  update public.connector_intros set state = 'declined', decided_at = p_now where id = i.id returning * into i;
 elsif (side = 'a' and i.state = 'b_yes') or (side = 'b' and i.state = 'a_yes') then
  update public.connector_intros set state = 'both_yes', decided_at = p_now where id = i.id returning * into i;
 elsif i.state = 'proposed' then
  update public.connector_intros set state = side || '_yes' where id = i.id returning * into i;
 end if;
 return public.connector_view(i, p_user);
end $$;

-- Block (and optionally report) the other side of one introduction: the blocker never needs, and never gets, the other's
-- id. A waiting proposal is declined. A report is flagged for human review (reported, reviewed_at null).
create or replace function public.connector_block_core(p_user uuid, p_intro uuid, p_reason text, p_report boolean, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.connector_intros; other uuid;
begin
 if p_user is null or p_intro is null or p_now is null then raise exception 'invalid block'; end if;
 select * into i from public.connector_intros where id = p_intro and p_user in (a_user, b_user) for update;
 if not found then raise exception 'invalid block'; end if;
 other := case when p_user = i.a_user then i.b_user else i.a_user end;
 insert into public.connector_blocks (blocker, blocked, intro_id, reason, reported, created_at)
 values (p_user, other, i.id, left(nullif(trim(p_reason), ''), 500), coalesce(p_report, false), p_now)
 on conflict (blocker, blocked) do update set reported = connector_blocks.reported or excluded.reported,
  reason = coalesce(excluded.reason, connector_blocks.reason);
 if i.state in ('proposed', 'a_yes', 'b_yes') then
  update public.connector_intros set state = 'declined', decided_at = p_now where id = i.id;
 end if;
 return jsonb_build_object('blocked', true, 'reported', (select reported from public.connector_blocks where blocker = p_user and blocked = other));
end $$;

-- After an introduction: did it happen, was it useful. The person's own filters may be updated with it (the edge code's
-- applyFeedback). Any side saying they met makes it met.
create or replace function public.connector_feedback_core(p_user uuid, p_intro uuid, p_feedback jsonb, p_filters jsonb, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.connector_intros; side text;
begin
 if p_user is null or p_intro is null or p_now is null or jsonb_typeof(p_feedback) is distinct from 'object'
  or jsonb_typeof(p_feedback->'met') is distinct from 'boolean'
  or (p_feedback ? 'useful' and jsonb_typeof(p_feedback->'useful') not in ('boolean', 'null'))
  or octet_length(p_feedback::text) > 2000 or (p_filters is not null and jsonb_typeof(p_filters) <> 'object') then
  raise exception 'invalid feedback'; end if;
 select * into i from public.connector_intros where id = p_intro and p_user in (a_user, b_user) for update;
 if not found then raise exception 'invalid feedback'; end if;
 if i.state not in ('introduced', 'met', 'no_meeting', 'no_reply') then raise exception 'not_introduced'; end if;
 side := case when p_user = i.a_user then 'a' else 'b' end;
 update public.connector_intros set feedback = feedback || jsonb_build_object(side, p_feedback || jsonb_build_object('at', p_now)),
  state = case when (p_feedback->>'met')::boolean or state = 'met' then 'met' else 'no_meeting' end
  where id = i.id returning * into i;
 if p_filters is not null then
  update public.connector_profiles set filters = p_filters, updated_at = p_now where user_id = p_user;
 end if;
 return public.connector_view(i, p_user);
end $$;

-- Service only: the follow-through steps, each once and only from the state it belongs to.
create or replace function public.connector_followup_for(p_intro uuid, p_step text, p_now timestamptz default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare now_ timestamptz := coalesce(p_now, clock_timestamp()); s text;
begin
 update public.connector_intros set
  state = case p_step when 'expire' then 'expired' when 'introduced' then 'introduced' when 'no_reply' then 'no_reply' else state end,
  decided_at = case when p_step = 'expire' then now_ else decided_at end,
  intro_at = case when p_step = 'introduced' then now_ else intro_at end,
  nudge_at = case when p_step = 'nudge' then now_ else nudge_at end,
  checkin_at = case when p_step = 'checkin' then now_ else checkin_at end,
  checkin_nudge_at = case when p_step = 'checkin_nudge' then now_ else checkin_nudge_at end
 where id = p_intro and case p_step
  when 'nudge' then state in ('proposed', 'a_yes', 'b_yes') and nudge_at is null
  when 'expire' then state in ('proposed', 'a_yes', 'b_yes')
  when 'introduced' then state = 'both_yes' and not public.connector_blocked(a_user, b_user)
  when 'checkin' then state = 'introduced' and checkin_at is null
  when 'checkin_nudge' then state = 'introduced' and checkin_at is not null and checkin_nudge_at is null
  when 'no_reply' then state = 'introduced' and checkin_nudge_at is not null
  else false end
 returning state into s;
 if s is null then raise exception 'followup_refused: % does not apply now', coalesce(p_step, 'null'); end if;
 return s;
end $$;

-- Service only: mentors and recruiters are checked by a person on the team; nothing else sets verified.
create or replace function public.connector_verify_for(p_user uuid, p_verified boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 update public.connector_profiles set verified = coalesce(p_verified, false), updated_at = clock_timestamp() where user_id = p_user;
 if not found then raise exception 'not_in_network'; end if;
 return coalesce(p_verified, false);
end $$;

-- The person's own introductions, newest first, each as connector_view redacts it (the app's Export data asks for up to
-- 1,000; at 3 a week that is years).
create or replace function public.connector_my_proposals_core(p_user uuid, p_limit int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce(jsonb_agg(public.connector_view(i, p_user) order by i.proposed_at desc), '[]')
 from public.connector_intros i
 where i.id in (select id from public.connector_intros where p_user in (a_user, b_user) order by proposed_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 1000))
$$;

-- The signed-in person (their app).
create or replace function public.connector_opt_in_own(p_role text, p_needs jsonb, p_offers jsonb, p_facts jsonb, p_filters jsonb default null)
returns public.connector_profiles language sql security definer set search_path = public, pg_temp as $$
 select public.connector_opt_in_core(auth.uid(), p_role, p_needs, p_offers, p_facts, p_filters, clock_timestamp()) $$;
create or replace function public.connector_opt_out_own() returns boolean language sql security definer set search_path = public, pg_temp as $$
 select public.connector_opt_out_core(auth.uid(), clock_timestamp()) $$;
create or replace function public.connector_pause_own(p_paused boolean) returns boolean language sql security definer set search_path = public, pg_temp as $$
 select public.connector_pause_core(auth.uid(), p_paused, clock_timestamp()) $$;
create or replace function public.connector_answer_own(p_intro uuid, p_yes boolean) returns jsonb language sql security definer set search_path = public, pg_temp as $$
 select public.connector_answer_core(auth.uid(), p_intro, p_yes, clock_timestamp()) $$;
create or replace function public.connector_block_own(p_intro uuid, p_reason text default null, p_report boolean default false) returns jsonb
language sql security definer set search_path = public, pg_temp as $$ select public.connector_block_core(auth.uid(), p_intro, p_reason, p_report, clock_timestamp()) $$;
create or replace function public.connector_feedback_own(p_intro uuid, p_feedback jsonb, p_filters jsonb default null) returns jsonb
language sql security definer set search_path = public, pg_temp as $$ select public.connector_feedback_core(auth.uid(), p_intro, p_feedback, p_filters, clock_timestamp()) $$;
create or replace function public.connector_my_proposals_own(p_limit int default 20) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 select case when auth.uid() is null then '[]'::jsonb else public.connector_my_proposals_core(auth.uid(), p_limit) end $$;

-- The edge functions' service role, acting for a texting contact.
create or replace function public.connector_opt_in_as(p_user uuid, p_role text, p_needs jsonb, p_offers jsonb, p_facts jsonb, p_filters jsonb default null)
returns public.connector_profiles language sql security definer set search_path = public, pg_temp as $$
 select public.connector_opt_in_core(p_user, p_role, p_needs, p_offers, p_facts, p_filters, clock_timestamp()) $$;
create or replace function public.connector_opt_out_as(p_user uuid) returns boolean language sql security definer set search_path = public, pg_temp as $$
 select public.connector_opt_out_core(p_user, clock_timestamp()) $$;
create or replace function public.connector_pause_as(p_user uuid, p_paused boolean) returns boolean language sql security definer set search_path = public, pg_temp as $$
 select public.connector_pause_core(p_user, p_paused, clock_timestamp()) $$;
create or replace function public.connector_answer_as(p_user uuid, p_intro uuid, p_yes boolean) returns jsonb language sql security definer set search_path = public, pg_temp as $$
 select public.connector_answer_core(p_user, p_intro, p_yes, clock_timestamp()) $$;
create or replace function public.connector_block_as(p_user uuid, p_intro uuid, p_reason text default null, p_report boolean default false) returns jsonb
language sql security definer set search_path = public, pg_temp as $$ select public.connector_block_core(p_user, p_intro, p_reason, p_report, clock_timestamp()) $$;
create or replace function public.connector_feedback_as(p_user uuid, p_intro uuid, p_feedback jsonb, p_filters jsonb default null) returns jsonb
language sql security definer set search_path = public, pg_temp as $$ select public.connector_feedback_core(p_user, p_intro, p_feedback, p_filters, clock_timestamp()) $$;
create or replace function public.connector_my_proposals_as(p_user uuid, p_limit int default 20) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 select public.connector_my_proposals_core(p_user, p_limit) $$;

revoke all on function public.connector_open(), public.connector_items_ok(jsonb, text[]), public.connector_cites_ok(uuid, jsonb),
 public.connector_blocked(uuid, uuid), public.connector_view(public.connector_intros, uuid),
 public.connector_opt_in_core(uuid, text, jsonb, jsonb, jsonb, jsonb, timestamptz), public.connector_opt_out_core(uuid, timestamptz),
 public.connector_pause_core(uuid, boolean, timestamptz), public.connector_propose_for(uuid, uuid, text, text, text, jsonb, timestamptz),
 public.connector_answer_core(uuid, uuid, boolean, timestamptz), public.connector_block_core(uuid, uuid, text, boolean, timestamptz),
 public.connector_feedback_core(uuid, uuid, jsonb, jsonb, timestamptz), public.connector_followup_for(uuid, text, timestamptz),
 public.connector_verify_for(uuid, boolean), public.connector_my_proposals_core(uuid, int),
 public.connector_opt_in_own(text, jsonb, jsonb, jsonb, jsonb), public.connector_opt_out_own(), public.connector_pause_own(boolean),
 public.connector_answer_own(uuid, boolean), public.connector_block_own(uuid, text, boolean), public.connector_feedback_own(uuid, jsonb, jsonb),
 public.connector_my_proposals_own(int),
 public.connector_opt_in_as(uuid, text, jsonb, jsonb, jsonb, jsonb), public.connector_opt_out_as(uuid), public.connector_pause_as(uuid, boolean),
 public.connector_answer_as(uuid, uuid, boolean), public.connector_block_as(uuid, uuid, text, boolean), public.connector_feedback_as(uuid, uuid, jsonb, jsonb),
 public.connector_my_proposals_as(uuid, int)
 from public, anon, authenticated, service_role;
grant execute on function public.connector_open(), public.connector_opt_in_own(text, jsonb, jsonb, jsonb, jsonb), public.connector_opt_out_own(),
 public.connector_pause_own(boolean), public.connector_answer_own(uuid, boolean), public.connector_block_own(uuid, text, boolean),
 public.connector_feedback_own(uuid, jsonb, jsonb), public.connector_my_proposals_own(int) to authenticated;
grant execute on function public.connector_open(), public.connector_propose_for(uuid, uuid, text, text, text, jsonb, timestamptz),
 public.connector_followup_for(uuid, text, timestamptz), public.connector_verify_for(uuid, boolean),
 public.connector_opt_in_as(uuid, text, jsonb, jsonb, jsonb, jsonb), public.connector_opt_out_as(uuid), public.connector_pause_as(uuid, boolean),
 public.connector_answer_as(uuid, uuid, boolean), public.connector_block_as(uuid, uuid, text, boolean), public.connector_feedback_as(uuid, uuid, jsonb, jsonb),
 public.connector_my_proposals_as(uuid, int) to service_role;
