# Interview preparation journey — Spec B module handoff

The new pure journey and its offline adapters are implemented on
`codex/spec-b-interview-depth-20261016`, based on `123943e1`.
All changes are new files inside the six B-owned namespaces.
The frozen Library inputs and ownership boundary are in [OWNERSHIP.md](OWNERSHIP.md).

**Module status: CONTRACTS_BUILT. Product integration: BLOCKED. Actual coaching
quality: NOT_RUN. Overall live readiness: NOT_READY.**

The first slice covers early-career software preparation: truthful project
narrative, static technical reasoning and evidence-based behavioral work. It
tracks one active question, exact immutable attempts, assistance, question/rubric
versions, feedback and draft lineage, targeted practice, revision and a changed
transfer situation. Missing company/stage does not block experience practice.
Minutes now, interview time/timezone and daily study are separate fields.

The reducer does no IO and makes no provider/tool calls. It proposes closed
actions for A. Reasoning requests contain actual answer text, selected evidence,
rubric anchors, recent eligible dialogue, hints, side questions and explicit
omissions. Oversized answers are retained whole and blocked. Semantic candidates
require trusted receipt and attempt binding; passing structure is not proof of
meaning. Feedback is a provisional practice judgment, never a hiring score.

Typed corrections invalidate dependencies; unrelated research/time survive.
Withdrawal removes dependent payloads from active requests and packs. Old epoch
state cannot replay an answer or revive a draft. Pause/resume persists the exact
checkpoint. Style edits change a selected draft without rewriting canonical
facts. Stale and out-of-order responses cannot replace the current selection.

Research reads exact host-approved source IDs/URLs only. Actual captures retain
provenance and readable bytes; queued, failed and unknown remain distinct.
Role requirements cannot become personal skills. Optional receipt-bound source
synthesis and priority reasons influence the plan, while deterministic arithmetic
keeps allocations within the supplied time. B never uses the old keyword grader.

The pack serializer creates ten structured sections and the same content as a
UTF-8 Markdown file. It uses accepted current components without another model
call. Assembly is not delivery. Full completion requires host-authoritative
save/open/new-session readback; partial work remains partial.

## Reproduce the zero-cost checks

```sh
node --test tests/career-interview-journey/*.test.cjs
node scripts/career/interview-journey/check-contracts.cjs
node scripts/career/interview-journey/negative-controls.cjs --output /tmp/new-interview-controls
node scripts/career/interview-journey/artifact-demo.cjs --output /tmp/new-interview-pack
node scripts/career/interview-journey/evaluate.cjs --mode scripted-contract --manifest evals/career-interview-journey/development-manifest.json
node scripts/career/interview-journey/check-integration.cjs
```

The last command deliberately exits 2 with the missing A schema/entry blockers.
Output directories must not already exist; failed evidence is never overwritten.
Real-provider mode always refuses this assignment's absent authorization, actual
route, evaluated checker, reconciled shared allowance and protected holdouts.
There is no hidden provider transport or budget initialization.

## Evidence interpretation

Final tested source: `01d99b524cfef8c524a5a9d14d4a11c59d7212cc`.
[Exact run manifest](evidence/B3-final/results.json) records commands, source,
prompt/rubric/fixture hashes and untouched A-owned file hashes.

| Check | Observed result |
| --- | --- |
| Offline contracts, including 24 frozen structural reserve cases | 73/73 pass |
| Planted contract defects | 10/10 caught by assertions |
| Portable no-IO module load | Pass; included in the 73 |
| Actual UTF-8 preparation file | 26,873 bytes; fresh-process open/hash verified |
| Existing generated bundles | Fresh; B is still unregistered |
| A integration consumer | Expected BLOCKED, exit 2 |
| Real-provider runner | Refused, exit 2; zero calls |

Open the [preparation pack](evidence/B3-final/artifact/interview-preparation.md),
[structured pack](evidence/B3-final/artifact/prep-pack.json),
[ordered scripted turns](evidence/B3-final/artifact/ordered-turns.json), and
[readback report](evidence/B3-final/artifact/result.json).
These contain fictional development data only. The one scripted episode has six
answer submissions, not 73 conversations. Its memory layers are local storage
1/1, scripted request retrieval 6/6, and real semantic use 0/0 NOT_RUN.

Remote `codex/career-critical-repairs-20261016` at `5ab2cc94` was also inspected;
it contains neither canonical journey-contract file. This is a missing dependency,
not an approval denial. All existing tracked files remain byte-identical to base.

[B0 freeze](evidence/B0-freeze.json) records the missing-module baseline before
implementation. [B1](evidence/B1-contracts.json) is the first three consumer tests
plus boundary checks. [B2](evidence/B2-contracts.json) expands the source, practice
and artifact checks, with the initial failures preserved. These are tested
increments, not three independent product-quality evaluations.

The scripted development scenario has one fictional episode with six explicit
answer submissions. It exercises project practice/revision, unassisted transfer,
technical reasoning, behavioral evidence and a pack. Its generation/checker
receipts are test fixtures. No person was coached and no model quality score was
measured. File-sink readback proves local bytes and JSON serialization; it does
not prove the actual host's atomic database durability or deployed delivery.

Ten planted defects cover foreign evidence, invalidated answers, fake captures,
posting-to-skill promotion, changed graded answers, lost interruption checkpoints,
keyword auto-grading, stale packs, false aggregate improvement and skipped file
readback. Mutation failures must be assertions, not syntax/import failures.

Twenty-four frozen reserve cases are builder-authored structural boundary tests,
separated from runtime prompts. They are **not** the independent evaluator's
twenty-four semantic episodes. The latter require unseen evaluator content,
frozen hashes, two independent reviewers, qualified technical review, preserved
disagreements and blinded legacy comparison. The [protocol](../../../evals/career-interview-journey/protocol.json)
locks their counts and gates; protected content/hashes and all real results are
currently absent.

Report memory separately: local file storage round trip, exact scripted request
retrieval, and actual semantic use. The first two are test evidence; real use
quality is NOT_RUN. Never add assertions, mutations or repeated requests into a
count of successful conversations.

## Remaining work and ownership

[INTEGRATION-REQUEST.md](INTEGRATION-REQUEST.md) gives A the exact schema,
event/receipt, bundle, atomic persistence, research and artifact requirements.
A's shared schemas and actual entry registration are absent. No `INTEGRATED_LOCAL`
claim is made. A/Muse must verify the exact composed build through its staged
entry and native SQL tests, then arrange independently authorized real quality
and deployed verification. B does not edit those files to unblock itself.

No paid/provider calls, Browserbase, credentials, SQL/production mutation,
external messages, deployment or shared-branch merge occurred. Fifteen real
browser outcomes remain a separate release-owner gate, all NOT_RUN here.
