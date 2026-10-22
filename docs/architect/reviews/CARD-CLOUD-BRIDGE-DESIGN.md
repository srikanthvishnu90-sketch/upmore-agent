# Card tap to cloud queue: response to review 1

Status: IMPLEMENTATION AUTHORIZED by the owner's subsequent build-now instruction; architect review remains a release gate.
Source pin: `01401cb456bc2982d67316165e183bbd275581c9`.
Review: `arch/card-cloud-bridge-gate` at `6efca1a2b844b402579bfcf4238f3e53a33d0f90`,
`CARD-CLOUD-BRIDGE-REVIEW-1.md` and `CARD-CLOUD-BRIDGE-GATE.md`.
Migration SQL may be WRITTEN, never APPLIED. No merge, deployment, enrollment, opt-in, waiver or switch change is authorized.

## Five open items: explicit answers

### A2: payload identity

Use the cloud producer's complete prepared object P, including approved_snapshot when emitted. Do not convert an
extension BatchPosting into P. A cloud card item is `{payload:P,hash:Hq,readback:R}`; R includes the exact engine
readback, resume name/full fingerprint, destination, blank questions and employer fields. The enclosing version-2
card carries `execution_mode:cloud`, owner, thread, card nonce, items and display deadlines. Hc hashes that entire
card. Hq is SHA-256 of UTF-8 `career_apply_canonical(P)`. He is P.engine_approval, independently derived by the engine.
The producer verifies every R against the engine evidence and schema before persisting; the renderer shows all R
and full fingerprints, never a shortened answer standing in for the approved answer.

The authenticated tap sends only `(card id,Hc)`. It reads P from the locked stored card, recomputes Hc/Hq, and passes
that same JSONB P to `career_apply_enqueue(P,Hq,Hq,career_apply_daily_limit(owner))`. Queue payload canonical bytes
equal the displayed item's P; queue.payload_hash = queue.approval_hash = Hq. No added marker, expiry restamping,
second payload serializer or late engine_approval/destination insertion. Routing/binding live in private metadata,
outside P. Queue URL/company/user/job columns must match P. The worker independently asserts P and He and hashes
actual resume bytes. Numeric/raw values and their displayed labels are both frozen. If anything changes, prepare
and show a new card; neither a text reply nor a later identical card repairs/renews an old job.

### C9: card is the only cloud authorization route, including old text cards

Re-create `career_apply_cloud_refusal` and `career_apply_cloud_claim_at` from their full bodies in
`20261024120000_career_apply_cloud_gate_waiver.sql`, not 20261021080000. The refusal first requires a durable
cloud-mode Messages item binding for this exact queue row/approval id/Hq and owner; absent or wrong-mode binding
returns `not_card_approved`. This applies to ALL cloud candidates, not just enrolled people. Therefore existing old
text-card jobs (even with valid He/destination), direct-enqueue jobs, and extension card jobs remain unclaimable.
The claim's candidate query also joins the binding to avoid selecting unbound jobs; refusal remains authoritative
under the person lock and row lock. Keep the live gate-or-waiver predicate, waiver send accounting, opt-in, daily
limit, 30-day company rule and pauses. Diff both functions against 20261024120000 in the review artifact.

The new cloud path requires BOTH existing switches for execution; OFF still permits recording a tap and queueing,
but zero claims or engine submission. No switch is set by migration, rollback, producer or tap. Cloud jobs enter
queued/attempts=0/source=NULL; the actual claim alone changes source to cloud. Own/extension claim skips a durable
cloud-mode binding and extension-start explicitly refuses it. Do not pre-set source=cloud on enqueue.

### C10: owner-approved rule for exactly one ordinary account; enrollment separate

OWNER APPROVED THE RULE; ACTUAL ENROLLMENT STILL REQUIRES SEPARATE AUTHORIZATION: retain the existing empty TEST allowlist and add a private service-role-only
`cloud_card_enrollments` table. A row names exactly one user UUID, purpose `first-real-card-cloud`, created_at,
expires_at (strictly later, at most 24 hours), revoked_at and the operator's approval reference. No wildcard, domain,
global setting or client write exists. At most one unrevoked ordinary-account enrollment is allowed. The migration
inserts NO rows. Owner/operator explicitly approves the UUID, absolute deadline and purpose and writes that row
only after a separate request; this design does not authorize it. Do not enroll the ordinary account as TEST.

