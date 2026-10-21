-- WO-066: from chat to applying. The postings the person asked Trainee to apply to, waiting for the Trainee extension to
-- take them into its queue, prepare each in the person's browser and show a card. Nothing here is an application: an
-- application exists only when the person approves its card (career_apply_extension_begin_own, career_apply_jobs).
-- One row per posting per person, keyed exactly as the extension keys it (family:tenant:id). The person reads their own
-- rows; only the chat (service role, career_apply_want_put_for) writes them; the extension marks its own taken
-- (career_apply_want_take_own). Erased with the person (profiles cascade).
create table if not exists public.career_apply_wanted (
  user_id uuid not null references public.profiles(id) on delete cascade,
  posting_key text not null check (char_length(posting_key) between 3 and 300),
  url text not null check (url ~ '^https://' and char_length(url) <= 2000),
  company text not null default '' check (char_length(company) <= 200),
  title text not null default '' check (char_length(title) <= 200),
  state text not null default 'waiting' check (state in ('waiting', 'taken')),
  queued_at timestamptz not null default now(),
  taken_at timestamptz,
  unique (user_id, posting_key)
);
create index if not exists career_apply_wanted_user_state on public.career_apply_wanted (user_id, state, queued_at);

alter table public.career_apply_wanted enable row level security;
drop policy if exists career_apply_wanted_owner_read on public.career_apply_wanted;
create policy career_apply_wanted_owner_read on public.career_apply_wanted for select to authenticated using (auth.uid() = user_id);
revoke all on public.career_apply_wanted from anon, authenticated;
grant select on public.career_apply_wanted to authenticated;

-- The chat puts postings for the person whose conversation it is. Returns the keys that were new.
create or replace function public.career_apply_want_put_for(p_user uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare it jsonb; added text[] := '{}'; k text;
begin
  if p_user is null or p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid apply queue items'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'at most 100 postings at once'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.career_apply_wanted (user_id, posting_key, url, company, title, queued_at)
    values (p_user, it->>'posting_key', it->>'url', coalesce(it->>'company', ''), coalesce(it->>'title', ''), coalesce((it->>'queued_at')::timestamptz, now()))
    on conflict (user_id, posting_key) do nothing
    returning posting_key into k;
    if k is not null then added := added || k; end if;
    k := null;
  end loop;
  return jsonb_build_object('added', to_jsonb(added));
end $$;
revoke all on function public.career_apply_want_put_for(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.career_apply_want_put_for(uuid, jsonb) to service_role;

-- The extension, signed in as the person, marks the postings it took into its queue.
create or replace function public.career_apply_want_take_own(p_keys text[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid(); n integer;
begin
  if u is null then raise exception 'not signed in'; end if;
  update public.career_apply_wanted set state = 'taken', taken_at = now()
   where user_id = u and state = 'waiting' and posting_key = any(coalesce(p_keys, '{}'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.career_apply_want_take_own(text[]) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_want_take_own(text[]) to authenticated;
