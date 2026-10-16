# Playbook drift — 2026-10-16

## Conversation recovery: portable clock guard

The root command guide says Node domain tests are verified on a clean clone and no per-user paths are allowed. `tests/career-clock-source-guard.test.cjs` instead loaded a missing `$HOME/workspace/your_files/upmore-career-300-scenarios.md`; in the fresh environment it failed before executing its assertions. The loader now uses the repository's checked-in `scripts/career/gauntlet/routing-expectations.json` and requires the two referenced IDs to exist. Existing assertion bodies, expected verdicts and the original frozen conversation oracle are unchanged. The before failure and after test output are retained under `docs/testing/runs/conversation-fixes-20261016/`. No private uploaded scenario text or personal writing corpus is copied into the packet.

The combined release's owned-worker note described only loopback application
portals. It was accurate for that base, but public-browser research still had
no entry action: `career_task_bridge.js` admitted only application preparation,
approval, reconciliation and status. The independent conversation recovery
evaluation therefore recorded the 15 public cases as unsupported/NOT_RUN.

The review branch adds a bounded `research` intent and ordinary chat command,
using the existing atomic outbox/account authority and owned helper. Public
source capture is reported as `evidence_ready` with its objective still requiring
review. It is not counted as a completed research answer or live browser proof.
The original loopback application restrictions and Muse's approval hash fix
remain intact. No deployed capability or acceptance count is raised.

The forward SQL is a proposal because CLI migration scaffolding is blocked in
this executor. The public-research README records the exact failure, integration
step, normal Chromium blocker, supported scope and 15-case acceptance manifest.

An ordinary chat status commit advances the shared account version and can
therefore revoke queued research. The new `research_status` observation avoids
that write and returns `read_only: true`; it creates no turn pair, receipt or
memory update. Existing application status and account authority are unchanged.
Real PostgreSQL entry tests verify repeated early observations keep the intent
claimable, while an actual STOP still revokes it.
