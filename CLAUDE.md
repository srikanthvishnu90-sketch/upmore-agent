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
- Capability inventory: `scripts/capabilities --status | --domain BILL | --ask BILL-003 | --backlog [doc|group]` (regenerate: `python3 scripts/build-backlog.py && python3 scripts/build-capability-registry.py`)
- Datasets (doc 12): `node evals/data/validate.cjs` (schemas + privacy lint), `node evals/data/run-adversarial.cjs` (injection + traps through the agent), generators under `evals/data/generators/`; news relevance benchmark (doc 10 bar): `node evals/news/benchmark.cjs`
- Parity matrix (doc 03): `node evals/parity/build-matrix.cjs` (regenerate + coverage per app; `--check` fails on a stale matrix, an unaccounted outcome, or a coverage decrease)
- Eval harness (doc 13): `node evals/runner.cjs` (release verdict, results under `evals/results/`), `node evals/runner.cjs --mutations` (the 10 planted defects must all be caught)
- Depth protocol (one capability at a time): `node --test tests/depth-<ID>.test.cjs && node evals/depth/run.cjs <ID>` (15 sub-capabilities, each test proven to fail under its planted defect; results into `docs/depth/<ID>.md`)
- Real-world 206 audit (docs/realworld): `node --test tests/realworld.test.cjs && node scripts/realworld-audit.cjs --check` (regenerate the report: `node scripts/realworld-audit.cjs`)
- Rails (one at a time, same depth runner): Rail 1 recipients `node --test tests/depth-RAIL-1.test.cjs && node evals/depth/run.cjs RAIL-1` (table + RLS in `bash tests/db/run.sh`); Rail 2 Alpaca, LIVE in the person's own account (mock server) `node --test tests/depth-RAIL-2.test.cjs && node evals/depth/run.cjs RAIL-2`; Rail 3 merchant terms (synthetic pages) `node --test tests/depth-RAIL-3.test.cjs && node evals/depth/run.cjs RAIL-3`
- Brokerage connect (own account, OAuth, live only, $5 cap): `node --test tests/depth-BROKER-CONNECT.test.cjs && node evals/depth/run.cjs BROKER-CONNECT`; UI `node --test tests/broker-ui.test.cjs`; HTTP `deno test -A --no-check tests/edge/broker-connect.test.ts`; table, RLS and Vault in `bash tests/db/run.sh`
- Phase 1 wiring: router contract `node --test tests/router.test.cjs`; handler wiring `deno test -A --no-check tests/edge/flow-router.test.ts`; rebuild the Deno bundle after any change to packages/domain `python3 scripts/build-router-core.py` (`--check` in tests/router-bundle.test.cjs); gauntlet against the LIVE handler only `UPMORE_CHAT_URL=... UPMORE_TEST_JWT=... node evals/gauntlet/run-live.cjs --suite sloppy|spec16|l3 --label <label>` (`--resume <label>` finishes the 3-hours-late case) (prints NOT RUN without them; never scores the modules)
- Model gateway (OpenAI gpt-5-nano by `OPENAI_API_KEY`, or `MODEL_PROVIDER=anthropic`), health and cost: `deno test -A --no-check tests/edge/model-gateway.test.ts tests/edge/model-health.test.ts`; live replays of every gauntlet failure `deno test -A --no-check tests/edge/live-replays.test.ts` (record a result file: `node evals/gauntlet/record-replays.cjs <file>`); secret scan `node --test tests/no-secrets.test.cjs`
- Record a check: `python3 scripts/capture-checks.py` writes `docs/testing/evidence-ledger.json`

## Rules
- Everything is LIVE (owner, standing since 2026-10-11): no paper trading, paper accounts, paper labels or paper fallback anywhere. Trades run only in the person's own live brokerage account, behind a fresh approval and the $5 per-order cap until the owner raises it in writing. Mocks exist only inside tests and are labeled mock.
- Money paths stay gated. No provider adapter, migration push to the live project, deploy, or production credential without the owner doing it himself.
- Docs follow the code: any session that finds docs-vs-code drift (a playbook, spec, BUILD-STATUS or README claim the repo or the live project contradicts) fixes the doc in the same commit as the finding and logs it in `docs/playbook-drift-<date>.md` (what the doc said, what is true, the source). Owner rule, 2026-10-11.
- A live failure is a test: every FAIL from a live gauntlet run is recorded by `evals/gauntlet/record-replays.cjs` and replayed by `tests/edge/live-replays.test.ts`; it stays red until fixed or triaged in writing (precondition, not_built, grader). Merge to main only after the live gauntlet passes on the exact commit.
- Never fake a connector or outcome: a rail that is not live returns NOT_WIRED; a cancel is done when the merchant's record says cancelled; a fee is recovered when the credit posts.
- Every user-facing money statement cites its data source and as-of time. The model explains numbers; functions over real rows produce them.
- `packages/capabilities/registry.json` is the source of truth. Status rises only via `status-overlay.json` with a `test_ref` that exists and passes.
- One owner per file (BUILD-STATUS "Claimed files"). Claim before editing; never edit the other agent's files, leave a Request instead.
- Never store OTPs, passwords or identity digits. One explicit approval per cancellation. No phone calls. No securities advice.

## Done means
- The packet's own check command was run and its output pasted, then recorded in the evidence ledger. Tests pass here, not only on one machine: no hardcoded `/home/<user>` paths.
