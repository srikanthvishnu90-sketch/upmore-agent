# Audit: the application pipeline (chat → queue → extension → approve → submit → record → receipt)

Trunk @ 53db2d55, read only. Evidence: 6 VERIFIED (throwaway repros under `scratchpad/audit-repro/`), 4 READ.

**Summary (5 lines)**
1. The approval-hash binding holds. I found no path where the submitted payload differs from the approved one, except a Workday review card that can bind an empty or partial reading (F9). Double-send is well guarded.
2. The worst failures go the other way: states that lie about *not* sending, or that never end. These are a "Sent" card when the browser refused the submit (F1), and rows stuck in `driving` forever because the extension has no durable finish and nothing sweeps its rows (F2).
3. A rejected or interrupted attempt is terminal. The person's retry is then refused with "You already applied to this posting" (F2, F4). `needs_user` never leaves `needs_user`, so a completed application drops out of tracking and out of email matching (F4).
4. The plumbing fights the design. Every chat turn bumps the account version, which makes every open card stale (F3). The session is a copy of the web app's rotating refresh token (F5). The chat queue is marked `taken` into session-only browser storage and is lost on a restart (F6).
5. Partial depth: on `myworkdaysite.com` and `myworkday.com` the company is the data centre `wd3`, so one application blocks every employer on that host for 30 days (F7). The cap and company cooldown are checked only after the person reviewed and approved (F8). Most failures are BACKEND state-machine gaps, not missing features.

Repro artifacts (all throwaway, scratchpad only): `audit-repro/outcomes.ts` (deno), `audit-repro/native.cjs` (Chromium),
`audit-repro/wants.ts` (deno), `audit-repro/apply_repro.sql` + `run_repro.sh` (trunk's migrations on a local Postgres 16, as
`tests/db/run.sh` does; output in `audit-repro/apply_repro.out`), `audit-repro/emailcode.cjs` (the 17 captured forms in
`tests/fixtures/forms-ci`).

---

## F1. "Sent" when the page never sent it, and the posting is then blocked forever
- **Symptom:** The person approves. The browser's own validation blocks the submit, with a bubble on a field, nothing in the DOM and no navigation. Thirty seconds later the card says **"Sent; the employer's answer could not be captured. Check your email for their confirmation."** The row is `unknown_outcome`. It counts toward today's cap and blocks that company for 30 days. If the person fixes the field and approves again, they get "You already applied to this posting." The later text receipt contradicts the card: "Trainee cannot tell whether it went through".
- **Why-chain:**
  1. Why "Sent"? `cardOutcome` (`extension/src/apply_core.ts:474-475`) prints "Sent; …" for `unknown_outcome`.
  2. Why unknown? `outcomeAfterClick` (`apply_core.ts:336-339`) maps both cases to `unknown_outcome`: a timeout with the form still present, and any `not_submitted` after the click. It ignores `required_empty_after`, which `observe` computes from `validity.valid` (`extension/src/dom.ts:417`).
  3. Why does the timeout fire? The wait in `content.js:545-556` ends early only on these: the form gone, a new DOM error (`dom.ts:338-341` reads `[role=alert],.error,.validation-error,[aria-invalid=true]`), a captcha or an email code. Native constraint validation produces none of them.
  4. Why was an invalid form clicked? Nothing before the click checks `form.checkValidity()`. The pre-click check (`content.js:485-489, 530-535`) compares only the snapshot to the reviewed text. Blockers (`apply_core.ts:315-323`) cover only empty *required* fields the reader saw. They miss `type=url`, `pattern`, `minlength` and a hidden required input.
  5. Root: the design rule "after a click nothing is ever not_submitted" (WO-031 review, pinned by `tests/architect/wo-031-extension.test.ts:224-235`) was applied without one signal: whether the browser actually dispatched `submit`. "We clicked" is treated as "it may have been sent", and the person is told "Sent".
