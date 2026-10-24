# Forms-CI coverage reconciliation — 2026-10-24

Branch `muse/2026-10-23-widget-eligibility-integration`, base head `82cb014a`.
The CI shard (457a7629 + 82cb014a) let `gate-coverage` run this suite to completion
for the first time; it came back RED. This doc is the per-item reconciliation:
every failing fixture and guard, its old expectation, its re-measured outcome at
this head, and its verdict. **No pin was changed. No guard assertion was changed.**
One guard premise was repaired on the measured record (item 6), flagged as such.

Reported failures reconciled here:

- CI gate-coverage @ 82cb014a: `greenhouse-andurilindustries-4802172007`,
  `greenhouse-wppmedia-5437567008`, guard "an unfilled required select cannot be
  counted filled in the pin".
- Coordinator local full run (73.5 min, same head content): `spacex-8643277002`,
  `andurilindustries`, `lever-tsmg`, `lever-lyrahealth`, plus both guards
  (the pin-shape guard and "conditional follow-ups are gated", the latter with
  "the follow-up is missing from the drive record").

## The structural fact the verdicts rest on

The suite's entire drive path is byte-identical between the re-pin commits and
this head, so no drive outcome in this suite can have been changed by the three
product commits that landed after the re-pins (e8ce6423, 4dce7cea, 2f1e236a):

- `git diff 5af0a3af..HEAD` over `tests/career-forms-ci-coverage.test.cjs`,
  `scripts/career/portal-browser-helper.cjs`, `scripts/career/page-functions.cjs`,
  `scripts/career/resume-upload.cjs`, `workers/career-browser/protocol.cjs`,
  `packages/domain/149-career-portal-apply.js`, `tests/fixtures/forms-ci/` and
  `tests/fixtures/forms-ci-coverage-expected.json` is EMPTY.
- `bindFields` — the only `trainee-core.js` export this suite executes — is
  byte-identical (5,559 bytes, md5 `51661beeda2526d0695fbd2ec5d192c0`) at
  f9e79bdd, 5af0a3af and HEAD. The helper never loads trainee-core. The three
  product commits changed the extension chooser/derivation layer
  (chooseOption/optionRule/driveWidget and their generated copies), which this
  suite never executes: its fills are computed by the suite's own `valueFor`
  and executed by the helper.

The stale-pin window's real effect is the other half of the hypothesis: the
suite never completed anywhere (every CI run died at the old 30-min job cap;
this guard set sits at the end of the file, after all 11 drives), so these
failures were invisible from the moment they were introduced until the shard.

## Measurements at 82cb014a (suite's own runner, captured fixtures, local server)

| form | drive | pinned filled/readback | measured filled/readback | per-field diffs |
|---|---|---|---|---|
| lever-tsmg-9e43a7f6 | standalone ×2 (14s) | 17/17 | 17/17 | 0 |
| greenhouse-wppmedia-5437567008 | standalone (471s) | 11/11 | 11/11 | 0 |
| greenhouse-andurilindustries-4802172007 | standalone, completed (674s) | 12/12 | 12/12 | 0 |
| greenhouse-spacex-8643277002 | standalone (509s) | 11/11 | 11/11 | 0 |
| lever-lyrahealth-35bffe8b | standalone (22s) | 27/23 | 27/23 | 0 |
| lever-cgsfederal-0130d854 | representative pass | 15/14 | 15/14 | 0 |
| lever-veeva-9ac55b31 | representative pass | 14/14 | 14/14 | 0 |
| lever-shieldai-ba945088 | representative pass | 28/27 | 28/27 | 0 |
| lever-weloglobal-6e0ac589 | representative pass | 28/27 | 28/27 | 0 |

