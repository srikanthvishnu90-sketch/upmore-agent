#!/usr/bin/env bash
# Steps 1 and 3 of the launch plan, run by the owner from his own shell against the live project.
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' bash scripts/launch/apply-rails-and-seed.sh --all
#   (Option A, the owner's choice 2026-10-11: every migration after 20261008_000005, in filename order, in ONE transaction:
#   all or nothing. Verified against the live schema 2026-10-11: every table they create is absent live, the two live
#   tables they alter only gain columns, and the two live functions they replace keep their exact signatures and return
#   types, so the running agent-chat v203 keeps working between this step and the deploy.)
#   [--with-router-deps] is the older Option B subset, kept for reference.
#   --pending: only the migrations not yet in the live ledger (safe to re-run; see below). go-live.sh uses this now.
# What it does, each file in its own transaction, stopping at the first error:
#   1. the three rail migrations: 20261011010000_flow_state.sql, 20261011020000_saved_recipients.sql,
#      20261011030000_brokerage_accounts_per_user.sql (each person's own LIVE brokerage connection; tokens only in the
#      Vault; connect attempts, link, reconnect and disconnect)
#   2. with --with-router-deps, also the two the message router reads live: 20261010110000_model_call_budget.sql (the
#      router's model call goes through the budget RPCs) and 20261010040000_financial_evidence.sql (the flows read
#      transactions from agent_financial_transactions). Both are self-contained and additive.
#   3. the gauntlet seed (Sam on Venmo and Zelle for the test user). No brokerage row is seeded: a person connects their
#      own Alpaca account through the app (Settings > Brokerage), never a shared one
#   4. the read-only RLS proof (scripts/launch/verify-rails-live.sql), rolled back
# It does NOT run `supabase db push`: the live migration history is empty, so db push would try to replay all 59 files.
# It never prints the connection string.
set -euo pipefail
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL (Project Settings > Database > Connection string)}"
cd "$(dirname "$0")/../.."
run() { echo "== $1"; psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$1"; sha256sum "$1"; }
# This reviewed bridge owns BEGIN/COMMIT and cannot share an enclosing transaction.
# Every other file retains the existing ordered, transactional ledger batch behavior.
STANDALONE_BRIDGE="20261024130000_career_apply_card_cloud_bridge.sql"
run_legacy_migration_group() {
  local ledger="$1"; shift
  local path name; local args=() names=()
  for path in "$@"; do
    name="$(basename "$path")"; names+=("$name"); args+=(-f "$path")
    if [[ "$ledger" == true ]]; then
      args+=(-c "insert into public.upmore_migration_ledger(filename,sha256) values ('$name','$(sha256sum "$path" | cut -d' ' -f1)')")
    fi
  done
  if [[ "$ledger" == true ]]; then
    echo "== pending migrations, one transaction: ${names[*]}"
  else
    echo "== legacy migration group, one transaction: ${names[*]}"
  fi
  "${P[@]}" --single-transaction "${args[@]}"
}
run_ordered_migration_groups() {
  local ledger="$1"; shift
  local path name; local group=()
  for path in "$@"; do
    name="$(basename "$path")"
    if [[ "$name" != "$STANDALONE_BRIDGE" ]]; then group+=("$path"); continue; fi
    if (( ${#group[@]} )); then run_legacy_migration_group "$ledger" "${group[@]}"; group=(); fi
    echo "== standalone bridge migration: $name"
    "${P[@]}" -f "$path"
    # The file has already committed. If recording fails, stop; do not retry it or run later files.
    # A later explicit invocation can replay this idempotent file before recording its ledger row.
    if [[ "$ledger" == true ]]; then
      "${P[@]}" -c "insert into public.upmore_migration_ledger(filename,sha256) values ('$name','$(sha256sum "$path" | cut -d' ' -f1)')" || {
        local ledger_status=$?
        echo "STOP: $name committed, but its ledger write failed; no later file or automatic retry ran" >&2
        return "$ledger_status"
      }
    fi
  done
  if (( ${#group[@]} )); then run_legacy_migration_group "$ledger" "${group[@]}"; fi
}
# The bridge and the one ledger replace the same two claim functions; whichever ran last decides them. After every apply,
# the two are reconciled and the run stops unless every claim guard is in place (scripts/launch/verify-claim-guards.sql).
verify_claim_guards() { echo "== claim guards"; "${P[@]}" -f scripts/launch/verify-claim-guards.sql; }
# --pending (the default for every run after the first go-live): a ledger table records each applied file, and only the
# files missing from it are applied, in ONE transaction, each with its ledger row. A re-run with nothing new applies
# nothing. The first time, the ledger is backfilled with every file up to BASELINE, the last file the 2026-10-11 19:01 UTC
# go-live applied (verified live that day: broker_pending_links, saved_recipients and agent_flow_state exist).
BASELINE="20261011030000_brokerage_accounts_per_user.sql"
if [[ "${1:-}" == "--pending" ]]; then
  export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"; P=(psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1)
  "${P[@]}" -c "create table if not exists public.upmore_migration_ledger(filename text primary key, sha256 text not null, applied_at timestamptz not null default now()); alter table public.upmore_migration_ledger enable row level security; revoke all on public.upmore_migration_ledger from anon, authenticated;"
  if [[ "$("${P[@]}" -tAc "select count(*) from public.upmore_migration_ledger")" == "0" ]]; then
    vals=""
    for f in supabase/migrations/*.sql; do b="$(basename "$f")"; [[ "$b" > "$BASELINE" ]] && continue
      vals+="${vals:+,}('$b','$(sha256sum "$f" | cut -d' ' -f1)')"; done
    "${P[@]}" -c "insert into public.upmore_migration_ledger(filename,sha256) values $vals on conflict do nothing"
    echo "== ledger backfilled up to $BASELINE"
  fi
  applied="$("${P[@]}" -tAc "select filename from public.upmore_migration_ledger")"
  args=(); names=(); pending_files=()
  for f in supabase/migrations/*.sql; do b="$(basename "$f")"
    grep -qxF "$b" <<<"$applied" && continue
    args+=(-f "$f" -c "insert into public.upmore_migration_ledger(filename,sha256) values ('$b','$(sha256sum "$f" | cut -d' ' -f1)')"); names+=("$b"); pending_files+=("$f")
  done
  if (( ${#names[@]} == 0 )); then echo "== no pending migrations"; exit 0; fi
  if [[ " ${names[*]} " == *" $STANDALONE_BRIDGE "* ]]; then
    echo "== pending migrations, ordered groups with standalone bridge: ${names[*]}"
    run_ordered_migration_groups true "${pending_files[@]}"
  else
    echo "== pending migrations, one transaction: ${names[*]}"
    "${P[@]}" --single-transaction "${args[@]}"
  fi
  verify_claim_guards
  echo "== applied ${#names[@]}"
  exit 0
fi
if [[ "${1:-}" == "--all" ]]; then
  files=(); ordered_files=(); standalone=false
  for f in supabase/migrations/*.sql; do b="$(basename "$f")"; if [[ "$b" > "20261008_000005_~" ]]; then
    files+=(-f "$f"); ordered_files+=("$f"); [[ "$b" == "$STANDALONE_BRIDGE" ]] && standalone=true
  fi; done
  if [[ "$standalone" == true ]]; then
    echo "== all pending migrations, ordered groups with standalone bridge: ${#ordered_files[@]} files"
    P=(psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1)
    run_ordered_migration_groups false "${ordered_files[@]}"
  else
    echo "== all pending migrations, one transaction: $(( ${#files[@]} / 2 )) files"
    psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction "${files[@]}"
  fi
  P=(psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1); verify_claim_guards
  for ((i = 1; i < ${#files[@]}; i += 2)); do sha256sum "${files[$i]}"; done
  run scripts/launch/seed-gauntlet-test-user.sql
  echo "== proof (read-only, rolled back)"
  psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f scripts/launch/verify-rails-live.sql
  exit 0
fi
if [[ "${1:-}" == "--with-router-deps" ]]; then
  run supabase/migrations/20261010110000_model_call_budget.sql
  run supabase/migrations/20261010040000_financial_evidence.sql
fi
run supabase/migrations/20261011010000_flow_state.sql
run supabase/migrations/20261011020000_saved_recipients.sql
run supabase/migrations/20261011030000_brokerage_accounts_per_user.sql
run scripts/launch/seed-gauntlet-test-user.sql
echo "== proof (read-only, rolled back)"
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f scripts/launch/verify-rails-live.sql
