-- 2026-09-28: atomic caller-owned lesson upsert.
-- recordChatLesson() in agent-chat runs with the anon key + user JWT, so the
-- plain UPDATE on agent_lessons was RLS-denied (no UPDATE policy) and
-- repeated lessons silently failed to increment times_seen. This SECURITY
-- DEFINER RPC performs the dedupe/increment atomically and only ever touches
-- the caller's own rows (user_id = auth.uid()), so no UPDATE policy is needed.
create or replace function public.record_agent_lesson(
  p_kind text, p_scope text, p_category text, p_title text,
  p_what_happened text, p_what_to_do_instead text, p_signal text default ''
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Non-correction lessons dedupe against the caller's open lesson for the
  -- same scope+category: bump times_seen instead of inserting a duplicate.
  if p_kind <> 'user_correction' then
    select id into v_id
      from public.agent_lessons
      where resolved = false
        and user_id = auth.uid()
        and scope = p_scope
        and category = p_category
      limit 1;
    if found then
      update public.agent_lessons
        set times_seen = coalesce(times_seen, 1) + 1,
            what_happened = left(p_what_happened, 500),
            signal = left(p_signal, 200),
            updated_at = now()
        where id = v_id
          and user_id = auth.uid();
      return v_id;
    end if;
  end if;
  -- user_correction lessons always insert a fresh row (each correction is its
  -- own event), as do first-seen non-correction lessons.
  insert into public.agent_lessons
    (user_id, kind, scope, category, title, what_happened, what_to_do_instead, signal)
  values
    (auth.uid(), p_kind, p_scope, p_category,
     left(p_title, 200), left(p_what_happened, 500),
     left(p_what_to_do_instead, 500), left(p_signal, 200))
  returning id into v_id;
  return v_id;
end;
$$;

-- The function enforces caller-ownership internally via auth.uid(); grant
-- execute to authenticated so the edge function (anon key + user JWT) can
-- call it. No broader grant: it must never run as service_role callers.
grant execute on function public.record_agent_lesson(text, text, text, text, text, text, text) to authenticated;
