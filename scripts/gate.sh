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
)
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
)

step browser-runtime browser_ready
# WO-001 has no landed architect tests. This permits that empty queue only;
# pending orders remain excluded and no landed test is filtered out.
step architect-tests deno test -A --no-check --ignore=tests/architect/pending --permit-no-files tests/architect/
step career-and-shared-tests node --test --test-concurrency=2 tests/career-*.test.cjs "${shared_tests[@]}"
step career-edge-tests deno test -A --no-check "${edge_tests[@]}"
step career-bundle python3 scripts/build-router-core.py --career-only --check
step career-typecheck deno check supabase/functions/agent-chat/index-career.ts

if (( failed )); then
  echo 'GATE FAILED'
  exit 1
fi
echo 'GATE OK'
