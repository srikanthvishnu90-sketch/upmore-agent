# Lever radio-group discovery crash — fix record (Depth Lane E)

**Found:** 2026-10-16, live drive of Neighbor (Lever) in re-drive R2.
**Fixed:** same run, branch `depth/submissions`. **Registry:** BUG/FR
allocation requested from the Crew A registry (single-writer rule,
MI-119) — none self-allocated; the bug-ledger row rides as
PENDING-ALLOCATION until the registry pass.

## The defect

`scripts/career/portal-browser-helper.cjs` discovery (`selectorFor`)
built a bare `tag[name="..."]` selector for every named input. Radio
and checkbox inputs share one `name` across their whole group by
design, so on Neighbor's Lever form the selector for the card group
`cards[<uuid>][field0]` matched both the Yes and No inputs,
Playwright's strict `elementHandle()` threw, and the drive died as
DRIVER_ERROR inside `cmdDiscover` — before a single field was
classified. The Lever form was never read; every earlier Lever pass
had stopped earlier (captcha on open / EMPTY_FORM), so this path had
never been exercised live.

## The fix

1. `selectorFor`: radio/checkbox inputs with a name AND a value get a
   value-qualified selector (`[name="..."][value="..."]`) — unique
   within the group by construction. Valueless members keep the
   document-index fallback.
2. Handle capture (`cmdDiscover`, `reresolveBinding`) now goes
   through `resolveFieldHandle`, which degrades to the field's
   document index on any resolution failure instead of throwing —
   discovery can no longer kill a drive.

## Guard (fail-first)

Fixture `/lever-radio` in `tests/fixtures/portal-fixture-server.cjs`
mirrors the live DOM (same shared machine name, Yes/No radios, card
question = work authorization). `tests/career-portal-lever-radio.
test.cjs`: **0/2 pre-fix** (both tests die with the exact strict-mode
violation from the live run) → **2/2 post-fix**: discovery survives,
the confirmed "Yes" is filled and read back into the doorstep
payload, zero fill failures.

## Live proof

Neighbor re-driven the same run on the fixed helper: the full Lever
form completed — 0 fill failures, 0 uncovered questions — and the run
stopped at Lever's captcha (blocked / CAPTCHA_HANDOFF, nothing
transmitted). Record:
`~/workspace/your_files/real-apply/submissions/redrive-r2-2026-10-16/b2-21-neighbor/record.json`.
