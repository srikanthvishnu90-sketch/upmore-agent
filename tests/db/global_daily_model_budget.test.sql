-- SQL tests for 20261028070000_global_daily_model_budget.sql. The concurrency proof (200 simultaneous reservations against $20)
-- is tests/architect/global-daily-budget.test.ts, which needs real parallel sessions; this file checks the single-session rules.
begin;
reset role;
set role service_role;
select t.ok((select value = '20000000' from public.model_budget_settings where key = 'daily_limit_micros'), 'the default limit is $20 in micro-dollars');
select t.ok((public.model_budget_reserve(15000000, 'gpt-5', 'chat') ->> 'ok')::boolean, 'a reservation inside the day is granted');
select t.ok((public.model_budget_reserve(5000001, 'gpt-5', 'chat') ->> 'state') = 'limit', 'one micro-dollar over the limit is refused');
select t.ok((public.model_budget_reserve(5000000, 'gpt-5', 'chat') ->> 'ok')::boolean, 'an exact fit is granted');
select t.ok((select spent_micros = 0 and reserved_micros = 20000000 from public.model_budget_days where day = public.model_budget_day(now())), 'the day holds reserved + spent, never more than the limit');
select t.ok((select count(*) = 1 from public.founder_alerts where kind = 'model_budget_exhausted'), 'the first refusal of the day wrote one alert');
select public.model_budget_reserve(1);
select t.ok((select count(*) = 1 from public.founder_alerts where kind = 'model_budget_exhausted'), 'a second refusal writes no second alert');
-- A missing usage record keeps the whole reservation as spent.
select public.model_budget_settle(id) from public.model_budget_reservations where micros = 15000000;
select t.ok((select spent_micros = 15000000 and reserved_micros = 5000000 from public.model_budget_days where day = public.model_budget_day(now())), 'settling without a proven cost keeps the whole worst case as spent');
select t.must_fail($$select public.model_budget_reserve(0)$$, 'positive', 'a zero reservation is an error');
reset role;
set role authenticated;
select t.must_fail($$select public.model_budget_reserve(1)$$, 'permission denied', 'a signed-in person cannot reserve');
select t.must_fail($$select * from public.model_budget_days$$, 'permission denied', 'a signed-in person cannot read the days');
reset role;
rollback;
