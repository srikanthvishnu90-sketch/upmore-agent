#!/bin/bash
# Fail-first runner for the batch control-hook semantics guard
# (LOOP Task 1, Fix 1). Builds two throwaway local Postgres databases
# — nothing touches the live project:
#   db "prefix": stubs + 20261015020000 + 20261016010000, then the
#     scenario — it MUST fail at A (the live batch-cancel defect).
#   db "postfix": the same + 20261020020000 (the semantics fix),
#     then the scenario — it MUST pass in full.
# Postgres refuses to run as root: run this script as a non-root
# user (e.g. `su nobody -s /bin/bash -c 'bash run-batch-hook-guard.sh'`
# with a writable TMPDIR). PGBIN overrides the Postgres bin dir.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v postgres || echo /usr/lib/postgresql/14/bin/postgres)")}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/batch-hook-guard.XXXXXX")"
PORT="${PGTEST_PORT:-54331}"
cleanup() {
  "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null || { echo "initdb failed"; exit 2; }
"$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null || { echo "pg start failed"; exit 2; }
PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres)

build_db() {
  "${PSQL[@]}" -d postgres -c "create database $1" >/dev/null
  "${PSQL[@]}" -d "$1" -c "set client_min_messages = warning" \
    -f "$ROOT/tests/db/stubs.sql" \
    -f "$ROOT/supabase/migrations/20261015020000_career_watch_kv.sql" \
    -f "$ROOT/supabase/migrations/20261016010000_career_batch_intents_v1.sql" >/dev/null
}

echo "== pre-fix database (defect must reproduce at scenario A) =="
build_db prefix
if "${PSQL[@]}" -d prefix -f "$HERE/15-career-batch-hook-semantics.test.sql" >"$WORK/prefix.out" 2>&1; then
  echo "UNEXPECTED: the scenario PASSED without the fix migration — the guard does not reproduce the defect"
  cat "$WORK/prefix.out"
  exit 1
fi
grep -q "FAIL A1" "$WORK/prefix.out" || { echo "UNEXPECTED pre-fix failure shape (expected FAIL A1):"; cat "$WORK/prefix.out"; exit 1; }
echo "ok: pre-fix scenario fails at A1 (the intent was cancelled by a mundane version bump) — fail-first reproduced"

echo "== post-fix database (all scenarios must pass) =="
build_db postfix
"${PSQL[@]}" -d postfix -c "set client_min_messages = warning" \
  -f "$ROOT/supabase/migrations/20261020020000_career_batch_hook_semantics_v2.sql" >/dev/null
if ! "${PSQL[@]}" -d postfix -f "$HERE/15-career-batch-hook-semantics.test.sql" >"$WORK/postfix.out" 2>&1; then
  echo "FAIL: the scenario does not pass with the fix migration:"
  cat "$WORK/postfix.out"
  exit 1
fi
grep -E "^psql.*NOTICE:  ok " "$WORK/postfix.out" | sed 's/.*NOTICE:  //'
echo "PASS: batch hook semantics guard (fail-first pre-fix, green post-fix)"
