# Drive-readiness fixes — captcha presence vs presentation + SPA discovery settle

**Found:** 2026-10-17, live dry drives (TEST persona, unarmed boards,
submit never armed) on branch `finish/apply-readiness`.
**Fixed:** same day, same branch. **Registry:** BUG/FR allocation
requested from the Crew A registry (single-writer rule, MI-119) —
none self-allocated; the bug-ledger rows ride as PENDING-ALLOCATION
until the registry pass. Guards: `tests/career-apply-readiness.test.cjs`
(A: drive relay, B: chromium wrapper, C1–C4: board drives).

## Defect 1 — passive captcha tech read as a presented challenge

**Live evidence.** The Lever/Spotify dry drive ended
`CAPTCHA_HANDOFF` at OPEN with 0 fields discovered. The stop
screenshot shows a complete, usable Lever application form with no
challenge anywhere on it. A read-only DOM census of the same page
found exactly one element matching the detector's selectors: the
`.h-captcha` container div, **1220×0 px** — the invisible hCaptcha
mount Lever embeds on the form; it renders a widget only if the
vendor decides to challenge at submit. Greenhouse's current UI
embeds a reCAPTCHA v3 badge (70×60, passive scoring branding).
Lane E's three CAPTCHA_HANDOFF end states (Arc, Mercury, Neighbor)
were recorded against this same detector, so an unknown share of
those stops may be this misfire rather than presented challenges.

**Root cause.** `fnDetectChallenge` (portal-browser-helper.cjs)
treated `offsetParent !== null || getClientRects().length > 0` as
"visible" — a 0-height invisible mount satisfies both. Presence of
captcha tech was conflated with presentation of a challenge.
Module 150's design only ever promised stops on a *visible*
challenge, and presence already has its own evidence channel
(`fnCaptchaTech`, reported on every open).

**Fix.** The selector leg now requires a PRESENTED widget: the
element is not inside `.grecaptcha-badge`, does not carry
`data-size="invisible"`, has a bounding rect ≥100×40, sane computed
visibility/opacity, and is not parked offscreen. The challenge-text
leg (interstitial phrases) is unchanged. A widget the vendor
actually presents — at open, review, or submit — renders at real
size and is caught at that step by the same function. Nothing about
the response changes: a presented challenge still stops the drive
with CAPTCHA_HANDOFF and a screenshot; Upmore never solves one.

**Guard (fail-first).** Fixture `/captcha-passive` reproduces the
measured Lever shape (0-height invisible mount + v3 badge iframe
around a usable form); `/captcha-presented` is a 304×78 widget with
no challenge text. C1: CAPTCHA_HANDOFF pre-fix → `prepared`
post-fix. C2: presented widget stops before and after. C3: the
pre-existing `/captcha-open` text page still stops. Live
re-verification: Lever/Spotify and Greenhouse/LionTree dry drives
re-run post-fix (results in the readiness ledger,
`~/workspace/your_files/real-apply/mass-apply-readiness.md`).

## Defect 2 — discovery read SPA boards at first paint

**Live evidence.** The Ashby/Ramp dry drive ended `EMPTY_FORM` with
0 fields. A read-only census of the same `/application` page over
time: 0 fields at first paint and at +3s; **13 inputs, 3 textareas,
3 file inputs at ~9s** — Ashby client-renders its form seconds after
`domcontentloaded`.

**Root cause.** `cmdOpen`/`cmdDiscover` ran `fnDiscoverFields`
exactly once, ~1.2s after `domcontentloaded`, with no settle wait.

**Fix.** `settleForFields` polls discovery every 600ms until ≥2
fields hold steady across two polls or the budget ends: 15s in
`cmdOpen`, 10s in `cmdDiscover` when the first read is empty, 8s
after an apply-control click. A genuinely formless page (e.g. a
SmartRecruiters posting page, which carries no form at all — see
the readiness ledger) still returns 0 at budget expiry; EMPTY_FORM
remains an honest verdict, just no longer a first-paint accident.
Scoped (controlled-task) boards keep the single immediate read —
their pages are local fixtures under their own timing law.

**Guard (fail-first).** Fixture `/spa-late-form` injects its fields
~3.5s after load. C4: EMPTY_FORM pre-fix → `prepared` post-fix.
Live re-verification: Ashby/Ramp dry drive re-run post-fix.

## Explicitly NOT fixed here (named, with evidence in the ledger)

- **SmartRecruiters** carries no form on its posting pages; the only
  application entry is the OneClick UI, which bot-walls this
  Chromium ("Please enable JS and disable any ad blocker", then a
  blank page). The product contains no disguise techniques by
  design, so SR is NOT READY for driving — a family build (or an
  owner ruling on the channel), not a drive-environment fix.
- **Greenhouse resume file channel** recorded
  `file_input_not_mounted` on LionTree in both dry-drive runs while
  the stopped page showed the file attached in run 1 and not in
  run 2 — a mount race on the current UI that the existing
  file-mount recovery only sometimes wins. Characterized in the
  ledger; the fix belongs to a Greenhouse-driver lane with the
  canary re-capture loop, not to a readiness drive-by.
