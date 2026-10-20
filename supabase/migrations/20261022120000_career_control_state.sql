-- WO-091c: the person's control state reaches what Trainee does on its own.
-- career_user_quiet(user) is the one predicate every scheduled rail reads: true while the account is paused (career:account
-- paused, set by "stop everything", by STOP to the career host, and by every erase, which pauses the account) or while
-- any of the person's texting contacts is opted out (STOP on iMessage, WhatsApp or Telegram, or blocking the bot).
-- career_quiet_users(users) is the same for a list, so a run asks once per rail.
-- career_outreach_claim (20261021010000_career_outreach.sql) is redefined with two more refusals and is otherwise the
-- same, check for check: 'expired' when the approval is more than 7 days old (anchored on the later of the approval and
-- the draft, which are equal in practice: a draft is approved after it is drafted), and 'paused' while the person is
-- quiet. A refusal changes nothing; the run drops an expired draft and leaves a paused one approved, so a resume inside the
-- 7 days lets it go and nothing older ever does.
-- career_proactive_runs gains errors: each rail's failure this run, by rail ({"mail": "...", "cards": "..."}), so one
-- rail's failure is recorded without hiding what the others did.
-- Idempotent: every statement can run twice.

create or replace function public.career_user_quiet(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select w.value->'paused' = 'true'::jsonb from public.career_watch_kv w
                   where w.user_id = p_user and w.key = 'career:account'), false)
      or exists (select 1 from public.channel_contacts c where c.user_id = p_user and c.opted_out)
$$;
revoke all on function public.career_user_quiet(uuid) from public, anon, authenticated;
grant execute on function public.career_user_quiet(uuid) to service_role;

create or replace function public.career_quiet_users(p_users uuid[]) returns table (user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct u from unnest(coalesce(p_users, '{}'::uuid[])) u where u is not null and public.career_user_quiet(u)
$$;
revoke all on function public.career_quiet_users(uuid[]) from public, anon, authenticated;
grant execute on function public.career_quiet_users(uuid[]) to service_role;

create or replace function public.career_outreach_claim(p_user uuid, p_draft uuid, p_hash text, p_now timestamptz, p_day_start timestamptz)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.career_outreach_drafts; cap int; first_at timestamptz; today int;
begin
 if p_user is null or p_draft is null or p_hash is null or p_now is null or p_day_start is null
  or p_day_start > p_now or p_day_start < p_now - interval '26 hours' then raise exception 'invalid outreach claim'; end if;
 perform pg_advisory_xact_lock(hashtextextended('career_outreach:' || p_user::text, 0));
 select * into d from public.career_outreach_drafts where id = p_draft and user_id = p_user for update;
 if not found or d.status <> 'approved' or d.approved_hash is null then return 'not_approved'; end if;
 if d.approved_hash <> p_hash or d.hash <> p_hash then return 'changed'; end if;
 -- WO-091c: an approval lasts 7 days; a paused, opted-out or erased account sends nothing.
 if greatest(d.approved_at, d.created_at) < p_now - interval '7 days' then return 'expired'; end if;
 if public.career_user_quiet(p_user) then return 'paused'; end if;
 -- Do-not-contact is checked across every Trainee user: a "stop" to anyone stops everyone's drafts to that address.
 if exists (select 1 from public.career_outreach_dnc
   where email_hash = encode(sha256(convert_to(lower(d.recipient_email), 'UTF8')), 'hex')) then return 'do_not_contact'; end if;
 -- At most 3 Trainee-drafted emails reach one recipient in 30 days, from all users together (lock on the recipient so two
 -- people's runs cannot both take the third slot).
 perform pg_advisory_xact_lock(hashtextextended('career_outreach_to:' || lower(d.recipient_email), 0));
 if (select count(*) from public.career_outreach_drafts where lower(recipient_email) = lower(d.recipient_email)
   and status in ('sending', 'sent', 'replied', 'bounced') and sent_at > p_now - interval '30 days' and sent_at <= p_now) >= 3
   then return 'recipient_cap'; end if;
 cap := coalesce((select least(greatest(daily_cap, 1), 30) from public.career_outreach_prefs where user_id = p_user), 20);
 select min(sent_at) into first_at from public.career_outreach_drafts
  where user_id = p_user and sent_at is not null and status in ('sending', 'sent', 'replied', 'bounced');
 if first_at is null or p_now < first_at + interval '7 days' then cap := least(cap, 10); end if;
 select count(*) into today from public.career_outreach_drafts
  where user_id = p_user and status in ('sending', 'sent', 'replied', 'bounced') and sent_at >= p_day_start and sent_at <= p_now;
 if today >= cap then return 'daily_cap'; end if;
 if exists (select 1 from public.career_outreach_drafts where user_id = p_user and status in ('sending', 'sent', 'replied', 'bounced')
   and sent_at > p_now - interval '90 seconds' and sent_at <= p_now) then return 'spacing'; end if;
 update public.career_outreach_drafts set status = 'sending', sent_at = p_now, updated_at = now() where id = d.id;
 return 'ok';
end $$;
revoke all on function public.career_outreach_claim(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.career_outreach_claim(uuid, uuid, text, timestamptz, timestamptz) to service_role;

alter table public.career_proactive_runs add column if not exists errors jsonb
  check (errors is null or (jsonb_typeof(errors) = 'object' and octet_length(errors::text) <= 16384));
