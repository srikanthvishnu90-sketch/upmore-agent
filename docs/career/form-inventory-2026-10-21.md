# Pre-drive form inventory — Lane G record (2026-10-21)

Owner ruling 2026-10-21 13:56 CDT (structuring audit gap 5): before a batch
is approved, each posting's form is opened in SCAN-ONLY mode (never filled,
never submitted) and returns a structured question inventory joined against
the user's facts — so an approval card states coverage computed, not hoped.

Branch `muse/2026-10-21-form-inventory` off `cea914fe` (v248). Files:
`packages/domain/171-career-form-inventory.js` (new),
`tests/career-form-inventory.test.cjs` (new, 14/14),
`form-inventory/` (scan driver, hand-check, run records, card artifact),
this doc, regenerated `docs/depth/MUTATION-COVERAGE.md` (171 registered in
Gaps — the honest class; no planted-defect packet yet), BUILD-STATUS claim.
No changes to 149/150/155. No deploys, no submits.

## Module 171 contract

`inventoryFromSnapshot(snapshot)` accepts the two shapes the existing
drive produces:

- **RAW** — module 150's discover output (raw DOM fields). Classification
  reuses 150's own `classifyFields`, so the inventory can never drift from
  the drive's classification. Records carry control types (binding wins
  only for structural cases — groups, native select, file, name pair —
  because 150's `bindingFor` collapses plain inputs to `"text"` by design;
  otherwise the raw element's tag/inputType is the finer truth) and
  select/radio option texts.
- **DEFS** — what the worker board service's `form()` returns over the
  wire. The wire carries no control type and no options; records say
  `control: "unknown"`, `control_source: "defs_snapshot"`, `options: null`.
  Never invented.

Record: `{ field_id, label, control, control_source, required, options,
question_kind, source_kind, profile_key, question_key }`.
Question kinds: identity / education / experience / eeo / essay / unknown,
projected from 149 kinds + keys (documented in the module header).
Attestation and anything unrecognized stay **unknown** — never
force-classified.

`coverageFor(inventory, factSet)` evaluates module 149's OWN fill decision
with no board (149's `profileValue` runs the standard-key rule; screening
answers require `confirmed === true`; free text requires a confirmed
draft; EEO is covered by the user's choice or the decline default;
attestation requires an explicit per-field attestation; unknown is never
covered). Verdict: `{ covered, vacuous, stops: [required uncovered, with
149's reason codes], optional_uncovered, covered_fields, reader_mode }`.
**`vacuous`** is set when a form exposes zero required questions — the
application form may never have been reached (149's EMPTY_FORM discipline
mirrored); a vacuous "covered" is flagged on the verdict AND on the card
line, never read as a pass.

"Covered" means exactly: no required question lacks a trusted fact — the
precondition 149 needs to reach the doorstep. It is NOT a promise a drive
succeeds (widgets and readback drift can still stop it, as today's drives
measured).

`batchCoverageLine(items)` renders the owner's card format from verdicts.

## D-007 quarantine discipline

Facts are read only through a reader seam shaped for module 167
(`{ trustedProfile, trustedBank, mode }`, injectable via
`createInventory({ factReader })`). **Module 167 does not exist on this
base** (verified by tree search), so the shipped default is a conservative
stub, and every verdict stamps `reader_mode: "stub-167-absent"`:
bank facts count only when `status === "confirmed"`,
`needs_confirmation !== true`, and not quarantined (`quarantined === true`
or `status === "quarantined"` are excluded and counted on the verdict);
profile answers flagged quarantined are withheld. Guard tests prove a
quarantined fact does NOT cover (both bank and profile shapes) and that an
injected 167-shaped reader is used and stamped.

## Live scans (measured, 2026-10-21 ~14:07–14:15 CDT)

Driver: `form-inventory/scan-driver.cjs` — the production assembly
(executor-config `boardForFor`/`profileFor` over the board service on
:8471), scan-only calls **open / form / answers / close** (the file never
references fill/arm/submit). Runs in `form-inventory/runs/`.

- **Run 1** (gauntlet user `2e8cb31d…`): 6 Greenhouse forms scanned
  (Anthropic 24, AlphaSense 20, Culture Amp 22, Twitch 3, Rocket Lab 29,
  Cloudflare 12 fields). NOTE: at scan time the gauntlet profile resolved
  through production `profileFor` to an answers-only shell
  (`{ answers: {} }` — verified directly), so run 1's verdicts measure
  THAT profile: identity fields correctly stop. Kept in the record as
  measured; superseded for the card by run 2.
