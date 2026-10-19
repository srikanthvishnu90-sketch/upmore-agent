#!/usr/bin/env bash
# WO-001: career code and its shared boundaries; no live/provider calls.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
failed=0
step() {
  local label=$1 status
  shift
  if "$@"; then
    printf 'STEP %s OK\n' "$label"
  else
    status=$?
    printf 'STEP %s FAILED (exit %s)\n' "$label" "$status" >&2
    failed=1
  fi
}

# A missing browser must fail the gate rather than turn driver tests into skips.
browser_ready() {
  node <<'JS'
const pw = require(process.env.UPMORE_PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const browser = await pw.chromium.launch({headless:true, chromiumSandbox:true,
    ...(process.env.UPMORE_CHROMIUM_PATH ? {executablePath:process.env.UPMORE_CHROMIUM_PATH} : {}), timeout:15000});
  await browser.close();
})().catch(error => { console.error(error.message); process.exitCode=1; });
JS
}

shared_tests=(
  tests/router-bundle.test.cjs
  tests/chat-request-controller.test.cjs
  tests/chat-request-integration.test.cjs
  tests/photo-only.test.cjs
  tests/no-password-storage.test.cjs
  tests/no-secrets.test.cjs
  tests/trainee-go-live.test.cjs
  tests/export-coverage.test.cjs
)
# Architect ruling: historical external-file evidence stays archived, not
# edited or deleted. Every other career test remains in the automatic selection.
declare -A archive_tests=(
  [tests/career-a4-carriage-w5.test.cjs]=1
  [tests/career-clock-source-guard.test.cjs]=1
  [tests/career-gauntlet-cvar-a.test.cjs]=1
  [tests/career-gauntlet-cvarb.test.cjs]=1
  [tests/career-gauntlet-pilot.test.cjs]=1
  [tests/career-gauntlet-r2.test.cjs]=1
  [tests/career-gauntlet-r2a.test.cjs]=1
  [tests/career-gauntlet-regressions.test.cjs]=1
  [tests/career-gauntlet-rerun.test.cjs]=1
  [tests/career-gauntlet-u.test.cjs]=1
  [tests/career-quality-onboarding.test.cjs]=1
  [tests/career-quality-routing.test.cjs]=1
  [tests/career-spec-gates.test.cjs]=1
  [tests/career-template-breakup-guard.test.cjs]=1
  [tests/career-wording-backlog-guard.test.cjs]=1
)
career_tests=()
for test_file in tests/career-*.test.cjs; do
  if [[ ${archive_tests[$test_file]:-0} != 1 ]]; then
    career_tests+=("$test_file")
  fi
done
# Career host/bridge/persistence contracts also run in the Node staged-entry
# suites. Explicit shared Edge files keep finance suites out of this selection.
edge_tests=(
  tests/edge/chat-input.test.ts
  tests/edge/chat-cors.test.ts
  tests/edge/chat-session.test.ts
  tests/edge/identity-redact.test.ts
  tests/edge/model-gateway.test.ts
  tests/edge/model-calls.test.ts
  tests/edge/model-errors.test.ts
  tests/edge/agent-guards.test.ts
  tests/edge/conversation-hardening.test.ts
  tests/edge/career-ingest.test.ts
  tests/edge/career-alerts.test.ts
  tests/edge/career-proactive.test.ts
  tests/edge/channel.test.ts
  tests/edge/channel-delivery.test.ts
  tests/edge/channel-inbound.test.ts
  tests/edge/capability-journey.test.ts
  tests/edge/eval-judge.test.ts
  tests/edge/career-coverage-personas.test.ts
  tests/edge/career-backlog-alerts.test.ts
  tests/edge/career-conversations-eval.test.ts
  tests/edge/career-apply-store.test.ts
)

portable_test_paths() {
  python3 - "$@" <<'PY'
from pathlib import Path
import sys
files = {Path(name) for name in sys.argv[1:]}
for path in Path('tests/architect').rglob('*'):
    if path.is_file() and 'pending' not in path.parts and ('.test.' in path.name or '_test.' in path.name):
        files.add(path)
bad = []
for path in sorted(files):
    text = path.read_text()
    if 'your_files' in text or '/workspace/' in text:
        bad.append(str(path))
        print('Non-portable gated test: ' + str(path), file=sys.stderr)
sys.exit(bool(bad))
PY
}

step test-paths portable_test_paths "${career_tests[@]}" "${shared_tests[@]}" "${edge_tests[@]}"
step browser-runtime browser_ready
# Pending orders stay excluded; every landed architect test runs (an empty folder is a failure).
step architect-tests deno test -A --no-check --ignore=tests/architect/pending tests/architect/
step career-and-shared-tests node --test --test-concurrency=2 "${career_tests[@]}" "${shared_tests[@]}"
step career-edge-tests deno test -A --no-check "${edge_tests[@]}"
step career-bundle python3 scripts/build-router-core.py --career-only --check
step career-typecheck deno check supabase/functions/agent-chat/index-career.ts supabase/functions/career-ingest/index.ts supabase/functions/career-proactive/index.ts supabase/functions/trainee-deliver/index.ts supabase/functions/trainee-inbound/index.ts

if (( failed )); then
  echo 'GATE FAILED'
  exit 1
fi
echo 'GATE OK'
