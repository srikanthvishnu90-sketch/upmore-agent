-- One rule for the pace a person set (SERIAL-1420 (a), 2026-10-25). After 20261025140000 the SQL read a pace only from a
-- string of 1 to 6 digits, so an explicit "1000000" (or "7.9", "1e3", " 7 ") was read as no pace at all while the
-- TypeScript (career_apply.ts parsePace) read it as the pace: a number the person set silently became "no limit" on one
-- side. Now both sides share the rule: a decimal number of 1 or more is the pace, floored, kept up to 999,999,999; anything
-- else (unset, 0, negative, text, hex, a thousands separator) is no pace. The pattern below is the TypeScript PACE_RE,
-- character for character (tests/architect/pace-parse.test.ts reads it from this file).
-- NOT APPLIED: the owner applies migrations. After 20261025140000, which this replaces for one function.
create or replace function public.career_apply_daily_limit(p_user uuid) returns integer
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare PACE_RE constant text := '^\s*\+?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?\s*$';
 raw text; n numeric;
begin
 select value->>'daily_limit' into raw from public.career_watch_kv where user_id = p_user and key = 'career:account';
 if raw is null or raw !~ PACE_RE then return null; end if;
 begin n := raw::numeric; exception when others then return null; end;
 n := least(floor(n), 999999999);
 if n < 1 then return null; end if;
 return n::integer;
end $$;
