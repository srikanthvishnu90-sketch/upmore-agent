// The SELECT-only connection the live-verify tests read through, shaped like the owner's production role
// (scripts/live/test-account.sql): login, BYPASSRLS (it reads every person's rows, and only reads), SELECT on the schemas
// the suite reads, EXECUTE on the two read functions, default_transaction_read_only on. The tests then read exactly as a
// production run does: one extended-protocol query at a time, inside `begin read only`, as this role.
import type { Pg } from "../flow/pg.ts";
import * as L from "../../scripts/live/lib.ts";

export async function readOnlyConnection(pg: Pg, role = "lv_ro"): Promise<{ exec: L.Exec; end: () => Promise<void> }> {
  await pg.sql(`
    do $$ begin if not exists (select from pg_roles where rolname = '${role}') then create role ${role} login bypassrls; end if; end $$;
    create schema if not exists cron;
    grant usage on schema public, auth, cron, storage to ${role};
    grant select on all tables in schema public, auth, cron, storage to ${role};
    alter default privileges in schema public grant select on tables to ${role};
    alter default privileges in schema cron grant select on tables to ${role};
    grant execute on function public.career_ingest_coverage(interval) to ${role};
    grant execute on function public.career_apply_canonical(jsonb) to ${role};
    alter role ${role} set default_transaction_read_only = on;`);
  return await L.pgExec({ path: `${pg.host}/.s.PGSQL.${pg.port}`, user: role, database: "postgres" });
}
