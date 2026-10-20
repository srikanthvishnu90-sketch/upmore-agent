-- A text Trainee starts (an alert, a report, a receipt, a status line, a follow-up draft, a brief, the digest) becomes
-- part of the person's texting thread when it is delivered, as a pushed card already does. Before this, only the chat
-- turns and the card were written to agent_messages, so a prompt from days earlier stayed the thread's "last word":
-- a "yes" or "ok" the person sent about a receipt could be read as the answer to that older prompt (review 2026-10-20,
-- found on WO-039's cloud opt-in; every lastAssistantIntent check reads the same row). The brain also sees what was
-- sent, so "apply to the second one" after an alert has something to point at.
-- Written at delivery, not at queueing: a text held for quiet hours or WhatsApp's window is not in the thread until the
-- person could have read it. Kinds that already write their own thread message (card, reply, mock, link) are left out.
create or replace function public.career_outbox_to_thread() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare thread uuid;
begin
 select thread_id into thread from public.channel_contacts
  where user_id = new.user_id and thread_id is not null order by last_inbound_at desc nulls last, created_at limit 1;
 if thread is null then return new; end if;
 insert into public.agent_messages (thread_id, role, content, meta)
 values (thread, 'assistant', new.text,
   jsonb_build_object('career', true, 'intent', 'career_proactive', 'kind', new.kind, 'outbox_key', new.key, 'proactive', true));
 return new;
end $$;
revoke all on function public.career_outbox_to_thread() from public, anon, authenticated;
drop trigger if exists career_outbox_to_thread on public.career_outbox;
create trigger career_outbox_to_thread after update of status on public.career_outbox
 for each row when (new.status = 'delivered' and old.status is distinct from 'delivered'
   and new.kind in ('alert', 'report', 'receipt', 'status', 'followup', 'brief', 'digest'))
 execute function public.career_outbox_to_thread();
