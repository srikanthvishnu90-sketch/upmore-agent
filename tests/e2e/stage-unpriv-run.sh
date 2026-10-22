#!/usr/bin/env bash
# stage-unpriv-run.sh — run the E2E board-drive leg in the strongest
# browser context this host can actually initialize, and SAY which one.
#
# Why this exists (docs/e2e/H4-DRIVER-ERROR-ROOT-CAUSE.md): the E2E test
# process runs as root in this VM, and Chromium refuses to start its
# sandbox as root. The product's sandbox posture is not negotiable
# (BROWSER_SANDBOX_REQUIRED stays; no --no-sandbox is added anywhere by
# this script). What a test harness CAN do is change WHO runs the drive
# and WHERE its files live:
#
#   1. stage the repo + deno + Playwright + browsers into a
#      WORLD-READABLE directory (the owner's home is drwxrws--- — no
#      unprivileged user can traverse it, which is the true content of
#      the old "cannot be staged" claim), then
#   2. run the drive as the unprivileged user `nobody` in the first
#      context whose sandboxed-launch probe actually succeeds:
#        route nobody-sandboxed : nobody, chromiumSandbox:true
#        route userns-sandboxed : root inside a fresh user namespace
#                                 (AppArmor exempts the privileged
#                                 creator; Chrome is root-in-userns,
#                                 unprivileged w.r.t. the host)
#        route nobody-optout    : nobody, with the product's OWN
#                                 documented operator opt-out for hosts
#                                 that cannot run any sandboxed Chromium
#                                 for any user (UPMORE_CHROMIUM_SANDBOX=off
#                                 — portal-browser-helper.cjs header,
#                                 v224 combine; the same env the board
#                                 service's systemd unit sets on this
#                                 VM). The route NAME is printed on the
#                                 run's first line so the posture is
#                                 recorded, never silent.
#      If no route's probe passes, exit 86 and print every probe's
#      output — the caller classifies ENVIRONMENT with that evidence
#      instead of guessing.
#
# Staged copies live OUTSIDE the repo (default /opt/e2e-stage; override
# with E2E_STAGE_DIR — pick a filesystem that is not mounted nosuid if
# the setuid chrome_sandbox is to have any chance) and are never
# committed. Nothing here touches a live system: the only network the
# drive can reach is the caller's localhost mock employer (proxy env is
# stripped for the run).
#
# Usage:
#   stage-unpriv-run.sh ensure <repoRoot>
#   stage-unpriv-run.sh run <repoRoot> <cwd> <cmd...>
set -u
STAGE="${E2E_STAGE_DIR:-/opt/e2e-stage}"
PW_SRC="${UPMORE_PLAYWRIGHT_PATH:-$HOME/workspace/sporve-agent-clone/node_modules/playwright}"
BROWSERS_SRC="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
DENO_SRC="${DENO_BIN:-$HOME/.deno/bin/deno}"

stage_env() {
  # The environment every staged process runs with.
  printf '%s\n' \
    "HOME=$STAGE/home" \
    "TMPDIR=$STAGE/tmp" \
    "UPMORE_SEAM_TMP=$STAGE/tmp" \
    "PLAYWRIGHT_BROWSERS_PATH=$STAGE/browsers" \
    "UPMORE_PLAYWRIGHT_PATH=$STAGE/node_modules/playwright" \
    "DENO_DIR=$STAGE/home/.cache/deno" \
    "NO_PROXY=127.0.0.1,localhost" \
    "no_proxy=127.0.0.1,localhost" \
    "PATH=$STAGE/deno-home/bin:/usr/local/bin:/usr/bin:/bin"
}

