# H3 — the cloud claimer: design + what was built

Owner outcome (2026-10-22): the chat-to-confirmation E2E's H3 drain
leg. The submit-armed inventory (2026-10-22) named the gap exactly:
"worker drain for cloud jobs ABSENT — the one missing component:
nothing on this VM or in v248 calls cloud_claim/cloud_finish." The
claim and finish functions existed and were proven in PG; the loop
existed in-tree (`workers/career-cloud/worker.ts`, `cloudLoop`); what
did not exist was a queue the loop could run outside a live PostgREST
deployment, an entrypoint that runs it, and a unit that starts it.

## What runs, and where

- **Process:** `workers/career-cloud/drain.ts` (`import.meta.main`),
  run by systemd as the single service
  `scripts/career/systemd/trainee-cloud-drain.service` (repo source
  only — installing/enabling it is an owner step; this lane did not
  install or enable anything).
- **Host:** the career host (the D-010 VM of
  `docs/launch/CLOUD-WORKER.md`), as user `trainee`, working
  directory the repo checkout, `KillMode=mixed`,
  `TimeoutStopSec=660` — the same shape as the runbook's documented
  unit for the REST worker, with `ExecStart` on the drain.
- **Loop:** the product's own `cloudLoop` — unchanged. `runDrain` in
  drain.ts is only the seam that hands it a queue, an engine, and a
  stop predicate.
- **Engine:** `cloudEngineRunner` (scripts/apply.ts per job, its own
  process and browser context) — unchanged.
- **Queue:** `workers/career-cloud/pg-queue.ts` — `cloudLoop`'s
  `CloudQueue` interface over a direct Postgres connection
  (`npm:pg` pool), beside `worker.ts`'s `restQueue` (PostgREST +
  service-role JWT). Both call the same five doors with the same
  arguments — `career_apply_cloud_claim`, `career_apply_cloud_resume`,
  `career_apply_cloud_ask`, `career_apply_cloud_finish`,
  `career_apply_cloud_open`, and for authorization the shared
  `authorizeCurrentCloudJob` (its RPC seam is transport-agnostic by
  construction) — so no predicate is re-implemented anywhere. The
  database remains the only authority: card binding, switches, gate,
  pauses, caps, throttle.
- **Credential:** `DATABASE_URL` from the same 0600 env file the
  runbook already mandates (`/etc/trainee/cloud.env`); the drain
  refuses to start when the env file is group/world-readable,
  mirroring `worker.ts`'s preflight. A different credential from the
  service key, not a stronger one: it reaches the same functions.
  Which transport a deployment uses is a routing fact (does the
  worker host have a direct database route?), not a permission
  difference.

## The single-instance rule (F-034)

Exactly ONE claimer per database. Three layers, in order:

1. **Unit discipline:** one service, no templated instances, and
   never the REST worker and the PG drain against the same database
   at the same time. The unit file says so in its header.
2. **Startup lock:** before its first claim, the drain takes a
   session advisory lock (`pg_try_advisory_lock`, keys
   `DRAIN_LOCK_KEYS` in pg-queue.ts) on a dedicated pooled
   connection and holds it for the process's lifetime. A second
   drain finds it held, prints `DRAIN_ALREADY_RUNNING`, and exits
   non-zero (systemd `Restart=on-failure` keeps it visibly failing,
   never silently double-running).
3. **The claim itself:** `career_apply_cloud_claim_at` takes row
   locks and re-checks every refusal predicate per row, so even a
   hypothetical second claimer could not double-claim — the lock
   exists to forbid the configuration, not to paper over a race.

## Kill switches, stated from the sources

- The claim consults the switches on every call:
  `career_apply_cloud_claim_at` returns nothing unless
  `career_apply_cloud_enabled()` (CAREER_CLOUD_APPLY) and
  `career_apply_agent_submit_enabled()` (CAREER_AGENT_SUBMIT) are
  both on, and `career_apply_cloud_refusal` re-checks them per row.
  Flags off ⇒ the drain claims nothing and idles. Nothing in this
  lane touched any flag, anywhere.
