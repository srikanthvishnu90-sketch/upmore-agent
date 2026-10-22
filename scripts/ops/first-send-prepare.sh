#!/bin/bash
# Prepares one held first-send step (docs/apply/first-send/README.md) for the operator. It never connects to a database
# and never runs a step: it checks that every held file is byte-for-byte the reviewed one (MANIFEST.sha256), writes the
# chosen file with the account email substituted to a new temporary file OUTSIDE the repository, and prints that file's
# sha256 and the one command to run it, which the operator runs only on the owner's written word for that step.
#   first-send-prepare.sh --check                    verify the manifest (exit 1 on any difference)
#   first-send-prepare.sh <repo path> [email]        prepare one step
#   first-send-prepare.sh --write-manifest           rewrite the manifest (architect only, after a reviewed change)
set -euo pipefail
ROOT="${FIRST_SEND_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
M="docs/apply/first-send/MANIFEST.sha256"
FILES=(
  supabase/migrations/20261021220430_career_apply_message_cards.sql
  supabase/migrations/20261024130000_career_apply_card_cloud_bridge.sql
  docs/apply/held-card-bridge/01-preflight.sql
  docs/apply/held-card-bridge/02-apply-card.sql
  docs/apply/held-card-bridge/03-apply-bridge.sql
  docs/apply/held-card-bridge/04-verify.sql
  docs/apply/held-card-bridge/05-enroll-owner.sql
  docs/apply/held-card-bridge/90-rollback-bridge.sql
  docs/apply/held-card-bridge/91-rollback-card.sql
  docs/apply/HELD-WAIVER-LEVER-5x7D.sql
  docs/apply/first-send/00-readiness.sql
  docs/apply/first-send/08-switches-on.sql
  docs/apply/first-send/98-switches-off.sql
  docs/apply/first-send/99-undo-owner-steps.sql
  scripts/ops/first-send-prepare.sh
)
refuse() { echo "REFUSED: $*" >&2; exit 1; }
cd "$ROOT"
if [[ "${1:-}" == "--write-manifest" ]]; then sha256sum "${FILES[@]}" > "$M"; echo "wrote $M"; exit 0; fi
[[ -f "$M" ]] || refuse "no manifest"
[[ "$(cut -d' ' -f3 "$M" | sort | tr '\n' ' ')" == "$(printf '%s\n' "${FILES[@]}" | sort | tr '\n' ' ')" ]] || refuse "the manifest does not list exactly the held files"
sha256sum --quiet --strict -c "$M" >/dev/null 2>&1 || refuse "a held file differs from the reviewed one (sha256sum -c $M)"
MANIFEST_SHA="$(sha256sum "$M" | cut -c1-64)"
if [[ "${1:-}" == "--check" ]]; then echo "manifest ok: $MANIFEST_SHA"; exit 0; fi
f="${1:-}"; [[ -n "$f" ]] || refuse "name a step"
printf '%s\n' "${FILES[@]}" | grep -qxF "$f" || refuse "$f is not a held step"
[[ "$f" == *.sql ]] || refuse "$f is not a SQL step"
out="$(mktemp -d "${TMPDIR:-/tmp}/first-send.XXXXXX")/$(basename "$f")"
if grep -q "__OWNER_ACCOUNT_EMAIL__" "$f"; then
  email="${2:-}"
  [[ "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || refuse "$f needs the account email as written by the owner"
  sed "s/__OWNER_ACCOUNT_EMAIL__/$email/g" "$f" > "$out"
  ! grep -q "__OWNER_ACCOUNT_EMAIL__" "$out" || refuse "substitution failed"
else
  [[ -z "${2:-}" ]] || refuse "$f takes no email"
  cp "$f" "$out"
fi
echo "manifest   $MANIFEST_SHA"
echo "reviewed   $(sha256sum "$f" | cut -c1-64)  $f"
echo "prepared   $(sha256sum "$out" | cut -c1-64)  $out   (outside the repository; never commit it)"
echo "run, only on the owner's written word for this step:"
echo "  psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -f $out"
