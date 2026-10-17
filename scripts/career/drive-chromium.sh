#!/bin/bash
# Drive Chromium launcher — the durable form of Lane E's scratch
# chrome-wrapper.sh (~/workspace/.seam-tmp-r2/, 2026-10-16), rebuilt
# as maintained repo tooling on branch finish/apply-readiness.
#
# Point UPMORE_CHROMIUM_PATH at this script and Playwright (via
# scripts/career/portal-browser-helper.cjs) launches it in place of a
# bare Chromium. It execs the real Playwright-bundled Chromium with
# two environment-driven additions:
#
#   1. --ignore-certificate-errors-spki-list=<fingerprint>
#      The egress proxy re-signs TLS with its own CA, which is
#      outside Chromium's root store (curl/python trust it via the
#      system store; Chromium does not). This pins trust to ONLY that
#      CA's public key — any other bad certificate still fails.
#      The fingerprint is a public-key hash, not a secret. Override
#      with UPMORE_EGRESS_CA_SPKI if the egress CA rotates, or let
#      scripts/career/drive-env-launch.cjs derive the current value
#      at launch (its default behavior). The constant below is the
#      CA observed 2026-10-17 — already the SECOND value in two
#      days, which is why derivation exists.
#   2. --proxy-server=http://127.0.0.1:<port>  (only when
#      UPMORE_DRIVE_RELAY_PORT is set) — routes the browser through
#      scripts/career/drive-connect-relay.cjs, which re-adds the
#      proxy credentials Chromium drops. Set by
#      scripts/career/drive-env-launch.cjs; without it the browser
#      launches direct (the posture for hosts with direct egress).
#
# Binary resolution: UPMORE_CHROMIUM_REAL wins; else the newest
# ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome; else the
# headless-shell build. DRIVE_CHROMIUM_PRINT=1 prints the resolved
# exec line instead of executing (guard tests assert on it).
set -euo pipefail

SPKI="${UPMORE_EGRESS_CA_SPKI:-Sx8+gg6h2hIxYfOskK2pD2CbYU7uAbyhu5hN6byYcYY=}"

REAL="${UPMORE_CHROMIUM_REAL:-}"
if [ -z "$REAL" ]; then
  REAL="$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "$REAL" ]; then
  REAL="$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "$REAL" ] || [ ! -x "$REAL" ]; then
  echo "drive-chromium: no Playwright Chromium found (set UPMORE_CHROMIUM_REAL)" >&2
  exit 3
fi

ARGS=("--ignore-certificate-errors-spki-list=$SPKI")
if [ -n "${UPMORE_DRIVE_RELAY_PORT:-}" ]; then
  ARGS+=("--proxy-server=http://127.0.0.1:${UPMORE_DRIVE_RELAY_PORT}")
fi

if [ "${DRIVE_CHROMIUM_PRINT:-}" = "1" ]; then
  printf '%s' "$REAL"; printf ' %s' "${ARGS[@]}" "$@"; printf '\n'
  exit 0
fi
exec "$REAL" "${ARGS[@]}" "$@"
