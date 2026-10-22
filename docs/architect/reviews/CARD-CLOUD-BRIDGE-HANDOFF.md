# Card tap → cloud job: review handoff

Production code pin: **`cf3ea60f5f57c36910b267f0f4ba7fce2e4fa62c`**, based on
`01401cb456bc2982d67316165e183bbd275581c9`. The bridge worker/engine/SQL/render bytes
remain exactly those tested at `dff3dfc1bc5c34ff177df65cddfff212abebd676`; the only
production-file change since that pin is the migration launcher integration described below.
Branch: `wo/card-cloud-bridge-20261021`. Later handoff/evidence commits do not change production code.

The bridge is BUILT. Local checks and the owner-authorized disposable PG16 suite are
VERIFIED. It is **not release-approved or live**. No live migration was applied, no real
account was enrolled, and no production switches or opt-ins changed. Temporary synthetic
flags/grants existed only inside the disposable instances, all destroyed afterward.
No employer was contacted. C10's rule is owner-approved; actual enrollment remains
separately authorized and empty. Cloud-only effective opt-in/queue/claim/effect cap is
**15/day**, including an existing opt-in row whose stored value is 25. Global/extension
limits and the waiver table are unchanged. The waiver row still waits on the owner's
email choice. No submit-flag authorization is inferred from conditional cloud approval.

## Concrete behavior and review surfaces

- `workers/career-cloud/prepare.ts`: Claude's `engine_input.ts` supplies the person's
  confirmed sources to the existing dry-run producer. Missing answers create owned
  questions and prevent a card. The displayed answers, destination and full resume
  fingerprint come from that exact prepared payload. Sources are reread after dry runs.
- `20261024130000_career_apply_card_cloud_bridge.sql`: the tap takes only card ID and
  card hash; one transaction binds every card item, permission, deadline and queued
  payload. Replay returns the recorded receipt. Old texted approvals and direct-enqueue
  jobs cannot be cloud-claimed. The durable origin survives deletion of display rows.
- `workers/career-cloud/current_sources.ts` and `worker.ts`: frozen Hq/identity and
  current source support are checked before engine start and again through a bounded
  parent/child channel immediately before the engine's validated POST. The SQL source
  digest closes the read/check gap under the account lock. Receipt retry never reruns
  the engine. Stop revokes consumed cloud permissions and cancels queued cloud work;
  driving jobs retain terminal-outcome recording while effect authorization refuses.
- `src/career-approval-card.js` and its template: version-2 cloud rendering preserves
  exact answers and full fingerprints, with server-derived eligibility. Existing v1
  controls remain covered. `employer_fields` is the producer's string array of names.

The design answers review 1 by item number in `CARD-CLOUD-BRIDGE-DESIGN.md`. The owner
authorized code before the conditional design review was cleared; a second-judge PASS
and green release CI remain required. The isolated browser workflow is evidence only,
not a substitute for that release gate, and its CI configuration must never be merged.

## Measured evidence

| Check | Result | Evidence/limits |
|---|---|---|
| Integrated local Node suites, exact dff3 code | VERIFIED **94/94**, zero skips | `tests/fixtures/card-cloud-worker-gate-20261021/final-integrated/`; includes unchanged v1 21/21 |
| Independent QA, exact dff3 code | VERIFIED **73/73**, zero skips | sibling `final-independent/`; excludes the v1 suite |
| Worker authority/identity regressions | VERIFIED baseline **5/9 → 9/9** | four behavioral failures; already-passing protections are controls |
| Actual child-process authorization | VERIFIED **11/12 → 12/12** | process channel proof; does not alone prove a browser POST |
| Owner/digest source envelope | VERIFIED **26/28 → 28/28** | baseline is intermediate f08d source; not a claimed cross-user data leak |
| Source changed during card preparation | VERIFIED **1/3 → 3/3** | intermediate producer baseline; withdrawal and edit must block display |
| Actual producer → renderer ABI | VERIFIED **7/10 → 10/10** | unchanged regression fixture, including nonempty employer fields |
| SQL outer/function syntax + original-body preservation | VERIFIED offline | 68 up/44 down statements; all **10/10** rollback definitions match their exact baseline; original extension guard suffix preserved |
| Migration launcher standalone/ledger dispatch | VERIFIED **2/6 → 6/6** | recording psql executable only; before/after legacy groups preserved, migration/ledger failures stop subsequent work; no SQL executed |
| Captured sandboxed browser baseline/candidate | VERIFIED **4/7 → 7/7**, zero skips | [run 39701982952](https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39701982952); frozen test 68e70bbc, baseline 01401cb4 versus candidate dff3 |
| Disposable PG16 main/lifecycle/cloud cap | VERIFIED **30/30 + 29/29 + 14/14** | source `f33e76c6`; no production code change from the frozen migration |
| Disposable PG16 replay/rollback + four actual DB races + full historical DB integration | VERIFIED **9/9 jobs overall** | [run 39707070816](https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39707070816); rollback **685** checks across 24 processes, up/up/down/down/up; four races; full runner **2069** labeled checks, including main/lifecycle/cap; **9/9 instances destroyed**, zero cleanup errors |
| Whole-product code gate | VERIFIED **RED** | [run 39704983173](https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39704983173): architect 1227 pass/12 fail; Node 2462 pass/9 fail/24 skips; Edge 151/151 pass. No architect tests edited or checks suppressed |
| Second-judge release PASS and live send | **NOT_GRANTED / NOT_RUN** | disposable SQL success does not satisfy the remaining release gate |

