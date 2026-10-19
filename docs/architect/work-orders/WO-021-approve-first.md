# WO-021: Approve first, then apply, without asking twice (one text approves a batch)

Status: ready · Depends on: PR #25 (`--approved`), D-014 · Size: L, in four cards · Owners: architect (W1, W4), Codex (W2, W3)

## Why (the speed lever, measured where it can be)
- **Today the person is in the slow path twice:** they approve after the form is filled, one application at a time,
  in a terminal (`scripts/apply.ts`). A texted yes cannot approve a batch: REQUIREMENTS 6b is BUILT for a structured API
  field only.
- **The batch card claims "the exact answers" but shows company, role and fit only** (REQUIREMENTS 6a).
- **The queue exists and nothing feeds it.** `career_apply_jobs` has approval-bound enqueue, leased claim, sweep,
  finish and a cap of 15 a day (`20261020000000_career_apply_jobs.sql`), but no chat or edge code calls it (VERIFIED
  by grep, 2026-10-19).
- **The engine half is done** (PR #25):
  - a dry run prints an approval hash that stays the same across page loads;
  - `--approved <hash>` submits without a second prompt only if the application is still exactly that one;
  - otherwise the result is `APPROVED_APPLICATION_CHANGED`, with nothing sent.
- **What competitors do, and where they fail:**
  - Tsenta approves first by default (VERIFIED-S), and its reported complaint is AI content the person can't edit.
  - AIApply's Hybrid mode auto-sends above a score (REPORTED), and switching to Review may not stop sends already
    approved (REPORTED).
  - Our bar: every answer is visible and editable before the yes, and the yes covers exactly what was shown.

## The flow
1. **Prepare in the background.** Matching postings are prepared ahead: each form is mapped, its answers come from
   confirmed facts, and a dry run produces the approval hash. Nothing is sent.
2. **The card.** One text per batch, at most 8 per card:
   - for each application: the company, the role, the destination, and every answer with its fact;
   - the resume name and hash prefix;
   - the questions still open, asked once.
3. **The yes.**
   - "yes" approves every application on the card exactly as shown.
   - "yes but not 3" approves all except number 3.
   - "change 2 email to x" edits that answer and re-shows application 2.
   - "stop" approves nothing.
   Each approved application goes on the queue with its approval hash as the approval reference.
4. **Execute.** The worker claims an application and runs the engine with `--approved <hash>`:
   - it submits only if the application is still exactly the approved one;
   - any change (a new question, a changed answer, a different destination) stops that one application and asks the
     person again in one text.
5. **Report.** Each application ends confirmed (with the employer's confirmation), unknown, or failed (with the
   reason), and that is said once, in one text.
   - Built (architect, 2026-10-20): `_shared/career_apply_receipts.ts`. The scheduled `career-proactive` run queues one
     text per finished application (outbox key `receipt:<application id>`, kind `receipt`, migration `20261020020000`),
     whether or not the person has job alerts on. Each outcome has its own plain words; nothing is said as confirmed
     without the employer's confirmation, and anything not sent says nothing reached the employer.

## Cards
- **W1 (architect): preparation is an engine dry run.** The approval hash covers the live form's questions (the schema
  hash) and its destination, and only the engine sees those. So the worker prepares each application by running
  `scripts/apply.ts` without `--submit`, and stores the following with the card:
  - the approval hash;
  - every field with its label, value and fact id;
  - the destination;
  - the questions still open.

  The enqueue call takes that hash as the approval reference. A planner-side hash would not match the engine's, so it
  would stop every application.
- **W2 (Codex): the batch card text shows every answer** (6a).
  - Use the card lines from W1; the text stays under 1,600 characters per card.
  - Tests: the card names every field the payload sends, and nothing else.
- **W3 (Codex): the texted yes** (6b over text). Parse "yes", "yes but not N[,M]", "change N <field> to <value>" and
  "stop", each against the last card in the thread.
  - Approve only what the card listed. A yes to a card older than 24 hours is refused, and the card is re-shown.
  - Tests: fixed parses, refusals, and a yes that names a number not on the card.
- **W4 (architect): the worker.** `workers/career-browser/approve-first.ts run` claims the person's own approved
  applications from `career_apply_jobs` and runs the engine with `--approved`. It never retries an UNKNOWN.
  - It runs in the person's own browser, as the desktop runner, per D-017. The self-hosted pool is the fallback for paid
    tiers.
  - **It runs signed in as the person, never with the service key.** `career_apply_claim_own` and
    `career_apply_finish_own` (migration `20261020010000`) claim and finish only the signed-in person's rows, on the
    database clock. The all-users `career_apply_claim` stays service-only for the pool. A service key given to `run`
    is refused (`SERVICE_KEY_REFUSED`).
  - **One application at a time:** there is one browser, and the person may be needed for a verification.
  - **Failures:** a queue it cannot read is asked again. An expired sign-in stops the loop with a plain line.
    Recording an outcome is retried 4 times. If it still fails, the line says NOT RECORDED, and the database marks the
    drive unknown after 15 minutes.
  - **Open:** how the person signs this computer in. Today `run` takes the session from the environment. The plan is
    for the person to sign in themselves in the runner's own browser window, so no token is copied by hand.
  - (Corrected 2026-10-19: this card named `run-approved.ts`; the worker is in `approve-first.ts`.)

## Done means
- **End to end:** a simulated thread goes card → "yes but not 2" → queue → worker → outcome texts, against the local
  fixtures.
- **Counts:** applications sent = approved count; changed applications are stopped; the cap of 15 holds.
- **The gate:** the owner's first real trials (`docs/apply/owner-first-trials.md`) pass before any live use.
