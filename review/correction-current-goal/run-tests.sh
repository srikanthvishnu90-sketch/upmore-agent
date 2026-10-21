#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
case "${1:-all}" in
  original) tests=(review/correction-current-goal/tests/frozen-eight.test.ts) ;;
  new) tests=(review/correction-current-goal/tests/negative-source-four.test.ts) ;;
  all) tests=(review/correction-current-goal/tests/*.test.ts) ;;
  *) echo "usage: $0 [original|new|all]" >&2; exit 2 ;;
esac
"${DENO:-deno}" test --no-check --cached-only --no-remote --allow-read --deny-net --no-prompt "${tests[@]}"
