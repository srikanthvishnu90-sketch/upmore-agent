-- WO-022: an application prepared on the person's own computer, shown on a card, approved by one text.
-- career_apply_prepared holds what the engine's dry run produced (the payload the queue will hold, and the card lines the
-- person reads); career_apply_cards records each card shown: which prepared applications, in which order, with which
-- hash. A yes enqueues exactly those payloads with career_apply_enqueue. Each operation exists twice: _own for the signed-in
-- person (their app or their computer), _as for the edge functions' service role acting for a texting contact. Both call one
-- internal function that nobody else may execute. The person reads their own rows; only these functions write.
create table if not exists public.career_apply_prepared (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 job_id text not null, company text not null, url text not null check (url ~ '^https?://'),
 payload jsonb not null check (octet_length(payload::text) <= 262144),
 payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
 card_lines text[] not null check (cardinality(card_lines) between 1 and 80),
 state text not null default 'ready' check (state in ('ready', 'shown', 'approved', 'declined', 'expired')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (user_id, job_id, payload_hash)
);
create table if not exists public.career_apply_cards (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 8),
 state text not null default 'open' check (state in ('open', 'answered')),
 shown_at timestamptz not null, answered_at timestamptz, answer jsonb
);
alter table public.career_apply_prepared enable row level security;
alter table public.career_apply_cards enable row level security;
revoke all on public.career_apply_prepared, public.career_apply_cards from public, anon, authenticated;
grant select on public.career_apply_prepared, public.career_apply_cards to authenticated;
grant all on public.career_apply_prepared, public.career_apply_cards to service_role;
drop policy if exists career_apply_prepared_owner_read on public.career_apply_prepared;
create policy career_apply_prepared_owner_read on public.career_apply_prepared for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists career_apply_cards_owner_read on public.career_apply_cards;
create policy career_apply_cards_owner_read on public.career_apply_cards for select to authenticated using ((select auth.uid()) = user_id);
create index if not exists career_apply_prepared_ready on public.career_apply_prepared (user_id, created_at) where state = 'ready';
create index if not exists career_apply_cards_open on public.career_apply_cards (user_id, shown_at desc) where state = 'open';

-- The person's computer stores what it prepared. The hash is computed here, never taken from the caller; the payload must
-- be the signed-in person's, for their current account (privacy epoch, version, expiry), and for a posting not already
-- applied to.
create or replace function public.career_apply_prepare_own(p_payload jsonb, p_card_lines text[])
returns public.career_apply_prepared language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare u uuid := auth.uid(); h text; r public.career_apply_prepared;
begin
 if u is null then raise exception 'not signed in'; end if;
 if p_payload->>'user_id' is distinct from u::text then raise exception 'not your application'; end if;
 if p_payload->>'version' is distinct from '1' or nullif(p_payload->>'job_id', '') is null or nullif(p_payload->>'company', '') is null
  or coalesce(p_payload->>'url', '') !~ '^https?://' or jsonb_typeof(p_payload->'fields') is distinct from 'array'
  or p_card_lines is null or cardinality(p_card_lines) not between 1 and 80
  or exists (select from unnest(p_card_lines) l where l is null or length(l) not between 1 and 600) then
  raise exception 'invalid prepared application'; end if;
 if public.career_apply_current(u, p_payload) is distinct from true then raise exception 'invalid or stale application approval'; end if;
 if exists (select from public.career_apply_jobs where user_id = u and job_id = p_payload->>'job_id') then raise exception 'duplicate_job'; end if;
 h := encode(sha256(convert_to(public.career_apply_canonical(p_payload), 'UTF8')), 'hex');
 insert into public.career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
 values (u, p_payload->>'job_id', p_payload->>'company', p_payload->>'url', p_payload, h, p_card_lines)
 on conflict (user_id, job_id, payload_hash) do update set updated_at = now()
 returning * into r;
 return r;
end $$;

