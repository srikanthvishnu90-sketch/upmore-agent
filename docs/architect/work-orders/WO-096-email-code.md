# WO-096: the code the employer emails, read from the person's own inbox

## Why
The only real submission ever attempted (Gusto, on Greenhouse) stopped at Greenhouse's emailed security code. The agent
driving the form could not read the person's inbox. The person could. The owner's rule: if the person can do the task,
the agent should be able to, using the person's own information with their consent. Reading the person's own inbox
(with their Google consent, read-only) to get the code the employer just sent them is that kind of task.

## Where a code stopped the flow (trunk before this order)
| Place | What happened | Now |
|---|---|---|
| `scripts/apply.ts`, after the approved click (the worker drive; `approve-first.ts run` runs it) | `email_code_prompt` meant `needs_user/email_code`, or with `--headed --handoff` the person typed the code | `--email-code account\|local-gmail`: the code is read and filled into the page's one code box; nothing is pressed. Headless: `needs_user` with "Filled the code Greenhouse emailed you. Press Submit to finish." With `--handoff`, the person's own press goes under the existing code-window rules and the confirmation is recorded |
| `scripts/apply.ts`, a code box on the form before anything was approved | `needs_user/email_code` | Unchanged, now with a named stop. There is no approved application yet to read mail for |
| `extension/content.js` after the click: Greenhouse's code box on the same form | waited, then `needs_user`: "Finish it yourself on the page" | The service worker reads the code and fills it into the frame that asked; the card says "Filled the code … Press Submit to finish." The person's press is watched for two minutes |
| `extension/background.js readAndFinish`: a submit that moved to a code page | finished as `needs_user` | Reads the code and fills it once per application, never pressed. The page after the person's Submit (or in two minutes) is read |
| `packages/domain/149` (portal driver) | the board's captcha/code at open or review meant `CAPTCHA_HANDOFF` | A board's `emailCode` step at review now gives `EMAIL_CODE_REQUIRED` with a named stop. `runApplyWithEmailCode` reads the code for an approved drive, fills it (`board.fillCode`) and stops at the doorstep `EMAIL_CODE_FILLED`; the person's own Submit is `submitDoorstep`. Captchas are unchanged |
| `extension/content.js` Workday account pages (D-013 b) | the person's own | Unchanged: Trainee never reads, fills or clicks an account page |

## Rules (D-029, binding; WO-096 supersedes WO-084)
1. **Only the code, only to the form.** Never in a table, log, chrome.storage, the card, chat or evidence; the screenshot covers the code box (`maskFields`, `CODE_BOX`; the engine masks every input).
2. **Only the right sender, only fresh mail.** Mail must arrive after the prompt (less 30 s) and within D-021's 15 minutes. The sender must be the ATS's own sender domains, and Gmail must have authenticated them (DKIM or DMARC). D-029's "or the employer's own domain" is deliberately NOT adopted: an employer-domain mail never supplies a code. This is stricter.
3. **Exactly one code, or none.** Two different codes are `ambiguous`; nothing is guessed.
4. **Never a password, never the account.** Only a box whose label names a code is filled; Workday account pages stay the person's (D-013(b)).
5. **The person still presses Submit.** After the fill, nothing is clicked or pressed and no write follows (apply.ts, extension, 149). Headless or cloud runs stop at `needs_user`. A confirmation seen while the run or extension is still watching is recorded as usual.
6. **No grant, no reading.** Without the career grant (or without `gmail.readonly`), nothing is read and the stop names the step.

## What was built
- `supabase/functions/_shared/career_email_code.ts`:
  - `fetchVerificationCode({userId, ats, sinceMs, toleranceMs, maxWaitMs}, deps)` gives typed results: `found`, `not_yet`, `no_google_connection`, `scope_missing` or `ambiguous`.
  - **Senders:** only the system's own domains. Greenhouse: `greenhouse-mail.io`, `greenhouse.io`. Lever: `lever.co`. Ashby: `ashbyhq.com`. Workday: `myworkdayjobs.com`, `myworkday.com`.
  - **Authentication:** Gmail's own Authentication-Results must show DKIM or DMARC pass for that domain (`career_mail.ts authenticated`). A From line alone proves nothing.
  - **Time window:** mail received after the form asked, less a 30-second tolerance, and inside D-021's 15 minutes. Newest first.
  - **Patterns:** one strict pattern per system. Greenhouse: 8 letters and digits after "security code ...:", and a plain word is never a code. Lever and Ashby: 6 digits after "verification code". Workday: 6 to 8 digits after "verification code" or "one-time passcode".
  - **Two different codes:** `ambiguous`. Trainee never guesses between them.
  - **The code itself:** held inside an `EmailCode` that prints as `[emailed code]` (toString, toJSON, Deno and Node inspect). Only `reveal()`, at the page fill, gives the characters.
  - `codeStop(status, ats)` gives the person's next step. Example: "Connect Google so I can read the code Greenhouse emails you, or type the code on the page yourself."
- `career_email_code_poll.ts`: the wait, shared by the worker and the extension. The first look is at once, then 3, 4, 6, 9, 13, 20 and 30-second gaps, about 3 minutes in all.
- `supabase/functions/career-email-code` (`verify_jwt = true`): the person's own session.
  - **The approval law:** the queue row must be theirs, in state `driving` (approved on its card and being sent), under this drive's lease, and claimed within 20 minutes. The posting's system decides which senders are read. `since_ms` is never earlier than the claim, less a minute.
  - **One look per request.** The caller polls.
  - **Response:** `{status, code}` when found, otherwise `{status, stop}`, sent with `no-store`. Nothing is logged.
