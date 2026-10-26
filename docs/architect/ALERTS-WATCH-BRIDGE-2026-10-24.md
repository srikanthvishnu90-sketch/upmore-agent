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
| Has no watch at all, before or after | Not read, not written |
| Has a watch | The stored row is made to agree with it, whatever the last write did: a missed write is repaired by the next turn |
| Sets, changes or resumes a watch | Saved with the person's watches; watching starts now; zone, report hour, quiet hours, caps and today's counters kept |
| Pauses alerts (`opt_out.global`), or stops the last watch | `on: false`; the settings are kept |
| "forget my career profile" (the host's erase) | The row is removed (`AlertStore.remove`), so the person's words are not kept |
| Watches with more than 10 title terms in all | Not saved, logged (`refused`); the table holds 10 |

Settings made elsewhere (no `interests`, the brain's) follow a watch only on a turn that changed it.

### Fail closed: the scheduled run checks the watch record

The alert settings are a copy of the watch, and a copy's write can fail (coordinator, 2026-10-24: Z1 a pause whose write
failed kept alerting; Z2 an erase whose remove failed kept alerting; Z3 no later turn repaired it). So the copy never
decides alone. `runAlerts` (`career_proactive_run.ts`, `verifiedWatches`) reads each watch row's record as committed
(`career_watch_kv`, `career:watch-profile:<user>`, through career-proactive's `watches`) before planning:

| The record | The run |
|---|---|
| Gone (the erase deletes it) | Sends nothing for that row, and removes the row |
| Paused, or no watch left | Sends nothing for that row (the run never writes the person's settings; the next turn turns the row off) |
| Watches on record | Matches those watches, not the copy's |
| Unread (no reader, or the read fails) | Sends nothing for any watch row this run |

Rows made elsewhere (no `interests`) are not checked against a watch record and send as before.

### Fail closed at delivery: a queued alert is checked again before it is sent

Planning is not the last word. One run can queue several alerts, and the account pause that delivery already re-checks
(`career_user_quiet`: `career:account` paused, STOP, erase) does not cover a pause or a stop said by text, which changes
only the watch. So `deliverDue` (`channel.ts`) asks again for every queued `alert:<job>` and `report:<day>` row, after
the STOP and account-pause checks and before the send. The production store (`channel_store.ts`, `alertWanted`) reads
the alert settings, the watch record behind them (`career_watch_kv`) and the posting (`career_postings`), and
`alertStillWanted` (`career_watch_alerts.ts`) decides:

| Now | The queued row |
|---|---|
| Settings gone or off | Not sent: `skipped_opt_out`, note `ALERTS_OFF_NOTE` |
| Watch record gone (erased), paused, or no watch left | Not sent, same mark |
| An alert whose posting no longer fits the watches on record (a watch stopped, the posting closed or gone) | Not sent, same mark |
| Any of the three reads fails | Deferred: left queued for the next run, never sent on a guess |
| Still wanted | Delivered as before |

Replies (`reply:`), receipts, cards and other kinds are not job alerts and are not checked here.

**What a resume does to a row still due.** If the person resumes before delivery reaches the row, it goes out (they
want alerts again and the posting still fits). If delivery reached it during the pause, it was marked not sent, and that
is final: a resume never sends it later, and the next run does not queue it again (the outbox key is once ever, and
watching restarts from the resume).

**What stays racy.** The check runs once per row, just before the provider send. A pause or stop that lands after the
check and before the provider accepts the message (one provider call, or a long card paced bubble by bubble) does not
stop it; nor does one that lands after the row was sent. A row a run has already claimed is checked by that run only.
The window is that one send, not the queue.

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
- Z1 pause while the alert write fails: the scheduled run sends nothing.
- Z2 erase while the remove fails: nothing is sent; the run removes the stale copy once it can.
- Z3 a later unrelated turn repairs a missed write: a missed pause turns off, a missed second watch is added.
- Z4 no watch reader, or one that fails: no watch row sends; settings made elsewhere still do.
- Z5 career-proactive passes the committed watch records to the run.
- Z6 a missed stop of one of two watches: the run matches only the watch still on record.
- D1 an alert queued before "pause my job alerts" is not delivered (marked not sent).
- D2 "stop watching" one of two watches after both alerts were queued: only the other is delivered.
- D3 a posting closed since, or an erase since: not delivered.
- D4 a check that cannot be read: the alert stays queued and waits; delivered once readable and still wanted.
- D5 the production store makes the three reads, answers false for a paused watch, a gone record, no settings, a gone
  posting, and throws (delivery defers) when any read fails.
- D6 a stop whose write failed: delivery matches the watch record, not the stale copy.
- D7 settings made elsewhere, turned off after queueing: not delivered.
- D8 resume before delivery: delivered; resume after delivery skipped it: never delivered, never queued again.

**Fail-first for Z1–Z6** at 29a0b0c5 (the first push of this branch): Z1 and Z2 sent the alert after the pause and the
erase, Z3's repair returned "unchanged", Z4 sent without a reader, Z5 found no reader wired; 8 passed, 5 failed (Z6 was
added after).

**Fail-first.** On trunk 63a1233f the test does not load: `career_watch_alerts.ts` does not exist, and nothing turns a
router watch into alert settings.

**Mutations (each red, restored green):**

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
| V1 | the run does not verify watch rows | Z1, Z2, Z4, Z6 |
| V2 | an unread record sends anyway | Z4 |
| V3 | pause not checked by the run | Z1 |
| V4 | an erased record's row not removed | Z2 |
| V5 | the stale copy's watches matched | Z6 |
| V6 | the bridge compares before and after only | Z3 |
| V7 | career-proactive does not pass the records | Z5 |

| G1 | no check at delivery (dd6425fb's delivery) | D1, D2, D3, D4, D6, D7, D8 |
| G2 | an unreadable check sends | D4 |
| G3 | the production store does not check | D5 |
| P1 | pause not checked at delivery | D5 |
| P2 | the posting not matched again | D2, D3, D5, D6 |
| P3 | the stale copy's watches matched at delivery | D6 |
| P4 | settings off not checked at delivery | D7 |

W1–W10 were run at 29a0b0c5, V1–V7 at dd6425fb (restored 14/14), G1–G3 and P1–P4 at the delivery commit (restored 22/22).

## Decisions for the owner

1. Deploy: the bridge changes what `agent-chat` writes (`career_alert_prefs`) on a watch turn. Turning it on is a
   deploy, the owner's.
2. The router's reply: it says alert delivery "is not wired in this handler". With the bridge deployed, and
   career-proactive scheduled with delivery on, that understates it. The line is in the frozen router (142).
3. One owner of `career_alert_prefs` when the brain is released (see Limits).

## 2026-10-26: integrated on arch/diagnosis-1240 (F4; SERIAL-1520, SERIAL-1521)

ALERTS-PAUSE-1126 was a prioritization pause, superseded by the 15-area request. The branch was merged (a6497a80) with
the diagnosis branch's 142 and host kept (they carry the later form of this alert path; the bridge's 22 unit tests pass
against them) and 152 taking both SOC rules (derived or stated).

**The real chain, proven** (`tests/architect/alerts-chain-pg.test.ts`, real Postgres 16, nothing faked but the board
and the provider's send): a watch said in chat through `handleChat`, the production handler (the resume put on file
first: the router refuses a watch for a person with no profile) → `career_alert_prefs` written by this bridge →
career-proactive's `handleProactive`, wired as its `index.ts` wires it, reading that row (the watch records only to
verify it) → `career_outbox` → `deliverDue` → the fake send. Create, two watches in two cities, pause and resume
(the alert queued before the pause marked `skipped_opt_out`, the run queuing nothing while paused, only new postings
after the resume), stop, erase, and the in-flight bound. This test replaces the pending `alerts-imessage-pg.test.ts`,
whose turns drove the host and persistence by hand and were refused as service_role.

**The two gaps (SERIAL-1521), held in writing as D-032 and pinned in `tests/architect/alerts-owner-pins.test.ts`:**
- (a) competing owner of `career_alert_prefs`: on the live path the bridge is the only writer that sets watches; the
  scheduled run writes counters and removes a stale copy whose record is gone; the brain's `set_job_alerts` also
  writes the row and the brain is pinned off. When the brain is released it writes through the watch or goes: the
  owner's call.
- (b) wrong legacy reader: the product's scheduled reader is career-proactive over `career_alert_prefs`; the legacy
  one-account host (`scripts/career/alerts-host.mjs`, `career_watch_kv` only) is imported by nothing the product
  schedules and its note says it was never deployed; whether it runs anywhere outside this repository is the owner's
  to confirm.

**Observed, not changed (the router's and the matcher's):** a watch "in Remote" matches postings in any location
(the watch carries no place and remote_ok); a remote posting matches every watch of its role; so two people watching
the same role see each other's remote postings as expected, and the test gives each person a role of their own.

Still nothing applied, deployed or switched on: delivery stays NOT_WIRED on the host, no migration, the brain off,
no live send.

## 2026-10-26: remote and region semantics grounded (F4; SERIAL-1530)

The spec's section 3.1 makes locations, the remote preference and work authorization hard filters, and says never to infer
work authorization or a sensitive attribute silently. Before this change the matcher (152 `locationOk`, `career_alerts.fits`)
passed ANY remote posting when `remote_ok` was not false, and the router set `remote_ok` true unless the ask said "no remote":
a New York watch for a person in Toronto admitted a "Remote - US" posting, and a person's location was never read.

**The rule, one module (`supabase/functions/_shared/posting_region.ts`, mirrored word for word in 152):**
- A remote posting's stated country or bloc ("Remote - US", "Remote (US, Canada)", "Spain (Remote)") and any restriction
  the posting's text states about the CANDIDATE ("authorized to work in the United Kingdom", "must be US-based",
  "Canada residents only", "open to candidates in the EU") are its scope. An employer's own descriptor ("a Chicago-based
  company", "we are based in Chicago", "serving residents of Texas") is not a restriction; an office posting's location is
  where it is, screened by the watched place as before. (The first cut read "Chicago-based" boilerplate as a restriction
  and held two office postings in the labeled set; the readers now require a candidate subject.)