- **Class:** BOTH. The DEPTH part is that the outcome detection ignores the browser's own validity. The BACKEND part is the terminal state plus `unique(user_id, job_id)`.
- **Severity:** Likelihood med-high. Any field the page validates natively, a disabled or no-op button, or a page slower than 30 s all reach this path. Harm: a wrong answer to the person, plus a lost application (the posting is permanently refused, the company blocked for 30 days).
- **Evidence:** VERIFIED.
  - `audit-repro/native.cjs` (Chromium): an `<input type=url>` holding `linkedin.com/in/test-person` takes `button.click()` and returns `{"submitted":false,"errs":0,"formPresent":true,"invalid":["urls[LinkedIn]:Please enter a URL."],"navigated":false}`.
  - `audit-repro/outcomes.ts` maps that observation to `unknown_outcome`, with the card "Sent; the employer's answer could not be captured…".
  - `apply_repro.sql` S2 and S4: any non-`stopped before the click` row refuses a retry with `duplicate_job`.
- **Fix (smallest root cause):**
  - In `content.js` `submit()`, before `begin`: `const f = button.form; if (f && !f.checkValidity()) return stop(<field labels + validationMessage>)`, with nothing recorded.
  - Around the click, add a one-shot `submit` listener on `button.form`. If no `submit` event fired, no navigation started, and `button.form` exists, finish as `not_submitted` with reason `"the browser refused the submit: <validationMessage>"`. That case is provably not sent. Keep `unknown_outcome` only when `submit` fired.
  - Change `cardOutcome` for `unknown_outcome` to the receipt's own wording ("Trainee can't tell whether it went through…"), never "Sent".
  - Files: `extension/content.js`, `extension/src/apply_core.ts`, `extension/lib/trainee-core.js` (build).
  - Fail-first test: in `tests/career-extension-browser.test.cjs`, a fixture form with `type=url` filled from a scheme-less fact. Approve. Expect `result` `not_submitted`, a card that never matches `/^Sent/`, and a second approve after the fix that is not `/already applied/`.
- **Brutal-list rows:** apply-loop BL-043–054 and board-family-proof BL-712/880/919/926/953, by cluster. A false `unknown_outcome` also pollutes the D-022 hand-submission gate's denominator.

## F2. Applications stuck in `driving` forever; a retry then says "You already applied"
- **Symptom:** In each of these cases the card says one thing and the row says another:
  - The finish RPC fails three times (offline, token expired; see F5). The card says "Sent … Not recorded yet; kept on this computer." (`extension/panel.js:54`). Nothing ever records it.
  - The begin RPC succeeded but its response was lost. The card says "Trainee could not record this application, so it was not sent." On retry: "You already applied to this posting."
  - The person closes the tab or browser between begin and finish, or the service worker restarts there.

  In all three cases the server row stays `driving` indefinitely:
  - no receipt (`driving` is not in `FINAL_STATES`, `_shared/career_apply_receipts.ts:5-12`);
  - not in tracking (`WENT`, `_shared/career_mail_store.ts:26`);
  - the employer's confirmation email is never matched (`OPEN`, `_shared/career_apply_confirm.ts:24`);
  - it still counts toward the cap and the 30-day cooldown.
- **Why-chain:**
  1. Why still `driving`? Only a claim sweeps a `driving` row: `career_apply_claim_own` (`20261021080000_career_apply_cloud.sql:79-96`) or the service `career_apply_sweep`. The extension never calls a claim (`background.js` has no such RPC). The desktop runner is the only caller of the own claim (`workers/career-browser/approve-first.ts:218`).
  2. Why is the finish lost? `finish()` retries 3× over about 3 s (`background.js:326-334`). It keeps the result only in `chrome.storage.local` evidence (`:337-341`), with no outbox and no retry at start-up. There is no `chrome.runtime.onStartup`, `tabs.onRemoved` or `alarms` anywhere in `background.js`. The lease lives in `chrome.storage.session` (`:9, :610-614`), which Chrome clears when the browser closes.
  3. Why is a retry refused? Begin deletes only `not_submitted` rows whose reason is "stopped before the click" (`20261021120000_career_apply_form_answers.sql:16-17`). Then `career_apply_enqueue` raises `duplicate_job` (`20261020050000_career_apply_daily_limit.sql:24`) on `unique(user_id, job_id)` (`20261020000001_career_apply_jobs.sql:9`). Begin is not idempotent: it does not return the existing row for the same approval hash.
  4. Why "You already applied"? `background.js:619` maps `duplicate_job` to that sentence without reading the row's state.
  5. Root: the extension is a client with a server lease, but has none of a worker's lifecycle (durable outbox, start-up recovery, sweep). Begin has no idempotency key.
