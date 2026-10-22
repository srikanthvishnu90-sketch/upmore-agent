# H4 needs_answers — root cause (2026-10-22)

Lane: `muse/2026-10-22-h4-needs-answers` off `muse/2026-10-22-e2e-green` @ f0f900f2.
Question: on a host where a sandboxed Chromium launches, the H4 full-facts
drive still stops `NOT_READY {state: not_submitted, reason: needs_answers}`.
Is that environment or wiring? **Verdict: WIRING — two stacked causes, one in
the test fixture, one in the product. Neither is the sandbox wall.** The wall
is real on this VM and is documented separately at the end; it is not what
the steering agent hit, and it is not what stops the drive once a browser runs.

## Reproduction (the steering agent's run, reproduced from the product's own code)

The drive's plan step is pure code over (facts, form schema): the helper's
`discover` on the mock form → `bindFields` (`scripts/career/form-bind.ts`) →
`trustedFacts` + `planApplication` (`scripts/apply.ts:227,239`). Run with
the product's own discovered schema (7 fields: first_name*, last_name*,
email*, phone, resume*, gender select, attestation checkbox*) and the
skeleton's exact fixture facts. Full output:
`~/workspace/h4-fix-package/plan-repro-output.txt`.

- **Variant A — the fixture as committed at f0f900f2:** every fact excluded,
  `why: "no positive provenance (not stated by the owner)"` ×6; manifest
  keeps only the resume. Plan: `ready:false`, needs =
  `["First Name *", "Last Name *", "Email *", "I certify that the information I have provided is true and complete."]`
  → `scripts/apply.ts:904` writes exactly
  `{state:"not_submitted", reason:"needs_answers", fields:[…those labels…]}`.
  **This is the steering agent's payload.**
- **Variant B — provenance shape fixed (below):** needs shrinks to exactly
  one: the attestation.
- **Variant D — B/C plus the certification row of the product design
  (below):** `ready:true`; the attestation is filled from
  `factId: "text-answer:cardtap-e2e-1"`.

## Cause 1 (the needs_answers cause) — fixture provenance shape

`extension/src/apply_core.ts:623` — the trust allowlist:
`POSITIVE = /^owner (stated|confirmed|typed|answered|gave|provided|picked)\b/i`,
applied at `:651`: a confirmed fact without a positive provenance is
excluded (`"no positive provenance (not stated by the owner)"`).

The skeleton seeded `provenance: "synthetic TEST profile"` on all six facts
(`tests/e2e/chat-to-confirmation.test.cjs`, `mkFacts`). That shape matches
nothing in the allowlist, so the engine judged all six facts as never
stated, and every required field became an uncovered question. The product
guard is correct and stays untouched; the fixture's shape was wrong.

**Fix (committed, `2d87ff2c`):** the fixture's provenance is now
`"owner stated (synthetic TEST profile)"` — real-shaped, still unmistakably
synthetic. The product was not weakened in any way. With it, the
full-facts plan's needs are exactly the attestation (variant B) — the
designed doorstep stop, no longer masked by three identity questions.

## Cause 2 (stacked behind cause 1) — no carrier for the card-tap attestation on the cloud path

With provenance fixed, the attestation still stops the plan (variants B, C):

- The planner never answers an attestation-classified question from a
  standing fact (`supabase/functions/_shared/career_apply.ts` planBatch:
  the certify label does not classify to a fact the answers path serves),
  and the contract judge refuses one without authorization:
  `extension/src/apply_core.ts:872` — `ownAnswerOnly(label) &&
  !tf.authorizes` → "it is an attestation or a personal choice, so it takes
  your own answer to it". The fixture's attestation fact carries no
  `authorizes`, correctly — a fixture must never pre-authorize an
  attestation.
- WO-094 already settled where this authorization comes from in the batch
  loop: **the card tap** — `run.attestations[postingKey]`, bound to the
  approved payload hash and the attestation text the card showed. The
  cloud path (`workers/career-browser/approve-first.ts` `prepare()`) has
  no equivalent carrier, so a cloud prepare can never pass a required
  certify checkbox except by re-asking the person through the text-answer
  loop (variant D proves that channel works:
  `answerKey(attestation question, posting) = label:d9b0fa3492ff82e4`).

**Product fix — DESIGN + FAIL-FIRST TEST ONLY, not committed** (approval-path
edit; needs the architect's + Vishnu's OK). Diff summary:

- File: `workers/career-browser/approve-first.ts` (the only product file).
- `EngineResult.result` gains the two fields the engine already writes:
  `posting?`, `questions?`.
