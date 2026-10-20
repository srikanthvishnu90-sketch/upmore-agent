# Audit: the proactive layer (what Trainee does when the person is not typing)

**Summary (5 lines)**
1. Email can still go out with no owner switch. The chat's apply-by-email sends from Gmail with no env gate (F2). An outreach approval never expires, and the scheduled send ignores pause and STOP, so a draft approved months ago goes out the day Gmail send works (F1).
2. A recipient's "stop" can be lost. Reply polling reads only the 20 oldest sent threads across all users, and it stops reading a thread after the first reply. So the do-not-contact list misses people who asked to stop (F3).
3. The whole run is one try block. One person's Gmail 403, or one failed card push, aborts mail, asks, questions, digest and outreach for everyone. The run row then records `users:0, alerts:0`. Nothing reads the run tables anyway (F4, F10).
4. Pause, STOP, erase and "stop my alerts" reach almost none of the scheduled layer. Queued alerts cannot be cancelled (no such status exists), and the alerts run's full-row upsert switches alerts back on if the person stops them mid-run (F5, F6).
5. Depth gaps make it wrong rather than broken. A burst of more than 500 emails silently skips the oldest, interview invites included (F7). Alerts say "first seen 3 min ago" when they arrive 7.5 hours later and never re-check whether the posting closed (F8). The daily cap doubles across quiet hours, and the report ignores quiet hours (F11).

Checkout: `/home/user/upmore-agent/.claude/worktrees/audit` @ 53db2d55. Read-only. Repros are throwaway: (a throwaway repro outside the repo), run with `deno test -A --no-check <file>`. Nine tests, all pass, meaning each defect reproduces. The existing `tests/edge/career-proactive.test.ts` and `career-alerts.test.ts` pass (16/16), so none of these defects is covered.

Paths below are relative to `supabase/functions/` unless they start with `supabase/` or `scripts/`.

---

## F1. An outreach approval never expires, and the send run reads neither pause nor STOP. A months-old approval is emailed out.
- **Symptom:** In June the person says "send all" to a batch before connecting Gmail send. Trainee replies "Nothing can go out until your Gmail is connected." In October they connect Google for mail tracking, which grants gmail.send too. Within the hour, Trainee emails June's recipients from their Gmail, one every 5 minutes, maybe after they took a job. The same happens if they texted STOP or "stop everything" in between.
- **Why-chain:**
  1. The send run takes every `approved` draft, oldest approval first, with no age filter: `_shared/career_outreach.ts:468` (`approvedDue(500)`) and SQL `.eq("status","approved").order("approved_at")` at `:638-640`.
  2. A send that was NOT_WIRED or RATE_LIMITED puts the draft back to `approved` forever: `career_outreach.ts:493`.
  3. The only time limit, `BATCH_TTL_MS` (72 h), is checked once, when the person approves in chat (`:398`). The claim never checks it. `career_outreach_claim` (`supabase/migrations/20261021010000_career_outreach.sql:128-157`) checks hash, do-not-contact, recipient cap, daily cap and spacing, but not `approved_at`, `career:account.paused` or `channel_opted_out`.
  4. Root: the approval is bound to the payload but not to a time or to the account's state. Pause lives in `career_watch_kv` `career:account.paused` (`20261015020000_career_watch_kv.sql:131`). STOP sets it too (`_shared/career_host.js:189,202-205`). But pause was only ever wired into the old router's `career_reminder_outbox` (`:133,179`). Every rail built later (WO-033 outreach) was never connected to it.
