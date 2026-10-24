# React-select menu-first — outcome note (2026-10-24)

Branch `muse/2026-10-23-widget-eligibility-integration`. Repo tier
only; nothing merged, nothing deployed. Real completions: 0.

## The change

`scripts/career/portal-browser-helper.cjs` — `driveWidget` now reads
the menu its opening click renders BEFORE typing into the search box
(`pickFromOpenMenu`): a value the widget already renders earns the
ladder's own early return; otherwise the rendered options are judged
with the ladder's own matcher (hoisted verbatim to
`fnMarkMatchingOption` / `fnPickMarkedOption` — serialized bodies
verified identical to the inlined originals) and picked with the
ladder's own machinery; a pick counts only when the widget's
single-value renders it. No rendered options, no match, or a pick
that does not land falls through to the existing ladder unchanged:
same bindings, same outcome vocabulary, no poll budget shortened,
no timeout raised, no assertion or pin touched anywhere.

Why: typing the wanted value filters the menu by that text, so an
option whose label shares no token with the wanted value — the EEO
decline ("I don't wish to answer" against "Decline to
self-identify") — filters itself out of its own menu and is
reachable only at the ladder's cleared-search rung (i=16, >= 8 s of
fixed 500 ms polls). On the captured Greenhouse forms the same drive
shape burns ~19–71 s per custom-select field; that per-fill burn is
the root pressure behind the coverage suite's timeout crossings.

## Before / after (synthetic fixture, the coverage suite's drive path)

`tests/career-react-select-menu-first.test.cjs` — synthetic
constructed Greenhouse-shaped react-selects, options only inside the
opened menu; capability evidence only, no coverage claim.

- Decline pick: filled + read back exactly,
  **10,944 ms -> 908 ms** (fail-first bound 5,000 ms; the pre-fix
  fill waits out the ladder to the cleared-search rung).
- Exact match: filled + read back exactly, **1,750 ms -> 906 ms**.
- No matching option: **value_did_not_persist at ~19.1 s before and
  after** — the ladder fall-through costs what it always cost.

## Captured forms: no measured outcome changed

Full `tests/career-forms-ci-coverage.test.cjs` run at the fixed
head, local (Chromium headless shell, sandbox off via the helper's
own env switch — this VM's userns restriction; CI runs its standard
environment): **27 pass / 0 fail / 0 skipped, 2,776 s**. Every one
of the 11 forms reproduced its pin exactly — zero pin changes, the
pin file byte-untouched — and all widget-gap guard re-drives pass.
Per-form drive times (ms): Prolific 153,464 · EOS 329,086 · SpaceX
507,048 · Anduril 684,260 · WPP 476,301 · TSMG 13,232 · CGS 13,074 ·
Veeva 11,969 · Shield AI 20,977 · Welo 18,636 · Lyra 18,660.

Honest scope of the timing claim: on the script-stripped captures no
options ever render, so the ladder runs as before (the menu read
adds at most ~0.9 s of presence polls per widget fill) and drive
times are unchanged — Anduril 684 s here vs 674 s for the
reconciliation's completed drive. The measured win is where options
actually render (the fixture above; live-shaped menus). The 75
captured custom-select fields stay mapped-not-filled /
unverified-against-live: this change does not create live evidence,
and no pin moved to pretend otherwise.

## How proven

- Fail-first commit `0c468fa6`: the fixture suite is red on the
  pre-fix driver (decline fill 10,944 ms against the 5,000 ms
  bound; the exact-match, no-match, and command-set tests green as
  designed).
- Fix commit `34b45147`: fixture suite 4/4 green locally.
- Neighbor `tests/career-widget-attach.test.cjs`: 4 pass / 0 fail /
  1 pre-existing skip — the decline regression guard still lands the
  pick (now via the menu read) and the never-actionable widget still
  fails inside its bounded budget (49.4 s vs the suite's 55 s bound).
- Neighbor `tests/career-extension-react-select.test.cjs`: 9 pass /
  0 fail (the extension chooser is untouched).
- Coverage suite at the fixed head: 27/27 green, pins byte-identical
  (above).
- CI at the pushed head: read from the public check-runs API and
  reported with this note's landing; the branch's gate now includes
  the new suite in the browser partition (19 suites).
