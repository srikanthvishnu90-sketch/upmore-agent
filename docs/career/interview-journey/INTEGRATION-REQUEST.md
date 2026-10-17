# Spec A / Muse integration request — blocked consumer boundary

Latest B source and consumer proof: [ZERO-VERSIONS-20261017.md](ZERO-VERSIONS-20261017.md).
Recovery protocol: [RECOVERY-20261017.md](RECOVERY-20261017.md).
Use its exact tested source and preserve `checkpoint.outstanding_reasoning`
through atomic persistence. A's current context-only projection has 23 passing
consumer cases against this runtime, including lossless version zero. Execution
proof profiles, nested CI discovery and registration remain A-owned work. The historical absence
at B's base and the direct-canonical failure below remain historical evidence.

B's pure module is implemented. It is **not called by the actual career entry**.
No handler, gateway, existing module, SQL, bundle or shared evidence file changed.
`node scripts/career/interview-journey/check-integration.cjs` exits 2 and names
the missing canonical schemas and absent career-bundle export. Do not report
`INTEGRATED_LOCAL` from the standalone module/VM tests.

## 1. Publish the canonical contract before registration

A owns `packages/career-contracts/journey-contract-v1.ts` and
`journey-contract-v1.schema.json`. Neither exists at base `123943e1`.
Compare them to B's frozen consumer fixtures and adapters; these are provisional
consumer shapes, not an alternative canonical contract. Resolve any differences
through an explicit versioned compatibility test before calling this reducer.

Required snapshot envelope and row fields are checked by
`packages/career-interview-journey/adapters/context.js`. Eligible facts/sources
have stable ID/version, authenticated owner/thread scope, provenance, trust and
active epoch validity. Tombstones are value-free; withdrawn bodies are absent.
No database client, credentials, raw history, tool executor or mutable profile
may be passed in. Snapshot/receipt authority must come from A, never model JSON.

The existing host's persisted store allowlist has no B journey field. Add the
versioned journey state through A's atomic owner-scoped path. The state schema
is `packages/domain/interview-journey/state.schema.json`; runtime validation
additionally checks record ownership, content hashes, immutable answer binding
and minute arithmetic. Early module increments were provisional; use the final
source and its fixtures together rather than mixing checkpoint implementations.

The selected target fact must explicitly identify `role_family:
software_engineering` and `level: early-career` to confirm this full slice.
Unknown classifications allow general project practice without a software-depth
claim. Other roles/levels retain truthful evidence and return unsupported full
coverage. B does not infer a role family by keyword matching a job title.

## 2. Register and persist one pure transition

Export `CareerInterviewJourney.planInterviewTurn({snapshot,state,event})` in
the actual career bundle and opt-in interview route. A suggested source order,
verified only in a no-IO VM, is:

1. `packages/domain/interview-journey/hash.js`
2. `packages/career-interview-journey/rubrics/index.js`
3. `packages/career-interview-journey/adapters/context.js`
4. `packages/career-interview-journey/prompts/assessment-v1.js`
5. `packages/career-interview-journey/adapters/reasoning.js`
6. `packages/career-interview-journey/adapters/research.js`
7. `packages/career-interview-journey/adapters/artifact.js`
8. `packages/career-interview-journey/adapters/legacy.js`
9. `packages/domain/interview-journey/pack.js`
10. `packages/domain/interview-journey/index.js`

The modules use guarded CommonJS exports for Node tests and named constants for
bundle composition. A owns generator registration and generated output. B did
not regenerate unregistered bundles to create a false integration pass.

Recheck `expected_binding` at commit: owner, thread, erase epoch, account
version, thread revision, context hash and journey revision. Commit state,
attempts, output and receipts atomically. Same turn key/body replays the committed
response; changed input conflicts. B's last-event replay is a pure convenience,
not a replacement for A's durable request receipts. An erase fence precedes it.
Do not hold a database transaction open over model or research work.

Translate host-approved intents into typed events with host-assigned ID/time.
Do not pass an untrusted model object's `type` through as a host event.
Supported commands include `start`, `submit_answer`, `begin_practice`,
`begin_revision`, `begin_transfer`, `select_question`, `style_edit`, `pause`,
`resume`, `stop`, `time_change`, `context_changed`, `read_source`, `tool_result`,
`model_candidate`, `build_pack` and `artifact_readback`.
`user_turn` explicitly requests host interpretation and does not grade/reset
ordinary text. Answer-plus-side-question is one explicit submission. A revision
or practice answer must carry its kind. Preserve the checkpoint on task switch.

## 3. Admit reasoning through the existing paired budget/checker path

`coach_answer` carries a bounded structured request, prompt hash, input digest,
source refs and output ceiling. Stage input cap is 24,000 UTF-8 bytes; oversized
complete answers remain saved and produce a block, never silent truncation.
A must enforce actual token ceilings and reserve generation **and** checking
together under the original shared allowance. One pending assessment per turn;
candidate acceptance emits no recursive coach action. No automatic repair loop.

