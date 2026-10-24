# A watch set by text reaches the scheduled alerts run (2026-10-24)

Branch `arch/alerts-watch-bridge`, off trunk 63a1233f. Repo only: nothing is deployed, no migration is applied, and no
alert is sent anywhere live.

## The missing component

A person who texts "watch for data analyst roles in New York" gets a saved watch and no alert, ever.

| Piece | Where | Reads | Writes |
|---|---|---|---|
| Chat router, watch create / manage / pause / stop | `142-career-router.js` (frozen) | the turn's watch box | 152's watch profile into `ctx.alertWatchState` |
| Host commit | `career_host_commit` (`20261015020000_career_watch_kv.sql`) | the turn's watch box | `career_watch_kv`, key `career:watch-profile:<user>` |
| Scheduled alerts run | `career-proactive` → `runAlerts` (`career_proactive_run.ts`) | `career_alert_prefs` (people with `prefs.on`) | `career_outbox` |
| Alert settings tool | `agent/career_tools.ts` (the agent brain) | — | `career_alert_prefs` |

The only writer of `career_alert_prefs` is the agent brain's tool, which is held (`AGENT_BRAIN_RELEASED = false`). The
router's watch reaches `career_watch_kv`, which only the old one-account systemd runner (`scripts/career/alerts-host.mjs`,
the gauntlet account) reads. So nothing the product schedules ever sees a watch set by text.

The router's reply says so today: "The watch is saved in this conversation only; automatic alert delivery is not wired in
this handler." Once this bridge is deployed, that line understates what happens. The line is in the frozen router;
changing it is the owner's call (see Decisions).

## The bridge

`supabase/functions/_shared/career_watch_alerts.ts`, `syncWatchAlerts`. `handler-career.ts` calls it after
`persistence.commit`, on every saved turn and outside the brain branch. It runs from `loaded.watchState` (the watch the
turn started with) to `ctx.alertWatchState` (the watch it left). A refused save writes no alert settings. A failed
alert write is logged and never fails the saved turn.

| The turn | Alert settings (`career_alert_prefs`) |
|---|---|
| Changes no watch (a question, a list, any other turn) | Not read, not written |
| Sets, changes or resumes a watch | Saved with the person's watches; watching starts now; zone, report hour, quiet hours, caps and today's counters kept |
| Pauses alerts (`opt_out.global`), or stops the last watch | `on: false`; the settings are kept |
| "forget my career profile" (the host's erase) | The row is removed (`AlertStore.remove`), so the person's words are not kept |
| Watches with more than 10 title terms in all | Not saved, logged (`refused`); the table holds 10 |

The account pause ("STOP") is unchanged: `career_quiet_users` already keeps the scheduled run from acting for a
paused, opted-out or erased person.

### What a watch carries over

Each watch is kept whole in `prefs.interests` and matched on its own (`career_alerts.ts`, `matchPosting`). A posting
is news when it fits one watch completely. A data-analyst watch in New York and a banking watch in Chicago never alert
a data-analyst role in Chicago.

| Watch profile (152) | Alert watch (`AlertInterest`) |
|---|---|
| `role.terms` | `keywords` (whole-word title match) |
| `role.blockers` (senior, lead, manager …) | `floor.exclude_words` |
| `filters.locations`, `filters.remote_ok` | `locations`, `remote_ok` |
| `filters.bands` (intern, new_grad) | `floor.levels` (intern, entry) |
| `filters.firms_include` | `companies`: those firms only (`sameCompany`, the floor's company rule) |
| `filters.firms_exclude`, `opt_out.companies` | `floor.exclude_companies` |

The top-level `keywords` and `locations` still hold the watches' words and places (the table's shape check needs 1–10
keywords). When `interests` is present, the watches decide the match. Rows without `interests` (the brain's) match as
before.

The table needs no migration: `career_alert_prefs_shape` checks only the fields it names.

### Limits, stated

- A title that names no level ("Data Analyst") is not held back by an internship watch. Only a title that names
  another level is ("Junior Data Analyst", "Senior …"). This is the floor's own rule for the person's stated floor.
- One store, two writers. The brain's tools, when released, and this bridge both write `career_alert_prefs`. The bridge
  writes only on a turn that changed a watch: the person's latest word wins. Settings set elsewhere stand until the
  person changes a watch by text. When the brain is released, the two have to agree on one owner of the row.
- Delivery from `career_outbox` is the texting channel's job (WO-013); this bridge does not change it.

## Tests

`tests/architect/watch-alerts-bridge.test.ts`. Each case runs the real router turn (the host, 142 and 152), the
bridge, and the real `runAlerts` over a fake board, then reads the outbox.

1. A watch set by text alerts a new matching posting, and nothing else: no blocked title, other city or other role.
2. Two watches keep their own cities.
3. A firm watch alerts that firm only. An internship watch never alerts a title of another level.
4. Pause stops every alert and resume brings them back. Stopping the last watch turns alerts off.
5. A turn that changes no watch writes nothing; settings set elsewhere stand. A new watch keeps the person's zone and
   report hour.
6. "forget my career profile" removes the row.
7. A change starts watching from now: a posting first seen before it is never alerted. Today's count and held list stay.
8. The handler calls the bridge after the commit, from the loaded watch state to the one the turn left, with a
   `.catch`, not inside the brain branch.

**Fail-first.** On trunk 63a1233f the test does not load: `career_watch_alerts.ts` does not exist, and nothing turns a
router watch into alert settings.

**Mutations (each red, restored green 8/8):**

| | Mutation | Red |
|---|---|---|
| W1 | watches flattened (interests ignored) | 1, 2, 3 |
| W2 | role blockers dropped | 1 |
| W3 | firm-only dropped | 3 |
| W4 | bands not mapped to levels | 3 |
| W5 | pause ignored | 4 |
| W6 | erase keeps the row | 6 |
| W7 | writes on every turn | 5 |
| W8 | counted from the old check | 7 |
| W9 | zone and report hour not kept | 5 |
| W10 | hook removed from the handler | 8 |

## Decisions for the owner

1. Deploy: the bridge changes what `agent-chat` writes (`career_alert_prefs`) on a watch turn. Turning it on is a
   deploy, the owner's.
2. The router's reply: it says alert delivery "is not wired in this handler". With the bridge deployed, and
   career-proactive scheduled with delivery on, that understates it. The line is in the frozen router (142).
3. One owner of `career_alert_prefs` when the brain is released (see Limits).