- New exported `CardCertification` record: `{approval_ref, job_id,
  attestation_text, value, payload_hash}` — the card tap, carried in: the
  posting it approved, the form's certification words **as the card showed
  them**, the value the tap sends, and the hash of the card payload the
  tap approved (WO-094's binding).
- `prepare()` gains optional `certification` + `cardPayloadHash` inputs.
  On a `needs_answers` result it calls the new `runWithCertification`,
  which proceeds only if **all** hold: exactly one open question; it is
  own-answer-only (`ownAnswerOnly`); its label equals
  `certification.attestation_text` word-for-word; `certification.job_id`
  equals the engine result's `posting`; `certification.payload_hash`
  equals the caller-supplied `cardPayloadHash` (verified against the
  caller's card record, never self-asserted); the value is non-empty; the
  `approval_ref` has not been spent. It then appends the certification to
  the facts as a `text_answers` row `{id: approval_ref, key:
  answerKey(question, posting), answer: value}` — the WO-102 channel
  under which a saved own answer carries `authorizes=true` — writes a
  derived facts file and re-runs the engine once. Anything else: the
  original `needs_answers` stands, untouched. No fact is fabricated, no
  standing attestation is read, the attestation guard is not weakened.
- Fail-first test: `tests/architect/pending/h4-cloud-prepare-certification.test.ts`
  (5 tests: control, valid certification, wrong card hash, wrong
  attestation text, wrong posting). On current code: **4 pass / 1 fail** —
  the valid-certification test fails with `reason: needs_answers`, exactly
  the defect. With the diff applied in a throwaway copy: **5 pass / 0
  fail**; neighbors `wo-021-approve-first` + `ask-never-guess`:
  **25 pass / 0 fail**. Full patch and the test file:
  `~/workspace/h4-fix-package/approve-first-certification.patch` and
  `~/workspace/h4-fix-package/h4-cloud-prepare-certification.test.ts`;
  the test is also committed with this note under
  `tests/architect/pending/` (the repo's place for acceptance tests
  whose fix has not landed).

## Adjacent finding (not needs_answers) — the fixture's EEO answer is modeled in a shape this engine never sends

`answers.gender` is never planned by this engine, in any provenance shape:
the planner's direct path explicitly excludes the `eeo` key
(`career_apply.ts:858`), and an unauthorized EEO answer that does get
planned is dropped by the contract (measured: `dropped: ["Gender"]`). The
decline reaches the form only as the person's **own per-posting answer**:
measured `gender=decline` with (K) a `text_answers` row at
`answerKey(gender, posting, {haveFact}) = job:3ec0b1f025e08f34`, or (M) a
`saved` file fact carrying `authorizes: true`. So even after causes 1+2,
H4's `post.fields.gender === "decline"` assertion cannot pass with the
fixture's current gender shape. This does not gate the needs_answers
verdict (gender is optional; it never appears in needs). Re-modeling the
fixture's EEO answer as an own-answer is the architect's call — it was
left untouched here beyond the provenance shape.

## The seam layer on this VM (for completeness — not the steering agent's failure)

On this VM the drive never reaches the plan: under the operator opt-out
posture (`UPMORE_CHROMIUM_SANDBOX=off`, named), the cloud seam refuses by
design — `scripts/career/portal-browser-helper.cjs:984` (`createSession`
throws `BROWSER_SANDBOX_REQUIRED` when the posture is off) — and under the
default posture a sandboxed Chromium cannot initialize for any user
(`docs/e2e/H4-DRIVER-ERROR-ROOT-CAUSE.md`). Measured again in the rerun
below: `E2E-DOORSTEP {"ready":false,"result":{"state":"not_submitted","reason":"BROWSER_SANDBOX_REQUIRED",…}}`.
Chromium itself launches fine unsandboxed here — the helper's pump face
opened and discovered the mock form under the named posture
(`ready.json: {"chromiumSandbox":false}`, 7 fields) for the reproduction
above. Per the architect's rule (a leg is ENVIRONMENT only if Chromium
failed to launch), the opt-out drive's stop is a product refusal, and the
needs_answers stack behind it is wiring; H4/H5 are classified **WIRING**.

## H3 drain — classification from the artifacts visible on this VM

No drain **correctness** failure (lost, duplicated, or misrecorded rows)
is recorded in any artifact visible from this VM:

- The skeleton's H3 drain leg (real `runDrain` over `pg-queue.ts`, stub
  engine) **passed in every recorded run today**: skeleton base,
  H3-claimer lane, the f0f900f2 integration, the H7 branch, and this
  lane's root staged run (H1/H2/H3a/H3b/H3/H6 PASS).
