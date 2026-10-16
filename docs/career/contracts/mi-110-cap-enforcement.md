# CONTRACT — MI-110 / BUG-233: module 149 reports the decided application caps but never enforces them

**Written:** 2026-10-15, BEFORE the fix (contract first).
**Registered:** master issue list MI-110 (Crew A, from harness memo G5). Crew B build.
**Failing witness:** module 149 @ afc460e — the header states "Caps (§6.4) are
REPORTED, marked decision-pending" and `capReport` returns `decisionPending: true`.
No code path in 149 (or anywhere in the submit path) refuses a submission that
would exceed a cap. The numbers were decided by the owner long ago (15/day locked
2026-10-12; SPEC_CAPS: 15/day, 5/vendor/day, 1/company/30 days) — the module's
"decision-pending" framing is stale, and a lane driving 16 submissions in a day
is stopped only by lane discipline, never by the product.

## The rule change

149 gains a single counting/enforcement seam, `capCheck(log, userId, posting, now, board)`,
counting from the submissions ledger (`log.records`, status "submitted" — the same
records `submitDoorstep` already writes, so the ledger persists per user across
threads wherever the host persists the log):

- **perDay** — the user's submitted records whose timestamp date-slice equals the
  calendar day of `now`. Limit `SPEC_CAPS.perDay` (15).
- **perVendorPerDay** — same day, restricted to the posting's vendor. Vendor =
  the ATS family of the posting URL (`classifyTarget`), falling back to the
  board's `atsFamily`, falling back to the record's stamped `vendor`. Limit 5.
- **perCompanyPer30Days** — the user's submitted records for the same normalized
  company (`normName`) with a parseable timestamp inside the trailing 30×24h
  window ending at `now`. Limit 1.

Enforcement at both submit surfaces:

1. **runApply** — after the payload passes the quality gate and before a doorstep
   is returned (and before an in-run approval is exercised): a run that would
   exceed any cap stops `blocked` with code **CAP_REACHED**, naming the cap,
   the current count, and the limit (`cap`, `count`, `limit`, `vendor`/`company`
   where applicable). A capped run never presents a doorstep that cannot submit.
2. **submitDoorstep** — the counts are re-checked immediately before the arming
   wire (counts can change between doorstep and click; the gate that fires is
   the gate that counts). Same typed stop; `board.submit()` is never reached
   and the board is never armed on a cap stop.

Submitted records are stamped with `vendor` and `company` (from the posting the
run carried; direct `submitDoorstep` calls derive vendor from the board family
and company from `ctx.posting` when present) so later counting never depends on
re-classifying a URL.

`capReport` tells the truth after the change: `decisionPending: false`,
`enforced: true`, the three counts, and the remaining headroom per cap. The
existing pin (`career-portal-apply.test.cjs` asserting `decisionPending === true`)
is updated in the same commit — it pinned the superseded report-only behavior.

## Guard (fail-first)

`tests/career-portal-caps.test.cjs`:

- 15 submitted records today in the ledger → the 16th same-day run stops
  CAP_REACHED (cap "perDay", count 15, limit 15); the board's submit count
  stays 0 for that run — 149 itself refuses, not the caller.
- Vendor: 5 same-vendor submissions today (different companies) → a 6th
  same-vendor run stops (cap "perVendorPerDay"); a different-vendor run the
  same day still proceeds.
- Company: 1 submission to the same company 10 days ago → refused
  (cap "perCompanyPer30Days"); the same record 31 days ago → allowed.
- Day boundary: 15 submissions yesterday → a run today proceeds.
- Direct submitDoorstep path: doorstep prepared under the cap, ledger then
  filled to the cap by other runs → submitDoorstep refuses CAP_REACHED
  before arming (arm spy + submit spy both 0).

## Scope

Module 149 only. SPEC_CAPS values do not change (they are the owner's decided
numbers). The never-twice-to-the-same-job rule (§8.3) is untouched — the company
cap is per company across jobs, a different and additional stop. Nothing deploys.
