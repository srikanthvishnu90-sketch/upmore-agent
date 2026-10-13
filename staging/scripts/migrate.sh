#!/usr/bin/env bash
# staging/scripts/migrate.sh — apply the staging bootstrap + every repo migration,
# in filename order, to a STAGING Supabase project via the repo's sb.py tooling.
#
# Usage:
#   STAGING_REF=<staging-project-ref> bash staging/scripts/migrate.sh [--dry-run]
#   bash staging/scripts/migrate.sh <staging-project-ref> [--dry-run]
#
# PREPARE-ONLY PACKAGE: this script is shipped syntax-checked and dry-run only.
# It is run by the OWNER against a staging project the owner created. It refuses
# the production ref (and the Sporv ref) before doing anything.
#
# How application works, honestly:
# - sb.py query POSTs SQL to the Management API database/query endpoint. There is
#   no migration ledger on that path, so this script keeps a package-local one:
#   public.upmore_staging_migrations (name, applied_at). A file already in the
#   ledger is skipped, which makes re-runs idempotent at file granularity.
# - One sb.py call per FILE (never a multi-file batch). sb.py surfaces only one
#   statement's result for a multi-statement call (repo-known quirk), and several
#   migrations contain dollar-quoted bodies that naive statement-splitting would
#   break — so each file goes in whole, its HTTP status is checked, and the
#   ledger insert + a probe in the NEXT call are the per-file verification.
# - Stops on the first failure. Nothing is rolled back automatically; fix the
#   file (or the project) and re-run — applied files are skipped via the ledger.
set -euo pipefail

PROD_REF="mrwngntwmnaqrqhupvlt"   # production Upmore project — NEVER a staging target
SPORV_REF="aveqjeafghmwafkbbnor"  # Sporv project — never touched by Upmore work

REF="${STAGING_REF:-${1:-}}"
DRY_RUN=0
for a in "$@"; do [ "$a" = "--dry-run" ] && DRY_RUN=1; done
[ "$REF" = "--dry-run" ] && REF=""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SB="${SB_PY:-$HOME/workspace/skills/supabase/bin/sb.py}"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
BOOTSTRAP="$REPO_ROOT/staging/sql/000-bootstrap-preexisting-tables.sql"
LEDGER_TABLE="public.upmore_staging_migrations"

# --- production / safety guard (must stay in this file; verified by grep) ---
if [ -z "$REF" ]; then
  echo "REFUSE: no staging ref given. Set STAGING_REF=<staging project ref> (never the production ref $PROD_REF)." >&2
  exit 64
fi
if [ "$REF" = "$PROD_REF" ]; then
  echo "REFUSE: ref $REF is the PRODUCTION Upmore project (mrwngntwmnaqrqhupvlt). Staging scripts never run against production." >&2
  exit 64
fi
if [ "$REF" = "$SPORV_REF" ]; then
  echo "REFUSE: ref $REF is the Sporv project. Out of scope for Upmore staging." >&2
  exit 64
fi
case "$REF" in *[!a-z0-9]*|"") echo "REFUSE: ref '$REF' is not a bare Supabase project ref." >&2; exit 64;; esac

# Ordered file list: bootstrap first, then migrations in `ls` (lexical) order.
# LC_ALL=C so the order printed here is byte-identical to `ls supabase/migrations`.
mapfile -t MIGRATION_FILES < <(LC_ALL=C ls "$MIGRATIONS_DIR")
EXPECTED_TOP="${MIGRATION_FILES[$((${#MIGRATION_FILES[@]} - 1))]}"