- `scripts/apply.ts --email-code`:
  - **When it reads:** only after the person's yes (or `--approved`) and after the click (`clickAt`).
  - **What a resend must carry:** every approved answer unchanged. This is the existing `carriesApproved` check.
  - **Records:** the evidence file and the result are passed through `redactCode`. The picture after the code masks every input.
  - **`local-gmail` (a loopback stand-in for Gmail's API):** refused for a real employer (`LOCAL_GMAIL_LOCAL_ONLY`).
- `workers/career-browser/approve-first.ts run`: each claimed (approved) drive runs the engine with `--email-code account`. The person's session, the row id and the lease go in the engine's environment, never on its command line. `run-one` without a session does not read mail.
- `packages/domain/149`:
  - `runApplyWithEmailCode(session, input, readCode)`.
  - The sandbox board's `codeStep: {ats, expect}`, `fillCode`.
  - The code is never an answer, never in the payload or its hash, never in the step log. The router bundles are rebuilt.

## Consent and scope
- **Scope:** `gmail.readonly` on the person's career Google grant (`gmail-oauth start_career`, vault `oauth_google_career_<uid>`). No new scope, no send or modify.
- **No grant:** `no_google_connection`. A grant without `gmail.readonly` gives `scope_missing`. A revoked grant gives `no_google_connection`.
- **When it runs:** only inside a submission the person approved on its card. That is enforced in the function (the row is in state `driving`, under its lease), in the engine (after the yes and the click) and in 149 (`input.approval.approvedByUser`).
- **Mail tracking (`career_mail.ts`):** unchanged. Verification mail is still noise, and no code is stored.
- **D-021:** honoured. Mail older than 15 minutes is never read as a code.

## What the owner must do
1. **Deploy (the owner's step):** deploy `career-email-code` (`supabase functions deploy career-email-code`). Nothing else is new on the server: no migration, no secret. It uses the existing `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` to refresh the grant, as career-proactive does.
2. **Connect Google:** connect Google on your own account in the app (career consent, "read mail"). If it was connected before with only `gmail.send`, connect again so `gmail.readonly` is granted.
3. **The next real Greenhouse application:**
   - In the extension: approve the card. The code is filled for you; you press Submit.
   - On the worker: run `deno run -A workers/career-browser/approve-first.ts run <resume.pdf>`.

   The card or the run line says "Sent; the employer's page confirmed it", or names the next step.

## Tests (written first; on trunk the module did not exist, so every one failed)
- `tests/architect/wo-096-email-code.test.ts`: 19 tests.
  - **Mail:** fake Gmail fixtures of SYNTHETIC mail: Greenhouse, Lever, Ashby and Workday found by their own patterns. An old code is ignored, and so is one older than 15 minutes. A wrong sender, a look-alike domain and unauthenticated mail are ignored. Two codes give `ambiguous`, and the same code twice is one code. No connection and a send-only grant give named stops.
  - **The wait and the client:** the backoff schedule and the 3-minute bound. The real Gmail client: list, then get format=full, the body decoded, and 401, scope and 503 each mapped.
  - **The edge function's approval gate:** signed out, someone else, queued, finished, another lease, a stale claim, another row, and another system's mail. None of them looks in the mailbox.
  - **Redaction:** console lines, errors, evidence, tracker and reply strings are scanned for the code.
  - **Mail tracking:** still noise.
  - **149 end to end:** a Greenhouse-shaped form with a code step, through the real reader. The code is filled, the doorstep is reached, and nothing is submitted for the person. Without approval nothing is read and nothing is sent.
  - **Wiring:** worker args and environment, extension wiring and the card's stop, and the engine's order (read after the yes and the click).
- `tests/career-email-code-portal.test.cjs`: 4 tests. 149 with a stand-in reader: approved, unapproved, not connected, two codes, a code the page refused, and no code step.
- `tests/career-email-code-engine.test.cjs`: 8 tests. The real engine against a local Greenhouse-shaped fixture and a loopback Gmail API. Both code shapes: the new code (not an old one) is filled and nothing more is sent (no click, no write after the fill). With `--handoff` the person's press sends the new code once with the approved answers, and the run records the confirmation. Every file the run wrote, its stdout and its stderr are scanned for the code. A dry run or a "no" reads no mail. No connection, no `--email-code`, two codes and a stranger's code each give a named stop with nothing more sent. `local-gmail` is refused for a real employer.
  - These need the sandboxed Chromium the gate provides (`browser-runtime`). The build container here cannot run a sandboxed Chromium as root, so they ran in CI only.
- Gate pieces run here: architect suite (all green), the bundles (`build-router-core.py --check`, `--career-only --check`, `extension/build.ts --check`), `deno check scripts/apply.ts` and `workers/career-browser/approve-first.ts`, and the non-browser career node tests.

## Demo (the owner can run)
`deno test -A --no-check tests/architect/wo-096-email-code.test.ts`, then `node --test tests/career-email-code-portal.test.cjs`
(and, on a machine that runs Chromium sandboxed, `node --test tests/career-email-code-engine.test.cjs`).

## Out of scope
- **The cloud worker (`workers/career-cloud`, D-022):** it runs without the person's session. Reading their mail from there needs its own service path and the owner's word.
- **Split one-character code boxes and pages with two code boxes:** these stay the person's.
- **A code box on the form before anything was approved:** this stays the person's, with a named stop.
- **Magic links:** not handled; codes only.
- **Size:** about 1,000 lines with tests.
