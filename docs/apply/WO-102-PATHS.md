# WO-102 on every path: the audit

The second judge's submission-quality contract is the extension's own code, `extension/src/apply_core.ts`:
`trustedManifest` (the positive fact allowlist), `contractFill` (each planned answer judged: required and unsupported is
asked, optional and unsupported is left empty, an attestation or personal choice only on the owner's own answer),
`quarantinedFact` and `QUARANTINE_VERSION` (D-007). Every other path that can submit an application reuses those
functions (imported; the Node path loads them from the generated bundle `extension/lib/trainee-core.js`, which
`extension/build.ts --check` keeps identical to the source). Nothing is copied.

Tests: `tests/architect/wo-102-paths.test.ts` (A: the engine, B: the person's own computer, C: the cloud, D: the batch
profile). Each case stops on a contaminated fixture, an F-033 fact, the answer-all delegation's provenance, a legacy fact
with no provenance, a fact with no confirmation event, a forged reserved id, a cross-user fact and a texted answer that
disagrees with the file; a clean owner-stated fact set still goes.

## The paths

| Path | Verdict | Where |
|---|---|---|
| Desktop terminal engine, `scripts/apply.ts` (dry run, `--submit`, `--approved`, `--person-submits`, `--email-code`) | Enforced | `trustedFacts` (`scripts/apply.ts:178`) replaces the old `confirmed()` filter, which kept any `confirmed:true` record; it runs at `scripts/apply.ts:361`. Each form step plans through `planApplication` (`:190`, used at `:803`): `planBatch` on the trusted facts only, then `contractFill`. The approval hash binds each answer's fact, confirmation event, provenance, attest flag and the quarantine version (`approvalSources`, `:212`, bound at `:922`). |
| Person's own computer, `workers/career-browser/approve-first.ts` (`prepare`, `prepare-batch`, `run`, `run-one`) | Enforced | Every one of these runs the engine above. `prepare` carries each answer's source into the payload (`:90`). `prepare-batch` gives the engine the texted answers beside the facts file (`engineFacts`, `:199`, used at `:641`) rather than through `factsWithTextAnswers`, where the file silently won a disagreement. Now a conflict is asked again. `runApproved` refuses a payload with a quarantined, delegated, derived-from-quarantined or source-less texted answer, or one approved under other quarantine rules, before anything opens (`payloadTrust`, `:182`, checked at `:223`). The engine then judges the rest again from `factsFromPayload` (`:146`). |
| Cloud worker, `workers/career-cloud/worker.ts` (the `career_apply_cloud_claim` path) | Enforced (and off by default) | It can submit once the owner turns `CAREER_CLOUD_APPLY` on (`supabase/migrations/20261021080000_career_apply_cloud.sql:125-127`) and a portal family passes the gate (`:143`, `:395`). It writes `factsFromPayload(p)` (`worker.ts:130`) and runs the same engine with `--submit --approved` (`worker.ts:132`), so every answer is judged by `trustedFacts` + `contractFill` before anything is filled. A legacy payload (no provenance) is asked again. An F-033, delegated or forged answer is excluded and asked. Nothing is sent. The early `payloadTrust` refusal is not wired into `worker.ts`, because that file is outside this order; the engine's own refusal comes later in the same run. |
| J10 batch executor, `workers/career-browser/batch-executor.cjs` + `board-service.cjs` (module 155/149 drive) | Enforced (and gated) | Its answers come only from `production-sources.cjs` `profileFor`. The master's facts and basics now pass `trustedManifest` first (`trustedMaster`, `production-sources.cjs:74`, `:86`, applied at `:171`). A `status: "confirmed"` label alone derives nothing, standing `defaults` are not read, and identity comes from basics only when the basics carry the owner's own confirmation. Driving is also gated: `board-service.cjs:108`/`:137` refuses every family with no driveable verdict in the operator's config, which this repo does not set. |
| Task worker, `workers/career-browser/service.cjs` / `run.cjs` | Unreachable for a real employer | `service.cjs:18` refuses any portal that is not `http://localhost` / `127.0.0.1` (`CONTROLLED_LOCAL_PORTAL_REQUIRED`). |
| In-turn chat drive (`agent-chat` → module 149 board) | Unreachable | `supabase/functions/agent-chat/handler-career.ts:215-232`: the Edge runtime has no synchronous board transport, so the board factory resolves null (`BOARD_NOT_WIRED`). Batch asks are delegated to the J10 executor above. |

## What changed for callers

- The engine's facts file must hold facts as the contract keeps them, each with a positive `provenance` ("owner stated
  ...") and a `confirmation_event_id`. Texted answers go beside the facts as `text_answers: [{id, key, kind, answer}]`.
  The engine excludes a file fact that carries a reserved id (`text-answer:`, `approved-local-resume:`,
  `essay-draft:`).
- The engine's result for a stopped posting (`needs_answers`) adds `contract: [{label, why}]` when the contract turned an
  answer back into a question. Its evidence adds `trust` (manifest hash, quarantine version, excluded fact ids and
  reasons, never values) and `sources`.
- A payload prepared before this change has no sources, so its run is asked again (`needs_answers`), and nothing is
  sent. Prepare it again.

## Not done here (outside this order's files)

- `tests/career-cloud-worker.test.cjs` (the cloud worker's own browser test) writes legacy facts (no provenance) at
  lines 70-71. Under the contract its prepare now stops, as it must. That file needs `provenance` and
  `confirmation_event_id` on those two facts.
- `deno check scripts/apply.ts` (gate step `apply-cli-typecheck`) now also type-checks `extension/src/apply_core.ts`.
  That file has an existing TS2345 at `apply_core.ts:208-209` (`postings: []` is inferred as `never[]` in
  `answerOnceQuestions`), which needs a one-line type fix in the extension.
- `workers/career-browser/ask-once.ts` `factsWithTextAnswers` still lets the file win a disagreement. No submission path
  uses it any more. Changing it would make the extension bundle stale, and the bundle is not in this order's files.
