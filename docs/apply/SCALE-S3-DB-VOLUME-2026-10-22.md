# SCALE S3 — DB / apply-chain at volume (2026-10-22)

Lane: DB / apply-chain volume and concurrency, disposable PG16 harness only.
Owner direction 2026-10-22 09:56 CDT: Muse implements and tests at mass
scale and reports the FUNDAMENTAL (design-level) failures; Codex takes the
bugs. Hard limits honored throughout: the live project was never touched (no
writes of any kind); no deploys, applies, merges, external sends, or spend;
the submit flag was never touched in any live system — every settings row
below is a disposable fixture inside the harness. Real completions: 0.
Nothing left the harness; the board boundary stayed stubbed at the
submit-armed exercise's seam (the claimed row's payload hash is the hash bound
at approval time; no board is contacted).

## Tree, harness, host

- Tree: branch `muse/2026-10-22-scale-s3-db`, based on
  `muse/2026-10-22-submit-armed` @ `e34b16c026552f471494433a89dcc724a0193931`
  (the arch-line final schema, incl. migrations 20261024130000 card-cloud
  bridge and 20261024140000 cloud begin).
- Harness: `tests/db/scale_s3_provision.sh` — `tests/db/run.sh` verbatim
  except port (54332) and a keep-alive cleanup — provisioned a throwaway
  PostgreSQL 16.14 (zonky server binaries + a locally built psql 16.14) and
  ran the repo's full DB suite green on this branch: **2,154 ok notices,
  "db tests passed"**. The batteries then drove that same database.
- Host: this VM, 8 GB / 2 vCPU, shared with other lanes; load average ranged
  7 → 31 during the runs. Absolute timings are therefore load-contaminated
  and are reported as ranges with the mechanism shown; counts and state
  reconciliations are exact.
- Seeding equivalence: battery A seeds card-bound rows in exactly the end
  state the card tap produces (consumed batch approval with entry = payload,
  a `cloud_bound_approvals` row, and a queued job the queue trigger binds into
  `cloud_bound_jobs`). Equivalence is functional, not assumed: every seeded
  row had to pass the claim's own `cloud_bound_refusal` (it returned NULL for
  sampled rows of every run), and the real tap path itself is proven end to
  end at n=1 by `career_apply_submit_armed_exercise.test.sql` in the same
  provisioned database.

## Battery A — claim-path volume (drain: claim → finish → employer confirm)

Driver: `tests/db/scale_s3_battery_a.py` (+ `scale_s3_seed.sql`), one psql
process per claim batch of ≤6 (the claim's own per-call cap), each batch
running the real RPCs `career_apply_cloud_claim` →
`career_apply_cloud_finish(..., 'submitted_unconfirmed', 'submitted')` → the
exercise's confirmation stand-in (`s3.confirm`: mail event + state
'confirmed'). Workers race the same global queue, as production claimers do.

