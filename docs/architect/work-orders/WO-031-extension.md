# WO-031: Extension-assisted apply (Chrome MV3, v1)

Branch `wo/031-extension`. Migration timestamp `20261021000000`.

**Target (owner, verbatim):** "Extension-assisted apply: 50+ reviewed applications per 30-minute user session at 90%+ field
accuracy on Greenhouse/Lever/Ashby and 70%+ on Workday, with zero wrong-answer submissions. The user reviews each card and
taps approve; the extension fills and submits in under 10 seconds per application."

**Where it stands (details below):** the extension works end to end on the captured forms, offline. Field accuracy is
**not** at 90% on every family: on the captured Lever forms it is 97.3% precision / 94.7% coverage, Ashby 93.8% / 92.4%,
Greenhouse 94.9% / 41.1% (94.9% without its react-select widgets, which cannot be filled from a capture with its scripts
removed). Workday accuracy is NOT_RUN (no captured Workday form exists in the repo). The live rate is NOT_RUN.

## What

`extension/` is a Chrome Manifest V3 extension, loaded unpacked (not in the Chrome Web Store; `extension/README.md`).

| Part | Files |
|---|---|
| Content script: recognizes Greenhouse (job-boards, boards, EU, embedded `/embed/job_app` frame), Lever, Ashby; reads every field; plans; fills; builds the card; re-checks and clicks the site's own Submit after the approval | `extension/content.js` |
| Review card (side panel; one Approve tap; queue; sign-in; resume; Proof view; clear proof) | `extension/panel.html`, `panel.js`, `panel.css` |
| Service worker: session, the person's RPCs, cards per tab, approval binding, record, evidence, queue | `extension/background.js`, `config.js`, `manifest.json` |
| Pure decisions (portal, posting key, plan, payload, approval hash, change detection, blockers, card text, evidence) | `extension/src/apply_core.ts` |
| DOM hands (read, fill, read back, find Submit, observe outcome, mask) | `extension/src/dom.ts` |
| The one bundle (`globalThis.TraineeCore`), built from the shared sources, checked in, `--check` for freshness | `extension/src/core.ts`, `extension/build.ts`, `extension/lib/trainee-core.js` (generated) |
| Record: `career_apply_extension_begin_own` | `supabase/migrations/20261021000000_career_apply_extension.sql` |

### No forked logic

The extension imports, through the bundle, the apply stack's own modules (D-014): `planBatch`, `classifyField`,
`classifyOutcome`, `fileAlternative` (`_shared/career_apply.ts`), `mapQuestion`, `answerKey`, `NEVER_BY_TEXT`
(`_shared/question_map.ts`, with `fact_schema.ts` and `answer_options.ts`), `hashApplyPayload` (`_shared/career_apply_store.ts`).
To make them importable in a page without copying, three pieces moved out of Node/Deno-only files, unchanged, and the old
places import them back:

- `fnDetectChallenge`, `fnCaptchaTech`, `fnDiscoverFields` from `scripts/career/portal-browser-helper.cjs` to
  `scripts/career/page-functions.cjs`;
- `bind` from `scripts/apply.ts` to `scripts/career/form-bind.ts` (`bindFields`);
- `factsWithTextAnswers`, `questionsToStore`, `jwtRole` from `workers/career-browser/approve-first.ts` to
  `workers/career-browser/ask-once.ts` (re-exported by approve-first).

`deno run -A extension/build.ts --check` fails when the bundle is not what the sources build (WO-031/1 runs it; WO-031/1
also checks none of the hand-written scripts defines a planner, map, hash or reader of its own).

### Changes to shared code (both the extension and the desktop engine get them)

Made from the **dev** split's results only (below), each a general rule:

1. Reader (`page-functions.cjs`): a file input labelled only by its button ("Attach") takes its upload group's heading
   (`role=group aria-labelledby`: Greenhouse "Resume/CV") and the group's `aria-required`; a field with no label element
   takes its question heading before a placeholder ("Type your response": Lever cards); a group's heading is never one of
   its own option labels (Ashby radios, Lever pronouns); the heading search goes 7 levels up (was 5). A `type=search` box
   keeps its own name.
