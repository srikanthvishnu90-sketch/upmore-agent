# First real application: the owner's steps (item 5)

Nothing here has been run against the live project. Every operator step is a held file. The owner's word for a step
binds to the exact bytes reviewed here: `MANIFEST.sha256` lists the sha256 of every held file, and
`scripts/ops/first-send-prepare.sh` refuses unless all of them match. It never connects to a database. It writes the
step, with the account email substituted, to a temporary file outside the repository, and prints that file's sha256
and the one `psql` command the operator runs.

Manifest sha256: see the commit that carries this file (`sha256sum docs/apply/first-send/MANIFEST.sha256`). Any change
to a held file changes it, and the owner's earlier word no longer applies.

## Order (each step only on the owner's written word for that step)

| # | Who | Step | File | Undo |
|---|---|---|---|---|
| 0 | anyone | Read-only readiness check, before and after every step | `00-readiness.sql` (READ ONLY transaction) | none needed |
| 1 | operator | Land the bridge candidate onto the pin; run the worker on that commit | repo merge, not here | revert the merge |
| 2 | operator | Apply the card, then the bridge, then verify | `held-card-bridge/01`, `02`, `01`, `03`, `04` | `90`, then `91` |
| 3 | operator | Lever waiver: 5 sends, 7 days | `docs/apply/HELD-WAIVER-LEVER-5x7D.sql` (refuses if a switch is on) | revoke by id (in the file), or `99` |
| 4 | **owner** | One career chat turn, so the career account row exists | Trainee chat | — |
| 5 | **owner** | Upload the resume for the cloud | Trainee app | "cloud off" removes it |
| 6 | **owner** | Text "apply for me in the cloud", read the terms, reply "yes" (15 a day) | Trainee chat | text "cloud off" |
| 7 | operator | Enroll the account for the card: 24 hours, so do this last before the switches | `held-card-bridge/05-enroll-owner.sql` | `99` |
| 8 | operator | Both switches on (N1) | `08-switches-on.sql` (refuses unless the readiness check would pass) | `98` (off), `99` |
| 9 | **owner** | Tap Approve on the exact card in Messages | the card | — |

Kill switch at any moment: `98-switches-off.sql`. Both the next claim and a drive in progress stop at the database's own
check (`career_apply_message_cloud_authorize` raises "cloud switches off").

Undo of the operator's steps: `99-undo-owner-steps.sql` turns both switches off, revokes every live enrollment, and
revokes the account's waivers. It keeps the rows for the record and leaves the person's own opt-in to them.

## What step 8 checks before it writes anything

- The card and bridge are live (ledger rows).
- The named account is enrolled, and no one else is.
- Its Lever waiver has sends left.
- Its career account exists and is not paused.
- Its resume is stored for the cloud.
- It opted in at 15 a day or fewer, and no one else did.
- No unused batch approval exists for anyone (`CAREER_AGENT_SUBMIT` also arms the extension's agent sends).
- Nothing is queued or driving.

## Known risks for the first send

- One error in the first two Lever tries pauses Lever for 6 hours (the throttle in `20261021080000`).
- The waiver counts claims, not sends, unless the owner picks item 16's option B (`arch/waiver-counts-sends`). A drive
  stopped to ask a question uses one of the 5.
- The enrollment lasts 24 hours. If the card is not tapped and sent within it, re-run step 7 on a new word.
- Employer-email confirmation is not live (item 14). The application will read "sent, not yet confirmed by the employer".

## Rehearsal (disposable PostgreSQL 16, `tests/db/run.sh`)

From the live-like state after step 2, the rehearsal walks every step with a synthetic account, in this order:

- readiness is red, naming all six missing items;
- step 8 refuses before enrollment;
- with no email, the prepare script refuses, and the raw file run directly refuses too;
- steps 3 to 7 run (the person's acts are simulated by the rows and RPC the product uses);
- readiness then names only the switches;
- step 8 refuses on an unused batch approval, and on a second opted-in account;
- step 8 runs, and readiness reads "yes";
- no job was queued or claimed;
- `98` turns the switches off; `99` undoes the operator's steps and keeps the revoked rows;
- a held file changed by one byte is refused before anything is prepared.
