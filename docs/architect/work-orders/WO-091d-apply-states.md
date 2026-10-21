# WO-091d: every application ends, and says what is known

Found by the application-pipeline audit (findings F1, F2, F4, F7, F11). The approval binding held. The failures went
the other way: states that said "Sent" when nothing was sent, and states that never ended.

## Why-chains (short)
- **F1. "Sent" when the browser refused the submit.**
  - Symptom: a `type=url` field holding `linkedin.com/in/x`. The browser blocked the submit with a bubble. After 30 s
    the card said "Sent; the employer's answer could not be captured". The row was `unknown_outcome`: it was counted
    and blocked the company for 30 days, and a retry got "You already applied".
  - Why: `outcomeAfterClick` turned "the form is still there, nobody answered" into `unknown_outcome`. Nothing read
    the browser's own verdict.
  - Root: "we clicked" was treated as "it may have been sent". The browser had already said it was not.
- **F2 and F11. Drives that never end.**
  - Symptoms:
    - A finish lost offline left the row `driving` forever.
    - A begin whose answer was lost made every retry say "You already applied".
    - A closed tab left the queue item `open` forever.
    - A restarted worker left the card on "Checking...".
  - Why:
    - Only a desktop claim swept `driving` rows.
    - Begin had no way back to its own record.
    - The extension kept its in-flight work in session storage and had no start-up or tab-closed handling.
  - Root: the extension holds a server lease but had no worker lifecycle (no durable outbox, recovery or sweep).
- **F4. Nothing after needs_user and failed.**
  - Symptoms:
    - A captcha after the click left `needs_user` forever, with a card that said "Sent".
    - A form error was terminal.
    - `needs_user` counted toward the cap and the cooldown but not toward tracking.
  - Root: the state machine had no "the person finished it" edge and no "released by the person" edge.
- **F7. Workday shared hosts.**
  - Symptom: on `wd3.myworkdaysite.com/recruiting/<tenant>/…` the employer was `wd3`. One application blocked every
    employer on that data centre for 30 days.
  - Root: the tenant was taken from the host's first label, which is right only on `*.myworkdayjobs.com`.

## What changed
- **F1** (`extension/content.js`, `extension/src/apply_core.ts`, `extension/src/dom.ts`).
  - The click is wrapped in window-capture `invalid` and `submit` listeners. If the browser fired `invalid` on a field
    of the form and never fired `submit`, and the form is still connected, the extension finishes the attempt as
    `not_submitted` with the reason `the browser refused the submit: <label>: <message>`. The card says
    `Not sent — fix <label> (<message>)…`, and the person may approve again.
  - A page script that cancels the click (the TEST employers do this) produces no `invalid` event, so the existing
    rules hold.
  - An unknown outcome now reads "Trainee can't tell whether it went through…", never "Sent". `needs_user` reads
    "Not finished…".
  - A pre-click `checkValidity` check was tried and dropped. On a captured Lever form it refused a submit that the
    page's own script handles: a false "not sent". The event signal is exact; the pre-check was not.
- **F2 and F11.**
  - New migration `20261023091400_career_apply_states.sql`:
    - state `interrupted`;
    - `career_apply_sweep_own` (also run inside begin): an extension drive past its 30-minute lease becomes
      `unknown_outcome` if a click was reported, otherwise `interrupted`;
    - `career_apply_clicked_own`;
    - `career_apply_extension_resume_own`: the same approval, no click reported, lease live, returns the same drive;
    - `career_apply_finish_own` accepts a kept finish onto a swept row, under its own lease, once;
    - `career_apply_retriable`: interrupted, stopped before the click, interrupted before the click, refused by the
      browser, or released;
    - `duplicate_job: <state> <id>`.
  - `extension/background.js`:
    - in-flight work moves to `chrome.storage.local`;
    - `finish_outbox` is replayed on start-up, on every `context` and before every begin;
    - `runtime.onStartup` and `tabs.onRemoved` end in-flight work with `recoveredOutcome`: unknown once the click
      happened, retriable before it;
    - a closed queue tab sets its open item back to `waiting`;
    - a stuck `submitting` card is replaced after a minute when nothing is in flight;
    - a lost begin answer leaves the same card ready, and approving it again resumes;
    - `duplicate_job` is worded by the row's state;
    - a "reading" Prepare left by a dead worker is closed.
- **F4.**
  - `career_apply_resolve_own`: `needs_user` → `submitted_unconfirmed`, with `finished_by: person`.
  - `career_apply_release_own`: `failed` → released, then retriable once.
  - The panel shows "I finished it myself" and "Try again", only where each applies, and only on the person's own tap.
    "Try again" re-arms the page; it sends nothing.
  - `career_apply_counts`: `needs_user`, `interrupted`, `failed` and `not_submitted` never count toward the daily
    limit or the 30-day company rule. A drive counts at any age (see the review fix below).
- **F7** (`supabase/functions/_shared/posting_key.ts`).
  - `workdayTenant(href)` is the path tenant on `myworkdaysite.com` and `myworkday.com`, and the host label on
    `myworkdayjobs.com`.
  - `postingKey` is `workday:<host>:<tenant>:<slug>` on shared hosts. The key on `myworkdayjobs.com` is unchanged.
  - `workdayEmployer` and the content script's company use the tenant.