- **Class:** BOTH. The approval has no lifetime (depth). The pause state is one the newer rails never read (backend).
- **Severity:** 1 of 11. Likely once sends are on, since NOT_WIRED-at-approval is the default path for anyone without the send scope. The harm is an external email on a stale approval, or while the person is paused or opted out.
- **Evidence:** VERIFIED. Repro `F2`: a 120-day-old approval goes NOT_WIRED and stays `approved`, then `sent:1` when the sender works. READ for the claim SQL.
- **Fix:** In `career_outreach_claim`, return `'expired'` when `approved_at < p_now - interval '72 hours'`. Return `'paused'` when `career_watch_kv(user,'career:account').value->>'paused' = 'true'` or any of the person's `channel_contacts.opted_out`. Add both to `Admit`. On `expired`, move the draft to `skipped` (`career_outreach.ts:478-481`). Files: a new migration plus `_shared/career_outreach.ts`. Fail-first test: in the memory store, (a) an approval at T0 and a claim at T0+73h gives `expired` and no send; (b) a paused account gives `paused` and no send.
- **Brutal-list rows:** pause-control BL-189, 191, 590, 597, 604, 630, 631, 636, 681, 837 (BL-590/837: "the reply claims every send path stops"); send-enablement BL-735, 744, 915, 917.

## F2. Apply-by-email sends from the person's Gmail with no owner kill switch. "Email sending is hard-disabled" is true only for outreach.
- **Symptom:** A person with the career Google grant says "apply by email to Acme", then "yes". A real email with their resume goes from their Gmail to the employer. Today, `CAREER_OUTREACH_SEND` (unset) gates only the outreach rail.
- **Why-chain:**
  1. `agent-chat/handler-career.ts:342-367` wires `emailTurn` with `send: (u,m) => sendMail(...)` whenever the turn is "free". No env flag is read; a grep for `CAREER_APPLY_EMAIL|EMAIL_SEND` finds nothing.
  2. `_shared/career_apply_email.ts:212-230`: the only gate is `canSend`, meaning a career grant with gmail.send.
  3. `gmail-oauth/career.ts:17` requests `CAREER_SCOPES = [readonly, gmail.send, calendar...]` as one bundle. Anyone who connects Google for mail tracking or calendar can therefore send.
  4. Root: the kill switch sits on one caller (`career-proactive/index.ts:80`), not on the two low-level senders (`_shared/career_mail_gmail.ts:180 sendMail`, `_shared/career_outreach_gmail.ts:33 gmailSender`). Every new rail must remember to add its own gate.
- **Class:** BACKEND.
- **Severity:** 2. The payload is approved word for word (D-007 holds). But it is a live email path the owner believes is off, and the triage's own "honest reply: drafts only until the owner turns sends on" (BL-917) is untrue for this rail.
- **Evidence:** READ (`handler-career.ts:342-367`, `career_apply_email.ts:208-245`).
- **Fix:** One `EMAIL_SEND` env check inside `sendMail` and `gmailSender.send`. When it is not `"on"`, return `NOT_WIRED` before reading a token. Thread `env` into both. Test: with env unset, `sendMail` and `gmailSender().send` never call `fetch` and return NOT_WIRED.
- **Brutal-list rows:** BL-917, 935 (the honest-reply claim); BL-744, 809, 810, 840, 915 (send-enablement).

## F3. A recipient's "stop" is never read: reply polling starves, and the first reply ends reading. Do-not-contact stays empty.
- **Symptom:** A recruiter replies "please stop emailing me" to a Trainee outreach email. Nothing is recorded, and other Trainee users can still email them (recipient cap 3 per 30 days). Or the recruiter first writes "busy this month" and later "please stop". The second message is never seen.
- **Why-chain:**
  1. `runOutreachReplies` reads `sentAwaiting(o.limit ?? 20, since 30 days)`: `_shared/career_outreach.ts:520`. The SQL is `.eq("status","sent").order("sent_at",asc).limit(20)` at `:651-653`, for all users together.
  2. Cold outreach mostly gets no reply, so those 20 oldest drafts stay `sent` and are re-read every run for 30 days. Draft #21 onward is never read.
  3. On the first non-"other" message the draft becomes `replied`, and the loop `break`s (`:530`, `recordReply :509-513`). A `replied` draft is never polled again, so a later "stop" is lost.
  4. If Gmail accepted the send but the update to `sent` throws (`:487`), the draft stays `sending` with no `gmail_thread`. It is never polled, and the throw also aborts every later person's send this run.
  5. Root: polling has no per-thread "last checked" cursor or fairness, and do-not-contact is fed only by this one leaky path. The triage's note that "recipient stops are durable" (BL-838) assumes the stop is read at all.
