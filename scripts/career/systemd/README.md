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
