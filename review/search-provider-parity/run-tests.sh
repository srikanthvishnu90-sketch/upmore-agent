#!/usr/bin/env bash
set -euo pipefail
script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/../.." && pwd)
cd "$repo_dir"
deno_bin=${DENO:-deno}
exec "$deno_bin" test --cached-only --no-check --deny-net --allow-read --allow-write=/tmp tests/architect/pending/search-provider-parity.test.ts