fix_runtime_areas() {
  # The runtime areas must be OWNED by the drive user, not merely
  # world-writable. Measured A/B (2026-10-22): as nobody with
  # HOME=<stage>/home at 777 root-owned, Chromium died in its crashpad
  # handshake (handler: "--database is required", browser SIGTRAP) on
  # every launch, sandboxed or not; with HOME nobody-owned (700) the
  # identical launch printed PROBE_OK. Chrome anchors its crashpad
  # database under HOME and does not accept a foreign-owned one.
  if [ -d "$STAGE/home" ]; then
    chown -R nobody:nogroup "$STAGE/home" 2>/dev/null || true
    chmod 700 "$STAGE/home"
  fi
  if [ -d "$STAGE/tmp" ]; then
    chown nobody:nogroup "$STAGE/tmp" 2>/dev/null || true
    chmod 777 "$STAGE/tmp"
  fi
  if [ -d "$STAGE/work" ]; then
    chown nobody:nogroup "$STAGE/work" 2>/dev/null || true
    chmod 777 "$STAGE/work"
  fi
}

write_probe() {
  cat > "$STAGE/work/probe.cjs" <<'EOF'
(async () => {
  const pw = require(process.env.UPMORE_PLAYWRIGHT_PATH);
  const opts = { chromiumSandbox: process.env.E2E_PROBE_SBX !== "off", timeout: 20000 };
  try {
    const b = await pw.chromium.launch(opts);
    const p = await b.newPage();
    await p.goto("about:blank");
    await b.close();
    console.log("PROBE_OK");
  } catch (e) {
    console.log("PROBE_FAIL " + String(e.message || e).split("\n").slice(0, 4).join(" | "));
    process.exit(1);
  }
})();
EOF
  chmod 644 "$STAGE/work/probe.cjs"
}

