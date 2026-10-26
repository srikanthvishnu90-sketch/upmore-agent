-- F7 (2026-10-25): job alerts ranked by fit with a fit floor (career_alerts.ts fitFloorOk, career_alert_fit.ts). A person
-- may set min_fit, the lowest fit score (0 to 100, whole) they want alerted; the code checks it (career_alert_store.ts
-- validPrefs) and the table holds the same rule, as it does for every other alert setting (career_alert_prefs_shape).
-- Absent means no score floor: a posting the person's confirmed facts are knocked out of is still never alerted.
-- NOT APPLIED: the owner applies migrations. After 20261019010001 (the table). Idempotent: dropped and added again.
alter table public.career_alert_prefs drop constraint if exists career_alert_prefs_min_fit;
alter table public.career_alert_prefs add constraint career_alert_prefs_min_fit check ((
  not (prefs ? 'min_fit') or (jsonb_typeof(prefs->'min_fit') = 'number' and (prefs->>'min_fit') ~ '^([0-9]|[1-9][0-9]|100)$')) is true);