- `career_apply_cloud_finish` does NOT consult `cloud_enabled` (read
  in `20261021080000_career_apply_cloud.sql`: the finish checks the
  lease, the evidence shape, and outcome/state agreement — no
  enabled() call). So a job already claimed when the flags flip
  still finishes and is recorded. Mid-drive abort is therefore
  OPERATIONAL, never a flag flip: SIGTERM/SIGINT makes the drain
  stop claiming while in-flight jobs finish and record (a stop with
  drives still running past systemd's window records them
  `interrupted`, which the throttle never counts as a failure);
  portal/person pauses are the database's own per-scope stop.

## F-034's ledger race — DESIGN ONLY, not built

S3 measured the race in the browser executor's ledger (40/40
synchronized drain pairs over-admitted 16 against a cap of 15, the
record then silently erased by whole-ledger replace). The fix shape
is S3's, recorded here as the design this claimer work does NOT
implement:

- a version column on the executor ledger store;
- saves carry the expected version and raise
  `LEDGER_VERSION_CONFLICT` on a stale write;
- the executor re-reads and merges on conflict instead of replacing;
- an over-cap outcome becomes a named incident, never a silent
  compliant-looking ledger.

It needs a migration and the owner's word for that migration. It is
not in this branch: no migration was written, none applied. The
drain in this branch does not touch the executor ledger at all; the
single-instance rule above is the claimer's half of the discipline
(exactly one drain), and it does not close F-034.

## Proof (measured, this branch, this VM, 2026-10-22)

The E2E skeleton (`tests/e2e/chat-to-confirmation.test.cjs`, stage 5
+ 5b), disposable PG16 (94 migrations, the repo's own order):

- stage 5 seeds a card-bound row for the fixture user (fixture tag
  `atomic-last`) and leaves it `queued/null/0`;
- the test spawns the actual drain code — `runDrain` → `cloudLoop`
  over `pgQueue` connected to that cluster — with the drain's own
  advisory lock taken (an uncontended acquire in the driver);
- the drain claims the row (exactly once), runs the authorization
  path for real (`authorizeCurrentCloudJob` over PG: sources
  snapshot reproduced, `career_apply_message_cloud_authorize`
  authorized before engine and before effect), fetches the resume
  through `career_apply_cloud_resume`, and finishes through
  `career_apply_cloud_finish`;
- read back: the row stands `submitted_unconfirmed/cloud`, the
  recorded evidence carries the employer's confirmation id, and
  `career_apply_cloud_events` holds the `submitted` telemetry row.

Tier honesty: the ENGINE in that run is a stub (tier 2) — it honors
the effect protocol and reports a confirmation; it does not drive a
browser. The real engine leg is H4/H5 of the same skeleton (the
engine + `cloudLoop` composition), which is a different lane's
handoff and ENVIRONMENT-classified in this VM (Chromium sandbox).
What H3 proves is the drain wiring: queue → claim → authorize →
resume → finish → telemetry, through the product's own code, against
the product's own schema.

The entrypoint's own gates were smoked against the same cluster
(`drain.ts` as `import.meta.main`, measured): no `DATABASE_URL` →
usage line, exit 2; with it → preflight passes, "Cloud drain up",
idle, SIGTERM → the stop line and a clean exit; a second instance
started while the first holds the lock →
`DRAIN_ALREADY_RUNNING: another cloud drain holds this database's
lock`, exit 2. One parity bug was found and fixed by that smoke:
`gatePresent` first demanded the gate be OPEN (`=== true`); the REST
queue's test is that the function ANSWERS a boolean at all — a closed
gate is a claim-time fact, not a startup one.

Full-skeleton result on this branch (run 2026-10-22, 23.1 s wall):
H1 FAIL (F-037/F-002 — the H1 lane's handoff, unchanged) · H2 PASS ·
H3a PASS (stage 2 control + stage 2b composed route) · H3b PASS ·
H3 PASS (this doc) · H4/H5 ENVIRONMENT (browser tier, unchanged) ·
H6 PASS.
