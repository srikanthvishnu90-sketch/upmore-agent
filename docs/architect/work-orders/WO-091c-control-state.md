# WO-091c: the owner's send switch holds, and the person's pause, STOP and erase reach what Trainee does on its own

Status: PR open (architect fix lane) · Depends on: WO-032, WO-033, WO-034, WO-038 · Assignee: Claude · Size cap: one
reviewable PR

## Why: found by the audit of the proactive layer and the channels (trunk @ 53db2d55)
Six defects, each reproduced by a throwaway test that passed on trunk (a pass meant the defect was there).

1. **Apply-by-email sent with no owner switch** (proactive F2).
   - Why did "yes" send from the person's Gmail? `emailTurn` was wired with `send: sendMail(...)` and the only gate
     was `canSend`, meaning the career grant has gmail.send (`handler-career.ts`, `career_apply_email.ts`).
   - Why did nobody notice? The kill switch `CAREER_OUTREACH_SEND` sits on one caller, the outreach rail in
     `career-proactive/index.ts`. Apply-by-email is a second rail, and it never got one.
   - Root: the owner's "drafts only" rule was a property of one rail, not of every rail that sends.
2. **An outreach approval never expired, and the send ignored pause and STOP** (proactive F1).
   - Why did a June approval go out in October? `runOutreachSends` takes every `approved` draft, and NOT_WIRED puts it
     back to `approved` forever.
   - Why did the claim allow it? `career_outreach_claim` checked the hash, do-not-contact, the caps and the spacing,
     but not `approved_at`, `career:account.paused` or `channel_contacts.opted_out`.
   - Root: the approval was bound to the payload but not to a time or to the account's state.
3. **One person's failure aborted the whole scheduled run, and the run row said zero** (proactive F4).
   - Why did one Gmail 403 stop everything? `handleProactive` ran every rail inside one `try`, and each rail threw
     after its loop. The catch then recorded a hard-coded `users:0, alerts:0`.
   - Root: "one person's failure does not stop the others" held inside a rail, not between rails. Some rails (alerts,
     receipts, asks, outreach) had no per-person isolation at all.
4. **Pause, STOP and erase did not reach the scheduled layer** (proactive F5).
   - Why did alerts, cards, questions and mail reading go on after "stop everything"? Nothing in `career-proactive/`,
     `career_proactive_run.ts` or `channel.ts deliverDue` read `paused`.
   - Why did a text queued at 23:30 go out at 07:00 after a pause? Delivery checked only STOP, not pause.
   - Root: the control state lives in two places (`career_watch_kv` `career:account.paused`, which an erase also sets,
     and `channel_contacts.opted_out`). Every rail built after the router's reminder outbox read neither.
5. **The alerts run switched alerts back on** (proactive F6).
   - Why? `runAlerts` read each settings row at the start of the run, then upserted the whole row, `prefs` included,
     from that snapshot. A `stop_job_alerts` that landed in between was overwritten.
   - Root: the run owns only counters, but it wrote settings.
6. **"cancel", "end" and "quit" unsubscribed people** (channels F1).
   - Why? `channelCommand` took WO-013's SMS carrier keyword list (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT), and
     WO-038 reused it unchanged for iMessage, WhatsApp and Telegram.
   - Why does that matter? The product asks for those words ("Say cancel and I will stop them", "end mock").
   - Root: a carrier rule for SMS was applied to channels that are not SMS.

## What changed
- **Email send switch.** `career_apply_email.ts`: `EmailDeps.sendOn`. When it is false, a "yes":
  - is answered "Not sent: sending email from your Gmail is not switched on in Trainee yet";
  - reserves nothing and does not even read the Gmail token;
  - keeps the card as the thread's last word, so a yes after the switch is on sends exactly that email.

  `handler-career.ts` passes `sendOn: Deno.env.get("CAREER_EMAIL_SEND") === "on"`. The switch is documented in
  `docs/launch/TRAINEE-GO-LIVE.md` (the 075000 entry) and `docs/product/TONIGHT-TEST-PLAN.md` (section 10, beside
  `CAREER_OUTREACH_SEND`).
- **One control-state predicate, and the outreach claim.** New migration
  `supabase/migrations/20261022120000_career_control_state.sql`:
  - `career_user_quiet(user)`: true while the account is paused (pause, STOP to the host, every erase) or any contact
    is opted out. `career_quiet_users(users[])` is the same for a list. Both are service-role only.
  - `career_outreach_claim` is redefined with two more refusals and is otherwise identical (`diff` shows only those
    three lines): `expired` when `greatest(approved_at, created_at)` is more than 7 days before the claim, and `paused`
    while the person is quiet.
  - `career_proactive_runs.errors jsonb`: each rail's failure, by rail.

  The migration is in `trainee-go-live.sh` `MIGRATIONS` and `MIGRATION_MARK` (`career_quiet_users`).
- **`career_outreach.ts`.**
  - `Admit` gains `expired` and `paused`, and `APPROVAL_TTL_MS` is 7 days.
  - `admitSend` (the memory mirror) checks the same anchor and `quiet`. The memory store has `setQuiet`.
  - `runOutreachSends` drops an expired draft (`skipped`, result `expired`) without using the person's turn this run,
    and leaves a paused one `approved`.
  - Each person's send is in its own try. `runOutreachReplies` isolates each thread.
