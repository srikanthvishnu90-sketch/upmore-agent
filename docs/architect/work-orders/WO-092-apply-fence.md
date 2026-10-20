# WO-092: a chat message never makes an approved application stale

Status: built (architect) · Decisions: D-007 · Found by: backend audit 2026-10-20 (database #1, apply F3, chat-brain F1; three
auditors reached it independently; batches: finding A4) · Size: one migration, one SQL test, one schedule line

## Why
Owner, 2026-10-20: "many things that cause errors occur because either things aren't built to as high of a depth, or the
backend is poor … ask why."

What the person sees:
- After any chat message, "yes 1 2" on an apply card answers "not sent: your details changed after it was prepared;
  prepare it again", though nothing changed. "Show my applications" followed by "yes" fails every time.
- In the extension: "Your account changed since this card was made" if the person texted while reviewing.
- Worst: an application already answered "approved; it is sent next" stays `queued` forever if the person sends one more
  message ("thanks!") before a worker claims it. It still counts toward the daily cap and the 30-day company rule, and
  blocks the posting (`duplicate_job`).

The why-chain:
1. Why "stale"? `career_apply_enqueue` and the card answer require `career_apply_current(user, payload)`.
2. Why false? It required the payload's `account_version` to equal the account's `version`
   (`20261020000001_career_apply_jobs.sql:32-38`).
3. Why did `version` move? `career_host_commit` writes `version + 1` on every commit, even with an empty patch
   (`20261021050000_career_brief_digest.sql:133`). It is the commit's concurrency counter.
4. Why does a queued job stick? Both worker claims filter on `career_apply_current` (`20261021080000:79-110`,
   `20261020010000:18`), and nothing ever expired a stale `queued` row.
5. Root: one counter served two purposes, the chat commit's conflict check and the approval's authority fence. The tests
   never mixed them: `tests/db/career_apply_cards.test.sql` pins version 1 and commits no chat turn.

An earlier draft of this order said the batch and task intents "are minted for the next commit and meant to lapse after
it". That was wrong. A live database probe (finding A4) found 16 batch intents cancelled, 4 completed, 3 uncertain and
0 queued. Named batches died seconds after they were created, while the chat told the person the batch was handed off.
The cause is the same counter: `career_batch_control_hook_v1` (`20261016010000_career_batch_intents_v1.sql`) runs on
every write to `career:account`. It cancelled each queued batch, and marked each claimed one `uncertain`, whenever the
batch's stamped `authority_account_version` differed from the new `version`. So "thanks!" after "apply to 10 analyst
roles" cancelled the batch before the worker claimed it. A message sent while a batch ran made it `uncertain`, and the
worker's finish was then refused. The pending list and the claim used the same equality.

`version` itself does not change here. It stays the chat commit's concurrency counter.

## What changed
`supabase/migrations/20261022150000_career_apply_authority.sql`:
- **`authority_version` on the account row.** A trigger on `career_watch_kv` (key `career:account`) records the `version`
  at which something an approval depends on last changed: the pause, the privacy epoch (an erase), the stated facts, or
  the preferred places. Any writer goes through it. An ordinary turn carries it over unchanged.
- **`career_apply_current`.** An approval is current when all of these hold:
  - the account is not paused;
  - the epoch matches;
  - it has not expired;
  - it was stamped at or after `authority_version` and not ahead of `version`.

  The exact payload stays bound by its hash, as before.
- **`career_apply_sweep_stale()`** (service only). A `queued` application whose approval is no longer current becomes
  `not_submitted`, with reason "approval no longer current", so it stops counting toward the cap and cooldown.

- **Batches** (same migration, after the trigger). A batch is stamped with the version its own commit creates
  (`career_task_bridge.js`: `accountVersion + 1`; `career_batch_turn_commit_v1` checks it). Now
  `career_batch_control_hook_v1` cancels a queued batch, or marks a running one `uncertain`, only on:
  - an erase (the row deleted, or the epoch changed);
  - a pause;
  - `authority_version` moving past the batch's stamp (a stated-facts or preferred-places change, or a pause lifted).

  A plain `version` bump changes nothing. `career_batch_pending_v1` and `career_batch_claim_v1` apply the same rule:
  the stamp must be at or after `authority_version` and not ahead of `version`, with the epoch and pause checks as before.
  The advisory lock, the erase purge and claimed-to-`uncertain` are unchanged.

`scripts/launch/schedule-career-proactive.sql` runs the sweep every 15 minutes (pg_cron, pure SQL, no secret).

`scripts/launch/trainee-go-live.sh` lists the migration and its live mark (`career_apply_sweep_stale` exists).

## Tests
`tests/db/career_apply_authority.test.sql`: 37 checks. Each runs the real `career_host_commit` between a card and its
"yes", or between a batch and its claim, to show that:
- an ordinary turn keeps the approval current, "yes" queues both applications, and the person's computer still claims
  them;
- a stated-facts change, a pause and an erase still make earlier approvals stale, and a fresh stamp is current;
- a pause lifted later never revives an approval stamped during it;
- the sweep moves only lapsed `queued` rows, and only the service can run it;
- a batch minted through the real `career_batch_turn_commit_v1` and followed by an ordinary turn is still queued. It is
  still pending, the worker claims it, it stays claimed through another turn, and it finishes `completed`;
- a stated-facts change cancels a queued batch and marks a running one `uncertain`. The pending list and the claim refuse
  an intent stamped before the change;
- a pause cancels a queued batch, and lifting the pause does not revive it;
- an erase cancels a queued batch and drops its request.

Fail-first: with trunk's `career_apply_current` and no trigger, the third check fails ("an approval made before an
ordinary chat turn is still current"). With the migration, 18/18 pass. For batches, with only the apply part of the
migration (the trunk batch hook), check 21 fails: "the batch is still queued after an ordinary turn". With the batch
part, 37/37 pass.

Full `tests/db/run.sh`: passes, 1,556 ok lines, no failures. go-live tests 14/14 (the migration's mark is unchanged);
`tests/career-batch-delegation.test.cjs` passes; architect tests 632 passed, 0 failed.

## What this reopens
The triage marked approval-mechanics (BL-340–348) and apply-loop (BL-043–054) FIXED-IN-TRUNK. Their fix held only when
no chat turn fell between prepare and answer. They are fixed by this order, and VERIFIED in SQL. They are not
VERIFIED-LIVE until a deploy.

Batch delegation was also marked working. In fact, any message after the ask cancelled it (A4). It is fixed here and
VERIFIED in SQL, and not VERIFIED-LIVE until a deploy. The 16 cancelled and 3 uncertain intents already in the live
database are not revived. Each person has to ask again.

## Not in this order
- **Two quick messages fail with `revision_conflict`** (chat F1, database #4). That is the chat commit's own counter, and
  it needs a per-person turn lease. It is a separate order.
- **Agent profile facts as authority keys.** They live in the thread snapshot (audit F3). When they move per person,
  their changes join the authority keys.
- **Task intents** (`20261015234000_career_task_intents_v1.sql`). These have the same equality in their account hook,
  claim, effect begin and consume, finish and pending list. A chat message cancels a queued task, or revokes a
  running one. They need the same fence, and that is a separate order. It is not "by design", as an earlier draft of
  this order said.
