-- WO-035: the voice mock interview. "start a voice mock for Goldman IB" in chat creates a voice session and answers with a
-- link that is signed (career_voice_link.ts), bound to the person's account, single-use and good for 10 minutes. The
-- session lives in career_watch_kv under career:voice:<session id> (service role only; an account erase deletes every
-- career_watch_kv row of the person except request receipts, career_host_commit in 20261016120000, so no erase change is
-- needed, and deleting the account removes it on cascade). It holds the plan of questions and its timestamps only: no
-- audio and no transcript is ever written anywhere (the transcript is scored in memory by the career-voice function and
-- dropped; only the debrief text is kept, in the person's own thread).
--
-- Every step is one function, so each rule holds in one transaction:
--   career_voice_create   a new session for the person's own thread; at most 5 a day; sessions older than 2 days are swept
--   career_voice_start    the link's one use: refused when used, expired (10 minutes), or already moved to the text mock
--   career_voice_finish   the debrief, once: written into the thread as Upmore's last word and, when that thread is the
--                         person's texting thread, queued once in the outbox (kind "mock", key "mock:<session id>")
--   career_voice_fallback the text mock in one tap (mic blocked, WebRTC failed, or voice not wired): the same role and
--                         company start as a text mock in the thread, its first question the thread's last word
alter table public.career_outbox drop constraint if exists career_outbox_key_check;
alter table public.career_outbox add constraint career_outbox_key_check
  check (key ~ '^(alert|report|reply|receipt|card|mock):.+$' and length(key) <= 310);
alter table public.career_outbox drop constraint if exists career_outbox_kind_check;
alter table public.career_outbox add constraint career_outbox_kind_check check (kind in ('alert', 'report', 'reply', 'receipt', 'card', 'mock'));

create or replace function public.career_voice_create(p_user uuid, p_thread uuid, p_state jsonb, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare sid uuid;
begin
 if p_user is null or p_thread is null or p_now is null or p_state is null or jsonb_typeof(p_state) <> 'object'
  or octet_length(p_state::text) > 65536 then raise exception 'invalid voice session'; end if;
 if not exists (select from public.agent_threads where id = p_thread and user_id = p_user) then raise exception 'thread not owned'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 35));
 delete from public.career_watch_kv where user_id = p_user and key like 'career:voice:%'
  and (value->>'created_at')::timestamptz < p_now - interval '2 days';
 if (select count(*) from public.career_watch_kv where user_id = p_user and key like 'career:voice:%'
     and (value->>'created_at')::timestamptz > p_now - interval '1 day') >= 5 then return null; end if;
 sid := gen_random_uuid();
 insert into public.career_watch_kv (user_id, key, value) values (p_user, 'career:voice:' || sid, jsonb_build_object(
  'v', 1, 'thread', p_thread, 'state', p_state, 'created_at', p_now, 'link_expires_at', p_now + interval '10 minutes'));
 return sid;
end $$;

create or replace function public.career_voice_start(p_user uuid, p_id uuid, p_now timestamptz, p_call_minutes int)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare st jsonb;
begin
 if p_user is null or p_id is null or p_now is null or p_call_minutes is null or p_call_minutes not between 5 and 60 then
  raise exception 'invalid voice start'; end if;
 update public.career_watch_kv
  set value = value || jsonb_build_object('started_at', p_now, 'call_expires_at', p_now + make_interval(mins => p_call_minutes)), updated_at = now()
  where user_id = p_user and key = 'career:voice:' || p_id
   and value->>'started_at' is null and value->>'fallback_at' is null and value->>'debriefed_at' is null
   and (value->>'link_expires_at')::timestamptz > p_now
  returning value->'state' into st;
 return st;
end $$;

create or replace function public.career_voice_finish(p_user uuid, p_id uuid, p_text text, p_now timestamptz)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; th uuid;
begin
 if p_user is null or p_id is null or p_now is null or p_text is null or length(p_text) not between 1 and 4000 then
  raise exception 'invalid voice debrief'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 35));
 select value into v from public.career_watch_kv where user_id = p_user and key = 'career:voice:' || p_id for update;
 if v is null or v->>'started_at' is null or v->>'debriefed_at' is not null or v->>'fallback_at' is not null
  or (v->>'call_expires_at')::timestamptz < p_now then return false; end if;
 th := (v->>'thread')::uuid;
 if not exists (select from public.agent_threads where id = th and user_id = p_user) then return false; end if;
 update public.career_watch_kv set value = value || jsonb_build_object('debriefed_at', p_now), updated_at = now()
  where user_id = p_user and key = 'career:voice:' || p_id;
 insert into public.agent_messages (thread_id, role, content, meta)
 values (th, 'assistant', p_text, jsonb_build_object('career', true, 'intent', 'career_mock_debrief', 'voice_session', p_id, 'proactive', true));
 if exists (select from public.channel_contacts where user_id = p_user and thread_id = th and not opted_out) then
  insert into public.career_outbox (user_id, key, kind, text, deliver_at) values (p_user, 'mock:' || p_id, 'mock', p_text, p_now)
  on conflict do nothing;
 end if;
 return true;
end $$;

create or replace function public.career_voice_fallback(p_user uuid, p_id uuid, p_state jsonb, p_text text, p_now timestamptz)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; th uuid;
begin
 if p_user is null or p_id is null or p_now is null or p_state is null or jsonb_typeof(p_state) <> 'object'
  or octet_length(p_state::text) > 65536 or p_text is null or length(p_text) not between 1 and 4000 then
  raise exception 'invalid voice fallback'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 35));
 select value into v from public.career_watch_kv where user_id = p_user and key = 'career:voice:' || p_id for update;
 if v is null or v->>'debriefed_at' is not null or v->>'fallback_at' is not null then return false; end if;
 if v->>'started_at' is null and (v->>'link_expires_at')::timestamptz <= p_now then return false; end if;
 if v->>'started_at' is not null and (v->>'call_expires_at')::timestamptz < p_now then return false; end if;
 th := (v->>'thread')::uuid;
 if not exists (select from public.agent_threads where id = th and user_id = p_user) then return false; end if;
 update public.career_watch_kv set value = value || jsonb_build_object('fallback_at', p_now), updated_at = now()
  where user_id = p_user and key = 'career:voice:' || p_id;
 insert into public.career_watch_kv (user_id, key, value) values (p_user, 'career:mock:' || th, p_state)
 on conflict (user_id, key) do update set value = excluded.value, updated_at = now();
 insert into public.agent_messages (thread_id, role, content, meta)
 values (th, 'assistant', p_text, jsonb_build_object('career', true, 'intent', 'career_mock', 'voice_session', p_id, 'proactive', true));
 if exists (select from public.channel_contacts where user_id = p_user and thread_id = th and not opted_out) then
  insert into public.career_outbox (user_id, key, kind, text, deliver_at) values (p_user, 'mock:' || p_id || ':text', 'mock', p_text, p_now)
  on conflict do nothing;
 end if;
 return true;
end $$;

revoke all on function public.career_voice_create(uuid, uuid, jsonb, timestamptz), public.career_voice_start(uuid, uuid, timestamptz, int),
 public.career_voice_finish(uuid, uuid, text, timestamptz), public.career_voice_fallback(uuid, uuid, jsonb, text, timestamptz)
 from public, anon, authenticated;
grant execute on function public.career_voice_create(uuid, uuid, jsonb, timestamptz), public.career_voice_start(uuid, uuid, timestamptz, int),
 public.career_voice_finish(uuid, uuid, text, timestamptz), public.career_voice_fallback(uuid, uuid, jsonb, text, timestamptz)
 to service_role;
