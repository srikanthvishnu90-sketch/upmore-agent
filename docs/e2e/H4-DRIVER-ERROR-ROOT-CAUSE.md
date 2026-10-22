# H4 root cause — the engine prepare's DRIVER_ERROR, diagnosed

Lane H4, 2026-10-22, branch `muse/2026-10-22-e2e-h4-browser` off the E2E
skeleton @ c4136bd9. All probe outputs below were measured on this VM on
2026-10-22; nothing is quoted from another lane's notes.

## Verdict

**ENVIRONMENT, with two product defects found inside it and fixed.**

The DRIVER_ERROR the skeleton measured is not a driver bug and not a
form/fill failure. On this VM class, **no sandboxed Chromium can start
for any user in any context we can create** — and the cloud drive path
refuses, by design, to run any other way. Every working drive this VM
has ever produced (the board service's) ran with the sandbox explicitly
switched off by operator configuration. Two genuine product defects hid
inside that fact and made it look like a driver bug; both are fixed on
this branch (see "Product defects" below).

## Why the drive dies — the chain, link by link

1. **The test/drive processes available here run as root** (uid 0).
   Chromium refuses to initialize its sandbox as root. Measured
   (Playwright, `chromiumSandbox: true`, owner's browser cache):
   `browserType.launch: Target page, context or browser has been closed
   / Browser logs: / Chromium sandboxing failed!`
2. **An unprivileged user cannot create the namespace sandbox either.**
   Ubuntu's AppArmor restriction is on:
   `/proc/sys/kernel/apparmor_restrict_unprivileged_userns` = `1`.
   Measured as `nobody`: `unshare -Ur` → `unshare: write failed
   /proc/self/uid_map: Operation not permitted`; direct sandboxed
   Chrome → `FATAL:zygote_host_impl_linux.cc:129 No usable sandbox!`
   The generic sysctls look permissive (`unprivileged_userns_clone=1`,
   `unshare -Ur` works **as root** — root is exempt), which is what made
   this easy to misread as "should work".
3. **The SUID sandbox cannot engage either.** `chrome_sandbox` ships
   0755 (not setuid) in the browser cache — and setuid would not help:
   **PID 1 runs with `NoNewPrivs: 1`** (measured in `/proc/1/status`),
   inherited by every process on the VM (agent shells, systemd units,
   the board service all show `NoNewPrivs: 1`, `Seccomp: 2`). Elevation
   via setuid/file-caps is therefore impossible anywhere on this host.
   Measured: staged copy with `chrome_sandbox` chmod 4755 on a
   non-nosuid filesystem → still `No usable sandbox!`.
4. **Inside a root-created user namespace**, Chrome gets *past* the
   sandbox gate but dies in its crashpad bootstrap: the monitor-self
   handler is spawned with `--initial-client-fd` and no `--database`,
   exits 1 printing `chrome_crashpad_handler: --database is required`;
   the browser's first `sendmsg` to it returns `EPIPE`, and the browser
   traps (`SIGTRAP`, strace-measured syscall sequence). Reproduced with
   Playwright and with the bare binary, sandboxed and `--no-sandbox`
   (diagnostic only), staged and original browser paths. The same
   binaries run fine outside any namespace with the sandbox off
   (diagnostic control) — the stage and binaries are healthy.
5. **The cloud seam refuses the only remaining option.** The board
   path honors the product's documented operator opt-out
   (`UPMORE_CHROMIUM_SANDBOX=off` → `--no-sandbox`,
   portal-browser-helper.cjs:69; the header at :51-57 names this exact
   host class and the opt-out, and the board service's systemd unit on
   this VM sets it). But the cloud drive goes through the helper's
   `createSession` seam, which **throws `BROWSER_SANDBOX_REQUIRED`
   when the opt-out is set** (portal-browser-helper.cjs:969): the
   trusted worker seam never runs unsandboxed. That is a deliberate
   posture, and this lane did not weaken it.

## Product defects found and fixed here

**(a) The failure was misnamed — error surfacing.**
`portal-browser-helper.cjs` classified launch failures with
`/SUID sandbox|sandbox.*abort|No usable sandbox/i` →
`BROWSER_SANDBOX_UNAVAILABLE`, everything else → `DRIVER_ERROR`.
Playwright's actual wording for the root case — `Chromium sandboxing
failed!` — matches none of it, so the host's sandbox wall was reported
up the chain as a generic `DRIVER_ERROR` (worker.ts's settle default),
and successive lanes chased a phantom driver bug.
*Fix:* the classification is now an exported `classifyDriverError`
whose sandbox pattern also matches `Chromium sandboxing failed`
(scripts/career/portal-browser-helper.cjs; the pump() response path
uses it). *Guard:* `tests/career-portal-sandbox-classification.test.cjs`
— the measured error strings classify correctly; fail-first on base
(the export does not exist), 3/3 on the fix.

**(b) The operator's sandbox posture could not reach the cloud engine.**
`cloudEngineRunner` spawns `scripts/apply.ts` with `clearEnv: true`
and an allowlist (`ENGINE_ENV_KEYS`, workers/career-cloud/worker.ts)
that did **not** include `UPMORE_CHROMIUM_SANDBOX` (its sibling
`UPMORE_CHROMIUM_PATH` was listed). An operator who set the documented
opt-out on the worker process had it silently dropped before the
engine child — and, with the opt-out invisible, the helper never even
got to refuse by name; the launch simply died as DRIVER_ERROR. *Fix:*
`UPMORE_CHROMIUM_SANDBOX` added to `ENGINE_ENV_KEYS` (the value comes
from the trusted worker process's own environment, never from a job —
the boundary test pins that credentials/RPC selectors/job payloads
still do not cross). *Guard:* `tests/e2e/engine-env.test.ts` (deno) —
fail-first 1/2 on base, 2/2 on the fix. Measured effect: through the
staged route, the drive now stops with the honest, named
`BROWSER_SANDBOX_REQUIRED` from the product's own gate instead of
`DRIVER_ERROR`.

## The staging (the "cannot be staged" claim is refuted)

The skeleton lane recorded that the unprivileged route "cannot be
staged" because `/home/hatch` is unreadable to non-root users
(`drwxrws--- root:nogroup` — true). The conclusion does not follow:
copying is not chmod-ing the owner's home. `tests/e2e/
stage-unpriv-run.sh` stages the repo + deno + Playwright + browsers
into a world-readable tree (default `/opt/e2e-stage`, never committed),
probes three browser contexts in order — `nobody` sandboxed,
root-in-userns sandboxed, `nobody` with the product opt-out — and runs
the drive as `nobody` in the first whose **launch probe** passes,
printing `SANDBOX_ROUTE <route>` on the run's first line (exit 86 with
all probe outputs if none passes). Four staging defects were found and
fixed on the way, any of which would have failed the leg on a
healthy host too:

- The owner's browser cache aliases the headless shell to the full
  Chrome via an **absolute symlink into `$HOME`** — dangling for any
  other user. The script rewrites such links relative inside the
  stage. (Dereferencing instead is wrong: Chrome locates `icudtl.dat`
  via `/proc/self/exe`'s real path and dies with `Invalid file
  descriptor to ICU data received` — measured.)
- A blanket `chmod -R a+rX` over the whole stage re-permissioned the
  engine's state dir (`~/.local/state/upmore/apply`) from 700 to 755
  between drives, tripping apply.ts's `PRIVATE_DIRECTORY_REQUIRED`
  (apply.ts:116). The chmod is now scoped to the read-only payload;
  runtime areas (home/tmp/work) are the drive's own.
- The stage ROOT's own mode was never set: `mkdir -p` inherits the
  caller's umask, and a stage root created under umask 007 sat at
  `770 root:root` — every probe then failed as `nobody` with
  `MODULE_NOT_FOUND` (`node:internal/modules/cjs/loader`) while root
  saw a healthy tree (measured 2026-10-22, after an earlier green
  run had created it traversable). `ensure_stage` now `chmod 755`s
  the stage root on every call, including the stamp-hit path.
- The runtime areas were world-writable but **root-owned**, and
  Chromium cares about ownership, not just modes: as `nobody` with
  `HOME=<stage>/home` at `777 root:root`, every launch — sandboxed,
  `--no-sandbox`, headless shell and full Chrome alike — died in the
  crashpad handshake (`chrome_crashpad_handler: --database is
  required`, browser SIGTRAP), the same signature earlier attributed
  to the userns context alone. A/B with only HOME changed
  (`/tmp/nbhome`, `nobody`-owned, 700): the identical launch prints
  PROBE_OK. Chrome anchors its crashpad database under HOME and does
  not accept a foreign-owned one. `ensure_stage` now chowns the
  runtime areas to the drive user on every call (home 700, tmp/work
  777). Root with the same stage launches fine either way — which is
  why this defect only ever bites the unprivileged route it exists
  to serve.

The test's staged mode (root test process) also chmods its per-run
workdir and the facts/resume/driver files it writes — the test
process's umask leaves them `rw-rw----`, unreadable to the drive user
(measured: the staged deno died before reading its own driver).

## What the skeleton records now, and what would make it PASS

On this VM the H4/H5 leg now runs end to end through the staged route
and stops at the product's own gate, recording:

```
E2E-MAP H4 cloud worker->board: ENVIRONMENT — the staged drive (route
nobody-optout) reached the product's own sandbox gate and was refused
by name: BROWSER_SANDBOX_REQUIRED …
E2E-MAP H5 board->confirmation: ENVIRONMENT — the drive stopped at the
product's sandbox gate before any form interaction (see H4) …
```

with `E2E-DOORSTEP {"ready":false,"result":{...,"reason":
"BROWSER_SANDBOX_REQUIRED", ...}}` as the in-run evidence. On any host
where a sandboxed Chromium can initialize (no AppArmor userns
restriction, no inherited NoNewPrivs — e.g. the D-010 host run as a
normal user), the runner's first or second probe passes, the drive
runs sandboxed, and H4/H5 record PASS with the posture named in the
line. No code change is needed for that flip; it is the same test.

Full-skeleton runtime on this VM with the staged leg: ≈ 11 s wall
(provisioning ≈ 6 s, DB legs < 1 s, the drive leg ≈ 3 s to the gate).
A drive that actually fills the form is budgeted at the design doc's
120 s nightly figure (WO-039's three drives took ≈ 28 s combined in CI
conditions).

Operational note, unrelated to the product: the skeleton's disposable
state lands in a 512 MB `/tmp` tmpfs; accumulated state dirs from
repeated runs fill it and provisioning then fails with initdb's
`No space left on device`. Clean `/tmp/upmore-e2e-skel-*` between
marathon sessions.

Real completions: **0.** This lane changed a test harness, one error
classifier, and one env allowlist entry. It submitted nothing.