- **Run 2** (TEST user `b2625909…`, the TEST-profile lane's build: 20
  confirmed Class-1 facts): 6 Greenhouse forms scanned (Natera 2, Affirm
  19, AlphaSense 20, Rocket Lab 29, Cloudflare 12, Reddit 22 fields).
  With real facts, every identity/education/sponsorship stop from run 1
  disappears; the remaining stops are genuinely uncovered custom
  questions, attestations (empty pre-approval by construction), and
  "how did you hear" fields. Card artifact:
  `form-inventory/card-coverage-2026-10-21.txt` —
  **"Coverage: 1 of 6 fully covered"**, the 1 being Natera, flagged
  **vacuous** (2 optional fields only — its application form was not
  reached; the "covered" is not a pass).
- **No-fill proof:** every scanned posting's post-scan `answers()`
  readback carried **0 non-empty values** (recorded per posting).
- **Lever: NOT SCANNED.** Session creation is refused
  `FAMILY_NOT_DRIVEABLE` (probe record
  `form-inventory/runs/lever-probe-2026-10-21.json`): board-config
  verdicts today are `{ greenhouse: true }` only. Lever scans unblock
  the day O5's Lever enablement lands — the driver takes any family the
  service will vend.
- **Worker flakiness, measured:** 7 of 19 session attempts across both
  runs failed `WORKER_UNREACHABLE` (10–25 s each), interleaved with
  successes — the board service itself stayed up. Failed scans are
  recorded as outcomes, never retried into existence. Same code the
  throughput lane observed once mid-fill; root cause NOT_RUN here
  (worker owner's lane).

## Inventory accuracy — hand-check (one form, field-by-field)

Anthropic, Staff Forward Deployed Engineer
(`job-boards.greenhouse.io/anthropic/jobs/5449229008`), opened by two
independent paths: (A) in-process module 150 → RAW inventory;
(B) board service → DEFS inventory. **Agreement: 24/24 fields** on
(label, required, source kind, profile/question key); both readbacks
0 non-empty. Record: `form-inventory/runs/handcheck-1792610108768.json`.
The raw inventory shows real control types (file for the resume upload,
textarea for "Why Anthropic?") and honest unknowns where the classifier
has no rule (arbitration agreement, AI-policy, interviewed-before) —
required unknowns surface as named stops, as designed.

One classifier finding for the 150 owner (not fixed here — not this
lane's file): Affirm's "Which U.S. State or Canadian Province do you
reside in?" does not bind `state_of_residence` (150's regex expects
"which state do you…"), so it inventories as unknown and stops even
though a state fact exists. The inventory surfaces it faithfully; the
fix belongs to 150's classifier.

## Integration (named, not done here)

1. **Prepare-time wiring (155's owner):** at prepare, per posting —
   open a scan session, `coverageFor(inventoryFromSnapshot(board.form()),
   pack)`, store the verdict on the run record; append
   `batchCoverageLine(items)` to the card built at 155's `batchCard`
   call site (~line 243). Postings whose scan refuses (host gate,
   family verdict, captcha) enter the card as named non-scans, exactly
   as the scan driver records them.
2. **Wire widening (worker owner):** control types + option texts reach
   the card only when the snapshot source carries them; the board
   service's `form()` returns defs only. A `form({ withBindings: true })`
   widening is a worker change — requested, not built here.
3. **Module 167:** when the trusted-fact reader lands, inject it via
   `createInventory({ factReader })`; verdicts then stamp
   `reader_mode: "module-167"` with no call-site change.
4. **Router bundling:** 171 is a domain module like 165/166 — bundle
   registration happens at integration (the scan path runs worker-side,
   where 149/150 already run unbundled).

## Verification

- `node --test tests/career-form-inventory.test.cjs` → **14/14**.
- `node --test tests/mutation-report.test.cjs` → pass after regenerating
  the report (`node scripts/build-mutation-report.cjs`).
- Adjacent suites unchanged: `career-portal-answer-map` shows the same
  6 pass / 2 fail on this branch and on pristine `cea914fe` — the 2 are
  the pre-existing F-007 enforcement failures (the real bank carries
  `application_answer` / `application_text` kinds with no consumer on
  this base). Not this lane's files; not touched.
- Real completions: 0 (unchanged — scans submit nothing by construction).
