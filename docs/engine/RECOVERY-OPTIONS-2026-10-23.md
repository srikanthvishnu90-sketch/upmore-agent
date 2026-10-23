# Recovery options — worker host (2026-10-23)

Status: PREPARED for the owner's decision. Nothing in this doc is
approved by its presence here. The worker host is DOWN (a VM
replacement wiped `/etc/systemd/system`) and stays down until the
owner picks an option. The production freeze holds throughout: no
option in this doc authorizes a deploy, a migration, a credential
change, or a real submission.

This doc was created on branch `arch/muse-measure-host` (2026-10-23)
because no recovery-options doc existed on trunk; the selective-
restore option it replaces previously lived only in chat and in the
engine audit (`docs/engine/ENGINE-AUDIT-2026-10-23.md`, on branch
`muse/2026-10-23-engine-audit`).

## Option 1 — Do nothing (current posture)

The host stays down. The board service, egress relay, executor, and
alerts scheduler all stay off; the F8 watchdog and both sampling
crons stay disabled. Read-only repo and harness-tier engine work
continues; no live form mapping is possible. This remains the
default until the owner decides otherwise.

## Option 2 — Selective restore of the standard board service — RULED OUT

_Ruled out by the owner, 2026-10-23._

The pre-G3a selective option: place only the board + relay units
from the worker-restore kit by hand, leaving the executor timer,
alerts timer, and watchdogs off. Rejected on the measured facts:

- The standard board service's call dispatcher executes
  `armForSubmit` / `submit` on a caller's self-asserted approval
  context. Module 150's gate checks the arm's SHAPE
  (`approvedByUser: true` plus a non-empty approval reference); it
  never verifies a product record behind it. A loopback caller
  holding the board secret could therefore fill and submit a live
  Greenhouse/Lever application with no prepare row, approval card,
  or claim in existence.
- The standard unit runs as root (no `User=`), on a host where the
  executor's production credential file sits root-readable in the
  same config directory. Loopback + root is not a read-only
  boundary; the "measurement" property would rest on convention,
  not construction.

## Option 3 — Submit-disabled measurement host (PREPARED on `arch/muse-measure-host`)

Restore board + relay only, with the board service replaced by a
variant whose safety properties hold BY CONSTRUCTION IN CODE:

- **Deny in the dispatcher.** `workers/career-browser/board-service-
  measure.cjs` refuses `fill`, `answers`, `atReview`, `armForSubmit`,
  `submit`, and `submissionState` with a named 403
  (`MEASURE_HOST_METHOD_DISABLED`) before any session lookup or
  board touch — unconditionally, under any configuration, including
  one copied field-for-field from the production board config. There
  is no runtime flag, because the code that would honor one does not
  exist in the process. (Precedent: module 150's BUG-063 gate made
  `REAL_SUBMIT_DISABLED` the default and arming the exception; this
  variant removes the exception.)
- **Restricted facade.** Every session board is wrapped in a facade
  exposing only `open`, `form`, `screenshot`, `close` and read-only
  metadata. The write methods are not properties of the object the
  service holds — there is nothing for a caller (or a future bug) to
  invoke.
- **No production credential, by construction.** The variant holds
  only its own board API secret; its source contains no reference to
  the executor's env file or config module and no production-database
  client, URL, or key (grep-pinned by test). Its unit
  (`scripts/career/systemd/upmore-career-board-measure.service`)
  runs it as the dedicated unprivileged user `trainee-measure`, with
  NO `EnvironmentFile` and an `Environment=` set free of
  production-database variables — so the executor's root-owned mode
  600 env file is unreadable to the process by filesystem
  construction as well.
- **Measurement surface intact.** Session create/close under the
  §6.3 host gate and the family-verdict gate (Greenhouse/Lever per
  config verdicts), the shared-secret loopback API, `open` + `form`
  (the read-only form map through the relay-driven browser), and
  module 150's drive evidence (captcha-stop screenshots, logs).
- **Proof.** `tests/career-board-measure-host.test.cjs` (7 tests:
  deny ×3, facade, surface, parity, real-wire) and
  `tests/career-board-measure-unit.test.cjs` (3 tests: unit user,
  unit environment, source surface). The deny assertions were run
  FAIL-FIRST against the production board service: 5 fail / 2 pass
  there; 10/10 pass on the variant.

### What an approval of Option 3 would authorize — exactly these host steps

1. Create the service user:
   `sudo useradd --system --no-create-home --shell /usr/sbin/nologin trainee-measure`
2. Place the measurement operator config at
   `/home/hatch/worker-config/board-measure-config.cjs` (board API
   secret + family verdicts; bind port 8473), owned
   `root:trainee-measure`, mode 640. (Operator step; the secret is
   never written to the repo.)
3. Place two unit files in `/etc/systemd/system/`:
   `upmore-career-board-measure.service` (from
   `scripts/career/systemd/` in this branch) and
   `upmore-egress-relay.service` (from the worker-restore kit's unit
   templates, unchanged — the relay holds no credentials), then
   `systemctl daemon-reload`.
4. `systemctl enable --now upmore-egress-relay.service` then
   `systemctl enable --now upmore-career-board-measure.service`
   (relay first: the board's drives tunnel through it).
5. Verify read-only: both ports listening on loopback; a no-secret
   request to the board port returns 401; a secret-bearing
   create/open/form/close cycle against a Greenhouse or Lever
   posting maps the form; a `submit` call returns 403
   `MEASURE_HOST_METHOD_DISABLED`.

### What stays OFF under Option 3

The production board service (8471), the executor service and its
timer, the alerts scheduler units and their self-heal hook, the F8
watchdog cron, both production sampling crons, and every flag
(`CAREER_AGENT_SUBMIT` and friends stay OFF; no settings rows are
created). Note the kit interplay: the worker-restore kit counts the
executor units as REQUIRED, so it would read a measurement-only
host as DEGRADED — expected, not a failure of this option; the kit
stays unused unless the owner separately approves changing it.

Reversal is symmetric: stop/disable the two units from step 4 and
remove the two files from step 3; the host is back to Option 1.
