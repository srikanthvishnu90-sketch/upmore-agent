# Submit path ARMED — gate report (night plan 2026-10-22, chunk 100%)

Branch `muse/2026-10-22-submit-armed` (base `cb56921a`, the pin-landing-candidate-bridge
line). Scope held throughout: this VM's TEST worker host + repo; live Supabase READS ONLY.
Zero submits, zero live enqueues, zero flag flips, zero settings rows created.

## Verdict

ARMED in the harness, OFF in production, and the remaining distance is exactly four
owner taps plus one engineering precondition (a cloud claimer process — item 0 below).
The full submit chain was walked end to end in the disposable PG16 harness on the
branch's final schema (approval → card tap → bound enqueue → claim → lease-bound resume
read → stubbed submit → cloud finish → employer-email confirmation): **28/28 exercise
assertions green, full suite EXIT=0, 2,125 ok notices vs 2,097 on the pristine base
(delta +28 = the exercise, nothing else moved).** The board boundary was stubbed: no
board was driven, no click exists anywhere in the exercise.

## What concretely improved vs before

Before tonight the armed state was asserted from pieces: an O5 inventory, a gate-kit
run against a then-current commit, and per-RPC tests written by different lanes at
different times. Nobody had (a) re-run the gate-kit against tonight's live commit,
(b) walked the whole chain in one run — which is what surfaced that the candidate
line's claim refuses any row the card did not bind (`not_card_approved`), and that the
designed producer is the bridge's card tap, now proven working end to end — or
(c) re-verified the live OFF posture and the exact flag seam tonight. All three are
now done, with run evidence below.

## Inventory — every component a real submit traverses

| # | Component | State | Evidence |
|---|-----------|-------|----------|
| 1 | Chat intent → batch approval (the card tap) | LIVE-PROVEN | v248 live (cea914fe); approvals are `career_apply_batch_approvals` rows minted by the tap. In the exercise LEG 0/2 the tap mints exactly the approved entries. |
| 2 | Begin door A — `career_apply_extension_begin_agent_own` (live in the DB) | LIVE-PROVEN (door), PRESENT-NOT-EXERCISED (as a cloud feeder — it can never be one) | Exercise LEG 1 (5 assertions): approval consumed, one row born claimed (`driving`, attempts 1, source `extension`, lease issued). The cloud claim takes only `queued` rows, so this row is unreachable by the worker — by design (MUSE-F-030). |
| 3 | Begin door B — `career_apply_cloud_begin_agent_own` (migration 20261024140000) | ABSENT live; PRESENT on this branch | Live `pg_proc` has no such function (verified by read, 2026-10-22). The branch carries it; the harness applies it at the final schema. Its claim side is governed by the bridge's C9 (see #4). |
| 4 | Card binding — bridge 20261024130000 (`cloud_bound_jobs` / `cloud_bound_approvals`, refusal `not_card_approved`) | ABSENT live; PRESENT + EXERCISED on this branch | Live refusal body is the 20261024120000 version (no binding check). In the harness, a bare `career_apply_enqueue` row is refused `not_card_approved` and never claimed (exercise LEG 2 CONTROL, 2 assertions); a card-tapped row is bound durably (`cloud_bound_jobs` → a consumed batch approval whose `entry` IS the payload). |
| 5 | Claim — `career_apply_cloud_claim` / `cloud_claim_at` (service role) | LIVE-PROVEN as a function; the PATH is PRESENT-NOT-EXERCISED | The functions exist live with tonight's OFF posture verified. Exercise LEG 2: the service-role claim takes exactly the bound row, lease-bound, `payload_hash = approval_hash =` the tap's hash. Nothing has ever claimed a cloud row in production (career_apply_jobs = 0 rows live). |
| 6 | Worker drain on this VM (the process that would call the claim) | ABSENT | No unit, no caller: `systemctl` shows board (8471, running), executor (oneshot intent drain, timer-driven), egress relay — no cloud worker. Grep of the host tree (`upmore-v2-candidate` workers/packages) and of the deployed v248 stage finds zero callers of `career_apply_cloud_claim` / `cloud_finish` / `cloud_begin`; the v248 chat bundle contains no `career_apply_*` RPC caller at all (it commits batch intents; the VM executor drains those through 155/149 for prepares). The legacy edge store (`_shared/career_apply_store.ts`, unshipped) calls the pre-cloud `career_apply_claim`, which WO-039 leaves granted to no one. |
| 7 | Board drive (sharded board service, host-live) | LIVE-PROVEN (prepares); PRESENT-NOT-EXERCISED (submit click) | Sharded service live since chunk 70% (2.47 apps/min ladder, flag OFF); drives reach `atReview` on Greenhouse/Lever. The submit click itself has never fired: flag OFF and caps untouched all night. |
| 8 | Submit call + confirmation capture | PRESENT-NOT-EXERCISED | `career_apply_cloud_finish` records the outcome; a row reaches `confirmed` only through the employer-email path (WO-032: `career_apply_confirm_as` + the `career_apply_confirmed_by_email` guard). Exercise LEG 2 walks finish → `submitted_unconfirmed` → employer-email confirmation → `confirmed`, mail event on record, one `submitted` telemetry event. Live: 0 confirmed anything, ever. |
| 9 | Kill switches | LIVE-PROVEN (predicates) + EXERCISED at the armed posture (harness LEG 3) | Cloud switch off → claim takes nothing mid-queue; portal pause → bound queued job refused `portal_paused`; agent switch off → begin refused `agent submit is off`; revoked approval → begin refused `no live batch approval`. Caveat, from the code: `career_apply_cloud_finish` does NOT consult `career_apply_cloud_enabled` — flipping the flag stops NEW claims, but a drive already claimed can still finish. The mid-drive abort is operational: portal/person pause (claim-side), the person's Stop (revokes approvals pre-begin), or stopping the worker. |
| 10 | The flag seam | VERIFIED | Both switches read `career_cloud_settings` rows ONLY (`CAREER_AGENT_SUBMIT='on'`, `CAREER_CLOUD_APPLY='on'`). `sb.py secrets-list` (names only) contains NO `CAREER_AGENT_SUBMIT` and NO `CAREER_CLOUD_APPLY` secret — the flip is a settings-row write, nothing else. On the bridge line the cloud refusal additionally requires BOTH switches on (`cloud_switches_off` otherwise). |
| 11 | Family gate | CLOSED, verified live | Opens per portal only after ≥3 of a gate user's hand submissions (source `own_computer`/`extension`) are employer-email-confirmed with the mail still on record. Live tonight: `career_cloud_settings` = 0 rows (no `gate_user_ids` row exists), confirmed hand submissions = 0, `career_apply_cloud_open` = false for lever, greenhouse, ashby, smartrecruiters. |

