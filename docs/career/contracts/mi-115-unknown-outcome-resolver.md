# CONTRACT — MI-115 / BUG-235: `unknown_outcome` is terminal — no resolver owns an unclear submission

**Written:** 2026-10-15, BEFORE the fix (contract first).
**Registered:** master issue list MI-115 (Crew A, from harness memo G10). Crew B build (149, records in the 126 tracker shape).
**Failing witness:** the owner's own submissions ledger, 2026-10-15 — two real
applications sit at `unknown_outcome` with no mechanism that will ever move
them: Arc Boat Company (armed click; the employer's page afterwards showed the
form still open with required-field errors — page evidence says nothing landed,
the product verdict stayed unknown) and Labelbox (one execution claimed a
submission with a confirmation ID matching a test fixture and no evidence
artifacts — not credited, recorded unknown out of caution). 149 has a
per-session `reconcile()`, but nothing sweeps unresolved applications, records
a resolution attempt, or re-presents the still-unknown ones to the user.
Tracker truth decays from the moment of submission (Spec 2 §8.3).

## Design note — what the resolver may read (and what it may not)

Spec 2 §8.3 says: check the user's email for a confirmation first. **The inbox
half is NOT_WIRED**: Gmail is not connected in-product (MI-074 / CA-08b), so
this resolver performs **employer-side checks only**. It accepts an optional
`inboxScan` seam; when no inbox reader is supplied, the attempt records method
`inbox_unavailable` — it never pretends to have checked an inbox it cannot
read. The resolver **never submits anything**: it reads destination state and
records what it read (141's destination-truth discipline: status is read from
the destination at answer time, never composed from memory).

## The rule change

149 gains `resolveUnknownOutcomes(input)` beside `reconcile()`:

- **Input:** `{ records, readers, now, minAgeHours?, maxPerPass?, inboxScan? }`.
  `records` are application records in the tracker/log shape the submit path
  already writes (`userId`, `canonicalKey`, `status`, `timestamp`, plus
  `company` / `vendor` / `url` where known). `readers` maps a record to an
  employer-side status reader — a function `(record) => { state:
  "submitted", confirmationId } | { state: "not_submitted" } |
  { state: "unverifiable", reason }`, or a per-record lookup by canonicalKey.
  A record with no reader records method `none_available`.
- **Bounds:** only records at status `unknown_outcome` whose timestamp is at
  least `minAgeHours` old (default 24) are attempted; at most `maxPerPass`
  (default 20) per pass, oldest first. A record whose last recorded attempt is
  fresher than `minAgeHours` is skipped — the resolver never hammers a board.
- **Every attempt is recorded** on the record (`resolutionAttempts`:
  `{ at, method, result }`) and returned in the pass report — an attempt that
  changes nothing is still an attempt on record.
- **Outcomes:**
  - reader says **submitted** → record resolves: status `submitted`,
    `resolvedBy: "employer_confirmed"`, confirmationId carried.
  - reader says **not_submitted** → status `not_submitted`,
    `resolvedBy: "employer_verified_absent"`. (A retry from there needs a
    fresh approval — the same law `reconcile()` already states.)
  - reader **unverifiable**, no reader, or reader throws → status stays
    `unknown_outcome`, `stillUnknown: true`, and the record gains a named
    `userQuestion` — the exact question to re-present to the user (e.g.
    "Did a confirmation email arrive for <company>? The board cannot prove
    either way.") — so a still-unknown is a named question, never silence.

## Guard (fail-first)

`tests/career-unknown-outcome-resolver.test.cjs`, fixtures first:

- **The two standing cases.** Arc (reader: employer's state shows no
  submission — the form-evidence case) resolves to `not_submitted` with the
  attempt recorded. Labelbox (reader: `unverifiable`) stays
  `unknown_outcome`, gains a named `userQuestion`, attempt recorded.
- Employer-confirmed case resolves to `submitted` with the confirmationId.
- A record younger than 24h is untouched; a record attempted <24h ago is
  skipped; a pass over 25 eligible records attempts exactly `maxPerPass`.
- **Never submits:** every fixture reader carries a submit spy; all spies
  stay at 0 across every pass. Missing inbox seam records
  `inbox_unavailable`, never a fabricated inbox result.

## Scope

Module 149 (the resolver sits with `reconcile()`, the module that owns
submission truth) operating on tracker-shaped records; 126's status surfaces
read the same records, so a resolved record reads resolved with no 126 change.
Nothing deploys; the standing cases in the owner's ledger get their first
resolver pass when this lands on a driven run — the guard proves the mechanism
on their faithful fixtures.