| Run | Seeded (users × jobs) | Workers | Result |
|---|---|---|---|
| A100 (first attempt) | 100 (10 × 10) | 1 | 6 claimed + confirmed, then the portal auto-paused (finding A-1); remaining 94 refused `portal_paused`. All 100 later drained and confirmed (see A100R). |
| A100R | 100 (10 × 10) | 1 | 100 confirmed; 100 submitted events; 100 mail confirmations; 0 duplicates. (This worker also drained A100's 94 leftovers: 194 claims total.) |
| A1000 | 1,000 (100 × 10) | 4 | 1,000 / 1,000 / 1,000 reconciled; drain 42.6 s ≈ 23.5 rows/s end to end; 0 duplicates, 0 worker errors. |
| A1000B | 1,000 (100 × 10) | 8 | 1,000 / 1,000 / 1,000 reconciled; drain 26.0 s ≈ 38.5 rows/s; 0 duplicates, 0 worker errors. |
| A10000 | 10,000 (1,000 × 10) | 8 | Stopped by the lane's stop rule after ~35 min: **3,213 confirmed + 6,787 queued = 10,000**; submitted events 3,213 = mail confirmations 3,213; **0 duplicate claims across 8 racing workers**; no row in any error or intermediate state. |

Scaling note: 4 → 8 workers at 1,000 rows improved throughput 1.64×
(sub-linear). At 10,000 rows the drain rate collapsed to ~1.5 rows/s average
under peak host load; the structural cause is finding A-2.

Lease/sweep leg (`tests/db/scale_s3_sweep.sql`), 3/3 assertions passed,
verbatim notices:

- `SWEEP-OK: 6 rows claimed once, second claim takes nothing`
- `SWEEP-OK: wrong-lease finish refused, row still driving`
- `SWEEP-OK: 6 stale leases swept to unknown_outcome with telemetry, none re-driven`

(Stale = `claimed_at` aged 16 minutes; see finding A-3 for why the harness
ages the rows instead of the clock.)

Contention: the dedicated claim-only leg was folded into the volume runs —
8 workers racing one queue over 1,000 + 3,213 claims produced **zero
double-claims, zero deadlocks, zero worker errors** (the claim's per-user
advisory locks in user-id order + `for update skip locked` do their job).

### Finding A-1 (DESIGN-LEVEL): the portal throttle is a hair trigger, and its window is shared across all users

`career_apply_cloud_throttle` runs after **every** recorded outcome. Its
window is the portal's last 50 attempts (outcome ≠ 'confirmed') **since that
portal's last pause**, pooled over **all users** of the portal. It pauses the
portal for 6 hours when `fails * 100 >= 2 * tries` (a "2% failure rate") or
≥2 bot checks in the last 20. With a window capped at 50, the 2% rule
degenerates: **any single failed attempt in the window satisfies it**
(1 × 100 ≥ 2 × 50). Measured live in this battery: the sweep leg's six
`unknown_outcome` 'error' events sat in lever's window; A100's first six
**successful** finishes triggered the throttle evaluation, which inserted
`portal | lever | failure_rate: 6 of the last 50 attempts failed | +6 hours`
and refused the remaining 94 queued rows `portal_paused`. Consequences at
scale: one user's bot checks/errors — or a burst of swept leases from a
worker outage, each of which records an 'error' event — halt the entire
portal for every user for 6 hours, and the halt is armed by the next
innocent successful submission after the failures. The threshold math, not
any single failure, is the defect: a rate threshold needs a minimum window
size before it may fire.

### Finding A-2 (DESIGN-LEVEL): the claim's per-call cost grows linearly with backlog depth

`career_apply_cloud_claim_at` recomputes its candidate window on **every**
call: a `row_number()` over **all** queued, bound, opted-in rows (with
`career_apply_portal(url)` evaluated per row), ordered and cut to
`limit × 4`; it then re-evaluates the full refusal chain (bound refusal with
its three row lookups and canonical-hash recompute, eligibility, gate,
per-user daily count, company cooldown) per candidate, per call. Nothing is
cached or indexed for the window. Measured (same host, load-contaminated,
ranges across the run): candidate-window query 1.42 s at 8,912 queued /
3.35 s at 6,787 queued; one full refusal 0.17–1.06 s; one `claim(6)` call
14.9 s at ~8.9k queued with workers active, 2.6 s single-threaded at 6,787
queued, vs ~0.16 s effective per batch at 1,000 queued. The claim therefore
gets slower exactly as the backlog grows — at a 100k-row backlog a single
6-row claim call would cost minutes of CPU before finishing anything. The
fix shape is a maintained candidate index/queue table (or a window bounded
by `created_at` cursor + precomputed portal family on the row), not a
tuning change.

### Finding A-3 (design note, minor): `claim_at`'s `p_now` is decorative

The bridge's `career_apply_cloud_claim_at` computes its stale-lease set from
the caller's `p_now`, then — after taking the per-user locks — re-stamps
`p_now := clock_timestamp()` and re-checks the sweep (and all refusals)
against real time. A caller therefore cannot time-shift the function (the
harness's first sweep attempt via a future `p_now` swept 0 rows; aging the
fixture rows worked). For production's only granted path
(`career_apply_cloud_claim` passes `clock_timestamp()`) this is harmless
and plausibly deliberate (no forged time), but the parameter's contract is
dishonest and will mislead any future scheduler/test that trusts it.

### Observation A-4 (harness hygiene, not product): the repo suite leaves a committed 6-hour portal pause

`career_apply_cloud.test.sql` extends a lever portal pause to ~6 hours and
it commits into the harness database; a later consumer of the "throwaway"
DB inherits a paused portal (this is what zeroed A100's very first seeding
probe before fixtures were armed). The battery seed now clears pauses when
arming. Live is unaffected (tests never run there).

## Battery B — F-034 cap race at volume (batch ledger store)

Method (`tests/db/scale_s3_battery_b.py`): the production store is the two
RPCs `career_batch_ledger_v1` (read) and `career_batch_save_ledger_v1`
(whole-array replace). Each "drain" replicates the batch executor's store
sequence faithfully (`workers/career-browser/batch-executor.cjs`
buildDeps): `ledgerFor` snapshot → caps counted from **that snapshot**
(module 155 counts from `deps.log`) → the submission executes (board leg
stubbed at the same seam the parallel-drives guard stubbed) and is appended
to the in-memory copy → `saveLedger` with the whole array. Ledger seeded
with 14 submitted records (one per-day slot left of cap 15). Racing pairs
were forced to overlap with a barrier: both drains snapshot **before**
either saves. 40 racing pairs ran concurrently (8 pair-slots), plus 10
sequential controls.

Result — **F-034 confirmed at volume, exactly as predicted**:

- **40 / 40 racing pairs over-admitted**: both drains executed a submission
  against the last slot (16 real submissions against a cap of 15). Every
  pair's final ledger reads a compliant **15**, with exactly **one** of the
  two drains' records present — the other's record was silently erased by
  the whole-ledger replace. `save_errors: []` — neither save ever raised;
  the loss is silent, and every later cap count is computed from the blind
  ledger.
- **10 / 10 controls correct**: sequential drains — the second counts 15
  from a fresh snapshot and is refused (`CAP_REACHED counted from the
  drain's snapshot`); ledger stays 15.

The versioned-store variant: **not present in any tree's store.** It exists
only as a JavaScript test double inside the parallel-drives guard
(`tests/career-parallel-drives.test.cjs`, `LEDGER_VERSION_CONFLICT`). Both
this branch and that branch ship the identical unconditional
`career_batch_save_ledger_v1(p_user, p_records)` — an upsert with no version
column on `career_batch_ledgers_v1`, no expected-version parameter, and
(notably, unlike `career_batch_save_run_v1`) not even the per-user advisory
lock. Per the lane's instructions the fix is specified, not built:

1. Add `version bigint not null default 0` to `career_batch_ledgers_v1`.
2. `career_batch_ledger_v1` returns `{records, version}`.
3. `career_batch_save_ledger_v1(p_user, p_records, p_expected_version)`:
   one `UPDATE … WHERE user_id = p_user AND version = p_expected_version`,
   incrementing the version; zero rows updated → raise a named
   `LEDGER_VERSION_CONFLICT`. (The repo already uses this pattern:
   `agent_recovery_case_transition` with `p_expected_version`.)
4. The executor passes its snapshot's version at save. On conflict it must
   **not** silently drop the drain: re-read, merge only the records that
   drain itself appended, re-check the cap against the merged view, and
   record any already-executed over-cap submission as a named over-cap
   incident — the step that turns today's silent blindness into a visible,
   countable event. Steps 1–3 alone stop the overwrite; step 4 is what
   keeps an executed-but-unrecorded submission from becoming the same
   blind spot in mirror image.

Classification: **design-level** (the store discipline itself — snapshot →
execute → whole-replace with no concurrency token — not a coding slip).

## Battery C — begin-door load (extension door + cloud door)

Driver: `tests/db/scale_s3_battery_c.py` (+ `scale_s3_battery_c_seed.sql`).
Approvals were minted through the real producer
(`career_apply_batch_approve_own`, the submit-armed exercise's LEG 0 idiom),
one per case. Every begin ran as a real authenticated session; all callers
in a case were released on one barrier so the approval-row lock decided the
race. 60 begin calls total.

| Case | Calls | Admitted | Refusals (verbatim) | DB rows |
|---|---|---|---|---|
| ext-race (same approval, extension door) | 12 | **1** | 11 × `no live batch approval for this posting` | 1 (`driving`, source `extension`, attempts 1) |
| cloud-race (same approval, cloud door) | 12 | **1** | 11 × `no live batch approval for this posting` | 1 (`queued`, source null, attempts 0 — claim-shaped) |
| mixed (6 ext + 6 cloud, one approval) | 12 | **1** | 11 × `no live batch approval for this posting` | 1 |
| foreign (another user's approval) | 8 | 0 | 8 × `no live batch approval for this posting` | 0 |
| revoked approval | 8 | 0 | 8 × `no live batch approval for this posting` | 0 |
| agent switch off | 8 | 0 | 8 × `agent submit is off` | 0 |

**Zero false admits.** Admits reconcile exactly with job rows created in
every case. The cloud-race winner's row was then probed with the claim's own
refusal: `not_card_approved`, and the row remains `queued` — on the final
schema a chat begin is claim-shaped but is not, and cannot become, cloud
authorization without a card tap (the bridge's C9), exactly as designed.

Verdict: **PASS** — no design-level failure in the begin doors. The contract
helper's locked, single-use approval lookup serializes concurrent begins
correctly across both doors, and refusal classes stay exact under load.

## Ranked fundamental (design-level) issues

1. **F-034 — the submissions ledger store has no concurrency discipline.**
   Snapshot → execute → whole-ledger replace over-admits the per-day cap
   and then erases the evidence (40/40 pairs at volume; silent). Every
   cap the product promises is computed from this ledger. Fix shape in
   battery B. (Design-level; guard-proven before, now volume-proven
   against the real RPCs.)
2. **The portal throttle's threshold/window math.** A "2%" rule over a
   ≤50-attempt, all-users, since-last-pause window fires on any single
   failure and halts a whole portal for 6 hours, triggered by the next
   success. At 2M-user scale this couples every user's reliability to
   every other user's worst hour. Needs a minimum window and per-cause
   separation (swept-lease 'error' events are not board failures).
   (Design-level; measured in battery A.)
3. **The cloud claim's per-call cost is O(backlog).** The candidate window
   and per-candidate refusals are recomputed from the whole queue on every
   6-row call, so claim throughput collapses as the backlog grows — the
   failure mode appears exactly at the scale the lane exists to prove.
   (Design-level; measured in battery A.)
4. **`claim_at`'s time parameter is re-stamped away.** Minor, but a
   contract wart that will mislead schedulers and tests. (Design note.)

Plus one harness-hygiene item (A-4): the DB suite leaves committed state
(a 6-hour portal pause) in its "throwaway" database.

## Reproduce

```
# provision the final schema + full suite (prints S3-PROVISIONED sock dir)
PGBIN=<pg16 bin dir> PATH=<pg16 bin dir>:$PATH bash tests/db/scale_s3_provision.sh
psql -h <sock> -p 54332 -U postgres -f tests/db/scale_s3_seed.sql
python3 tests/db/scale_s3_battery_a.py --sock <sock> --port 54332 --psql <psql> \
  --mode drain --users 100 --jobs 10 --workers 8 --tag A1000 --prefix 'b2000000-0000-4000-8000-' --out out/a1000
psql -h <sock> -p 54332 -U postgres -f tests/db/scale_s3_sweep.sql
python3 tests/db/scale_s3_battery_b.py --sock <sock> --port 54332 --psql <psql> \
  --pairs 40 --controls 10 --prefix 'c5000000-0000-4000-8000-' --out out/b
python3 tests/db/scale_s3_battery_c.py --sock <sock> --port 54332 --psql <psql> --out out/c
```

All battery code: `tests/db/scale_s3_provision.sh`, `scale_s3_seed.sql`,
`scale_s3_sweep.sql`, `scale_s3_battery_a.py`, `scale_s3_battery_b.py`,
`scale_s3_battery_c_seed.sql`, `scale_s3_battery_c.py`. Per-worker claim
lists and the battery B/C JSON detail were captured during the runs and are
summarized above; every count in this doc was reconciled against the
database itself, not the drivers' tallies alone.
