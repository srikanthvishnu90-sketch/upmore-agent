#!/bin/bash
# JOIN-1202: run the real-Postgres + real-Chromium submission flows (flow-real-person, flow-connected) the way the gate
# does, with no self-skip: CI=true makes each test throw, never print NOT_RUN, when Postgres 16 or the browser is missing.
# Nothing reaches a real site: the employers are pages on 127.0.0.1 served by the tests; the database is a throwaway
# cluster under a temp directory (tests/flow/provision-pg.sh), stopped and removed at the end.
#
#   bash tests/flow/run-real-flow.sh [test files...]      (default: flow-real-person and flow-connected)
#
# Needs, as CI's ubuntu-24.04 runner has them:
#   Postgres 16 server binaries   /usr/lib/postgresql/16/bin (initdb, pg_ctl, postgres, psql) or PGBIN=...
#   Deno 2.9.6, Node 22           on PATH
#   Playwright 1.64.1             npm ci --prefix tools   (tools/package.json + lockfile pins it)
#   a Chromium                    UPMORE_CHROMIUM_PATH=... (CI: the runner's google-chrome), else Playwright's own
#                                 (cd tools && npx --no-install playwright install chromium)
#   an unprivileged user          Chromium's sandbox; as root this re-runs itself as the `postgres` account
#   network once                  Deno fetches the tests' imports (esm.sh supabase-js, jsr std) into DENO_DIR; where
#                                 esm.sh is blocked: IMPORT_MAP=tests/flow/supabase-npm.json (the same supabase-js from npm)
# Takes about 2 minutes warm (flow-real-person ~30s, flow-connected ~70s), plus the first import download.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
FILES=("$@")
[ ${#FILES[@]} -eq 0 ] && FILES=(tests/architect/flow-real-person.test.ts tests/architect/flow-connected.test.ts tests/architect/handler-submit-path.test.ts)
export PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
test -x "$PGBIN/initdb" || { echo "no Postgres 16 at $PGBIN (set PGBIN)"; exit 2; }
"$PGBIN/postgres" --version | grep -q " 16\." || { echo "PGBIN is not Postgres 16: $("$PGBIN/postgres" --version)"; exit 2; }
export UPMORE_PLAYWRIGHT_PATH="${UPMORE_PLAYWRIGHT_PATH:-$ROOT/tools/node_modules/playwright}"
test -f "$UPMORE_PLAYWRIGHT_PATH/package.json" || { echo "no Playwright at $UPMORE_PLAYWRIGHT_PATH: run npm ci --prefix tools"; exit 2; }
DENO="$(command -v deno)"
if [ "$(id -u)" = "0" ]; then
  H=$(mktemp -d /tmp/flowhome.XXXX); chown postgres "$H"; chmod -R a+rX "$ROOT"; chmod a+rwx "$ROOT/tools" 2>/dev/null || true
  exec runuser -u postgres -- env HOME="$H" PATH="$PGBIN:$PATH" CI=true NO_COLOR=1 NO_PROXY="127.0.0.1,localhost" \
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="*" ${IMPORT_MAP:+IMPORT_MAP="$IMPORT_MAP"} \
    ${HTTPS_PROXY:+HTTPS_PROXY="$HTTPS_PROXY"} ${DENO_CERT:+DENO_CERT="$DENO_CERT"} ${DENO_DIR:+DENO_DIR="$DENO_DIR"} \
    PGBIN="$PGBIN" UPMORE_PLAYWRIGHT_PATH="$UPMORE_PLAYWRIGHT_PATH" ${UPMORE_CHROMIUM_PATH:+UPMORE_CHROMIUM_PATH="$UPMORE_CHROMIUM_PATH"} \
    "$DENO" test -A --no-check ${IMPORT_MAP:+--import-map="$IMPORT_MAP"} "${FILES[@]}"
fi
PATH="$PGBIN:$PATH" CI=true NO_PROXY="127.0.0.1,localhost" exec "$DENO" test -A --no-check ${IMPORT_MAP:+--import-map="$IMPORT_MAP"} "${FILES[@]}"