- **Class:** BACKEND.
- **Severity:** Likelihood med. F5 makes the expired-token path common for anyone with the web app open. Harm: lost data (the application is invisible to tracking, receipts and email confirmation), plus a wrong answer ("already applied" for something never clicked).
- **Evidence:** VERIFIED for the database half. `apply_repro.sql` S4:
  - a second begin of the same approval returns `ERROR duplicate_job`;
  - the row is still `driving` with `claimed_at` 3 days old and only the extension running.

  READ for the client half (`background.js:326-341`, no lifecycle listeners).
- **Fix:**
  - (a) Make begin idempotent on `(user_id, job_id, approval_hash)`. If a `driving` row with the same `approval_hash` and `evidence = '{}'` exists, return its id and lease. File: new migration redefining `career_apply_extension_begin_own`.
  - (b) Keep unfinished finishes in `chrome.storage.local` (`pending_finish`), and replay them from `onStartup` and the next `context` message.
  - (c) Sweep the person's own stale `driving` rows inside begin, or in a small `career_apply_sweep_own()` the extension calls on `context`. The sweep already exists in `claim_own`; reuse it.
  - (d) Map `duplicate_job` using the row's state: "You already applied" only for `confirmed`/`submitted_unconfirmed`; otherwise say what happened.
  - Fail-first tests:
    - SQL: begin twice with the same approval returns the same id (today it raises `duplicate_job`);
    - browser: kill the world's finish endpoint for one run, restart the context, and expect `world.state.finishes` to get the outcome.
- **Brutal-list rows:** tracking BL-274–309, 498–516, 607, 608, 633, 687, 695, 883, and per-thread-state BL-737/860/923, by cluster ("where do I stand" misses applications). apply-dedupe BL-729.

## F3. Every chat message makes every open card stale: "Your account changed since this card was made"
- **Symptom:** A card is open in the extension. The person sends Trainee any message, on any channel. One case is answering the "answer Trainee once by text" question the card itself suggests (`apply_core.ts:373`). They then tap Approve and see "Your account changed since this card was made; review it again. Nothing was sent." A card older than 2 h shows the same sentence, though nothing changed.
- **Why-chain:**
  1. Why refused? Begin → `career_apply_enqueue` → `career_apply_current` requires the payload's `account_version` to equal the account's (`20261020000001_career_apply_jobs.sql:32-40`).
  2. Why did the version move? The latest `career_host_commit` writes `version = p_account_version + 1` on **every** committed turn, empty patch included (`20261021050000_career_brief_digest.sql:133`). `agent-chat/handler-career.ts:516` commits every turn.
  3. Why does the card carry it? `content.js:156` puts `ctx.account.version` into the payload and so into the approval hash.
  4. Why the wrong sentence? `background.js:620` maps any `/stale|current/` error, including the 2-hour `expires_at` (`content.js:234`), to "Your account changed".
  5. Root: one counter means two things. "The person's facts or privacy changed" is a reason to re-review. "A chat turn was saved" is not. The extension binds to the noisier one.
- **Class:** BACKEND.
- **Severity:** Likelihood high in a real session (chat and extension side by side is the designed flow). Harm: ugly and wasted work. The person must press Fill again; nothing wrong is sent.
- **Evidence:** VERIFIED. `apply_repro.sql` S1:
  - version 5; one real `career_host_commit` with an empty patch; version 6;
  - begin of the card made at 5 returns `ERROR invalid or stale application approval`.

  S6: a card 1 min past expiry raises the same error, and the extension says "account changed".
