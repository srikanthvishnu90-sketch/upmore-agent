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