F-034 interaction: arming adds NO second drain. The executor on this VM is a single
oneshot; the cloud claimer (item 0) must likewise be a single claimer, or F-034's fix
(a version token on the ledger RPC) lands first. Two concurrent drains racing the last
per-day cap slot can both submit — that defect stays OPEN and is a precondition for any
parallel arming, not for the single-claimer first submit.

## Gate-kit verdict (against the live commit + host state)

`tools/o5-gate-kit/gate-check.cjs`, run 2026-10-22 against live commit
`cea914fe8afb91a4b143a52f9a32bc401e5b46a4` (agent-chat v248), staged fresh via
`stage-graph.cjs` and diffed against the preserved v248 stage — verbatim:

```
================ O5 GATE VERDICT ================
target:  cea914fe8afb91a4b143a52f9a32bc401e5b46a4
stage:   /home/hatch/workspace/gate-kit-runs/cea914fe (12 files, 3467792 B)
[PASS] CORRECTION_STORE_ABSENT: occurrences router=0 host=0 (required total 0)
[PASS] CORRECTION_KEY_ABSENT: occurrences router=0 host=0 (required total 0)
[PASS] GOAL_RECORD_PRESENT: occurrences router=1 host=0 (required >= 1)
[PASS] GOAL_RECALL_PRESENT: occurrences router=1 host=0 (required >= 1)
[PASS] HOST_MERGE_APPEND_ONLY: pushKeyed(f,true) in function=0 (required 0); thread pass calls pushKeyed(f,false)=true; thread pass indexed replacement out[i]= present=false (required false)
stage diff vs /home/hatch/workspace/stage-cea914fe: identical=12 differing=0 only-in-candidate=0 only-in-reference=0
GATE: PASS
=================================================
```

## Dry exercise — hop by hop

