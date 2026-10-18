# Alerts scheduler — systemd unit sources

These are the SOURCES of the live `upmore-alerts-scheduler` units, kept in
the repo because the installed copies live in `/etc/systemd/system`, which
does not survive a VM replacement. On 2026-10-17 a VM reboot erased the
original Lane D units and the scheduler was down ~11 hours before the
deploy lane noticed (last cycle 04:45Z; units recreated 15:27:23Z, which
also restarted the clean-48h clock). With the sources here, the next
replacement is a restore, not a rebuild.

The units contain NO credentials — only the egress proxy ADDRESS. The
launcher (`../alerts-scheduler-launch.py`) fetches the Upmore project's
service key in-process through the vault surrogate at each run and passes
it to the scheduler in its environment only; it is never written to disk,
never logged, never printed. Scope is the gauntlet test user only
(resolved by the launcher from the product's own auth records).

## Reinstall (one command)

```sh
sudo cp scripts/career/systemd/upmore-alerts-scheduler.service scripts/career/systemd/upmore-alerts-scheduler.timer /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now upmore-alerts-scheduler.timer
```

## Host facts a new machine must re-derive

- `NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE` must point at the host egress
  CA bundle (here: `/run/hatch/egress-tls/ca-bundle.pem`). Without it
  every board fetch fails with SELF_SIGNED_CERT_IN_CHAIN — this was the
  one environment fact that had to be re-derived during the 2026-10-17
  rebuild.
- The proxy address (`http://hatch-egress-proxy:3128`) is this host's
  egress proxy; adjust if the replacement host differs.
- `WorkingDirectory` and `ExecStart` assume this worktree
  (`~/workspace/upmore-depth-int`); if the scheduler's home tree changes,
  update both paths AND say so in the gauntlet record — the repoint
  restarts the clean-48h clock.
- Runtime state and cycle logs live OUTSIDE the repo at
  `ALERTS_RUNTIME_DIR` (`~/workspace/alerts-scheduler`); the directory is
  recreated by the scheduler if absent.

## Verify after install

```sh
systemctl list-timers upmore-alerts-scheduler.timer   # next fire ≤15 min out
sudo systemctl start upmore-alerts-scheduler.service  # one manual cycle
tail ~/workspace/alerts-scheduler/logs/cycles.jsonl    # expect a 107-board ok cycle
```

## Self-healing (added 2026-10-18): the wipe now restores itself

The units were wiped THREE times (2026-10-17 ×2, 2026-10-18) and each time
polling stopped silently until an agent noticed — the worst gap was ~11h.
systemd cannot heal this itself: the thing being wiped IS systemd's unit
directory. The surviving pieces are (a) the persistent home directory and
(b) saved runtime state — the runtime restores its saved jobs and hooks
after a replacement. So the watchdog is a runtime **hook**:

- Hook id `upmore-alerts-scheduler-watchdog`, script
  `~/hooks/scripts/upmore-alerts-scheduler-watchdog.sh`, state under
  `~/hooks/state/upmore-alerts-scheduler-watchdog/` (heal history in
  `heals.jsonl`). Polls every 60 seconds; each poll is a few local
  `systemctl`/`cmp` probes (~0.2s).
- HEALTHY (both unit files present, byte-identical to these sources,
  timer enabled AND active) → silent no-op. It never restarts the
  service, never touches a running cycle — the heal path only recreates
  unit files and the timer, which cannot disturb a running oneshot.
- UNHEALTHY and conclusive (files missing or drifted, or timer not
  enabled/active) → runs the reinstall one-liner above verbatim from
  these sources, re-verifies, and wakes a worker to REPORT the heal
  (the heal never waits for an agent). If the install lands but
  verification fails, it wakes once per incident and keeps retrying
  silently on later polls.
- INCONCLUSIVE (files perfect but `systemctl` itself unreachable —
  early boot, bus not up yet) → does nothing, retries next poll.

### Proof — simulated wipe, 2026-10-18

Between cycles (service inactive), both installed unit files were
deleted + `daemon-reload` → timer LoadState `not-found`, the exact
post-replacement state.

- 20:22:19Z — wipe executed.
- 20:23:17Z — watchdog healed (its own log: diagnosis
  `files_missing=1`, install 2s). Externally observed wipe→timer-active:
  **59s** (bounded by the 60s poll). No timer tick was missed: the
  window fell between the 20:18 cycle and the 20:30 tick.
- Post-heal: installed files byte-identical to these sources (`cmp`),
  timer `enabled`, next elapse 20:30Z. Manual due-cycle ran clean;
  forced full cycle (launcher `--cadence=all`, the unit's own env) at
  20:25:43Z: starred ok + default ok, **107/107 boards, 0 errors**.
- Polls after the heal: silent/healthy — the no-op path verified on a
  healthy system, before and after the wipe test.

### Residual gaps (honest)

- The watchdog's own survival across a REAL replacement rests on the
  runtime's documented recovery of saved hooks + home persistence; all
  three observed wipes hit `/etc` only, but no replacement has occurred
  since the hook was installed, so that half is documented-platform
  behavior, not yet observed end-to-end. The `/etc`-loss half is proven
  above. If hook definitions were ever lost too, the fallback signal is
  Crew A noticing missing cycles — detection, not a heal.
- A replacement that lands MID-cycle kills that cycle; the watchdog
  restores the timer and the grid-anchored cadence runs the next due
  slot — the killed cycle itself is not replayed.
- Per the convention above, a heal recreates the units, so treat any
  clean-48h measurement as restarting from the heal; the watchdog's
  report-back wake says so each time.