- **Per-rail and per-person isolation.**
  - `career_proactive_run.ts`: `runAlerts`, `runReceipts` and `runAsks` now catch per person. Every rail that fails
    for some people throws `partialError(message, whatItDid)`. Messages are unchanged, so WO-022's assertion holds.
  - `career-proactive/handler.ts` runs each rail through `step(name, …)`:
    - a failure goes to `errors[name]` with the rail's partial counts;
    - later rails still run;
    - the run row carries the true `stats`, `error` (the first failure, unchanged for one) and `errors`;
    - the HTTP status stays 500 when any rail failed.
  - `index.ts` runs outreach sends and replies independently and writes `errors` to the row.
- **The scheduled layer reads the control state.** With `quiet` (`index.ts`: `career_quiet_users`), the handler
  drops quiet people before each rail: alerts (`active`), cards, mail people, interview drafts, digest, asks and
  questions. A control state that cannot be read fails that rail closed.
- **Delivery reads it again.** `channel.ts deliverDue` (with `ChannelStore.quiet`, which `channel_store.ts` reads from
  `career_user_quiet`) marks a non-reply row `skipped_opt_out` with `PAUSED_NOTE` once the person is quiet. Answers to
  the person's own messages still go. A pause that cannot be read leaves the row for the next run. `channel_memory.ts`
  mirrors it.
- **Alerts write counters only.** `AlertStore.saveCounters` writes `last_checked_at`, `instant_sent_today`,
  `sent_on`, `held` and `last_report_on` (a Supabase `update`, never `prefs`), and `runAlerts` uses it.
- **Channel commands.** `channelCommand(text, channel?)`:
  - CANCEL, END and QUIT are opt-out words only when the channel is `sms`, or when no channel is named (WO-013a's
    simulator, whose architect test is unchanged).
  - On `imessage`, `whatsapp` and `telegram` they go to the brain. STOP, STOPALL and UNSUBSCRIBE stay commands
    everywhere, and Telegram's `/stop` is unchanged.
  - `channel_inbound.ts` passes `msg.channel`.
  - The comment cites the carrier rule (CTIA's SMS opt-out keywords). Trunk has no SMS channel today; WO-014 is
    where one would use it.

## Tests (written first, each failing on trunk for the defect's reason)
- `tests/edge/control-state.test.ts`, 12 tests: C1, C1b (email switch); C2, C2b, C2c (expiry, pause, the migration
  and go-live); C3, C3b (rail and person isolation, a true run row); C4, C4b (quiet people at plan time and at
  delivery); C5 (lost update); C6, C6b (channel words).
  - Before (trunk): 0 passed, 12 failed.
  - After: 12 passed.
- `tests/db/career_control_state.test.sql`, 17 checks, wired into `tests/db/run.sh` after the outreach re-run (the
  migration applied twice, idempotent).
  - Before: it fails at its first check (`career_user_quiet` does not exist).
  - After: 17 ok.
- One architect test changed, `tests/architect/wo-033-outreach.test.ts` S2.
  - The old test approved 10 drafts on day 0, left them unsent, and expected them to be sent on day 8: the exact
    behaviour this order removes.
  - Now day 8 approves three fresh batches instead of two, the same 20-sent and 21st-refused assertions hold, and one
    added line asserts that day 0's 10 unsent approvals expired.
- The audit repros, pointed at this branch: proactive F1, F2 and F3 and channels R1 now fail (the defect is gone).
  Every other repro still passes: those are the findings left below.

## Evidence
- Architect suite: 632 passed, 0 failed, the same as the base (6f92997b). After the rebase onto trunk 30b8b305, which
  brings WO-080 and WO-091b: 658 passed, 0 failed.
- Edge suite: 881 passed, 0 failed (base: 869 passed; the 12 new tests are the difference). The same after the rebase.
- `node --test tests/career-*.test.cjs`: the same 114 failures before and after, test for test (pre-existing in this
  sandbox: browser and network tests); nothing new.
- `node --test tests/trainee-go-live.test.cjs`: 14 passed.
- `tests/db/run.sh` (local throwaway Postgres 16): db tests passed, including `career_control_state.test.sql`.
- `deno check` on every changed module: clean. The function entry points import from deno.land and esm.sh, which
  this sandbox cannot reach, so `scripts/gate.sh`'s career-typecheck step was not run here.

## Demo (the owner, after the migration is applied)
1. With `CAREER_EMAIL_SEND` unset, text "apply by email to <company>", then "yes". The answer says sending is not
   switched on yet, and nothing appears in Gmail Sent.
2. Text "stop everything". The next 07:00 alerts do not arrive. `select status, error from career_outbox where
   user_id = '<you>' order by id desc limit 5` shows `skipped_opt_out` with the pause note.
3. On Telegram, text "cancel". The brain answers, and you are not unsubscribed.
4. `select errors from career_proactive_runs order by id desc limit 5` names each rail that failed, and the counts
   beside it are what ran.

## Out of scope (left from the audit)
- Proactive F3 (reply polling starves, and the first reply ends reading), F7 (the 500-message mail window), F8 (stale
  alert text and closed postings), F9 (revoked Gmail grant) and F10 (no watchdog on the run tables). Also F11 (quiet
  hours and caps).
- From F4: Gmail 401 is still read as ERROR, not as NOT_WIRED with a forced refresh.
- From F5:
  - `stop_job_alerts` does not cancel alerts already queued.
  - An erase does not set `career_alert_prefs.prefs.on=false` or remove the Google grant. A resumed account after an
    erase is read again.
  - The SQL card and question pushes do not read the pause themselves; the handler filters them first.
- Channels F1:
  - `start`, `help` and `info` mid-flow are still commands on every channel.
  - The router copy "Say cancel …" is unchanged (it now reaches the brain, which is the fix).
- The outreach run's stats are not written to the run row (F10).