- **Fix:**
  - Bump `version` in `career_host_commit` only when `p_patch` is non-empty (pause, location, stated facts, erase). Files: a new migration redefining `career_host_commit` (plus the task and batch variants).
  - Have `career_apply_extension_begin_own` raise distinct `expired` and `paused` messages, and map them in `background.js:618-621`.
  - Fail-first SQL test: `career_host_commit` with `'{}'` patch leaves `version` unchanged, and a card made before it still begins.
- **Brutal-list rows:** approval-mechanics BL-340–348 (approve-by-card works in tests but breaks under concurrent chat). apply-loop BL-043–054.

## F4. A rejected or interrupted attempt is terminal: no way to finish it through Trainee, and tracking loses it
- **Symptom:**
  - **(a)** The employer's form shows "Phone is invalid" after the click. The card says "Not confirmed: Phone is invalid." Fill is disabled on that page ("This application was already sent from this page", `content.js:199`). After a reload, Approve says "You already applied to this posting."
  - **(b)** A reCAPTCHA challenge at Submit. The card says "Sent, and the page now asks you for something". The person solves it and the application really goes. Trainee keeps `needs_user` forever: it is not in tracking, the confirmation email is never matched, and the text receipt says "not finished".
- **Why-chain:**
  1. (a) `failed` is a final row. Begin deletes only "stopped before the click" rows (`20261021120000_career_apply_form_answers.sql:16-17`), so `duplicate_job` follows (`20261020050000_career_apply_daily_limit.sql:24`).
  2. (b) `career_apply_finish` allows a transition only from `driving` (`20261020000001_career_apply_jobs.sql:83`). No RPC moves `needs_user` on. The content script stops observing after the first captcha observation (`content.js:551`).
  3. Why does it fall out of tracking? `WENT` and `OPEN` exclude `needs_user` (`career_mail_store.ts:26`, `career_apply_confirm.ts:24`), but `counted` includes it for cooldown and cap (`20261020050000…:17`). So the same row counts as applied for limits and as not applied for tracking.
  4. Why "Sent" for (b)? `cardOutcome` (`apply_core.ts:477`) prefixes `needs_user` with "Sent". The receipt (`career_apply_receipts.ts:73-74`) says "not finished". The two disagree.
  5. Root: the state machine has no "person finished it by hand" edge and no "rejected by validation, may retry" edge. The safety rule "never resend after a click" was implemented as "never let the person retry either".
- **Class:** BOTH.
- **Severity:** Likelihood med-high. Greenhouse invisible reCAPTCHA challenges and server-side validation errors are routine. Harm: lost data and a wrong answer, and the cap and cooldown are consumed.
- **Evidence:** VERIFIED. `apply_repro.sql`:
  - S2: `failed`, then retry, gives `ERROR duplicate_job`.
  - S3: `needs_user`, then a later finish `confirmed`, gives `ERROR invalid apply transition`.
  - `outcomes.ts`: captcha gives the card "Sent, and the page now asks you for something".

  The browser test pins the "already applied" wording after an employer error (`tests/career-extension-browser.test.cjs:860-880`).
- **Fix:**
  - (a) Let begin also replace a `failed` row whose evidence shows the form still present with fresh validation errors (`evidence.url_after = url_before`). Show "fix it and approve again".
  - (b) Keep observing after `needs_user`: re-poll for up to 10 min while the tab lives. Add `career_apply_resolve_own(id, lease, state, evidence)` allowing `needs_user → confirmed | submitted_unconfirmed | unknown_outcome`.
  - Add `needs_user` to `WENT` and `OPEN` once resolved.
  - Change the `needs_user` card copy to "Not finished: …".
  - Fail-first tests: SQL `needs_user → confirmed` succeeds by its own lease; browser: after a captcha the person clears it and the page thanks them, and the row ends `confirmed`.