Cloud eligibility is: existing enabled synthetic TEST row OR that exact unrevoked, unexpired ordinary-account row.
This replaces TEST-only for cloud-mode card preparation/read/tap/claim/pre-effect checks only. Existing extension
mode remains TEST-only unchanged. RLS/read RPCs use the same predicate; non-enrolled accounts see no card data.
Use a separate cloud-mode eligibility RPC/predicate and mode-specific RLS, not a broadened
career_apply_message_card_test_enabled_own; otherwise the ordinary grant would accidentally admit v1 extension cards.
Expiry, revocation and account deletion close the path. The frontend needs only the same server-derived eligibility
for the approval card. Eligibility grants no payload approval, opt-in, waiver, switch or arbitrary job permission.
The owner approved this rule; until the actual row is separately authorized, the ordinary-account send remains blocked.
Tests use invented UUIDs. No enrollment row, opt-in, waiver or switch is written by this migration.

### D11: additive, twice-safe migration, dependency, ledger and grants

After design PASS, create ONE additive migration using the real Supabase CLI and a timestamp ordered AFTER
20261024120000 (the repository has future-stamped migrations, so inspect the generated name before accepting it).
It depends on 20261021220430's Messages schema AND the modern approval/contract/ask/waiver migrations. Live application
would be TWO explicitly authorized files in order: 20261021220430, then the new bridge migration; the other named
modern dependencies must already be verified live. Abort rather than assuming that from a branch label.

New private cloud binding/enrollment tables use IF NOT EXISTS, RLS enabled and explicit revokes; additive constraints
are installed under catalog checks; indexes IF NOT EXISTS; policies/triggers DROP IF EXISTS then CREATE; functions
CREATE OR REPLACE. Do not drop/recreate existing bindings or approvals on replay. No DML seeds. Add the exact new
filename to the `tests/db/run.sh` ledger once and its explicit final replay twice after the waiver migration.
The migration checks required base signatures exist; no partially installed fallback. The new private metadata
does not alter the existing extension approval deadline constraint.

All functions pin search_path to public,pg_temp and qualify private objects. Revoke function EXECUTE from PUBLIC,
anon, authenticated and service_role first, then grant tap/read only to authenticated and producer only to
service_role. Worker lease-authorization RPC only to service_role. Private binding tables have no client grants;
only the enrollment table gets service_role administration. No broad public policies or service keys enter clients,
engine subprocesses or the browser. Owned RPCs compare auth.uid with card, thread, approval, payload and job owners.

Idempotence proof to add: snapshot object identities/content, apply up twice, assert equal definitions/grants,
no extra bindings/approvals/cards, no seeded enrollments/waivers and switches unchanged. Current owner instruction
forbids applying migrations: this test will be WRITTEN but NOT_RUN, not run in CI via an incidental push. Applying
it twice even on a disposable database needs the later explicitly scoped test authorization. No SQL runtime PASS
will be claimed before that. The runner integration is prepared only after code is cleared, not activated now.

### D12: rollback restores today's live claim bodies exactly

Prepare `supabase/rollbacks/<bridge-name>.sql`, not executed. It restores the complete refusal and claim_at definitions
from 20261024120000 byte for byte, including gate-waiver branches and original grants, and restores the pre-bridge
card/extension entry points, `career_apply_claim_own(integer,text)` and guard changes from 01401cb4. No generic CASCADE and no drops of preexisting Messages,
approval, jobs, waiver, opt-in, account, question or resume data. Up/down track only bridge-owned objects. A second
down is safe. Rollback cannot be used as a permission reset or to retry an uncertain employer effect.

Rollback is permitted operationally only with BOTH switches OFF and no active cloud drive; otherwise refuse before
DDL. Serialize the check: new cloud prepare/tap/claim/authorize and own-claim routing take a common transaction-level
SHARED bridge-maintenance advisory lock BEFORE account/card/job locks. Rollback takes its EXCLUSIVE counterpart
first, waits for existing claim/tap transactions, then locks career_cloud_settings and the new enrollment table
against writes for the rollback transaction, re-reads BOTH switches as OFF and checks no active cloud drive under
that lock. A direct setting writer that won the race is observed; an ON row aborts rollback. No stale pre-lock
enabled check can authorize a late claim. Existing own claims take the shared lock before their person lock.
Concurrency tests hold a claim at the account lock while rollback waits, and race an operator flag write against
the OFF check. No claims or authorization transaction can cross metadata removal. Before removing private bridge metadata, mark every still-queued bridge job not_submitted with reason
card_cloud_bridge_rolled_back and copy its immutable card/item/approval id, Hq and deadline into job evidence. Copy
the same binding receipt to existing terminal bridge job evidence; retain those queue rows and every attempted
outcome. Drop only bridge-owned objects after that. No job is deleted or reset to queued, and down/up cannot revive
a send. An active lease, including an uncertain in-flight effect, blocks rollback until its outcome is settled or
recorded unknown. No employer-attempted row is deleted.
The rollback restores LIVE's unbound-claim rules, so switches MUST remain OFF after down: reopening them requires a
new owner decision. The design does not call that historical behavior safe under the new tap-only requirement.