The SQL source audit is reproducible without a database using pinned `pglast==7.21`:
`tests/fixtures/card-cloud-db/static_audit.py`. Its JSON records the complete per-function
diff against the latest defining baseline, including the waiver-era refusal/claim
bodies from `20261024120000`. Migration: **764 lines / 64,768 bytes**; rollback:
**370 lines / 29,476 bytes**. This exceeds the original line budget under the owner's
explicit readability exception. Syntax/source equality is not runtime behavior proof.

The owner explicitly authorized the disposable PG16 scope. First run
[39706333198](https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39706333198)
was **1/9 PASS**, retained under `tests/fixtures/card-cloud-db-20261021/pg16-first-run-39706333198/`.
Four test-only faults caused the eight red jobs: unparenthesized fixture CASE, a reserved
PL/pgSQL variable, synthetic history incorrectly claiming email-confirmed status, and
an overly narrow Stop refusal matcher after actual revocation had already passed.
The exact corrections are pinned in `f33e76c6a3cc5f8601b5e96f204594f51113a71f`;
all production code and both migration hashes stayed unchanged. The corrected run
passed all nine jobs. Each run used nine independent fresh local PG16 instances;
all **18/18 destruction receipts** verify server/data/socket removal with no cleanup
errors. No hosted database, real C10 enrollment, provider or employer was in scope.
The isolated runtime and read-only artifact-export CI configurations must never be merged.
The original unlaunched workflow fixture is historical proposal evidence only.

The browser baseline's rehashed company mutation ran the engine and produced one synthetic local POST. The
rehashed page-URL mutation started the engine but its existing engine guard refused the POST; the regression is
earlier dispatch prevention, not a claimed baseline send. The new pre-effect authorization test verifies the real
parent/child channel reaches the browser boundary and a denied lease produces zero local POSTs. Four preexisting
browser protections remain controls. This isolated CI used no database or employer destination.

The updated DB runner preserves all historical tests against their existing migration phases. Its temporary
pending-migration view defers only the bridge; it applies the bridge twice, standalone, after those phases and runs
the new main/lifecycle/cloud-cap tests last. This prevents an old rollback test from dropping a bridge dependency or
silently replacing the new claim guard. This complete runner integration executed successfully in the
owner-authorized disposable PG16 run; it is not evidence of a production migration.
The launcher runs exactly the bridge file outside legacy transaction groups and records its ledger only after
successful commit. A ledger-write failure stops without retrying or proceeding; the file may already be committed,
so the operator must inspect that state before an explicit idempotent replay. The ordered run is not globally atomic
across the standalone boundary. Runs with no bridge retain the original one-transaction behavior.

## Exact landing order, only after the remaining gates and owner authorization

1. Review this branch against 01401cb4, including the frozen source pin and the SQL
   function diffs. Reconcile with the architect's landing head; do not assume that a
   matching branch name proves the deployed prerequisite signatures.
2. Review the retained first-run failures, test-only corrections and final disposable
   runtime evidence. Verify the final landing migration/worker hashes still equal the
   tested code; repeat only if implementation changes warrant it. The disposable
   authorization is complete and does not authorize a live database, enrollment,
   merge, deployment or flag change. The standalone launcher and final-schema DB
   integration are now runtime-tested. Do not merge the isolated QA workflow refs.

3. Require both judges' PASS and green CI on the final landing commit. Merge/deployment
   and live migration execution still require the owner's explicit word. On authorized
   live application, first verify both switches OFF and no active cloud drive. Stop/drain
   the existing worker under `docs/launch/CLOUD-WORKER.md`; do not reset an uncertain
   outcome to queued. Verify modern approval/contract/question/waiver prerequisites,
   then apply **`20261021220430_career_apply_message_cards.sql`**, then
   **`20261024130000_career_apply_card_cloud_bridge.sql`**. The new up/down files own
   BEGIN/COMMIT: use standalone `psql -X -v ON_ERROR_STOP=1 -f FILE`; never `-1`, an
   enclosing fixture transaction, or a casual include in another migration run.
   Install the reviewed worker, its `current_sources.ts`/`engine_input.ts` dependencies,
   `scripts/apply.ts` and the approval-card assets from the same landing commit before
   restarting `trainee-cloud.service` with both switches still OFF. An old running
   worker is not evidence of the new pre-effect check. Publish the running source pin
   and fresh checks before any separately authorized flag or account change.
4. Verify default-empty eligibility, both switches OFF, cap 15 and no approvals/jobs
   minted by installation. Actual C10 enrollment needs a separately authorized UUID,
   deadline of at most 24 hours, purpose and operator approval reference. No row is
   supplied by this branch. Do not enroll the ordinary account in the TEST allowlist.
5. Conditional cloud-switch approval applies only to the owner's account after landing;
   do not infer submit-flag, waiver-row or send permission. A first send must wait for
   the owner's tap on the exact displayed payload and every execution gate.

Rollback is also an explicitly authorized operational action, with both switches OFF
and no active cloud drive. Its exclusive maintenance lock serializes against shared
claim/tap/authorization locks; it retains evidence and never renews a job. It restores
historical live claim semantics exactly, including the old unbound route, so switches
must stay OFF after rollback unless the owner makes a new decision.

Known conservative limitation: Claude's canonical input builder can exclude a raw chat
fact named like a quarantined bank ID without a distinct bank lineage. It is asked or
refused, never promoted to a confirmed answer by this bridge. This handoff does not
claim that upstream input-coverage issue is fixed.

Ledger: **$0 new spend**. **$8.503100 known + $0.070743 held = $8.573843**;
the earlier paid-comparison final total remains **UNRECONCILED**. No paid run is resumed.
