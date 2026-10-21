# Card tap to cloud queue: response to review 1

Status: DESIGN FOR REVIEW; tests permitted, bridge code and migration blocked until the architect writes PASS.
Source pin: `01401cb456bc2982d67316165e183bbd275581c9`.
Review: `arch/card-cloud-bridge-gate` at `6efca1a2b844b402579bfcf4238f3e53a33d0f90`,
`CARD-CLOUD-BRIDGE-REVIEW-1.md` and `CARD-CLOUD-BRIDGE-GATE.md`.
No migration has been written or applied for this bridge. No merge, deployment, enrollment, opt-in, waiver or switch change is authorized.

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

### C10: proposed replacement of TEST-only for exactly one ordinary account

PROPOSED, OWNER APPROVAL REQUIRED: retain the existing empty TEST allowlist and add a private service-role-only
`cloud_card_enrollments` table. A row names exactly one user UUID, purpose `first-real-card-cloud`, created_at,
expires_at (strictly later, at most 24 hours), revoked_at and the operator's approval reference. No wildcard, domain,
global setting or client write exists. At most one unrevoked ordinary-account enrollment is allowed. The migration
inserts NO rows. Owner/operator explicitly approves the UUID, absolute deadline and purpose and writes that row
only after a separate request; this design does not authorize it. Do not enroll the ordinary account as TEST.

Cloud eligibility is: existing enabled synthetic TEST row OR that exact unrevoked, unexpired ordinary-account row.
This replaces TEST-only for cloud-mode card preparation/read/tap/claim/pre-effect checks only. Existing extension
mode remains TEST-only unchanged. RLS/read RPCs use the same predicate; non-enrolled accounts see no card data.
Expiry, revocation and account deletion close the path. The frontend needs only the same server-derived eligibility
for the approval card. Eligibility grants no payload approval, opt-in, waiver, switch or arbitrary job permission.
Until the owner approves this rule and the row, the ordinary-account send remains blocked. Tests use invented UUIDs.

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
card/extension entry points and guard changes from 01401cb4. No generic CASCADE and no drops of preexisting Messages,
approval, jobs, waiver, opt-in, account, question or resume data. Up/down track only bridge-owned objects. A second
down is safe. Rollback cannot be used as a permission reset or to retry an uncertain employer effect.

Rollback is permitted operationally only with BOTH switches OFF and no active cloud drive; otherwise refuse before
DDL. Before removing private bridge metadata, mark every still-queued bridge job not_submitted with reason
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

Unresolved permissions are explicit: architect PASS for production code; owner's approval of C10 rule and exact
account row; explicit authorization for any migration application, merge, deployment or switch change. Tests/design
can be committed now; no CI job may inadvertently apply the draft migration.

Ledger: this work $0 new spend; prior known $8.503100 plus unresolved-call hold $0.070743 = $8.573843 known+held.
Prior comparison total remains UNRECONCILED; the 63 pending paid cases remain NOT_RUN.
