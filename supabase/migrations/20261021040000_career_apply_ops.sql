-- WO-032: apply operations. Every application provable (the answers, the employer's confirmation email), the PR #16 gate
-- counted, applying by email where the posting asks for it, and the questions only the person can answer pushed once.
--
-- 1. The contract with WO-039 (and every apply path), in WO-039's own names (20261021080000_career_apply_cloud.sql
--    defines the same columns and constraint; whichever applies first, the other changes nothing). career_apply_jobs
--    carries `source`: own_computer (career_apply_claim_own), extension (career_apply_claim_own with 'extension'), cloud
--    (the worker pool, career_apply_claim) or email (applied by email from the person's Gmail), set by the claim.
--    A row reaches state 'confirmed' ONLY from an employer email matched to it (career_apply_confirm_as), which sets
--    email_confirmed_at and confirmation_mail_hash and files the email's evidence line (never a body) as the
--    career_mail_events row of that message, naming the application (job:<id>). A page that says "thank you for applying"
--    is evidence, not confirmation: career_apply_finish keeps it on the row (evidence.page_confirmation) and the row waits,
--    submitted_unconfirmed, for the email. A trigger refuses every other way into 'confirmed'. Rows confirmed before this
--    migration are left as they were; the gate counts only email.
-- 2. career_apply_gate_status(): per portal family, confirmed hand submissions (own_computer or extension) out of 3.
-- 3. Apply by email: career_postings.apply_email (set by ingestion when the posting asks for an emailed application); the
--    card waits on the account (career:email-card, cleared by an erase); the yes reserves one career_apply_jobs row
--    (source email, counted in the daily limit, one per posting, one per company per 30 days) only for the exact payload
--    shown, and the send is recorded on it like any drive (career_apply_finish).
-- 4. Ask once, pushed: an open question is texted at most once (pushed_at), at most one such text a day, as the thread's
--    last word, so the numbered answers reach the same check as when the person asks. The outbox learns the kind
--    "questions" and keeps every kind and key prefix any earlier migration allows.
-- 5. An ambiguous employer email (two applications at that company in the window) is asked about once
--    (career:confirm-ask:<message hash> on the account) and answered by number.
-- Additive and idempotent: new columns, constraints, a trigger and functions; career_apply_finish, career_apply_claim and
-- career_apply_claim_own(integer) are redefined with their signatures and grants unchanged.

-- ------------------------------------------------------------------------------------------------ 1. source, confirmation
alter table public.career_apply_jobs add column if not exists source text;
alter table public.career_apply_jobs drop constraint if exists career_apply_jobs_source_check;
alter table public.career_apply_jobs add constraint career_apply_jobs_source_check
 check (source is null or source in ('own_computer', 'extension', 'cloud', 'email'));
alter table public.career_apply_jobs add column if not exists email_confirmed_at timestamptz;
alter table public.career_apply_jobs add column if not exists confirmation_mail_hash text;
alter table public.career_apply_jobs drop constraint if exists career_apply_jobs_mail_confirm_check;
alter table public.career_apply_jobs add constraint career_apply_jobs_mail_confirm_check
  check ((email_confirmed_at is null) = (confirmation_mail_hash is null)
    and (confirmation_mail_hash is null or confirmation_mail_hash ~ '^[a-f0-9]{64}$'));
create index if not exists career_apply_gate_idx on public.career_apply_jobs (source, state) where source in ('own_computer', 'extension');

create or replace function public.career_apply_confirmed_by_email() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
 if new.state = 'confirmed' and (tg_op = 'INSERT' or old.state is distinct from 'confirmed')
  and not (new.email_confirmed_at is not null and new.confirmation_mail_hash is not null) then
  raise exception 'confirmed_only_by_email: an application is confirmed only by the employer''s email matched to it';
 end if;
 return new;
end $$;
revoke all on function public.career_apply_confirmed_by_email() from public, anon, authenticated;
drop trigger if exists career_apply_confirmed_by_email on public.career_apply_jobs;
create trigger career_apply_confirmed_by_email before insert or update of state on public.career_apply_jobs
 for each row execute function public.career_apply_confirmed_by_email();

-- As 20261020000000, with one change: an outcome reported as 'confirmed' (the employer's page) is kept as evidence and the
-- row is submitted_unconfirmed until the employer's email confirms it.
create or replace function public.career_apply_finish(p_id uuid,p_lease uuid,p_state text,p_evidence jsonb default '{}')
returns public.career_apply_jobs language plpgsql set search_path=public,pg_temp as $$
declare j public.career_apply_jobs; st text; ev jsonb;
begin
 select * into j from public.career_apply_jobs where id=p_id and lease_token=p_lease;
 if not found then raise exception 'invalid apply claim'; end if;
 perform pg_advisory_xact_lock(hashtextextended(j.user_id::text,0));
 select * into j from public.career_apply_jobs where id=p_id and lease_token=p_lease for update;
 if not found then raise exception 'invalid apply claim'; end if;
 if p_state is null or p_state not in ('confirmed','submitted_unconfirmed','needs_user','failed','not_submitted','unknown_outcome') or j.state<>'driving' or j.attempts<>1 then raise exception 'invalid apply transition'; end if;
 st := case when p_state = 'confirmed' then 'submitted_unconfirmed' else p_state end;
 ev := case when p_state = 'confirmed' then coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('page_confirmation', true) else p_evidence end;
 update public.career_apply_jobs set state=st,
 reason=ev->>'reason',confirmation_id=ev->>'confirmation_id',evidence=ev,updated_at=now() where id=p_id returning * into j;
 return j;
end $$;

-- The worker pool's claim (service role) records the drive as the cloud's. Otherwise as 20261020000000.
create or replace function public.career_apply_claim(p_now timestamptz,p_limit integer) returns setof public.career_apply_jobs
language sql set search_path=public,pg_temp as $$
 with picked as (select id from public.career_apply_jobs where state='queued' and source is null and public.career_apply_current(user_id,payload)
 and approval_hash=payload_hash and attempts=0 and p_now is not null
 order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=p_now,lease_token=gen_random_uuid(),updated_at=p_now,source='cloud' from picked where j.id=picked.id returning j.*;
$$;

-- The person's own claim says which of their own surfaces drives it: their computer or their browser extension.
create or replace function public.career_apply_claim_own(p_limit integer, p_source text) returns setof public.career_apply_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); n timestamptz:=clock_timestamp();
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_source is null or p_source not in ('own_computer', 'extension') then raise exception 'invalid apply source'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 update public.career_apply_jobs set state='unknown_outcome',
  reason='application outcome unknown: the drive stopped before recording it; not retried',
  evidence=evidence||jsonb_build_object('swept_at',n),updated_at=n
  where user_id=u and state='driving' and claimed_at<n-interval '15 minutes';
 return query
 with picked as (select id from public.career_apply_jobs where user_id=u and state='queued' and source is null
  and public.career_apply_current(user_id,payload) and approval_hash=payload_hash and attempts=0
  order by created_at,id limit greatest(0,least(6,coalesce(p_limit,0))) for update skip locked)
 update public.career_apply_jobs j set state='driving',attempts=1,claimed_at=n,lease_token=gen_random_uuid(),updated_at=n,source=p_source
  from picked where j.id=picked.id returning j.*;
end $$;
create or replace function public.career_apply_claim_own(p_limit integer) returns setof public.career_apply_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return query select * from public.career_apply_claim_own(p_limit, 'own_computer');
end $$;
revoke all on function public.career_apply_claim_own(integer, text) from public, anon;
grant execute on function public.career_apply_claim_own(integer, text) to authenticated;

-- The employer's email, matched in code (career_apply_confirm.ts), confirms one application. Refused unless the row is
-- this person's, went (or may have gone) to the employer, and was submitted within the 14 days before the email.
-- Idempotent: the same message again is 'already'; a row another email already confirmed stays as it is. The message's
-- status event (WO-024's career_mail_events row, one per message) is filed under this application, or written if the
-- looser status match left it unfiled: its evidence line is the proof, and WO-039's gate reads it.
create or replace function public.career_apply_confirm_as(p_user uuid, p_id uuid, p_hash text, p_kind text, p_evidence text, p_mail_at timestamptz)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.career_apply_jobs; sub timestamptz;
begin
 if p_user is null or p_id is null or coalesce(p_hash, '') !~ '^[a-f0-9]{64}$' or p_kind is null
  or p_kind not in ('received', 'rejection', 'interview', 'offer') or p_evidence is null
  or length(p_evidence) not between 1 and 300 or p_evidence ~ '[0-9]{6,}' or p_mail_at is null then
  raise exception 'invalid confirmation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
 select * into j from public.career_apply_jobs where id = p_id and user_id = p_user for update;
 if not found then raise exception 'not your application'; end if;
 if j.confirmation_mail_hash = p_hash then return 'already'; end if;
 if j.confirmation_mail_hash is not null then return 'confirmed_by_another_email'; end if;
 if j.state not in ('submitted_unconfirmed', 'unknown_outcome', 'confirmed') then return 'not_sent'; end if;
 sub := coalesce(j.claimed_at, j.created_at);
 if p_mail_at < sub or p_mail_at > sub + interval '14 days' then return 'outside_window'; end if;
 update public.career_apply_jobs set state = 'confirmed', email_confirmed_at = p_mail_at, confirmation_mail_hash = p_hash, updated_at = now()
  where id = p_id;
 insert into public.career_mail_events (user_id, application_ref, kind, company, stage, flagged, evidence, message_hash, mail_at)
 values (p_user, 'job:' || p_id, p_kind, left(j.company, 200), null, false, p_evidence, p_hash, p_mail_at)
 on conflict (user_id, message_hash) do update set application_ref = excluded.application_ref;
 return 'confirmed';
end $$;

-- ------------------------------------------------------------------------------------------------ 2. the PR #16 gate
-- Per portal family, the hand submissions (the person's own computer or extension) the employer's confirmation email
-- confirmed, out of the 3 the gate asks for: counted exactly as WO-039's career_apply_cloud_open counts them (state
-- confirmed, the mail confirmation set, and that message's 'received' event filed under the application). awaiting_email
-- counts the ones sent and not yet confirmed.
create or replace function public.career_apply_gate_status()
returns table (family text, confirmed integer, needed integer, met boolean, awaiting_email integer)
language sql stable security definer set search_path = public, pg_temp as $$
 with hand as (
  select case
   when url ~* '^https?://([^/]*\.)?greenhouse\.io(/|$)' then 'greenhouse'
   when url ~* '^https?://([^/]*\.)?lever\.co(/|$)' then 'lever'
   when url ~* '^https?://([^/]*\.)?ashbyhq\.com(/|$)' then 'ashby'
   when url ~* '^https?://([^/]*\.)?smartrecruiters\.com(/|$)' then 'smartrecruiters'
   when url ~* '^https?://([^/]*\.)?(myworkdayjobs|myworkday|workday)\.com(/|$)' then 'workday'
   else 'other' end as fam, state, email_confirmed_at
  , exists (select from public.career_mail_events e where e.user_id = j.user_id and e.application_ref = 'job:' || j.id
     and e.kind = 'received' and not e.flagged and e.message_hash = j.confirmation_mail_hash) as by_mail
  from public.career_apply_jobs j where source in ('own_computer', 'extension')),
 fams as (select f from unnest(array['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday']) f
          union select fam from hand)
 select fams.f,
  (count(*) filter (where h.state = 'confirmed' and h.email_confirmed_at is not null and h.by_mail))::int,
  3,
  (count(*) filter (where h.state = 'confirmed' and h.email_confirmed_at is not null and h.by_mail)) >= 3,
  (count(*) filter (where h.state in ('submitted_unconfirmed', 'unknown_outcome')))::int
 from fams left join hand h on h.fam = fams.f
 group by fams.f
 order by array_position(array['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'other'], fams.f)
$$;

-- ------------------------------------------------------------------------------------------------ 3. apply by email
alter table public.career_postings add column if not exists apply_email text;
alter table public.career_postings drop constraint if exists career_postings_apply_email_check;
alter table public.career_postings add constraint career_postings_apply_email_check
 check (apply_email is null or (apply_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$' and length(apply_email) <= 254));

-- The yes to the card shown: the exact payload (its hash is the card's), within a day, under the daily limit, one per
-- posting and one per company per 30 days (the same rules and lock as career_apply_enqueue). The row is the send's lease:
-- a send that never reports back becomes unknown_outcome and is never sent again.
create or replace function public.career_apply_email_reserve_for(p_user uuid, p_payload jsonb, p_hash text, p_now timestamptz)
returns public.career_apply_jobs language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare j public.career_apply_jobs; card jsonb; co text; counted text[] := array['queued','driving','confirmed','submitted_unconfirmed','needs_user','unknown_outcome'];
begin
 if p_user is null or p_now is null or p_payload is null or p_payload->>'kind' is distinct from 'email' or p_payload->>'version' is distinct from '1'
  or p_payload->>'user_id' is distinct from p_user::text or nullif(p_payload->>'job_id', '') is null or nullif(p_payload->>'company', '') is null
  or coalesce(p_payload->>'url', '') !~ '^https?://'
  or coalesce(p_payload->>'to', '') !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$'
  or length(coalesce(p_payload->>'subject', '')) not between 1 and 200 or p_payload->>'subject' ~ '[\r\n]'
  or length(coalesce(p_payload->>'body', '')) not between 1 and 5000
  or coalesce(p_payload#>>'{attachment,sha256}', '') !~ '^[a-f0-9]{64}$'
  or p_payload ? 'cc' or p_payload ? 'bcc'
  or coalesce(p_hash, '') is distinct from encode(sha256(convert_to(public.career_apply_canonical(p_payload), 'UTF8')), 'hex') then
  raise exception 'invalid email application'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
 select value into card from public.career_watch_kv where user_id = p_user and key = 'career:email-card' for update;
 if card is null or card->>'state' is distinct from 'shown' or card->>'payload_hash' is distinct from p_hash
  or (card->>'shown_at')::timestamptz < p_now - interval '24 hours' then raise exception 'changed_since_yes'; end if;
 if exists (select from public.career_apply_jobs where user_id = p_user and job_id = p_payload->>'job_id') then raise exception 'duplicate_job'; end if;
 co := trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(p_payload->>'company'),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g'));
 if co <> '' and exists (select from public.career_apply_jobs where user_id = p_user and state = any(counted) and created_at > p_now - interval '30 days'
  and trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(company),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g')) = co) then
  raise exception 'company_cooldown'; end if;
 if (select count(*) from public.career_apply_jobs where user_id = p_user and state = any(counted) and created_at > p_now - interval '1 day')
  >= public.career_apply_daily_limit(p_user) then raise exception 'daily_cap'; end if;
 insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, attempts, claimed_at, lease_token, source, created_at, updated_at)
 values (p_user, p_payload->>'job_id', p_payload->>'company', p_payload->>'url', p_payload, p_hash, p_hash, 'driving', 1, p_now, gen_random_uuid(), 'email', p_now, p_now)
 returning * into j;
 update public.career_watch_kv set value = card || jsonb_build_object('state', 'sending', 'application', j.id), updated_at = p_now
  where user_id = p_user and key = 'career:email-card';
 return j;
end $$;

-- What the send did: sent (submitted_unconfirmed until the employer answers), refused by Gmail before sending
-- (not_submitted), or unknown (never sent again).
create or replace function public.career_apply_email_finish_for(p_user uuid, p_id uuid, p_lease uuid, p_state text, p_evidence jsonb)
returns public.career_apply_jobs language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.career_apply_jobs;
begin
 if p_state is null or p_state not in ('submitted_unconfirmed', 'not_submitted', 'unknown_outcome')
  or p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or octet_length(p_evidence::text) > 8192 then raise exception 'invalid email outcome'; end if;
 if not exists (select from public.career_apply_jobs where id = p_id and user_id = p_user and source = 'email' and lease_token = p_lease) then
  raise exception 'invalid apply claim'; end if;
 j := public.career_apply_finish(p_id, p_lease, p_state, p_evidence);
 update public.career_watch_kv set value = value || jsonb_build_object('state', case when p_state = 'submitted_unconfirmed' then 'sent' else 'failed' end),
  updated_at = now() where user_id = p_user and key = 'career:email-card' and value->>'application' = p_id::text;
 return j;
end $$;
create or replace function public.career_apply_email_reserve_as(p_user uuid, p_payload jsonb, p_hash text) returns public.career_apply_jobs
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_email_reserve_for(p_user, p_payload, p_hash, clock_timestamp()) $$;
create or replace function public.career_apply_email_finish_as(p_user uuid, p_id uuid, p_lease uuid, p_state text, p_evidence jsonb) returns public.career_apply_jobs
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_email_finish_for(p_user, p_id, p_lease, p_state, p_evidence) $$;

-- ------------------------------------------------------------------------------------------------ 4. questions, pushed
alter table public.career_apply_questions add column if not exists pushed_at timestamptz;
alter table public.career_outbox drop constraint if exists career_outbox_key_check;
alter table public.career_outbox add constraint career_outbox_key_check
  check (key ~ '^(alert|report|reply|receipt|card|status|followup|mock|questions):.+$' and length(key) <= 310);
alter table public.career_outbox drop constraint if exists career_outbox_kind_check;
-- Every kind an earlier migration allows stays (mail's status and followup; the voice mock's 'mock', PR #52), plus ours.
alter table public.career_outbox add constraint career_outbox_kind_check
  check (kind in ('alert', 'report', 'reply', 'receipt', 'card', 'status', 'followup', 'mock', 'questions'));
alter table public.career_proactive_runs add column if not exists questions int not null default 0 check (questions >= 0);
alter table public.career_proactive_runs add column if not exists confirmations int not null default 0 check (confirmations >= 0);
alter table public.career_proactive_runs add column if not exists asks int not null default 0 check (asks >= 0);

-- Whether the person's texting thread is waiting on something else: a card still open, a reply queued in the last 30
-- minutes (a conversation under way), or a prompt (card, questions, an ask, an email card) as the last word in the last
-- 24 hours. A push never lands in the middle of any of them.
create or replace function public.career_thread_busy(p_user uuid, p_thread uuid, p_now timestamptz) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
 select exists (select from public.career_apply_cards where user_id = p_user and state = 'open' and shown_at >= p_now - interval '24 hours')
  or exists (select from public.career_outbox where user_id = p_user and kind = 'reply' and created_at >= p_now - interval '30 minutes')
  or coalesce((select m.meta->>'intent' in ('career_apply_card', 'career_apply_questions', 'career_apply_confirm_which', 'career_apply_email')
                 and m.created_at >= p_now - interval '24 hours'
               from public.agent_messages m where m.thread_id = p_thread and m.role = 'assistant' order by m.id desc limit 1), false)
$$;

-- The questions a preparation left open, texted once: only open questions never pushed, at most one such text a day, as
-- the thread's last word (intent career_apply_questions) with the questions shown recorded where "what do you need from
-- me" records them, and only when the text carries every question's wording.
create or replace function public.career_apply_questions_push_for(p_user uuid, p_ids uuid[], p_text text, p_now timestamptz)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare thread uuid;
begin
 if p_user is null or p_ids is null or cardinality(p_ids) not between 1 and 5 or p_now is null
  or p_text is null or length(p_text) not between 1 and 4000 then raise exception 'invalid questions push'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 select thread_id into thread from public.channel_contacts where user_id = p_user and not opted_out and thread_id is not null;
 if thread is null then return false; end if;
 if exists (select from public.career_outbox where user_id = p_user and kind = 'questions' and created_at >= p_now - interval '24 hours')
  or public.career_thread_busy(p_user, thread, p_now)
  or (select count(*) from public.career_apply_questions where user_id = p_user and id = any(p_ids) and state = 'open' and pushed_at is null)
     <> (select count(distinct x) from unnest(p_ids) x) or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids)
 then return false; end if;
 if exists (select from public.career_apply_questions where id = any(p_ids) and position(btrim(regexp_replace(label, '\s+', ' ', 'g')) in p_text) = 0) then
  raise exception 'questions text does not carry every question'; end if;
 update public.career_apply_questions set pushed_at = p_now, updated_at = p_now where id = any(p_ids);
 insert into public.agent_messages (thread_id, role, content, meta)
 values (thread, 'assistant', p_text, jsonb_build_object('career', true, 'intent', 'career_apply_questions', 'proactive', true));
 insert into public.career_watch_kv (user_id, key, value, updated_at)
 values (p_user, 'career:questions-shown', jsonb_build_object('thread', thread, 'ids', to_jsonb(p_ids::text[]), 'at', p_now), p_now)
 on conflict (user_id, key) do update set value = excluded.value, updated_at = excluded.updated_at;
 insert into public.career_outbox (user_id, key, kind, text, deliver_at) values (p_user, 'questions:' || p_ids[1], 'questions', p_text, p_now);
 return true;
end $$;
create or replace function public.career_apply_questions_push_as(p_user uuid, p_ids uuid[], p_text text) returns boolean
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_questions_push_for(p_user, p_ids, p_text, clock_timestamp()) $$;

-- ------------------------------------------------------------------------------------------------ 5. which application?
-- The ask waits on the account (career:confirm-ask:<message hash>, written once by the mail run, state pending). It is
-- texted once, as the thread's last word; the answer is a number from the list or 0 for neither.
create or replace function public.career_apply_confirm_ask_push_for(p_user uuid, p_hash text, p_text text, p_now timestamptz)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare thread uuid; a jsonb; k text := 'career:confirm-ask:' || p_hash;
begin
 if p_user is null or coalesce(p_hash, '') !~ '^[a-f0-9]{64}$' or p_now is null or p_text is null or length(p_text) not between 1 and 1500 then
  raise exception 'invalid ask push'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 select value into a from public.career_watch_kv where user_id = p_user and key = k for update;
 if a is null or a->>'state' is distinct from 'pending' then return false; end if;
 select thread_id into thread from public.channel_contacts where user_id = p_user and not opted_out and thread_id is not null;
 if thread is null or public.career_thread_busy(p_user, thread, p_now) then return false; end if;
 update public.career_watch_kv set value = a || jsonb_build_object('state', 'asked', 'asked_at', p_now, 'thread', thread), updated_at = p_now
  where user_id = p_user and key = k;
 insert into public.agent_messages (thread_id, role, content, meta)
 values (thread, 'assistant', p_text, jsonb_build_object('career', true, 'intent', 'career_apply_confirm_which', 'ask', p_hash, 'proactive', true));
 insert into public.career_outbox (user_id, key, kind, text, deliver_at) values (p_user, 'status:which:' || p_hash, 'status', p_text, p_now)
 on conflict (user_id, key) do nothing;
 return true;
end $$;
create or replace function public.career_apply_confirm_answer_for(p_user uuid, p_hash text, p_n integer, p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a jsonb; k text := 'career:confirm-ask:' || p_hash; res text; id uuid;
begin
 if p_user is null or coalesce(p_hash, '') !~ '^[a-f0-9]{64}$' or p_n is null or p_now is null then raise exception 'invalid answer'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 select value into a from public.career_watch_kv where user_id = p_user and key = k for update;
 if a is null or a->>'state' is distinct from 'asked' then raise exception 'no_open_ask'; end if;
 if (a->>'asked_at')::timestamptz < p_now - interval '7 days' then raise exception 'ask_expired'; end if;
 if p_n = 0 then res := 'neither';
 elsif p_n between 1 and jsonb_array_length(a->'ids') then
  id := (a->'ids'->>(p_n - 1))::uuid;
  res := public.career_apply_confirm_as(p_user, id, p_hash, a->>'kind', a->>'evidence', (a->>'mail_at')::timestamptz);
 else raise exception 'not_on_list'; end if;
 update public.career_watch_kv set value = a || jsonb_build_object('state', 'answered', 'answer', p_n, 'result', res, 'answered_at', p_now), updated_at = p_now
  where user_id = p_user and key = k;
 return jsonb_build_object('result', res, 'application', id, 'company', a->>'company');
end $$;
create or replace function public.career_apply_confirm_ask_push_as(p_user uuid, p_hash text, p_text text) returns boolean
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_confirm_ask_push_for(p_user, p_hash, p_text, clock_timestamp()) $$;
create or replace function public.career_apply_confirm_answer_as(p_user uuid, p_hash text, p_n integer) returns jsonb
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_confirm_answer_for(p_user, p_hash, p_n, clock_timestamp()) $$;

-- ------------------------------------------------------------------------------------------------ grants
revoke all on function public.career_apply_confirm_as(uuid, uuid, text, text, text, timestamptz), public.career_apply_gate_status(),
 public.career_apply_email_reserve_for(uuid, jsonb, text, timestamptz), public.career_apply_email_finish_for(uuid, uuid, uuid, text, jsonb),
 public.career_apply_email_reserve_as(uuid, jsonb, text), public.career_apply_email_finish_as(uuid, uuid, uuid, text, jsonb),
 public.career_thread_busy(uuid, uuid, timestamptz),
 public.career_apply_questions_push_for(uuid, uuid[], text, timestamptz), public.career_apply_questions_push_as(uuid, uuid[], text),
 public.career_apply_confirm_ask_push_for(uuid, text, text, timestamptz), public.career_apply_confirm_answer_for(uuid, text, integer, timestamptz),
 public.career_apply_confirm_ask_push_as(uuid, text, text), public.career_apply_confirm_answer_as(uuid, text, integer)
 from public, anon, authenticated, service_role;
grant execute on function public.career_apply_confirm_as(uuid, uuid, text, text, text, timestamptz), public.career_apply_gate_status(),
 public.career_apply_email_reserve_as(uuid, jsonb, text), public.career_apply_email_finish_as(uuid, uuid, uuid, text, jsonb),
 public.career_apply_questions_push_as(uuid, uuid[], text), public.career_apply_confirm_ask_push_as(uuid, text, text),
 public.career_apply_confirm_answer_as(uuid, text, integer)
 to service_role;