`approval_requirement: host_derived` is a marker for A to derive the requirement;
it is not an approval or a permission override. Closed action types are ask,
coach, product-local draft, approved source read and owned status read. No send,
apply, purchase, third-party draft, new provider or account access is possible.

After A's real checker accepts a candidate, place a trusted receipt in the
snapshot with `type: semantic_candidate`, ID, owner/thread/epoch, action ID,
action `input_digest`, reasoning `request_digest`, candidate SHA-256, accepted
verdict, generator identity, original `request_binding`, and current
`validated_binding`. Then deliver `model_candidate` with action/receipt IDs and
the exact candidate. A must revalidate after intervening context changes.
Rejected/missing/unavailable checks do not become accepted receipts.

The candidate includes answer meaning, five question-specific dimensions with
exact answer offsets or a precise missing criterion, rationale and uncertainty,
one supported strength and gap, matching exercise, different transfer question,
feedback, and optional fact-linked draft. Optional checked source brief and
evidence-linked priorities carry canonical source refs. Only A's checker can
establish factual admission; independent experts still must judge coaching
quality. B has no keyword grader and never calls legacy `scoreAnswer`.

## 4. Preserve actual source and correction authority

Research capability `research.exact_url.v1` must resolve a source ID to an
approved URL under the existing policy. A owns URL/redirect/security checks.
Its trusted capability entry lists `approved_sources` with `source_id`, version
and exact URL. An `approved_url` string inside untrusted source content cannot
approve itself; B also checks the host capability list before proposing the read.
Queued/running are pending; unknown observes the owned action rather than
launching another task. Failure leaves practice available and packs partial.

For success, provide a matching owned tool-status row, readable source record,
and `source_capture` receipt binding the action/input/source/content hash and
current validation binding. A capture includes requested/final URLs, title,
publisher, classification, as-of timestamp, completeness and supplied/retrieved
origin. `content_sha256` binds the actual excerpt. Neither a model citation nor
a job requirement becomes a personal qualification.

For `context_changed`, supply IDs of host snapshot invalidations, each with
`evidence_id`, kind (`correction`, `withdrawal`, `resume_replaced`,
`target_changed`), and value-free metadata. Supply current target/resume refs
when replacing those selections. Independent research and declared time survive;
dependent feedback/drafts become stale. Withdrawal strips dependent values from
active state/prompts/packs, including nested assessment/draft payloads. Epoch
change cancels old state/results/replays. A owns historical-record/backups policy;
B does not promise a deletion that A has not verified.

## 5. Persist and reopen actual preparation bytes

`build_pack` proposes `create_draft` with a structured ten-section pack,
deterministic Markdown and manifest. `adapters/artifact.js` validates payload
scope, both hashes, MIME, encoding and length. Create the product-local document
and supported downloadable UTF-8 file from those bytes. Do not fabricate a URL.
Missing sections remain explicit partial outcomes.

Before delivery, A performs an authorized open/download and fresh-session byte
readback. Put the readable artifact in `snapshot.artifacts` and a trusted
`artifact_readback` receipt in `snapshot.receipts`: owner/thread/epoch,
artifact ID/version, action/input digest, SHA-256, exact target/resume refs,
journey revision, current validated binding, `authorized_open: true`,
`fresh_session: true`. Then deliver the typed readback event. Hash-only receipts
or absent/altered bytes cannot complete. Reopen directly against the saved pack
checkpoint; an intervening state revision requires a new pack/readback.

## Required composed verification, owned by A/Muse

- Native SQL: failed atomic commit, exact replay, owner collision, erase epochs,
  context/version races and restart with the new journey store.
- Actual staged authenticated entry: current resume and role context -> admitted
  real or explicitly scripted candidate -> practice/revision/transfer -> saved
  file -> new-session reopen, plus late correction, pause and source failure.
- Bundle freshness and legacy compatibility on the exact composed SHA.
- Paired model/checker accounting, unknown-outcome stop and original-cap receipts.
- Real evaluator-controlled quality gate and eventual authorized deployed journey.

Current blockers are missing A schemas/registration/store/artifact proof, not an
approval denial. No dependent integration was attempted through another route.
No credentials, SQL, production changes or provider calls are required from B
to hand off this concrete source and consumer evidence.

## Depth-audit additions to agree against A's canonical contract

The follow-up at `AUDIT-20261016.md` changes B records and closes reproduced
completion/continuity gaps. These remain **consumer proposals** until the actual
A schema and producer examples pass the compatibility runner. B does not create
or replace `packages/career-contracts` files.

### Admitted generation/checker failure and reconciliation

Success is not the only terminal path. A delivers `reasoning_result` with the
owned action ID and a trusted `reasoning_outcome` receipt ID. The snapshot receipt
contains owner/thread/epoch, original action/input/request digests,
`request_binding`, current `validated_binding`, `outcome_status`, `failure_kind`,
`budget_state`, paired `reservation_ref` and `usage_receipt_refs`.