Rollback test records md5(pg_get_functiondef(...)) for refusal and claim_at loaded from the exact live baseline,
then up/down/down/up. Both down stages must equal the saved live hashes and grants; live waiver table/rows/caps
unchanged. Also compare normalized DDL source text to the exact baseline file, so an accidental replacement from
the older cloud migration fails. Existing card guard/function definitions similarly equal the pre-bridge snapshot.
This lifecycle test remains NOT_RUN while the no-apply instruction stands.

## Remaining gate answers and concrete implementation surface

Concrete cloud interfaces for the tests: producer
`career_apply_message_cloud_card_show_as(owner uuid,thread uuid,items jsonb)` returns the existing stored card
envelope with `{id,hash,payload}`; each item is `{payload,hash,readback}`. Existing
`career_apply_message_card_approve_own(uuid,text)` dispatches version-2/cloud cards and returns a stable receipt
with `jobs:[{id,approval_id,payload_hash,expires_at}]`; existing version-1/extension behavior stays unchanged.
New private metadata is `cloud_bound_approvals` (approval_id PK, owner, card_id,item_index,Hq,approved_at,expires_at,
revoked_at) and `cloud_bound_jobs` (job_row_id PK, approval_id UNIQUE, owner, card_id,item_index, unique(card_id,item_index)).
The card_id here is a durable value, not a cascading FK to a deletable card. The existing approval row's entry is
exact P, batch_hash is Hq and used_at records consumption in the same transaction. Cloud tap inserts this row directly
under its lock after cloud contract validation; it does NOT call extension-only batch_approve with a fabricated entry.

Worker interface: `queue.authorize(job,phase)` throws on refusal; phases are before_engine and before_effect.
CloudJob includes the queue Hq/approval hash and immutable origin ids. The parent holds the job/lease closure.
For the actual pre-POST boundary, the engine subprocess uses piped stdin/stdout for a bounded control exchange:
it requests one pre-effect authorization, the parent authorizes only its captured job/lease/Hq and answers allow or
deny, then the engine awaits that answer and preserves its existing final form/body/destination checks. No service
credential, arbitrary RPC selector, reusable bearer URL or browser-readable service endpoint reaches the child.
Timeout, malformed messages, channel closure and extra effect requests refuse. Exact transport framing gets a real
process test, not a fake engine calling a test hook and declaring the production transport proved.

Fact-withdrawal mechanism, distinct from career_apply_current: the parent re-reads the owner's CURRENT stored
profile AND answered-question rows through Claude's readEngineInput before each authorization phase. A pure
`assertCurrentApprovedSources(P,currentInput)` uses the existing trustedFacts/trustedManifest contract and matches
every frozen source dependency (factId, owner, table, key, value, confirmation event, provenance and attestation
permission) to current kept sources; excluded/conflicting/withdrawn dependencies deny. Include replay_sources and
derived dependencies, not just the fields' top-level factIds. Unrelated added facts do not authorize or alter P.
Do not rely on career_apply_current alone: its authority trigger explicitly excludes thread-profile facts.

Close the read/check gap with a service-side atomic source snapshot: a single owner-scoped DB read returns the
exact profile/question rows consumed by Claude's reader plus a canonical snapshot digest. The reader adapter
consumes those rows, not a second independent lookup. The final lease-authorization RPC receives that digest and
recomputes it over the same current stored rows under the account lock; a changed digest refuses and requires a
new check, never a cached allow. The source reader/table selection remains Claude-owned; the bridge adds the
digest fence around that same source contract, not a competing facts extractor. This interface agreement must be
in Claude's design PASS. The regression removes a previously confirmed THREAD-PROFILE fact while leaving account
version/epoch unchanged, then requires denial before POST. Generic account version tests cannot substitute for it.

