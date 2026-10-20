-- WO-093: the deploy ledger. The deploy (the database owner) and the service role append rows; nobody changes or removes
-- one; a client role (anon, authenticated) reads and writes nothing; every value has its shape.
begin;
reset role;
select t.ok((select relrowsecurity from pg_class where oid = 'public.career_deploy_ledger'::regclass), 'RLS is on');
select t.ok(not exists (select 1 from pg_policy where polrelid = 'public.career_deploy_ledger'::regclass), 'no policy: no client role reads a row');
select t.ok(not has_table_privilege('anon', 'public.career_deploy_ledger', 'select,insert,update,delete'), 'anon has no access');
select t.ok(not has_table_privilege('authenticated', 'public.career_deploy_ledger', 'select,insert,update,delete'), 'authenticated has no access');
select t.ok(has_table_privilege('service_role', 'public.career_deploy_ledger', 'select')
  and has_table_privilege('service_role', 'public.career_deploy_ledger', 'insert')
  and not has_table_privilege('service_role', 'public.career_deploy_ledger', 'update,delete,truncate'), 'the service role reads and appends only');

-- What go-live writes: one row per migration mark read, one per function deployed.
insert into public.career_deploy_ledger (sha, kind, migration_file, bundle_sha256, manifest_sha256, deployed_by_label)
values ('5f7efe45e484f2139b6bd82e0ebf253775a0481a', 'migration', '20261022120000_career_deploy_ledger.sql', repeat('a', 64), repeat('c', 64), 'owner'),
       ('5f7efe45e484f2139b6bd82e0ebf253775a0481a', 'migration', '20260923_000001_agent_rate_limits.sql', repeat('d', 64), repeat('c', 64), 'owner');
insert into public.career_deploy_ledger (sha, kind, function_name, bundle_sha256, platform_version, manifest_sha256, deployed_by_label)
values ('5f7efe45e484f2139b6bd82e0ebf253775a0481a', 'function', 'agent-chat', repeat('b', 64), 246, repeat('c', 64), 'owner shell');
select t.ok((select count(*) = 3 from public.career_deploy_ledger), 'the owner appends migration and function rows');
select t.ok((select deployed_at is not null and kind = 'function' from public.career_deploy_ledger where function_name = 'agent-chat'), 'deployed_at is set');

select t.must_fail($$insert into public.career_deploy_ledger (sha, function_name, bundle_sha256, deployed_by_label) values ('5f7efe45', 'agent-chat', repeat('b', 64), 'owner')$$,
  'career_deploy_ledger_sha_check', 'a short sha is refused (the full 40 characters only)');
select t.must_fail($$insert into public.career_deploy_ledger (sha, function_name, bundle_sha256, deployed_by_label) values (repeat('e', 40), 'agent-chat', 'not-a-hash', 'owner')$$,
  'career_deploy_ledger_bundle_sha256_check', 'a bundle that is not a sha256 is refused');
select t.must_fail($$insert into public.career_deploy_ledger (sha, function_name, bundle_sha256, deployed_by_label) values (repeat('e', 40), 'agent-chat', repeat('b', 64), 'x''; drop table y; --')$$,
  'career_deploy_ledger_deployed_by_label_check', 'a label is a plain name');
select t.must_fail($$insert into public.career_deploy_ledger (sha, kind, bundle_sha256, deployed_by_label) values (repeat('e', 40), 'function', repeat('b', 64), 'owner')$$,
  'career_deploy_ledger_check', 'a function row names its function');
select t.must_fail($$insert into public.career_deploy_ledger (sha, kind, function_name, migration_file, bundle_sha256, deployed_by_label) values (repeat('e', 40), 'migration', 'agent-chat', '20261022120000_career_deploy_ledger.sql', repeat('b', 64), 'owner')$$,
  'career_deploy_ledger_check', 'a migration row names a file and no function');
select t.must_fail($$update public.career_deploy_ledger set bundle_sha256 = repeat('f', 64)$$, 'append-only', 'a row is never rewritten, not even by the owner');
select t.must_fail($$delete from public.career_deploy_ledger$$, 'append-only', 'nor removed');
select t.must_fail($$truncate public.career_deploy_ledger$$, 'append-only', 'nor truncated');

set role service_role;
insert into public.career_deploy_ledger (sha, kind, function_name, bundle_sha256, deployed_by_label)
values ('5f7efe45e484f2139b6bd82e0ebf253775a0481a', 'function', 'career-ingest', repeat('b', 64), 'service');
select t.ok((select count(*) = 4 from public.career_deploy_ledger), 'the service role reads and appends');
select t.must_fail($$update public.career_deploy_ledger set deployed_by_label = 'x'$$, 'permission denied', 'the service role cannot rewrite');
reset role;

select t.as_user('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.must_fail($$select count(*) from public.career_deploy_ledger$$, 'permission denied', 'a signed-in person reads nothing');
select t.must_fail($$insert into public.career_deploy_ledger (sha, function_name, bundle_sha256, deployed_by_label) values (repeat('e', 40), 'agent-chat', repeat('b', 64), 'me')$$,
  'permission denied', 'nor writes');
reset role;
set role anon;
select t.must_fail($$select count(*) from public.career_deploy_ledger$$, 'permission denied', 'anon reads nothing');
reset role;

-- --verify reads the latest row per function and per migration file.
select t.ok((select string_agg(function_name || ':' || deployed_by_label, ',' order by function_name) = 'agent-chat:owner shell,career-ingest:service'
  from (select distinct on (function_name) function_name, deployed_by_label from public.career_deploy_ledger where kind = 'function'
        order by function_name, deployed_at desc, id desc) x), 'the latest row per function is read back');
rollback;
