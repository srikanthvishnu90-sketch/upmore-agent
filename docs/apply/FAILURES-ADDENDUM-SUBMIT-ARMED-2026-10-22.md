# FAILURES addendum — submit-armed lane (2026-10-22, night plan chunk 100%)

Branch `muse/2026-10-22-submit-armed`. To be folded into FAILURES.md proper by the
coordinator (FAILURES.md lives on `muse/2026-10-20-failures-backlog`; this branch's
base does not carry it). Numbering continues the MUSE-F series used by the apply lanes.

## MUSE-F-038 — `tests/db/export_coverage.test.sql` is planner-order flaky on PG16: the full DB suite passes or dies on a coin flip

Found by the chunk-100% lane while running `tests/db/run.sh` for the armed-path dry
exercise: 5 full runs of identical trees (3 on this branch, 1 on the pristine base
`cb56921a`, plus the F-030 lane's earlier green) — the suite died twice at
`export_coverage.test.sql:47` with

```
ERROR:  column "user_id" of relation "profiles" does not exist
CONTEXT:  PL/pgSQL function inline_code_block line 7 at FOR over SELECT rows
```

and passed the other times (including the pristine base run and the lane's final
green run: EXIT=0, 2,125 ok).

Root cause: the file's enumeration query filters candidate tables with
`exists (select 1 from pg_attribute a where a.attrelid = c2.oid and a.attname = 'user_id')`
AND `has_column_privilege('authenticated', c2.oid, 'user_id', 'select')`.
`has_column_privilege` RAISES `column "user_id" of relation "<table>" does not exist`
for a table that has no such column — it does not return false. Whether the query
errors therefore depends on the plan the planner happens to choose for the fresh
throwaway cluster (privilege predicate evaluated before the existence filter →
error; after → clean skip). `profiles` (in the file's own stub list, and lacking a
`user_id` column — its key is `id`) is simply the first victim the plan reaches.

Impact: any lane gating on a single `run.sh` run can be failed (or passed) by this
coin flip; a red run at this file says nothing about the change under test.

Fix shape (the chain's own test file; NOT applied by this lane — outside chunk
100%'s scope): make the existence check structurally prior — e.g. enumerate from a
CTE of `(relname, oid)` already restricted to tables that HAVE a `user_id` column,
and call `has_column_privilege` only inside that CTE's consumers (or wrap the
privilege call in a small `pg_temp` helper that catches the missing-column error and
returns false). The permanent guard is the suite itself: two consecutive full runs
on the same tree must agree at this file.

Status: OPEN, handed to the QA/build lane with this note. The chunk-100% exercise
section is independent of it (own session, runs last, skip-listed in the loop) and
its 28/28 green stands on the full-suite green run recorded in
docs/apply/SUBMIT-ARMED-GATE-REPORT-2026-10-22.md.
