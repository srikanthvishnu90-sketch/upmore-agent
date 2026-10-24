#!/usr/bin/env bash
# WO-001: career code and its shared boundaries; no live/provider calls.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
failed=0
results=()
details=()
# Each step's output is printed in full, and a failed step's last lines are printed again at the end: the CI log API
# returns only a log's last 5,000 lines, so an early step's own error was unreadable there (2026-10-19).
step() {
  local label=$1 status out
  shift
  out=$(mktemp)
  if "$@" >"$out" 2>&1; then
    cat "$out"
    printf 'STEP %s OK\n' "$label"
    results+=("OK      $label")
  else
    status=$?
    cat "$out"
    printf 'STEP %s FAILED (exit %s)\n' "$label" "$status" >&2
    results+=("FAILED  $label (exit $status)")
    # The failed tests by name, wherever they are in a long log (a CI log read from its tail may not reach them), each
    # with its whole TAP block: a multi-line error (an assertion's diff, a call log) was cut at "error: |-" (2026-10-20).
    details+=("--- $label, its failed tests:" "$(awk '/=> [^ ]+:[0-9]+:[0-9]+/ { print; next }
      /^[[:space:]]*not ok / { block = 1 }
      block { print }
      block && /^[[:space:]]*\.\.\.[[:space:]]*$/ { block = 0 }' "$out" | sed -n '1,200p')")
    details+=("--- $label, its last 20 lines:" "$(tail -n 20 "$out")")
    failed=1
  fi
  rm -f "$out"
}

# A missing browser must fail the gate rather than turn driver tests into skips. The first launch on a fresh runner
# pays the cold start; how long the launch took is printed either way.
browser_ready() {
  node <<'JS'
const pw = require(process.env.UPMORE_PLAYWRIGHT_PATH || 'playwright');
const started = Date.now();
(async () => {
  const browser = await pw.chromium.launch({headless:true, chromiumSandbox:true,
    ...(process.env.UPMORE_CHROMIUM_PATH ? {executablePath:process.env.UPMORE_CHROMIUM_PATH} : {}), timeout:60000});
  await browser.close();
  console.log(`browser launched and closed in ${Date.now() - started} ms`);
})().catch(error => {
  console.error(`browser did not launch after ${Date.now() - started} ms: ${error.message}`);
  process.exitCode=1;
});
JS
}

shared_tests=(
  tests/router-bundle.test.cjs
  tests/chat-request-controller.test.cjs
  tests/chat-request-integration.test.cjs
  tests/photo-only.test.cjs
  tests/no-password-storage.test.cjs
  tests/no-secrets.test.cjs
  tests/export-coverage.test.cjs
  tests/trainee-go-live.test.cjs
  tests/deploy-provenance.test.cjs
  tests/outbox-kinds.test.cjs
  tests/career-bundle-data.test.cjs
  tests/depth-CAREER-WRITING.test.cjs
  tests/extension-package.test.cjs
  tests/extension-package-agent.test.cjs
  tests/edge-runtime-globals.test.cjs
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
career_tests=(tests/career-apply-script.test.cjs)
for test_file in tests/career-*.test.cjs; do
  if [[ "$test_file" != tests/career-apply-script.test.cjs && ${archive_tests[$test_file]:-0} != 1 ]]; then
    career_tests+=("$test_file")
  fi
done
# Career host/bridge/persistence contracts also run in the Node staged-entry
# suites. Explicit shared Edge files keep finance suites out of this selection.
edge_tests=(
  tests/edge/chat-input.test.ts
  tests/edge/gmail-code-window.test.ts
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
  tests/edge/channel-delivery.test.ts tests/edge/channel-integrity.test.ts
  tests/edge/channel-inbound.test.ts
  tests/edge/capability-journey.test.ts
  tests/edge/eval-judge.test.ts
  tests/edge/career-apply-store.test.ts
  tests/edge/career-coverage-personas.test.ts
  tests/edge/career-backlog-alerts.test.ts
  tests/edge/career-conversations-eval.test.ts
  tests/edge/career-compare.test.ts
  tests/edge/career-ask-once.test.ts
  tests/edge/control-state.test.ts
  tests/edge/fact-quarantine.test.ts
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

# CI partition (2026-10-23): the single gate job's 30-minute cap cancelled every run on the widget-carrying
# branches (see .github/workflows/ci.yml's comment history). Attribution, corrected the same day: the arch
# line's gate — this same script, byte-identical — succeeds at 19.0-19.2 min; what crossed the cap is
# test-time growth, and the heavy add is ONE suite, tests/career-forms-ci-coverage.test.cjs (40 serial fixture
# drives). The react-select battery is not the cause (it runs in ~11 s, and pre-battery trees cancelled too).
# GATE_PARTITION splits ONLY the node step's suite list between parallel CI jobs: core (everything else, all
# other steps included), browser (the remaining suites that drive a real Chromium, listed here) and coverage
# (the forms-ci suite alone, in its own job, so its drive time is nobody else's sum). Scheduling only: the
# union of the partitions is the full list, and a listed suite missing from the gate's selection fails the
# gate outright rather than silently dropping out of CI. Unset, the gate is exactly what it was — one step,
# every suite.
browser_node_tests=(
  tests/career-approval-card-browser.test.cjs
  tests/career-extension-agent-submits.test.cjs
  tests/career-extension-browser.test.cjs
  tests/career-extension-person-submits.test.cjs
  tests/career-extension-react-select.test.cjs
  tests/career-extension-workday.test.cjs
  tests/career-extension-yesno.test.cjs
  tests/career-fact-import-panel.test.cjs
  tests/career-greenhouse-savedform.test.cjs
  tests/career-owned-worker-browser.test.cjs
  tests/career-portal-browser.test.cjs
  tests/career-portal-lever-radio.test.cjs
  tests/career-portal-submit-integrity.test.cjs
  tests/career-posting-location.test.cjs
  tests/career-qa-bug04-resolver.test.cjs
  tests/career-resume-upload.test.cjs
  tests/career-widget-attach.test.cjs
  tests/career-workday-native-fields.test.cjs
)
coverage_node_tests=(
  tests/career-forms-ci-coverage.test.cjs
)
partition=${GATE_PARTITION:-all}
if [[ $partition != all && $partition != core && $partition != browser && $partition != coverage ]]; then
  echo "GATE_PARTITION must be all, core, browser or coverage (got: $partition)" >&2
  exit 1
fi
node_all_tests=("${career_tests[@]}" "${shared_tests[@]}")
declare -A browser_node_set=()
for test_file in "${browser_node_tests[@]}"; do browser_node_set["$test_file"]=1; done
declare -A coverage_node_set=()
for test_file in "${coverage_node_tests[@]}"; do coverage_node_set["$test_file"]=1; done
node_core_tests=()
node_browser_tests=()
node_coverage_tests=()
for test_file in "${node_all_tests[@]}"; do
  if [[ ${coverage_node_set[$test_file]:-0} == 1 ]]; then
    node_coverage_tests+=("$test_file")
  elif [[ ${browser_node_set[$test_file]:-0} == 1 ]]; then
    node_browser_tests+=("$test_file")
  else
    node_core_tests+=("$test_file")
  fi
done
if (( ${#node_browser_tests[@]} != ${#browser_node_tests[@]} || ${#node_coverage_tests[@]} != ${#coverage_node_tests[@]} )); then
  echo "GATE PARTITION BROKEN: ${#node_browser_tests[@]} of ${#browser_node_tests[@]} browser-listed and ${#node_coverage_tests[@]} of ${#coverage_node_tests[@]} coverage-listed suites are in the gate's selection; a listed suite was renamed or removed without updating the partition" >&2
  exit 1
fi
if [[ $partition != all ]]; then
  printf 'GATE PARTITION %s: core %s suites, browser %s suites, coverage %s suites, total %s\n' "$partition" "${#node_core_tests[@]}" "${#node_browser_tests[@]}" "${#node_coverage_tests[@]}" "${#node_all_tests[@]}"
fi

step test-paths portable_test_paths "${career_tests[@]}" "${shared_tests[@]}" "${edge_tests[@]}"
step browser-runtime browser_ready
if [[ $partition != browser && $partition != coverage ]]; then
  # Pending orders stay excluded; every landed architect test runs (an empty folder is a failure).
  step architect-tests deno test -A --no-check --ignore=tests/architect/pending tests/architect/
  step apply-cli-typecheck deno check scripts/apply.ts
fi
if [[ $partition == all ]]; then
  step career-and-shared-tests node --test --test-concurrency=2 "${node_all_tests[@]}"
elif [[ $partition == core ]]; then
  step career-and-shared-tests-core node --test --test-concurrency=2 "${node_core_tests[@]}"
elif [[ $partition == browser ]]; then
  step career-and-shared-tests-browser node --test --test-concurrency=2 "${node_browser_tests[@]}"
else
  step career-and-shared-tests-coverage node --test --test-concurrency=2 "${node_coverage_tests[@]}"
fi
if [[ $partition != browser && $partition != coverage ]]; then
  step career-edge-tests deno test -A --no-check "${edge_tests[@]}"
  step pay-importers bash -c "python3 tests/pay-importers.test.py && python3 tests/aggregate-lca.test.py"
  step career-bundle python3 scripts/build-router-core.py --career-only --check
  step career-typecheck deno check supabase/functions/agent-chat/index-career.ts supabase/functions/career-ingest/index.ts supabase/functions/career-proactive/index.ts supabase/functions/trainee-deliver/index.ts supabase/functions/trainee-inbound/index.ts supabase/functions/trainee-telegram/index.ts supabase/functions/trainee-whatsapp/index.ts supabase/functions/career-voice/index.ts supabase/functions/career-essay-draft/index.ts supabase/functions/career-email-code/index.ts supabase/functions/site-signup/index.ts supabase/functions/site-careers/index.ts
fi

# Every step's result again at the end: a CI log read from its tail still shows which step failed.
printf 'SUMMARY %s\n' "${results[@]}"
if (( failed )); then
  printf '%s\n' "${details[@]}"
  echo 'GATE FAILED'
  exit 1
fi
echo 'GATE OK'
