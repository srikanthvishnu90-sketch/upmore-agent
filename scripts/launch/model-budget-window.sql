-- OWNER-RUN. Opens ONE approved model-budget window (the migration seeds 2026-10-29 $20; this moves to another approved one).
-- Hard cap, fail closed: a call outside [start, end) is refused, a window with no row below spends nothing, no rollover.
--   Today's testing window (owner, 2026-10-28), $15.00, Chicago now -> 2026-10-29T00:00:
--     psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -v start=2026-10-28T00:00:00-05:00 -v end=2026-10-29T00:00:00-05:00 -v day=2026-10-28 -v micros=15000000 -f scripts/launch/model-budget-window.sql
--   Then at 2026-10-29T00:00 Chicago, the second approved window, $20.00 (the migration's own seed):
--     psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -v start=2026-10-29T00:00:00-05:00 -v end=2026-10-30T00:00:00-05:00 -v day=2026-10-29 -v micros=20000000 -f scripts/launch/model-budget-window.sql
-- The row for `day` is created if absent and its limit set; spent/reserved already on a row are kept (never reset). Prints the row.
\set ON_ERROR_STOP on
begin;
insert into public.model_budget_days (day, limit_micros) values (:'day'::date, :'micros'::bigint)
  on conflict (day) do update set limit_micros = excluded.limit_micros, updated_at = now();
insert into public.model_budget_settings (key, value) values ('budget_limit_micros', :'micros'), ('window_start', :'start'), ('window_end', :'end')
  on conflict (key) do update set value = excluded.value, updated_at = now();
commit;
select day, limit_micros, spent_micros, reserved_micros from public.model_budget_days order by day;
select key, value from public.model_budget_settings where key like 'window_%' or key = 'budget_limit_micros' order by key;
