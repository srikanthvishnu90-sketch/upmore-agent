# Re-prepare + new approval card (module 173) — integration note, 2026-10-21

Owner ruling 2026-10-21 14:37 CDT: Claude's host wiring for ask-the-user
is DONE — the worker raises each missing-fact question while it still
holds the job via `career_apply_cloud_ask` (migration `20261024110000`;
per-person only; identity and bank numbers are never asked by text;
failed asks are recorded). Messages reads open questions via
`career_apply_questions_open_as`; replies land through
`career_apply_question_answer_as`. Muse's piece, this lane: once ALL
of a job's questions are answered, re-prepare the job and show a NEW
approval card — the approval is bound to the exact payload, so the old
card cannot survive a changed payload.

## What was built (branch muse/2026-10-21-reprepare-card, off cea914fe)

- `packages/domain/173-career-reprepare-card.js`
  - `createQuestionsStore` — a faithful LOCAL FIXTURE of the
    `career_apply_questions` row lifecycle (open → answered | failed),
    exposing the two documented live shapes
    (`career_apply_questions_open_as` / `career_apply_question_answer_as`)
    plus the worker-side `cloudAsk`. Row: `{id, user_id, key, kind,
    label, type, options[], company, job_ids[], state, answer,
    asked_at, answered_at, fail_reason}`; an answer carries
    `provenance {source:"owner_reply", question_id, asked_at,
    answered_at}` + the verbatim reply — the same provenance module
    172's intake stamps. The migration is Claude's WO line and is NOT
    on this base; the live wiring swaps this adapter for PostgREST
    reads/writes of the same shapes (see the seam below) and the
    engine does not change.
  - `createReprepareEngine` — the watcher + re-prepare engine + card
    ledger (all pure JSON; clock/postings/profiles/boards injected).
  - `fingerprintAnswers` — the answered-set fingerprint (sorted
    question id + answer-value hashes). A new answer or a correction
    moves it; nothing else does.
- `tests/career-reprepare-card.test.cjs` — 11/11 (matrix below).
- `scripts/career/reprepare-card-demo.cjs` — drives the supersession
  scenario and writes the card artifacts in
  `docs/career/reprepare-card-2026-10-21/` (`card-v1.txt`,
  `card-v2.txt`, `run-record.json`).

## How a tick decides (per job named by any of the user's rows)

1. Any row `open` → wait (`waiting_open_questions`). Partial answers
   NEVER re-prepare.
2. Else any row `failed` → `ask_failed_named`: the failure is on the
   job's record with its reason; a failed ask never counts as answered
   and never silently completes a job.
3. Else, with ≥1 answered row: fingerprint the answered set.
   - `== lastPreparedFingerprint` → `already_current` (duplicate ticks
     are no-ops — exactly one re-prepare per answered set).
   - `== failedFingerprint` → `failed_fingerprint_held` (no spin; a
     changed set re-arms).
   - a prepare in flight for the job → `prepare_in_flight`.
   - otherwise → re-prepare.
4. A question shared by several jobs is evaluated per job: it completes
   exactly the jobs whose other questions are all answered.

## The re-prepare

- Profile = the caller's base profile with each answered fact merged
  as a CONFIRMED answer (`profile.answers[key] = {value, confirmed:
  true, provenance}`), provenance verbatim. Nothing is derived in the
  merge — an answer the owner never gave does not exist in the
  profile, so 149's uncovered-question stop still governs any field
  nobody answered.
- Composition = the executor's own: `155.createRun(count 1)` +
  `155.prepareRun` over 149/150 with the job's posting, the merged
  profile, the stored master (profileMaster) and the caller's
  attestations — the bench-50 / throughput pattern, in-process.
- Mid-prepare race: the fingerprint is re-checked when the prepare
  returns. If the set changed underneath (a late answer, a
  correction), the result is discarded as
  `REPREPARE_STALE_NEW_ANSWER`: no card is issued from the stale
  payload, the failure is on the job's record, and the loop re-arms
  for the next tick.
- Stops and throws are recorded named, never silent:
  `REPREPARE_STOPPED_<149/155 code>` (with the stop's asks carried, so
  the record names the field it waits on) and `REPREPARE_ERROR`.

## The new card + supersession

- On a doorstep, the engine issues a card: `{cardId, jobId, runId,
  payloadSha256 (149's doorstep hash), cardSha256 (155's card set
  hash), answeredFingerprint, issuedAt, supersedes,
  supersedesPayloadSha256, state}` + the rendered text.
- The rendered card follows the corrected provenance basis (the TEST
  profile manifest rules): standing answers are `[REAL]` only when
  owner-stated (derivations never render as REAL); the one synthetic
  sample and the EEO default are `[TEST-INVENTED]`; the job's answered
  questions join as `[REAL]` lines stamped `owner reply — question
  <key> (<id>), answered <ISO>`; a standing stop whose key has been
  answered LEAVES the stop list, and everything still open renders
  under STOPS NAMED as UNANSWERED-STOP.