- The scope is screened against the person's STATED location (`home` on each bridge interest, from the watch record's
  `scoring_profile.location`): in scope passes, out of scope is refused with the reason, and a scope with no location on
  record is HELD with "tell me your city and country" — never passed, never inferred from the watched city, the zone or
  the resume. A restriction phrased as authorization is screened as a place, never as a claim about their authorization.
- The remote choice is stored as what it is (`filters.remote_choice` "stated" or "default"): "no remote" / "onsite only"
  leaves remote out; "include remote" / "remote too" takes it in; a place with nothing said takes remote in by default and
  the reply says so and how to leave it out. With no location on record the reply also says a country-limited remote
  posting is held until they say where they are.
- Where the person's location comes from: their record (a LinkedIn export's location, a stated preference), else what
  they STATED in chat (the geography fact, "I'm based in Chicago"; the latest statement wins, so a correction re-aims a
  standing record). A resume's header line is not a confirmed fact (122 reads none from it) and nothing is guessed. The
  gauntlet persona carries its location on `basics.location`; a resume-only person has none until they say it.

**Proven at the real chain** (`alerts-chain-pg.test.ts`, step 8): a person who said "I'm based in Chicago" and watches
New York gets the US remote and the open remote posting, never the Canada-only or UK-authorization one; a person who said
nothing gets the open remote one only, with the US-only one held, and the reply says why. Unit matrix in
`alerts-remote-region.test.ts` (both implementations on the same table), the router's replies and stored choice in
`tests/career-watch-remote-choice.test.cjs`.

