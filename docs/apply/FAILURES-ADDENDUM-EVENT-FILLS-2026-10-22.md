# FAILURES ADDENDUM — event-driven fills lane (2026-10-22)

Entries in the canonical FAILURES.md format, filed by the event-driven
fills lane (night plan chunk 60%) on branch
muse/2026-10-22-event-driven-fills for merge into FAILURES.md
(canonical copy lives on muse/2026-10-20-failures-backlog, PR #143).
ID is PROPOSED (F-032, continuing the program numbering past the
session-reuse lane's F-031); the backlog owner confirms allocation at
merge. Lane note: docs/apply/EVENT-DRIVEN-FILLS-2026-10-22.md.

---

[ID: MUSE-F-032 (proposed)] [Status: FIXED — guard green, live re-drive proven]
Found: 2026-10-22 ~03:2x CDT, Muse (chunk 60% lane, first host-applied after-drive, batch-94c36711038d)
Area: shared (portal browser helper / wait primitives)
Input: live prepare of Gusto Finance Intern (Summer 2027) for the TEST profile through the production executor (155 → 149 → board service → Greenhouse), flag OFF, prepare-only.
Expected: widget fills drive as they did on the ladder; the event-driven waits proceed when the board renders the option/value.
Actual (verbatim from the board's driverLog): {"action":"fill_failed","field_id":"country","reason":"fill_error:DRIVER_ERROR","message":"Unknown polling option: mutation"} — every waitForDom-based fill (country, candidate_location, all widget fields) failed the same way; the drive stopped at 19,369 ms on ANSWER_OBSERVATION_MISMATCH for country because the dead fill never recorded a renderedValue for the FR-395 hatch to compare.
Evidence: ~/workspace/event-fills-harness/run-live-gusto-after.json + run-after.log (failed drive, batch-94c36711038d); isolated reproduction via ~/workspace/event-fills-harness/debug-widget.cjs against the host tree (same DRIVER_ERROR, 1,353 ms).
Priority: P1 (every widget fill on the service path; plain fills unaffected — they use the evaluate-based pollUntil)
Root cause: PINNED — scripts/career/wait-primitives.cjs waitForDom passed `polling: o.polling || "mutation"` to page.waitForFunction. The installed Playwright validates that option and rejects "mutation" (mutation observation is waitForFunction's DEFAULT behavior; the option accepts only "raf" or a millisecond number). The unit suite's fake pages accepted any polling value, so 10/10 unit guards were green while the real driver threw on first use — a fake that does not model the real API's validation is a hole in the guard, not just a bad option value.
Fix: wait-primitives.cjs — no polling option is passed by default; a caller-supplied value is forwarded only when it is "raf" or a number, so an invalid option can never reach the driver again. Host-applied to the TEST worker host 2026-10-22 (wait-primitives.cjs sha256 12414fe5…, .bak-20261022T082835Z-f032 taken first), board service restarted, probes green (401/401/403 DRIVER_HOST_REFUSED/403 FAMILY_NOT_DRIVEABLE/Lever 201+close 200).
Guard: tests/career-event-waits.test.cjs gains a strictPlaywrightPage fake that reproduces the real option validation + two tests (default call never passes a rejected option; a caller asking for "mutation" is sanitized). Fail-first VERIFIED: with the old line restored in a scratch copy the suite goes 10/12 with both new tests failing on "Unknown polling option: mutation"; with the fix, 12/12.
Verified by: unit suite 12/12; isolated country drive on the fixed host code (filled+verified 1,441 ms, waits event-fired at 15/9/5 ms); full after-drive batch-b6a60c430b43 (22 fills, answers() byte-identical to the ladder drive batch-b57cfae3fd75, same UNCOVERED_QUESTION stop).
