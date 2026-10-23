# F1–F2 integration: the real approval card mounts in the dashboard's awaiting-approval slot

Coordinator review 2026-10-23, item 3. Base: `muse/2026-10-22-f1-dashboard` @ `bdeb6f63` (includes the item-4 fields-counter fix). The F1 queue rendered an empty card slot (`data-f1-card-slot` + `TraineeDashboard.mountCards` existed, nothing mounted). This branch mounts the REAL F2 review card into it — no rebuild, no stub. (PR-BODY.md in this tree is the F1 branch's own body, kept as inherited history.)

## What is integrated

- `packages/domain/175-career-approval-ui.js`, `src/career-approval-review.css`, `src/trainee-design-tokens.css` — copied byte-for-byte from branch `muse/2026-10-22-f2-approval-card` head **`eba5f886ca47a63f2868e152968006e0940f5992`** (re-verified unchanged at commit time).
- `src/career-dashboard-f2-mount.js` (new, the only new logic): the host adapter.
  - `reviewInputFromPrepared(row)` maps one `career_apply_prepared` row to the card's canonical input. Verification is derived exactly as 175's own v2 reader derives it — a field is verified iff the prepared field carries its `confirmation_event_id`; a field without one renders UNVERIFIED. Provenance from the record, never assumed.
  - `batchStateFromPrepared(row)` builds the executor's stored batch shape (one application at `awaiting_attestation` under the prepared row's payload hash as the card set hash).
  - `commitPrepared(row, card)` is the production commit seam: 175's own `tapReviewCommit` against that stored state — the mint binds run + the exact payload hash the card showed. Flag stays OFF; approval records the batch approval only, nothing is submitted.
  - `createMountFn(deps)` returns the `mountFn` `TraineeDashboard.mountCards` delegates with; a host may inject its own commit (receives `(set, card, row)` — the exact reviewed partition).
- App wiring: `src/build-app.py` inlines module 175 + the adapter + both stylesheets; the template's `renderCareerDashboard` passes `{ cards: { mountFn } }` when the adapter loaded (slots stay empty rather than showing an invented card if it didn't). Built set committed (`index.html`, `src/upmore-app.html`, `sw.js`); all 10 inline script blocks parse clean.

## Fail-first evidence

- Browser e2e `tests/career-dashboard-f2-integration-browser.test.cjs` (Playwright, sandboxed-Chromium posture printed; `UPMORE_CHROMIUM_SANDBOX=off` on this VM): on the base (adapter absent) — control passes (slot empty without the mount), the two integration assertions FAIL. On this branch: **3/3 pass**, including: approve through the mounted card in a real browser → the commit seam is called exactly once, `approved` = exactly the shown application, and the seam's field list deep-equals the answers rendered in the DOM (name + value read from the card), with verifications `[verified, unverified, verified]` matching the provenance shown; the delegated production seam mints `approvalRef = batch:<runId>:<payload hash>` with approvals keyed to exactly that application.
- Adapter unit `tests/career-dashboard-f2-mount.test.cjs`: **4/4** (verification derivation, stored-batch shape, mint binding + unreviewed-card refusal by name, jsdom mount through `mountCards` with click-through).
- Regressions: `tests/career-dashboard*.test.cjs` (F1 suites incl. the item-4 fields-counter suite) **21/21** on this branch.

## Visual proof

`~/workspace/frontend-fix-proof-2026-10-23/f1/` — `item3-queue-f2-card-mounted.png` (queue with the card in the slot, synthetic fixture: "Test Person" / "Fictional State University" / Northwind Test Labs, `.invalid` URL), `item3-post-approval-through-card.png` (reviewed 1/1, Approved, "Approval recorded for the reviewed set exactly as shown").

Synthetic data only. No merges, no deploy, no submissions, flag OFF.

## Re-sync to the FIXED F2 card — 2026-10-23 (follow-up)

The F2 fix lane landed `4ce494c0cd0d1f82ea17da0786f764319f1cee39` on `muse/2026-10-22-f2-approval-card` (per-application recording-outcome surface + provenance-backed VERIFIED chip + wholly synthetic fixtures). This branch now mounts that card:

