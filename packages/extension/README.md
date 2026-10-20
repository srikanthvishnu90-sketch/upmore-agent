# Trainee — Assisted Apply extension (spike)

Lane C of the Feature Depth Program v2 (build order #1: extension-assisted
apply). A Manifest V3 Chrome extension that works in the **user's own
browser session**: the user opens a job application, the extension fills
it from the user's Trainee answer bank, **the user reviews and clicks
Submit themselves**, and the extension captures the per-application proof
(screenshot, captured answers, parsed employer confirmation) and reports
it back to Trainee.

This mirrors how Simplify operates openly (autofill + human submit) —
§6.3 posture throughout: no stealth, no captcha handling, no automation
of the submit click, no attestation ever checked by the extension, and no
field ever filled with a guessed value.

## What's here

| Path | What |
|---|---|
| `manifest.json` | MV3 manifest. Greenhouse hosts + a localhost match for the local demo (dev-only; dropped from any production build). |
| `src/fill-engine.js` | The pure fill logic: field classification and confirmation parsing **ported from modules 149/150** (the product's own answer-bank and portal knowledge), answer resolution against the derived bank, verified filling, proof detection. Runs in the page and under node. |
| `src/content-greenhouse.js` | Content script: coverage analysis on load, fill on the user's command, needs-user highlighting, proof capture. **Never fills on load; never clicks submit.** |
| `src/background.js` | Service worker **stub**: screenshots the confirmation tab, files proofs locally. The report call to Trainee is named NOT_WIRED — this build sends nothing anywhere. |
| `src/popup.html/.js/.css` | Popup: "N of M fields answerable from your bank; K need you", the needs-you list with reasons, Fill button, latest proof. |
| `fixtures/answer-bank.alex-testcase.json` | Local fixture bank for the **Alex Testcase TEST persona**, in module 149's `deriveAnswers` output shape. Test data only — no real person's facts ever enter this repo. |
| `fixtures/demo-form.html` | A Greenhouse-shaped static application form (27 fields incl. education block, EEO selects, attestation) + a Greenhouse-style confirmation view. **A test fixture, not an employer page.** |
| `tools/run-fixture-check.cjs` | The scripted end-to-end check (below). |
| `DESIGN.md` | Bank sync contract, Lever/Ashby/Workday porting plan, the <10s fill budget, and the failure/bot-check telemetry shape behind the <2% failure target. |

## Run the check

```
cd packages/extension/tools && npm install   # one-time: jsdom for the check
node packages/extension/tools/run-fixture-check.cjs
```

Latest run (2026-10-20, this tree): **coverage 21 of 27 form fields
answerable from the fixture bank (6 need the user — resume file, cover
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
   coverage appears. Click **Fill from my bank** — banked fields fill,
   the 6 needs-you fields highlight. Complete them, click **Submit
   application** yourself, and the popup then shows "Application proof
   saved".

## Honest distance to the v2 bar

Proven by the spike: the fill/classify/proof shape works end-to-end on a
Greenhouse-shaped form at 100% fixture accuracy, from the product's own
field knowledge, with the human-in-loop intact.

Not yet built (in order): authenticated bank sync (DESIGN.md §2) — the
spike reads a local fixture bank; real-Chromium timing + widget driving
on live-shaped Greenhouse pages (the fixture has no react-select
typeahead; module 150's BUG-207 widget lessons are designed for, not yet
exercised here); the proof-report endpoint; Lever/Ashby/Workday adapters
+ their fixtures; store packaging. The 50-in-30 bar additionally needs
the product-side session flow (queued postings, per-application proof
flowing into the tracker) — the extension is one leg of it by design.
