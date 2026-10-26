# Job alerts that arrive: the owner's go-live packet (F7, 2026-10-25)

Branch `feat/f07-alerts-e2e-20261025`. Repo only: nothing here is deployed, applied, scheduled or sent.

## What is proven in the repo

A watch said in chat reaches the person's phone through every real component but the provider's send, on a real
Postgres 16 with the career schema (`tests/architect/f07-alerts-deliver-pg.test.ts`):

| Hop | Component | Proven |
|---|---|---|
| Chat | `agent-chat` `handleChat` (production handler) → router → `career_host_commit` | "Watch for data analyst roles in New York" saves the watch record (`career_watch_kv`, with the confirmed facts as `scoring_profile`) |
| Settings | `syncWatchAlerts` (the bridge, after the save) | `career_alert_prefs` row, on, one interest |
| Planner | `career-proactive` `handleProactive`, wired as `index.ts` (postings through `supabasePostingsDb.newSince` + `getMany`) | ranked by fit (`career_alert_fit.ts` → `career_search.ts fitOf`), the clearance knockout never queued, the weaker fit held for the report, the person's cap (1 a day), quiet hours (deliver_at at their end), `min_fit` |
| Outbox | `career_outbox` | one row per key; deliver_at respected |
| Drain | `trainee-deliver` `handleDeliver`, wired as `index.ts` (`supabaseChannelStore`, run recorded in `channel_delivery_runs`) | the alert texted once to the person's `channel_contacts` contact; nothing inside quiet hours; the next morning's report texted with the held posting, never the knockout |
| Channel | the iMessage adapter (LoopMessage), provider send faked | the text carries the title, company, place and the posting's https link |

The earlier chain test (`alerts-chain-pg.test.ts`) still covers pause, resume, stop, erase and in-flight checks.

## What changed in code (F7)

- `_shared/career_alerts.ts`: `planProactive` takes `fits` (per person, per posting). The day's room goes to the best
  fit first, then freshest; `fitFloorOk`: a posting the person's confirmed facts are knocked out of (121 `hardFilters`:
  clearance, citizenship, graduation window, seniority) is never alerted or reported; with `min_fit` set, only postings
  whose fit is known and reaches it. No fits: freshest first, exactly as before.
- `_shared/career_alert_fit.ts` (new): scores the postings that already pass a person's match, read whole (`getMany`; the
  new-postings list has no description), against the `scoring_profile` on their watch record.
- `_shared/career_proactive_run.ts`: `verifiedWatches` carries each record's scoring profile; `runAlerts` computes fits,
  passes them to the planner, and checks the floor again at the moment of queuing (`below_fit`, `fit_scored` in the run
  stats).
- `_shared/career_alert_store.ts` `validPrefs`: `min_fit` (whole 0–100; null clears; absent keeps).
- Migration `20261026070007_career_alert_min_fit.sql`: the same rule in the table (`career_alert_prefs_min_fit`).
- Router (`142` `alertIntentOf`): an ask about the person's own applications or tracker with no alert framing and no
  new-posting trigger is never a watch create ("let me know how my Stripe data analyst application is going", "text me
  the status of my applications for the analyst roles" were claimed at trunk and at the base).
- Section 5 of the diagnosis: the five REAL regressions (CHANNEL-DOC-1, v240 probe j, v242, MI-013, resume-phrase-scope
  "both") were already green at the base (`f83e42ab`); their tests were not touched.

## The owner's steps (in order)

1. **Merge** this PR after CI is green on all four jobs.
2. **Dry run**: `bash scripts/launch/trainee-go-live.sh --sha <merge sha> --dry-run` and read every line.
3. **Go live**: `bash scripts/launch/trainee-go-live.sh --sha <merge sha>`. It does, in order:
   - migrations, including `20261026070007_career_alert_min_fit.sql` (mark: `career_alert_prefs_min_fit` exists);
   - secrets: `CAREER_PROACTIVE_SECRET`, `TRAINEE_DELIVER_SECRET`, `CAREER_INGEST_SECRET`, `LOOPMESSAGE_API_KEY`
     (and `LOOPMESSAGE_DAILY_CONTACTS` if on the larger plan);
   - deploys `agent-chat` (carries the bridge), `career-ingest`, `career-proactive`, `trainee-deliver`, …;
   - schedules `career-ingest`, `career-proactive` (every 5 minutes at :04) and `trainee-deliver` (every minute).
4. **Postings.** Alerts are only as good as `career_postings`, which had 0 rows at the 2026-10-23 live read; the
   `career-ingest` schedule fills it from `board-directory.json` (2 boards here). Growing the board list is the owner's.
5. **Health**: `select * from career_proactive_runs order by run_at desc limit 5` (a row every 5 minutes; `alerts`,
   `held`, `errors`), `select * from channel_delivery_runs order by run_at desc limit 5` (a row every minute).
6. **One real check** with your own number: say "watch for <role> in <city>" in the texting thread, wait for a new
   matching posting to be ingested, and confirm the text arrives.

## Not done, stated

- **The chat's own words about delivery.** The watch reply says "Alert delivery isn't on yet, so I won't text you
  matches until it is" (`142-career-router.js` `alertDeliveryLine`, ~line 9971) because nothing installs the host's
  `jobAlertDelivery` capability (`career_host.js` ~line 313; `agent-chat/handler-career.ts:260` builds the host without
  it). After step 3 that line understates what happens. It was NOT switched on here, on purpose: with the capability on,
  "what did you send me" (`alertHistoryResult`, ~line 10440) reads 152's legacy history key in `career_watch_kv`, which the
  scheduled run never writes, so it would say "No alerts have been sent to you today yet" after one was delivered. The fix
  is one order: read today's delivered `alert:`/`report:` rows from `career_outbox` into the turn, then install
  `jobAlertDelivery` behind a `CAREER_ALERT_DELIVERY=on` flag the owner sets after step 3.
- **Caps, quiet hours and `min_fit` by text.** The planner honours them from the person's row, and the bridge keeps them
  on later watch turns, but no chat phrase sets them on the row: the router's "no more than N a day" cap op goes to the
  watch manager (`142` ~line 10525), and the bridge copies only the watches (keywords, places, interests) into the row,
  never a cap, quiet hours or `min_fit`. Only the brain's `set_job_alerts` tool writes them, and
  the brain is off.
- **The fit's inputs.** The scoring profile is written when the first watch is made (`142` ~line 10086) and is not
  refreshed when the resume changes later; a new watch after a new resume does not refresh it either. The fit counts
  skills proven on the profile only (121), so a thin profile ranks low across the board: that is why there is no default
  score floor, only knockouts.
- **Rows set outside chat** (the brain's, no `interests`) have no watch record, so no scoring profile: they rank freshest
  first and skip the fit floor, as before.
- Nothing here sends to a real person; the provider send is faked in every test.
