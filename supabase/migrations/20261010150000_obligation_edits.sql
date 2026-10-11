-- Authenticated, version-bound edits of user assertions. This does not grant
-- payment authority or change biller-owned evidence. Receipts survive retries.
create table if not exists public.agent_obligation_edits (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, obligation_id uuid not null,
 request jsonb not null, before_snapshot jsonb not null, after_snapshot jsonb not null,
 created_at timestamptz not null default now(), primary key(user_id,request_id)
);
alter table public.agent_obligation_edits enable row level security;
drop policy if exists obligation_edits_owner_read on public.agent_obligation_edits;
create policy obligation_edits_owner_read on public.agent_obligation_edits for select using(auth.uid()=user_id);
revoke all on public.agent_obligation_edits from public,anon,authenticated,service_role;
grant select on public.agent_obligation_edits to authenticated;
drop trigger if exists obligation_edits_immutable on public.agent_obligation_edits;
create trigger obligation_edits_immutable before update or delete on public.agent_obligation_edits
 for each row execute function public.agent_financial_evidence_immutable();
drop trigger if exists obligation_edits_no_truncate on public.agent_obligation_edits;
create trigger obligation_edits_no_truncate before truncate on public.agent_obligation_edits
 for each statement execute function public.agent_financial_evidence_immutable();

create or replace function public.agent_obligation_edit(p_request uuid,p_obligation uuid,p_expected_revision integer,p_fields jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); o public.agent_obligations; prior public.agent_obligation_edits;
 req jsonb; before_row jsonb; cents bigint; due date;
begin
 if uid is null then raise exception 'authenticated bill owner required';end if;
 if p_request is null or p_obligation is null or p_expected_revision is null or p_expected_revision<1
 or p_expected_revision>=2147483647 or jsonb_typeof(p_fields) is distinct from 'object'
 or (p_fields-array['creditor','kind','direction','currency','amount_due_cents','due_on','autopay'])<>'{}'::jsonb
 or not p_fields ?& array['creditor','kind','direction','currency','amount_due_cents','due_on','autopay']
 or jsonb_typeof(p_fields->'creditor') is distinct from 'string'
 or length(p_fields->>'creditor') not between 1 and 160
 or (p_fields->>'creditor') ~ '[[:cntrl:]]'
 or btrim(p_fields->>'creditor') is distinct from p_fields->>'creditor'
 or p_fields->>'kind' not in ('rent','utility','installment','credit','tax','medical','invoice','insurance','informal','other')
 or jsonb_typeof(p_fields->'kind') is distinct from 'string'
 or p_fields->>'direction' is distinct from 'payable' or p_fields->>'currency' is distinct from 'USD'
 or jsonb_typeof(p_fields->'amount_due_cents') is distinct from 'number'
 or (p_fields->>'amount_due_cents') !~ '^[0-9]{1,16}$'
 or jsonb_typeof(p_fields->'due_on') is distinct from 'string'
 or (p_fields->>'due_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 or jsonb_typeof(p_fields->'autopay') is distinct from 'string'
 or p_fields->>'autopay' not in ('on','off','unknown') then raise exception 'invalid reviewed bill fields';end if;
 cents:=(p_fields->>'amount_due_cents')::bigint;
 if cents not between 1 and 9007199254740991 then raise exception 'invalid reviewed bill amount';end if;
 due:=(p_fields->>'due_on')::date;
 if to_char(due,'YYYY-MM-DD')<>p_fields->>'due_on' then raise exception 'invalid reviewed bill date';end if;
 req:=jsonb_build_object('obligation_id',p_obligation,'expected_revision',p_expected_revision,'fields',p_fields);
 -- Same order as execution: settings -> obligation -> task. The owner lock
 -- also serializes receipt IDs used against different obligations.
 perform user_id from public.agent_settings where user_id=uid for update;
 perform pg_advisory_xact_lock(hashtextextended('bill-edit:'||uid::text,0));
 select * into o from public.agent_obligations where id=p_obligation and user_id=uid for update;
 if not found then raise exception 'bill unavailable';end if;
 select * into prior from public.agent_obligation_edits where user_id=uid and request_id=p_request;
 if found then
  if prior.request is distinct from req then raise exception 'bill edit request changed';end if;
  return jsonb_build_object('ok',true,'obligation',prior.after_snapshot,'replay',true,
   'current_revision',o.revision,'superseded',o.revision<>(prior.after_snapshot->>'revision')::integer);
 end if;
 if o.revision<>p_expected_revision then raise exception 'bill changed; reload the current version';end if;
 if o.source_type<>'user' or o.currency<>'USD' or o.direction<>'payable'
 or o.status not in ('asserted','verified','disputed','partially_paid') then raise exception 'bill is not editable here';end if;
 if exists(select 1 from public.agent_payment_attempts where user_id=uid and obligation_id=o.id
 and status in ('reserved','submitted','processing','settled','unknown')) then
  raise exception 'payment unresolved; reconcile before editing this bill';end if;
 before_row:=to_jsonb(o);
 update public.agent_obligations set creditor=p_fields->>'creditor',kind=p_fields->>'kind',
  amount_due_cents=cents,due_on=due,autopay=p_fields->>'autopay',status='verified',observed_at=now(),
  minimum_due_cents=null,balance_cents=null,provider_key=null,provider_account_id=null,reference=null,
  funding_account_id=null,biller_url=null,
  evidence=evidence||jsonb_build_object('user_confirmed',true,'last_user_edit_request_id',p_request)
 where id=o.id and user_id=uid returning * into o;
 -- The existing revision trigger invalidates all earlier workflow approvals.
 insert into public.agent_obligation_edits(user_id,request_id,obligation_id,request,before_snapshot,after_snapshot)
 values(uid,p_request,o.id,req,before_row,to_jsonb(o));
 insert into public.agent_workflow_events(user_id,obligation_id,event,evidence)
 values(uid,o.id,'user_bill_edited',jsonb_build_object('request_id',p_request,'revision',o.revision));
 return jsonb_build_object('ok',true,'obligation',to_jsonb(o),'replay',false,'current_revision',o.revision,'superseded',false);
end $$;
revoke all on function public.agent_obligation_edit(uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.agent_obligation_edit(uuid,uuid,integer,jsonb) to authenticated;
