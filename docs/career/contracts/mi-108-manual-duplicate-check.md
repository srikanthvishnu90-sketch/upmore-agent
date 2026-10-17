# MI-108 — Pre-submit duplicate check against the user's own manual applications

Spec 2 §8.3, harness memo G3. Crew B build (Tier 2 — engine under
harness; no deploy, no sends, no real submissions).

## The gap

Module 149's never-twice rule (§8.3) keyed only on the product's own
submissions ledger (`log.records`, status `submitted`). A job the user
had already applied to **by hand** — recorded in the tracker (126) from
their own report, or stated by the user in the run — was invisible to
it, so the product could prepare and submit a second application to
the same canonical job, and the employer's duplicate handling would
merge or flag the pair. The chat layer (141/142) guarded its own
doorstep turns, but the 149 drive itself — the path module 155's batch
loop calls directly — had no such check.

## The rule

Before a board is opened (and again at the submit gate), 149 runs
`manualDuplicateCheck(posting, sources)` over the sources the caller
hands the run:

- **Tracker sources** — `tracker` / `trackStore` / `trackerStore` /
  `track` (a 126 store `{rows}` or a plain rows array),
  `manualApplications` / `priorApplications` (rows arrays). A row
  counts when it evidences a completed application to the same job:
  an applied stage (`Submitted`…`Offer`, `Accepted`, `Ghosted`, or the
  user-reported `applied`), or an `applied`/`confirmation` event.
  Matching is, in order: canonical key (exact — blocks at any stage,
  including terminal, because it is the same opening), URL, job id,
  then company + role (both normalized; a role mismatch never matches,
  and this fuzzy path never blocks on a terminal `Rejected`/
  `Withdrawn` row — reapply-after-rejection is 126 `reapplyCheck`'s
  cooldown lane, not a duplicate). `Saved`/`Tailoring`/`Ready` rows
  with no applied event never count.
- **User-statement sources** — `userStatement` / `userStatements` /
  `statement` (text) and `priorApplication` / `manualApplication` /
  `manualApplyDisclosure` (a disclosed record object, 141/142 shape).
  Text counts only as the user's own assertion (the BUG-169 / RCA
  discipline the tracker already uses): quoted spans are stripped,
  negated ("I didn't apply…"), hypothetical ("if I applied…") and
  attributed forms assert nothing, and a statement naming a different
  company does not bind this posting.

A hit stops the run `blocked` with the typed code
**`ALREADY_APPLIED_BY_USER`** — distinct from §8.3's
`DUPLICATE_APPLICATION` (the product ledger's own rule, untouched) —
carrying `source` (`"tracker"` | `"user_statement"`), a human
`sourceDetail` naming the source of the knowledge (the tracker record
and its provenance, or the user's statement quoted as evidence),
`matchedBy`, and the matched record. The board is never opened on a
prepare-time hit; at the submit gate the stop lands before arming, so
no click can fire over a manual record that landed after the doorstep.

Provenance inside the tracker detail: a row whose applied event or
markers say `user-reported` / manual is named as a manual application
recorded from the user's own report; any other applied tracker row is
named as an application recorded in the tracker. Either way it is the
**user's** prior application, never the product's ledger.

## Tracker side (126)

- `manualApplicationCheck(store, target)` — the same matching over a
  tracker store, returning `{ found, already_applied, source,
  source_detail, matched_by, manual, provenance, application }`.
- `addApplication` now preserves, when the caller hands them, the
  row's `canonicalKey`, `job_id`, `manual` flag and `channel` — a
  manual row written today can be exact-matched tomorrow. Default row
  shape is unchanged when they are absent.

## Batch seam (155)

`prepareRun` / `executeRun` pass the caller's `tracker`,
`userStatement(s)`, `manualApplications` and `priorApplications`
deps through to 149 unchanged — the batch loop gets the same stop the
single drive gets, with the app reported `stopped` under
`ALREADY_APPLIED_BY_USER` by the existing absorb path.

## Guard

`tests/career-mi108-duplicate-check.test.cjs` (16 tests, DUP family):
the done-test in both source forms (tracker row with canonical key;
user statement), company+role matching on pre-canonical rows,
plain-array rows, a disclosed-record statement, negated / hypothetical
/ quoted non-assertions, a different-company statement, different-role
and Saved-only controls, the terminal-row exact-vs-fuzzy rule, the
untouched product-ledger code, the submit-gate re-check (board submit
count 0), the 155 batch pass-through, the pure helper, and 126's own
check + canonical-key preservation. Written fail-first: 10 of the
original 15 were red on the base module (the batch case rides the
same missing check).

## Bug law

No separate defect was found in existing code during this build — the
missing check is the registered item itself (MI-108), and this guard
is its permanent enforcement. No BUG/FR numbers are self-allocated;
the register block for this rule is Crew A's to write at merge, as
with MI-107/MI-117.