- `packages/domain/175-career-approval-ui.js` and `src/career-approval-review.css` replaced byte-for-byte with their `4ce494c0` versions (verified with `cmp` against the commit). `src/trainee-design-tokens.css` was already byte-identical to `4ce494c0` — no change.
- **Adapter adjustment (forced by the new module's interface, one field in one function):** 175 @`4ce494c0` derives VERIFIED from a provenance field on the answer record and ignores a bare `verification` claim. `reviewInputFromPrepared` therefore no longer emits `verification: 'verified'|'unverified'`; it passes the prepared field's provenance through — `{source:'prepared_field', confirmation_event_id, fact_id}` when the field carries a confirmation event, `null` when it doesn't — the same object 175's own prepared-field reader builds. Measured proof the change was forced: with the new module + the old adapter, the browser e2e failed 2/3 (VERIFIED chip gone; seam verification array all-unverified). The one adapter unit assertion on the old output field was migrated to the new contract at equal strength (provenance contents on the adapter output + both verdicts on the built card); the browser e2e's fixture data and assertions are unchanged — nothing deleted, skipped, or loosened.
- Built set rebuilt via `python3 src/build-app.py` (`index.html`, `src/upmore-app.html`, `sw.js`); 10/10 inline script blocks parse in each HTML file; the new module is present in the built output.
- Counts after the re-sync: browser e2e **3/3**, F1 dashboard + adapter suites **21/21** (baseline on the pre-sync head was also 3/3 + 21/21).
- Screenshot `item3-queue-f2-card-mounted.png` refreshed (same Chromium run shape, `UPMORE_CHROMIUM_SANDBOX=off` on this VM): the mounted FIXED card shows "Answers verified: 2/3", VERIFIED chips on the two event-carrying answers, and the event-less school answer loud UNVERIFIED.

## Rebase onto f1@ce2f10c6 — 2026-10-23 (coordinator-ordered refresh)

The integration branch previously sat on F1 @ `bdeb6f63` (item 4 only), so the integrated surface lacked the item-6 feed dedup. The branch is now **rebased onto `muse/2026-10-22-f1-dashboard` @ `ce2f10c6b62553bd1eefe268616474a3bc2d27d0`** (items 4 + 6), carrying BOTH the feed dedup and the fixed F2 module:

- Base chain: `879fb1b4` (F1) → `bdeb6f63` (item 4) → `ce2f10c6` (item 6), then the two integration commits replayed (integration + re-sync to the fixed card), then a rebuild commit.
- Conflicts during the rebase were confined to the built files (`index.html`, `src/upmore-app.html`, `sw.js`) and were resolved by REBUILDING with `python3 src/build-app.py` from the merged template/sources — never hand-merged. Feed-dedup logic (feedView) and the integration additions touch disjoint code and merged cleanly.
- Module vendored from **F2 @ `4ce494c0cd0d1f82ea17da0786f764319f1cee39`**: `packages/domain/175-career-approval-ui.js` re-verified byte-for-byte (`cmp`) against that commit AFTER the rebase; the adapter still passes per-field provenance (`{source:'prepared_field', confirmation_event_id, fact_id}` or `null`), never a bare verification claim. Built output contains the fixed module (`recordCommitOutcome` present); 10/10 inline script blocks parse in each built HTML file.
- E2E re-run on the rebased branch (`UPMORE_CHROMIUM_SANDBOX=off` posture on this VM): integration browser e2e **3/3** (slot empty control · slot mounts the real card showing the prepared answers · approve through the card → commit seam receives exactly the shown set, bound to the row's payload hash, `approvalRef = batch:<runId>:<payload hash>`). Unit suites **26/26, 0 skipped**: career-dashboard 9/9 · -dom 5/5 · -fields-counter 3/3 · -feed-dedup 5/5 · -f2-mount (adapter) 4/4. No test deleted, skipped, or loosened.
- Screenshots refreshed in `~/workspace/frontend-fix-proof-2026-10-23/f1/`: `item3-queue-f2-card-mounted.png` (fixed card mounted: "Answers verified: 2/3", event-less school answer loud UNVERIFIED, "Submit when complete: OFF") and `item3-post-approval-through-card.png` ("Approval recorded for the reviewed set exactly as shown"). NEW: `item3-feed-single-confirmation.png` — the integrated build's feed for a confirmed row carries exactly ONE "Confirmed by the employer" line, at the email timestamp (2026-10-23T08:12:00.000Z), alongside its Queued/Applying events — the item-6 dedup survives the integration.

Synthetic data only. No merges into trunk/main, no deploy, no submissions, flag OFF.