2. Binder (`form-bind.ts`): options without distinct values (Ashby radios all read "on") are chosen by their text. Before,
   every Ashby radio answer landed on the first option: on Harvey the sponsorship question filled "Yes, I will require
   Harvey to sponsor my employment" for a person whose answer is No.
3. Planner (`career_apply.ts`): a follow-up question ("If no, please describe...", "If you selected Other...") is never
   answered by a fact, only by an answer the person gave for that wording; the person's own contact facts never answer a
   question about someone else by meaning either ("Phone number of the person referring you" took the person's phone).
   `docs/apply/fill-coverage.md` regenerated: sample A 863 -> 859 required fills, B 710 -> 710 (still above the WO-020
   floors). The 19 fills removed across both samples are all follow-ups or another person's details
   (`If yes, please note your current visa status: No`, `If Yes, please let us know your Okta ID: <the person's email>`);
   about four of them were arguably right ("If you selected Other, where did you hear: Company website").

## How it works

1. **Read.** The content script runs the engine's reader and binder on the page: label, type, options, required.
2. **Plan.** It asks the service worker for the person's answers: `career_apply_answers_own` (what they answered Trainee
   by text: `fact:` keys for every employer, `label:`/`job:` keys for one wording or posting), merged by
   `factsWithTextAnswers` with an optional confirmed-facts file the person imports (session only, the desktop runner's
   format, `confirmed: true` entries only). `planForm` runs `planBatch` twice: with every field optional (all it is sure
   of) and as the form is (what is still required). Identity-number questions never reach the planner. On Workday only the
   basic contact fields are kept.
3. **Fill** only the planned fields, then read each back the way the page renders it. A checkbox the planner answered No
   is left unchecked and shown as "No (left unchecked)".
