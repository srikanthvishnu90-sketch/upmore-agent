# FORMS-CI CAPTURED-FORM COVERAGE — 2026-10-23

Repo-only measurement pack. Every form driven here was **already captured in this
repository** (`tests/fixtures/forms-ci/`, CI capture of 2026-10-19). **No new capture
was made and no live site was contacted in any way** — no fetch, load, render, or API
call to any external website or ATS family. Pages were served from 127.0.0.1 with
scripts, styles, and external references stripped, and driven through the product's
own browser executor (`scripts/career/portal-browser-helper.cjs`, the daemon the board
service spawns) and the shared binder (`bindFields`, `extension/lib/trainee-core.js`).
The runner is fail-closed: it can only send open / discover / fill / readback / close
to the helper; submit controls are recorded, never clicked; the local server only ever
received GETs (asserted by the suite).

**This is captured-form coverage. It is not live driveability and not production
quality.**

Suite: `tests/career-forms-ci-coverage.test.cjs` · Pin:
`tests/fixtures/forms-ci-coverage-expected.json`.

## Inventory — every captured form in the repo

Source of truth: `tests/fixtures/forms-ci/manifest.json` + `sources.json` (CI run of
`.github/workflows/form-capture.yml` on `ci/form-capture`, commit `5d1e51da`,
2026-10-19). 24 manifest entries: 17 rendered application captures with stored HTML,
1 posting with no application form, 6 attempts refused at load.

| Family | Captured application forms | Pinned coverage record |
|---|---|---|
| Ashby | 6 | **Already pinned** — Ashby verdict pack (below); not re-driven here |
| Greenhouse | 5 | **Pinned by this pack** |
| Lever | 6 | **Pinned by this pack** |
| SmartRecruiters | 0 (6 attempts, all `blocked_403` behind DataDome, `html: null`) | Honest zero pinned by the SmartRecruiters verdict pack |
| **Total captured** | **17** | **11 newly pinned here + 6 already pinned** |

Other fixture directories checked: `tests/fixtures/workday/` holds **synthetic**
Workday-shaped pages (its own `sources.md` states they are not captures of any real
site) — not captured forms, out of scope. `tests/fixtures/terms/` holds two terms
pages (Netflix, Spotify) — not application forms. `tests/fixtures/apply/` holds audit
JSONs, no forms.

### Palantir exclusion

**Zero Palantir captures exist in `tests/fixtures/forms-ci`** (asserted by the suite
against the manifest: no entry id, company, or source URL matches Palantir). Nothing
was excluded because nothing was there; if a Palantir capture ever lands in the
manifest, the suite's hold test goes red until it is recorded as excluded — under the
owner's standing hold it is never driven.

### Already pinned elsewhere (not re-driven)

The 6 Ashby forms — OpenAI, Airwallex, Lilt, Snowflake, Crusoe, Harvey — carry a
pinned coverage record in the Ashby verdict pack: branch
`muse/2026-10-23-ashby-verdict-pack` @ `fac7aa1a`,
`tests/fixtures/ashby-verdict-pack-expected.json` (pin verified present on that
branch; totals: 87 questions mapped, 87 filled+verified, 87 read back exactly across
the 6 forms — per form: OpenAI 16, Airwallex 15, Lilt 11, Snowflake 16, Crusoe 14,
Harvey 15 mapped/filled/read-back). This pack asserts the manifest's Ashby set equals
that pinned set and never serves or drives them.

### Not captured (recorded, not dropped)

- `greenhouse-databricks-8805655002` — capture status `no_application`: the posting
  page loaded (HTTP 200) but held no application form; no HTML stored.
