# MI-108 — pre-submit collision check (module 149)

**Item:** MI-108 (harness memo G3). **Lane:** Depth E — Submissions
(branch `depth/submissions`, off release/career-v224). **Date:** 2026-10-16.

## The defect

The never-twice rule (§8.3) read only module 149's own submissions
ledger — records the product wrote. An application the user filed by
hand never enters that ledger, so the rule was blind to it: the
product could apply to a job the user already holds an application at,
and the employer's duplicate handling merges or flags the pair
(Spec 2 §8.3 + employer-side duplicate behavior, memo D8).

## The fix (packages/domain/149-career-portal-apply.js)

`collisionCheck(manualApplications, posting)` — the host passes what
it knows as `manualApplications`: tracker rows (module 126; hand
applications land there via user-reported updates) and user
statements, normalized to `{ company, title, stage, source, at,
canonicalKey? }`. A record is evidence when:

- its origin is not the product itself (a product-origin record is
  the caps' domain — MI-110 — not this check's);
- its stage proves an application exists (applied or beyond; a
  saved/interested row is not an application);
- it names the SAME canonical job: a canonical-key match is
  decisive; otherwise company AND title must both match (title by
  normalized equality or ≥ 0.75 token overlap of the smaller title,
  so a "(Summer)" variant matches and a different role at the same
  company never does).

Enforced at both surfaces, mirroring the MI-110 caps discipline:

- `runApply` (doorstep surface): stops `ALREADY_APPLIED_BY_USER`
  before a doorstep is presented, naming the company, the stage, and
  the source of the knowledge ("tracker (user-reported)" or "user
  statement").
- `submitDoorstep` (click surface): re-checks before the payload
  binding and the arming wire, from `ctx.manualApplications` or the
  session's stored set — knowledge arriving between doorstep and
  click still refuses the duplicate.

No records supplied → the check is silent (no knowledge, no claim).

## Guard

`tests/career-portal-collision.test.cjs` — 7 cases, fail-first
(3 red before the fix: tracker-row stop, user-statement stop,
click-time stop; 4 controls green throughout: different role, not-
yet-applied stages, product-origin record, no records). Green after:
7/7, with the portal family unregressed (caps 7/7, answer-map 8/8,
apply 14/14, payload-binding 7/7, submit-path 15/15) and the router
bundle rebuilt (`tests/router-bundle.test.cjs` 3/3).

## Done-test (MI-108)

"A doorstep whose tracker or user statement shows a prior manual
application to the same canonical job stops with a typed
ALREADY_APPLIED_BY_USER stop naming the source of the knowledge;
replay guard green." — Met at the module level by the guard above.
The live-drive surface receives the honest record set per run (the
R2 re-drive records what manualApplications carried and why).

## Registry note

No FR/BUG number is self-allocated by this lane (single-writer rule,
MI-119): allocation for the MI-108 enforcement block is requested
from the Crew A registry. Until then this contract + the guard test
are the record.
