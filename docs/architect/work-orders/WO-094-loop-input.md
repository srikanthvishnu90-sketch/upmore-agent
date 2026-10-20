# WO-094: loop input — the apply worker fills from confirmed facts, the card is the attestation

## Why: problem A3, verified in code (trunk 5f7efe45)
- The batch loop's worker builds each application from the stored 122 master. `production-sources.cjs`
  `portalProfileFromMaster` copied the basics and `master.answers` verbatim.
- Module 149's `deriveAnswers` had no caller on the executor path. No product code writes `answers` or
  `attestations`.
- So every prepare stopped at module 155's `UNCOVERED_QUESTION` on the same eight asks: full_name, email, phone,
  resume, work_authorization, sponsorship, cover_note and certify_true.
- With zero doorsteps, no approval card could exist, so the loop could never reach the person's yes.
- Separately, `board-service.cjs` defaulted `resolveResumePath` to `() => null`, so every resume upload on a worker
  board stopped.
- The why-chain runs from the loop not submitting, to no card, to no doorstep, to an uncovered question, to a profile
  that never read the confirmed facts.

## What changed
- **Executor-side derivation (`workers/career-browser/production-sources.cjs`).**
  - The worker profile takes its identity fields from the stored basics; a basics block marked draft gives none.
  - Screening answers come from `CareerPortalApply.deriveAnswers` over the master's facts. Only facts with status
    `confirmed` count, and each answer is traced to its fact id.
  - The stored `answers` block is no longer copied, because it carries no fact trace.
  - A missing or unconfirmed work_authorization or sponsorship fact gives no answer. The question stays uncovered
    and is asked once. Nothing defaults.
  - `profileFor` always returns `attestations: {}`. A stored standing attestation is never read.
- **The card is the attestation act (149 + 155).**
  - In `cardApproval` mode (set by 155), 149 leaves an attestation field pending on the doorstep. It is neither an
    ask nor ticked.
  - The doorstep payload shows the value the yes will send. It adds `attestation_text` (the form's own certification
    words), so the payload hash binds the text.
  - `run.card.certifications` and `speakSummary` show that text.
  - `approveRun` records `run.attestations[postingKey]`, one record per application. Each record is bound to that
    application's approved payload hash and the approvalRef.
  - `executeRun` passes only that application's record to `submitDoorstep`.
  - `submitDoorstep` checks three things before it ticks anything:
    1. The would-send payload still hashes to the approved hash. If not, it stops `APPROVAL_PAYLOAD_MISMATCH`, which
       covers a certification text that changed.
    2. The attestation names this hash, text and value. If not, it stops `ATTESTATION_REQUIRED`.
    3. After ticking, the live readback still hashes to the approved hash.
  - 155 no longer reads `deps.attestations`.
  - 149's default mode (no `cardApproval`) is unchanged.
- **Cover note.** The note is filled only from a note drafted onto this application's payload (`deps.coverNoteFor`
  in 155, marked `onCard`). The card shows it and the hash binds it. Without one, it stays uncovered. Nothing wires
  a drafter in production yet, so it stays uncovered there.
- **Resume file.**
  - New `workers/career-browser/resume-store.cjs` `createStoredResumeResolver({resumeDir})`. It resolves
    `<resumeDir>/<userId>/<sha256>.pdf`, the private bucket's layout, by the sha256 of the person's stored resume
    record, and checks the file's bytes against that sha256.
  - Its failures are named stops: `RESUME_RECORD_MISSING`, `RESUME_FILE_MISSING` and `RESUME_SHA_MISMATCH`.
  - `board-service.cjs` passes the request's `resumeSha256` to the resolver. A throw or a null refuses the session
    409 under that name. An unconfigured service that is asked for a resume refuses `RESUME_RESOLVER_NOT_WIRED`.
  - `batch-executor.cjs` calls `boardForFor(userId, {resumeSha256})` from the stored record.
  - `career_task_bridge.js` `createWorkerBoardProvider({resumeSha256})` carries it on session creation.
- **Bundles.** Both router bundles were rebuilt (`router_core.js`, `router_core.career.js`).

## PR #108 (WO-074 standing answers): not reused
- Its store covers how_heard, relatives, work rights in other countries and office.
- It is a Deno table and module for the extension and edge path.
- It explicitly leaves US work authorization and sponsorship to the fact bank.
- None of the eight asks is in it, and the Node worker cannot load it, so this order bases on trunk and does not
  depend on it.

## Evidence
- `tests/career-loop-input.test.cjs`: 12 tests, all 12 failing on trunk first. The trunk failure for the confirmed
  master was `UNCOVERED_QUESTION` with asks work_authorization, sponsorship and cover_note; certify_true rode the
  standing attestation. They cover the following:
  - A confirmed master (Alex Testcase, TEST) reaches a doorstep on the Greenhouse-shaped form through the real
    executor and production-sources path.
  - With the work_authorization fact removed, exactly that one required question is uncovered. A draft fact behaves
    the same way.
  - The cover note is filled only from a drafted note on the payload.
  - The attestation is absent until the card's yes and is then recorded for that one application. It is bound to its
    hash; the other application stopped at a captcha and gets none.
  - The hash changes when the certification text changes.
  - A text changed between the card and the click stops `APPROVAL_PAYLOAD_MISMATCH`, with zero submits.
  - `ATTESTATION_REQUIRED` is returned without the attestation, or with one bound to another hash.
  - The resume resolver's named stops, and the board service refusing named.
- `tests/career-worker-wiring.test.cjs` changed. Its fixture now has confirmed eligibility facts, and its "answers
  ride verbatim" and "attestations ride verbatim" assertions are inverted on purpose: they pinned the defect.
- `tests/career-loop-acceptance.test.cjs` leg 1 changed. The hand-minted pre-fix approval now also carries the card's
  attestation, so the test still isolates the missing approvalRef.
- Node, the 15 touched or adjacent suites: 169 of 169 pass.
- All `tests/career-*.test.cjs`: 1838 pass and 114 fail. Exactly the same 114, file for file, fail on trunk, so they
  were there before this change: Chromium cannot sandbox in this container, `your_files` reads are missing, and
  archive tests.
- Architect suite: 646 passed, 0 failed.
- `python3 scripts/build-router-core.py --check` and `--career-only --check`: verified.

## Demo the owner can run
`node --test tests/career-loop-input.test.cjs`. It is synthetic, with no network, store or spend.

## Out of scope
- The in-turn chat path's profile (142 `batchPortalProfile`).
- A producer of per-application cover-note drafts.
- Copying resume files from the private bucket onto the worker host. That is the operator's sync into `resumeDir`.
- Any deploy, migration or live run.
- The extension and edge fill (WO-074 / PR #108).
