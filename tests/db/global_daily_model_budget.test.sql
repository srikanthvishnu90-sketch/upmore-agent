-- SQL tests for 20261028070000_global_daily_model_budget.sql. The concurrency proof (200 simultaneous reservations against $20)
-- is tests/architect/global-daily-budget.test.ts, which needs real parallel sessions; this file checks the single-session rules.
-- The budget is the one day 2026-10-29 America/Chicago ($20); the test passes the instant it asks at (p_now).
begin;
reset role;
set role service_role;
select t.ok((select value = '20000000' from public.model_budget_settings where key = 'budget_limit_micros'), 'the limit is $20 in micro-dollars');
select t.ok((select count(*) = 1 and min(day) = date '2026-10-29' from public.model_budget_days), 'the migration made exactly one budget row, for 2026-10-29');
select t.ok((public.model_budget_reserve(1, 'gpt-5', 'chat', '2026-10-29T04:59:59Z') ->> 'state') = 'before_window', '10-28 23:59:59 Chicago is refused');
select t.ok((public.model_budget_reserve(1, 'gpt-5', 'chat', '2026-10-30T05:00:00Z') ->> 'state') = 'after_window', '10-30 00:00:00 Chicago is refused');
select t.ok((public.model_budget_reserve(15000000, 'gpt-5', 'chat', '2026-10-29T05:00:00Z') ->> 'ok')::boolean, '10-29 00:00:00 Chicago is allowed');
select t.ok((public.model_budget_reserve(5000001, 'gpt-5', 'chat', '2026-10-29T05:00:30Z') ->> 'state') = 'limit', 'one micro-dollar over the limit is refused');
select t.ok((public.model_budget_reserve(5000000, 'gpt-5', 'chat', '2026-10-29T05:00:30Z') ->> 'ok')::boolean, 'an exact fit is granted');
select t.ok((select spent_micros = 0 and reserved_micros = 20000000 from public.model_budget_days where day = '2026-10-29'), 'the day holds reserved + spent, never more than the limit');
select t.ok((select count(*) = 1 from public.founder_alerts where kind = 'model_budget_exhausted'), 'the first refusal at the limit wrote one alert');
select public.model_budget_reserve(1, null, null, '2026-10-29T05:00:30Z');
select t.ok((select count(*) = 1 from public.founder_alerts where kind = 'model_budget_exhausted'), 'a second refusal writes no second alert');
select t.ok((select count(*) = 1 from public.model_budget_days), 'no refusal created a budget row');
-- A missing usage record keeps the whole reservation as spent.
select public.model_budget_settle(id) from public.model_budget_reservations where micros = 15000000;
select t.ok((select spent_micros = 15000000 and reserved_micros = 5000000 from public.model_budget_days where day = '2026-10-29'), 'settling without a proven cost keeps the whole worst case as spent');
select t.must_fail($$select public.model_budget_reserve(0)$$, 'positive', 'a zero reservation is an error');
reset role;
set role authenticated;
select t.must_fail($$select public.model_budget_reserve(1)$$, 'permission denied', 'a signed-in person cannot reserve');
select t.must_fail($$select * from public.model_budget_days$$, 'permission denied', 'a signed-in person cannot read the days');
reset role;
rollback;