-- A card: the given ready applications, numbered 1.. in the order given, each with the hash that was shown.
create or replace function public.career_apply_card_open_for(p_user uuid, p_ids uuid[], p_now timestamptz)
returns public.career_apply_cards language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.career_apply_cards; items jsonb;
begin
 if p_user is null or p_ids is null or cardinality(p_ids) not between 1 and 8 or p_now is null then raise exception 'invalid card'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 if (select count(*) from public.career_apply_prepared where user_id = p_user and state = 'ready' and id = any(p_ids)) <> cardinality(p_ids)
  or (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then raise exception 'invalid card'; end if;
 select jsonb_agg(jsonb_build_object('n', o.n, 'prepared_id', p.id, 'payload_hash', p.payload_hash) order by o.n) into items
  from unnest(p_ids) with ordinality as o(id, n) join public.career_apply_prepared p on p.id = o.id;
 update public.career_apply_prepared set state = 'shown', updated_at = p_now where id = any(p_ids);
 -- One open card per person: a newer card closes the older one (its applications stay shown, never approved by it).
 update public.career_apply_cards set state = 'answered', answered_at = p_now, answer = '{"closed":"a newer card was shown"}'
  where user_id = p_user and state = 'open';
 insert into public.career_apply_cards (user_id, items, shown_at) values (p_user, items, p_now) returning * into c;
 return c;
end $$;

-- The answer to a card: the numbers approved. Each approved application is enqueued exactly as shown (its stored payload,
-- its stored hash as the approval reference); each is its own attempt, so one refusal (the daily cap, a company in its
-- cooldown) does not undo the others. The rest are declined. A card answered already, or older than 24 hours, approves
-- nothing.
create or replace function public.career_apply_card_answer_for(p_user uuid, p_card uuid, p_approve int[], p_now timestamptz)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare c public.career_apply_cards; it jsonb; p public.career_apply_prepared; out jsonb := '[]'; res text; n int;
begin
 if p_user is null or p_card is null or p_now is null then raise exception 'invalid card answer'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text, 1));
 select * into c from public.career_apply_cards where id = p_card and user_id = p_user for update;
 if not found then raise exception 'invalid card answer'; end if;
 if c.state <> 'open' then raise exception 'card_answered'; end if;
 if c.shown_at < p_now - interval '24 hours' then raise exception 'card_expired'; end if;
 if exists (select from unnest(coalesce(p_approve, '{}')) a where a not between 1 and jsonb_array_length(c.items)) then
  raise exception 'not_on_card'; end if;
 for it in select * from jsonb_array_elements(c.items) loop
  n := (it->>'n')::int;
  select * into p from public.career_apply_prepared where id = (it->>'prepared_id')::uuid and user_id = p_user for update;
  if p.payload_hash is distinct from it->>'payload_hash' then res := 'changed';
  elsif n = any(coalesce(p_approve, '{}')) then
   begin
    perform public.career_apply_enqueue(p.payload, p.payload_hash, p.payload_hash, 15);
    res := 'queued';
   exception when others then
    res := case when sqlerrm like '%daily_cap%' then 'daily_cap' when sqlerrm like '%company_cooldown%' then 'company_cooldown'
     when sqlerrm like '%duplicate_job%' then 'duplicate' when sqlerrm like '%stale%' then 'stale' else 'refused' end;
   end;
  else res := 'declined'; end if;
  update public.career_apply_prepared set state = case res when 'queued' then 'approved' when 'stale' then 'expired' else 'declined' end, updated_at = p_now where id = p.id;
  out := out || jsonb_build_object('n', n, 'company', p.company, 'result', res);
 end loop;
 update public.career_apply_cards set state = 'answered', answered_at = p_now, answer = jsonb_build_object('approve', to_jsonb(coalesce(p_approve, '{}')), 'results', out) where id = c.id;
 return out;
end $$;

create or replace function public.career_apply_card_open_own(p_ids uuid[]) returns public.career_apply_cards
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_card_open_for(auth.uid(), p_ids, clock_timestamp()) $$;
create or replace function public.career_apply_card_answer_own(p_card uuid, p_approve int[]) returns jsonb
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_card_answer_for(auth.uid(), p_card, p_approve, clock_timestamp()) $$;
create or replace function public.career_apply_card_open_as(p_user uuid, p_ids uuid[]) returns public.career_apply_cards
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_card_open_for(p_user, p_ids, clock_timestamp()) $$;
create or replace function public.career_apply_card_answer_as(p_user uuid, p_card uuid, p_approve int[]) returns jsonb
language sql security definer set search_path = public, pg_temp as $$ select public.career_apply_card_answer_for(p_user, p_card, p_approve, clock_timestamp()) $$;

revoke all on function public.career_apply_prepare_own(jsonb, text[]), public.career_apply_card_open_for(uuid, uuid[], timestamptz),
 public.career_apply_card_answer_for(uuid, uuid, int[], timestamptz), public.career_apply_card_open_own(uuid[]),
 public.career_apply_card_answer_own(uuid, int[]), public.career_apply_card_open_as(uuid, uuid[]),
 public.career_apply_card_answer_as(uuid, uuid, int[]) from public, anon, authenticated, service_role;
grant execute on function public.career_apply_prepare_own(jsonb, text[]), public.career_apply_card_open_own(uuid[]),
 public.career_apply_card_answer_own(uuid, int[]) to authenticated;
grant execute on function public.career_apply_card_open_as(uuid, uuid[]), public.career_apply_card_answer_as(uuid, uuid, int[]) to service_role;