- **Brutal-list rows:** tracking (as F2), apply-loop BL-043–054.

## F5. The extension's session is a copy of the web app's rotating refresh token
- **Symptom:** About an hour into a queue, every RPC fails. Cards say "Sign in to Upmore in the Trainee panel first. Nothing was filled. Nothing was sent." That is false: the form *was* filled. Any application mid-finish is lost (F2). The Upmore web tab may be signed out at the same moment.
- **Why-chain:**
  1. `signInFromApp` reads `sb-*-auth-token` from the app tab's localStorage and stores its `refresh_token` (`background.js:66-92`, `:85`).
  2. The app keeps using that same refresh token. It is a default `supabase.createClient(UPMORE_BACKEND_URL, UPMORE_ANON_KEY)` (`index.html:8331`), so `autoRefreshToken` is on.
  3. Supabase rotates refresh tokens. Whichever side refreshes second presents a revoked token: the app refreshes about 90 s before expiry, the extension at 60 s (`background.js:52`). Outside the reuse interval, GoTrue's reuse detection revokes the whole session family. This is GoTrue's documented behaviour; I did not reproduce it.
  4. On failure the extension deletes its session (`background.js:57-59`), so `rpc` throws `SIGNED_OUT` (`:105-106`).
  5. Root: two independent clients share one rotating credential. The extension never gets its own session (a magic link creates one, but the copy path is the default UI).
- **Class:** BACKEND.
- **Severity:** Likelihood high for anyone who keeps the web app open, which the copy path requires at sign-in. Harm: lost data (F2), signed out mid-queue, and a misleading "Nothing was filled".
- **Evidence:** READ. The code path is traced. The token-family revocation is GoTrue behaviour, not reproduced here.
- **Fix:** Mint a separate session for the extension. Use a one-time code from the app (or `verifyOtp` from a link the app generates for this device). Never store the app's refresh token. Make `say.signedOut` context-aware ("Signed out; the form is filled but nothing was sent"). Fail-first browser test: after "Use my Upmore sign-in", the extension's `auth.refresh_token` differs from the app tab's localStorage one.
- **Brutal-list rows:** apply-loop BL-043–054, by cluster.

## F6. Postings asked for in chat vanish on a browser restart, or on a second device
- **Symptom:** "Apply to these 8" in chat. The person presses "Trainee's picks" in the extension, then closes Chrome. Next day the picks button says "Trainee has no postings waiting for you". Asking again in chat says they are already queued (`already: 8`). No application row exists for any of them. On a second computer the picks are invisible from the moment the first browser took them.
- **Why-chain:**
  1. `queue-from-trainee` copies rows into the extension queue, then marks them `taken` (`background.js:776-779`, `20261022100000_career_apply_wanted.sql:47-56`).
  2. The extension queue is `chrome.storage.session` (`background.js:9, 268-270`), which Chrome clears on browser close.
  3. `taken` has no way back and no link to an outcome. `put_for` is `on conflict do nothing` (`…wanted.sql:36`). `queueWants` treats every existing row, `taken` included, as "already" (`_shared/career_apply_want.ts:53-54`).
  4. Root: `taken` is used as a lease with no expiry. "Moved into the browser" is treated as done.
- **Class:** BACKEND.
- **Severity:** Likelihood high (every restart, every second device). Harm: lost data, and a wrong answer in chat ("already queued").
- **Evidence:** VERIFIED. `apply_repro.sql` S7: put → take → zero `waiting` → put again gives `{"added": []}`, and zero application rows.
- **Fix:**
  - Treat `taken` as a lease: `taken_at` plus `taken_by` (a per-browser id). `career_apply_want_take_own` returns rows to `waiting` when `taken_at < now() - interval '12 hours'` and no `career_apply_jobs` row exists for that key.
  - Make the extension queue `chrome.storage.local`.
  - `queueWants` counts only `waiting` rows, or rows that have an application, as "already".
  - Fail-first SQL test: take, then 13 h later with no job row, `queue-from-trainee` sees it again.
