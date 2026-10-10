# Upmore

Instinct spec series: `docs/instinct-spec-series/` (16 docs). Ownership, status and the rules both agents follow: `docs/instinct-spec-series/BUILD-STATUS.md`. Read it before editing anything.

## Commands (all verified on a clean clone; no root package.json, no pnpm)
- App build: `python3 src/build-app.py` (edit `src/upmore-app-template.html`, never `index.html`; commit generated files)
- Domain + registry tests: `node --test tests/*.cjs`
- Edge function tests: `deno test -A --no-check tests/edge/`
- SQL migrations + tests: `bash tests/db/run.sh` (needs Postgres binaries on PATH or `PGBIN=`; must not run as root)
- Agent100 dry run: `cd tests/agent100 && node harness/runner.js --mode dry --all` (must stay 103/103)
- Cancel outcome tests, real Chromium: `node tests/execution/live-local/run-live-local.js`
- Python tests: `python3 tests/<name>.test.py`
- Capability inventory: `scripts/capabilities --status | --domain BILL | --ask BILL-003`
- Record a check: `python3 scripts/capture-checks.py` writes `docs/testing/evidence-ledger.json`

## Rules
- Money paths stay gated. No provider adapter, migration push to the live project, deploy, or production credential without the owner doing it himself.
- Never fake a connector or outcome: a rail that is not live returns NOT_WIRED; a cancel is done when the merchant's record says cancelled; a fee is recovered when the credit posts.
- Every user-facing money statement cites its data source and as-of time. The model explains numbers; functions over real rows produce them.
- `packages/capabilities/registry.json` is the source of truth. Status rises only via `status-overlay.json` with a `test_ref` that exists and passes.
- One owner per file (BUILD-STATUS "Claimed files"). Claim before editing; never edit the other agent's files, leave a Request instead.
- Never store OTPs, passwords or identity digits. One explicit approval per cancellation. No phone calls. No securities advice.

## Done means
- The packet's own check command was run and its output pasted, then recorded in the evidence ledger. Tests pass here, not only on one machine: no hardcoded `/home/<user>` paths.
