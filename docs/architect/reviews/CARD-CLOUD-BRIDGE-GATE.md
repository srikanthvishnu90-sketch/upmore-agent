# Review gate: Messages card tap → cloud job (the bridge)

Architect's gate for Codex's design, against pin `wo/first-real-submission` @ `01401cb4`. The design passes when every
item below has a concrete answer (file, function, line of SQL or test name). An item answered "later" is a fail. Code
starts only after the architect writes PASS on the design.

## What the pin does today (facts the design must start from)

- **Card tap** (`career_apply_message_card_approve_own`, 20261021220430): TEST-only (`career_message_approval_private.test_users`,
  empty), mints `career_apply_batch_approvals` rows over extension `BatchPosting` entries, records `bound_approvals`.
- **Card guard** (`career_message_approval_private.guard_queue`, before insert/update on `career_apply_jobs`): only for a
  job whose `agent_batch_hash` matches a bound approval; payload keys are a closed set that **excludes `engine_approval`
  and `destination`**, and requires `source = 'extension'`. A card-approved job therefore can never be cloud-claimed.
- **Cloud claim** (`career_apply_cloud_refusal` / `career_apply_cloud_claim_at`, as re-created by **20261024120000**, live):
  needs `approval_hash = payload_hash`, a 64-hex `payload.engine_approval`, an https `payload.destination`, the switch,
  gate-or-waiver, opt-in, pauses, the daily limit and the 30-day company rule.
- **Cloud payload producer**: only the engine's dry run (`workers/career-browser/approve-first.ts` `prepare`), which runs
  on the person's computer today. `workers/career-cloud/worker.ts` has no prepare step. Nothing calls
  `career_apply_message_card_show_as` (no producer is wired: handoff step 6).
- **A second route to a cloud job already exists**: the old card (`career_apply_card_answer_for`, 20261020050000), answered
  from a **text reply** (`supabase/functions/_shared/career_apply_cards.ts:230`), calls `career_apply_enqueue` on
  `career_apply_prepared` payloads, which carry `engine_approval` + `destination`: cloud-claimable. The owner's rule is a tap
  on the exact payload; a texted yes is not one.

## Gate items

### A. Producer (where the card's payload comes from)
1. Who runs the engine dry run for a cloud-only person, on which machine, with which facts source (name the function that
   turns the account's stored, confirmed facts into the engine's facts file: e.g. `production-sources.cjs profileFor` →
   module 149, or another), and how a required field with no confirmed fact becomes a `career_apply_questions` row
   instead of a card.
2. The card item is the **exact** cloud payload the claim will run (`engine_approval`, `destination`, `resume_sha256`,
   `manifest_hash`, `quarantine_version`, `replay_sources`, `schema_hash`, `privacy_epoch`, `account_version`,
   `expires_at`) plus the engine readback shown to the person. No second serialization between card and queue: the queued
   `payload` is byte-for-byte (canonical) the card item's payload, and `payload_hash = approval_hash =
   sha256(career_apply_canonical(payload))`.
3. What the card shows: every answer as the form will show it (readback), the destination, the resume file name and full
   fingerprint, the questions left blank, the employer-set fields. Nothing sent that is not shown.

### B. Tap → queue (server)
4. The tap RPC takes only `(card id, card hash)` from the client; the payload comes from the stored card row. Locks the
   card, checks actor = card owner = thread owner, unexpired, unanswered, stored hash = recomputed hash, then calls
   `career_apply_enqueue` **inside the same transaction** and marks the card answered. A refused enqueue (daily cap,
   cooldown, duplicate, stale) leaves the card unanswered or answered-with-refusal; it says which, and why.
5. Binding: a private table `card id → job row id` (one-to-one, unique both ways), written in that transaction. The job's
   `user_id, job_id, url, company, payload, payload_hash, approval_hash` are immutable afterwards (trigger), whatever the
   state.

### C. Guard semantics (the "same server guard")
6. The extension branch of `guard_queue` is unchanged byte for byte (diff shown), or every change is listed with a test.
7. The cloud branch has its own closed payload key set (exactly what `prepare` emits; list it) and refuses any other key.
8. On the claim (`queued → driving`, `source → 'cloud'`): the guard re-checks the card binding, card-approval expiry (24h
   from the tap) and the TEST/enrolment rule; terminal states can still be recorded after expiry (as the extension branch).
9. **Exactly one route to a cloud claim for a card-path person**: `career_apply_cloud_refusal` refuses a job with no card
   binding (new refusal reason, e.g. `not_card_approved`), so the old texted route (item above) and any direct
   `career_apply_enqueue` cannot be cloud-claimed. Re-create the refusal from **20261024120000's body**, not 20261021080000's
   (that would silently drop the waiver), and show the diff against it.
10. Enrolment: the card is TEST-only and the handoff says "do not enroll the owner's ordinary profile". The first real send
    is on his ordinary account. The design says exactly which rule replaces TEST-only for that one account (e.g. a
    service-role-only allow row with expiry, like the waiver), and that it is the owner's to write.

### D. Migration shape
11. One additive migration, timestamp after 20261024120000, depending on 20261021220430 (not live yet: the live apply will
    be two files, in order; say so). `create or replace` / `if not exists`, idempotent (applied twice in `tests/db/run.sh`),
    a ledger insert line, grants: tap RPC to `authenticated` only, producer to `service_role` only, private tables no client
    access, everything revoked from `public, anon`.
12. A rollback file in `supabase/rollbacks/` that restores 20261024120000's refusal/claim bodies byte for byte (md5 checked
    in the test) and drops only what the migration added.
13. No change to caps (`career_apply_daily_limit`, 30-day rule), switches or the waiver table.

### E. Fail-first tests (written first, failing on 01401cb4, listed by name)
14. DB (`tests/db/career_apply_card_cloud.test.sql`): tap → one queued job → cloud claim takes it (switch on and a waiver,
    inside the test transaction); replayed tap; expired card; another person's card/thread; payload edited in the card row
    after showing; job row edited after queueing (each immutable column); claim of a job with no card binding (old texted
    route and direct enqueue) refused `not_card_approved`; a bound job's approval past 24h refused at claim but its terminal
    finish still recordable; extension card job still not cloud-claimable; an unknown payload key refused; quarantined
    factId (F-027..F-079 by **factId**, per the F-033 ruling) refused at tap; waiver count still decrements per claim.
15. Worker (`tests/career-cloud-worker-*.test.cjs`): a card-bound job runs `--submit --approved <engine_approval>` and an
    answer changed after the tap stops with `APPROVED_APPLICATION_CHANGED`, nothing sent (the captured Veeva Lever form).
16. Rollback test: up, down, down again, up; after down, 20261024120000's bodies are back (md5).
17. Each test named with the exact failure it shows on 01401cb4 (output pasted), then green on the branch.

### F. Scope and size
18. Files touched, listed. No frontend beyond what the card needs. No flag flips, no live apply, no deploy.
19. Size cap: migration ≤ 250 lines, tests ≤ 400 lines; over that, split and say how.
