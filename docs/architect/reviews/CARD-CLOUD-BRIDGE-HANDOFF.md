# Card tap → cloud job: review handoff

Production code pin: **`dff3dfc1bc5c34ff177df65cddfff212abebd676`**, based on
`01401cb456bc2982d67316165e183bbd275581c9`. Later commits containing this handoff and
test artifacts do not change production code. Branch: `wo/card-cloud-bridge-20261021`.

The bridge is BUILT, with local checks VERIFIED. It is **not release-approved or live**.
No migration was applied, no account was enrolled, no switches or opt-ins were changed,
and no employer was contacted. C10's rule is owner-approved; actual enrollment remains
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
| Captured sandboxed browser baseline/candidate | RUNNING at handoff | run `39701982952`; frozen test 68e70bbc, baseline 01401cb4 versus candidate dff3 |
| SQL runtime, grants/RLS, up twice/down twice/up, actual DB races | **NOT_RUN** | written pending tests; explicit no-apply instruction remains in force |
| Full product CI, second-judge release PASS, live send | **NOT_RUN / NOT_GRANTED** | no such claim is made by the local or isolated-browser results |

The SQL source audit is reproducible without a database using pinned `pglast==7.21`:
`tests/fixtures/card-cloud-db/static_audit.py`. Its JSON records the complete per-function
diff against the latest defining baseline, including the waiver-era refusal/claim
bodies from `20261024120000`. Migration: **764 lines / 64,768 bytes**; rollback:
**370 lines / 29,476 bytes**. This exceeds the original line budget under the owner's
explicit readability exception. Syntax/source equality is not runtime behavior proof.

## Exact landing order, only after the remaining gates and owner authorization

1. Review this branch against 01401cb4, including the frozen source pin and the SQL
   function diffs. Reconcile with the architect's landing head; do not assume that a
   matching branch name proves the deployed prerequisite signatures.
2. Obtain separate authorization for a named disposable-local database test scope.
   Run pending positive/negative, repeat-up, rollback and real multi-client race tests
   there; retain raw outputs and verify no hosted connection. Nothing here authorizes
   executing those files. Keep pending SQL out of incidental push/PR test discovery.
3. Require both judges' PASS and green CI on the final landing commit. Merge/deployment
   and live migration execution still require the owner's explicit word. On authorized
   live application, first verify modern approval/contract/question/waiver prerequisites,
   then apply **`20261021220430_career_apply_message_cards.sql`**, then
   **`20261024130000_career_apply_card_cloud_bridge.sql`**. The new up/down files own
   BEGIN/COMMIT: use standalone `psql -X -v ON_ERROR_STOP=1 -f FILE`; never `-1`, an
   enclosing fixture transaction, or a casual include in another migration run.
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
