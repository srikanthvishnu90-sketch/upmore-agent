# CAREER-BATCH: the batch-apply loop (module 155; LOOP ACCEPTANCE build, Crew B 2026-10-15)

`packages/domain/155-career-batch-apply.js` (`CareerBatchApply`) is the orchestration for the
owner's done-test: ONE message — "apply to 15 <role-family> roles" — and Upmore runs the whole
loop itself. It reimplements nothing; every stage reuses an existing engine:

- Parse (J7): the apply-verb ask requires a count (digits or spelled) and a family text;
  count-less, family-less and non-apply asks are not claimed by this intent.
- The run object is pure JSON (it survives the host snapshot): id, family, requested count,
  status (`new` → `awaiting_approval` → `approved` → `completed | completed_with_stops`),
  per-application states, the hash-bound card set, and the approvalRef.
- Prepare: discovery counts → dedupe (121, cross-board duplicates removed and counted) →
  screen (closed postings as JOB_CLOSED, 121 knockouts as KNOCKOUT_UNMET, the user's own
  current employer via 132 as CURRENT_EMPLOYER, triage skips/asks when a scoring profile is
  supplied) → count selection (eligible beyond the named count are COUNT_DEFERRED — named,
  kept, never dropped) → tailor evidence (123) → portal drives to the doorstep through 149.
  The doorstep is a STOP: nothing submits in prepare, ever. A required question with no
  confirmed fact stops that application as UNCOVERED_QUESTION with the field named — nothing
  is invented to fill it. A captcha is CAPTCHA_HANDOFF, never solved. A reached cap defers.
- The card (132's batch shape) covers doorstep-ready applications only and is hash-bound
  (MI-116): approving re-computes the set hash, and a changed payload refuses the approval
  as APPROVAL_SET_CHANGED — the batch is never silently re-pointed.
- Approve (J3): only the user's explicit yes mints the per-application approvals and the
  approvalRef — `batch:<runId>:<cardSetHash>` — which 149's arming wire requires before a
  REAL board may fire (Leg 1). A hash-only approval in the pre-fix shape cannot arm one.
- Execute (J4): requires the approved state; per application, submit through 149 with the
  approved payload hash + the run's approvalRef. End states are graded, not stage claims:
  `submitted` carries the employer-shaped confirmation id and writes the tracker record and
  the submission log (the cap source); cap-at-click defers as CAP_REACHED with its resume
  day; a captcha at submit is a handoff; a throwing drive stops as EXECUTION_ERROR; an
  unreadable end state is UNKNOWN_OUTCOME, never retried blind (MI-115 owns it from there).
- Report (J5): the summary and its spoken form name the found count, duplicates removed,
  screened-out postings, the eligible/selected counts, every submission with its
  confirmation, every stop by code, and every deferral.

Caps are 149's (MI-110: 15/day, per-vendor, per-company), enforced at doorstep time and
re-checked at click time; this module defers what the cap stops and never argues with the
count. No stealth (Spec 2 §6.3): boards are reached only through 149/150's tested seams.

Where it runs:

- The chat seam in `packages/domain/142-career-router.js` + `supabase/functions/_shared/career_host.js`
  (`batchApplyState` on the host snapshot), and the worker-side executor
  (`workers/career-browser/batch-executor.cjs`) for the delegated path.
- Tested in `tests/career-loop-acceptance.test.cjs` and `tests/career-batch-delegation.test.cjs`
  (the full trajectory suites) and here. TEST persona + sandbox boards only in tests.

Check: `node --test tests/depth-CAREER-BATCH.test.cjs && node evals/depth/run.cjs CAREER-BATCH`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Digit-count parse | apply to 15 investment banking intern roles | `S01` in tests/depth-CAREER-BATCH.test.cjs | the family text is read from the unit group | proven |
| S02 | Spelled counts | fifteen resolves to 15 | `S02` in tests/depth-CAREER-BATCH.test.cjs | fifteen resolves to 14 | proven |
| S03 | Unclaimed asks stay unclaimed | count-less asks return null | `S03` in tests/depth-CAREER-BATCH.test.cjs | a non-matching ask fabricates a batch | proven |
| S04 | New run state | a new run starts in the new state | `S04` in tests/depth-CAREER-BATCH.test.cjs | a new run starts already approved | proven |
| S05 | Duplicates counted | a cross-board duplicate counts as removed | `S05` in tests/depth-CAREER-BATCH.test.cjs | duplicates are removed but never counted | proven |
| S06 | Closed screens out | a closed posting is JOB_CLOSED | `S06` in tests/depth-CAREER-BATCH.test.cjs | closed postings stay eligible | proven |
| S07 | Knockouts screen out | an unmet license knockout is KNOCKOUT_UNMET | `S07` in tests/depth-CAREER-BATCH.test.cjs | knockout results are discarded | proven |
| S08 | Current employer screens out | the user's own employer is CURRENT_EMPLOYER | `S08` in tests/depth-CAREER-BATCH.test.cjs | the current-employer block never fires | proven |
| S09 | Count deferral | eligible beyond the count are COUNT_DEFERRED | `S09` in tests/depth-CAREER-BATCH.test.cjs | every eligible posting is selected regardless of count | proven |
| S10 | The approval card | doorstep applications get a batch_approval card | `S10` in tests/depth-CAREER-BATCH.test.cjs | the batch card is never built | proven |
| S11 | ApprovalRef binding | the ref includes the card set hash | `S11` in tests/depth-CAREER-BATCH.test.cjs | the approvalRef is not bound to the card set hash | proven |
| S12 | Changed set refused | a tampered payload refuses approval | `S12` in tests/depth-CAREER-BATCH.test.cjs | the card set hash is never re-checked at approval | proven |
| S13 | The yes is required | approvedByUser false mints nothing | `S13` in tests/depth-CAREER-BATCH.test.cjs | an approval without the user's yes still mints | proven |
| S14 | Execution needs approval | an unapproved run submits nothing | `S14` in tests/depth-CAREER-BATCH.test.cjs | execution runs without an approval | proven |
| S15 | Submissions land | an approved clean batch submits 3 with confirmations | `S15` in tests/depth-CAREER-BATCH.test.cjs | a completed submit is recorded as still at the doorstep | proven (also fails S18, S21) |
| S16 | Uncovered question named | an uncovered required field stops as UNCOVERED_QUESTION | `S16` in tests/depth-CAREER-BATCH.test.cjs | the uncovered-question stop is renamed | proven |
| S17 | Captcha is a handoff | a captcha at open stops as CAPTCHA_HANDOFF | `S17` in tests/depth-CAREER-BATCH.test.cjs | the captcha stop is recorded as solved | proven |
| S18 | Cap deferral at click | cap overflow defers as CAP_REACHED with a resume day | `S18` in tests/depth-CAREER-BATCH.test.cjs | click-time cap deferrals are recorded under another code | proven |
| S19 | Drive errors named | a throwing drive stops as EXECUTION_ERROR | `S19` in tests/depth-CAREER-BATCH.test.cjs | drive errors are recorded as EXECUTION_OK | proven |
| S20 | Restore round-trips | a serialized run restores and approves | `S20` in tests/depth-CAREER-BATCH.test.cjs | restore always returns null | proven |
| S21 | Report names submissions | the spoken summary names the submitted count | `S21` in tests/depth-CAREER-BATCH.test.cjs | the spoken summary omits the submissions line | proven |
<!-- results:end -->