run_query() { # $1 = sql-file-or-stdin-label; reads SQL on stdin; prints sb.py status line
  SUPABASE_REF="$REF" python3 "$SB" query - 2>&1
}
query_status() { grep -o '"status": [0-9]*' | head -1 | grep -o '[0-9]*$'; }

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY RUN — migrate.sh against staging ref: $REF (production ref $PROD_REF refused)"
  echo "step 0: guard — refuse if ref == $PROD_REF (production) or == $SPORV_REF (Sporv)"
  echo "step 1: create ledger table if absent: $LEDGER_TABLE (name text primary key, applied_at timestamptz)"
  n=2
  echo "step $n: apply bootstrap (pre-existing production tables, not in migrations): ${BOOTSTRAP#$REPO_ROOT/}"
  n=$((n + 1))
  echo "step $n: record ledger row: 000-bootstrap-preexisting-tables.sql"
  n=$((n + 1))
  for f in "${MIGRATION_FILES[@]}"; do
    echo "step $n: if '$f' not in $LEDGER_TABLE: apply supabase/migrations/$f in ONE sb.py query call (whole file), stop on non-200"
    n=$((n + 1))
    echo "step $n: record ledger row: $f"
    n=$((n + 1))
  done
  echo "step $n: verify — ledger top (max name) must equal last migration: $EXPECTED_TOP"
  echo "step $((n + 1)): verify — tables-exist probe: profiles, agent_threads, agent_messages, user_oauth_connections, agent_rate_limits, agent_message_turns (information_schema count must be 6)"
  echo "DRY RUN complete: ${#MIGRATION_FILES[@]} migrations in ls order, first=${MIGRATION_FILES[0]}, last=$EXPECTED_TOP. Nothing was executed."
  exit 0
fi

[ -f "$SB" ] || { echo "FAIL: sb.py not found at $SB" >&2; exit 1; }
[ -f "$BOOTSTRAP" ] || { echo "FAIL: bootstrap SQL missing: $BOOTSTRAP" >&2; exit 1; }

apply_one() { # $1 = display name, $2 = sql file
  local name="$1" file="$2"
  local out status
  out="$(run_query < "$file")" || true
  status="$(printf '%s' "$out" | query_status || true)"
  if [ "$status" != "200" ]; then
    echo "FAIL applying $name (sb.py status: ${status:-none}). Stopping; ledger not updated for this file." >&2
    printf '%s\n' "$out" | head -20 >&2
    exit 1
  fi
  out="$(printf "insert into %s (name) values ('%s') on conflict (name) do nothing;" "$LEDGER_TABLE" "$name" | run_query)" || true
  status="$(printf '%s' "$out" | query_status || true)"
  [ "$status" = "200" ] || { echo "FAIL recording ledger row for $name (status: ${status:-none})." >&2; exit 1; }
  echo "applied: $name"
}

already_applied() { # $1 = name; 0 if in ledger
  local out
  out="$(printf "select name from %s where name = '%s';" "$LEDGER_TABLE" "$1" | run_query)" || true
  printf '%s' "$out" | grep -q "$1"
}

echo "migrate: target staging ref $REF (NOT production $PROD_REF)"
printf "create table if not exists %s (name text primary key, applied_at timestamptz not null default now());" "$LEDGER_TABLE" | run_query >/dev/null

if already_applied "000-bootstrap-preexisting-tables.sql"; then
  echo "skip (ledger): 000-bootstrap-preexisting-tables.sql"
else
  apply_one "000-bootstrap-preexisting-tables.sql" "$BOOTSTRAP"
fi

for f in "${MIGRATION_FILES[@]}"; do
  if already_applied "$f"; then
    echo "skip (ledger): $f"
  else
    apply_one "$f" "$MIGRATIONS_DIR/$f"
  fi
done

# --- end verification: ledger tops at the expected file + tables-exist probe ---
TOP_OUT="$(printf "select coalesce(max(name), '') as top from %s;" "$LEDGER_TABLE" | run_query)"
printf '%s' "$TOP_OUT" | grep -q "$EXPECTED_TOP" || {
  echo "FAIL verify: migration ledger does not top at $EXPECTED_TOP" >&2; exit 1; }
PROBE_OUT="$(printf "select count(*) as n from information_schema.tables where table_schema = 'public' and table_name in ('profiles','agent_threads','agent_messages','user_oauth_connections','agent_rate_limits','agent_message_turns');" | run_query)"
printf '%s' "$PROBE_OUT" | grep -q '"n": 6' || {
  echo "FAIL verify: tables-exist probe did not return 6/6" >&2; printf '%s\n' "$PROBE_OUT" | head -5 >&2; exit 1; }
echo "PASS migrate: ledger tops at $EXPECTED_TOP; tables-exist probe 6/6 on staging ref $REF"