**Tests whose fixtures assumed the fail-open:** `wo-007-alerts.test.ts` asserted "remote counts when remote_ok" against
"Remote - US" for a person with no location — that line was the fail-open; it now asserts the hold, and passes the
posting for a stated New York home and refuses it for Toronto. Four edge suites and two node suites about time, caps,
rails and match-basis labels used "Remote - US" incidentally; their fixture posting is now open remote ("Remote"). The
WO-037 labeled set (`evals/career/alert-labels/candidates.json`): 15 of its 200 rows were country-limited remote postings
passed for personas with no stated location; their stored gate answers and strata were re-read from today's gate and
builder (gate false, place near miss; 9 other near misses re-classed), ids, postings and personas unchanged; the set was
collected under the earlier gate, so a rebuild from these 200 alone no longer fills every persona's 20 under the quotas
— the per-row stratum check replaces that assertion, and a fresh collection (`collect-pool.ts`, network) is the owner's
call. No human label exists yet, so nothing labeled was invalidated.

**Observed, not changed (reported for an order):** a user-words watch ("watch for supply chain analyst roles in New York",
a title the taxonomy and the occupation library both miss) is keyed to the stated phrase AND each of its content words
("supply", "chain", "analyst", "roles", "york"; the title itself was read as "Supply chain analyst roles in York"), so it
alerts on any posting whose title carries "analyst" or "roles" — a data analyst in New York, an operations analyst remote.
That is the 2026-10-24 user-words rule in `watchStatedRole` ("a posting titled with any one of the user's words can
match"), not this change; the chain test's no-location person watches "paralegal" to stay clear of it.

Still nothing applied, deployed or switched on; no alert sent live.
