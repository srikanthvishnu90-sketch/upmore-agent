# Gauntlet record — <SHA> (TEMPLATE, adopted 2026-10-15, Crew A)

_Every field is mandatory. A number without its methodology block does not leave
the building (A-08). Carried figures are labeled with the build they belong to —
never silently inherited (A-08)._

## Build & artifact

- Commit: <sha> · Branch: <branch> · Artifact: career-only bundle (router_core.career.js)
- Staged tree: <N files> / <bytes> B · Staged-size structural test (B-05): PASS/FAIL at <bytes> vs ceiling 4,200,000 B
- Live version after deploy: agent-chat v<NNN> (verify_jwt=<…>) · Rollback bundle staged at: <durable path>

## Run configuration (A-06 — pinned, printed, not remembered)

- Host class: <VM> · Concurrency: sequential (`--test-concurrency=1`) unless stated
- Wall-clock window: <start–end, TZ> · Clock state: <real / faked at …> for every clock-sensitive suite
- Harness: local chain (120→130→142→141) / live product — per block below
- Noise rule: inter-build differences under 3 points are WITHIN NOISE unless reproduced in a
  second run at a different time. Flips claimed below cite their reproduction run or are
  labeled UNCONFIRMED.

## Two suites, two bars (A-02)

- REGRESSION suite (everything previously passing; bar ≈100%; any dip = stop): <pass>/<total>
- CAPABILITY suite (defect rows + novel conversations + absent-adjacents; low rate expected):
  <pass>/<total>
- Graduations this build (capability → regression requires two consecutive full-run passes): <list or none>
- TASK-SUSPECT count (0% scenarios routed to task/grader repair first, A-03): <n> — resolutions: <…>

## Consistency (A-01)

- Exam (300 scenarios): pass@1 = <…> (capability breadth; never a customer-facing claim alone)
- Genuine-Phrasing Gate battery: pass@1 = <…> · **pass^3 = <…>** (3 runs; floor for ship: <stated>)
- Live subset (25 conv / 47 turns): pass@1 = <…> · **pass^3 = <…>**
- Safety: SAFE <…>/300 · Adversarial state-write set: <…> non-assertion writes (bar: 0)

## End-state grading (A-04)

- State-changing scenarios graded on end state: <n>/<n> (100% target) · Reply-shape-only: <list>

## Horizon (A-09)

| Human-time band | Clean asks | Messy (typo/rambling) | Multi-intent | Contradictory/state-changing |
|---|---|---|---|---|
| <5 min | | | | |
| 5–30 min | | | | |
| 30 min–2 h | | | | |
| >2 h | | | | |

- Horizon statement: succeeds ≥50% up to tasks a human does in ~<band>; messy-band rate: <…>

## Rainbow promotion (B-01) — two windows, recorded separately

- Probe window (test user only): probes (a)–(d) <…> · live subset <…> · fallback <…>
- Promotion decision: PROMOTED / HELD — by: <owner tap reference>
- Post-promotion window: probes re-run <…> · drift vs probe window: <…>

## Defects & flips

- New defects found: <BUG ids + ledger status> · Flips vs last build: <each with reproduction or UNCONFIRMED>
- Wording (when re-judged): <…> (judge agreement: <X>% on owner labels — A-07; a figure without it is a draft)

## Verdict

- <ship / hold, one line, with the numbers that decide it>
