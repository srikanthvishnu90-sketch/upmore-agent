#!/usr/bin/env bash
set -euo pipefail
script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
cd "$repo_dir"
deno_bin=${DENO:-deno}
filter=()
case "${1:-all}" in
  all) ;;
  owner) filter=(--filter='typed writer owner gate:') ;;
  *) echo 'usage: run-tests.sh [all|owner]' >&2; exit 2 ;;
esac
exec "$deno_bin" test --cached-only --no-check --deny-net --allow-read --allow-write=/tmp "${filter[@]}" tests/architect/pending/typed-writer-owner-legal-name.test.ts
