#!/usr/bin/env bash
# One command from the owner's shell: everything between "built" and "tested live" (Option A, BUILD-STATUS).
#
#   SUPABASE_DB_URL='postgresql://...'      the live database (Project Settings > Database > Connection string)
#   GAUNTLET_PASSWORD='...'                 the password of gauntlet-test@upmore.test (mints a fresh 1-hour JWT here;
#                                           the JWT goes into this process's environment only, never a file)
#   ALPACA_OAUTH_CLIENT_ID / ALPACA_OAUTH_CLIENT_SECRET   optional: set as function secrets for Brokerage connect
#   bash scripts/launch/go-live.sh [--no-wait]
#
# Needs: the supabase CLI logged in (`supabase login`), psql, node 18+, curl, jq. Stops at the first failure.
#   0. preflight: clean tree, the exact commit, the local checks green (node tests, bundle current)
#   1. migrations: all 22 pending, ONE transaction, then the gauntlet seed and the read-only RLS proof
#   2. secrets: the Alpaca OAuth pair, only if given (values via a 0600 temp file, never echoed)
#   3. deploy: agent-chat, broker-oauth-start, broker-oauth-callback (--no-verify-jwt: a browser redirect carries no JWT)
#   4. smoke: unauthenticated calls answer 401, and the callback answers with the NEW code (proves the deploy took)
#   5. gauntlet against the live handler: spec16, sloppy, l3 (--no-wait reports the timed turns NOT RUN instead of
#      waiting 11 minutes); raw replies in evals/gauntlet/results/<label>*.json
#   6. prints the rollback command
# GO_LIVE_DRY_RUN=1 prints every step without touching anything (tested in tests/go-live.test.cjs).
set -euo pipefail
cd "$(dirname "$0")/../.."
REF=mrwngntwmnaqrqhupvlt
BASE="https://$REF.supabase.co"
DRY="${GO_LIVE_DRY_RUN:-}"
NOWAIT=""; [[ "${1:-}" == "--no-wait" ]] && NOWAIT="--no-wait"
say() { echo "== $*"; }
do_() { if [[ -n "$DRY" ]]; then echo "DRY: $*"; else "$@"; fi; }

say "0. preflight"
SHA="$(git rev-parse --short HEAD)"
if [[ -z "$DRY" ]]; then
  : "${SUPABASE_DB_URL:?set SUPABASE_DB_URL}"; : "${GAUNTLET_PASSWORD:?set GAUNTLET_PASSWORD (gauntlet-test@upmore.test)}"
  for t in supabase psql node curl jq; do command -v "$t" >/dev/null || { echo "missing: $t"; exit 1; }; done
  [[ -z "$(git status --porcelain)" ]] || { echo "the tree has uncommitted changes; the live test must run on an exact commit"; exit 1; }
  node --test tests/*.cjs >/tmp/upmore-go-live-tests.log 2>&1 || { echo "local tests are red (see /tmp/upmore-go-live-tests.log); nothing was touched"; exit 1; }
  python3 scripts/build-router-core.py --check
fi
echo "commit $SHA"

say "1. migrations (one transaction), seed, RLS proof"
do_ bash scripts/launch/apply-rails-and-seed.sh --all

say "2. secrets"
if [[ -n "${ALPACA_OAUTH_CLIENT_ID:-}" && -n "${ALPACA_OAUTH_CLIENT_SECRET:-}" ]]; then
  if [[ -n "$DRY" ]]; then echo "DRY: supabase secrets set --project-ref $REF --env-file <0600 temp file: ALPACA_OAUTH_CLIENT_ID, ALPACA_OAUTH_CLIENT_SECRET>"
  else
    ENVF="$(mktemp)"; chmod 600 "$ENVF"; trap 'rm -f "$ENVF"' EXIT
    printf 'ALPACA_OAUTH_CLIENT_ID=%s\nALPACA_OAUTH_CLIENT_SECRET=%s\n' "$ALPACA_OAUTH_CLIENT_ID" "$ALPACA_OAUTH_CLIENT_SECRET" >"$ENVF"
    supabase secrets set --project-ref "$REF" --env-file "$ENVF" >/dev/null; rm -f "$ENVF"; echo "set: ALPACA_OAUTH_CLIENT_ID, ALPACA_OAUTH_CLIENT_SECRET"
  fi
else
  echo "skipped: no Alpaca OAuth pair given; Connect will say it isn't switched on yet (honest, 503)"
fi

say "3. deploy"
do_ supabase functions deploy agent-chat --project-ref "$REF"
do_ supabase functions deploy broker-oauth-start --project-ref "$REF"
do_ supabase functions deploy broker-oauth-callback --project-ref "$REF" --no-verify-jwt

say "4. smoke (the new code is what answers)"
expect() { local want="$1" got="$2" what="$3"; if [[ "$got" == "$want" ]]; then echo "ok   $what ($got)"; else echo "FAIL $what: wanted $want, got $got"; exit 1; fi; }
if [[ -n "$DRY" ]]; then echo "DRY: POST agent-chat with no JWT -> 401; POST broker-oauth-start with no JWT -> 401; GET broker-oauth-callback?state=x -> 302 to #you?broker=error&reason=state_invalid"
else
  expect 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/functions/v1/agent-chat")" "agent-chat refuses a call with no JWT"
  expect 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/functions/v1/broker-oauth-start")" "broker-oauth-start refuses a call with no JWT"
  LOC="$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/functions/v1/broker-oauth-callback?state=x&code=y")"
  [[ "$LOC" == *"#you?broker=error&reason=state_invalid" ]] && echo "ok   broker-oauth-callback is the new code ($LOC)" || { echo "FAIL broker-oauth-callback answered '$LOC'"; exit 1; }
fi

say "5. live gauntlet on $SHA"
if [[ -n "$DRY" ]]; then echo "DRY: mint a 1-hour JWT for gauntlet-test@upmore.test (password grant, anon key from index.html), then run spec16, sloppy, l3 against $BASE/functions/v1/agent-chat"
else
  ANON="$(grep -o 'UPMORE_ANON_KEY = "[^"]*"' index.html | head -1 | sed 's/.*= "//;s/"$//')"
  UPMORE_TEST_JWT="$(curl -s -X POST "$BASE/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'content-type: application/json' \
    -d "$(jq -n --arg e gauntlet-test@upmore.test --arg p "$GAUNTLET_PASSWORD" '{email:$e,password:$p}')" | jq -r .access_token)"
  [[ -n "$UPMORE_TEST_JWT" && "$UPMORE_TEST_JWT" != "null" ]] || { echo "FAIL: could not sign in as gauntlet-test@upmore.test"; exit 1; }
  export UPMORE_TEST_JWT UPMORE_CHAT_URL="$BASE/functions/v1/agent-chat"
  for s in spec16 sloppy l3; do node evals/gauntlet/run-live.cjs --suite "$s" --label "go-live-$SHA-$s" $NOWAIT || true; done
  unset UPMORE_TEST_JWT
fi

say "6. rollback, if the live handler misbehaves (the migrations stay; v203 runs on them)"
echo "   see scripts/launch/rollback/agent-chat-v203/README.md"
say "done on $SHA"