- **Brutal-list rows:** apply-loop BL-043–054 (chat → queue is "FIXED-IN-TRUNK" by test, but loses work across restarts), apply-chat RETEST rows that ask "did you apply to X".

## F7. Workday on `myworkdaysite.com` / `myworkday.com`: the employer is "wd3", and one application blocks every employer on that host
- **Symptom:** Applying to Acme at `wd3.myworkdaysite.com/recruiting/acme/…`, the card and the sign-in prompt say "wd3". The next posting at Globex on the same data-centre host is refused after review and approval: "You applied to this company in the last 30 days."
- **Why-chain:**
  1. `content.js:348` sets `company = C.workdayEmployer(location.href)`.
  2. `workdayEmployer` takes the host's first label (`apply_core.ts:44-50`). On `*.myworkdayjobs.com` that is the tenant. On `wdN.myworkdaysite.com/recruiting/<tenant>/…` and `wdN.myworkday.com/<tenant>/…` it is the data centre.
  3. The 30-day company rule compares normalized company text (`20261020050000…:25-27`), so "wd3" is one company.
  4. `postingKey` also drops the tenant on those hosts (`_shared/posting_key.ts:44-46` gives `workday:wd3.myworkdaysite.com:<slug>`). Two tenants' identical requisition slugs would also collide as `duplicate_job`.
  5. Root: Workday URL shapes were proven only on `*.myworkdayjobs.com` fixtures (`tests/architect/wo-048-workday.test.ts:188` uses `northwind.wd5.myworkdayjobs.com`). This is DEPTH.
- **Class:** DEPTH.
- **Severity:** Likelihood med (banks and large firms often use `myworkdaysite.com`). Harm: wrong answer (wrong employer on the card) and lost applications.
- **Evidence:** VERIFIED.
  - `outcomes.ts`: `workdayEmployer("https://wd3.myworkdaysite.com/recruiting/acme/…")` returns `wd3`; globex also returns `wd3`; `wd5.myworkday.com/initech/…` returns `wd5`.
  - `apply_repro.sql` S5: acme on wd3 succeeds; globex on wd3 gives `ERROR company_cooldown`.
- **Fix:** In `posting_key.ts`, derive the Workday tenant from the path on `myworkdaysite.com` (`/recruiting/<tenant>/`) and on `myworkday.com` (`/<tenant>/`). Use it in both `postingKey` (`workday:<host>:<tenant>:<slug>`) and `workdayEmployer`. Fail-first test in `wo-048-workday.test.ts`: two tenants on one `wd3.myworkdaysite.com` host give distinct employers and keys.
- **Brutal-list rows:** form-families BL-906 ("Workday is partial"), board-coverage 708/942 ("banks' Workday tenants"), board-family-proof BL-712/880.

## F8. Cap and cooldown are found out only after the person did all the work; chat and extension use different limits
- **Symptom:** The person asks in chat to apply to 3 Stripe roles; all 3 are queued. Each is opened, filled and reviewed. Roles 2 and 3 are refused only at Approve ("You applied to this company in the last 30 days"), and the queue sits on that posting until the person presses Skip. Separately, chat says 25 were queued "today" at 00:30, but the extension refuses the 26th application made in any rolling 24 h. The extension calls that "today's application limit".
- **Why-chain:**
  1. `wantsFrom`/`queueWants` dedupe by posting only, never by company (`_shared/career_apply_want.ts:20-33, 48-59`). Its cap counts *queued wanted rows* since local midnight (`:36-45, 51`).
  2. The server cap counts *application rows* in a rolling `interval '1 day'` (`20261020050000…:28`). The cooldown (`:26-27`) is checked only inside `career_apply_extension_begin_own`, after the click-ready card.
  3. `career_apply_account_own` returns no remaining count or cooldown list (`20261020030000_career_apply_cards.sql:39-45`), so `prepare()` cannot warn.
  4. A begin refusal never advances the queue: `queueAfter` runs only from `finish()` with an observation (`background.js:354`). The browser test codifies Skip as the way on (`tests/career-extension-browser.test.cjs:1149`).
  5. Root: admission rules live only at the last gate, with no read model the earlier steps can consult.