- **Class:** BOTH.
- **Severity:** 3. Certain at more than 20 live sends. The harm is emailing someone who asked to stop, which is a CAN-SPAM-style problem shared by every Trainee sender.
- **Evidence:** VERIFIED. Repro `F6`: 21 sent drafts and 50 runs read only 20 distinct threads, and the STOP on the 21st is never read (`dnc:{}`). Repro `F7`: a reply, then a "stop", leaves `dnc:{}` and `status: replied`.
- **Fix:** Add `replies_checked_at` to `career_outreach_drafts`. Poll `status in ('sent','replied')` ordered by `replies_checked_at nulls first`, and stamp it after each read. Classify every message in the thread (a STOP anywhere wins) instead of breaking at the first. Add a sweeper that marks `sending` older than 10 minutes as `unknown`, so it is visible and never resent. Files: `_shared/career_outreach.ts`, a migration. Tests: invert F6 and F7.
- **Brutal-list rows:** outreach-suppression BL-188, 448, 606, 632, 782, 838 (the do-not-contact list is the same mechanism).

## F4. One person's failure aborts the whole scheduled run for everyone, and the run row records zeros.
- **Symptom:** One user's Google Workspace blocks the Gmail API (a persistent 403), or a token was revoked less than an hour ago (the cached access token gives 401). From then on, every 5-minute run returns 500. Nobody gets interview drafts, the weekly digest, the "which application?" asks, open questions, outreach sends or outreach STOP processing. `career_proactive_runs` says `users:0, alerts:0` even though alerts were queued.
- **Why-chain:**
  1. `career-proactive/handler.ts:56-80` runs alerts, receipts, cards, mail, briefs, asks, questions and outreach in sequence inside one `try`. Outreach alone has its own `.catch` (`:77`).
  2. Each step gathers per-person failures and then throws: `runCards` (`_shared/career_proactive_run.ts:132`), `runMail` (`:190` pushes `ERROR` as a failure, `:257` throws), `runInterviewDrafts` (`:282`), `runDigest` (`:305`), `runQuestions` (`:342`).
  3. The catch writes a hard-coded zero row (`handler.ts:84`), so the alerts and receipts already queued this run are erased from the record.
  4. Gmail returns ERROR rather than NOT_WIRED for an HTTP 401 or 403 that is not a rate limit (`_shared/career_mail_gmail.ts:69,83`). `careerTokenFor` uses the cached token until `expires_at` (`:123`), so a revoked grant shows up as ERROR for up to an hour.
  5. The order (mail is read for up to 200 people, `:142,253-256`, before outreach) also means a slow run hits the edge function's wall clock before outreach and before `recordRun`. The pg_net timeout is 140 s (`scripts/launch/schedule-career-proactive.sql:22`).
  6. Root: "one person's failure does not stop the others" (the comments at `career_proactive_run.ts:107,141`) holds inside a step but not between steps.
- **Class:** BACKEND.
- **Severity:** 4. Likely at any real number of Gmail users. The harm is lost texts for everyone plus a run record that lies.
- **Evidence:** VERIFIED. Repro `F1`: one person's `ERROR` gives HTTP 500; `asks`, `questions` and `outreach` are never called; the alert was queued; the recorded row says `users:0, alerts:0`.
- **Fix:** Use a `step(name, fn)` wrapper in `handleProactive`. Each step runs in its own try, and its error goes into `stats.errors[name]`. Record the real `stats` always. Treat Gmail 401 as `NOT_WIRED` and force a refresh next time. Files: `career-proactive/handler.ts`, `career-proactive/index.ts` (an `errors jsonb` column on `career_proactive_runs`), `_shared/career_mail_gmail.ts`. Test: invert F1 so that outreach, asks and questions run and the row carries `alerts:1` and `errors.mail`.
- **Brutal-list rows:** the mail-tracking, brief and digest rows marked FIXED-IN-TRUNK (BL-496, 497, 504, 507, 904, 938) would degrade like this live.

