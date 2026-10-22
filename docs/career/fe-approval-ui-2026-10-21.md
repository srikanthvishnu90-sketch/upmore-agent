# FE-B — Approval card + ask-when-missing UI (module 175)

Owner direction 2026-10-21 16:32 CDT (frontend-first), correction
16:34 CDT: **no extension** — the Messages approval card IS the
approval mechanism for the cloud-worker batch. The worker claims and
drives ONLY against a batch whose card the owner tapped, bound to the
exact payload hash. Module 175 (`packages/domain/175-career-approval-ui.js`)
is the card layer over today's engines; it rebuilds none of them:

- **155** owns prepare and the approval mint (`approveRun` →
  `approvalRef = batch:<runId>:<cardSha256>`, per-application payload
  hashes, only from `awaiting_approval`, only over the re-verified
  card set hash).
- **172** owns ask coverage/intake (stated facts only; typed parsing;
  confirmed facts with `owner_reply` provenance; the resume signal).
- **173** owns the re-prepare + card ledger (all-answered → NEW card;
  old card SUPERSEDED; `validateApproval` refuses by name).

## What 175 adds

1. `buildBatchCard` — the approval card **model** (pure JSON) from a
   batch in either real shape: a live 155 run (apps at doorstep) or
   the executor's stored shape (`career_batch_run/v1`, apps at
   `awaiting_attestation` under the card set hash). Renders the exact
   answers with the caller's provenance basis (REAL / TEST-INVENTED /
   UNANSWERED-STOP) and ONE approve action bound to
   `{run_id, card_sha256}`. `renderCardText` (Messages shape) +
   `renderCardHtml` (the in-chat element).
2. `tapApprove` — the tap. With a live 155 run it calls 155's own mint
   and reads the record off the run; against a stored batch state it
   mints the identical record shape under the identical binding. The
   record carries `attestationsSupplied: ["certify_true"]` — the tap
   is the per-batch attestation step. Supersession is checked FIRST
   (with a 173 ledger, its verdict names `CARD_SUPERSEDED`; successive
   prepares of one job carry successive run ids, so the ledger — not
   the run id — is the authority on which card is current).
3. `claimBatch` — the cloud executor's claim gate as a pure check
   over (approval record, current batch state): `CLAIM_NO_APPROVAL`
   (untapped), `CARD_SUPERSEDED` (hash moved / ledger verdict),
   `CLAIM_REF_MISMATCH`, `CLAIM_NOT_APPROVED_STATE`,
   `CLAIM_PAYLOAD_MISMATCH` (an approved payload changed). Only a
   surviving record yields a claim. This is the TEST-world proof of
   the record contract; the DB write (career_apply_cards / claim
   RPCs from the closure) is the host seam, unchanged.
4. `buildAskCard` — tappable cards from 172's queue shapes:
   `yes_no` → two_option (Yes/No) · `number` → option_stepper
   (value chips + free entry) · `month_year` → month_picker (12 month
   chips for the STATED graduation year; no stated year → a named
   text_reply fallback, never an invented year) · anything else →
   text_reply carrying 172's accepted shape. Every option carries the
   exact `reply_text` a typed reply would have sent.
5. `tapAskCard` — routes the option's reply_text through 172's
   `intakeReply` bound to the card's question_id; the stored fact and
   the resume signal surface verbatim. `all_fields_covered` is the
   signal the host hands to 173's watcher → re-prepare → NEW card
   (rendered by `buildBatchCard` again — never a silent payload
   change under an old tap).

## Proof (owner's named test)

`tests/career-approval-ui.test.cjs` — **5/5 legs**:

1. The staged TEST card (fixture of the real stored record) renders
   hash `0a67147c…` with the corrected basis: sponsorship + YoE REAL
   (owner-stated 14:10), grad month UNANSWERED-STOP, cover note + EEO
   TEST-INVENTED; the approve action binds `{run_id, card_sha256}`.
2. Staged tap → record (`batch:batch-1ada7107528f:0a67147c…`,
   certify_true supplied) → claim OK; untapped → `CLAIM_NO_APPROVAL`;
   superseded → `CARD_SUPERSEDED` for both the claim and a stale tap.
3. Live 155 leg: prepare → card → tap runs 155's mint on the run
   itself → claim OK; tampered payload → `CLAIM_PAYLOAD_MISMATCH`;
   double-tap → `NO_RUN_AWAITING_APPROVAL`.
4. Ask cards on a SCRATCH copy of the TEST profile (separate identity
   `fe-b-scratch-2026-10-21@test`; the real TEST profile is never
   mutated — asserted by deep-equal): queue = exactly sponsorship /
   years_of_experience / graduation_month; controls two_option /
   option_stepper / month_picker; taps store No / 3 / "2029-05"
   (month precision only) as confirmed facts with `owner_reply`
   provenance; signals `fact_stored`, `fact_stored`,
   `all_fields_covered`; re-assessment covers all three as REAL.
5. The 173 chain end to end: asks answered → re-prepare → card v1
   (answered fields join the basis as REAL with owner-reply stamps;
   grad month leaves the stops) → 175 tap + claim OK → a correction
   (June) re-prepares → v2 supersedes v1 → old tap and old claim
   refused `CARD_SUPERSEDED` (ledger verdict) → v2 taps + claims.

Real-record harness (`~/workspace/fe-approval-ui/run-proof.cjs`,
artifacts beside it): the same chain against the actual
`run-staged.json` + `provenance-manifest.json`, including a 21/21
tag cross-check of every card line against the manifest. Surface
label: **harness render (tier 2)** — the chat host emitting these
models into Messages is Claude's wiring seam (below); nothing here
is a deployed chat surface.

Neighbors in this tree: 172 suite 18/18 + 173 suite 11/11 (vendored
byte-identical, sha256 `2f4f6ebf…` / test `ac06f626…`).

## Integration seams (named, not built here)

- **Chat host emission** (Claude's lane): the host renders
  `buildBatchCard`/`buildAskCard` models into the channel (Messages
  text shape ships with the model; the HTML element is the in-app
  surface) and routes tap callbacks to `tapApprove`/`tapAskCard`.
  Ask delivery/answering in production rides 173's documented shapes
  (`career_apply_questions_open_as` / `career_apply_question_answer_as`);
  172's session is the intake contract (see
  `docs/career/missing-fact-ask-contract-2026-10-21.md`).
- **Claim consumption**: the cloud executor calls the claim gate (or
  its DB equivalent) before claiming; the record shape proven here is
  the contract. The DB-side approval write is the host seam.
- **173 vendoring**: 173 is vendored byte-identical from
  `muse/2026-10-21-reprepare-card` @ `3625f74e`; dedupe at assembly,
  same as 167/170 under 172.

## Posture

Flag OFF throughout; zero submits; TEST + scratch identities only;
no deploy (a deploy is the owner's word on an exact commit — this is
built-not-deployed).

## What I need from you

Nothing for this block. The deploy word and the chat-host wiring
(Claude's seam) are the named next steps, in that order.
