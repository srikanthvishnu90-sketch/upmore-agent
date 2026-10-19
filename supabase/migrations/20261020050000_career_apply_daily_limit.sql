-- The daily application limit, raised by the owner (2026-10-19: "yes i raise the cap from higher then 15, as long as the
-- capability to rapidly apply to a role is there"). Back to D-011's numbers: 25 a day by default, and a person may set
-- their own up to 50 (the account's "daily_limit"; nothing lower than 1). The queue refuses anything above 50 whatever the
-- caller asks; one per company per 30 days and one per posting are unchanged. A card's yes enqueues under the person's own
-- limit.
create or replace function public.career_apply_daily_limit(p_user uuid) returns integer
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
 return greatest(1, least(50, coalesce((select case when value->>'daily_limit' ~ '^[0-9]{1,3}$' then (value->>'daily_limit')::int end
  from public.career_watch_kv where user_id = p_user and key = 'career:account'), 25)));
end $$;
revoke all on function public.career_apply_daily_limit(uuid) from public, anon, authenticated;
grant execute on function public.career_apply_daily_limit(uuid) to service_role;

create or replace function public.career_apply_enqueue(p_payload jsonb,p_hash text,p_approval text,p_daily integer default 25)
returns public.career_apply_jobs language plpgsql set search_path=public,extensions,pg_temp as $$
declare u uuid:=(p_payload->>'user_id')::uuid; j public.career_apply_jobs; co text; counted text[]:=array['queued','driving','confirmed','submitted_unconfirmed','needs_user','unknown_outcome'];
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if p_payload->>'version' is distinct from '1' or nullif(p_payload->>'job_id','') is null or nullif(p_payload->>'company','') is null
 or coalesce(p_payload->>'url','') !~ '^https?://' or jsonb_typeof(p_payload->'fields') is distinct from 'array' or p_daily is null or p_daily not between 1 and 50
 or p_approval is distinct from p_hash or p_hash is distinct from encode(sha256(convert_to(public.career_apply_canonical(p_payload),'UTF8')),'hex')
 or public.career_apply_current(u,p_payload) is distinct from true then raise exception 'invalid or stale application approval'; end if;
 if exists(select from public.career_apply_jobs where user_id=u and job_id=p_payload->>'job_id') then raise exception 'duplicate_job'; end if;
 co:=trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(p_payload->>'company'),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g'));
 if co<>'' and exists(select from public.career_apply_jobs where user_id=u and state=any(counted) and created_at>now()-interval '30 days'
 and trim(regexp_replace(regexp_replace(regexp_replace(replace(lower(company),'&',' and '),'[^a-z0-9 ]',' ','g'),'\m(inc|llc|ltd|corp|corporation|co|company|the)\M',' ','g'),'\s+',' ','g'))=co) then raise exception 'company_cooldown'; end if;
 if (select count(*) from public.career_apply_jobs where user_id=u and state=any(counted) and created_at>now()-interval '1 day')>=p_daily then raise exception 'daily_cap'; end if;
 insert into public.career_apply_jobs(user_id,job_id,company,url,payload,payload_hash,approval_hash)
 values(u,p_payload->>'job_id',p_payload->>'company',p_payload->>'url',p_payload,p_hash,p_approval) returning * into j; return j;
end $$;

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
    perform public.career_apply_enqueue(p.payload, p.payload_hash, p.payload_hash, public.career_apply_daily_limit(p_user));
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