ensure_stage() {
  local repo="$1"
  local stamp="$STAGE/.stamp"
  local want="repo=$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo nogit) pw=$PW_SRC browsers=$BROWSERS_SRC deno=$DENO_SRC v2"
  mkdir -p "$STAGE"
  # The stage ROOT itself must be traversable by the unprivileged user.
  # mkdir -p inherits the caller's umask, and a stage root created under
  # umask 007 sat at 770 root:root: every probe then failed as nobody
  # with MODULE_NOT_FOUND while root saw a healthy tree (measured
  # 2026-10-22 — see the root-cause note). This must run on EVERY call,
  # including the stamp-hit early return below.
  chmod 755 "$STAGE"
  fix_runtime_areas
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$want" ] && [ -x "$STAGE/deno-home/bin/deno" ] && [ -d "$STAGE/repo" ]; then
    mkdir -p "$STAGE/work"
    write_probe
    return 0
  fi
  rm -rf "$STAGE/repo" "$STAGE/deno-home" "$STAGE/node_modules" "$STAGE/browsers"
  mkdir -p "$STAGE/home" "$STAGE/tmp" "$STAGE/work" "$STAGE/node_modules" "$STAGE/deno-home/bin"
  cp -a "$repo" "$STAGE/repo"
  rm -rf "$STAGE/repo/.git"
  cp -a "$DENO_SRC" "$STAGE/deno-home/bin/deno"
  cp -a "$PW_SRC" "$STAGE/node_modules/playwright"
  [ -d "$(dirname "$PW_SRC")/playwright-core" ] && cp -a "$(dirname "$PW_SRC")/playwright-core" "$STAGE/node_modules/playwright-core"
  cp -a "$BROWSERS_SRC" "$STAGE/browsers"
  # The owner's browser cache aliases the headless shell to the full
  # chrome with an ABSOLUTE symlink into $HOME — dangling for any other
  # user. Rewrite absolute symlinks that point into the copied sources
  # as relative links inside the stage (dereferencing instead breaks
  # Chromium: the binary finds icudtl.dat next to /proc/self/exe's real
  # path — measured, see the root-cause note).
  local link target staged rel
  while IFS= read -r link; do
    target="$(readlink "$link")"
    case "$target" in
      "$BROWSERS_SRC"/*) staged="$STAGE/browsers/${target#"$BROWSERS_SRC"/}" ;;
      "$repo"/*)         staged="$STAGE/repo/${target#"$repo"/}" ;;
      *) continue ;;
    esac
    if [ -e "$staged" ]; then
      rel="$(realpath --relative-to="$(dirname "$link")" "$staged")"
      ln -sfn "$rel" "$link"
    fi
  done < <(find "$STAGE" -type l -lname '/*' 2>/dev/null)
  # The SUID sandbox helper: setuid root is the documented configuration
  # (it can only engage where the process context allows elevation —
  # measured impossible on this VM, where PID 1 itself runs with
  # NoNewPrivs=1; harmless where it can work).
  find "$STAGE/browsers" -name chrome_sandbox -exec chmod 4755 {} + 2>/dev/null || true
  # World-readable applies to the staged PAYLOAD only. The runtime areas
  # (home/tmp/work) belong to the drive: the engine requires its state
  # dir under HOME to be mode 700 (apply.ts privateDir), and a blanket
  # a+rX here silently re-permissioned it to 755 between two drives of
  # the same stage — measured, see the root-cause note.
  chmod -R a+rX "$STAGE/repo" "$STAGE/deno-home" "$STAGE/node_modules" "$STAGE/browsers"
  fix_runtime_areas
  printf '%s' "$want" > "$stamp"
  write_probe
}

probe_as() {
  # $1 = route; prints probe output; returns the probe's exit code.
  local route="$1" out
  case "$route" in
    nobody-sandboxed)
      out="$(runuser -u nobody -- env $(stage_env) E2E_PROBE_SBX=on /usr/bin/node "$STAGE/work/probe.cjs" 2>&1)" ;;
    userns-sandboxed)
      out="$(unshare -Ur sh -c 'exec env "$@"' _ $(stage_env) E2E_PROBE_SBX=on /usr/bin/node "$STAGE/work/probe.cjs" 2>&1)" ;;
    nobody-optout)
      out="$(runuser -u nobody -- env $(stage_env) E2E_PROBE_SBX=off /usr/bin/node "$STAGE/work/probe.cjs" 2>&1)" ;;
  esac
  printf '%s\n' "$out"
  [ "${out#*PROBE_OK}" != "$out" ]
}

pick_route() {
  local route
  for route in nobody-sandboxed userns-sandboxed nobody-optout; do
    local out
    out="$(probe_as "$route")"
    if [ "${out#*PROBE_OK}" != "$out" ]; then
      echo "$route"
      return 0
    fi
    echo "PROBE[$route] $out" >&2
  done
  return 1
}

cmd_ensure() { ensure_stage "$1"; echo "STAGE_READY $STAGE"; }

cmd_run() {
  local repo="$1" cwd="$2"; shift 2
  if [ "$repo" = "$STAGE/repo" ]; then
    echo "stage-unpriv-run: repo root must be the source tree, not the stage" >&2
    exit 2
  fi
  ensure_stage "$repo"
  local route
  if ! route="$(pick_route)"; then
    echo "SANDBOX_ROUTE none"
    echo "stage-unpriv-run: no browser context on this host could initialize (probe outputs above)" >&2
    exit 86
  fi
  echo "SANDBOX_ROUTE $route"
  case "$route" in
    nobody-sandboxed)
      exec runuser -u nobody -- env $(stage_env) sh -c 'cd "$1"; shift; exec "$@"' _ "$cwd" "$@" ;;
    userns-sandboxed)
      exec unshare -Ur sh -c 'exec env "$@"' _ $(stage_env) sh -c 'cd "$1"; shift; exec "$@"' _ "$cwd" "$@" ;;
    nobody-optout)
      exec runuser -u nobody -- env $(stage_env) UPMORE_CHROMIUM_SANDBOX=off sh -c 'cd "$1"; shift; exec "$@"' _ "$cwd" "$@" ;;
  esac
}

case "${1:-}" in
  ensure) shift; cmd_ensure "$1" ;;
  run)    shift; cmd_run "$@" ;;
  *) echo "usage: stage-unpriv-run.sh ensure <repoRoot> | run <repoRoot> <cwd> <cmd...>" >&2; exit 2 ;;
esac