## Review fix (PR #128): age alone never frees a drive
- **The problem.** The first version stopped counting a `driving` row 30 minutes after its claim, but nothing swept the
  row until the person's extension began again. Two paths then sent a second application to the same employer: an
  extension that clicked and then died, followed 31 minutes later by a chat "yes" to the same company; and a cloud run
  longer than 30 minutes.
- **The fix.**
  - `career_apply_counts(state)` counts a drive at any age.
  - `career_apply_enqueue`, which the chat yes, the begin and every queue path go through, first sweeps the person's
    own stale extension drives under the same lock. One that never clicked becomes `interrupted` and is freed; one that
    clicked becomes `unknown_outcome` and is still counted. A refused yes rolls back with its sweep, so the drive stays
    held.
  - A new service-only `career_apply_sweep_drives()`, scheduled every 15 minutes in
    `scripts/launch/schedule-career-proactive.sql` next to WO-092's `career_apply_sweep_stale`, covers every person
    and every source:
    - an extension drive, by its reported click (as above);
    - any worker's drive (own computer, cloud, email) becomes `unknown_outcome`, still counted and never retried. A
      worker reports no click, so a stale worker drive may have sent; the cloud's is recorded in its telemetry, as the
      cloud claim does.
- **One change from the review's wording.** The review suggested a worker row with no click becomes `interrupted`.
  Workers never report a click, so that would have freed every stale worker drive, including ones that sent. They
  become `unknown_outcome` instead.
- **Tests, written first in `tests/db/career_apply_states.test.sql` (10 assertions).** The first one failed on the PR's
  first version ("statement succeeded but had to fail"):
  - a clicked extension drive 31 minutes old, unswept: a yes for the same company is refused with `company_cooldown`;
  - the same drive without a click: the yes sweeps it to `interrupted` and goes;
  - a cloud drive 45 minutes old: it still holds the company, the person's own sweep leaves it alone, the scheduled
    sweep (service only) makes it `unknown_outcome`, and it still holds the company.

## Files
`supabase/migrations/20261023091400_career_apply_states.sql` (new), `scripts/launch/schedule-career-proactive.sql`, `scripts/launch/trainee-go-live.sh`
(MIGRATIONS + mark `career_apply_resolve_own`), `tests/db/run.sh`, `tests/db/career_apply_states.test.sql` (new),
`extension/{background.js,content.js,panel.js,panel.html,src/apply_core.ts,src/dom.ts,lib/trainee-core.js}`,
`supabase/functions/_shared/posting_key.ts`, `tests/architect/wo-091d-apply-states.test.ts` (new),
`tests/career-extension-browser.test.cjs` (7 tests added, none edited), `tests/fixtures/extension/world.cjs`.

## Tests, written first (each failed on trunk)
- `tests/architect/wo-091d-apply-states.test.ts`: 5 tests, 0 of 5 on trunk (the exports did not exist), 5 of 5 after.
- `tests/db/career_apply_states.test.sql`: 36 assertions (46 with the review fix). On trunk's schema, run without stopping at the first
  failure, 2 of 36 passed, both incidental: "one row" and "never under another lease". After the migration, 36 of 36.
- `tests/career-extension-browser.test.cjs`, the 7 "091d" tests run against trunk's extension: 0 of 7. Trunk's words:
  - F1: "Sent; the employer's answer could not be captured…".
  - F2 lost answer: "Trainee could not record this application…", stopped.
  - F2 outbox: nothing kept.
  - F11: the item stayed `open`.
  - F4 needs_user: "Sent, and the page now asks…".
  - F4 failed: no Try again.

  Against this branch: 7 of 7.
- World stand-ins (TEST only):
  - a Greenhouse-shaped page with a plain `<form>` whose employer listens only for `submit` (`NATIVE_URL`);
  - `challengeafter`;
  - `rejects` takes a second try;
  - `dropBeginResponse` and `failFinish` hooks;
  - the world mirrors the new SQL rules.

## Evidence (this branch)
- Architect suite (merged with trunk, after the review fix): 663 passed, 0 failed.
- Browser suite: 61 passed, 0 failed (trunk: 54 passing, plus the 7 new tests). The one existing test the first
  draft broke (ask once, from the form) came from the dropped pre-check and is green without it.
- DB suite (`tests/db/run.sh`, local Postgres only): all green. The existing extension and form-answers SQL tests are
  unchanged and green.
- `node --test tests/trainee-go-live.test.cjs`: 14 of 14.
- `deno run -A extension/build.ts --check`: fresh.

## Demo the owner can run
`UPMORE_CHROMIUM_SANDBOX=off node --test --test-name-pattern=091d tests/career-extension-browser.test.cjs`: seven
tests, each step in its name.

## Out of scope (left)
- F3: a chat turn bumps the account version, so open cards go stale.
- F5: the extension's own session.
- F6: queue persistence across browsers.
- F8: cap and cooldown read at prepare time, and one window for chat and the extension.
- F9: Workday review completeness.
- F10: the email-code heuristic.
- A server-side scheduled sweep: rows are swept when the person's extension begins or starts up.
- `career_apply_email_reserve_for` and the cloud refusal keep their own counted lists.
- Receipts for `interrupted` (it is not in `FINAL_STATES`, so no receipt is sent for it).
- Re-observing a `needs_user` page after the click: the person's button records it instead.
