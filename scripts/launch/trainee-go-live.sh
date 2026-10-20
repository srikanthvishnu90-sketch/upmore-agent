#!/usr/bin/env bash
# Trainee go-live: one command from the OWNER's own shell, never an agent's (AGENTS.md: agents never deploy, apply
# migrations to a live project or create credentials). From the repo, on the exact commit to ship:
#   bash scripts/launch/trainee-go-live.sh [--dry-run] [--skip-migrations] [--skip-deploy] [--only-smoke]
#                                          [--brain agent|router] [--allow-send] [--no-wait]
# Read from the environment, or asked on a hidden prompt (read -s: never shown, never written to a file or the log):
#   SUPABASE_PROJECT_REF, SUPABASE_DB_URL        the live project and its database (Settings > Database > URI)
#   CAREER_INGEST_SECRET, CAREER_PROACTIVE_SECRET, TRAINEE_DELIVER_SECRET, TRAINEE_INBOUND_SECRET
#                                                the four function secrets (32+ of A-Z a-z 0-9 . _ ~ -, because the inbound
#                                                one rides in a URL); Enter generates a 48-character one (openssl rand -hex 24)
#   LOOPMESSAGE_API_KEY, OPENAI_API_KEY          Enter keeps the one already set on the project
#   INGEST_CONTACT_EMAIL, TRAINEE_ALLOWED_CONTACTS, LOOPMESSAGE_DAILY_CONTACTS   settings; Enter keeps what is set
#   UPMORE_TEST_JWT (optional), TRAINEE_SMOKE_CONTACT (with --allow-send)        for the smoke checks
# Steps, each a numbered STEP line ending OK or FAILED; the run stops at the first failure:
#   1 preflight   tools, inputs, a clean tree at an exact commit, deno check of the five entry points
#   2 migrations  every Trainee migration in order, each once (the ledger or the live schema says it is there), each
#                 in one transaction; the earlier career migrations are only checked (plain `create table`, so not safe
#                 to replay), and one missing live stops the run before anything is deployed on top of it
#   3 secrets     one `supabase secrets set --env-file` from a 0600 temp file removed at once; CAREER_BRAIN=agent only
#                 with --brain agent (--brain router unsets it; without --brain it is not touched)
#   4 deploy      agent-chat from the staged career-only tree (index-career.ts as agent-chat/index.ts, JWT on), then
#                 career-ingest, career-proactive, trainee-deliver, trainee-inbound with --no-verify-jwt (pg_cron and
#                 LoopMessage carry no JWT; each function checks its own secret)
#   5 schedules   the three pg_cron jobs, each secret passed by env exactly as the script's header says (it goes to Vault)
#   6 smoke       scripts/launch/trainee-smoke.cjs against the live project (waits for each schedule to fire once
#                 unless --no-wait; --allow-send also texts HELP's reply to TRAINEE_SMOKE_CONTACT through LoopMessage)
# --skip-migrations / --skip-deploy skip step 2 / 4; --only-smoke runs only 1 and 6.
# --dry-run prints every command with each secret as *** and runs nothing (tests/trainee-go-live.test.cjs).
# What each step changes, the rollback and the LoopMessage setup: docs/launch/TRAINEE-GO-LIVE.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

DRY=""; SKIP_MIG=""; SKIP_DEPLOY=""; ONLY_SMOKE=""; BRAIN=""; ALLOW_SEND=""; NOWAIT=""
while (( $# )); do
  case "$1" in
    --dry-run) DRY=1 ;;
    --skip-migrations) SKIP_MIG=1 ;;
    --skip-deploy) SKIP_DEPLOY=1 ;;
    --only-smoke) ONLY_SMOKE=1 ;;
    --brain) shift; BRAIN="${1:-}" ;;
    --brain=*) BRAIN="${1#--brain=}" ;;
    --allow-send) ALLOW_SEND=1 ;;
    --no-wait) NOWAIT=1 ;;
    -h|--help) sed -n '2,29p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)"; exit 64 ;;
  esac
  shift
