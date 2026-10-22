# C5: chat-to-confirmation E2E (H1–H6) on trunk + merge-gate wiring

Cause 5 now runs on trunk: a channel status ask after a batch is prepared returns the real approval card — and after the tap, the application's true loop state, up to the employer's confirmed receipt rendered in chat — instead of the generic fallback, and the chat approval turn can hand its minted batch to the cloud begin/claimer path that did not exist on this lineage at all. The hermetic half of the chat-to-confirmation E2E (H1/H2/H3a/H3b/H3-drain/H6/H7 plus the engine-env guard) runs inside `scripts/gate.sh` on every merge, so a trunk PR that breaks the chain fails the gate. H7 (receipts + loop closure, `muse/2026-10-22-e2e-h7-receipts` @ b1bec38c) is folded into the same port. Nothing is deployed, no migration was written or applied, the submit flag is untouched, and no approval-path code was edited (approve RPCs, `runChannelApproval`, claim predicates and the C9 refusal all stand as trunk had them — proven by the skeleton's negative legs and the guards' negatives).

Base: `origin/trunk` @ 72031f0d. Source of the port: `muse/2026-10-22-e2e-green` @ f0f900f2 + H7 @ b1bec38c.
Assignment: BUILDER-PLAN-48H-20261022 item C5 (architect's plan, owner-relayed 2026-10-22), scope addition H7 same day.

## Measured E2E map — trunk port (disposable PG16, this VM)

| Leg | Result |
|---|---|
| H1 chat→card | PASS |
| H2 card→approval | PASS |
| H3a approval→cloud worker (chat begin route) | PASS — composed route; C9 control leg NOT EXECUTED (named gap below) |
| H3b approval→cloud worker (claim predicates) | PASS |
| H3 approval→cloud worker (drain/claimer) | PASS (tier 2, stub engine) |
| H4 cloud worker→board | ENVIRONMENT — sandboxed Chromium cannot initialize on this VM class; product refuses unsandboxed by design |
| H5 board→confirmation | ENVIRONMENT — same host condition |
| H6 confirmation→recorded state | PASS |
| H7 confirmed→receipt + loop closure | PASS |

Full skeleton wall ≈24s. Hermetic gate subset: 6/6 legs + 2/2 engine-env in ~5s.

## Per-handoff port verdicts

- **H1 — PORTED.** Trunk's `channel_bridge.ts` was byte-identical to the old lineage's base; the H1 block (`runChannelStatus` + remembered-run readback) applied clean. Trunk's diverged 155/bridge shapes verified export-compatible.
- **H2 — ALREADY ON TRUNK.** Card show/approve RPCs exist in trunk's chain (20261024130000); the leg passes against trunk's schema unchanged.
- **H3a — PORTED, with a named gap.** Module 176 (`beginCloudCardPostings`) + the host/router begin wiring ported onto trunk's diverged `career_host.js` / `142-career-router.js` batchDeps pattern (same seam Codex's J8/J10 wiring uses). **Gap: migration `20261024140000` (`career_apply_cloud_begin_agent_own`) is absent from trunk's chain** — the stage-2 C9 control leg cannot execute on trunk; its assertions stand unmodified, the H3a record names the gap, and the classification wrapper must be removed when the migration lands. No migration written or applied.
- **H3b — ALREADY ON TRUNK.** Claim predicates live in the 130000-era objects; leg passes unchanged.
- **H3 drain — PORTED.** `workers/career-cloud/pg-queue.ts` + `drain.ts` + the systemd unit source were absent on trunk; ported verbatim (unit in-tree only, NOT installed).
- **H4 — PORTED (code), ENVIRONMENT (leg).** `classifyDriverError` ported into trunk's diverged `portal-browser-helper.cjs` at the identical pump seam; `UPMORE_CHROMIUM_SANDBOX` restored to `ENGINE_ENV_KEYS` in `worker.ts`.
- **H5 — ENVIRONMENT.** Same host condition as H4; assertions run wherever a sandboxed Chromium can start.
- **H6 — ALREADY ON TRUNK.** `career_apply_cloud_finish` / `career_apply_confirm_as` in trunk's chain; leg passes unchanged.
- **H7 — PORTED.** `career_apply_receipts.ts` gains `confirmedReceiptText` + `applyLoopText` (trunk's file was byte-identical to the H7 base, delta applied clean); the bridge gains the fail-open loop readback phase (`readApplyLoopRow`) inside the existing readback block of `runChannelTurnRich` — no approval-path edits.
- **Bundle registry:** trunk's `build-router-core.py` had dropped module 176; restored (36 career modules, `--career-only --check` green).

## Guards — trunk base → this branch (fail-first)

| Suite | Trunk base | Branch |
|---|---|---|
| tests/edge/channel-card-readback.test.ts | 4 pass / 1 fail | 5 / 0 |
| tests/edge/channel-loop-receipt.test.ts (H7) | 1 pass / 7 fail | 8 / 0 |
| tests/career-agent-begin-card.test.cjs | file fails (176 absent) | 4 / 4 |
| tests/career-agent-begin{,-wiring,-cloud}.test.cjs | fail (176 absent) | 25 + 3 + 11, 0 fail |
| tests/career-portal-sandbox-classification.test.cjs | fail (no export) | 3 / 3 |
| tests/e2e/engine-env.test.ts | 1 pass / 1 fail | 2 / 2 |
| neighbors: tests/edge/channel{,-delivery,-integrity,-inbound} | — | 24 / 24 |
| neighbors: tests/router-bundle.test.cjs | — | 3 / 3 |
| tests/db/run.sh (trunk chain, PG16) | — | exit 0, "db tests passed", 2,086 ok |

No test deleted, skipped or loosened anywhere in this port.

## Gate wiring proof

`bash scripts/gate.sh` on this branch (this VM), full clean run: test-paths OK · browser-runtime FAILED · architect-tests OK (1,270 passed / 0 failed) · apply-cli-typecheck OK · career-and-shared-tests FAILED · career-edge-tests OK · **e2e-hermetic OK** · pay-importers OK · career-bundle OK · career-typecheck OK. The new step shows `STEP e2e-hermetic OK` in two separate full gate runs, and the full edge list in career-edge-tests (including both new guard files) is OK.

The two FAILED steps are this VM's environment, measured against trunk base — not this port:
- **browser-runtime**: `playwright` is not resolvable from the repo root on this VM (MODULE_NOT_FOUND) and sandboxed Chromium cannot launch here. Trunk's own step, untouched by this port; CI installs the browser deps.
- **career-and-shared-tests**: failures are (a) ENOSPC on the 512MB /tmp tmpfs during the 13-minute step (60 ENOSPC errors in the log) — the disk-bound suites it hit pass standalone on this branch (career-named-role-capture 1/1, deploy-provenance 12/12); and (b) browser-dependent suites that fail **identically on trunk base** in this environment (career-cloud-worker 0 pass / 3 fail, career-cloud-engine-input 0/2, career-portal-lever-radio 0/2 — same counts on base and branch). No sampled failure is attributable to this port.

## Files touched

Product: `supabase/functions/_shared/channel_bridge.ts` (H1 readback + H7 loop phase), `supabase/functions/_shared/career_apply_receipts.ts` (H7), `supabase/functions/_shared/career_host.js` (agentBegin dep), `packages/domain/142-career-router.js` (begin delegation branch), `packages/domain/176-career-agent-begin.js` (new), `workers/career-cloud/pg-queue.ts` + `drain.ts` (new), `workers/career-cloud/worker.ts` (env key), `scripts/career/portal-browser-helper.cjs` (classification), `scripts/career/systemd/trainee-cloud-drain.service` (new, not installed), `scripts/build-router-core.py` (176 restored) + rebuilt `router_core{,.career}.js`.
Tests: `tests/e2e/` (skeleton, mock employer, stages, provisioning, engine-env), `tests/edge/channel-card-readback.test.ts`, `tests/edge/channel-loop-receipt.test.ts`, `tests/edge/lib/channel_fixture.ts` (+batchIntents, +career_apply_jobs), `tests/career-agent-begin{,-wiring,-cloud,-card}.test.cjs`, `tests/career-portal-sandbox-classification.test.cjs`.
Gate: `scripts/gate.sh` (edge list + `e2e-hermetic` step).
Docs: `docs/e2e/` (design + H1/H3/H4/H7 root-cause notes, trunk status), `docs/apply/ROOT-CAUSE-F030-SEAM-CARD-BINDING-2026-10-22.md`.

Real completions remain 0. Repo + tests only: no deploy, no migration, no merge, no spend, submit flag untouched.
