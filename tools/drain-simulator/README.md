# Drain simulator + staged units — Throughput Fix Package A

- `simulate-drain.cjs` — seeded discrete-event simulator for the
  batch executor's drain: serial (today) vs N parallel workers,
  under an ideal model and a 2-core processor-sharing model.
  Run: `node simulate-drain.cjs` (options: `--trials N`,
  `--seed N`, `--json`). Zero dependencies.
- `staged-units/` — systemd unit diffs that pair executor instances
  with board-service instances for a parallel drain. **Staged
  only — do not install** until the activation gates in
  `docs/career/worker-drain-parallelism.md` §5 are met (throughput
  baseline landed, ledger fencing S-2 landed, sharding S-1 landed).

Design note, as-deployed drain pin (file:line evidence), simulator
results, and the worker-code change spec:
`docs/career/worker-drain-parallelism.md`.
