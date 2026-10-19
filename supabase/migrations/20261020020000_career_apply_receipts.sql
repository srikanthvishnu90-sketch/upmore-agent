-- WO-021 step 5: the receipt. Each finished application is said once in the person's thread, through the same outbox
-- as alerts, reports and replies (one row per key, ever; delivery unchanged). Every kind 20261019030000 allows stays. The outbox learns the kind "receipt" with keys
-- "receipt:<application id>", and every scheduled run records how many receipts it queued.
alter table public.career_outbox drop constraint if exists career_outbox_key_check;
alter table public.career_outbox add constraint career_outbox_key_check
  check (key ~ '^(alert|report|reply|receipt):.+$' and length(key) <= 310);
alter table public.career_outbox drop constraint if exists career_outbox_kind_check;
alter table public.career_outbox add constraint career_outbox_kind_check check (kind in ('alert', 'report', 'reply', 'receipt'));
alter table public.career_proactive_runs add column if not exists receipts int not null default 0 check (receipts >= 0);
