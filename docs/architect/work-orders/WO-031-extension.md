# WO-031: Extension-assisted apply (Chrome MV3, v1)

Branch `wo/031-extension`. Migration timestamp `20261021000000`.

**Target (owner, verbatim):** "Extension-assisted apply: 50+ reviewed applications per 30-minute user session at 90%+ field
accuracy on Greenhouse/Lever/Ashby and 70%+ on Workday, with zero wrong-answer submissions. The user reviews each card and
taps approve; the extension fills and submits in under 10 seconds per application."

**Where it stands (details below):** the extension works end to end on the captured forms, offline. Field accuracy is
**not** at 90% on every family: on the captured Lever forms it is 97.3% precision / 94.7% coverage, Ashby 93.8% / 90.9%,
Greenhouse 94.9% / 41.1% (94.9% without its react-select widgets, which cannot be filled from a capture with its scripts
removed). Workday accuracy is NOT_RUN (no captured Workday form exists in the repo). The live rate is NOT_RUN.

## What

`extension/` is a Chrome Manifest V3 extension, loaded unpacked (not in the Chrome Web Store; `extension/README.md`).

| Part | Files |
|---|---|
| Content script: recognizes Greenhouse (job-boards, boards, EU, embedded `/embed/job_app` frame), Lever, Ashby; reads every field; plans; fills; builds the card; re-checks and clicks the site's own Submit after the approval | `extension/content.js` |
| Review card (side panel; one Approve tap; queue; sign-in; resume) | `extension/panel.html`, `panel.js`, `panel.css` |
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
   trusted input event: the person's own typing or click), `page` (set by the page or a script: blocks the tap). Plus what
   is still required, what only the person types (identity numbers, never filled or kept), the resume file name, the
   page's verification technology, and the destination host. The payload carries a fixed expiry and the account's
   privacy epoch and version; the approval is `hashApplyPayload(payload)`, the same canonical SHA-256 the queue's SQL
   computes (pinned on both sides: WO-031/8 and `career_apply_extension.test.sql` assert the same hash for the same payload).
5. **Ask once.** The required questions left go through `questionsToStore` to `career_apply_questions_put_own` once per
   posting per browser session; Trainee asks them by text; the next form reads the answers back.
