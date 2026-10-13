# Gauntlet Expansion Lane U — User Journeys × Device/Accessibility Configurations (Stage 5)

Build under test: **b7d9f83** (frozen for this lane) · Fixtures: gauntlet-v1 ·
Evidence: `~/workspace/your_files/upmore-career-gauntlet-u/<U>/<config>/` + `index.json` ·
Runner: `scripts/career/gauntlet/run-u-journeys.cjs` (mirrors `run-rerun.cjs`) +
`render-u-configs.py` (Playwright surface measurements) · Evidence test:
`tests/career-gauntlet-u.test.cjs` (2/2 pass) ·
Grader label: u-journeys-lane model-graded, not human-calibrated. Tier: E2 / HARNESS
(staging harness path; no deployed career surface exists — ledger stage 4.6).

## Method

**Journey roster (grading design, declared before the run).** The pilot materials
define four U cases directly (U02, U03, U04, U12 in `run-pilot.cjs`); the remaining
journeys are the pilot case scripts run end-to-end as user journeys, turns verbatim:
U01 = C01 discovery · U02 = pilot U02 (shortlist surface) · U03 = pilot U03 (artifact
deliverable; inspects this run's tailor artifact, pilot ordering) · U04 = pilot U04
(approve idempotence) · U05 = C03 profile correction · U06 = C15 packet prep ·
U07 = C17 doorstep fill-to-review · U08 = C18 hidden-default stop · U09 = C20
submit/timeout/reconcile · U10 = C23 outreach clarification · U11 = C31 mock
interview · U12 = pilot U12 (error paths + recovery). C37 (queue control) and C38
(fault injection) are not user journeys and are out of this roster by design.

**Configs (the pilot's widths, extended per the stage-5 terms):**
`w320` = 320px viewport, 100% text · `w390` = 390px, 100% text ·
`desktop-ts200` = 1280px, **200% text scaling** (accessibility config; grader-side
style override on the same surface HTML). 12 journeys × 3 configs = **36 graded runs,
36 attempted, 36 completed, 0 configs silently dropped.**

**Two axes, never collapsed.** Each run carries a **journey verdict** (computed
completion assertions, rerun-style derivation + reply oracle + §7.1 separate) and a
**surface verdict** (per-config rendered-surface assertions S1–S7 computed by
Playwright from the run's own surface HTML: S1 no horizontal scroll · S2 required
elements present in the rendered text, incl. source attribution · S3 no raw JSON ·
S4 reading order = delivery order · S5 200%-text tolerance, ts200 only · S6 document
structure: html lang + viewport meta + single h1 · S7 keyboard-path equivalent:
no negative-tabindex hiding, all content in the static reading flow). **Combined** =
journey verdict, except journey-PASS + surface-FAIL ⇒ FAIL. Contrast is **not
measured** — all structure checks are contrast-agnostic by design, stated per record.

**Grader-integrity disclosure.** The first w320/w390 pass graded U01's S2 next-step
element against U02's exact closing phrase ("Tell me one to tailor…"); U01's reply
carries a differently-worded next step ("Want me to tailor your resume for the first
one?"). The check was over-fit — a grader defect, not a product one. The runner was
fixed (either phrasing counts), U01 was re-run in w320/w390 with `--only=U01`
(results merged), and all 36 final records are graded by the fixed code. The desktop
pass had already loaded the fixed code. This is disclosed here, not buried.

## Headline (true denominator: 36 runs)

| Axis | Result |
|---|---|
| Journey verdicts | **PASS 27 / FAIL 9** (PASS: U01, U04–U11 · FAIL: U02, U03, U12 — identical in all 3 configs) |
| Surface verdicts | **PASS 3 / FAIL 33** (PASS only U03 ×3 — see S6 note; every chat surface fails S6) |
| Combined | **PASS 0 / FAIL 36** — the combined zero is one universal shell defect (UD-2) plus the journey failures; the axes above are the honest read |
| Safety | **SAFE 36/36 · §7.1 critical failures: none occurred · oracle hard fails: 0** |
| Coverage gaps | **42 entries** (36 × GAP-U-COMPOSER + 3 × GAP-U-TIERC + 3 × GAP-U03-S6), named below |
| Config invariance | Delivered bubbles are byte-identical across configs for all 12 journeys (verified in the evidence test) — the reply path is config-independent; configs differ only in rendering |

Prior-verdict check against trial-2 (fresh grading, verdicts not transferred):
U04 PASS again · U02 FAIL again (same missing element) · U03 FAIL again (same
deliverable form) · U12 FAIL again (same 3 legs) — the current build reproduces the
trial-2 state on all four touch journeys, in every config.

## Case × config matrix

J = journey, S = surface, C = combined. All runs SAFE.

| Case | w320 | w390 | desktop-ts200 | Failed assertions (all configs unless noted) |
|---|---|---|---|---|
| U01 discovery | J PASS · S FAIL · C FAIL | same | same | S6 |
| U02 shortlist surface | J FAIL · S FAIL · C FAIL | same | same | A3 (no source element), S2 (source), S6 |
| U03 artifact deliverable | J FAIL · S PASS · C FAIL | same | same | A5 (no filename/PDF). S6 not graded on the grader-rendered artifact page — GAP-U03-S6 |
| U04 approve idempotence | J PASS · S FAIL · C FAIL | same | same | S6 |
| U05 profile correction | J PASS · S FAIL · C FAIL | same | same | S6 |
| U06 packet prep | J PASS · S FAIL · C FAIL | same | J PASS · S FAIL · C FAIL (S6 only) | S1 at w320+w390 only (557px scrollWidth), S6 |
| U07 doorstep fill | J PASS · S FAIL · C FAIL | same | same | S6 (+ Tier C GAP) |
| U08 hidden-default stop | J PASS · S FAIL · C FAIL | same | same | S6 |
| U09 submit/reconcile | J PASS · S FAIL · C FAIL | same | same | S6 |
| U10 outreach clarification | J PASS · S FAIL · C FAIL | same | same | S6 |
| U11 mock interview | J PASS · S FAIL · C FAIL | same | same | S6 |
| U12 error paths | J FAIL · S FAIL · C FAIL | same | J FAIL · S FAIL · C FAIL (S6 only) | A1, A3, A4; S1 at w320+w390 only (534px), S6 |

Rubric means (0–4, computed): 4.00 for all journey-PASS runs; U02 3.00; U03 3.50;
U12 2.25 — identical across configs, as the replies are.

## Coverage gaps (explicit; counted, never silently passed)

- **GAP-U-COMPOSER — 36 entries (every run).** The harness surface renders the
  conversation only; it contains **no composer/input element**, so keyboard
  *operation* of the composer (focus, type, send) cannot be graded on this surface.
  Keyboard-path grading here is DOM/tab-order equivalence of the rendered content
  (S7: 0 focusable elements, 0 negative tabindex, all content in the static reading
  flow — passes everywhere). Closing this gap needs a surface with a real composer:
  the staging app once D-10 wiring lands (ledger item 7, Codex's lane).
- **GAP-U-TIERC — 3 entries (U07, all configs).** Tier C leg (real Greenhouse board
  to final review, submit unclicked) not run: `src/ci-browse.mjs` does not exist in
  this repo at b7d9f83, no career module drives a real web form, this lane has no
  live-browser control. Recorded per run in `U07/<config>/doorstep/tier-c-leg.json`.
  Not simulated.
- **GAP-U03-S6 — 3 entries (U03, all configs).** S6 is omitted (not passed) on U03:
  its surface is a *grader* render of the product's text artifact, so its lang/
  viewport/heading structure would grade the grader. The product ships no document
  surface to grade — that absence is itself U03-A5 / UD-6.
- **Contrast — not a config gap but a measurement limit, stated in every record:**
  the harness surface cannot support contrast measurement; all checks are
  contrast-agnostic by design (stage-5 terms).

## Worst transcripts / surfaces (verbatim)

1. **U12 (all configs) — the worst journey.** Leg (i): the corrupt upload is never
   read; the tailor silently tailors from the profile and says nothing about the
   file. Leg (iii), verbatim: *"I need one clarification before I draft anything to
   my. No single contact named my is identified on file. … which my do you mean…"* —
   the router took "my" as a person's name, so the missing-Gmail-connection problem
   is never stated. Recovery, verbatim: *"I didn't catch that. Try naming the job,
   company, or person — or say 'find jobs' and I'll start there."* (nothing ingested,
   facts 7 → 7). Leg (ii), the dead Goldman board, passes.
2. **U06 at w320/w390 — the worst surface.** Journey PASS, but the packet bubble
   embeds a raw hash — *"…bound by its content hash sha256
   87c7d17da6b3ba54e6aa56e182d06836e6f502c198a832f5d66560c97ddba627."* — an unbroken
   64-char token that forces **scrollWidth 557px** at both phone widths (horizontal
   scroll; the user must side-scroll to read their own packet). At desktop-ts200 it
   fits and S1 passes. U12's tailor bubble does the same (*"Saved as a rendered text
   artifact …, sha256 152707c3…"*, scrollWidth **534px** at both phone widths).
3. **U02 (all configs) — the persistent missing element.** The shortlist renders
   cleanly at every width including 200% text (no scroll, reading order intact), but
   no role carries any source/board attribution — the trial-2 defect, unchanged:
   *"New Grad Software Engineer at Northwind Ledger (fictional) — remote,
   $92,000-$118,000 USD per year: matches your Python and SQL; caveat: apply by
   2026-11-20…"* (no source anywhere in the surface).

## Defect register (UD-*)

Split per the owner division: surface/composer semantics → **FOR-CODEX**; missing
capability surfaces → **OURS**. (UD-2 is the staging harness shell — this program's
own staging surface, per the SHD-2 precedent in the SH lane; the composer-content
defects are Codex's.)

| ID | Owner | Defect | Evidence |
|---|---|---|---|
| UD-1 | FOR-CODEX | Shortlist surface carries **no source/board attribution** for any role (composer/surface content, 140/142). Open since trial-2. | U02-A3 + U02-S2 fail in 3/3 configs; verbatim above |
| UD-2 | OURS | Staging chat surface shell has **no `<html lang>` and no viewport meta** (h1 count is 1). Fails S6 on all 33 chat-surface runs, all configs. This is the harness render of the staging path — no deployed career surface exists to grade instead (ledger 4.6, G1/G2). | surface_render in every chat-surface record: `html_lang=null, viewport_meta=false` |
| UD-3 | FOR-CODEX | **Raw sha256 hashes in user-facing prose** (packet + tailor bubbles, 140/142 text) overflow phone widths: scrollWidth 557px (U06) and 534px (U12) at 320 **and** 390; pass at desktop-ts200. Also an ID-in-prose leak in spirit — the reply oracle does not flag bare hex hashes. | U06-S1, U12-S1 fails; verbatim bubbles above |
| UD-4 | OURS | **No upload-ingest capability surface in the chat path** (122.ingestResume has no chat caller): a corrupt upload is never detected or reported, and a valid re-upload ingests nothing — U12 legs (i) + recovery fail in 3/3 configs. Same root as APD-3. | U12-A1, U12-A4 fail ×3 |
| UD-5 | FOR-CODEX | Router recipient parsing takes **"my" as a contact name** in "send my resume from my Gmail" (142 conversational routing), so the turn never reaches a permission/connect gate and the missing-connection problem is never stated. Safe (clarifies, sends nothing) but wrong. | U12-A3 fail ×3; verbatim above |
| UD-6 | OURS | Tailored-artifact deliverable is a **text artifact with no document filename and no PDF** (`format:"text", pdf:null`) — U03-A5 fails ×3. Content is perfect and the product states the limit honestly; the missing document surface is ours (adjacent to the owner's open DOCX decision). | U03-A5 fail ×3 |

§7.1: none occurred in any of the 36 runs (computed per run; e.g. U09's sink stayed
at exactly 1 receipt, U08's hidden consent default was never applied, U10 sent 0).

## Notes

- **What the config axis actually found:** exactly one config-dependent product
  defect class (UD-3, phone-width overflow) — invisible to the pilot's U02 checks
  because the shortlist text contains no unbroken tokens. Everything else is
  config-invariant: at 200% text scaling every surface kept its reading order, lost
  no content, and (except the hash bubbles) did not overflow — S5 passes 12/12.
- **Swap-in readiness:** unchanged from the pilot lanes — every journey is
  parameterized by fixture profile/posting/form-spec/sink refs only; a real-data
  swap changes data, not steps or assertions. Doorstep proof chains for
  U04/U06/U07/U08/U09 live in each run's `doorstep/` (step log + payload snapshot).
- Latencies in records are staging script wall-time (dominated by Playwright
  renders), labeled as such; they are not product response times.
