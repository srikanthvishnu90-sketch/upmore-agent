#!/usr/bin/env bash
# WO-086: the Chrome Web Store package of extension/ (trunk's extension; never packages/extension, the Lane C spike).
#
#   bash scripts/launch/extension-package.sh
#
# Rebuilds extension/lib/trainee-core.js, zips only what the store needs (no src/, build.ts, README, tests or source maps)
# into dist/trainee-extension-<version>.zip (dist/ is gitignored), prints the file list and the sha256, and refuses the zip
# when it holds localhost or 127.0.0.1 in the manifest, a service_role key, a .json fixture, or any file over 1 MB.
# The checks run on the zip itself, unpacked again, with scripts/launch/extension-package-check.cjs (the same checks
# tests/extension-package.test.cjs runs in CI). Nothing is uploaded; the owner or Muse uploads the zip by hand.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
root=$(pwd)
check="$root/scripts/launch/extension-package-check.cjs"

deno run -A extension/build.ts

version=$(node -e 'process.stdout.write(require("./extension/manifest.json").version)')
mkdir -p dist
zip_path="$root/dist/trainee-extension-$version.zip"
rm -f "$zip_path"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mapfile -t files < <(node "$check" list extension)
mkdir -p "$work/stage" "$work/unzipped"
for f in "${files[@]}"; do
  mkdir -p "$work/stage/$(dirname "$f")"
  cp "extension/$f" "$work/stage/$f"
done
# A fixed timestamp and no extra attributes: the same sources give the same zip, so its sha256 means something.
find "$work/stage" -exec touch -h -d '2026-10-20 00:00:00 UTC' {} +
(cd "$work/stage" && TZ=UTC zip -X -D -q "$zip_path" "${files[@]}")

# Check what was actually zipped, not what was meant to be.
(cd "$work/unzipped" && unzip -q "$zip_path")
if ! node "$check" check "$work/unzipped"; then
  rm -f "$zip_path"
  echo "extension package REFUSED; no zip was kept." >&2
  exit 1
fi

echo "files in dist/trainee-extension-$version.zip:"
unzip -Z1 "$zip_path" | sed 's/^/  /'
echo "size: $(stat -c %s "$zip_path") bytes"
echo "sha256: $(sha256sum "$zip_path" | cut -d' ' -f1)"
