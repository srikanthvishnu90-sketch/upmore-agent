#!/usr/bin/env bash
# Steps 1 and 3 of the launch plan, run by the owner from his own shell against the live project.
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres' bash scripts/launch/apply-rails-and-seed.sh --all
#   (Option A, the owner's choice 2026-10-11: every migration after 20261008_000005, in filename order, in ONE transaction:
#   all or nothing. Verified against the live schema 2026-10-11: every table they create is absent live, the two live
#   tables they alter only gain columns, and the two live functions they replace keep their exact signatures and return
#   types, so the running agent-chat v203 keeps working between this step and the deploy.)
#   [--with-router-deps] is the older Option B subset, kept for reference.
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
if [[ "${1:-}" == "--all" ]]; then
  files=()
  for f in supabase/migrations/*.sql; do b="$(basename "$f")"; [[ "$b" > "20261008_000005_~" ]] && files+=(-f "$f"); done
  echo "== all pending migrations, one transaction: $(( ${#files[@]} / 2 )) files"
  psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction "${files[@]}"
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