## F5. Pause, STOP, erase and "stop my alerts" do not reach the scheduled layer; queued texts cannot be cancelled.
- **Symptom:** "stop everything" gets the reply "No new action will be started." Overnight, the 07:00 alerts, the daily report, mail status texts, cards and open questions still arrive. "Forget my career profile" gets "cleared account watches and paused career work", yet job alerts keep coming and Trainee keeps reading their Gmail. "Stop my alerts" at 23:30 still delivers the alerts queued for 07:00.
- **Why-chain:**
  1. Nothing in `career-proactive/`, `_shared/career_proactive_run.ts`, `career_alert_store.ts`, `career_mail_store.ts` or `_shared/channel.ts deliverDue` reads `paused`. A grep for `paused` hits only `career_host.js`, the connector and the reminder SQL.
  2. Delivery checks only STOP opt-out (`_shared/channel.ts:94`), not pause. `career_outbox_claim` (`20261021070000_channel_parity.sql:100-115`) has no account filter.
  3. The erase triggers delete outreach drafts, mail events and drafts (`20261021010000_career_outreach.sql:165-178`, `20261021090000_career_mail_erase.sql`). Nothing touches `career_alert_prefs`, so `prefs.on` stays true. The Google grant stays too, so `runMail` reads new mail from the kept cursor and re-creates the events the erase just deleted.
  4. `stop_job_alerts` only flips `prefs.on` (`_shared/agent/career_tools.ts:270-279`). `career_outbox` has no cancelled state at all; its status check (`channel_parity.sql:72`) allows `queued`, `sending`, `delivered`, `failed`, `skipped_opt_out` and `held`.
  5. Root: control state lives in three places (`career:account` kv, `career_alert_prefs.prefs.on`, `channel_contacts.opted_out`). Each rail checks at most one, and a queued message is never re-checked against any of them when it is delivered.
- **Class:** BOTH.
- **Severity:** 5. Certain for anyone who pauses or erases. The harm is unwanted texts and continued Gmail reading after "forget my career profile", which is a privacy breach of the stated erase.
- **Evidence:** READ, confirmed by grep: no `paused` reader in the layer, and no `career_alert_prefs` delete or update on erase.
- **Fix:** Add one SQL predicate, `career_quiet_user(user) := paused or opted_out`. Use it in (a) `career_outbox_claim*`, marking rows `skipped_paused` (a new status) for non-reply kinds; (b) `active()` and `people()` in the alert and mail stores; (c) the outreach claim (F1). The erase trigger also sets `career_alert_prefs.prefs.on=false` and deletes the `user_oauth_connections` google_career row, or stops mail reading. `stop_job_alerts` marks that person's queued `alert` and `report` rows skipped. Tests: a paused user gets 0 claimed rows, 0 alerts planned and 0 mail reads; after erase, `career_alert_prefs.on=false`; after stop, the queued 07:00 alert is skipped.
- **Brutal-list rows:** pause-control BL-189, 191, 590, 597, 604, 630, 631, 636, 681, 837 (the triage found the outreach and alerts half; this adds delivery, mail, cards, questions, erase and stop-alerts).

## F6. The alerts run re-enables alerts the person just stopped (lost update).
- **Symptom:** The person says "stop my job alerts" while a run is in flight. Trainee confirms. Alerts resume on the next run.
- **Why-chain:**
  1. `runAlerts` reads every active row at the start (`_shared/career_proactive_run.ts:37`) and processes people one by one.
  2. For each person it saves the whole row, `prefs` included, from that start-of-run snapshot: `:72-77`, `toDb` (`_shared/career_alert_store.ts:214`), and the upsert at `:221`.
  3. Meanwhile `stop_job_alerts` writes `prefs.on=false` (`career_tools.ts:276`). The run's later upsert puts `on:true` back.
  4. Root: the run owns only counters but writes settings. There is no compare-and-set and no column split.