- **Class:** DEPTH.
- **Severity:** Likelihood high (multi-role companies, people who batch). Harm: ugly and wasted review time. Nothing wrong is sent.
- **Evidence:** VERIFIED for the chat side (`audit-repro/wants.ts`: 3 roles at one company give `queued: 3, refused: []`; 25 queued at 23:30 and 25 more at 00:30 next day give `queued 25`). READ for the extension side.
- **Fix:**
  - Add `career_apply_admission_own(p_job_id, p_company)`, returning `{ok, reason, remaining_today}` from the same SQL rules. Call it in `prepare()` before filling; show the refusal on the card and auto-skip in queue mode.
  - Make `queueWants` refuse a second posting per company in the batch with the cooldown reason, and count the cap from `career_apply_jobs` rows in the same rolling window.
  - Fail-first tests: `queueWants` with 2 postings at one company queues 1 and refuses 1; the extension shows "already applied to this company" before filling.
- **Brutal-list rows:** apply-dedupe BL-729, apply-guards BL-079–087, BY-POLICY BL-018/598 (the limit must be said up front).

## F9. A Workday review card can be approved while binding no answers, or only some
- **Symptom:** On a Workday Review step whose layout is not `dt/dd` or `formField-*`, or whose sections are collapsed, the card reads "Review: your application exactly as Workday shows it before Submit:" and then lists nothing, or only the shown sections. It is "ready", and Approve submits everything Workday holds.
- **Why-chain:**
  1. For the review step, `snapshot()` is `D.readWorkdayReview().filter((r) => r.value)` (`content.js:110-113`).
  2. `readWorkdayReview` reads only *shown* `dt`/`dd` pairs, falling back to shown `formField-*` wrappers (`dom.ts:953-974`). Hidden or collapsed sections, and other markup, produce no rows.
  3. Nothing blocks an empty or short payload. `blockers()` checks only `page`-sourced values, open required fields and challenges (`apply_core.ts:315-323`). `form.schema` is set to `[]` for the review (`content.js:111`), so `openRequired` is empty.
  4. Root: on Workday, "the exact payload" is a reading of the page, not the data sent. There is no completeness check against the step drafts the person approved (`workday_drafts`, `background.js:553-556`).
- **Class:** DEPTH.
- **Severity:** Likelihood low-med (tenant layouts vary, and only one fixture layout is tested). Harm: a wrong external action, since the approval is not of the exact payload. This is the one place the D-007 binding is weak.
- **Evidence:** READ.
- **Fix:**
  - Block the review card when `readWorkdayReview()` returns fewer than N rows, or misses any label from the approved step drafts in `workday_drafts` for this `job_id`. Show "Trainee could not read Workday's review; check it on the page and submit it yourself."
  - Expand collapsed sections before reading.
  - Fail-first test: a review fixture with `dt/dd` inside a collapsed `section` gives a `blocked` card, and Approve is disabled.
- **Brutal-list rows:** form-families BL-906, approval-mechanics BL-340–348.

## F10. A thank-you page that says "email" before "code" is recorded as "not finished"
- **Symptom:** The employer's page says "Thank you for applying… a copy was sent to your email… Code of Conduct". The card says "Sent, and the page now asks you for something (a check or a code)". The text receipt says "the employer emailed you a code to finish it". The row is `needs_user` forever (F4).
- **Why-chain:**
  1. `observe` sets `email_code_prompt` from `/verification code|email.*code|one[- ]time code/i` over the whole page text, with whitespace collapsed to one line (`dom.ts:403, 420`). So `email.*code` spans thousands of characters.
  2. `classifyOutcome` checks `email_code_prompt` before the `SUCCESS` regex (`_shared/career_apply.ts:29-35`).
  3. Root: page-level keyword heuristics, with no field-level signal (an input of `autocomplete=one-time-code`, or a code-shaped input).
