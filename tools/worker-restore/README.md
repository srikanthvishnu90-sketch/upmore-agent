# F8 — worker-host auto-restore (TP-INFRA, 2026-10-21)

Spec source: `docs/career/throughput-handoff-2026-10-21.md` F8.
Procedure source: `docs/gauntlet/worker-flip-2026-10-20.md` (the manual
restore, measured twice on 2026-10-21: detection -> gates green ≈ 10 min).

## The failure

The career worker's systemd units live in `/etc/systemd/system`, which
VM replacements on this host class wipe entirely — twice on 2026-10-21
(~11:05 and ~12:30 CDT; the second landed mid-benchmark). Everything
needed to rebuild survives under `/home/hatch/worker-config/` (operator
configs, the shared secret in its sanctioned homes, the relay script,
the Chromium wrapper) plus the unit texts — which until now existed
only in /etc and in the flip doc's prose. systemd supervision covers
crashes on a living VM; it cannot cover the unit files themselves
disappearing.

## What lives here

- `units/` — the unit templates, captured byte-faithful from live
  `systemctl cat` on 2026-10-21 (board, executor, executor.timer,
  egress relay, the board drop-in `throughput-chromium.conf`). The
  smoke unit is the one exception: it was ABSENT from /etc at capture
  time (the day's restores re-registered the operating stack only), so
  its template is reconstructed from the flip doc and marked as such.
  Known cosmetic drift, kept deliberately: the timer's Description
  still says "every 60s"; its live cadence is `OnUnitActiveSec=20s`
  (throughput lane fix). Fix the string at the next deliberate edit.
- `restore-worker.sh` — detection + restore + verification in one
  script. `--dry-run` is the default and the only mode the authoring
  lane ran: it writes nothing, starts nothing.
- The production log is `/home/hatch/worker-config/restore-log.jsonl`
  (it survives with the rest of worker-config). One JSON record per
  run: timestamp, mode, verdict, required/posture gap lists, probe
  results. No secret ever enters it (the secret is read transiently
  for the probes and unset immediately).

## Detection set (what "healthy" means)

Required — any gap makes the verdict DEGRADED:
- config files present in /home/hatch/worker-config (board-config.cjs,
  executor-config.cjs, executor.env, connect-relay.cjs,
  chromium-egress-wrapper.sh, board-smoke-launcher.cjs) + wrapper executable
- unit files present: board, executor, executor.timer, egress relay
- board active+enabled · relay active+enabled · executor timer active+enabled
  (executor.service itself is a timer-pulled oneshot: file presence is
  its healthy state)
- board drop-in present with UPMORE_CHROMIUM_PATH (without it the board
  service resolves a stub Chromium with no binary — one of the three
  stacked causes that killed drives on 2026-10-21)
- relay port 8474 listening · board port 8471 listening
- the five gate probes: no-secret -> 401 · wrong-secret -> 401 ·
  correct-secret + example.com -> 403 DRIVER_HOST_REFUSED ·
  correct-secret + Ashby -> 403 FAMILY_NOT_DRIVEABLE ·
  correct-secret + Lever -> create 201 + close 200

Posture (reported, never blocks HEALTHY): the smoke unit file. It is
stopped by design when present; a full restore rewrites the file and
NEVER starts it.

The refusal probes are side-effect-free by construction:
board-service's createSession checks auth, the host gate and the
family verdict BEFORE the session factory runs, so the correct-secret
refusal probes (example.com, Ashby) are refused with no session
created. The Lever probe is the deliberate exception: tonight's live
board-config enables Lever, so the probe proves the enabled family
end to end — it creates one session and closes it in the same probe,
leaving nothing behind. (The pre-2026-10-21 probe expected Lever to
be refused 403 from the greenhouse-only era; on tonight's config that
expectation made every verify read DEGRADED on a healthy host.)

## Restore (--execute; watchdog/operator only)

1. Preflight: board-config.cjs + executor.env must exist; if the
   worker-config material itself is gone the verdict is
   UNRESTORABLE_LOCAL (the shared secret lives only there and in the
   Supabase function env — nothing in the repo can rebuild it) and the
   operator is paged. The script stops.
2. Install the unit templates (+ drop-in), `daemon-reload`, enable
   board/relay/timer, start relay -> board -> timer. The timer resumes
   executor drains on its 20 s cadence; claim-once discipline covers
   any intent that was mid-drain when the host died (flip doc,
   incident 2: claimed prepares fence `uncertain`, never re-driven).
3. Wait for :8471, then re-run the full detection + probes (the script
   re-invokes itself in --dry-run); the final verdict is the probes'.

## Watchdog design (the trigger must live outside /etc)

A watchdog UNIT cannot solve this: it would live in the same /etc the
wipe takes. The restore trigger has to sit somewhere a VM replacement
does not reach. On this host, exactly one such scheduler exists and it
proved itself on 2026-10-21: **the Muse job scheduler** — its jobs
are not stored on the VM's filesystem, and the 20-minute mission jobs
kept firing across both replacements that day. Design:

- A Muse cron job every ~5 minutes runs
  `tools/worker-restore/restore-worker.sh --dry-run` (cheap: file
  checks + 5 probes — 4 refusals + 1 create-and-close, seconds).
- Exit 0 (healthy) -> silent. Exit 2 (degraded) on **two consecutive**
  runs (one transient systemctl hiccup must not trigger a restore) ->
  run `--execute` once, then deliver the restore's log record + probe
  verdict to the owner chat. Single-flight: a lockfile under
  /home/hatch/worker-config (survives; a stale lock older than 15 min
  is ignored) prevents overlapping restores.
- Expected detection-to-green: ~5–10 min worst case (two 5-min ticks)
  + ~1 min restore — against the ~10 min a human took with the docs
  open, and the unbounded time when nobody is watching.

Alternative considered and rejected for this host class: a boot-time
restore unit in a "persistent tree". There is no persistent systemd
tree here — /etc is the only unit directory and it is exactly what
gets wiped; such a unit would need manual re-registration after every
replacement, which is the failure being solved.

Creating that cron job is a standing-infrastructure change for the
coordinator/owner to make — this lane delivers the script + design,
and does not schedule it.

## Dry-run evidence (this lane, 2026-10-21)

`restore-worker.sh --dry-run --log tools/worker-restore/dry-run-log.jsonl`
against the live host — record appended in `dry-run-log.jsonl` beside
this file. Expected and required for the design to be believed: the
operating stack reads HEALTHY with action "none"; any gap the run
names is quoted verbatim in the lane report.