- Issuing supersedes the job's previous current card: the old record
  keeps `state:"superseded"`, `supersededBy`, and
  `supersededByPayloadSha256`; the new card records `supersedes` +
  `supersedesPayloadSha256` — both hashes, both directions.
- `validateApproval(jobId, cardSha256)` accepts only the current
  card's hash. A superseded hash returns `CARD_SUPERSEDED` (with the
  chain); an unknown hash returns `CARD_HASH_NOT_RECOGNIZED`. The
  suite also proves the binding at 155's own layer: `approveRun` on
  the re-prepared run mints approvals over the NEW payload hash, and a
  restored old run whose payload pointer is swapped to the new hash is
  refused with `APPROVAL_SET_CHANGED`.

## Where this sits in the live executor loop (the seam)

- Today (live): the cloud worker holds a job, hits an uncovered
  required field, and raises the question through
  `career_apply_cloud_ask` (a row in `career_apply_questions`, state
  open). The owner answers in Messages
  (`career_apply_question_answer_as` writes the confirmed fact through
  122; module 172's intake is the chat-side twin of the fixture's
  answer path). Nothing re-prepares the job and no new card exists —
  that is the gap this module fills.
- Wiring: the watcher runs inside the executor's claim cycle (the same
  process that claims batch intents on its 20s timer). Each cycle, for
  every job with question rows: read the rows (PostgREST on
  `career_apply_questions` filtered by user + job, or the two `*_as`
  functions), run `tick()`'s decision, and on `reprepared` persist
  (a) the re-prepare's 155 run through the batch RPC store as a
  prepare-only intent for that job, (b) the new card record into the
  card store (the closure's `career_apply_cards` wave), marking the
  prior card superseded in the same write. The card is then shown in
  Messages exactly like a batch card; the owner's yes is validated
  against the CURRENT card hash before any claim/execute step, and
  155's `APPROVAL_SET_CHANGED` + 149's `APPROVAL_PAYLOAD_MISMATCH`
  remain the in-run backstops.
- Reads: `career_apply_questions` rows for the user; the job's posting
  + production `profileFor` output; the job's current card record.
  Writes: the re-prepare run, the new card record, the supersession
  fields on the old card, and named failure records
  (`REPREPARE_STOPPED_*`, `REPREPARE_ERROR`,
  `REPREPARE_STALE_NEW_ANSWER`, `ASK_FAILED`) on the job's re-prepare
  ledger — a failed re-prepare is a record with a code and a reason,
  never a silent skip.
- Posture: prepare + card only. The engine never calls
  `executeRun`/`submitDoorstep`; flag state and caps are untouched and
  stay the caller's (the closure's flag is OFF; a later per-batch
  approval is what arms any submit, exactly as today).
- Bundle: 173 is an executor-side engine (like 171), not a chat-path
  module — no router-bundle registration. It is registered in the
  mutation report's Gaps class (the honest class: covered by its guard
  suite, no planted-defect packet yet), same posture as 165–172.

## Test matrix (tests/career-reprepare-card.test.cjs — 11/11)

1. Store shapes: open_as per-person + open-only; answer_as provenance
   verbatim; cross-user/unknown answers refused; corrections replace
   and move the fingerprint; a failed ask can never be answered.
2. Partial answers → no re-prepare, no card, job waits named.
3. All answered → exactly one re-prepare + card; duplicate ticks
   `already_current`; answered lines REAL + stamped; answered keys
   leave the stop list; the run sits `awaiting_approval` (never
   executed).
4. Shared question → completes job A only; B completes on its own last
   answer; cards independent.
5. Supersession → new card, old record superseded with both hashes
   both ways; `validateApproval(old)` = CARD_SUPERSEDED;
   `validateApproval(new)` ok; v1 text lacks the answered line and
   lists the stop, v2 carries the line and drops the stop.
6. 155 binding → approveRun mints over the NEW payload hash; a
   payload-swapped old run is refused APPROVAL_SET_CHANGED.
7. Mid-prepare correction → REPREPARE_STALE_NEW_ANSWER, no card; next
   tick cards the corrected value only.
8. Re-arm → a second question on a carded job waits
   (`carded_awaiting_answers`), then re-prepares and supersedes again.
9. Failed re-prepare (board throws) → REPREPARE_ERROR recorded,
   fingerprint held across ticks (prepareCount stays 1), a correction
   re-arms and succeeds.
10. Stopped re-prepare → REPREPARE_STOPPED_UNCOVERED_QUESTION with the
    stop's asks naming the still-uncovered field; no card.
11. Failed ask → `ask_failed` status with the reason on record; never
    counted as answered; no prepare.

Neighbor posture: the lane adds files only (173 + guard + demo + this
note + artifacts + a BUILD-STATUS claim line + the regenerated
mutation report). The §11(F) board-account wiring in the guard/demo
(`accountName` = the applicant's name on the sandbox board) is the
same seam bench-50 and the TEST-profile proof use — a test-world
wiring fact, not a product change.