Read-back mismatches measured are exactly the ones the pins already carry
(e.g. Lyra's 27 filled / 23 read-back-exact includes its 4 pinned mismatches).
Not re-driven: `greenhouse-prolificacademicltd` and `greenhouse-eosfitness` —
neither appears in any failure list, and Prolific is under the coordinator's
own open 8-vs-9 classification rerun. Slow Greenhouse drives were completed in
a scratch copy of the suite with only the per-test timeout raised (1800s): per
the suite's own rule, "the pinned outcomes below are the assertion; the waits
are not." Drive code, assertions and pins in the scratch runs are byte-identical
to this file; the scratch copy was deleted after measurement.

## Per-item verdicts

1. **greenhouse-andurilindustries-4802172007 — ENVIRONMENT.**
   Old: pin 12 filled / 12 read-back. CI actual: 11 filled / read-back null /
   drive_error — the fill_timeout truncation signature (one fill crossed the
   300s helper-response timeout; the loop broke; read-back was skipped).
   New (completed standalone drive at this head): 12/12, zero diffs.
   The drive takes ~11 min on a contended host: a standalone assertion-mode run
   on this VM hit the test's own 600s timeout (600,732ms). Anduril fails in
   both environments because it is the slowest drive in the set (33 fields, the
   heaviest react-select retry load) — it is the first across every timeout
   line. Not a regression (drive path byte-identical) and not an intended
   change (nothing in the outcome moved). Pin unchanged.

2. **greenhouse-wppmedia-5437567008 — ENVIRONMENT.**
   Old: pin 11/11. New standalone at this head: 11/11, zero diffs, follow-up
   4017898008 present with outcome `conditional_not_triggered`; the drive took
   471s on this VM against the test's 600s timeout, so in a full run — after
   ten prior drives in one helper session — the same truncation as item 1 is
   the failure shape. Pin unchanged.

3. **greenhouse-spacex-8643277002 — ENVIRONMENT.**
   Failed only in the coordinator's local full run. Standalone at this head:
   11/11, zero diffs (509s). Pin unchanged.

4. **lever-tsmg-9e43a7f6 — ENVIRONMENT.**
   Failed only in the coordinator's local full run. Standalone at this head,
   twice: 17/17, zero diffs, `eeo[gender]` filled with exact read-back.
   Pin unchanged.

5. **lever-lyrahealth-35bffe8b — ENVIRONMENT.**
   Failed only in the coordinator's local full run. Standalone at this head:
   27 filled / 23 read-back-exact, zero fill diffs — identical to the pin,
   including the pin's own 4 read-back mismatches. Pin unchanged.

6. **Guard "an unfilled required select cannot be counted filled in the pin" —
   PIN-SHAPE CONSEQUENCE OF AN INTENDED, MEASURED CHANGE (premise repaired;
   assertions untouched).**
   This failure is deterministic and involves no drive: the guard's premise
   asserts the pin records its flip target as unfilled, and the pin records it
   filled. Pin archaeology: at 20427bc8 (guard written) TSMG `eeo[gender]` was
   `value_did_not_persist` (form filledCount 13) — premise true. The widget-gap
   lane's own Lever re-pin f9e79bdd ("native selects take the profile's
   values", 01:03) measured it `filled` (filledCount 17) — premise silently
   broken from that commit, invisible because no completed run ever reached
   the guard. The reconciliation re-drive at this head (item 4) confirms the
   pin is TRUE: `eeo[gender]` fills and reads back exactly. Re-pinning it back
   to unfilled to satisfy the guard would falsify a measured record, so the
   guard's flip target moved to the same form's only remaining unfilled
   required select — the attestation select
   `cards[ded439b4-712a-4cd3-8f14-a8f652c8e2bc][field0]`, pinned outcome
   `attestation_stop` — with the premise comment rewritten to this record.
   Every assertion in the guard is byte-identical to 20427bc8 (premise check,
   the flip, `recordedClaimConsistent` false, per-form claimable false), and
   the guard passes standalone at this head with the gate still rejecting the
   flip. This is a premise repair, recorded here and in the commit message for
   review — not an assertion change and not a weakening: the scenario (an
   unfilled required select counted filled in the pin) is the same, and the
   target is now the form's most protected unfilled select.

7. **Guard "conditional follow-ups are gated on the persona's parent answer" —
   ENVIRONMENT.**
   Its behavioral leg drives WPP Media and requires the follow-up in the
   record. The completed standalone WPP drive at this head (item 2) contains
   the follow-up, gated `conditional_not_triggered`. A fills record missing
   the follow-up is produced only by the fill_timeout truncation path (or a
   bind failure — excluded: the binder is byte-identical and binds cleanly
   standalone). In the coordinator's full run the guard executes after all 11
   form drives plus the other guards in one long-lived helper session; the
   truncation is the same load mechanism as items 1–2. The guard's unit
   assertions are pure functions of the suite's own gate table, and the guard
   itself was run standalone at this head in this reconciliation: PASS
   (468,972ms — its WPP drive completed inside the test's 600s timeout with
   the follow-up present and gated). No code changed.

## What did NOT change

- The expected pin (`tests/fixtures/forms-ci-coverage-expected.json`): untouched.
  Totals stand as measured at the re-pins and re-verified above: 11 forms,
  271 mapped, 193 filled, 186 read back exactly (builder-measured at
  f9e79bdd/5af0a3af; the 9 forms re-driven here reproduce their pins exactly).
- The `unverified-against-live` labels, the per-widget-class claims, and the
  97-field reconciliation from the coverage pack: untouched.
- Every guard assertion in the suite: untouched (item 6 moved a flip target
  and its comment only).
- Product code, frozen modules (121/124/130/132/141/142/149), bundles: untouched.

## Measurement-tooling note (for the next runner)

In EMIT mode, a drive that crosses its test timeout never reaches the emit
write inside the test, and `test.after` then writes an empty results merge —
an observer sees a green-looking posture file with no record. Two Anduril
measurement runs on this VM were lost to exactly that before the raised-timeout
scratch runs above. Treat an EMIT file with empty `results` as "the run died
at a timeout", never as a measurement.

## Scope honesty

The full suite was NOT re-run end-to-end on this host for this reconciliation:
its slowest drive alone crosses the suite's own 600s test timeout here. The
proof set at this head is: all five reported failing fixtures (completed,
pin-exact), a representative pass of four further forms (pin-exact), the six
non-drive tests (pass), and the six widget-gap guards (see the landing
report). CI re-verification at the new head is the coordinator's, as with the
shard.