- Outcome status: `failed`, `unknown`, `unavailable`, `blocked`, `stale_context`.
- Failure kind: `generation_failed`, `checker_failed`, `checker_rejected`,
  `generation_timeout`, `checker_timeout`, `provider_unavailable`, `stale_context`.
- Budget state: `settled` or `uncertain`. `unknown` cannot claim settlement.

A must derive these fields from actual admissions, usage/timeout reconciliation
and its durable receipts. A failed checker may still incur generation and
checker costs. A cancellation or B checkpoint change never releases a
reservation. A must reconcile/account outcomes even when B ignores an old reply.
No model/user field can settle a call or reset the original shared allowance.

B retains the exact answer and failure record, clears the active pending slot,
and proposes no automatic generation retry. Definite settled failure permits an
explicit new-turn `retry_assessment` citing the terminal outcome receipt and,
optionally, the saved attempt ID. A admits that separately under the paired
budget policy. Retry does not fabricate an assessment or mutate the answer.

Uncertain outcome proposes only `read_action_status` for the original owned
action. New answer text can be stored, but new pairs remain blocked. A terminal
host reconciliation receipt is required before retry. Late results for the old
action cannot overwrite a newer pending assessment or selected draft. Direct
promotion of an uncertain late success is not implemented: A must first expose
an explicit reconciled outcome/consumption contract rather than silently revive
a cancelled slot. The actual budget/accounting tests still belong to A.

### Dependencies, asks and completion

`submit_answer.source_refs`, if supplied, must be host-bound canonical refs for
that answer. Without them, B retains a conservative dependency set. Retrieved
refs are stored separately from answer refs and admitted candidate reference
declarations. A must not call those declarations independently measured semantic
use. Source/target/resume binding remains mandatory for context-specific output.

B-local unresolved asks now have stable ID/kind/text/source-event metadata.
Candidate `ask_responses` contains matching ask ID, actual answer text and
eligible evidence refs; only explicit responses resolve those asks. Style edits
consume their own instruction, supersede the selected wording and create no new
competency grade. A should map canonical ask IDs explicitly when its schema is
published rather than treating prompt-local aliases as durable identities.

Coverage requires question-specific core dimensions, or the targeted practice
dimension. Transfer checks retain the originally probed competency separately
from the model's next suggested gap. `not_assessed` provides no coverage. Scores
remain practice inferences; a supported score of zero records a judged gap and
never implies readiness. Timing changes mean **minutes remaining now**, anchored
to the lifetime elapsed counter. Corrections retain pause/stop status and sanitize
both current and saved questions; resume/submission recheck current role scope.

### Actual canonical-schema consumer check (A publication now available)

A published its actual canonical files at
`3a41cd456cbdbe53639275ae83096b9fb91aa33d`. B does not copy or edit them.
Run the check directly against that exact fetched Git object:

```sh
npm ci --prefix scripts/career/interview-journey --ignore-scripts
git fetch origin 3a41cd456cbdbe53639275ae83096b9fb91aa33d
node scripts/career/interview-journey/canonical-compatibility.cjs --producer-ref 3a41cd456cbdbe53639275ae83096b9fb91aa33d
```

The runner reads A's exact schema, TypeScript validator, `freeze.json`,
`valid.json` and `invalid.json` from `packages/career-contracts`. It verifies A's
frozen hashes, checks the TypeScript validator's embedded schema against the
schema bytes, runs the actual A validator plus pinned Ajv/formats, and passes
A's frozen context unchanged to the B consumer. No B-authored positive fixture,
shadow schema, field coercion, repaired producer example or weaker validator is
substituted. A metadata/authority negative that JSON Schema alone cannot reject
must still be rejected by A's own runtime validator.

Observed result: A's **3 valid and 9 invalid examples pass their 12 expected
checks**. B rejects the **one genuine A context** with `foreign evidence
owner/scope`, because its provisional row DTO differs. **Canonical compatibility
FAIL; zero B canonical transitions executed.** A files are available; the
remaining blocker is incompatibility, not their absence.

See `CANONICAL-COMPATIBILITY-3a41cd45.md` for exact differences and proof-profile
requirements. Spec B section 15 says to stop dependent work when A's contract
is incompatible. B therefore does not register the provisional reducer, invent
receipt encodings, or weaken A's schema to manufacture a pass. A/B must agree the
versioned event/proof projection, then B can build the pure DTO adapter and rerun
these same producer examples plus genuine A journey cases.

The existing CI Node glob is `tests/*.cjs`; it does not discover the nested B
directory. A/Muse must add the explicit B contract command to CI during actual
registration, then add the canonical consumer command. B runs its own contracts
separately and does not count the old CI glob as execution of the new module or
as interview-quality evidence.
