# Trainee — Assisted Apply extension

Lane C of the Feature Depth Program v2 (build order #1: extension-assisted
apply), plus the saved-answers sync lane (2026-10-20). A Manifest V3
Chrome extension that works in the **user's own browser session**: the
user signs in with their Trainee account, the extension syncs **their
saved answers** from the product, the user opens a job application, the
extension fills it from those answers, **the user reviews and clicks
Submit themselves**, and the extension captures the per-application proof
(screenshot, captured answers, parsed employer confirmation) and reports
it back to Trainee — which records it in the user's tracker as an
employer-record entry.

This mirrors how Simplify operates openly (autofill + human submit) —
§6.3 posture throughout: no stealth, no captcha handling, no automation
of the submit click, no attestation ever checked by the extension, and no
field ever filled with a guessed value.

## What's here

| Path | What |
|---|---|
| `manifest.json` | MV3 manifest. Greenhouse hosts + a localhost match for the local demo (dev-only; dropped from any production build). |
| `src/fill-engine.js` | The pure fill logic: field classification and confirmation parsing **ported from modules 149/150** (the product's own portal knowledge), answer resolution against the saved answers, verified filling, proof detection. Runs in the page and under node. |
| `src/content-greenhouse.js` | Content script: coverage analysis on load, fill on the user's command, needs-user highlighting, proof capture. **Never fills on load; never clicks submit.** Which answers it may use is decided by `src/bank-source.js`. |
| `src/bank-source.js` | The saved-answers source rule (pure): a synced set is usable only while signed in; the demo fixture only on the local demo host while signed out; signed in → never the fixture. |
| `src/config.js` | Sync config: the product's Supabase origin + public anon key (the same public client key the web app ships; the service-role key is never in the extension). |
| `src/sync-client.js` | Popup/background sync client: GoTrue sign-in (password grant; the password is never stored — the refresh token lives in `chrome.storage.local`), saved-answers sync from the `extension-sync` function, and proof reporting with honest `queued_local_only` failure states. |
| `src/background.js` | Service worker: screenshots the confirmation tab, files proofs locally, and reports each proof to the `extension-sync` function's `application-proofs` endpoint under the signed-in user's session (receipts in `traineeProofReports`; unreported proofs retry on sign-in/sync via `trainee:flush-reports`). A report that cannot go out says why — it never pretends. |
| `src/popup.html/.js/.css` | Popup: Trainee sign-in state, the answers source line (yours, synced — or the labeled demo set), "N of M fields answerable from your saved answers; K need you", the needs-you list with reasons, Fill button, latest proof + its report state. |
| Product side (repo root) | `supabase/functions/extension-sync/` + `supabase/functions/_shared/extension_sync.js`: the authenticated function — `GET …/saved-answers` serves the signed-in user the saved-answers map composed product-side from their confirmed profile (module 149 derivation + the module 132 seam); `POST …/application-proofs` re-parses the claimed confirmation server-side and records it as a module 126 tracker record (stage Confirmed) in `public.extension_submission_reports` (migration `20261020010000`, unapplied). Guard suite: `tests/career-extension-sync.test.cjs`. |
| `fixtures/answer-bank.alex-testcase.json` | Local DEMO fixture for the **Alex Testcase TEST persona**, in module 149's `deriveAnswers` output shape. Used only on the local demo host while signed out, and labeled demo everywhere it surfaces. Test data only — no real person's facts ever enter this repo. |
| `fixtures/demo-form.html` | A Greenhouse-shaped static application form (27 fields incl. education block, EEO selects, attestation) + a Greenhouse-style confirmation view. **A test fixture, not an employer page.** |
| `tools/run-fixture-check.cjs` | The scripted end-to-end check (below). |
| `DESIGN.md` | Bank sync contract, Lever/Ashby/Workday porting plan, the <10s fill budget, and the failure/bot-check telemetry shape behind the <2% failure target. |

## Run the check

```
cd packages/extension/tools && npm install   # one-time: jsdom for the check
node packages/extension/tools/run-fixture-check.cjs
```

Latest run (2026-10-20, this tree): **coverage 21 of 28 form fields
answerable from the fixture bank (7 need the user — resume file, cover
letter file, education start year, the 18+ question, one unrecognized
question, the attestation) · accuracy 20/20 banked field-groups read back
exactly (100%) · fill 22–33ms in jsdom across two runs · never-guess invariant held (every
needs-user field byte-untouched) · proof captured with the fixture's
confirmation ID.** jsdom timing is indicative only — see DESIGN.md §5.

## Run the demo in a browser

1. Serve the fixture: `cd packages/extension/fixtures && python3 -m http.server 8000`
2. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** →
   select `packages/extension`.
3. Open `http://localhost:8000/demo-form.html`, click the extension icon:
   signed out, coverage comes from the **labeled demo answers** (the
   Alex Testcase test persona — demo host only). Click **Fill from my
   saved answers** — answerable fields fill, the needs-you fields
   highlight. Complete them, click **Submit application** yourself,
   and the popup then shows "Application proof saved". Signed in
   (popup, Trainee account), the same page fills from **your** synced
   saved answers instead — the fixture is never used while signed in.

## Honest distance to the v2 bar

Proven: the fill/classify/proof shape works end-to-end on a
Greenhouse-shaped form at 100% fixture accuracy, from the product's own
field knowledge, with the human-in-loop intact (Lane C spike, trunk
port, real-Chromium install proof). The **saved-answers sync is BUILT**
(2026-10-20): the `extension-sync` function serves the signed-in user
their own composed saved answers and records employer-confirmation
reports as tracker entries; proven by the guard suite (20/20) and a
real-Chromium sync proof against the real product code behind auth
doubles (sign in as the Maya test persona → her answers fill the form →
her confirmation lands as a Confirmed tracker record with a receipt).

**Not deployed**: the function and migration `20261020010000` await
the owner's deploy word — until then the popup's sign-in reaches the
real product auth but the sync reports, truthfully, that the product
side is not switched on yet. Folding the recorded reports into the
in-chat track store is a named agent-chat follow-up (this lane stores
the fully built tracker record on each report row; agent-chat's write
path owns the in-chat store).

Not yet built (in order): real-Chromium timing + widget driving on
live-shaped Greenhouse pages (the fixture has no react-select
typeahead; module 150's BUG-207 widget lessons are designed for, not
yet exercised here); Lever/Ashby/Workday adapters + their fixtures;
store packaging. The 50-in-30 bar additionally needs the product-side
session flow (queued postings) — the extension is one leg of it by
design. Two module-149 derivation gaps the sync exposed are recorded
in `docs/career/extension-sync-record-2026-10-20.md` (abbreviated
degree text; verbatim end dates).
