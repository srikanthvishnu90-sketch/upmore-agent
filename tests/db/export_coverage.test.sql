-- "Export data" (privacy policy: "Export your data (delivered as JSON)"): every table a person can read about themselves
-- is in the app's export list or left out with a written reason (tests/fixtures/export-tables.json, which the app's
-- EXPORT_TABLES must equal: tests/export-coverage.test.cjs). Found 2026-10-12: the export read none of the agent tables
-- but the chat (no linked accounts or transactions, settings, IOUs, standing payments, recipients, brokerage), and one
-- select per table, which PostgREST caps at 1,000 rows. Checked here for the agent schema this suite loads: each listed
-- table's order and select columns exist and the person may read them (a select * on a table with column grants fails).
\set export_doc `cat "$UPMORE_ROOT/tests/fixtures/export-tables.json"`
begin;
reset role;
create temp table export_doc as select :'export_doc'::jsonb as j;
do $$ declare
  d jsonb := (select j from export_doc); r record; e jsonb; c text; n int := 0; missing text := ''; bad text := '';
  listed text[] := array(select x->>'table' from jsonb_array_elements(d->'export') x);
  excluded text[] := array(select jsonb_object_keys(d->'excluded'));
  stubs text[] := array['profiles','agent_threads','simplefin_connections'];
begin
  for r in
    select c2.oid, c2.relname from pg_class c2 join pg_namespace ns on ns.oid = c2.relnamespace
    where ns.nspname = 'public' and c2.relkind = 'r' and c2.relname <> all(stubs)
      and exists (select 1 from pg_attribute a where a.attrelid = c2.oid and a.attname = 'user_id')
      and has_column_privilege('authenticated', c2.oid, 'user_id', 'select')
      and (not c2.relrowsecurity or exists (select 1 from pg_policy p where p.polrelid = c2.oid and p.polcmd in ('r','*')))
  loop
    n := n + 1;
    if r.relname <> all(listed) and r.relname <> all(excluded) then missing := missing || ' ' || r.relname; end if;
  end loop;
  if n < 40 then raise exception 'FAIL expected the agent schema''s readable tables, found %', n; end if;
  if missing <> '' then raise exception 'FAIL a person can read these about themselves but Export data leaves them out:%', missing; end if;
  raise notice 'ok   all % tables a person can read about themselves are exported or left out with a reason', n;
  n := 0;
  for e in select * from jsonb_array_elements(d->'export') loop
    if to_regclass('public.' || (e->>'table')) is null or (e->>'table') = any(stubs) then continue; end if;
    n := n + 1;
    for c in select jsonb_array_elements_text(e->'order') union all select unnest(string_to_array(coalesce(e->>'select', ''), ',')) loop
      if c = '' then continue; end if;
      if not exists (select 1 from pg_attribute a where a.attrelid = ('public.' || (e->>'table'))::regclass and a.attname = c and not a.attisdropped)
         or not has_column_privilege('authenticated', ('public.' || (e->>'table'))::regclass, c, 'select') then
        bad := bad || ' ' || (e->>'table') || '.' || c;
      end if;
    end loop;
    if e->>'select' is null and not has_table_privilege('authenticated', ('public.' || (e->>'table'))::regclass, 'select') then
      bad := bad || ' ' || (e->>'table') || '(select * is refused: list its columns)';
    end if;
  end loop;
  if bad <> '' then raise exception 'FAIL export entries the person cannot read as listed:%', bad; end if;
  raise notice 'ok   every listed agent table (%) reads with its order columns and selected columns as the person', n;
end $$;
rollback;
