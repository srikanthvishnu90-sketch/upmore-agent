-- "Delete my data" (megadoc Q04; the app's Delete data, then delete-account removing the auth user): every table that
-- holds a person's rows must go with their account. A table keyed by user_id with no cascading foreign key would keep
-- that person's rows after deletion, against the privacy policy, so any such table fails here the day it is added.
-- Scope: the migrations tests/db/run.sh loads (the agent schema). The older app tables outside it (profiles, save_*,
-- plaid_requests) are covered by delete-account's own explicit deletes, not by this check.
begin;
reset role;
do $$ declare r record; n int := 0; bad text := ''; begin
  for r in
    select c.table_name,
      exists (select 1 from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
              where con.contype = 'f' and con.confdeltype = 'c' and a.attname = 'user_id'
                and con.conrelid = ('public.' || quote_ident(c.table_name))::regclass) as cascades
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'user_id'
  loop
    n := n + 1;
    if not r.cascades then bad := bad || ' ' || r.table_name; end if;
  end loop;
  if n < 50 then raise exception 'FAIL expected the agent schema''s user tables, found %', n; end if;
  if bad <> '' then raise exception 'FAIL these tables keep a person''s rows after their account is deleted:%', bad; end if;
  raise notice 'ok   all % tables keyed by user_id go with the person''s account (a cascading foreign key on user_id)', n;
end $$;
rollback;
