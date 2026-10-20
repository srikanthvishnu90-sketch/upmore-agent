# WO-092: a chat message never makes an approved application stale

Status: built (architect) · Decisions: D-007 · Found by: backend audit 2026-10-20 (database #1, apply F3, chat-brain F1; three
auditors reached it independently) · Size: one migration, one SQL test, one schedule line

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

The batch and task intents keep their own use of `version`: they are minted for the next commit and meant to lapse after
it. So `version` itself does not change here.

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

`scripts/launch/schedule-career-proactive.sql` runs the sweep every 15 minutes (pg_cron, pure SQL, no secret).

`scripts/launch/trainee-go-live.sh` lists the migration and its live mark (`career_apply_sweep_stale` exists).

## Tests
`tests/db/career_apply_authority.test.sql`: 18 checks. Each runs the real `career_host_commit` between a card and its
"yes" to show that:
- an ordinary turn keeps the approval current, "yes" queues both applications, and the person's computer still claims
  them;
- a stated-facts change, a pause and an erase still make earlier approvals stale, and a fresh stamp is current;
- a pause lifted later never revives an approval stamped during it;
- the sweep moves only lapsed `queued` rows, and only the service can run it.

Fail-first: with trunk's `career_apply_current` and no trigger, the third check fails ("an approval made before an
ordinary chat turn is still current"). With the migration, 18/18 pass.

Full `tests/db/run.sh`: passes, 1,513 ok lines, no failures. go-live tests 14/14; wo-037 schedule tests 8/8.

## What this reopens
The triage marked approval-mechanics (BL-340–348) and apply-loop (BL-043–054) FIXED-IN-TRUNK. Their fix held only when
no chat turn fell between prepare and answer. They are fixed by this order, and VERIFIED in SQL. They are not
VERIFIED-LIVE until a deploy.

## Not in this order
- **Two quick messages fail with `revision_conflict`** (chat F1, database #4). That is the chat commit's own counter, and
  it needs a per-person turn lease. It is a separate order.
- **Agent profile facts as authority keys.** They live in the thread snapshot (audit F3). When they move per person,
  their changes join the authority keys.
- **Intents lapsing at the next commit.** This is unchanged and is by their design.