- 6 SmartRecruiters postings (Domino's, CROSSMARK, Sonsoft, AECOM, BoschGroup, SGS) —
  capture status `blocked_403`, DataDome; no HTML stored. Coverage for the family is
  the SmartRecruiters pack's pinned honest zero.

## Coverage measured by this pack (pinned)

Recorded coverage block (the gate-verified sums of the per-form pins):
**11 forms · 271 questions mapped · 174 filled+verified · 167 read back exactly ·
claimable: true** (398 fields discovered in total).

| Form | Discovered | Mapped | Filled+verified | Read back exactly | File questions | Attestation-class | Submit control |
|---|---|---|---|---|---|---|---|
| Greenhouse — Prolific | 11 | 11 | 9 | 9 | 1 (resume) | 0 | present, never clicked |
| Greenhouse — EOS Fitness | 36 | 36 | 19 | 19 | 5 | 0 | present, never clicked |
| Greenhouse — SpaceX | 31 | 31 | 11 | 11 | 2 | 0 | present, never clicked |
| Greenhouse — Anduril | 33 | 33 | 11 | 11 | 2 | 0 | present, never clicked |
| Greenhouse — WPP Media | 28 | 28 | 11 | 11 | 1 | 0 | present, never clicked |
| **Greenhouse subtotal** | **139** | **139** | **61** | **61** | **11** | **0** | |
| Lever — TSMG | 18 | 18 | 13 | 13 | 1 | **1** | present, never clicked |
| Lever — CGS Federal | 29 | 16 | 15 | 14 | 1 | 0 | present, never clicked |
| Lever — Veeva | 16 | 14 | 11 | 11 | 1 | 0 | present, never clicked |
| Lever — Shield AI | 59 | 28 | 25 | 24 | 1 | 0 | present, never clicked |
| Lever — Welo Global | 46 | 28 | 24 | 23 | 1 | 0 | present, never clicked |
| Lever — Lyra Health | 91 | 28 | 25 | 21 | 1 | **1** | present, never clicked |
| **Lever subtotal** | **259** | **132** | **113** | **106** | **6** | **2** | |
| **Total** | **398** | **271** | **174** | **167** | **17** | **2** | |

Reading the numbers: `discovered` = fields the helper's discovery returned on the
captured page; `mapped` = questions the shared binder produced; `filled+verified` =
fills the executor confirmed; `read back exactly` = read-backs byte-equal to what was
filled. Per-field outcomes (with the executor's own reason for every non-`filled`
field) are pinned in the fixture.

- **Greenhouse maps everything it discovers (139/139)** but fills 61/139 (44%): the
  dominant non-fill outcome is `value_did_not_persist` — the JS-driven selects and
  typeaheads (the `question_*` dropdowns, country pickers) do not retain a value on
  the script-stripped capture. Everything Greenhouse filled read back exactly (61/61).
- **Lever's binder maps a subset on card-based layouts** (132 of 259 discovered; the
  two largest forms — Shield AI 59 discovered, Lyra Health 91 — each map 28) and fills
  113/132 mapped (86%). 7 filled values did **not** read back exactly, all on Lever:
  `pronouns` (CGS Federal, Lyra Health), `cards[…][field1]` (Shield AI, Welo Global,
  Lyra Health), `surveysResponses[…]` (Lyra Health ×2) — select/rendering differences
  between the filled value and the rendered read-back, pinned per field.
- **Attestation-class questions (attestation stops on any live drive): 2** — TSMG's
  "I agree" confirmation (Privacy Policy / Terms & Conditions / Whistleblowers Policy)
  and Lyra Health's "do you certify you have reviewed the Internal Mobility Policy…".
  Both are inventoried in the fixture's `attestation` lists.
- **File questions: 17** — a resume upload on all 11 forms, plus cover-letter and
  question-file uploads on EOS Fitness (5 total), SpaceX (2), Anduril (2). File fills
  read back by sha256, as in the Ashby pack.
- **Captcha signals:** at capture time every form carried a bot check (Greenhouse:
  `recaptcha_enterprise` ×5; Lever: `hcaptcha` ×6 — manifest `bot_check`, pinned in
  each fixture entry). On replay, no form reported an active captcha
  (`captchaOnReplay` null on all 11); the helper detected the `hcaptcha-widget` tech
  on 5 of 6 Lever replays (not Welo Global) and none on Greenhouse (scripts stripped).

## The coverage gate

Pattern from the SmartRecruiters verdict pack, strengthened: a coverage claim stands
only when every captured form in scope carries full provenance (source URL, capture
timestamp, capture method) and a pinned drive expectation, **and** the recorded
coverage block equals the sums of the per-form pins. Fail-first evidence, recorded
before the pin was relied on (summarized in the PR body):

1. **Headline tamper** — the coverage block inflated by 1 (`questionsMapped` 272)
   with the pins untouched: the gate test went **red** (1 fail / 1 pass in the gate
   test pair, suite exit 1).
2. **Pin tamper** — one form's pinned `mapped` inflated by 1 with the coverage block
   inflated to match (internally consistent): the affected form's drive test went
   **red** on re-drive — the pin must match the machinery, not just itself.

The gate also unit-tests its own verdicts: no provenance → not claimable; no pin →
not claimable; empty set → not claimable; a complete record → claimable.

## Failures and limits recorded

- **3 fills returned the helper's `DRIVER_ERROR`** (EOS Fitness `start-year--0` and
  `end-year--0`; Anduril `end-year--0` — year spinbutton-style inputs). Deterministic:
  across measurement EOS Fitness was driven five times, Anduril four, Prolific three —
  identical pinned outcomes every time. These are pinned as measured outcomes, not
  retried into passes.
- **Measurement environment instability (this VM, 2026-10-23):** early full-suite
  measurement attempts were interrupted by VM replacements and one mid-run browser
  death (`Target page, context or browser has been closed` on Lever–Lyra Health in an
  aborted attempt — the known host Chromium fragility, not a form property). Final
  numbers come from clean per-family runs; Welo Global's aborted-attempt timeout
  likewise resolved to a clean 24.6s drive. No form carries an infrastructure pin:
  all 11 forms have genuine drive records.
- Greenhouse drives are slow on this VM (~50–400s per form, uncontended ~15–25s per
  Lever form): a full-suite verification run is a long run here. Waits are not
  assertions; the pins are.

## Boundary

All forms are pre-existing repo fixtures (2026-10-19 CI captures). No new captures, no
live contact of any kind, no Palantir, no production anything (production freeze; the
worker host is down and stayed down). Chromium posture on this VM: the helper's
recorded sandbox opt-out (`UPMORE_CHROMIUM_SANDBOX=off` — this VM cannot launch
sandboxed Chromium as root); the helper's `ready.json` posture is preserved in the
measurement emit record.