6. **Approve (one tap).** The panel sends the hash of the card on screen, only on a trusted click. The service worker
   takes it only if that card is still the ready one (the check and the change are one queued step). The content script
   reads the form again: any changed value or source, a new answer, or a verification check stops it ("Nothing was
   sent"). It covers identity fields, takes the screenshot (`chrome.tabs.captureVisibleTab`), looks once more, and only
   then records the start (`career_apply_extension_begin_own`: the database recomputes the hash and enforces one per
   posting, one per company per 30 days, the person's daily limit) and clicks the site's own Submit.
7. **Outcome.** In-place pages (Greenhouse, Ashby) are read by the content script; a page that moves (Lever's thank-you)
   by the service worker. `classifyOutcome` (the engine's judge) decides; `career_apply_finish_own` records it with the
   evidence (answers with identity values masked, screenshot SHA-256, confirmation text scrubbed of SSN-shaped numbers,
   times). The screenshot itself and the full record stay on the computer (`chrome.storage.local`).
8. **Queue.** Links pasted, open tabs, or Trainee's matches (the links in the person's own `career_outbox` alert texts,
   row-level security). Only Greenhouse, Lever, Ashby (and Workday) postings are queued; LinkedIn and Indeed never. Each
   opens in one tab, fills and shows its card; the tap submits and the next opens. Time is measured from the card shown to
   the employer's answer.
9. **Sign-in.** "Use my Upmore sign-in" reads the session the person already has in the Upmore app tab (supabase-js's
   `sb-<project>-auth-token`), or "Email me a link" asks Supabase for a magic link (`create_user: false`, back to the app),
   which the person opens; then the app's session is picked up. The session lives only in `chrome.storage.session`
   (memory, cleared when the browser closes); a service-role token is refused. No password, no code is ever asked for.

### Permissions (and why)

`host_permissions: <all_urls>` is required by Chrome for `chrome.tabs.captureVisibleTab` (the screenshot evidence; with
only the ATS hosts Chrome refuses: "Either the '<all_urls>' or 'activeTab' permission is required", seen in a spike here),
and lets the service worker reach Supabase and read the app tab's session. The content scripts run only on the ATS hosts.
A Web Store release should move to `optional_host_permissions` with a one-time grant (not built).

## Tests

| Suite | What it proves | Command | Result |
|---|---|---|---|
| `tests/architect/wo-031-extension.test.ts` | bundle fresh and unforked; portal and posting keys; no identity, EEO or unstated attestation filled; partial fills; Workday basic only; follow-up and someone-else rules; binder; payload hash = SQL hash, no identity number; change detection and blockers; plain-text card; evidence; MV3, session-only token, trusted tap, sender checks, no captcha tokens; migration wiring; held-out split | `deno test -A --no-check tests/architect/wo-031-extension.test.ts` | 14/14 VERIFIED |
| `tests/career-extension-browser.test.cjs` (in the gate's career selection) | the unpacked extension in Chromium against all 17 captured forms at their real URLs, local only | `node --test tests/career-extension-browser.test.cjs` (as a non-root user; root needs `UPMORE_CHROMIUM_SANDBOX=off`) | 30/30 VERIFIED, 12 consecutive full runs clean after the card-queue fix |
| `tests/db/career_apply_extension.test.sql` | the record: hash parity, every refusal, owner-only reads, once-only finish, cooldown, daily limit, retry after a stopped attempt, unknown after 15 minutes | `PGBIN=... bash tests/db/run.sh` (as `tester`) | 22/22 VERIFIED; whole DB suite passes, migration applied twice |

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

Also run (results): all architect tests 198/198; the gate's edge list 123/123; `node --test tests/trainee-go-live.test.cjs
tests/export-coverage.test.cjs tests/no-secrets.test.cjs` 20/20; the staged suites 3/3; the apply engine suites
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
| Ashby | 6 | 93.8% (60/64) | 90.9% (60/66) | 93.9% / 93.9% | 93.3% (14/15) / 82.4% (14/17) | 90.9% |

Before the shared-code changes (same key, same persona, VERIFIED): Greenhouse 86.5% / 35.6%, Lever 100% / 81.3%, Ashby
89.4% / 89.4%; held-out Greenhouse 92.3% / 38.7%, Lever 100% / 79.2%, Ashby 93.8% / 88.2%. The held-out split shows the
changes are not all gains: Ashby held-out coverage fell (Crusoe's text-message consent radios now read their group as
"Phone Number", so the planner no longer answers them) and Lever held-out precision fell (Welo's "What other languages do
you speak at Native Level Fluency?" now has its real label and the planner answers "English").

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

Queue of 5 captured postings (Lever and Ashby), local server: card shown to employer confirmed 0.80 to 1.52 s, average
1.17 s (`queue:` line of the suite; 12 runs between 1.15 and 1.21 s). Wall clock for all 5 including page loads, fills and
the test person typing the open answers: 11.6 to 12.1 s (about 2.4 s per application). A real person's reading time, real
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
| 2 | `extension/panel.js` | drop `if (!e.isTrusted) return;` | browser "submit: nothing goes before the person's own tap..."; WO-031/12 |
| 3 | `extension/content.js` | identity mask `if (C.isIdentityField(s))` -> `if (false)` | browser "identity numbers: never filled..." |
| 4 | `extension/background.js` | session `put(S, "auth"` -> `put(L, "auth"` (local storage) | browser auth x3; WO-031/12 |
| 5 | `extension/src/apply_core.ts` | `blockers` ignores a verification | WO-031/9 |
| 6 | `scripts/career/form-bind.ts` | option values not made distinct | WO-031/7 |
| 7 | `supabase/functions/_shared/career_apply.ts` | `followUp = false` | WO-031/6 |
| 8 | `extension/content.js` | drop the verification check before the click | browser "verification: a challenge... stops" |
| 9 | `supabase/migrations/20261021000000_career_apply_extension.sql` | drop the approval-hash check | DB "an approval of another payload is refused" |
| 10 | `extension/src/apply_core.ts` | `planForm` identity list empty | WO-031/3 |

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
- Chrome Web Store packaging, optional host permissions, an options page for the Supabase project (it is set in
  `config.js` or `chrome.storage.local.config`).
- A "clear what this computer keeps" button for the local evidence (Chrome's "clear extension data" does it today).
- The planner and question-map misses listed above: they belong to WO-020's owner; the extension shows them on the card.
