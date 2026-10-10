-- Every model request reserves an atomic slot, including the separate rounds
-- of a financial tool plan. Existing legacy usage remains in the same quota.
create table if not exists public.agent_model_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  request_id uuid not null, step integer not null check(step between 0 and 15),
  model text not null check(length(model) between 1 and 100),
  state text not null default 'reserved' check(state in ('reserved','recorded')),
  usage jsonb, created_at timestamptz not null default now(),
  unique(user_id,request_id,step),
  check((state='reserved' and usage is null) or (state='recorded' and usage is not null and jsonb_typeof(usage)='object'))
);
create index if not exists agent_model_calls_user_month on public.agent_model_calls(user_id,created_at);
alter table public.agent_usage add column if not exists call_id uuid references public.agent_model_calls(id) on delete cascade;
create unique index if not exists agent_usage_call_id on public.agent_usage(call_id) where call_id is not null;
alter table public.agent_model_calls enable row level security;
revoke all on public.agent_model_calls from anon,authenticated;
grant select on public.agent_model_calls to authenticated;
grant all on public.agent_model_calls to service_role;
drop policy if exists agent_model_call_owner on public.agent_model_calls;
create policy agent_model_call_owner on public.agent_model_calls for select using(auth.uid()=user_id);

create or replace function public.agent_model_call_reserve(p_user uuid,p_thread uuid,p_request uuid,p_step integer,p_model text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare old public.agent_model_calls; slot public.agent_model_calls; n bigint;
begin
  if p_user is null or p_thread is null or p_request is null or p_step is null or p_step not between 0 and 15
    or p_model is null or length(p_model) not between 1 and 100 then raise exception 'invalid model reservation'; end if;
  perform 1 from auth.users where id=p_user for update;
  if not found or not exists(select 1 from public.agent_threads where id=p_thread and user_id=p_user)
    then raise exception 'conversation owner mismatch'; end if;
  select * into old from public.agent_model_calls where user_id=p_user and request_id=p_request and step=p_step;
  if found then
    if old.thread_id<>p_thread or old.model<>p_model then raise exception 'model reservation changed'; end if;
    return jsonb_build_object('ok',false,'state','already_reserved','call_id',old.id);
  end if;
  select (select count(*) from public.agent_model_calls where user_id=p_user and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')+
    (select count(*) from public.agent_usage where user_id=p_user and call_id is null and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC') into n;
  if n>=900 then return jsonb_build_object('ok',false,'state','monthly_limit'); end if;
  insert into public.agent_model_calls(user_id,thread_id,request_id,step,model) values(p_user,p_thread,p_request,p_step,p_model) returning * into slot;
  return jsonb_build_object('ok',true,'state','reserved','call_id',slot.id);
end;
$$;

create or replace function public.agent_model_call_record(p_call uuid,p_usage jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare slot public.agent_model_calls; k text; amount bigint;
begin
  select * into slot from public.agent_model_calls where id=p_call for update;
  if not found then raise exception 'model reservation unavailable'; end if;
  if jsonb_typeof(p_usage) is distinct from 'object' then raise exception 'invalid token usage'; end if;
  if (select count(*) from jsonb_object_keys(p_usage))<>4 then raise exception 'invalid token usage'; end if;
  foreach k in array array['input_tokens','output_tokens','cache_read_tokens','cache_write_tokens'] loop
    if jsonb_typeof(p_usage->k) is distinct from 'number' or (p_usage->>k)!~'^[0-9]+$' then raise exception 'invalid token usage'; end if;
    amount:=(p_usage->>k)::bigint;
    if amount>10000000 then raise exception 'invalid token usage'; end if;
  end loop;
  if slot.state='recorded' then
    if slot.usage is distinct from p_usage then raise exception 'conflicting token usage'; end if;
    return;
  end if;
  update public.agent_model_calls set state='recorded',usage=p_usage where id=p_call;
  insert into public.agent_usage(user_id,thread_id,model,call_id,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens)
    values(slot.user_id,slot.thread_id,slot.model,slot.id,(p_usage->>'input_tokens')::integer,(p_usage->>'output_tokens')::integer,
      (p_usage->>'cache_read_tokens')::integer,(p_usage->>'cache_write_tokens')::integer);
end;
$$;
revoke all on function public.agent_model_call_reserve(uuid,uuid,uuid,integer,text),public.agent_model_call_record(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agent_model_call_reserve(uuid,uuid,uuid,integer,text),public.agent_model_call_record(uuid,jsonb) to service_role;