done
[[ -z "$BRAIN" || "$BRAIN" == agent || "$BRAIN" == router ]] || { echo "--brain takes agent or router"; exit 64; }

# Every migration from the Trainee set on, in order, each with its proof on the live schema: one object it creates (a
# file runs in one transaction, so one is enough). tests/trainee-go-live.test.cjs fails when a migration file from
# 20261019 on is not listed here, so a new one cannot ship without go-live applying it.
MIGRATIONS=(
  20261019000000_career_postings.sql
  20261019010000_career_alerts.sql
  20261019020000_channel_delivery.sql
  20261019030000_channel_inbound.sql
  20261020000000_career_apply_jobs.sql
  20261020010000_career_apply_own_worker.sql
  20261020020000_career_apply_receipts.sql
  20261020030000_career_apply_cards.sql
  20261020040000_career_apply_card_push.sql
  20261020050000_career_apply_daily_limit.sql
  20261020060000_career_apply_questions.sql
  20261020070000_career_apply_questions_ai_policy.sql
  20261020100000_career_mail_tracking.sql
  20261020110000_career_connector.sql
  20261020120000_career_events.sql
  20261020120100_career_events_erase.sql
)
MIGRATION_MARK=(
  "to_regclass('public.career_ingest_state') is not null"
  "to_regclass('public.career_proactive_runs') is not null"
  "exists (select 1 from pg_proc where proname = 'career_outbox_contacts_on')"
  "exists (select 1 from pg_proc where proname = 'career_outbox_claim_key')"
  "to_regclass('public.career_apply_jobs') is not null"
  "exists (select 1 from pg_proc where proname = 'career_apply_claim_own')"
  "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_proactive_runs' and column_name = 'receipts')"
  "to_regclass('public.career_apply_cards') is not null"
  "exists (select 1 from pg_proc where proname = 'career_apply_card_push_for')"
  "exists (select 1 from pg_proc where proname = 'career_apply_daily_limit')"
  "to_regclass('public.career_apply_questions') is not null"
  "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_questions' and column_name = 'ai_policy')"
  "to_regclass('public.career_mail_events') is not null"
  "to_regclass('public.connector_intros') is not null"
  "to_regclass('public.career_events') is not null"
  "exists (select 1 from pg_proc where proname = 'career_host_commit' and prosrc like '%career_events%')"
)
# The career chat (agent-chat's career entry) already reads these; checked, never applied here.
EARLIER=(20261015010000_career_knowledge_base.sql 20261015020000_career_watch_kv.sql 20261015234000_career_task_intents_v1.sql
  20261016010000_career_batch_intents_v1.sql 20261016120000_career_account_stated_facts.sql)
EARLIER_MARK=("to_regclass('public.career_kb_roles') is not null"
  "to_regclass('public.career_reminder_outbox') is not null"
  "to_regclass('public.career_task_intents_v1') is not null"
  "to_regclass('public.career_batch_ledgers_v1') is not null"
  "exists (select 1 from pg_proc where proname = 'career_host_commit' and prosrc like '%stated_facts%')")
SCHEDULED=(career-ingest career-proactive trainee-deliver trainee-inbound)
SCHED_VARS=(CAREER_INGEST_SECRET CAREER_PROACTIVE_SECRET TRAINEE_DELIVER_SECRET TRAINEE_INBOUND_SECRET)

CUR=""; REPORTED=""; ENVF=""; STAGE=""
cleanup() {
  local rc=$?
  [[ -n "$ENVF" ]] && rm -f "$ENVF"
  [[ -n "$STAGE" ]] && rm -rf "$STAGE"
  if (( rc != 0 )) && [[ -n "$CUR" && -z "$REPORTED" ]]; then echo "STEP $CUR: FAILED (exit $rc)"; fi
}
trap cleanup EXIT
step() { CUR="$1"; echo; echo "STEP $1"; }
ok() { echo "STEP $CUR: OK"; CUR=""; }
skipped() { echo; echo "STEP $1: SKIPPED ($2)"; }
fail() { echo "STEP $CUR: FAILED: $1"; REPORTED=1; exit 1; }

