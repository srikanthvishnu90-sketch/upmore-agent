# Measurement-host variant: submit-disabled board service, prepared for owner approval

Owner-directed preparation (2026-10-23) under the production freeze.
REPO-ONLY: no host steps were performed, nothing was installed,
enabled, deployed, or called live. The worker host stays down; this
branch prepares the option the owner can later approve.

## Why

The owner ruled OUT restoring the standard board service on a
measurement host: its dispatcher executes `armForSubmit`/`submit`
on a caller's self-asserted approval context (module 150's gate
checks the arm's SHAPE — `approvedByUser` + a non-empty ref — never
a product record), and its unit runs as root beside the executor's
production credential file. Loopback + root is not a read-only
guarantee. This branch replaces that option with a variant whose
safety holds BY CONSTRUCTION IN CODE.

## What changed

**`workers/career-browser/board-service-measure.cjs` (new)** — a
sibling of `board-service.cjs` with the same wire contract, auth
(shared secret, fail-closed with none), §6.3 host gate, family-
verdict gate, per-user binding, cap, TTL, and reap-on-crash
behavior. The write surface is absent in three layers:

1. **Dispatcher deny** — `fill`, `answers`, `atReview`,
   `armForSubmit`, `submit`, `submissionState` are refused with a
   named 403 (`MEASURE_HOST_METHOD_DISABLED`) BEFORE any session
   lookup, ownership check, or board touch. No flag or config field
   exists that could re-open them; the deny holds under a config
   copied field-for-field from production (test-proven, including a
   present `boardShards: 4` — the variant never reads it; single-
   core only). Precedent: module 150's BUG-063 gate made
   `REAL_SUBMIT_DISABLED` the default and arming the exception;
   this variant removes the exception.
2. **Restricted facade** — every session board (default module-150
   factory or injected) is wrapped in `restrictBoard()`: the object
   the service holds exposes only `open`, `form`, `screenshot`,
   `close` + read-only metadata. The write methods are not
   properties; there is nothing to invoke.
3. **No production credential surface** — the variant imports no
   database client, reads no executor env file or config module,
   and holds only its own board API secret (grep-pinned by test).
   The HTTP adapter is the production service's own
   (`createBoardHttpServer`, F-033 fix included); module 150 and
   the host gate are shared, never forked.

**`scripts/career/systemd/upmore-career-board-measure.service`
(new)** — unit template placed alongside the existing career unit
sources (this directory was chosen: it is where the repo keeps
career unit sources; the worker-restore kit's unit templates hold
full-restore units and were left untouched). Declares
`User=trainee-measure` (dedicated unprivileged service user;
creation is a future owner-approved host step), NO `EnvironmentFile`
directive, and an `Environment=` set with only the egress-proxy /
Chromium variables — no production-database variables. The
executor's env file stays root-owned mode 600, unreadable to that
user by construction. `scripts/career/systemd/README.md` gains a
section recording these construction facts.

**`docs/engine/RECOVERY-OPTIONS-2026-10-23.md` (new)** — no
recovery-options doc existed on trunk, so it is created here with
the three options: do nothing (current posture) · selective restore
**RULED OUT** (owner, 2026-10-23, reason recorded) · the
submit-disabled variant as the prepared option, including the exact
five host steps an approval would authorize and what stays off
(executor, alerts, F8, sampling crons, production board service,
all flags).

## Fail-first evidence

`tests/career-board-measure-host.test.cjs` was written first and run
against the CURRENT production dispatcher via
`MEASURE_HOST_SERVICE_UNDER_TEST=workers/career-browser/board-service.cjs`
(the repo's board tests drive `handle()` in-process; the wire test
uses the stock `startBoardService` the same way):

- **Against production `board-service.cjs`: 5 fail / 2 pass.** The
  three deny tests, the facade test, and the wire deny test all
  fail — on stock code `fill` returns
  `200 {"ok":true,"result":"filled"}`: the write lands. The two
  passing tests are the measurement surface and the refusal parity,
  which stock code satisfies by design.
- **Against the variant: 7/7 pass**, and the driver spy proves zero
  invocations reached any write method across all six denials.
- Unit assertions (`tests/career-board-measure-unit.test.cjs`) were
  likewise run before the unit existed: 2 fail / 1 pass (the
  source-grep test passed against the variant source). One
  assertion was corrected while writing: the no-`EnvironmentFile`
  check anchors on directive syntax (`^EnvironmentFile=`) because
  the unit's own comments explain the directive's absence in words.
- **After: 10/10 pass** across both new files.

## Neighbor regressions

- `career-board-provider` + `career-portal-submit-path` +
  `career-portal-browser`: 27 pass / 13 fail on this branch AND on
  unmodified trunk `63a1233f`, with byte-identical failing sets —
  the 13 are pre-existing VM-environment reds (Chromium sandbox
  posture), zero branch-caused. This branch modifies none of those
  sources.
- `career-board-directory` + `career-board-harvest`: 14/14 on both.
- `no-secrets`: 3/3 with the new files present; the new test files
  contain no non-portable paths (gate `test-paths` constraint).
- The full `scripts/gate.sh` was NOT run: it is environment-red on
  this VM (deno absent; Chromium sandbox posture) — the same reds
  reproduce on unmodified trunk, per the neighbor comparison above.

## Not in this branch

No changes to `board-service.cjs`, module 150, the executor, the
restore kit, or any architect branch. No host steps: the service
user, the measurement config module, and the unit installs are all
future owner-approved actions listed in the recovery doc.
