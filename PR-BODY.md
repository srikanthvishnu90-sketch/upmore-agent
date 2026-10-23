# SmartRecruiters verdict pack + ATS logos continued (2 commits)

**Commit 1 — the pack (`7b9ccde0`).** The SmartRecruiters verdict pack is finished to the
Ashby standard. The capture plan left unexecuted in the Ashby pack was executed under the
owner's 2026-10-23 direction (read-only loads only): eight posting URLs — the six
2026-10-19 sources plus two postings released the same day, sourced from the public
postings API — each attempted by plain fetch AND by a rendered Chromium load in
`render-form.cjs`'s read-only pattern. **All 16 attempts were refused at load: HTTP 403,
the DataDome interstitial** ("DataDome Device Check", geo.captcha-delivery.com;
`X-DataDome: protected`). Captured-form coverage is therefore honestly **0 forms /
0 questions, not claimable** — and the suite pins that zero behind a new coverage gate
(a claim is claimable only with ≥1 genuinely captured form carrying full provenance and
pinned expectations), with the full Ashby-standard drive machinery included and proven
working via a machinery dry-run on a borrowed captured Ashby form (seed; counts toward
no SmartRecruiters number). Classification: **NOT LIVE-DRIVEABLE** (403, board service)
and **CAPTURE REFUSED AT LOAD** (re-measured). Harness tier only — no live drives, no
production changes, the worker host was not touched.

**Commit 2 — logos (`707b72b7`).** Of the four ATS logos left unsourced by
`muse/2026-10-23-ats-logos`, two are now sourced from the companies' own sites and two
honestly remain name-only. **SmartRecruiters**: the SR–SAP lockup the earlier lane could
not retrieve is retrievable today from smartrecruiters.com (the file its own structured
data declares as the organization logo), committed unmodified. **Ashby**: the wordmark
SVG served as ashbyhq.com's homepage header logo, paths unmodified. **Lever** and
**Breezy** stay name-only — absent from simple-icons 16.35.0 and @iconify/json 2.2.547
(re-checked today), Lever publishes raster PNG only, Breezy raster WebP only (and its
site answers 403 from here); no invented or stand-in assets, the LeverFi crypto-token
trap still avoided. This branch: brands.json 99 → 101 rows; combined with the sibling
branch, 4 of 6 ATS families sourced.

## Capture attempt record (summary; full record pinned in the fixture)

- Plain fetch (browser UA, egress proxy): 8/8 → 403, `Server: cloudflare`,
  `X-DataDome: protected`, 779-byte DataDome interstitial body. 2026-10-23 20:48–20:50Z.
- Rendered load (`scripts/career/render-form.cjs`, read-only interceptor): 8/8 → 403
  `blocked_403`, 0 forms / 0 fields; rendered page is the DataDome interstitial; the
  interceptor aborted 3 non-GET requests per page (read-only held). 20:51–20:54Z.
- Fresh postings used: Domino's released 2026-10-23T20:30:04Z, Bosch Group released
  2026-10-23T20:49:45Z (attempted minutes later — staleness excluded as an explanation).
- Family load record is now 14 attempts / 14 refusals (6 on 2026-10-19 + 8 on 2026-10-23).

## Fail-first evidence (the coverage gate)

- Tampered fixture with `coverage.claimable: true` → gate test FAILS (recorded claim ≠
  computed verdict).
- Tampered fixture inventing a captured form → gate test FAILS (captured-set disagreement
  with the manifest).
- On unmodified trunk the suite does not exist ("Could not find
  'tests/career-smartrecruiters-verdict-pack.test.cjs'").
- Gate unit behavior proven both ways in-suite: provenance-less and unpinned forms are
  rejected; a complete synthetic record IS claimable (the gate is a check, not a constant).

## Suite counts (from the suites' own summary lines)

- `tests/career-smartrecruiters-verdict-pack.test.cjs` — **5 pass / 0 fail / 0 skipped**
  (classification+record pin · coverage gate · gate unit behavior · machinery dry-run:
  seed form 28 raw rows → 16 mapped / 16 filled+verified / 16 read back exactly ·
  fail-closed replay assertion). Re-run on the final tree: 5/5.
- Neighbor `tests/career-form-ci-fixtures.test.cjs` — **4 pass / 0 fail**.
- Ashby pack suite in its own worktree (the standard, unchanged) — **7 pass / 0 fail**.
- `scripts/build-connect-cards.cjs --check` — passes (SOURCES.md not stale).
- `scripts/apply.ts` planner suite (real-forms) not runnable on this VM (no deno — same
  as prior lanes); planner tier is reported in the pack doc, not changed: SmartRecruiters
  has no per-form planner pin because no form exists; the fixtures suite pins the
  DataDome block itself.
- Full `scripts/gate.sh` not run locally: this VM is environment-red for it (no deno,
  Chromium sandbox posture) identically on unmodified trunk, per prior lanes' measured
  comparisons; CI on this head is the authoritative gate.

## Files

Commit 1: `docs/engine/SMARTRECRUITERS-VERDICT-PACK-2026-10-23.md` (new) ·
`tests/career-smartrecruiters-verdict-pack.test.cjs` (new) ·
`tests/fixtures/smartrecruiters-verdict-pack-expected.json` (new).
Commit 2: `img/brands/ashby.svg` (new) · `img/brands/smartrecruiters.svg` (new) ·
`img/brands/brands.json` (+2 rows) · `img/brands/SOURCES.md` (regenerated by the
generator, never hand-edited). Built output was verified to emit both new slugs via
`brandIcon(name)` and then reverted — data-only, per the brand-work convention.
This PR-BODY.md replaces trunk's stale previous-lane copy, per lane convention.
