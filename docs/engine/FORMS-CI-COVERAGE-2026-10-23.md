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

## Corrections (2026-10-23, on top of the measurement record)

The original push (`d8f64405`) stands as the measurement record. Four corrections,
gated by the coordinator, land on top of it and **supersede the original summaries
where they differ**: (1) every one of the 97 mapped-not-filled fields is now
reconciled per field in the fixture (exact name, status from the captured schema,
widget class, attempted value, its own reason) — no bulk labeling; (2) custom-select
non-persistence is **not** framed as a capture-replay limitation — those fields are
labeled **unverified-against-live** (see the reconciliation section); (3) the
read-only safety test now isolates its own setup state and passes standalone;
(4) the blanket `claimable: true` is gone — claims are scoped per form and per
widget class only. The reconciliation was derived from the captured schema
artifacts plus a discover-only re-run of the machinery over the same captures
(open/discover/close only, no fills, no new captures, no live contact); the re-run
reproduced the pin's mapped counts exactly on all 11 forms. (A VM replacement
during the corrections wiped the first derivation's /tmp scratch; the re-run was
done from durable copies and is the derivation of record.)

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
**11 forms · 271 questions mapped · 174 filled+verified · 167 read back exactly**
(398 fields discovered in total). **No aggregate claim is made from these sums** —
claims are scoped per form and per widget class (see "Scoped claims" below).

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
field) are pinned in the fixture, and every mapped-not-filled field is reconciled
per field (see "Reconciliation of the 97 mapped-not-filled fields").

- **Greenhouse maps everything it discovers (139/139)** but fills 61/139 (44%).
  All 78 non-filled Greenhouse fields are custom selects (react-select) or year
  inputs: the executor's widget drive persisted **none** of the 75 react-selects
  (country pickers, `question_*` dropdowns, education and EEO dropdowns). Those 75
  are labeled **unverified-against-live**: on a stripped capture we cannot know
  whether those selects are required in effect or would persist live — the capture
  carries no option list for them (their options load when the menu opens). No
  capture-replay explanation is asserted. The remaining 3 are the `DRIVER_ERROR`
  year inputs. Everything Greenhouse filled read back exactly (61/61).
- **Lever's binder maps a subset on card-based layouts** (132 of 259 discovered; the
  two largest forms — Shield AI 59 discovered, Lyra Health 91 — each map 28) and fills
  113/132 mapped (86%). All 19 mapped-not-filled Lever fields are native `<select>`
  elements. For each of them, the only value the drive attempted was the select's
  first option — the **placeholder** (`Select ...` / `Select...`, value `""`) — and
  the executor reported `value_did_not_persist`; no non-placeholder option was
  attempted under the drive's first-option value policy. That is a value-policy
  measurement, not a widget verdict: one Lever native select with the same
  placeholder shape (a Shield AI card field) filled and persisted, so the
  placeholder alone does not determine the outcome, and the per-field reasons in
  the fixture assert the attempted value and the executor's outcome, nothing more.
  7 filled values did **not** read back exactly, all on Lever:
  `pronouns` (CGS Federal, Lyra Health), `cards[…][field1]` (Shield AI, Welo Global,
  Lyra Health), `surveysResponses[…]` (Lyra Health ×2) — select/rendering differences
  between the filled value and the rendered read-back, pinned per form. This is a
  separate axis from the 97: the 97 are mapped-**not-filled**; the 7 are
  filled-but-not-read-back-exactly.
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

## Reconciliation of the 97 mapped-not-filled fields

271 mapped − 174 filled = **97 fields the drive attempted but did not fill**. Every
one is reconciled per field in the fixture (`expectation.reconciliation`): exact
field name, the field's label, its **status from the captured form schema**, its
widget class, the executor's outcome, the value the drive attempted, and its own
reason. Statuses were read from the captured schema artifacts — the binder schema
over the captured HTML (required markers), the capture manifest's required lists,
and `tests/fixtures/forms-ci/greenhouse-options.json` for the Greenhouse boards'
education modes. Widget classes are the machinery's own binding records
(discover-only re-run, 2026-10-23). There is no bulk label: the composition is —

**By status class (from the captured schema):**

| Status | Count | What they are |
|---|---|---|
| required | 45 | Schema-required questions: Greenhouse `question_*` (41), Lever card/location selects (4) |
| required-conditional | 13 | Education-block fields (12: EOS 4 under `education_optional`; SpaceX 3 and Anduril 5 under `education_required` — the condition is stated per field) + WPP Media's disability follow-up (1), which applies only if the preceding disability question is answered "Yes" |
| optional | 32 | Voluntary EEO/demographic selects (Greenhouse 6, WPP Media 8, Lever 15) and unmarked questions (3) |
| core-contact | 7 | The Greenhouse contact block's own fields: `country` (×5) and `candidate-location` (×2) |

