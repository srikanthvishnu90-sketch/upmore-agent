-- The owner-only real-world checks (docs/architect/LIVE-VERIFICATION-PLAN-2026-10-26.md, section 4). Each one is a real
-- effect on the world (an employer receives an application, Google grants mail access, an email or a text arrives)
-- that the suite must not cause as a test account. Do the steps in the plan, then run that check's queries in
-- Supabase > SQL Editor with your own email in place of YOUR_EMAIL. Every query is a read.

-- ============================================================================================== O-1 Ramp via Telegram
-- (a) the Telegram turns ran as you
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select m.role, left(m.content, 120) as said, m.created_at
  from agent_messages m join channel_contacts c on c.thread_id = m.thread_id, me
 where c.user_id = me.id and c.channel = 'telegram' order by m.id desc limit 12;
-- (b) queued, prepared and hash-bound, on a card with the same hash
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select p.job_id, p.state, p.payload_hash,
       p.payload_hash = encode(sha256(convert_to(public.career_apply_canonical(p.payload), 'UTF8')), 'hex') as payload_bound,
       exists(select 1 from career_apply_cards c, jsonb_array_elements(c.items) it where c.user_id = p.user_id and it->>'payload_hash' = p.payload_hash) as on_card
  from career_apply_prepared p, me where p.user_id = me.id and p.url ilike '%ashbyhq.com/ramp/%' order by p.updated_at desc;
-- (c) approved exactly and sent: approval_hash = payload_hash, a terminal state, the employer's confirmation id
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select j.id, j.state, j.approval_hash = j.payload_hash as approved_exactly, j.source, j.confirmation_id, j.email_confirmed_at, j.updated_at
  from career_apply_jobs j, me where j.user_id = me.id and j.url ilike '%ashbyhq.com/ramp/%';
-- (d) the receipt agrees with the job (F14), and holds the proof pictures
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select r.state = j.state as same_state, r.payload_hash = j.payload_hash as same_payload, r.reached_employer, r.confirmation_id,
       (select count(*) from career_apply_receipt_files f where f.application_id = r.application_id and f.bound) as pictures
  from career_apply_receipts r join career_apply_jobs j on j.id = r.application_id, me where j.user_id = me.id and j.url ilike '%ashbyhq.com/ramp/%';
-- PASS: (a) your messages and replies; (b) payload_bound and on_card true; (c) approved_exactly true and state
-- submitted_unconfirmed or confirmed; (d) same_state and same_payload true, reached_employer yes, pictures 2. In the
-- world: Ramp's "application received" email in your inbox, and Ramp's page shows the application.

-- ============================================================================================== O-2 Gmail connect
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select o.provider, o.email, o.scopes, o.connected_at,
       o.scopes like '%gmail.readonly%' as can_read, o.scopes like '%gmail.send%' as can_send,
       (select read_through from career_mail_cursors c where c.user_id = me.id) as mail_read_through,
       (select count(*) from career_mail_events e where e.user_id = me.id) as mail_events
  from user_oauth_connections o, me where o.user_id = me.id and (o.provider ilike '%google%' or o.provider ilike '%gmail%');
-- PASS: one row for your Google account, can_read true (can_send true for O-3), mail_read_through after you said
-- "check my email now", and the Ramp confirmation from O-1 as a mail event:
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select e.kind, e.company, e.stage, e.mail_at from career_mail_events e, me where e.user_id = me.id order by e.detected_at desc limit 10;

-- ============================================================================================== O-3 outreach to yourself
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select d.recipient_email, d.subject, d.status, d.hash, d.approved_hash, d.approved_hash = d.hash as approved_exactly, d.sent_at, d.gmail_id is not null as gmail_took_it
  from career_outreach_drafts d, me where d.user_id = me.id order by d.created_at desc limit 5;
-- PASS: the draft to your own address has status sent, approved_exactly true, sent_at set, gmail_took_it true. In the
-- world: the email is in your inbox, From your Gmail, with exactly the body the card showed (no Cc, no Bcc).

-- ============================================================================================== O-4 an alert you receive
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select o.key, o.status, o.channel, o.delivered_at, o.created_at, p.title, p.company, p.closed_at is null as posting_open, left(o.text, 140) as text
  from career_outbox o left join career_postings p on p.job_id = substr(o.key, 7), me
 where o.user_id = me.id and o.kind = 'alert' order by o.id desc limit 5;
-- PASS: status delivered with delivered_at, a posting that is open and matches your watch, and the same text arrived
-- on your phone (Telegram or iMessage) within minutes of delivered_at.

-- ============================================================================================== O-5 an interview mock
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select e.at, e.subject, jsonb_array_length(e.detail->'answers') as answers,
       (select string_agg(a->>'skill', ', ') from jsonb_array_elements(e.detail->'answers') a where (a->>'weak')::boolean) as weak
  from career_events e, me where e.user_id = me.id and e.kind = 'mock_done' order by e.at desc limit 3;
-- PASS: one mock_done for the posting you named, its weak skills equal the debrief's "Weak spots kept for a drill",
-- and "drill my weak spots" in a new thread asks exactly those. Judged by you: were the questions about that posting.

-- ============================================================================================== O-6 a supervised Greenhouse submit (F2)
with me as (select id from auth.users where email = 'YOUR_EMAIL')
select j.url, j.state, j.approval_hash = j.payload_hash as approved_exactly, j.confirmation_id,
       jsonb_array_length(coalesce(j.evidence->'stopped_requests', '[]'::jsonb)) as stopped_requests, j.reason
  from career_apply_jobs j, me where j.user_id = me.id and j.url ~* 'greenhouse\.io' order by j.updated_at desc limit 3;
-- PASS: state submitted_unconfirmed or confirmed, approved_exactly true, a confirmation id from the employer's page;
-- a SUBMIT_DESTINATION_UNEXPECTED or APPROVED_BODY_MISMATCH reason means the binding stopped it and nothing was sent.
