# Canonical host proof and durable-reference contract v1

Proposed shared A/B contract for review. This supplements the frozen canonical
v1 DTOs; it does not reinterpret `ReceiptV1.observed_state` as encoded JSON.
No production implementation or proof-authentication pass is claimed here.

## Trust boundary and carrier

The canonical snapshot and event remain unchanged v1 envelopes. A host-generated
event carries `payload.host_proof_profile` with one versioned profile below,
and `payload.proof_ref` matching an owned canonical `ReceiptV1.receipt_id`.
The entry resolves that reference from authoritative owned records. It rejects
client-supplied proof objects, result flags, cost statements and grant metadata.
B's pure adapter validates the typed profile and binding; it receives no lookup
client or permission to mint proof. Schema-valid JSON and `authoritative: true`
alone cannot establish a successful result.

Every profile contains `profile_version`, `receipt_ref`, `owner_id`, `thread_id`,
`epoch`, `action_id`, `input_digest`, `request_digest`,
`original_request_binding`, `validated_binding` and `issued_at`.
Both binding objects use the exact canonical `ExpectedBindingV1` shape.
Their owner/thread must agree with the profile and current snapshot. Accepted
candidates and successful reads require the same current epoch throughout.
An accounting-only outcome may reference an older erased request epoch while
its validation/profile epoch is current; it carries no old content and cannot
restore that journey, approve work or accept an old candidate.
The original binding matches the saved action; the validated binding matches
the current revalidated event. Their account/thread/journey revisions may differ
after the attempt is durably prepared. An arbitrary later binding is not a rebase
grant; A rechecks the same source versions, current privacy state and CAS.

Canonical `item_version: 0` is valid. A/B adapters preserve zero exactly; they
do not drop the item or renumber it to pass a provisional validator. Current B
`a5f7557d` still requires positive internal versions and needs an owner change
before zero-version canonical cases can execute. Scope checks stay strict.

## Exact reference resolution and durable payloads

Canonical coach args remain answer/question refs and rubric revision. Their
action ID resolves to an A-owned action record in the existing career state/KV
store, under `career:journey-action:<thread>:<action_id>`.
That record is committed atomically with the prepared journey checkpoint and
contains the full original B proposal, complete reasoning request, event,
original binding, dependency versions, normalized canonical proposal and phase.
It survives subsequent turns and process restarts. `last_event.proposed_actions`
is not the durable store: B overwrites it on the next event.

`input_digest` keeps its original meaning: SHA-256 of B's canonical full action
args, including the complete request, prompt hash and output ceiling. It is not
replaced with a hash of three shortened refs. `request_digest` hashes the complete
canonical reasoning body. A resolves immutable bytes by owned action ID,
verifies both digests and checks that the exposed coach refs agree with those
bytes. The actual provider request has a separate exact wire-body SHA-256.
Nothing is silently regenerated from a changed checkpoint or shortened to fit.

Preparation must preserve the exact answer and payload before provider dispatch.
If the host uses an internal prepared-state commit, later admission/receipt uses
the new validated binding while retaining the original request binding. Status
reads never increment the version. Provider work holds no transaction open.
Correction/withdrawal/erase invalidates or removes affected stored payloads;
full erase covers this existing owned KV namespace. Billing records contain no
reasoning payload. A retry observes the existing attempt and cannot send twice.

## Accepted semantic candidate

`profile_version: career_host_semantic_candidate/v1` has:

- `accepted_verdict: accepted`, `candidate_sha256` and `rendered_sha256`.
- `generator`: approved provider/model, configuration and prompt hashes, exact
  wire request/response hashes, provider response ID and usage-receipt reference.
- `verifier`: the same identity fields plus pinned checker prompt revision,
  normalized assessment hash, and candidate/rendered hashes it checked.
- `paired_settlement`: owned parent/policy references and both typed leg records.
  Each leg binds its configuration, bounds, monthly slot, actual receipt hash,
  recorded cost and `recorded` state. Both are known, held/uncertain amounts are
  zero, and the total equals the two costs. Two actual dispatches are reported.

A mints this only after actual checker acceptance and both known settlements.
It binds the whole structured candidate and exact final visible bytes, including
host labels/prefix/reminders. A later rewrite cannot reuse the proof. It is
advisory reasoning evidence, not a biographical fact or action-completion grant.

## Failed or uncertain reasoning

`profile_version: career_host_reasoning_outcome/v1` adds `outcome_status`,
`failure_kind`, `budget_state`, `provider_calls`, `provider_calls_certainty` and
the authoritative paired accounting reference/result when an attempt exists.
The failure kind distinguishes admission denial, generation failure/invalidity,
checker failure/rejection, timeout, usage/settlement failure and stale context.
No provider was called for an unadmitted request. Unknown or started legs retain
their full bounds; they cannot be represented as settled/free or retried by a
status poll. Known generation spend remains charged after checker failure.
Only an explicit new request and fresh admission can create another attempt.
This profile carries no accepted candidate or successful-effect proof.

A host-rejected proposal still needs an authenticated terminal no-call receipt.
For `admission_state: not_admitted`, authoritative lookup plus the owned action
fence must prove no late reservation/dispatch can appear; the settlement is zero
with no usage receipts and a distinct `no_call_settlement` record. Never invent
a paired reservation ID. A lost admission response or unresolved ledger read
remains uncertain and cannot release B's outstanding-action fence. A accepted
candidate can clear that fence only after both paired legs are known/recorded.
Outstanding references and the full payload/checkpoint are persisted atomically.
Authoritative uncertainty also remains in the separate non-content accounting
ledger after B state is erased; a new epoch cannot reset cost or unknown stops.

## Source readback

`profile_version: career_host_source_read/v1` adds the canonical source ref
(`id`, exact `item_version`), owned tool/read receipt, requested/final URL,
title/publisher, capture time, full supplied UTF-8 content, content digest,
byte length, explicit coverage/completeness and current validated binding.
The bytes must match both the canonical source record and authoritative read.
They remain untrusted source content, never personal qualification evidence.
An explicitly described excerpt is distinct from a complete page. If a source
does not fit the admitted canonical/request bound, return a typed limit failure;
do not cut text silently or claim a complete capture.

## Product-local artifact readback

`profile_version: career_host_artifact_readback/v1` adds the artifact ID and exact
version, owned retrieval reference, storage/read receipts, full UTF-8 content,
byte length, media type, structured-pack and content hashes, target/resume refs,
journey revision, current validated binding and `draft_not_sent` status.
It also binds a distinct authenticated open/download request, proves a fresh
owned storage read, and carries `authorized_open: true` and `fresh_session: true`
derived by A, never a client assertion. Its scope is verified readable server
bytes served to that request, not a claim that a file was saved on a user's disk.

The download is a real supported UTF-8 response with the owned retrieval route;
there is no invented URL or external upload. A fixture must consume the complete
response, compare hashes/bytes, reopen through a fresh entry and read the owned
receipt. A metadata record or successful write before that read is not completion.
Oversized content returns a typed failure; partial packs remain explicitly partial.

These profiles still need frozen schema/examples, strict validators, native
owner/settlement/readback tests and B's pure DTO adapter agreement. The generic
`ReceiptV1` cannot substitute for them. Actual provider/coaching quality and all
15 live-browser outcomes remain NOT_RUN. Muse owns final merge and deployment.