- S3's PG battery (same claim/finish RPCs, its own harness):
  A1000/A1000B 1,000/1,000 reconciled, 0 duplicates, 0 worker errors.
  Its A100 first attempt stopped after 6 — the portal throttle pausing
  the portal (`portal_paused`, S3 finding A-1), drained fully on rerun.
  S3's Battery-B "drain" is a different component (the batch executor's
  cap ledger; F-034 race, design-only fix) — not the cloud drain.
- The scale-on-e2e-green claimer volume leg (real drain, in flight;
  `~/workspace/scale-e2e-green-logs/`): vol-100 finished **5/100**
  (373 claim calls, 5 claimed, 0 duplicate claims, 0 unrecorded
  finishes), vol-995 finished **10/995** (9 claim calls, 10 claimed,
  0 duplicates). Every claimed row finished exactly once and recorded;
  the shortfall is claim-side starvation (claims returning empty), a
  shape consistent with S3's portal-throttle finding. The lane has not
  published its verdict, so no final classification exists in our
  artifacts; inventing one would be worse than naming the missing log.
- The one drain-leg failure in today's runs is this lane's non-root
  rerun (below): the drain subprocess could not fetch `npm:pg` /
  esm.sh supabase-js in an unprivileged cold-cache context
  ("Failed loading https://registry.npmjs.org/pg") — environment
  (host module provisioning), not drain logic.
- The architect's environment log is not visible from this VM; if it
  records a drain failure from their environment, it is not in our
  artifacts and is not classified here.

## Rerun (item 4) — H1–H6 as a non-root user, opt-out posture

Setup: user `pgtest` (uid 1000; no other unprivileged user can traverse
`/home/hatch`), branch content copied world-readable to
`/opt/h4-nonroot/repo`, `UPMORE_CHROMIUM_SANDBOX=off` (the operator
opt-out posture, named), disposable PG16 from pgtest's own tree,
runtime 30.1s, tests 6 / pass 4 / fail 2. Full log:
`~/workspace/h4-fix-package/rerun-nonroot-pgtest-optout.log`.
(The earlier root staged baseline on the same content:
`~/workspace/h4-fix-package/run-root-staged-baseline.log` — H1/H2/H3a/
H3b/H3/H6 PASS, H4/H5 at the seam refusal, route `nobody-optout`.)

Skeleton's printed map (verbatim, its own labels):

- H1 PASS · H3a PASS · H2 PASS · H3b PASS · H6 PASS
- H3 (drain): FAILED, no map line — the drain subprocess's module fetch
  (above).
- H4/H5: printed ENVIRONMENT, from its probe of the **default** posture
  ("sandboxed Chromium launch failed: Chromium sandboxing failed!"),
  while the drive itself, under the posture it was given, stopped at
  `BROWSER_SANDBOX_REQUIRED` (doorstep, verbatim above).

Classification under the architect's rule, applied to the same log:

- H1, H2, H3a, H3b, H6: PASS.
- H3 (drain): ENVIRONMENT (this run only — unprivileged module
  provisioning; the leg's product behavior is PASS in five other
  recorded runs today).
- H4/H5: **WIRING** — under the named opt-out posture Chromium did not
  fail to launch (it launches; see the pump-face proof); the product's
  seam refused the posture, and behind that refusal the needs_answers
  stack (causes 1+2) is product/fixture wiring. The skeleton's printed
  ENVIRONMENT label is its older built-in classification of the
  default posture's launch failure; it is quoted, not relabeled, and
  reconciling the skeleton's classifier with the architect's rule is a
  named follow-up for the C5-on-trunk port.

## What is proven, what is not

Proven: the needs_answers payload and both causes, from the product's own
code on the product's own discovered schema; the fixture fix (committed
`2d87ff2c`); the certification channel end-to-end at plan level (variant
D); the fail-first test red for exactly this reason and green with the
(uncommitted) diff, neighbors green.

Not proven: a full H4/H5 PASS. That needs (a) the product diff approved
and landed, (b) the fixture's EEO answer re-modeled (architect's call),
and (c) a drive context where the engine's session can start — a
sandbox-capable host (D-010), or an architect ruling on the seam vs the
opt-out posture. On this VM the drive still stops at the seam before any
planning, in both postures.
