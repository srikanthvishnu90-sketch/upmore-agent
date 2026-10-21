#!/bin/bash
# restore-worker.sh — F8 auto-restore for the Upmore career worker stack
# (TP-INFRA, 2026-10-21; spec: docs/career/throughput-handoff-2026-10-21.md F8).
#
# WHY: the worker's systemd units live in /etc/systemd/system, which VM
# replacements on this host class WIPE — twice on 2026-10-21 alone
# (~11:05 and ~12:30 CDT). The operator material survives under
# /home/hatch/worker-config/ (mode 700). Manual restore from
# docs/gauntlet/worker-flip-2026-10-20.md measured ~10 min detection ->
# gates green. This script mechanizes detection + restore + the gate
# probes so a watchdog (README.md) can run it unattended.
#
# MODES:
#   --dry-run (DEFAULT)  detection + gate probes + would-do plan + log
#                        record. NEVER writes a unit, NEVER starts or
#                        restarts anything.
#   --execute            performs the restore (install unit templates,
#                        daemon-reload, enable+start, probes, log).
#                        Only ever run by the watchdog/operator, never
#                        by the TP-INFRA lane that authored it.
#
# The gate probes are side-effect-free: both board probes are refused
# by the board service's own gates BEFORE any session is created
# (host gate -> family verdict -> only then the factory).
# The worker secret is read transiently from board-config.cjs into a
# shell variable for the probes; it is never printed or logged.
#
# Exit codes: 0 healthy/restored · 2 required gaps detected (dry-run)
# · 3 local restore material missing (cannot restore) · 4 probe failure
# after restore.
set -u
MODE="dry-run"
LOG=""
# Resolve this script's own absolute path ONCE, before anything derives
# from $0. $0 is invocation-dependent: a bare-name invocation (PATH
# lookup, or the watchdog running `restore-worker.sh`) carries no slash,
# so `dirname "$0"` collapses to "." — the caller's CWD — and a later
# `exec "$0"` PATH-searches and dies `exec: restore-worker.sh: not found`
# (measured live in restore #4, 2026-10-21: the restore applied, then the
# self-verify re-exec crashed, exit 127). SELF/SELF_DIR below are the
# only sanctioned derivations; never re-derive from $0 downstream.
SELF_SRC="$0"
case "$SELF_SRC" in
  */*) : ;;
  *) SELF_SRC="$(command -v "$SELF_SRC" 2>/dev/null || printf '%s' "$SELF_SRC")" ;;
esac
SELF_DIR="$(cd "$(dirname "$SELF_SRC")" && pwd)"
SELF="$SELF_DIR/$(basename "$SELF_SRC")"
UNITS_DIR="$SELF_DIR/units"
CONFIG_DIR="/home/hatch/worker-config"
SYSTEMD_DIR="/etc/systemd/system"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODE="dry-run" ;;
    --execute) MODE="execute" ;;
    --log) LOG="$2"; shift ;;
    --units) UNITS_DIR="$2"; shift ;;
    --config) CONFIG_DIR="$2"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 64 ;;
  esac
  shift
done
[ -n "$LOG" ] || LOG="$CONFIG_DIR/restore-log.jsonl"
TS="$(date -u +%FT%TZ)"
REQUIRED_GAPS=()
POSTURE_GAPS=()
say() { echo "[restore-worker $TS] $*"; }

# ---------- detection: operator config (the surviving material) ----------
for f in board-config.cjs executor-config.cjs executor.env connect-relay.cjs chromium-egress-wrapper.sh board-smoke-launcher.cjs; do
  [ -f "$CONFIG_DIR/$f" ] || REQUIRED_GAPS+=("missing config file: $CONFIG_DIR/$f")
done
[ -x "$CONFIG_DIR/chromium-egress-wrapper.sh" ] || REQUIRED_GAPS+=("chromium-egress-wrapper.sh not executable")

# ---------- detection: units ----------
unit_file() { [ -f "$SYSTEMD_DIR/$1" ]; }
unit_active() { systemctl is-active --quiet "$1" 2>/dev/null; }
unit_enabled() { systemctl is-enabled --quiet "$1" 2>/dev/null; }
for u in upmore-career-board.service upmore-egress-relay.service upmore-career-executor.service upmore-career-executor.timer; do
  unit_file "$u" || REQUIRED_GAPS+=("missing unit file: $u")
done
if unit_file upmore-career-board.service; then
  unit_active upmore-career-board.service || REQUIRED_GAPS+=("board service not active")
  unit_enabled upmore-career-board.service || REQUIRED_GAPS+=("board service not enabled")
fi
if unit_file upmore-egress-relay.service; then
  unit_active upmore-egress-relay.service || REQUIRED_GAPS+=("egress relay not active")
  unit_enabled upmore-egress-relay.service || REQUIRED_GAPS+=("egress relay not enabled")
fi
if unit_file upmore-career-executor.timer; then
  unit_active upmore-career-executor.timer || REQUIRED_GAPS+=("executor timer not active")
  unit_enabled upmore-career-executor.timer || REQUIRED_GAPS+=("executor timer not enabled")
fi
# executor.service is a timer-pulled oneshot (is-enabled: static) — file presence is its healthy state.
if [ -f "$SYSTEMD_DIR/upmore-career-board.service.d/throughput-chromium.conf" ] && grep -q "UPMORE_CHROMIUM_PATH" "$SYSTEMD_DIR/upmore-career-board.service.d/throughput-chromium.conf"; then
  :
else
  REQUIRED_GAPS+=("missing/incorrect board drop-in: throughput-chromium.conf (UPMORE_CHROMIUM_PATH)")
fi
# Smoke unit: stopped-by-design posture unit (no [Install]). Its file
# rewrites with any full restore but it is NEVER started by one.
unit_file upmore-career-board-smoke.service || POSTURE_GAPS+=("smoke unit file absent (stopped-by-design when present)")

# ---------- detection: ports ----------
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- 3<&-; }
port_open 8474 || REQUIRED_GAPS+=("egress relay port 8474 not listening")

# ---------- gate probes (read-only; refused before any session exists) ----------
PROBES='"skipped":"board port closed"'
probe() { # $1=name $2=secret-header-value-or-empty $3=url -> echoes "code body"
  local hdr=()
  [ -n "$2" ] && hdr=(-H "x-upmore-board-secret: $2")
  curl -s --max-time 10 -X POST "http://127.0.0.1:8471/board-sessions" \
    -H 'content-type: application/json' "${hdr[@]}" \
    -d "{\"userId\":\"restore-probe\",\"url\":\"$3\"}" -w $'\n%{http_code}'
}
if port_open 8471; then
  SECRET="$(node -e 'try{const c=require(process.argv[1]);process.stdout.write(String(c.secret||""))}catch(e){}' "$CONFIG_DIR/board-config.cjs")"
  if [ -z "$SECRET" ]; then
    REQUIRED_GAPS+=("could not read worker secret from board-config.cjs for probes")
    PROBES='"error":"no secret available"'
  else
    R1="$(probe nosecret "" "https://example.com/x")"; C1="${R1##*$'\n'}"
    R2="$(probe wrong "wrong-secret-restore-probe" "https://example.com/x")"; C2="${R2##*$'\n'}"
    R3="$(probe host "$SECRET" "https://example.com/x")"; C3="${R3##*$'\n'}"
    R4="$(probe lever "$SECRET" "https://jobs.lever.co/probe/00000000-0000-0000-0000-000000000000")"; C4="${R4##*$'\n'}"
    unset SECRET
    P_OK=1
    [ "$C1" = "401" ] || { P_OK=0; REQUIRED_GAPS+=("probe no-secret expected 401 got $C1"); }
    [ "$C2" = "401" ] || { P_OK=0; REQUIRED_GAPS+=("probe wrong-secret expected 401 got $C2"); }
    { [ "$C3" = "403" ] && printf '%s' "$R3" | grep -q DRIVER_HOST_REFUSED; } || { P_OK=0; REQUIRED_GAPS+=("probe example.com expected 403 DRIVER_HOST_REFUSED got $C3"); }
    { [ "$C4" = "403" ] && printf '%s' "$R4" | grep -q FAMILY_NOT_DRIVEABLE; } || { P_OK=0; REQUIRED_GAPS+=("probe lever expected 403 FAMILY_NOT_DRIVEABLE got $C4"); }
    PROBES="\"noSecret\":$C1,\"wrongSecret\":$C2,\"exampleCom\":$C3,\"lever\":$C4"
    [ "$P_OK" = "1" ] && say "gate probes green: no-secret 401 · wrong-secret 401 · example.com 403 DRIVER_HOST_REFUSED · lever 403 FAMILY_NOT_DRIVEABLE"
  fi
else
  REQUIRED_GAPS+=("board port 8471 not listening")
fi

# ---------- verdict + plan ----------
GAPS_JSON="[]"
if [ "${#REQUIRED_GAPS[@]}" -gt 0 ]; then
  GAPS_JSON="$(printf '"%s",' "${REQUIRED_GAPS[@]}" | sed 's/,$//')"
  GAPS_JSON="[$GAPS_JSON]"
fi
POSTURE_JSON="[]"
if [ "${#POSTURE_GAPS[@]}" -gt 0 ]; then
  POSTURE_JSON="$(printf '"%s",' "${POSTURE_GAPS[@]}" | sed 's/,$//')"
  POSTURE_JSON="[$POSTURE_JSON]"
fi
log_record() { # $1=verdict $2=action
  mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
  printf '{"ts":"%s","mode":"%s","verdict":"%s","action":"%s","requiredGaps":%s,"postureGaps":%s,"probes":{%s}}\n' \
    "$TS" "$MODE" "$1" "$2" "$GAPS_JSON" "$POSTURE_JSON" "$PROBES" >> "$LOG"
}

if [ "${#REQUIRED_GAPS[@]}" -eq 0 ]; then
  say "verdict: HEALTHY — operating stack complete (board, executor, timer, relay, drop-in, configs, ports, probes)"
  [ "${#POSTURE_GAPS[@]}" -gt 0 ] && say "posture gaps (non-blocking): ${POSTURE_GAPS[*]}"
  say "action: none"
  log_record "healthy" "none"
  exit 0
fi

say "verdict: DEGRADED — ${#REQUIRED_GAPS[@]} required gap(s):"
for g in "${REQUIRED_GAPS[@]}"; do say "  gap: $g"; done

if [ "$MODE" = "dry-run" ]; then
  say "would-do (dry-run, nothing executed): install unit templates from $UNITS_DIR -> $SYSTEMD_DIR (+ board drop-in), systemctl daemon-reload, enable board/relay/timer, start relay + board + timer (smoke unit rewritten, NEVER started), re-run gate probes, log the outcome"
  log_record "degraded" "none (dry-run)"
  exit 2
fi

# ---------- execute (watchdog/operator only) ----------
for f in board-config.cjs executor.env; do
  [ -f "$CONFIG_DIR/$f" ] || { say "UNRESTORABLE_LOCAL: $CONFIG_DIR/$f missing — restore material incomplete, page the operator"; log_record "unrestorable_local" "aborted"; exit 3; }
done
say "restoring unit files from $UNITS_DIR"
install -m 644 "$UNITS_DIR/upmore-career-board.service" "$SYSTEMD_DIR/"
install -m 644 "$UNITS_DIR/upmore-career-executor.service" "$SYSTEMD_DIR/"
install -m 644 "$UNITS_DIR/upmore-career-executor.timer" "$SYSTEMD_DIR/"
install -m 644 "$UNITS_DIR/upmore-egress-relay.service" "$SYSTEMD_DIR/"
install -m 644 "$UNITS_DIR/upmore-career-board-smoke.service" "$SYSTEMD_DIR/"
mkdir -p "$SYSTEMD_DIR/upmore-career-board.service.d"
install -m 644 "$UNITS_DIR/upmore-career-board.service.d/throughput-chromium.conf" "$SYSTEMD_DIR/upmore-career-board.service.d/"
systemctl daemon-reload
systemctl enable upmore-career-board.service upmore-egress-relay.service upmore-career-executor.timer >/dev/null 2>&1 || true
systemctl start upmore-egress-relay.service || true
systemctl start upmore-career-board.service || true
systemctl start upmore-career-executor.timer || true
for i in $(seq 1 30); do port_open 8471 && break; sleep 1; done
say "restore applied; re-running this script in dry-run mode to verify (its probe results decide the final verdict)"
log_record "restore_applied" "restored"
exec "$SELF" --dry-run --log "$LOG" --units "$UNITS_DIR" --config "$CONFIG_DIR"