Harness: `tests/db/run.sh` (disposable PG 16.14, embedded binaries + source-built
psql 16.14, the F-030 lane's arrangement), new section at the final schema:
`tests/db/career_apply_submit_armed_exercise.test.sql`. Synthetic identities only;
one transaction, rolled back. Full suite: **EXIT=0, "db tests passed", 2,125 ok**
(pristine base `cb56921a` the same night: EXIT=0, 2,097 ok — delta exactly the
exercise's 28).

- LEG 0 — live posture (7/7): no settings rows → both switches read off, all four
  family gates closed; a clean approval exists and the begin is still refused
  (`agent submit is off`); the claim takes nothing; nothing is recorded.
- LEG 1 — the live begin door (5/5): disposable flag on → begin consumes the approval,
  one born-claimed row (`driving`/`extension`/attempts 1, batch hash bound). Then the
  walk STOPS at the cloud-claim hop by design, with the cloud fully armed and the
  disposable family gate open: the claim takes nothing, because a begun row is not
  `queued`. The claim-shaped begin for a chat approval is migration 20261024140000 —
  tap (ii).
- LEG 2 — the card-bound cloud walk (9/9 + 2 controls): TEST-user eligibility
  seeded (the production shape is a `first-real-card-cloud` enrollment), card shown by
  the service role, tapped by the applicant → receipt `approved_count=1`, one queued
  row whose payload IS the approved payload, binding durable. Service-role claim
  takes exactly that row, lease-bound, both hashes the tap's. Worker reads the
  approved resume through the lease. **Stub at the board boundary** — the run's own
  notice, verbatim:
  `SUBMIT_ARMED_STUB would_submit job_id=ARMED-C1 payload_hash=3cff55d9047a2c3b82830cdaadf140534e951c02198958d8cdb26ead0efdf8b0 approval_hash=3cff55d9047a2c3b82830cdaadf140534e951c02198958d8cdb26ead0efdf8b0 (board boundary stubbed: no drive, no click)`
  → would-be submit payload hash equals the approved payload hash, exactly. Finish →
  `submitted_unconfirmed`; employer email → `confirmed`, mail on record, telemetry
  `submitted` ×1. Controls: a bare-enqueued row is refused `not_card_approved` and is
  never claimed.
  First attempt note (records kept): LEG 2 as first written entered through bare
  `career_apply_enqueue` and the claim refused it — that refusal IS the finding in
  inventory #4; the leg was rewritten to the designed producer (the card tap) and
  passed.
- LEG 3 — kill switches at the armed posture (5/5): cloud switch off stops new
  claims mid-queue; a portal pause refuses the bound queued job (`portal_paused`);
  agent switch off refuses a begin; a revoked approval refuses a begin with the switch
  back on; the walk ends with both switches off.

Suite hygiene note: `tests/db/export_coverage.test.sql` flaked in 2 of 5 full runs
tonight (identical trees, both branches) with
`column "user_id" of relation "profiles" does not exist` — `has_column_privilege`
raises on a missing column when the planner evaluates it before the `pg_attribute`
existence filter, so the file is planner-order sensitive. It runs in the generic loop,
in its own session, before the exercise section, and is untouched by this branch.
Ledgered as MUSE-F-038 (addendum) with the fix shape; not fixed here (the chain's own
test, outside this chunk's scope).

## The remaining taps, in order

0. **Stand up the single cloud claimer (engineering — apply-stack lane; no owner
   tap).** A runner on the worker host that calls `career_apply_cloud_claim` as
   service_role and drives claimed rows through the board service (149), one instance
   only (F-034). Without it, taps (i)–(iv) still submit nothing. Unlocks: a consumer
   for every claimable row.
1. **Family gate (owner).** Three of the owner's own hand submissions on the target
   family, each confirmed by the employer's email, AND his user id written into the
   `gate_user_ids` row of `career_cloud_settings`. Today: confirmed = 0, the row does
   not exist. Unlocks: `career_apply_cloud_open(<family>)` = true for that family
   only.
2. **C9 composition + the two migration applies (owner, explicit word naming each
   migration).** The composition is already decided in code on this line — (A): the
   chat card mints the binding through the bridge (20261024130000) and the claim
   enforces it; the F-030 cloud begin (20261024140000) enqueues claim-shaped rows that
   still need that binding. What is missing is only the owner's apply word for
   `20261024130000_career_apply_card_cloud_bridge` and then
   `20261024140000_career_apply_agent_cloud_begin` on the live project (neither is
   live; the held 20261024100000/20261024110000 are untouched by this chunk and stay
   as the owner left them). On sufficiency: the live extension door (door A) suffices
   for a first submit ONLY in the own-machine sense — its beginner drives the row
   itself; it never feeds this worker. For the cloud submit path, this tap stands.
   Unlocks: a chat approval can become a claimable, card-bound row in production.
3. **The flag flip (owner).** Insert/update two rows in `career_cloud_settings`:
   `CAREER_CLOUD_APPLY='on'` and `CAREER_AGENT_SUBMIT='on'` (the bridge-line refusal
   requires both). No secret changes — no such secret names exist (verified). This is
   a settings write on the live project and only the owner flips it. Unlocks: the
   claim may fire for bound, gate-open rows.
4. **The first batch approval (owner).** His tap on the rendered cloud card for a
   real batch. The tap mints the binding and enqueues the row(s) — the first
   claimable production row(s). Unlocks: the first real claim → drive → submit,
   employer confirmation to follow by email (WO-032 path).

## Final read-backs — the armed state leaves everything OFF (live, 2026-10-22)

- `career_cloud_settings`: **0 rows**
- `career_apply_agent_submit_enabled()` = **false** · `career_apply_cloud_enabled()` = **false**
- `career_apply_cloud_open`: lever **false** · greenhouse **false** · ashby **false** · smartrecruiters **false**
- `career_apply_jobs`: **0 total · 0 submitted/confirmed · 0 cloud rows**
- Secrets-list NAMES matching the flags: **none** (`CAREER_AGENT_SUBMIT` and
  `CAREER_CLOUD_APPLY` exist only as settings keys; the only `CAREER*` secret names
  present are `CAREER_WORKER_SECRET` / `CAREER_WORKER_URL`, unrelated to the flags)

Real completions: **0** (unchanged — this chunk arms and proves the path; it submits
nothing, by the owner's ruling).