A1: Claude owns `workers/career-cloud/engine_input.ts` on `arch/engine-input`. Consume
`readEngineInput(source,owner)` service-side on the existing self-hosted cloud worker machine; it calls pure
`engineInput({owner,profile,rows})` and returns facts and manifest `{hash,version,kept,excluded,conflicts}`. The cloud
prepare module feeds exactly these facts and the owned resume into existing approve-first.prepare and the one
trustedManifest. No second facts reader or whitelist implementation. A dry run that reports needs_answers writes
owned question rows via the existing questions writer (an equivalent service writer with explicit owner/job ids;
do not forge a claimed-job lease to call cloud_ask). It shows NO card until required answers are confirmed and a new
dry run succeeds. The source reader/engine input builder is Claude's dependency, not duplicated here.

B4/B5: take account advisory lock before card lock; use actual clock after waits. Verify unanswered nonce, owner,
thread owner, recomputed Hc and every item's current authority, Hq/He contract and owned resume. All items mint an
approval id, create immutable private item origin metadata, enqueue P, bind the returned job row id to that consumed
approval id/deadline, persist tap receipt and mark card approved in ONE transaction. Any failure rolls back the
entire batch and leaves the card OPEN; no per-item catch/continue. Replay returns the existing receipt only if the
same actor/card/Hc matches, and never remints, queues or extends. Enrollment/expiry do not prevent fetching an
already recorded terminal receipt. Effective send deadline per item is min(P.expires_at, actual tap +24h); disclose
that absolute limit before tap and in receipt. P.expires_at is never rewritten.

For batch cards, the one-to-one unit in B5 is the immutable card ITEM: unique(card_id,item_index), unique(job_row_id),
unique(approval_id). A parent card has multiple such rows. This preserves batch approval without incorrectly allowing
one item to authorize two jobs; if the gate requires literal one parent-card/one job, use one posting per card instead.
No FK from durable job origin to a deletable card/message/thread; deletion must not erase or renew authorization.
The private origin prevents stripping agent_batch_hash/mode or switching routes. Queue owner/job/url/company/payload/
payload_hash/approval_hash and durable approval id are immutable in every state.

C6: preserve the existing extension branch text exactly. Planned guard_queue diff: add an early cloud-origin dispatch
before its current extension BEGIN logic; cloud-only helpers validate complete frozen P. No edits to existing extension
validation/key sets/mappings/deadlines or terminal handling. Show extracted original-body byte comparison. New cloud
origin is resolved durably by job id/approval id before trusting mutable queue markers. If preserving text requires
changes, list each changed line with a regression test before review; never silently relax extension rules.

C7: closed CLOUD top-level keys from prepare: version,user_id,job_id,company,url,fields,destination,resume_sha256,
page_field_names,engine_approval,schema_hash,privacy_epoch,account_version,expires_at,quarantine_version,manifest_hash,
replay_sources,resume_tailored,resume_persona,approved_snapshot. Optional keys stay optional as emitted; absent vs
null remain hash-distinct. Cloud field keys are exactly the producer's name,label,value,factId,provenance,
confirmation_event_id,authorizes,source; the last four are optional as emitted by sourceOf. source is an object
(closed table,key,value keys), not extension's string. Validate source and approved_snapshot/replay_sources via the existing engine contract,
reject unknown nested classes and duplicate field names, check bank factId F-027..F-079 and derived references using
the existing quarantine contract, without misclassifying own-chat `id:F-033`. No cloud `source:extension` workaround.

C8: live service-only `career_apply_message_cloud_authorize(job_row_id,lease,Hq)` validates driving/source=cloud,
current lease, immutable binding/approval/deadline, enrollment, both switches, opt-in/epoch, current authority/facts,
pause and applicable gate-or-waiver evidence without counting this already claimed job as a second send. Worker calls
it before engine --submit and at the actual pre-POST boundary, after browser preparation. Parent owns credentials;
engine receives only a restricted one-job authorization channel, no service key. Revalidate final live form body,
destination/schema/resume using the existing engine guard. Opt-out/pause/epoch/fact withdrawal in preparation blocks
the effect. Lease-invalid finish/ask fail; valid terminal evidence remains recordable after expiry/disable/revocation.
Finish retries retry recording only, never engine. A transport-lost send becomes unknown, never automatically driven.