# Every value that must never be shown. Command output passes through mask(), so a value echoed back by an error (psql
# prints the failing statement, with the secret the schedule script interpolated) never reaches the terminal or the log.
mask_values() {
  local v
  for v in SUPABASE_DB_URL CAREER_INGEST_SECRET CAREER_PROACTIVE_SECRET TRAINEE_DELIVER_SECRET TRAINEE_INBOUND_SECRET \
    LOOPMESSAGE_API_KEY OPENAI_API_KEY UPMORE_TEST_JWT TRAINEE_ALLOWED_CONTACTS TRAINEE_SMOKE_CONTACT INGEST_CONTACT_EMAIL; do
    [[ -n "${!v:-}" ]] && printf '%s\n' "${!v}"
  done
  # The database password on its own too (an error may print the URL's parts, never the whole URL).
  if [[ "${SUPABASE_DB_URL:-}" =~ $DB_PASS_RE ]]; then printf '%s\n' "${BASH_REMATCH[1]}"; fi
  return 0
}
mask() {
  TGL_MASK="$(mask_values)" awk 'BEGIN { n = split(ENVIRON["TGL_MASK"], s, "\n") }
    { for (i = 1; i <= n; i++) if (length(s[i]) >= 4) while ((p = index($0, s[i])) > 0) $0 = substr($0, 1, p - 1) "***" substr($0, p + length(s[i]))
      print; fflush() }'
}
# run "<what is printed, secrets as ***>" command...: printed always, run only for real.
run() {
  local shown="$1"; shift
  if [[ -n "$DRY" ]]; then echo "DRY: $shown"; return 0; fi
  echo "  > $shown"
  "$@" 2>&1 | mask
}

