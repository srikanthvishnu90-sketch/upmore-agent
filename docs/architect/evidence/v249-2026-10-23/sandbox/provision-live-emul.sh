#!/bin/bash
# Throwaway PG16 emulating the LIVE schema: CI's migration order (provision-pg.sh) minus the 19 files the 2026-10-22
# release manifest classes as not live. Extra args: files to apply afterwards, in order, each in its own transaction.
set -euo pipefail
export LC_ALL=C LANG=C
ROOT=/tmp/rq; WORK="$1"; PORT="$2"; shift 2
PGBIN=/usr/lib/postgresql/16/bin
NOT_LIVE="20261020110000 20261020120000 20261020120100 20261020130000 20261021010000 20261021020000 20261021030000 20261021050000 20261021090000 20261021100000 20261021110000 20261021130000 20261021220430 20261022110000 20261022120000 20261022120500 20261023100000 20261024130000 20261024140000"
rm -rf "$WORK"; mkdir -p "$WORK"; chown postgres "$WORK"
runuser -u postgres -- $PGBIN/initdb -D "$WORK/data" -U postgres --auth=trust >/dev/null
runuser -u postgres -- $PGBIN/pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres)
PGOPTIONS='-c client_min_messages=error' "${PSQL[@]}" -f "$ROOT/tests/db/stubs.sql" >/dev/null 2>&1
RUN="$ROOT/tests/db/run.sh"
LEDGER_LINE="$(grep -n 'apply-rails-and-seed.sh --pending' "$RUN" | head -1 | cut -d: -f1)"
names() { grep -oE '[0-9]{8}[_0-9]*_[a-z0-9_]+\.sql' | awk '!s[$0]++' | while read -r b; do [[ -f "$ROOT/supabase/migrations/$b" ]] && echo "$b"; done; }
BEFORE="$(head -n "$LEDGER_LINE" "$RUN" | names)"
BASELINE="$(grep -oE '^BASELINE="[^"]+"' "$ROOT/scripts/launch/apply-rails-and-seed.sh" | cut -d'"' -f2)"
AFTER="$( (ls "$ROOT/supabase/migrations" | grep '\.sql$' | sort) | while read -r b; do [[ "$b" > "$BASELINE" ]] || continue; grep -qx "$b" <<<"$BEFORE" || echo "$b"; done)"
n=0; skipped=""
for b in $BEFORE $AFTER; do
  ts="${b%%_*}"; [[ " $NOT_LIVE " == *" $ts "* ]] && { skipped="$skipped $ts"; continue; }
  PGOPTIONS='-c client_min_messages=error' "${PSQL[@]}" --single-transaction -f "$ROOT/supabase/migrations/$b" >"$WORK/migrate.log" 2>&1 || { echo "BASE MIGRATION FAILED: $b"; grep -m3 ERROR "$WORK/migrate.log"; exit 1; }
  n=$((n+1))
done
echo "base: applied $n, skipped $(wc -w <<<"$skipped") not-live"
for f in "$@"; do
  if PGOPTIONS='-c client_min_messages=error' "${PSQL[@]}" --single-transaction -f "$ROOT/supabase/migrations/$f" >"$WORK/fwd.log" 2>&1; then echo "FORWARD OK: $f"; else echo "FORWARD FAILED: $f"; grep -m3 -E "ERROR|DETAIL|CONTEXT" "$WORK/fwd.log"; fi
done
echo "PGHOST=$WORK PGPORT=$PORT"