- **Class:** BACKEND.
- **Severity:** 6. The window is per person, from the start of the run to that person's save, which grows with the number of users ahead of them in a sequential loop. The harm is unwanted texts after an explicit stop.
- **Evidence:** VERIFIED. Repro `F3`: a stop between `active()` and `save()` leaves `prefs.on: true` after the run.
- **Fix:** Add `AlertStore.saveCounters(id, {last_checked_at, instant_sent_today, sent_on, held, last_report_on})` as an `update ... where user_id=$1`, never writing `prefs`. Use it in `runAlerts`. Test: invert F3.

## F7. Mail tracking silently skips everything older than the newest 500 messages in its window, interview invites included.
- **Symptom:** Someone with a busy inbox connects Gmail. On the first read (3-day lookback), or after any outage (up to 14 days), the oldest mail in the window is never classified. An interview invite or rejection from day 1 never becomes a status, brief or confirmation.
- **Why-chain:**
  1. `readMailSince` lists newest first and stops collecting at `maxList` 500 (`_shared/career_mail_gmail.ts:66-73`).
  2. `todo = ids.slice(0,500).reverse()` means "oldest of the newest 500", not the oldest in the window (`:75`).
  3. It reads 100 of them, and the cursor moves to the 100th one read (`:91-92`).
  4. The next run starts at `cursor - 10 min` (`career_proactive_run.ts:187`), which is after every message older than the newest 500. They are never read.
  5. Root: the cursor assumes it read from `since` onward, but the list it read was truncated from the top. Gmail's newest-first order is a fact the code comments on (`:74`) but does not handle.
- **Class:** DEPTH. A shallow pager, plus a cursor invariant that is never tested with more than 100 or 500 messages.
- **Severity:** 7. Likely for heavy inboxes and after any outage (F4 makes outages likely). The harm is lost data: the tracker misses status changes and gives wrong answers on "where am I with Acme".
- **Evidence:** VERIFIED. Repro `F8`: with 700 messages in the window, it reads messages 200–299, and the next run starts at 289. Messages 0–199, including the interview invite, are never read.
- **Fix:** Page until there is no `nextPageToken` (capped at about 5,000 ids). Then read the oldest 100, and set `readThrough` to the last one read. If the cap is hit, return `PARTIAL` and leave the cursor at the oldest unread. Test: invert F8.
- **Brutal-list rows:** mail-tracking BL-496, 497, 904, 938; brief BL-507.

## F8. Alerts and held texts are delivered stale: a frozen "first seen 3 min ago", no closed-posting re-check, and postings on failing boards never close.
- **Symptom:** At 07:00 the person reads "New match: Data Analyst at Acme, first seen 3 min ago". It was seen at 23:27. On WhatsApp, alerts held outside the 24-hour window arrive days later in a burst when the person next writes, some for postings that have since closed. Reports keep listing postings from a board that has errored for weeks.
- **Why-chain:**
  1. The text is rendered at plan time (`_shared/career_alerts.ts:96-98`), and delivery is deferred to the end of quiet hours (`:92`).
  2. The outbox stores only the text: no job id and no expiry. The claim and `deliverDue` never re-check the posting (`channel_parity.sql:100-115`, `channel.ts:85-110`).
  3. Held WhatsApp rows are re-queued on the next inbound message with `deliver_at = least(deliver_at, p_at)` and the old text (`channel_parity.sql`, `channel_inbound_seen`).
  4. A posting closes only after a successful and complete board read (`_shared/career_ingest.ts:83-96,111-118`). A board that keeps failing or returning partial reads never closes anything, and `matchPosting` checks only `closed_at` (`career_alerts.ts:46`), never `last_seen_at`.
  5. Root: "fresh" is decided once, at plan time, and never again. There is no time to live on a proactive message.
