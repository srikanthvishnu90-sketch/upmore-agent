# Flexible grounded career responses

Source-only depth packet; actual model/semantic-verifier quality and live browser tasks NOT_RUN. Expectations frozen before implementation.

| ID | User-observable requirement |
| --- | --- |
| T01 | Free-form paragraphs, questions and draft revisions beyond the closed selector are accepted only after a trusted semantic verifier certifies the whole response and claim coverage. |
| T02 | Unavailable semantic verifier denies before generation; throwing, timeout, malformed, partial or stale verifier receipts fail closed without another inference. |
| T03 | Known evidence IDs alone never imply entailment; a schema-valid fabricated degree or unsupported metric is rejected by a denying semantic verifier. |
| T04 | Unlisted personal assertions hidden in advice, empathy, hypotheses, question presuppositions or draft prose require whole-response coverage verification. |
| T05 | No action, memory patch, approval, tool or completed-execution receipt is accepted from model text or extra authority fields. |
| T06 | Current owner/thread revision/version/epoch bind the context, response, verifier receipt and final atomic commit. |
| T07 | Read-only bounded recent dialogue comes from committed owned current-epoch receipts; prior model prose and user dialogue are not canonical facts. |
| T08 | Correction, withdrawal, pause and erase barriers exclude older dialogue and stale drafts, including other owner-thread histories; tombstones omit revoked values. |
| T09 | Owner-scoped sourced facts expose active, corrected or disputed status; only active/corrected evidence may support factual claims. |
| T10 | Current draft/revision, goals and pending asks are context data; draft text is advisory and cannot become a personal fact. |
| T11 | Untrusted posting includes jd_text with separate source IDs; source assertions cannot prove the person meets requirements or a live opening exists. |
| T12 | Actual entry uses server-owned injected verifier only; HTTP request/headers/env strings cannot supply verification authority. |
| T13 | Shared original-cap admission/consume/uncertainty-stop/raw-usage settlement remain unchanged; unavailable budget prevents generation and verifier inference. |
| T14 | Generated response/draft metadata commits atomically; failed-save retry and exact replay cannot trigger a second provider call. |
| T15 | Zero-cost held-outs retain all transcripts/failures; mocked semantic accept/reject decisions are not actual entailment or model-quality evidence. |

## Executed source-only depth proof

On local implementation a25b874b: 52 flexible contracts (including all T01–T15 and twelve frozen held-outs), 14 native SQL cases and 15/15 killed intentional defects. [Mutation specifications](../../evals/depth/CAREER-FLEXIBLE-GROUNDING.mutations.cjs) run only in a temporary detached worktree; [results and per-defect logs](../testing/runs/career-flexible-grounding-20261016/mutations-certified/results.json) retain every rejection. Generation and semantic verdicts are scripted; this proves contract enforcement, not actual entailment or model quality.

The overall release gate is NOT_READY: inherited C37 remains red, actual model/semantic quality and all 15 browser tasks NOT_RUN, original shared $5 unreconciled, Muse integration/deploy pending. No capability registry status was promoted. See the [handoff report](../testing/career-flexible-grounding-20261016.md).