have_tty() { [[ -z "$DRY" ]] && { : </dev/tty; } 2>/dev/null; }
# ask VAR "prompt" hidden|plain [required]: only when VAR is empty and this is a real run; the value stays in this
# process. With no terminal to ask on, an optional one is taken as Enter and a required one stops the run.
ask() {
  local v="$1" p="$2" how="$3" req="${4:-}"
  [[ -n "${!v:-}" || -n "$DRY" ]] && return 0
  if ! have_tty; then
    [[ -z "$req" ]] || fail "$v is not set and there is no terminal to ask on"
    echo "  no terminal: $v taken as Enter"; return 0
  fi
  printf '%s: ' "$p" >/dev/tty
  if [[ "$how" == hidden ]]; then IFS= read -rs "$v" </dev/tty; printf '\n' >/dev/tty; else IFS= read -r "$v" </dev/tty; fi
  return 0
}
gen_secret() { if command -v openssl >/dev/null; then openssl rand -hex 24; else head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi; }
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
# A value the env file and a URL both carry safely (dotenv cuts at spaces, quotes and #).
env_safe() { case "$1" in *[[:space:]]*|*\'*|*\"*|*\#*|*\\*) return 1 ;; esac; [[ -n "$1" ]]; }
SECRET_RE='^[A-Za-z0-9._~-]{32,}$'; REF_RE='^[a-z]{20}$'; DB_RE='^postgres(ql)?://'; DB_PASS_RE='^[a-z]+://[^:/@]+:([^@]+)@'

if [[ -z "$DRY" ]]; then
  LOG="${TRAINEE_GO_LIVE_LOG:-$HOME/trainee-go-live-$(date -u +%Y%m%dT%H%M%SZ).log}"
  exec > >(tee -a "$LOG") 2>&1
  echo "log: $LOG (no secret is written to it)"
fi

# ---------------------------------------------------------------------------------------------------------------------
step "1/6 preflight"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"; echo "commit $SHA"
if [[ -n "$ONLY_SMOKE" ]]; then TOOLS=(node); else TOOLS=(supabase psql node deno git); fi
for t in "${TOOLS[@]}"; do
  command -v "$t" >/dev/null && continue
  if [[ -n "$DRY" ]]; then echo "  tool $t: missing here (the real run needs it)"; else fail "missing: $t (brew install supabase/tap/supabase libpq node deno)"; fi
done
ask SUPABASE_PROJECT_REF "Supabase project ref (the 20 letters in https://<ref>.supabase.co)" hidden required
REF="${SUPABASE_PROJECT_REF:-}"
if [[ -z "$REF" ]]; then [[ -n "$DRY" ]] || fail "SUPABASE_PROJECT_REF is empty"; REF="<ref>"
elif [[ ! "$REF" =~ $REF_RE ]]; then fail "SUPABASE_PROJECT_REF is not a project ref (20 lowercase letters)"; fi
BASE="https://$REF.supabase.co"
if [[ -n "$ONLY_SMOKE" ]]; then ask SUPABASE_DB_URL "Database connection string (Enter to skip the run-table checks)" hidden
else ask SUPABASE_DB_URL "Database connection string (Supabase > Project Settings > Database > URI)" hidden required; fi
if [[ -n "${SUPABASE_DB_URL:-}" ]]; then [[ "$SUPABASE_DB_URL" =~ $DB_RE ]] || fail "SUPABASE_DB_URL is not a postgres:// connection string"
elif [[ -z "$ONLY_SMOKE" && -z "$DRY" ]]; then fail "SUPABASE_DB_URL is empty"; fi
if [[ -n "$DRY" ]]; then echo "  tree: $([[ -z "$(git status --porcelain 2>/dev/null)" ]] && echo clean || echo 'has changes (a real run stops on that)')"
elif [[ -z "$ONLY_SMOKE" ]]; then
  [[ -z "$(git status --porcelain)" ]] || fail "the tree has uncommitted changes; go-live ships an exact commit (commit or stash first)"
fi

GENERATED=()
for v in "${SCHED_VARS[@]}"; do
  if [[ -n "$ONLY_SMOKE" ]]; then ask "$v" "$v (Enter to skip the checks that need it)" hidden
  else ask "$v" "$v (Enter to generate a new 48-character one)" hidden; fi
  if [[ -z "${!v:-}" && -z "$DRY" && -z "$ONLY_SMOKE" ]]; then printf -v "$v" '%s' "$(gen_secret)"; GENERATED+=("$v"); fi
  if [[ -n "${!v:-}" && ! "${!v}" =~ $SECRET_RE ]]; then fail "$v must be 32 or more of A-Z a-z 0-9 . _ ~ - (the value is not shown)"; fi
done
# The inbound secret lives outside this project too: it is in the webhook URL pasted into LoopMessage. Enter on a re-run
# would replace it and every inbound text would then be refused (403) without a sound, so an existing one is replaced
# only on purpose (TRAINEE_ROTATE_INBOUND=1, then paste the new URL into LoopMessage).
if [[ -z "$DRY" && -z "$ONLY_SMOKE" && " ${GENERATED[*]} " == *" TRAINEE_INBOUND_SECRET "* && "${TRAINEE_ROTATE_INBOUND:-}" != 1 ]]; then
  if supabase secrets list --project-ref "$REF" 2>/dev/null | grep -qw TRAINEE_INBOUND_SECRET; then
    fail "TRAINEE_INBOUND_SECRET is already set on the project and LoopMessage's webhook URL carries it: give the same value, or set TRAINEE_ROTATE_INBOUND=1 to replace it and then update the webhook URL"
  fi
fi
if [[ -z "$ONLY_SMOKE" ]]; then
  ask LOOPMESSAGE_API_KEY "LoopMessage API key (Enter to keep the one already set)" hidden
  ask OPENAI_API_KEY "OpenAI key (Enter to keep the one already set)" hidden
  ask INGEST_CONTACT_EMAIL "Contact email the job boards see in the User-Agent (Enter to keep the one already set)" plain
  ask TRAINEE_ALLOWED_CONTACTS "Phone numbers allowed to sign up, comma-separated (Enter to keep what is set)" hidden
  ask LOOPMESSAGE_DAILY_CONTACTS "LoopMessage contacts a day, 300 or 1000 by plan (Enter to keep; unset means 300)" plain
  for v in LOOPMESSAGE_API_KEY OPENAI_API_KEY INGEST_CONTACT_EMAIL TRAINEE_ALLOWED_CONTACTS; do
    if [[ -n "${!v:-}" ]] && ! env_safe "${!v}"; then fail "$v has a space, quote, # or backslash (the value is not shown)"; fi
  done
  [[ -z "${INGEST_CONTACT_EMAIL:-}" || "$INGEST_CONTACT_EMAIL" == *@* ]] || fail "INGEST_CONTACT_EMAIL is not an email address"
  [[ -z "${LOOPMESSAGE_DAILY_CONTACTS:-}" || "$LOOPMESSAGE_DAILY_CONTACTS" =~ ^[1-9][0-9]*$ ]] || fail "LOOPMESSAGE_DAILY_CONTACTS must be a whole number of contacts a day"
fi
ask UPMORE_TEST_JWT "Test user JWT for the agent-chat check (Enter to skip that check)" hidden
if [[ -n "$ALLOW_SEND" ]]; then
  ask TRAINEE_SMOKE_CONTACT "Your own phone number for the HELP text (--allow-send texts it)" hidden required
  [[ -n "${TRAINEE_SMOKE_CONTACT:-}" || -n "$DRY" ]] || fail "--allow-send needs TRAINEE_SMOKE_CONTACT, the number the HELP reply goes to"
fi
if [[ -z "$ONLY_SMOKE" && -z "$SKIP_DEPLOY" ]]; then
  CHECK=(supabase/functions/agent-chat/index-career.ts supabase/functions/career-ingest/index.ts supabase/functions/career-proactive/index.ts
    supabase/functions/trainee-deliver/index.ts supabase/functions/trainee-inbound/index.ts)
  run "deno check ${CHECK[*]}" deno check "${CHECK[@]}"
fi
ok

# ---------------------------------------------------------------------------------------------------------------------
if [[ -n "$ONLY_SMOKE" || -n "$SKIP_MIG" ]]; then skipped "2/6 migrations" "$([[ -n "$ONLY_SMOKE" ]] && echo --only-smoke || echo --skip-migrations)"
else
  step "2/6 migrations"
  export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
  P=(psql "${SUPABASE_DB_URL:-}" -X -q -v ON_ERROR_STOP=1)
  sql_to() { # sql_to VAR "query": one value read from the live database
    local out
    if ! out="$("${P[@]}" -tAc "$2" 2>&1)"; then printf '%s\n' "$out" | mask; fail "a read of the live database failed"; fi
    printf -v "$1" '%s' "$out"
  }
  if [[ -n "$DRY" ]]; then
    echo "DRY: psql *** -tA: read the ledger public.upmore_migration_ledger (missing or empty: left alone, apply-rails-and-seed.sh --pending backfills it)"
    for i in "${!EARLIER[@]}"; do echo "DRY: psql *** -tA: check ${EARLIER[$i]} is on the live project (ledger or: ${EARLIER_MARK[$i]}); missing stops the run, never applied here"; done
    for i in "${!MIGRATIONS[@]}"; do
      echo "DRY: psql *** -X -q -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/${MIGRATIONS[$i]} (only if neither the ledger nor the live schema has it: ${MIGRATION_MARK[$i]}; its ledger row in the same transaction)"
    done
  else
    sql_to LEDGER "select case when to_regclass('public.upmore_migration_ledger') is null then 'missing' when exists (select 1 from public.upmore_migration_ledger) then 'ok' else 'empty' end"
    # An empty ledger is apply-rails-and-seed.sh's to backfill on its first run; a row written here would stop that backfill.
    [[ "$LEDGER" == ok ]] && echo "  ledger: public.upmore_migration_ledger" || echo "  ledger: $LEDGER, left alone; the live schema decides what is applied"
    in_ledger() { local n; [[ "$LEDGER" == ok ]] || return 1; sql_to n "select count(*) from public.upmore_migration_ledger where filename = '$1'"; [[ "$n" != 0 ]]; }
    MISSING=()
    for i in "${!EARLIER[@]}"; do
      f="${EARLIER[$i]}"; sql_to live "select (${EARLIER_MARK[$i]})"
      if [[ "$live" == t ]]; then echo "  earlier $f: on the live project$(in_ledger "$f" && echo ' (ledger)' || echo ' (not in the ledger)')"
      else echo "  earlier $f: NOT on the live project"; MISSING+=("$f"); fi
    done
    if (( ${#MISSING[@]} )); then
      fail "the career chat needs ${MISSING[*]}; these use plain create table and are not safe to replay, so apply each by hand after checking: psql \"\$SUPABASE_DB_URL\" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/<file>; then re-run"
    fi
    for i in "${!MIGRATIONS[@]}"; do
      f="${MIGRATIONS[$i]}"; path="supabase/migrations/$f"; sum="$(sha256 "$path")"
      if in_ledger "$f"; then echo "  $f: applied before (ledger), skipped"; continue; fi
      sql_to live "select (${MIGRATION_MARK[$i]})"
      if [[ "$live" == t ]]; then
        echo "  $f: already on the live project, not applied again"
        [[ "$LEDGER" == ok ]] && "${P[@]}" -c "insert into public.upmore_migration_ledger(filename,sha256) values ('$f','$sum') on conflict do nothing" 2>&1 | mask
        continue
      fi
      args=(-f "$path"); [[ "$LEDGER" == ok ]] && args+=(-c "insert into public.upmore_migration_ledger(filename,sha256) values ('$f','$sum') on conflict do nothing")
      run "psql *** -X -q -v ON_ERROR_STOP=1 --single-transaction -f $path" "${P[@]}" --single-transaction "${args[@]}"
      sql_to live "select (${MIGRATION_MARK[$i]})"; [[ "$live" == t ]] || fail "$f ran but its objects are not there"
      echo "  $f: applied, sha256 $sum"
    done
  fi
  ok
fi

# ---------------------------------------------------------------------------------------------------------------------
if [[ -n "$ONLY_SMOKE" ]]; then skipped "3/6 secrets" "--only-smoke"
else
  step "3/6 secrets"
  NAMES=(); LINES=()
  add() { NAMES+=("$1=$3"); LINES+=("$1=$2"); }
  for v in "${SCHED_VARS[@]}"; do if [[ -n "${!v:-}" ]]; then add "$v" "${!v}" "***"; else add "$v" "" "<generated>"; fi; done
  if [[ -n "${INGEST_CONTACT_EMAIL:-}" ]]; then add INGEST_CONTACT_EMAIL "$INGEST_CONTACT_EMAIL" "***"; else echo "  kept: INGEST_CONTACT_EMAIL (not given; career-ingest answers 503 until it is set)"; fi
  if [[ -n "${LOOPMESSAGE_API_KEY:-}" ]]; then add LOOPMESSAGE_API_KEY "$LOOPMESSAGE_API_KEY" "***"; else echo "  kept: LOOPMESSAGE_API_KEY (not given; without one, delivery and inbound answer 503 NOT_WIRED)"; fi
  if [[ -n "${LOOPMESSAGE_DAILY_CONTACTS:-}" ]]; then add LOOPMESSAGE_DAILY_CONTACTS "$LOOPMESSAGE_DAILY_CONTACTS" "***"; else echo "  kept: LOOPMESSAGE_DAILY_CONTACTS (unset means 300 a day)"; fi
  if [[ -n "${TRAINEE_ALLOWED_CONTACTS:-}" ]]; then add TRAINEE_ALLOWED_CONTACTS "$TRAINEE_ALLOWED_CONTACTS" "***"; else echo "  kept: TRAINEE_ALLOWED_CONTACTS (sign-up stays closed to anyone not listed or already linked)"; fi
  # OpenAI only (owner, 2026-10-12): the key goes with MODEL_PROVIDER=openai, as in go-live.sh.
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then add OPENAI_API_KEY "$OPENAI_API_KEY" "***"; add MODEL_PROVIDER openai openai; else echo "  kept: OPENAI_API_KEY (not given; an already-set key stays as it is)"; fi
  # The router answers unless the owner asks for the agent brain on this run (D-008); the environment never decides it.
  if [[ "$BRAIN" == agent ]]; then add CAREER_BRAIN agent agent; fi
  if [[ -n "$DRY" ]]; then echo "DRY: supabase secrets set --project-ref $REF --env-file <0600 temp file: ${NAMES[*]}>"
  else
    ENVF="$(umask 077; mktemp "${TMPDIR:-/tmp}/trainee-secrets.XXXXXX")"; chmod 600 "$ENVF"
    printf '%s\n' "${LINES[@]}" >"$ENVF"
    echo "  > supabase secrets set --project-ref $REF --env-file <0600 temp file: ${NAMES[*]}>"
    supabase secrets set --project-ref "$REF" --env-file "$ENVF" 2>&1 | mask
    rm -f "$ENVF"; ENVF=""
  fi
  unset LINES
  case "$BRAIN" in
    agent) echo "  CAREER_BRAIN=agent: the agent brain answers career turns (the router still takes structured tasks and model outages)" ;;
    router) run "supabase secrets unset CAREER_BRAIN --project-ref $REF" supabase secrets unset CAREER_BRAIN --project-ref "$REF" ;;
    *) echo "  CAREER_BRAIN not touched (the router answers unless it was set to agent before; --brain agent|router changes it)" ;;
  esac
  if (( ${#GENERATED[@]} )); then
    echo "  generated: ${GENERATED[*]} (48 characters each; kept only in this process)"
    # Shown once, on the terminal only (never the log), and only when asked: TRAINEE_INBOUND_SECRET goes into
    # LoopMessage's webhook URL, and a lost one is replaced by re-running with a new value.
    if have_tty; then
      printf 'Show the generated secrets once on this terminal? They go nowhere else; anyone who sees the screen can call these functions. [y/N] ' >/dev/tty
      IFS= read -r yn </dev/tty || yn=""
      if [[ "$yn" == y || "$yn" == Y ]]; then
        for v in "${GENERATED[@]}"; do printf '  %s=%s\n' "$v" "${!v}" >/dev/tty; done
        printf 'WARNING: copy what you need now (the inbound one into the LoopMessage webhook URL), then clear the screen.\n' >/dev/tty
      fi
    fi
  fi
  ok
fi

# ---------------------------------------------------------------------------------------------------------------------
if [[ -n "$ONLY_SMOKE" || -n "$SKIP_DEPLOY" ]]; then skipped "4/6 deploy" "$([[ -n "$ONLY_SMOKE" ]] && echo --only-smoke || echo --skip-deploy)"
else
  step "4/6 deploy"
  # The live agent-chat is the career-only artifact (owner, 2026-10-15): the import graph of index-career.ts, staged with
  # it as agent-chat/index.ts. Deploying agent-chat from the repo tree would ship the shelved finance entry instead.
  RB="$HOME/trainee-rollback/agent-chat-$(date -u +%Y%m%dT%H%M%SZ)"
  if [[ -n "$DRY" ]]; then
    echo "DRY: supabase functions download agent-chat --project-ref $REF (into $HOME/trainee-rollback/agent-chat-<UTC>; best effort, the rollback copy)"
    echo "DRY: node scripts/career/stage-career.cjs <stage>/supabase/functions (index-career.ts staged as agent-chat/index.ts)"
    echo "DRY: (cd <stage> && supabase functions deploy agent-chat --project-ref $REF) (verify_jwt = true)"
  else
    mkdir -p "$RB"
    if (cd "$RB" && supabase functions download agent-chat --project-ref "$REF" 2>&1 | mask); then echo "  rollback copy of the live agent-chat: $RB"
    else echo "  WARN: could not download the live agent-chat; the rollback is re-deploying the previous commit (docs/launch/TRAINEE-GO-LIVE.md)"; fi
    STAGE="$(mktemp -d "${TMPDIR:-/tmp}/trainee-agent-chat.XXXXXX")"
    run "node scripts/career/stage-career.cjs $STAGE/supabase/functions" node scripts/career/stage-career.cjs "$STAGE/supabase/functions"
    printf '[functions.agent-chat]\nverify_jwt = true\n' >"$STAGE/supabase/config.toml"
    echo "  > (cd $STAGE && supabase functions deploy agent-chat --project-ref $REF)"
    (cd "$STAGE" && supabase functions deploy agent-chat --project-ref "$REF") 2>&1 | mask
  fi
  for fn in "${SCHEDULED[@]}"; do
    run "supabase functions deploy $fn --project-ref $REF --no-verify-jwt" supabase functions deploy "$fn" --project-ref "$REF" --no-verify-jwt
  done
  ok
fi

# ---------------------------------------------------------------------------------------------------------------------
if [[ -n "$ONLY_SMOKE" ]]; then skipped "5/6 schedules" "--only-smoke"
else
  step "5/6 schedules"
  # Each script's header: SECRET=... psql "$SUPABASE_DB_URL" -v url=https://<ref>.supabase.co/functions/v1/<fn> -f <file>.
  sched() {
    local var="$1" fn="$2" file="$3"
    run "$var=*** psql *** -X -q -v ON_ERROR_STOP=1 -v url=$BASE/functions/v1/$fn -f $file" \
      env "$var=${!var:-}" psql "${SUPABASE_DB_URL:-}" -X -q -v ON_ERROR_STOP=1 -v url="$BASE/functions/v1/$fn" -f "$file"
  }
  sched CAREER_INGEST_SECRET career-ingest scripts/launch/schedule-career-ingest.sql
  sched CAREER_PROACTIVE_SECRET career-proactive scripts/launch/schedule-career-proactive.sql
  sched TRAINEE_DELIVER_SECRET trainee-deliver scripts/launch/schedule-trainee-deliver.sql
  ok
fi

# ---------------------------------------------------------------------------------------------------------------------
step "6/6 smoke"
SMOKE_ENV=("SUPABASE_URL=$BASE"); SMOKE_SHOWN="SUPABASE_URL=$BASE"
for v in "${SCHED_VARS[@]}" SUPABASE_DB_URL UPMORE_TEST_JWT TRAINEE_SMOKE_CONTACT; do
  if [[ -n "${!v:-}" ]]; then SMOKE_ENV+=("$v=${!v}"); SMOKE_SHOWN+=" $v=***"; fi
done
SMOKE_ARGS=()
[[ -n "$ALLOW_SEND" ]] && SMOKE_ARGS+=(--allow-send)
# Right after scheduling, the jobs have not fired yet: wait for each to fire once (ingest and alerts run every 5 minutes).
[[ -z "$NOWAIT" && -z "$ONLY_SMOKE" ]] && SMOKE_ARGS+=(--wait-runs 420)
SMOKE_SHOWN+=" node scripts/launch/trainee-smoke.cjs${SMOKE_ARGS[*]+ ${SMOKE_ARGS[*]}}"
if [[ -n "$DRY" ]]; then echo "DRY: $SMOKE_SHOWN"
else
  echo "  > $SMOKE_SHOWN"
  set +e
  env "${SMOKE_ENV[@]}" node scripts/launch/trainee-smoke.cjs ${SMOKE_ARGS[@]+"${SMOKE_ARGS[@]}"} 2>&1 | mask
  code=${PIPESTATUS[0]}
  set -e
  (( code == 2 )) && fail "smoke NOT RUN: an input it needs is missing (see above)"
  (( code == 0 )) || fail "a smoke check failed (see above); nothing was rolled back, see docs/launch/TRAINEE-GO-LIVE.md"
fi
ok

echo
echo "done on $SHA. LoopMessage webhook: $BASE/functions/v1/trainee-inbound?secret=<TRAINEE_INBOUND_SECRET>"
echo "rollback and what each step changed: docs/launch/TRAINEE-GO-LIVE.md"