- **Class:** DEPTH.
- **Severity:** Likelihood low-med. None of the 17 captured forms in `tests/fixtures/forms-ci` fire it before the click (`audit-repro/emailcode.cjs`: all quiet, no "code" on any). Thank-you and description pages are unmeasured. Harm: a wrong answer, and the application drops out of tracking.
- **Evidence:** VERIFIED on synthetic text (`outcomes.ts`: a thank-you page gives `needs_user`). Not observed on a real page.
- **Fix:** Require a visible input that looks like a code (`autocomplete="one-time-code"`, `inputmode=numeric` with `maxlength` ≤ 8, or a label matching `/code/`) and no `SUCCESS` match. Bound the regex to about 80 characters (`email.{0,80}code`). Fail-first test: `classifyOutcome` on that thank-you text gives `confirmed`.
- **Brutal-list rows:** tracking (as F2).

## F11. Lifecycle gaps: a closed tab or a restarted worker leaves cards "submitting" and queue items "open" forever
- **Symptom:** These are separate cases:
  - The person closes the queue's tab while a card waits. The panel still shows "now: <url>". Start continues from the next *waiting* item, and the "open" one is never reopened or counted.
  - If the service worker restarts during begin, the card stays "Checking the form is still exactly what you approved..." (status `submitting`). Later Fills on that tab cannot replace it.
  - An interrupted Prepare shows "Reading posting X of Y" until pressed again.
- **Why-chain:**
  1. `approve` sets `status: "submitting"` (`background.js:706`). The `card` handler refuses to replace a `submitting` card (`:539-541`). Only `finish()`/`stopped` clear it, and a content script whose `send()` failed just returns (`content.js:525-528`, where `send` swallows errors at `:13`).
  2. `queue-start` computes the index from the first `waiting` item (`background.js:789`). An item left `open` is skipped forever (`:273`).
  3. There is no `tabs.onRemoved`, `runtime.onStartup` or `alarms` (grep: none). `surveys`, `finishing`, `reading` and `preparing` are in-memory (`:306, :399, :428-429`).
  4. Root: MV3 service-worker state has no recovery path. This is the same gap as F2, client side.
- **Class:** BACKEND.
- **Severity:** Likelihood med (closing tabs is normal). Harm: ugly. Nothing wrong is sent.
- **Evidence:** READ.
- **Fix:**
  - In `tabs.onRemoved`: if the tab is the queue's, set its `open` item back to `waiting`; drop that tab's `cards`/`pending` (finish pending as F2(b)).
  - On `onStartup`/`onInstalled`, reset `answer_once.status === "reading"` and any `submitting` card with no `pending` to `stopped`, saying "Interrupted; nothing was sent" (true when there is no pending).
  - Fail-first browser test: close the queue tab with a ready card, press Start, and the same posting reopens.
- **Brutal-list rows:** apply-loop BL-043–054.

---

## What holds (checked, no finding)
- **Payload binding.** The content script re-snapshots the form and compares it in the same task as the click (`content.js:530-540`). The server recomputes the hash from the payload and refuses a mismatch (`20261021120000…:13-14`). File bytes and option values are bound (`dom.ts readDetail`, browser test "review 5"). A page script rewriting a value is caught (browser test "review 1").
- **Double send.** `unique(user_id, job_id)`, one finish per pending (`background.js:306-312`), and "never resend after a click" hold across two tabs and two devices, which both get `duplicate_job`.
- **Pause.** A paused account blocks the card (`content.js:171`) and the begin (`career_apply_current`). The wording at begin is "account changed" (F3).
- **Required field with no confirmed fact.** The card blocks it with "Still needed …" and the question goes to Trainee once (`content.js:278`, `background.js:571-588`). This is honest.

## Not covered
- I did not run the full `tests/career-extension-browser.test.cjs` suite. The repros above use the same code paths directly.
- I did not test LinkedIn or Indeed (out of scope by rule), live Supabase or a real employer page.
