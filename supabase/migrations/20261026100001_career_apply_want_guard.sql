-- FEATURE 1 (2026-10-25): apply from chat. The chat's code-first apply turn ("apply to these", "apply to 1 and 3",
-- "apply to the X role at Y") writes the person's own apply queue (career_apply_wanted) through
-- career_apply_want_put_for, the store the brain's queue_applications uses. The turn screens each posting first; this
-- makes the employer rule hold in the database at the queue too, so a second writer or a race past the screens still
-- queues nothing it should not: one application per employer in 30 days, a posting whose employer is in the person's
-- one ledger (career_apply_ledger, every path's applications) in the last 30 days is refused 'company_cooldown'.
-- The person's own daily pace binds where an application is approved (career_apply_enqueue -> career_apply_ledger_refusal
-- 'daily_cap', 20261025140000) and is screened at the queue by the chat turn (queueWants); the queue itself takes what
-- they ask for (CAPS-1390, tests/db/career_apply_no_volume_ceiling.test.sql), so no pace is checked here.
-- A posting already in their queue stays as it was (not refused, not added). The result keeps its shape for every caller
-- ({ added: [...] }) and adds { refused: [{ posting_key, reason }] }. Nothing here approves, prepares or sends anything.
-- NOT APPLIED: the owner applies it. Idempotent (create or replace).
create or replace function public.career_apply_want_put_for(p_user uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare it jsonb; added text[] := '{}'; refused jsonb := '[]'; k text; co text;
begin
  if p_user is null or p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid apply queue items'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'at most 100 postings at once'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    k := null;
    if exists (select from public.career_apply_wanted w where w.user_id = p_user and w.posting_key = it->>'posting_key') then continue; end if;
    co := public.career_apply_company_key(coalesce(it->>'company', ''));
    if co <> '' and exists (select from public.career_apply_ledger(p_user, now() - interval '30 days') l where l.company_key = co) then
      refused := refused || jsonb_build_array(jsonb_build_object('posting_key', it->>'posting_key', 'reason', 'company_cooldown'));
      continue;
    end if;
    insert into public.career_apply_wanted (user_id, posting_key, url, company, title, queued_at)
    values (p_user, it->>'posting_key', it->>'url', coalesce(it->>'company', ''), coalesce(it->>'title', ''), coalesce((it->>'queued_at')::timestamptz, now()))
    on conflict (user_id, posting_key) do nothing
    returning posting_key into k;
    if k is not null then added := added || k; end if;
  end loop;
  return jsonb_build_object('added', to_jsonb(added), 'refused', refused);
end $$;
revoke all on function public.career_apply_want_put_for(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.career_apply_want_put_for(uuid, jsonb) to service_role;