4. **Card.** Every non-empty field with its source: `trainee` (filled from a confirmed fact, unchanged since), `you` (a
   trusted input event: the person's own typing or click), `page` (set by the page or a script: blocks the tap), `fixed`
   (a read-only field the page set: shown, bound to the approval, does not block). Each field also carries `detail`, what
   the browser sends beyond the visible text (the option value, the checked state, the attached file's
   `sha256:size:type`), and the approval hash covers it. Two fields under the same label are both left to the person
   ("Still needed"). Plus what
   is still required, what only the person types (identity numbers, never filled or kept), the resume file name, the
   page's verification technology, and the destination host. The payload carries a fixed expiry and the account's
   privacy epoch and version; the approval is `hashApplyPayload(payload)`, the same canonical SHA-256 the queue's SQL
   computes (pinned on both sides: WO-031/8 and `career_apply_extension.test.sql` assert the same hash for the same payload).
5. **Ask once.** The required questions left go through `questionsToStore` to `career_apply_questions_put_own` once per
   posting per browser session; Trainee asks them by text; the next form reads the answers back.
6. **Approve (one tap).** The panel sends the hash of the card on screen, only on a trusted click. The service worker
   takes it only if that card is still the ready one (the check and the change are one queued step). The content script
   hashes the attached files' bytes and reads the form again: any changed value, source, option value, checked state or
   file bytes, a new answer, a trusted edit by the person, or a verification check stops it ("Nothing was sent"). It
   covers identity fields, takes the screenshot (`chrome.tabs.captureVisibleTab`), hashes the files and looks once more,
   then records the start (`career_apply_extension_begin_own`: the database recomputes the hash and enforces one per
   posting, one per company per 30 days, the person's daily limit). After the record it looks a last time and clicks the
   site's own Submit in the same task (no await between them). A mismatch there finishes the row as `not_submitted` with
   the reason "stopped before the click", the only kind of row the database lets the same posting be approved again over.
7. **Outcome.** In-place pages (Greenhouse, Ashby) are read by the content script, which waits until the form is gone,
   an error appears that was not on the page before the click, or the page asks for a check or code, up to 30 seconds;
   a page that moves (Lever's thank-you) is read by the service worker. `outcomeAfterClick` (around the engine's
   `classifyOutcome`) decides; nothing after the click is ever `not_submitted`: an unclear end is `unknown_outcome`,
   counted as applied, never sent again. Then the page after the click is photographed (identity fields covered; for
   Lever by the service worker after the load, only while the tab is in front). `career_apply_finish_own` records it
   once (`finish` is idempotent per row) with the evidence: answers (identity values masked, answers over 500 characters
   kept as length and hash), `screenshot_sha256`, `screenshot_after_sha256`, `confirmation_text` (scrubbed of
   identity-shaped numbers), `confirmation_id`, `url_after`, `times` (`card_shown_at`, `approved_at`, `clicked_at`,
   `finished_at`), always under 64 KB (answers reduced to hashes if needed). The pictures and the full proof stay on the
   computer (`chrome.storage.local`) until "Clear proof on this computer" (asks first).
   The card says "Sent and confirmed by the employer" only with the employer's confirmation AND the picture after;
   otherwise "Sent; the employer's answer could not be captured. Check your email for their confirmation." The Proof view
   (a "Proof" button on the card and on each queue item) shows the answers as approved, the approval time and short hash,
   both pictures, the quoted confirmation text and its id, the final URL, and the card, approved, clicked and answer
   times; an unconfirmed one is headed "Not confirmed: <reason>. This is what the page showed."
8. **Queue.** Links pasted, open tabs, or Trainee's matches (the links in the person's own `career_outbox` alert texts,
   row-level security). Only Greenhouse, Lever, Ashby (and Workday) postings are queued; LinkedIn and Indeed never. Each
   opens in one tab, fills and shows its card; the tap submits and the next opens. Time is measured from the card shown to
   the employer's answer.
9. **Sign-in.** "Use my Upmore sign-in" reads the session the person already has in the Upmore app tab (supabase-js's
   `sb-<project>-auth-token`), or "Email me a link" asks Supabase for a magic link (`create_user: false`, back to the app),
   which the person opens; then the app's session is picked up. The session lives only in `chrome.storage.session`
   (memory, cleared when the browser closes); a service-role token is refused. No password, no code is ever asked for.
   The Supabase URL and key come only from `config.js` (never from storage, which a content script can write).
10. **Who may ask what.** Requests that act for the person (status, sign-in, sign-out, resume, facts, fill, approve, the
   queue, proof, clear proof) are taken only from `panel.html` (by the sender URL Chrome sets); reports about a page
   (card, screenshot, begin, clicked, outcome, stopped) only from a content script in a tab. Anything else is refused.

### Permissions (and why)

`host_permissions: <all_urls>` is required by Chrome for `chrome.tabs.captureVisibleTab` (the screenshot evidence; with
only the ATS hosts Chrome refuses: "Either the '<all_urls>' or 'activeTab' permission is required", seen in a spike here),
and lets the service worker reach Supabase and read the app tab's session. The content scripts run only on the ATS hosts.
A Web Store release should move to `optional_host_permissions` with a one-time grant (not built).

## Tests

| Suite | What it proves | Command | Result |
|---|---|---|---|
| `tests/architect/wo-031-extension.test.ts` | bundle fresh and unforked; portal and posting keys; no identity, EEO or unstated attestation filled; partial fills; Workday basic only; follow-up and someone-else rules; binder; payload hash = SQL hash (with `detail`), no identity number; change detection (text and what is sent) and blockers; plain-text card; evidence shape and the 64 KB limit; the wider identity list and long digit strings; two fields under one label; the outcome after the click and the card's confirmed wording; MV3, no password field, no captcha tokens; migration wiring; held-out split | `deno test -A --no-check tests/architect/wo-031-extension.test.ts` | 17/17 VERIFIED |
| `tests/career-extension-browser.test.cjs` (in the gate's career selection) | the unpacked extension in Chromium against all 17 captured forms at their real URLs, local only | `node --test tests/career-extension-browser.test.cjs` (as a non-root user; root needs `UPMORE_CHROMIUM_SANDBOX=off`) | 46/46 VERIFIED in 2 consecutive full runs after the last change (before it: 44/44 in 3 runs, 46/46 in 2); with `CI=true` and no usable browser every test FAILS (44 of 44 at the time, VERIFIED as root), without `CI` they skip |
| `tests/db/career_apply_extension.test.sql` | the record: hash parity, every refusal, owner-only reads, once-only finish, cooldown, daily limit, retry only after "stopped before the click", unknown after 15 minutes | `PGBIN=... bash tests/db/run.sh` (as `tester`) | 24/24 VERIFIED; whole DB suite passes, migration applied twice |

Browser-suite scenarios (each VERIFIED in the runs above):

- Never submits before the person's own tap: nothing reaches the employer while the card waits; a click made by a script
  approves nothing; the trusted tap sends exactly once.
- Exactly the reviewed payload: every typed answer reaches the stand-in employer as reviewed; the resume by name and bytes.
- Zero wrong-answer submissions: a value changed after review (a page script rewrites the email) stops it, nothing
  recorded or sent; a value the page set itself (nobody gave it) blocks the tap, and a forced approval message is refused.
- Same posting twice: refused by the record, nothing sent.
- Verification: a challenge at load stops before anything is filled ("Finish it yourself... Trainee never answers one");
  one that appears after review stops the tap, nothing sent.
- Identity number: never filled; typed by the person; masked in the card, the payload, the record, the local evidence;
  covered while the screenshot is taken; the person's own value goes to the employer as typed.
- Ask once: an unanswered required question is stored once (not again from the same browser session); answered once by
  text (`fact:sponsorship`), it fills the next form (`factId text-answer:...`).
- Queue: 5 postings open, fill, wait for the tap, submit and move on.
- Workday: the notice, only first name, last name, email, phone filled; authorization and sponsorship left to the person.
- Auth: session only in `chrome.storage.session`; service key refused; magic link by email with `create_user: false`.

Also run in the review round (results): all architect tests 201/201; the gate's edge list 123/123; `node --test
tests/trainee-go-live.test.cjs tests/export-coverage.test.cjs tests/no-secrets.test.cjs` 20/20; the whole DB suite; the
apply engine suites below 68/68 (the reader changed: the CI dry-run outcomes of every captured form unchanged). The staged
suites and the full gate were NOT_RUN again in the review round. First round: the staged suites 3/3; the apply engine suites
(`career-apply-engine`, `career-apply-real-forms` (the CI dry run of every captured form, outcomes unchanged),
`career-form-ci-fixtures`, `career-approve-first`, `career-apply-script`, `career-owned-worker-browser`) 68/68; the full
gate as `tester`: every career node test passed (1785 pass, 20 skipped as before) except `no-secrets` (git refuses the
root-owned worktree for another user; passes as root), and the architect, edge and typecheck steps failed only on network
downloads for that user (esbuild, jsr.io, deno.land); as root the architect and edge steps pass; `deno check` of the
edge entry points cannot fetch `deno.land/std` from this machine (local-only).

CI: `.github/workflows/ci.yml` installs Playwright's Chromium (branded Chrome 137+ ignores `--load-extension`); the
suite finds it through `UPMORE_PLAYWRIGHT_PATH` and skips with `EXTENSION_NOT_LOADED` only if no Chromium loads it.

## Measured numbers

### Field accuracy on the captured forms (VERIFIED offline, 2026-10-20)

Command: `EXTENSION_ACCURACY_OUT=accuracy.json node --test tests/career-extension-browser.test.cjs` (as a non-root user).
Persona: `evals/apply/fill-coverage.ts` PERSONA (complete, synthetic), minus EEO (not given) and the resume (attached as a
file), given to the extension as `career_apply_answers_own` rows. Expected key: `tests/fixtures/extension/answer-key.json`,
written by the builder by reading each question as an applicant (the planner's mapping not consulted), with its rules in the
file; expected values computed from the persona by `expectedValue()` in the test. Precision = filled correctly / filled;
coverage = filled correctly / fields the key says should be filled. Held-out: the 2 forms per family with the lowest
sha256(id); the reader and planner changes above were made from dev results only. (The builder saw every form's field list,
held-out included, while exploring before the split was drawn; no change was made for a held-out form.)

| Family | Forms | Precision (all) | Coverage (all) | Dev P / C | Held-out P / C | Coverage without react-select widgets |
|---|---|---|---|---|---|---|
| Greenhouse | 5 | 94.9% (37/39) | 41.1% (37/90) | 92.0% / 39.0% | 100% (14/14) / 45.2% (14/31) | 94.9% (37/39) |
| Lever | 6 | 97.3% (71/73) | 94.7% (71/75) | 98.0% / 94.1% | 95.8% (23/24) / 95.8% (23/24) | 94.7% |
| Ashby | 6 | 93.8% (61/65) | 92.4% (61/66) | 93.9% / 93.9% | 93.8% (15/16) / 88.2% (15/17) | 92.4% |

Before the shared-code changes (same key, same persona, VERIFIED): Greenhouse 86.5% / 35.6%, Lever 100% / 81.3%, Ashby
89.4% / 89.4%; held-out Greenhouse 92.3% / 38.7%, Lever 100% / 79.2%, Ashby 93.8% / 88.2%. The held-out split shows the
changes are not all gains: Lever held-out precision fell (Welo's "What other languages do you speak at Native Level
Fluency?" now has its real label and the planner answers "English"). Ashby held-out coverage had fallen to 82.4% in the
first build (Crusoe's text-message consent radios read their group as "Phone Number"); the review round's reader change
(an element's own `aria-label` / `aria-labelledby` before a label found around it, and never a label that belongs to
another control) gives them their own name again: 88.2%, where it was before the shared-code changes. That reader change
was made for the review's label defect (a TEST page, below), not for a held-out form.

**90% is not reached** on Greenhouse coverage and on Ashby held-out coverage; precision is under 100% on every family.
Failing field kinds:

| Kind | Where | Fix belongs to |
|---|---|---|
| react-select widgets (options load from the employer's script, removed in the capture) | 51 Greenhouse fields | live test; the widget driver (`dom.ts driveWidget`) is unmeasured offline |
| a stated value in a field of another format: "2 weeks" into a date ("MM/DD/YY", Ashby date picker), "2 weeks" into a fellowship start | EOS, OpenAI, Shield AI | planner (WO-020): check the field's format |
| a yes/no fact into a free-text name ("referring team member's name: No") | EOS | planner |
| "other languages" / "preferred last name" / "state" read as the plain fact (English, the preferred first name, "Chicago, IL") | Welo, Harvey, Crusoe | question map |
| in-office or commute screens answered from a general yes ("reside within commuting distance... or open to relocation": checked) | Snowflake | planner screens |
| facts the map does not place: "relatives" (plural), "University or School Attended", "registered ... on any Welocalize project", "native Basque translator", graduation year from a graduation date, "Other" for a source not listed | Airwallex, Harvey, Welo, Lilt, EOS, Anduril, Shield AI | question map / derivations |
| a group read under the wrong heading (Crusoe consent radios inside the phone field; Snowflake's U.S.-person radios under a long statement) | Crusoe, Snowflake | reader |

Every wrong fill is shown on the card as Trainee's answer before the tap; the suite pins these numbers as regression
floors (`FLOOR` in the test), not as the target.

### Speed (VERIFIED offline; live NOT_RUN)

Queue of 5 captured postings (Lever and Ashby), local server: card shown to employer confirmed 0.91 to 1.63 s, average
1.30 to 1.33 s over 3 runs (`queue:` line of the suite; 1.17 s before the review round: the before-click file hash, the
after-click picture and the wait for the form to go add about 0.15 s). Wall clock for all 5 including page loads, fills
and the test person typing the open answers: 12.5 to 12.6 s (about 2.5 s per application). A real person's reading time, real
page loads, real react-select option services and verification checks are not in these numbers: **50 per 30 minutes is
NOT_RUN**.

### Workday

NOT_RUN: there is no captured Workday application HTML in the repo (`packages/career-data/fixtures/gauntlet/forms/workday-like.json`
is a TEST replica description, not a captured form). The extension recognizes Workday hosts, says the notice, and fills
only the basic fields; tested on a TEST Workday-shaped page only (behavior, not accuracy).

### Live

NOT_RUN: no real employer, Upmore or Supabase was contacted. Every host was mapped to a local server.

## Planted defects (each one line; each made a test fail; each reverted)

| # | File | Change | Failing test |
|---|---|---|---|
| 1 | `extension/src/apply_core.ts` | `changedFields` returns `[]` | WO-031/9 (and WO-031/1: stale bundle) |
| 2 | `extension/panel.js` | drop `if (!e.isTrusted) return;` | browser "submit: nothing goes before the person's own tap..."; WO-031/12 (first round; that code check is now behavioural only) |
| 3 | `extension/content.js` | identity mask `if (C.isIdentityField(s))` -> `if (false)` | browser "identity numbers: never filled..." |
| 4 | `extension/background.js` | session `put(S, "auth"` -> `put(L, "auth"` (local storage) | browser auth x3; WO-031/12 (first round) |
| 5 | `extension/src/apply_core.ts` | `blockers` ignores a verification | WO-031/9 |
| 6 | `scripts/career/form-bind.ts` | option values not made distinct | WO-031/7 |
| 7 | `supabase/functions/_shared/career_apply.ts` | `followUp = false` | WO-031/6 |
| 8 | `extension/content.js` | drop the verification check before the click | browser "verification: a challenge... stops" |
| 9 | `supabase/migrations/20261021000000_career_apply_extension.sql` | drop the approval-hash check | DB "an approval of another payload is refused" |
| 10 | `extension/src/apply_core.ts` | `planForm` identity list empty | WO-031/3 |

## Review round (request changes on 0d9863f0), and the owner's proof rule

Each fix has a test that failed with a planted defect and passed after it was reverted (table below). The planner files
(`_shared/career_apply.ts`, `question_map.ts`, `answer_options.ts`) were not touched (WO-042 is editing them).

| # | Review item | Fix | Test |
|---|---|---|---|
| 1 | Race between the last check and the click | After `begin` returns: a synchronous re-read (`stillApproved`: `changedFields` plus the whole payload as text), the challenge check and `button.click()` in one task, no await between. A mismatch finishes the row `not_submitted`, reason "stopped before the click". A trusted edit while submitting aborts (was ignored). | browser "review 1: a page script that rewrites an answer between the record and the click..." (TEST `race` variant rewrites the email 150 ms after the screenshot covers come off, during a 450 ms begin); "review 1: the person's own edit while ... being recorded stops it" (now asserts the edit's own message) |
| 2 | The same posting never reaches the employer twice | SQL: only a `not_submitted` row whose evidence reason is "stopped before the click" may be replaced; the fake employer's database has the same rule. Errors count only if new against the list taken just before the click; the content script waits until the form is gone, a new error, a check or code prompt, or 30 s; an unclear end is `unknown_outcome` (counted as applied). | DB "a failed attempt passed the click: never sent again", "a not_submitted without the before-click reason is never retried"; browser "review 2: a notice already on the page..." (cookie banner + slow thank-you, two rounds, one submission), "review 2: a click the employer answered with an error is never sent again" (TEST `rejects`), "review 2: an employer that never answers" (TEST `silent`); WO-031/17 |
| 3 | A field takes another field's label | Reader (`page-functions.cjs`): never a label whose `for` names another control or that wraps another control (members of the same radio/checkbox group excepted); the element's own `aria-label` / `aria-labelledby` before any label found around it. Two fields under one label: neither filled, "Still needed: X. Two fields on this form share that label, so Trainee left both for you." | browser "review 3" on a TEST labels page (referrer phone, wrapped radios, two "Email" fields); WO-031/16 |
| 4 | Identity masking misses national IDs | `IDENTITY_EXTRA` (SIN, social insurance, national identification, NI number, passport #, driver's license #, tax file number, TFN, Aadhaar, government-issued ID, Personnummer, CPF, CURP, PESEL, NRIC, BSN, DNI, NIE, PPS, ID number, account/routing/card numbers, CVV, password, PIN) next to the planner's `NEVER_BY_TEXT`. Any answer with 8+ digits not from a confirmed fact is masked in the payload, the evidence and both screenshots. | WO-031/15; browser "review 4" (TEST SIN field and a free field holding a 13-digit string: not on the card, in begin, finish or local proof; covered for the pictures) |
| 5 | The hash covers what is shown, not what is sent | Each field's `detail` (option value, checked state, file `sha256:size:type`) is in the payload and the hash; file bytes hashed at review and again right before the record and the click. | WO-031/8 (new parity hash `135758525121...`, same in the DB test), WO-031/9; browser "review 5" (same file name with other bytes; same option text with another value) |
| 6 | Panel-only messages | `PANEL_ONLY` (status, sign-in, sign-out, resume, facts, fill, approve, queue-*, proof, clear-proof) accepted only when the sender URL is `panel.html`; `TAB_ONLY` page reports only from a content script in a tab; anything else refused. Deviation from the review's `!sender.tab`: the panel opened as its own window has a tab, so the URL (set by Chrome) decides. | browser "review 6 and 7" (each request sent from the content-script world is refused; resume and session unchanged) |
| 7 | Pin the Supabase URL and key | `config()` returns `config.js`'s values only. | browser "review 6 and 7" (a content script writes `chrome.storage.local.config` pointing elsewhere; the next calls still reach the project) |
| 8 | Test honesty | Removal of the last check, of the `edited.has` guard and of the fill guard each fail a browser test (below); WO-031/12 keeps only what can be read in code (manifest, CSP, no password field, no captcha token); the rest moved to behavioural browser tests. With `CI=true` a missing Playwright or Chromium FAILS every test (VERIFIED: 44 of 44 fail as root, where Chromium cannot start; without `CI` they skip). | browser "review 8: filling again never writes over what the person typed", "review 8: Trainee's own clicks ... one card per Fill" |
| 8 | The "same posting twice" flake | Root cause: Chrome fires TRUSTED `input`/`change` events when a script calls `click()` on a radio or checkbox. Trainee's own fills were taken for the person's edits, so a refresh was scheduled 350 ms later; when the approval came inside that window and the attempt stopped ("already applied"), the late refresh replaced the "stopped" card with a fresh "ready" one, so the test sometimes saw a ready card where it waited for the refusal. Nothing was sent twice (the record refused it); the card was wrong. The same cause sent half-filled cards when a fill took longer than 350 ms (found by the architect on WO-042, 65b76893). Fix (the same as 65b76893): nothing during Trainee's fill (`busy`) counts as the person's edit, and the refresh timer does nothing while `busy`; a value the person changes meanwhile differs from what Trainee filled and blocks the tap as the page's. Person edits after the click are ignored. | "review 8: Trainee's own clicks ... one card per Fill" (two cards for one Fill with the guards removed) |
| 9 | Read-only fields | Read-only fields the page set are shown ("(set by the employer's page, read-only)"), source `fixed`, bound to the hash, not blocking. | browser "review 9: a read-only field..." |
| 9 | `finish` idempotent | A row id is taken into a `finishing` set before any await; a second report returns at once. | browser "review 9: two reports of the same application finish it once" (two simultaneous outcome reports: one finish call, one proof) |
| 9 | Evidence over 64 KB | Answers over 500 characters kept as length and SHA-256; over 60,000 bytes all answers reduced to hashes; screenshot hashes kept. | WO-031/11 (300 long answers plus a 120,000-character essay: under 64 KB) |
| - | Queue broken after a stopped item; "The page closed; nothing was sent." after Lever's submit | Cause: the content script answered "submit" only after the submit finished; Lever's navigation closed that reply, and the approve call's catch wrote "nothing was sent" over the finished card (and onto the next queue item's card). Fix: the content script answers at once; the catch never writes when a record exists; a "stopped" never lands on a card that is done or past its record, unless it is the content script's own stop before the click. Also `finish` makes the queue item final before the card says done (a flake: the panel briefly showed a done card beside an "open" queue item). | browser "queue: after a posting that stops (already applied), Skip moves on..." (no "unreachable" in the card trail; 3 later postings each sent once); "proof: Lever ... the card never says 'nothing was sent'" |
| P | Proof (owner rule) | Picture after the click (identity fields covered; Lever by the service worker after the load, only while the tab is in front); `screenshot_after_sha256` in the record; the Proof view; "Clear proof on this computer" with a confirm step; "Sent and confirmed" only with the employer's confirmation and the picture after. Evidence keys for WO-042: `times`, `screenshot_sha256`, `screenshot_after_sha256`, `confirmation_text`, `confirmation_id`, `url_after`. | browser "proof: Lever (navigates) and Ashby (in place)..." (both pictures distinct PNGs, both hashes in the record, the after hash is the picture's, the confirmation quoted, every Proof view part rendered); "proof: without the picture after the click..." (another tab brought to the front during a slow thank-you: the card says "Sent; the employer's answer could not be captured...", the Proof heading "Not confirmed: ..."; clear asks first, then clears); WO-031/11, WO-031/17 |

### Planted defects of this round (each made the named test fail; each reverted; VERIFIED)

| # | File | Change | Failing test |
|---|---|---|---|
| 11 | `extension/content.js` | the last look after `begin` removed (`if (false)`) | review 1 race |
| 12 | `extension/content.js` | a trusted edit while submitting ignored | review 1 person's edit |
| 13 | `extension/content.js` | re-Fill without the `edited.has` guard | review 8 never writes over |
| 14 | `extension/content.js` | the `busy` guards (edit and refresh timer) removed | review 8 one card per Fill |
| 15 | migration | retry of any `not_submitted` row | DB "a not_submitted without the before-click reason is never retried" |
| 16 | `tests/fixtures/extension/world.cjs` | the fake database lets failed rows be retried | review 2 error answer never sent again |
| 17 | `apply_core.ts` + `content.js` | no baseline: every error on the page counts | WO-031/17; review 2 banner |
| 18 | `page-functions.cjs` | `foreign()` always false | review 3 |
| 19 | `apply_core.ts` | no ambiguous labels | WO-031/16; review 3 |
| 20 | `apply_core.ts` | `IDENTITY_EXTRA` unused | WO-031/15; review 4 |
| 21 | `content.js` | long digit strings not masked | review 4 |
| 22 | `apply_core.ts` | `detail` out of the payload and of `changedFields` | WO-031/8, WO-031/9; review 5 |
| 23 | `background.js` | panel-only check removed | review 6 and 7 |
| 24 | `background.js` | config read from `chrome.storage.local` | review 6 and 7 |
| 25 | `background.js` | `finish` without the `finishing` set | review 9 finish once |
| 26 | `background.js` | the picture after the click dropped | proof Lever and Ashby |
| 27 | `apply_core.ts` | "confirmed" without the picture after | WO-031/17; proof without the picture |
| 28 | `content.js` + `background.js` | the old approve path: reply after the submit, no pending check, "stopped" may overwrite a done card | proof Lever (trail shows "stopped" after the tap) |
| 29 | `content.js` | read-only fields not read | review 9 read-only |
| 30 | `apply_core.ts` | evidence never reduced | WO-031/11 |

The first round's planted defects 1 to 10 (above) were not re-run in this round.

## Demo (the owner or Muse, tonight)

`extension/README.md`: load unpacked from `chrome://extensions`, sign in on the Upmore app tab, "Use my Upmore sign-in",
choose the resume, open a Greenhouse/Lever/Ashby posting, "Fill this application", read the card, "Approve and submit".
The first real run should be one posting the person genuinely wants, watched, before any queue.

## Not built (and why)

- Live measurement (accuracy, speed, 50 per 30 minutes): needs a real person on real postings; NOT_RUN.
- Workday accuracy: no captured Workday form; NOT_RUN. Workday sign-in and multi-page flows are the person's (D-013 (b)).
- The react-select widget driver is unmeasured (captures have no scripts); Greenhouse coverage depends on it live.
- Multi-page forms: v1 fills the page that is open; a "Next" page is filled by pressing Fill again (the engine's review
  loop is not ported).
- Emailed verification codes after submit: shown as needs_user ("finish it yourself"); no code window.
- Chrome Web Store packaging, optional host permissions. The Supabase project is fixed in `config.js` (no options page,
  by design: nothing in storage can redirect the session).
- Proof is kept per computer only; the account's record holds the pictures' hashes, not the pictures.
- The planner and question-map misses listed above: they belong to WO-020's owner; the extension shows them on the card.
