# CONTRACT — MI-116 / BUG-234: module 149's approval binds to the job, not to the exact payload

**Written:** 2026-10-15, BEFORE the fix (contract first).
**Registered:** master issue list MI-116 (Crew A, from harness memo G11). Crew B build.
**Failing witness:** module 149 @ afc460e — `submitDoorstep` arms on
`approvedByUser` + `approvalRef` + canonical key, and (since BUG-209/FR-365)
re-verifies that every required field still holds a value at click time. But no
hash binds the approval to the exact filled answers: change one answer's VALUE
between the owner's approval and the click — every field still present, every
check green — and the board transmits answers the owner never approved. Spec 2
§10 states the law plainly: changing a payload after approval invalidates the
approval. Module 141's chat seam already practices this discipline (fact_hash
binding + `approval_invalidated`); 149's submit leg does not.

## The rule change

One payload builder, `buildPayload(board)`, reproduces the exact would-submit
payload from a board's CURRENT answers — the same construction runApply uses at
doorstep time (form-definition field order, resume shaped to
`{filename, sha256}`, `resume_sha256` carried from the board's resume answer).
runApply's doorstep hash is computed over this builder's output (identical
string to today's snapshot — the doorstep's `payloadSha256` does not change
meaning), so doorstep-time and click-time hashes are comparable by construction.

Binding, at both surfaces:

1. **runApply** — when a run carries an approval and exercises it in the same
   run, the approval is bound to the payload built in that run: the step log
   records `approval_bound` with the hash, and the exercised approval carries
   `payloadSha256` into submitDoorstep. (In this flow the approval is exercised
   on exactly the payload the run just built from confirmed facts; there is no
   shown-doorstep gap to protect, and the binding still guards the click
   against any board-state change between doorstep and submit inside the run —
   e.g. a repair-loop refill landing a different value.)
2. **submitDoorstep** — after the existing approval/doorstep checks and BEFORE
   the arming wire: the approval must carry `payloadSha256`. The gate
   recomputes the live payload hash via `buildPayload(session.board)` and
   compares. Missing hash, or any difference, stops with
   `{ resultStatus: "blocked", code: "APPROVAL_PAYLOAD_MISMATCH" }`, naming
   the fields that changed / were added / were removed. On a mismatch stop the
   board is never armed and `board.submit()` is never called.

Caller contract (stated for the lanes that mint approvals against a shown
doorstep): an approval for a doorstep carries that doorstep's `payloadSha256` —
the value runApply already returns on the prepared result. Approvals minted by
older callers without a hash no longer fire against an existing doorstep; the
stop names the missing binding so the caller can re-approve the shown payload.

## Guard (fail-first)

`tests/career-portal-payload-binding.test.cjs`:

- **Value-change:** doorstep prepared, approval bound to its hash, then one
  board answer mutated → submitDoorstep stops APPROVAL_PAYLOAD_MISMATCH,
  `board.calls.submit` stays 0, arm spy never called.
- **Field-add:** an extra answered field appears on the board after approval →
  mismatch stop, zero clicks.
- **Field-removal:** an approved field's answer disappears → mismatch stop.
- **Unchanged control:** approval bound, board untouched → submits exactly
  once, submission record carries the approval ref as before.
- **Hashless approval** against an existing doorstep → mismatch stop naming
  the missing binding.
- Same-run flow: runApply with an approval submits (binding stamped in-run),
  and the D3 arming guard's happy path is updated to the new caller contract
  (approval carries the doorstep hash) in the same commit.

## Scope

Module 149 only (141's seam already enforces its own binding; nothing in 141
changes). The FR-365 required-field re-verification stays — the hash check is
strictly stronger and runs alongside it. Nothing deploys.
