-- WO-093: the deploy ledger. Production was not built from the measured commit (C6): each deploy re-staged at run time,
-- v245 ran the tailor leg without a guard its named commit contained, a packet's migrations never landed and several
-- functions ran versions no record explained. scripts/launch/trainee-go-live.sh now ships only `git archive <sha>` and
-- writes one row here per function it deployed (the bundle's sha256 from its provenance manifest) and one per migration
-- whose mark it read on the live schema; `trainee-go-live.sh --verify <sha>` compares these rows and the live marks to
-- the manifest of that commit.
-- Nobody but the deploy reads or writes it: RLS on with no policy, no grant to anon or authenticated, and the service
-- role may only read and append (a ledger row is never changed or removed). Idempotent: applies cleanly twice.
create table if not exists public.career_deploy_ledger (
  id bigint generated always as identity primary key,
  sha text not null check (sha ~ '^[0-9a-f]{40}$'),
  kind text not null default 'function' check (kind in ('function', 'migration')),
  function_name text check (function_name ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  migration_file text check (migration_file ~ '^[0-9]{8}[0-9_]*_[a-z0-9_]+\.sql$' and char_length(migration_file) <= 160),
  -- A function: the sha256 of its staged bundle (deploy-provenance.cjs). A migration: the sha256 of the file applied.
  bundle_sha256 text not null check (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  -- A function: the platform's version number right after the deploy, when the CLI listed it (null when it did not).
  platform_version integer check (platform_version is null or platform_version > 0),
  -- The sha256 of the whole provenance manifest this row came from.
  manifest_sha256 text check (manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
  deployed_at timestamptz not null default now(),
  deployed_by_label text not null check (deployed_by_label ~ '^[A-Za-z0-9 ._@:+-]{1,100}$'),
  check ((kind = 'function' and function_name is not null and migration_file is null)
      or (kind = 'migration' and migration_file is not null and function_name is null))
);
create index if not exists career_deploy_ledger_function on public.career_deploy_ledger (function_name, deployed_at desc, id desc)
  where kind = 'function';
create index if not exists career_deploy_ledger_migration on public.career_deploy_ledger (migration_file, deployed_at desc, id desc)
  where kind = 'migration';
create index if not exists career_deploy_ledger_sha on public.career_deploy_ledger (sha);

alter table public.career_deploy_ledger enable row level security;
-- No policy: a client role reads and writes nothing, even if a grant is ever added by mistake. The service role (which
-- bypasses RLS) may read and append; the deploy writes as the database owner.
revoke all on public.career_deploy_ledger from public, anon, authenticated, service_role;
grant select, insert on public.career_deploy_ledger to service_role;

-- Append-only, for everyone (the table owner included): a deploy is recorded once and never rewritten.
create or replace function public.career_deploy_ledger_append_only()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'career_deploy_ledger is append-only (% refused)', tg_op;
end $$;
revoke all on function public.career_deploy_ledger_append_only() from public, anon, authenticated;
drop trigger if exists career_deploy_ledger_append_only on public.career_deploy_ledger;
create trigger career_deploy_ledger_append_only before update or delete on public.career_deploy_ledger
  for each row execute function public.career_deploy_ledger_append_only();
drop trigger if exists career_deploy_ledger_no_truncate on public.career_deploy_ledger;
create trigger career_deploy_ledger_no_truncate before truncate on public.career_deploy_ledger
  for each statement execute function public.career_deploy_ledger_append_only();
