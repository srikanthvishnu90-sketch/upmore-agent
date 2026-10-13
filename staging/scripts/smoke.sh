#!/usr/bin/env bash
# staging/scripts/smoke.sh — the STAGING-tier gate probe. Owner-run only, after
# migrate + deploy-functions + seed have run against the same staging ref.
#
# Usage:
#   STAGING_REF=<ref> STAGING_TEST_PASSWORD=<pw> bash staging/scripts/smoke.sh [--dry-run]
#   (or preset UPMORE_TEST_JWT to skip the sign-in and use that token directly)
#
# What it does: signs in as the seeded gauntlet test user (GoTrue password
# grant, anon key fetched transiently — never stored), POSTs ONE career message
# to the staging agent-chat URL, asserts the reply is non-empty AND passes the
# repo's reply oracle (scripts/career/reply-oracle.cjs, checkText), prints
# PASS/FAIL.
#
# What a PASS proves — and what it does NOT (read before quoting it):
#   PROVES: staging project reachable, JWT auth through the gateway, agent-chat
#   executes end-to-end on staging, reply is a non-empty human-clean bubble.
#   DOES NOT PROVE: a career answer. The production handler has no career route
#   (audit D-10; modules 130/141/143 are not even in the router_core bundle),
#   so until that wiring lands, this message is answered by the finance/model
#   path. Smoke PASS = the staging PLUMBING is live. Career grading at STAGING
#   tier starts only when the graded runner re-points (staging/RUNNER-REPOINT.md)
#   AND D-10 is closed. Never report a smoke PASS as a career PASS.
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
ORACLE="$REPO_ROOT/scripts/career/reply-oracle.cjs"
TEST_EMAIL="${STAGING_TEST_EMAIL:-gauntlet-staging@example.test}"
CHAT_URL="https://${REF}.supabase.co/functions/v1/agent-chat"
MESSAGE="${STAGING_SMOKE_MESSAGE:-Help me find a job — I am looking for internship roles that fit my profile.}"

# --- production / safety guard (must stay in this file; verified by grep) ---
if [ -z "$REF" ]; then
  echo "REFUSE: no staging ref given. Set STAGING_REF=<staging project ref> (never the production ref $PROD_REF)." >&2
  exit 64
fi
if [ "$REF" = "$PROD_REF" ]; then
  echo "REFUSE: ref $REF is the PRODUCTION Upmore project (mrwngntwmnaqrqhupvlt). The smoke probe never runs against production." >&2
  exit 64
fi
if [ "$REF" = "$SPORV_REF" ]; then
  echo "REFUSE: ref $REF is the Sporv project. Out of scope for Upmore staging." >&2
  exit 64
fi
case "$REF" in *[!a-z0-9]*|"") echo "REFUSE: ref '$REF' is not a bare Supabase project ref." >&2; exit 64;; esac

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY RUN — smoke.sh against staging ref: $REF (production ref $PROD_REF refused)"
  echo "step 0: guard — refuse if ref == $PROD_REF (production) or == $SPORV_REF (Sporv)"
  echo "step 1: obtain test-user JWT: preset \$UPMORE_TEST_JWT, else fetch anon key transiently (Management API /projects/$REF/api-keys) and POST https://$REF.supabase.co/auth/v1/token?grant_type=password {email: $TEST_EMAIL, password: \$STAGING_TEST_PASSWORD}"
  echo "step 2: POST $CHAT_URL {message: \"$MESSAGE\"} with apikey + Bearer <test JWT> (Origin: http://localhost:8000, a CORS-allowlisted origin)"
  echo "step 3: assert HTTP reply JSON has a non-empty .reply string"
  echo "step 4: run the repo reply oracle: node -e require('$ORACLE').checkText(reply) — assert pass == true (no hard-fail rules)"
  echo "step 5: print PASS/FAIL smoke (tier: STAGING plumbing probe — not a career verdict)"
  echo "DRY RUN complete. Nothing was executed."
  exit 0
fi

