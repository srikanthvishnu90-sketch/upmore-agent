# Playbook drift — 2026-10-16

## Conversation recovery: portable clock guard

The root command guide says Node domain tests are verified on a clean clone and no per-user paths are allowed. `tests/career-clock-source-guard.test.cjs` instead loaded a missing `$HOME/workspace/your_files/upmore-career-300-scenarios.md`; in the fresh environment it failed before executing its assertions. The loader now uses the repository's checked-in `scripts/career/gauntlet/routing-expectations.json` and requires the two referenced IDs to exist. Existing assertion bodies, expected verdicts and the original frozen conversation oracle are unchanged. The before failure and after test output are retained under `docs/testing/runs/conversation-fixes-20261016/`. No private uploaded scenario text or personal writing corpus is copied into the packet.
