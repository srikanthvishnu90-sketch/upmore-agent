#!/bin/bash
# Runs the agent migrations and their SQL tests against a throwaway local
# Postgres. Nothing here touches the live Supabase project.
set -euo pipefail
export LC_ALL=C LANG=C
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# export_coverage.test.sql reads tests/fixtures/export-tables.json through psql from here.
export UPMORE_ROOT="$ROOT"
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
         20260928_000011_oauth_connections.sql \
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
         20261010190000_recovery_cases.sql \
         20261011010000_flow_state.sql \
         20261011020000_saved_recipients.sql \
         20261011030000_brokerage_accounts_per_user.sql \
         20261011040000_model_health_and_turn_costs.sql \
         20261011050000_broker_vault_cascade.sql; do
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
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261011010000_flow_state.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261011020000_saved_recipients.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261011030000_brokerage_accounts_per_user.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261011040000_model_health_and_turn_costs.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261011050000_broker_vault_cascade.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261011060000_proactive.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012010000_manual_connections.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012020000_standing_payments.sql"
# Idempotent: the standing payments migration applies cleanly a second time (the ledger below replays it once more).
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012020000_standing_payments.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012030000_saved_recipient_nicknames.sql"
# Idempotent: the nickname migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012030000_saved_recipient_nicknames.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012040000_category_rules.sql"
# Idempotent: the category rules migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012040000_category_rules.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012050000_ious.sql"
# Idempotent: the IOU log migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012050000_ious.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012060000_oauth_vault_cascade.sql"
# Idempotent: the OAuth vault cascade must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261012060000_oauth_vault_cascade.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261019000001_career_postings.sql"
# Idempotent: the career postings migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261019000001_career_postings.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261019010001_career_alerts.sql"
# Idempotent: the career alerts migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261019010001_career_alerts.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261019020000_channel_delivery.sql"
# The table is part of export coverage; its account-authority RPCs run only
# after the complete career migration ledger below has created career_watch_kv.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020000001_career_apply_jobs.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020000001_career_apply_jobs.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020010000_career_apply_own_worker.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020010000_career_apply_own_worker.sql"
# Idempotent: the channel delivery migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261019020000_channel_delivery.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261019030000_channel_inbound.sql"
# Idempotent: the channel inbound migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261019030000_channel_inbound.sql"
# After channel inbound, as in production order: the receipts migration widens the outbox kinds it set.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020020000_career_apply_receipts.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020020000_career_apply_receipts.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020030000_career_apply_cards.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020030000_career_apply_cards.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020040000_career_apply_card_push.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020040000_career_apply_card_push.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020050000_career_apply_daily_limit.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020050000_career_apply_daily_limit.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020060000_career_apply_questions.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020060000_career_apply_questions.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020070000_career_apply_questions_ai_policy.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020070000_career_apply_questions_ai_policy.sql"
# After the card push migration, as in production order: mail tracking widens the outbox kinds it set.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020100000_career_mail_tracking.sql"
# Idempotent: the mail tracking migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020100000_career_mail_tracking.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020110000_career_connector.sql"
# Idempotent: the connector migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020110000_career_connector.sql"

# The account timeline (WO-027): the table is part of export coverage and the deletion sweep; its erase redefinition
# (20261020120100) needs career_watch_kv, so the ledger below applies it.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020120000_career_events.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020120000_career_events.sql"
# WO-028: the private resume bucket and the tailored tag; idempotent, so it applies cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020130000_career_resume_tailoring.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261020130000_career_resume_tailoring.sql"
# WO-038: WhatsApp and Telegram beside iMessage (contacts per channel, held rows, link tokens); idempotent, so it applies
# cleanly a second time. Its test runs after the career ledger below (the card push it redefines needs that schema), which
# also replays it on top of every earlier migration.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021070000_channel_parity.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021070000_channel_parity.sql"
# WO-036: hired-candidate background aggregates and the PDL credit log. Idempotent: applied twice.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021030000_career_hired_backgrounds.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021030000_career_hired_backgrounds.sql"
# WO-032 apply operations (source, email confirmation, the gate, apply by email, questions pushed, the card push's busy
# check). After every migration it redefines or widens, the channel parity's card push and outbox lists included;
# applied twice.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021075000_career_apply_ops.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021075000_career_apply_ops.sql"

# WO-037 (20261021110000, last in file order): board read state, the alert latency report and the weekly count. It adds
# its own table and one outbox column that no later migration touches, so it is applied here, before the tests, twice.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021110000_career_board_state.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021110000_career_board_state.sql"
# WO-031: the browser extension records the applications approved in it on the same queue; then WO-042's 120000, which
# redefines its begin with source 'extension' (the column exists from 075000) and keeps answers typed on the form. Each
# applied twice (idempotent), the later one last, as production ends.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021000000_career_apply_extension.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021000000_career_apply_extension.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021120000_career_apply_form_answers.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021120000_career_apply_form_answers.sql"
# WO-066: the postings the person asked Trainee to apply to, waiting for the extension (applied twice: idempotent).
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261022100000_career_apply_wanted.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261022100000_career_apply_wanted.sql"
# WO-069: the pay a board states for a posting, a column on career_postings (applied twice: idempotent).
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261022110000_career_postings_pay.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261022110000_career_postings_pay.sql"
# WO-091d: every application row ends (the 30-minute sweep, interrupted, the person's own edges). It redefines 050000's
# enqueue, 120000's begin and 010000's finish_own, so it comes after them; applied twice (idempotent).
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261023091400_career_apply_states.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261023091400_career_apply_states.sql"