[ -f "$ORACLE" ] || { echo "FAIL: reply oracle missing: $ORACLE" >&2; exit 1; }
command -v node >/dev/null || { echo "FAIL: node not on PATH (needed for the reply oracle)" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Step 1: JWT — preset wins; otherwise password grant with a transient anon key.
if [ -n "${UPMORE_TEST_JWT:-}" ]; then
  JWT="$UPMORE_TEST_JWT"
else
  [ -n "${STAGING_TEST_PASSWORD:-}" ] || {
    echo "FAIL: set STAGING_TEST_PASSWORD (from seed.sh) or preset UPMORE_TEST_JWT." >&2; exit 1; }
  JWT="$(SUPABASE_REF="$REF" SB_PY="$SB" TEST_EMAIL="$TEST_EMAIL" python3 - <<'PY'
import importlib.util, json, os, sys, urllib.request, urllib.error
spec = importlib.util.spec_from_file_location("sb", os.environ["SB_PY"])
sb = importlib.util.module_from_spec(spec); spec.loader.exec_module(sb)
st, keys = sb.req("GET", f"/projects/{os.environ['SUPABASE_REF']}/api-keys")
if st != 200 or not isinstance(keys, list):
    print("key fetch failed", file=sys.stderr); sys.exit(1)
anon = next(k["api_key"] for k in keys if k.get("name") == "anon")
base = f"https://{os.environ['SUPABASE_REF']}.supabase.co"
r = urllib.request.Request(base + "/auth/v1/token?grant_type=password", method="POST")
r.add_header("apikey", anon); r.add_header("Content-Type", "application/json")
r.data = json.dumps({"email": os.environ["TEST_EMAIL"],
                     "password": os.environ["STAGING_TEST_PASSWORD"]}).encode()
try:
    with urllib.request.urlopen(r, timeout=60) as resp:
        data = json.loads(resp.read().decode() or "{}")
except urllib.error.HTTPError as e:
    print(f"sign-in failed: HTTP {e.code}", file=sys.stderr); sys.exit(1)
tok = data.get("access_token")
if not tok:
    print("sign-in returned no access_token", file=sys.stderr); sys.exit(1)
print(tok)
PY
)"
fi

# Step 2: one career message through the real staging message path.
HTTP_OUT="$(curl -s --http1.1 --max-time 120 -w '\n%{http_code}' -X POST "$CHAT_URL" \
  -H "apikey: $JWT" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8000" \
  -d "{\"message\": \"$MESSAGE\"}")"
HTTP_CODE="$(printf '%s' "$HTTP_OUT" | tail -1)"
BODY="$(printf '%s' "$HTTP_OUT" | sed '$d')"
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL smoke: agent-chat returned HTTP $HTTP_CODE on staging ref $REF" >&2
  printf '%s\n' "$BODY" | head -5 >&2
  exit 1
fi

# Step 3: non-empty reply.
printf '%s' "$BODY" | python3 -c '
import json, sys
try: data = json.load(sys.stdin)
except Exception: print("FAIL smoke: response was not JSON", file=sys.stderr); sys.exit(1)
reply = data.get("reply")
if not isinstance(reply, str) or not reply.strip():
    print("FAIL smoke: reply missing or empty", file=sys.stderr); sys.exit(1)
sys.stdout.write(reply)
' > "$TMP/reply.txt" || exit 1

# Step 4: the repo's reply oracle judges the bubble. Both entry points run:
# checkText for the bubble rules, and checkMessages on the user->agent pair
# because empty-reply is a transcript rule there (checkText("") passes
# vacuously — verified offline 2026-10-13; step 3 above also asserts non-empty).
if SMOKE_MESSAGE="$MESSAGE" node -e '
const fs = require("fs");
const oracle = require(process.argv[1]);
const text = fs.readFileSync(process.argv[2], "utf8");
const r = oracle.checkText(text);
const pair = oracle.checkMessages([
  { role: "user", text: process.env.SMOKE_MESSAGE || "career smoke message" },
  { role: "agent", text },
]);
const failures = [...r.failures, ...pair.failures];
if (failures.length) {
  console.error("FAIL smoke: reply oracle hard fails: " +
    failures.map((f) => `${f.rule} @seq ${f.seq}: ${f.excerpt}`).join("; "));
  process.exit(1);
}
if (r.warnings && r.warnings.length) {
  console.log("oracle warnings (advisory only): " +
    r.warnings.map((w) => w.rule).join(", "));
}
' "$ORACLE" "$TMP/reply.txt"; then
  echo "reply: $(cat "$TMP/reply.txt")"
  echo "PASS smoke: staging agent-chat answered with a non-empty, oracle-clean reply (tier: STAGING plumbing probe; career verdicts come from the graded runner — see staging/RUNNER-REPOINT.md)"
else
  exit 1
fi