- **Class:** DEPTH.
- **Severity:** 8. Certain each night. The harm is a wrong answer, and an apply link to a closed job.
- **Evidence:** VERIFIED for the frozen text and the 7.5-hour delay (repro `F4`: `first seen 3 min ago`, deliver_at 11:00Z for a 03:30Z plan). READ for the rest.
- **Fix:** Store `job_id` and `expires_at` on alert rows. In the claim, skip an `alert` whose posting is closed or `now > expires_at` (for example 24 h). Render the age as "first seen at 11:27 pm", not relative. In `matchPosting`, treat `last_seen_at` older than 3 days as closed. Test: an alert planned at 23:30 for a posting closed at 02:00 is not delivered at 07:00.
- **Brutal-list rows:** alerts BL-706, 512 (marked fixed; the delay works, but what is delivered is stale); alert-content BL-711, 865, 866; ingest and freshness BL-582, 709, 710.

## F9. A revoked Gmail grant fails silently: the person is never told, the app still shows "connected", and approved sends wait forever.
- **Symptom:** The person removes Trainee in their Google account settings. Mail tracking stops without a word. The app's connections page still says "Gmail: career scopes (read + send)". Approved outreach sits `approved` indefinitely, and then fires if they reconnect (see F1).
- **Why-chain:**
  1. When `careerTokenFor` gets a 400 or 401 back from the refresh call, it returns `null` (`_shared/career_mail_gmail.ts:131-132`).
  2. `null` becomes `NOT_WIRED`. `runMail` only counts `not_wired++` (`career_proactive_run.ts:189`), and outreach puts the draft back to `approved` (`career_outreach.ts:493`).
  3. Nothing marks the connection revoked or queues a "reconnect Gmail" text. Status shows `connected: !!(legacy || career)` from the row's existence alone (`gmail-oauth/career.ts:127,161`).
  4. For up to an hour before that, the cached access token gives Gmail 401, which is ERROR and triggers F4.
  5. Root: "revoked" is not a state anywhere in the schema, only a transient `null`.
- **Class:** DEPTH.
- **Severity:** 9. Likely over time. The harm is wrong status shown, lost tracking, and stale sends.
- **Evidence:** READ.
- **Fix:** On `invalid_grant`, set `user_oauth_connections.revoked_at` and enqueue one `status:reconnect:<day>` text. Status reads `revoked_at`. Outreach refuses with `not_wired` and moves the draft to `skipped` after the TTL (F1). Treat Gmail 401 as revoked-or-refresh. Test: a refresh call returning 400 gives one reconnect text, status `connected:false`, and no retries forever.
- **Brutal-list rows:** google-connect BL-756, 918.

## F10. No health signal: run rows are written but never read, outreach results are never recorded, and ingest failures leave no row.
- **Symptom:** The proactive schedule stops (a deploy with a bad secret, wedged by F4, or killed by the wall clock), and nobody knows until a user complains. Outreach could fail every run for a week and no table would show it.
- **Why-chain:**
  1. `career_proactive_runs`, `career_ingest_state` and `channel_delivery_runs` are written, but nothing in the repo reads them. The grep finds only writers and migrations. The "health" is a comment telling the owner to run a `select` by hand (`scripts/launch/schedule-career-proactive.sql:6-7`, `schedule-career-ingest.sql:6-7`, `schedule-trainee-deliver.sql:6-7`).
  2. The outreach result is only in the HTTP response (`career-proactive/handler.ts:77,80`). The `recordRun` row has no outreach field (`career-proactive/index.ts:118-119`).
  3. Ingest's catch returns 500 without `recordRun` (`career-ingest/handler.ts:67-71`).
  4. If the function is killed by the wall clock, no row is written at all. Absence is the only signal, and nothing watches for absence.
  5. Root: "visible" was taken to mean "a row exists", with no consumer and no alarm.