**By measured reason:**

| Reason | Count |
|---|---|
| Custom select (react-select) did not persist on the stripped capture — **unverified-against-live**; live comparison held, not scheduled | 75 |
| Native `<select>`: the only attempted value was the placeholder first option (value `""`) under the drive's first-option policy; executor reported `value_did_not_persist` | 19 |
| Executor returned `DRIVER_ERROR` (education year number inputs) | 3 |

Two axes must not be conflated: the 97 above are mapped-**not-filled**. The
174 filled vs 167 read-back-exactly gap is a different set of 7 fields — filled,
but their read-backs differed (named in the coverage section). No field is in both
sets.

## Scoped claims

There is **no aggregate claim**. The fixture's coverage block carries sums only;
each form carries its own claim (`capturedForms[].claim`, all 11 claimable — each
basis states that form's filled/read-back numbers and exactly how its non-filled
fields reconcile), and widget coverage is claimed per family and widget class
(`widgetClassClaims`):

| Family | Widget class | Mapped | Filled | Claim |
|---|---|---|---|---|
| Greenhouse | text input | 49 | 49 | covered |
| Greenhouse | custom select (react-select) | 75 | 0 | **unverified-against-live** |
| Greenhouse | file input | 11 | 11 | covered |
| Greenhouse | number input | 3 | 0 | partial (3 × `DRIVER_ERROR`) |
| Greenhouse | checkbox | 1 | 1 | covered |
| Lever | text input | 68 | 68 | covered |
| Lever | native select | 20 | 1 | partial (19 placeholder-policy non-fills) |
| Lever | radio group | 24 | 24 | covered |
| Lever | checkbox group | 7 | 7 | partial (fills persisted; 2 named read-back exceptions — `pronouns`) |
| Lever | checkbox | 7 | 7 | covered |
| Lever | file input | 6 | 6 | covered |

Partial widget coverage is stated as partial wherever it is summarized — the
Greenhouse custom-select class is not "coverage" in any aggregate sense: it is 75
fields whose live behavior is unverified, and the Lever native-select class is
1-of-20 filled under the current value policy.

## The coverage gate

Pattern from the SmartRecruiters verdict pack, strengthened and scoped by the
2026-10-23 corrections: a form's claim stands only when the form carries full
provenance (source URL, capture timestamp, capture method) and a pinned drive
expectation, **and** a reconciliation covering exactly its mapped-not-filled
fields (each with status, widget class, and reason; custom-select entries must
carry the unverified-against-live label), **and** a widget class for every mapped
field; the recorded coverage block must equal the sums of the per-form pins, the
recorded per-form claims must equal the gate's computed verdicts, and the
recorded widget-class tallies must equal the tallies computed from the pins. The
blanket `claimable` flag must not exist anywhere in the record. Fail-first
evidence, recorded before the pin was relied on (summarized in the PR body):

1. **Headline tamper** — the coverage block inflated by 1 (`questionsMapped` 272)
   with the pins untouched: the gate test went **red** (1 fail / 1 pass in the gate
   test pair, suite exit 1).
2. **Pin tamper** — one form's pinned `mapped` inflated by 1 with the coverage block
   inflated to match (internally consistent): the affected form's drive test went
   **red** on re-drive — the pin must match the machinery, not just itself.
3. **Scoped-claim tampers** (corrections round) — each is a gate unit case: a
   reconciliation entry removed → that form's claim breaks; the
   unverified-against-live label dropped from a custom-select entry → the claim
   breaks; a widget-class tally inflated → consistency breaks; the blanket
   `claimable` flag re-added → consistency breaks.

The gate also unit-tests its own verdicts: no provenance → that form not
claimable; no pin → not claimable; reconciliation gap → not claimable; empty set →
no claims.

## Failures and limits recorded

- **Read-only safety test isolation (corrections round, fail-first recorded):** run
  standalone (`node --test --test-name-pattern="read-only"`) on the pre-correction
  code, the read-only proof **failed spuriously** — 1 test, 0 pass / 1 fail: no
  drive test had run in that process, so the command log was empty and the
  exact-set assertion failed on `[]` vs the five read/fill command types. The test
  now establishes its own minimal state when no drive has run in-process (it drives
  the smallest captured form — Prolific — through the same runner, then judges the
  logs that drive produced); standalone it passes (1/1, 2026-10-23), and in the
  full suite it judges the full run's logs exactly as before. The assertions
  themselves are unchanged, including the messages that name the offending
  requests/commands verbatim.
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
