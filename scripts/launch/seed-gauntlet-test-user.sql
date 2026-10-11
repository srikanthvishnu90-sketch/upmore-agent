-- Gauntlet test user (gauntlet-test@upmore.test, 2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3): Sam, saved on Venmo and on Zelle.
-- The handles are TEST handles on a reserved test domain, not a real person. source = 'confirmed' with the owner's
-- written instruction of 2026-10-11 as the evidence: these rows are an owner-confirmed save, not a completed send, and
-- say so. Idempotent: running it twice changes nothing. Run inside one transaction (scripts/launch/apply-rails-and-seed.sh).
insert into public.saved_recipients (user_id, handle, display_name, channel, source, rail, evidence_ref, last_used_at)
values
  ('2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3', '@sam-upmore-test', 'Sam', 'in-app', 'confirmed', 'venmo', 'owner-confirmed:2026-10-11:gauntlet-seed:venmo', now()),
  ('2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3', 'sam.test@upmore.test', 'Sam', 'in-app', 'confirmed', 'zelle', 'owner-confirmed:2026-10-11:gauntlet-seed:zelle', now() - interval '1 minute')
on conflict (user_id, (coalesce(rail, '')), (lower(handle))) where handle is not null do nothing;