- **Class:** BACKEND.
- **Severity:** 10. A force multiplier: it hides F3, F4 and F7.
- **Evidence:** READ, confirmed by grep.
- **Fix:** Add a pg_cron watchdog SQL (or extend `model-health`) that checks the newest `career_proactive_runs`, `career_ingest_state.last_run_at` and `channel_delivery_runs`, and queues an owner text when any is older than 30 minutes or has `error` set three runs in a row. Record outreach stats and per-step errors (F4) in the run row. Record ingest failures. Test: the handler records `outreach.sent`, `outreach.failed` and `errors`. The watchdog SQL returns a stale signal for a fixture that is 31 minutes old.
- **Brutal-list rows:** ingest BL-941 ("needs deploy"; no live health check comes with it).

## F11. Quiet hours and caps leak: the report ignores quiet hours, the daily cap doubles across midnight, and zones default to New York.
- **Symptom:** (a) Someone who asked for "my report at 11pm" with quiet hours 22–7 gets it at 23:05. (b) With a cap of 3 a day, they receive 6 instant alerts between 07:00 and 08:00. (c) A person in London or India who never set alerts gets cards, open questions, mail status texts and digests on New York's clock, in the middle of their night. Receipts have no quiet hours at all.
- **Why-chain:**
  1. The report is queued `at: o.now` (`_shared/career_alerts.ts:111`). Only instant alerts pass through `isQuiet` (`:92`).
  2. Alerts deferred to 07:00 count toward `instant_sent_today` of the planning day (`career_proactive_run.ts:70-74`), and the next local day resets the count (`:48`). The deferred 3 and the new 3 both land on day 2.
  3. Every other rail takes `tz` from `career_alert_prefs` (`career-proactive/index.ts:57-62,103-108`, `career_mail_store.ts:101-105`), which exists only for people who set alerts. Otherwise the zone defaults to `"America/New_York"` (`career_proactive_run.ts:122,148,275,295,333,354`). `set_job_alerts` also defaults to New York unless the model passes a zone (`career_tools.ts:251`).
  4. Receipts are queued `at: now` (`career_apply_receipts.ts:107`), and `finishedApplications` does not select `tz` (`career-proactive/index.ts:45`).
  5. Root: the person's time zone and quiet hours are a property of the alerts feature, not of the person.
- **Class:** DEPTH.
- **Severity:** 11. The harm is ugly and annoying, not dangerous.
- **Evidence:** VERIFIED for (a) and (b): repro `F5` (report deliver_at 03:05Z, which is 23:05 New York, inside 22–7) and repro `F9` (`{"2026-10-21":6}` with cap 3). READ for (c).
- **Fix:** Queue the report at `awake(...)`. Count an alert toward its `at`'s local day: if `at` falls on a later day, do not add it to today's count, and pre-count it for that day. Move `tz` and quiet hours to a per-person row, filled from the channel or app at link time, used by every rail including receipts. Tests: invert F5 and F9; a person without alert prefs but with `tz=Asia/Kolkata` gets no card at 02:00 IST.
- **Brutal-list rows:** BL-512 and 706 (marked fixed for instant alerts only), BL-711.

---

### Checked and found sound (not findings)
- **Dedupe of a retried schedule run:** `career_outbox` takes one row per user and key, and a duplicate insert maps to "already queued" (`career_alert_store.ts:236-241`). Alert, report, receipt, digest and brief keys are stable. The outreach claim takes an advisory lock on the person and on the recipient and checks status, so overlapping runs cannot double-send.
- **Outreach payload binding:** the claim recomputes and compares the hash (`20261021010000_career_outreach.sql:136-137`). It refuses lists, Cc and Bcc, and header breaks (`career_outreach_gmail.ts:24-29`). Gmail 5xx or a network failure on send is never retried (it goes to `failed`).
- **Sign-in code window:** `gmail_code_window.ts` correctly avoids the `newer_than:15m` = months trap.
- **DST and half-hour zones in quiet hours:** this uses `Intl` with 15-minute steps (`career_alerts.ts:59-74`) and is correct.

