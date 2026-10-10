#!/bin/bash
# Runs the agent migrations and their SQL tests against a throwaway local
# Postgres. Nothing here touches the live Supabase project.
set -euo pipefail
export LC_ALL=C LANG=C
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v postgres)")}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/upmore-db-test.XXXXXX")"
PORT="${PGTEST_PORT:-54329}"
cleanup() {
  "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$WORK/data" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres)

# Migrations are full of "if not exists" and "drop ... if exists"; their
# notices are noise here. Tests print their own "ok" lines as notices.
QUIET=("${PSQL[@]}" -c "set client_min_messages = warning")
"${QUIET[@]}" -f "$HERE/stubs.sql"
for m in 20260923_000001_agent_rate_limits.sql 20260923_000006_rate_limiter_hardening.sql \
         20260927_000003_agent_usage.sql \
         20260926_000001_agent_exec.sql 20260926_000002_agent_exec_otp.sql \
         20260928_000001_chat_reminders.sql \
         20260928_000002_exec_runs_revoked.sql \
         20260928_000004_exec_trust.sql \
         20260928_000006_agent_lessons.sql \
         20260928_000007_lesson_upsert_rpc.sql \
         20261008_000002_agent_rl_bump_as.sql \
         20261010010000_agent_permissions_ledger.sql \
         20261010020000_execution_integrity.sql \
         20261010030000_obligation_workflows.sql \
         20261010040000_financial_evidence.sql \
         20261010050000_biller_lifecycle.sql \
         20261010060000_payment_execution.sql \
         20261010070000_message_inbox.sql \
         20261010080000_message_delivery.sql \
         20261010090000_chat_bridge_rate.sql \
         20261010100000_message_turns.sql \
         20261010110000_model_call_budget.sql \
         20261010120000_chat_lesson_ownership.sql \
         20261010130000_transaction_reviews.sql \
         20261010140000_linked_transaction_review.sql \
         20261010150000_obligation_edits.sql \
         20261010160000_applied_payment_reconciliation.sql \
         20261010170000_payment_queue_fairness.sql \
         20261010180000_recovery_snapshot.sql \
         20261010190000_recovery_cases.sql; do
  "${QUIET[@]}" -f "$ROOT/supabase/migrations/$m"
done
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010120000_chat_lesson_ownership.sql"
# Idempotent: the agent migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010010000_agent_permissions_ledger.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010020000_execution_integrity.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010030000_obligation_workflows.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010040000_financial_evidence.sql"

"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010050000_biller_lifecycle.sql"

"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010060000_payment_execution.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010070000_message_inbox.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010080000_message_delivery.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010090000_chat_bridge_rate.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010100000_message_turns.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010110000_model_call_budget.sql"

"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010130000_transaction_reviews.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010140000_linked_transaction_review.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010150000_obligation_edits.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010160000_applied_payment_reconciliation.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010170000_payment_queue_fairness.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010180000_recovery_snapshot.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261010190000_recovery_cases.sql"

for t in "$HERE"/*.test.sql; do
  echo "== $(basename "$t")"
  # -t -A -o /dev/null drops result rows; the "ok" lines arrive as notices.
  "${PSQL[@]}" -t -A -o /dev/null -f "$t" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
done
echo "== concurrent message workers"
python3 "$HERE/message_concurrency.py" "${PSQL[@]}"
echo "db tests passed"