D13/F18/F19 intended files: new bridge SQL plus rollback; tests/db/career_apply_card_cloud.test.sql and separate
rollback/race fixtures; tests/career-cloud-worker-card-bridge.test.cjs; tests/db/run.sh; worker.ts, new cloud prepare
module and its tests; approve-first.ts/scripts/apply.ts only for the reviewed narrow pre-effect channel; existing
Messages card module/template only to render version-2 cloud exact payloads/eligibility. No engine_input.ts edits.
Each SQL migration/test unit <=250/400 lines respectively; if restoring full baseline function bodies makes this
impossible, split tests by contract and rollback and request the architect's explicit exception for one additive SQL
file before code. Do not bury executable migration fragments in unlisted includes. Existing card 1 MiB, approval
entry 128 KiB and cloud payload 256 KiB caps remain; reject above the strictest applicable cap BEFORE displaying.
Owner's subsequent written ruling APPROVES the migration/rollback line-count exceed for readable guard code;
existing caps, waiver/guard semantics stay intact outside the explicitly required binding/route additions.
The exact size and per-function diffs remain visible for second-judge review; this is not a line-budget PASS claim.
The owner's later explicit cap ruling changes CLOUD opt-in/claim/authorization/enqueue to at most 15 per day, including
legacy opt-in rows containing 25. This is a named exception to preserving old caps; global/extension caps are unchanged.
The cloud-switch approval is conditional on landing for the owner's account. Submit flags and sends remain unauthorized
without the exact card tap and the owner's separate operational word; the waiver waits on the owner's email choice.

## Fail-first acceptance matrix

Every NEW regression is tied to a missing behavior on 01401cb4, with actual baseline output when runnable; existing
passing protections are CONTROLS, not newly reproduced bugs. A missing migration/symbol alone is not runtime proof.

| Regression family / test names | Baseline failure to demonstrate | Branch requirement |
|---|---|---|
| tap_cloud_queues_exact / multi_item_atomic | tap mints extension permission and no cloud job | exact P/Hq once; entire batch rollback on invalid final item |
| text_yes_not_card_approved / direct_enqueue_not_card_approved | live waiver refusal accepts an unbound valid cloud payload | not_card_approved, zero claims |
| engine_fields_supported / extension_not_cloud | current card guard rejects He/destination/cloud provenance | cloud mode accepted; extension still refused by cloud |
| answer/resume/url/company_changed_after_tap | cloud route has no frozen Messages authorization | each edit+rehash refused, zero effects |
| removed_binding / deleted_card_thread / same_entry_no_renewal | cloud route lacks durable item/approval binding | fail closed without extending original deadline |
| expiry/enrollment/revoke_at_claim_and_effect | worker has no live card authorization | no engine/effect; terminal evidence still recorded |
| stale_lease_and_competing_claimers | no card cloud claim lane / live pre-effect checks | one claim/effect; stale ask/finish refused |
| authority_change_mid_prepare | no late DB authorization in worker | opt-out,pause,epoch,fact withdrawal stop pre-POST |
| receipt_lost_response_no_redrive | existing receipt retry is a passing CONTROL | same engine call count=1 across receipt retries |
| migration_twice / rollback_twice_reup | bridge objects/lifecycle absent | definitions/grants/data stable; exact live md5 restored |

Also retain baseline controls for foreign card/thread/job owners, unknown top/field keys, quarantined bank factId,
confirmed own-chat F-033, resume hash/manifest/schema mismatch, caps/cooldown, waiver decrement, flags OFF, private
grants, message deletion and the four existing EXTENSION post-approval bypass tests. Use the captured Veeva Lever
fixture and local mocks only; no employer requests. Two real DB sessions (not one sequential transaction pretending
concurrency) prove claim/tap races, once SQL execution is separately authorized. No paid model calls.

Unresolved permissions are explicit: architect PASS for release; owner's approval of the exact C10 enrollment
row; explicit authorization for any migration application, merge or deployment. The cloud-switch approval is conditional
and has not been exercised; submit remains OFF. Tests/design
can be committed now; no CI job may inadvertently apply the draft migration.

During the review-only phase, the SQL acceptance draft is at
`tests/db/pending/career_apply_card_cloud.test.sql`, outside run.sh's early `*.test.sql` discovery. Promote it to the
E14 path and put its final replay after 20261024120000 only once design/code and isolated DB execution are authorized.
This is staging a not-yet-runnable acceptance suite, not skipping a passing gate or reporting SQL as tested.

Ledger: this work $0 new spend; prior known $8.503100 plus unresolved-call hold $0.070743 = $8.573843 known+held.
Prior comparison total remains UNRECONCILED; the 63 pending paid cases remain NOT_RUN.
