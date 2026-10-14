# Independent workflow-memory findings

Owner authorized scoring the selected main build, pushing a baseline, and making bounded changes on an independent audit branch. Main and the other chat were not modified. Baseline: `192132dfd83f6f9834a7e8c962be91f570f6bbc7`.

| Case | User-visible behavior before | Root cause | Repair and evidence |
| --- | --- | --- | --- |
| M08 | `$12.50 instead` after a $20 card dropped the card as unrelated | Router dispatch and send's amount-change grammar differed | Dispatch and split share the bounded send grammar; CORE-MEMORY S01–S03 |
| M09 | `make it 90` after a $60 split repeated the old $20-per-person card | Split relied on a general voice classifier that did not recognize the amount edit | Recompute shares and require fresh approval; S04–S06 |
| M13 | `cancel that` after a blocked Netflix cancellation said nothing had been mentioned | Cancellation remembered a merchant only after obtaining unavailable account terms | Remember only the uniquely resolved merchant before the read; S07–S09 |
| M25 | `did it go through` after staging fell through without recalling the staged task | Generic question guard ran before bounded recent-settlement status handling | Ground reply in settlement plus actual stored posting evidence; S10–S12 |
| M41 | A third repeated yes lost the original staged-task reference | Second yes cleared the recent-settlement memo | Keep original settlement and timestamp, never repeat the action; S13–S15 |

`tests/memory-audit/run.ts` writes verbatim synthetic transcripts and state-check failures for all 50 scenarios, three trials each. The frozen baseline is `docs/testing/memory-capability-audit/memory-before.json`. The separate robustness corpus initially had 10/60 pass-three on the original source snapshot, exposed more shared grammar/dispatch gaps, and is now an exposed regression set. It is not a permanently blind holdout.

The existing corpus variant reporter in `evals/corpus/run.ts` counts every non-FAIL variant as passing, including LIMITED and NEEDS_MODEL. Its statement that variants grade the same way as their seed must not be interpreted as strict completion. The independent scorer uses PASS only and records 75/103; no application safeguards or historical corpus expectations were weakened to increase this number. The historical reporter was left unchanged; its scoring limitation is disclosed here and in the overnight plan.

`evals/depth/run.cjs` parsed TAP while Node 24 selected a human reporter in this environment, so a new packet produced zero parsed tags and no mutation proof. The runner now explicitly selects TAP, requires a successful baseline and a failed mutated test process, and cannot label a zero-tag baseline green. This is a runner compatibility repair; it does not invalidate recorded packets generated under a compatible reporter. CORE-MEMORY records 15/15 parseable planted defects that fail their tagged tests.

The student's general career-memory implementation described in the pasted brief is absent from this baseline. The former 1/50 is not a measured score for this commit. The independent workflow score and offline capability score must not be substituted for model-backed career-memory or actual delivery evidence.