for t in "$HERE"/*.test.sql; do
  if [[ "$t" == "$HERE/career_apply_jobs.test.sql" || "$t" == "$HERE/career_apply_own.test.sql" || "$t" == "$HERE/career_apply_cards.test.sql" || "$t" == "$HERE/career_apply_card_push.test.sql" || "$t" == "$HERE/career_apply_daily_limit.test.sql" || "$t" == "$HERE/career_apply_questions.test.sql" || "$t" == "$HERE/career_apply_questions_ai_policy.test.sql" || "$t" == "$HERE/career_connector.test.sql" || "$t" == "$HERE/career_events.test.sql" || "$t" == "$HERE/career_resume_tailoring.test.sql" || "$t" == "$HERE/career_voice_mock.test.sql" || "$t" == "$HERE/career_outreach.test.sql" || "$t" == "$HERE/career_brief_digest.test.sql" || "$t" == "$HERE/channel_parity.test.sql" || "$t" == "$HERE/career_mail_erase.test.sql" || "$t" == "$HERE/career_proactive_last_word.test.sql" || "$t" == "$HERE/career_apply_ops.test.sql" || "$t" == "$HERE/career_apply_cloud.test.sql" || "$t" == "$HERE/career_apply_extension.test.sql" || "$t" == "$HERE/career_apply_form_answers.test.sql" || "$t" == "$HERE/career_apply_states.test.sql" || "$t" == "$HERE/career_apply_authority.test.sql" ]]; then continue; fi
  echo "== $(basename "$t")"
  # -t -A -o /dev/null drops result rows; the "ok" lines arrive as notices.
  "${PSQL[@]}" -t -A -o /dev/null -f "$t" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
done
echo "== migration ledger (--pending): backfill, apply only what is new, then nothing on a re-run"
LEDGER_OUT="$(cd "$ROOT" && SUPABASE_DB_URL="postgresql://postgres@/postgres?host=$WORK&port=$PORT" bash scripts/launch/apply-rails-and-seed.sh --pending 2>&1)"
grep -q "ledger backfilled up to 20261011030000_brokerage_accounts_per_user.sql" <<<"$LEDGER_OUT" || { echo "$LEDGER_OUT"; echo "FAIL ledger backfill"; exit 1; }
grep -q "pending migrations, one transaction: .*20261011040000_model_health_and_turn_costs.sql 20261011050000_broker_vault_cascade.sql" <<<"$LEDGER_OUT" || { echo "$LEDGER_OUT"; echo "FAIL pending set"; exit 1; }
grep -q "20261011030000" <<<"$(grep 'pending migrations' <<<"$LEDGER_OUT")" && { echo "FAIL an already-applied file was replayed"; exit 1; }
AGAIN="$(cd "$ROOT" && SUPABASE_DB_URL="postgresql://postgres@/postgres?host=$WORK&port=$PORT" bash scripts/launch/apply-rails-and-seed.sh --pending 2>&1)"
[[ "$AGAIN" == "== no pending migrations" ]] || { echo "$AGAIN"; echo "FAIL a re-run applied something"; exit 1; }
"${PSQL[@]}" -tAc "select count(*) from public.upmore_migration_ledger where filename='20261011040000_model_health_and_turn_costs.sql'" | grep -qx 1 || { echo "FAIL ledger row"; exit 1; }
echo "  ok   ledger backfilled, only new files applied, a re-run applies nothing"
# Interviews and the weekly digest (WO-034): it redefines career_host_commit, which 20261015020000 creates with a plain
# create, so the ledger above applies it first, in production order; here it is applied twice more: idempotent.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021050000_career_brief_digest.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021050000_career_brief_digest.sql"
# WO-092: an approval goes stale only when something it depends on changed (the ledger above applied it; applied twice more: idempotent).
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261022150000_career_apply_authority.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261022150000_career_apply_authority.sql"
echo "== concurrent message workers"
python3 "$HERE/message_concurrency.py" "${PSQL[@]}"
echo "== career_apply_jobs.test.sql (complete career authority schema)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_jobs.test.sql"
echo "== career_apply_own.test.sql (the person's own computer claims only their own applications)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_own.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_apply_cards.test.sql (prepared, shown on a card, approved by one text)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_cards.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_apply_card_push.test.sql (the scheduled run shows the card in the texting thread)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_card_push.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_apply_daily_limit.test.sql (25 a day by default, the person's own up to 50)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_daily_limit.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_apply_questions.test.sql (asked once by text, answered once, read back by the person's computer)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_questions.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_apply_questions_ai_policy.test.sql (the employer's own words about AI help travel with its written questions)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_questions_ai_policy.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_connector.test.sql (double opt-in introductions: every refusal, nothing identifying before both yes)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_connector.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_events.test.sql (the account timeline: own reads, recall, prepared on insert, wiped by an erase)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_events.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_resume_tailoring.test.sql (tailored resumes stay private; every application tagged tailored or not)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_resume_tailoring.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
# WO-035: the voice mock needs career_watch_kv, so the ledger above applied it; idempotent, it must apply a second time.
# Idempotent: the voice mock migration must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021020000_career_voice_mock.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021020000_career_voice_mock.sql"
echo "== career_voice_mock.test.sql (one start per link in 10 minutes, one debrief, the text mock once, no audio)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_voice_mock.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
# WO-033: outreach drafts, do-not-contact and the claim. The migration needs career_watch_kv (its erase trigger), so the
# ledger above applied it once; it must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021010000_career_outreach.sql"
echo "== career_outreach.test.sql (approval is the exact message; 10 a day the first week, 20 by default, 30 at most; 90 seconds apart; stop is forever)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_outreach.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
# Re-applied after the earlier migrations' re-runs above: each one redefines the outbox lists, and production ends on the
# latest file's (outbox kinds only grow, tests/outbox-kinds.test.cjs), so the last re-run here must be the latest too.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021050000_career_brief_digest.sql"
echo "== career_brief_digest.test.sql (interviews and the weekly digest: own reads, stated starts only, once per key, wiped by an erase)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_brief_digest.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
# The latest migration re-applied last, as production ends (see the brief/digest re-run above).
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021070000_channel_parity.sql"
echo "== channel_parity.test.sql (WhatsApp and Telegram beside iMessage: per channel, held, linked only on a yes or a one-time link)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/channel_parity.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
# The latest migration re-applied last, as production ends (the channel parity re-run above set the outbox lists without
# 'questions').
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021075000_career_apply_ops.sql"
echo "== career_apply_ops.test.sql (who drove it, confirmed only by email, the gate, apply by email, questions pushed)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_ops.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
# The test database is SQL_ASCII; production is UTF8. career_text_spaces (the questions push compares labels with it) is
# checked in a UTF8 database of its own: a no-break and a narrow no-break space read as plain spaces.
echo "== career_text_spaces in a UTF8 database"
"${PSQL[@]}" -c "create database wo032_utf8 encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'"
sed -n '/^create or replace function public.career_text_spaces/,/^end \$\$;/p' "$ROOT/supabase/migrations/20261021075000_career_apply_ops.sql" \
  | "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d wo032_utf8 -f -
U8="$("$PGBIN/psql" -X -q -t -A -h "$WORK" -p "$PORT" -U postgres -d wo032_utf8 -c "select public.career_text_spaces(E'Are you 18\u00a0or\u202folder?  ') = 'Are you 18 or older?'")"
[[ "$U8" == t ]] || { echo "FAIL career_text_spaces does not read Unicode spaces as plain spaces in UTF8"; exit 1; }
echo "  ok   a no-break and a narrow no-break space read as plain spaces"
# WO-039: the cloud worker. Its erase trigger needs career_watch_kv, so the ledger above applied it; idempotent, it must
# apply cleanly twice more.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021080000_career_apply_cloud.sql"
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021080000_career_apply_cloud.sql"
echo "== career_apply_cloud.test.sql (the cloud worker: the gate at 3 hand submissions, opt-in, every claim limit, the throttle)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_cloud.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
# The mail erase trigger sits on career_watch_kv, so the ledger above applied it once; it must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021090000_career_mail_erase.sql"
echo "== career_mail_erase.test.sql (an erase deletes the mail events and drafts; nobody else's)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_mail_erase.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
# Delivered proactive texts join the texting thread; the trigger sits on career_outbox and reads channel_contacts, so the
# ledger above applied it once; it must apply cleanly a second time.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261021100000_career_proactive_last_word.sql"
echo "== career_proactive_last_word.test.sql (a delivered alert or receipt is the thread's last word; queued, held and replies are not written)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_proactive_last_word.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_apply_extension.test.sql (the extension records an approved application as the person, every queue rule kept)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_extension.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_apply_form_answers.test.sql (answers typed on the form kept once sent; source 'extension' for the gate)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_form_answers.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "== career_apply_authority.test.sql (an ordinary chat turn never makes an approval stale; a pause or a facts change does)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_authority.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
# WO-091d, last as production ends: the earlier re-runs above never touch what it redefines, and it is applied once more.
"${QUIET[@]}" -f "$ROOT/supabase/migrations/20261023091400_career_apply_states.sql"
echo "== career_apply_states.test.sql (every application ends: the sweep, interrupted, retry, a late finish, the person's own edges)"
"${PSQL[@]}" -t -A -o /dev/null -f "$HERE/career_apply_states.test.sql" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  /  /'
echo "db tests passed"
