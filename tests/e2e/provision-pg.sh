#!/bin/bash
# Disposable Postgres 16 for the chat-to-confirmation E2E skeleton.
# Same contract as tests/db/run.sh (throwaway cluster, socket-only, trust
# auth, the repo's stubs + the repo's own migration list in run.sh's own
# order) except the cluster STAYS UP so the Node skeleton can run its legs
# against it in sequence, and is stopped explicitly.
#
#   provision-pg.sh start <statedir>   initdb + stubs + migrations; writes
#                                      <statedir>/pg.env (PGHOST/PGPORT dirs)
#   provision-pg.sh stop  <statedir>   stop + remove the cluster
#
# Nothing here touches the live Supabase project. Migrations are the repo's
# files, applied to a local throwaway cluster only.
set -euo pipefail
export LC_ALL=C LANG=C
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

if [ -z "${PGBIN:-}" ]; then
  if command -v postgres >/dev/null 2>&1; then PGBIN="$(dirname "$(command -v postgres)")";
  else for d in /usr/lib/postgresql/*/bin /usr/local/pgsql/bin /opt/postgresql/*/bin; do
    [ -x "$d/initdb" ] && PGBIN="$d" && break;
  done; fi
fi
[ -n "${PGBIN:-}" ] && [ -x "$PGBIN/initdb" ] || { echo "PROVISION_FAIL: no postgres binaries (set PGBIN)"; exit 3; }
# psql links libpq from the tree's lib dir; the server binaries do not need it.
export LD_LIBRARY_PATH="$(dirname "$PGBIN")/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

cmd="${1:-}"; state="${2:-}"
[ -n "$state" ] || { echo "usage: provision-pg.sh start|stop <statedir>"; exit 2; }

# Postgres refuses to run as root. When invoked as root, stage a copy of
# the PG tree under /tmp (the workspace tree is not traversable by the
# unprivileged user) and run the server processes as nobody via setpriv.
RUN=()
if [ "$(id -u)" = "0" ]; then
  TREEROOT="$(dirname "$PGBIN")"
  STAGED="/tmp/e2e-pgfull-$(echo "$TREEROOT" | md5sum | cut -c1-8)"
  if [ ! -x "$STAGED/bin/initdb" ]; then cp -r "$TREEROOT" "$STAGED"; chmod -R a+rX "$STAGED"; fi
  PGBIN="$STAGED/bin"
  RUN=(setpriv --reuid=65534 --regid=65534 --clear-groups)
fi

if [ "$cmd" = "stop" ]; then
  [ -f "$state/pg.env" ] && . "$state/pg.env"
  "${RUN[@]}" "$PGBIN/pg_ctl" -D "$state/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$state"
  exit 0
fi
[ "$cmd" = "start" ] || { echo "usage: provision-pg.sh start|stop <statedir>"; exit 2; }

mkdir -p "$state"
[ "$(id -u)" = "0" ] && chown 65534:65534 "$state"
PORT="${E2E_PG_PORT:-54339}"
"${RUN[@]}" "$PGBIN/initdb" -D "$state/data" -U postgres --auth=trust >/dev/null
# TCP loopback, not a unix socket: this VM's systemd-tmpfiles-clean removes
# socket files from /tmp within minutes (observed 2026-10-22: a live
# cluster's .s.PGSQL socket vanished mid-run while its data dir survived).
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$state/data" -o "-p $PORT -k $state -c listen_addresses='127.0.0.1'" -l "$state/log" -w start >/dev/null
printf 'PGWORK=%s\nPGPORT=%s\nPGBIN=%s\nPGHOST=127.0.0.1\n' "$state" "$PORT" "$PGBIN" > "$state/pg.env"

PSQL=("$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -c "set client_min_messages = warning" -f "$ROOT/tests/db/stubs.sql"

# The migration list is run.sh's own, in run.sh's own execution order —
# which is NOT filename order and NOT raw appearance order:
#   A. the first for-loop's list;
#   B. each literal `-f .../migrations/<file>` line up to run.sh's ledger
#      step (scripts/launch/apply-rails-and-seed.sh --pending);
#   C. the ledger step itself: every file in supabase/migrations AFTER the
#      ledger baseline (20261011030000_brokerage_accounts_per_user.sql) in
#      filename order — files at or before the baseline are backfilled as
#      applied WITHOUT being run, so any not already applied in A/B never
#      lands (e.g. 20260923_000003_route_platform_urls.sql);
#   D. the literal `-f` lines after the ledger step;
#   E. the bridge, where run.sh applies $BRIDGE_PATH (after the gate
#      waiver, before the cloud begin's final application in D's tail).
# Deduplicated keeping first occurrence (run.sh applies most twice; the
# migrations are idempotent by design).
mapfile -t MIGS < <(awk -v migdir="$ROOT/supabase/migrations" '
  /^BRIDGE_NAME=/ { gsub(/.*=|\.sql.*/, ""); bridge = $0 ".sql"; next }
  /^for m in / { inloop = 1 }
  inloop {
    for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]{8}_[0-9]{6}_[A-Za-z0-9_]+\.sql$/) print $i
    if ($0 ~ /; do/) inloop = 0
    next
  }
  /apply-rails-and-seed\.sh --pending/ && !ledger_done {
    ledger_done = 1
    cmd = "ls \"" migdir "\"/*.sql"
    while ((cmd | getline f) > 0) { n = split(f, parts, "/"); if (parts[n] > "20261011030000_brokerage_accounts_per_user.sql") print parts[n] }
    close(cmd)
    next
  }
  /-f "\$ROOT\/supabase\/migrations\/[0-9]/ {
    line = $0; sub(/.*migrations\//, "", line); sub(/".*/, "", line); print line; next
  }
  /\}" -f "\$BRIDGE_PATH"/ { if (bridge != "") print bridge; next }
' "$ROOT/tests/db/run.sh" | awk '!seen[$0]++')
applied=0
for m in "${MIGS[@]}"; do
  f="$ROOT/supabase/migrations/$m"
  [ -f "$f" ] || continue
  "${PSQL[@]}" -c "set client_min_messages = warning" -f "$f"
  applied=$((applied+1))
done
echo "PROVISION_OK migrations_applied=$applied port=$PORT socket=$state"
