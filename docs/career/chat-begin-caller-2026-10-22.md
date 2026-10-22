# Chunk 40% — the chat-side begin-caller: map, build, proof

Branch `muse/2026-10-22-chat-begin-caller` (base `5ffab100`, the Lane B
card commit). Built 2026-10-22, night plan chunk 40%. NOT deployed.
Nothing sends, nothing submits; every test runs against a recording
stub RPC client. The live project was read once (pg_proc ACLs) and
never written.

## 1. The map — the chain that should exist, link by link

| # | Link | State | Evidence |
|---|------|-------|----------|
| 1 | Chat card tap → approval record | EXISTS (pure) | `packages/domain/175-career-approval-ui.js` `tapApprove` (mint via 155's `approveRun` or the stored-batch mint; record `{kind:"batch_approval_record", approvalRef:"batch:<runId>:<cardSha256>", approvals:{postingKey:payloadSha256}, attestationsSupplied:["certify_true"]}`). The router's approval turn also mints in-process: `142-career-router.js` `handleBatchApply` approval branch → `BatchApply.approveRun`. |
| 2 | Approval record → DB approval row (`career_apply_batch_approvals`) | RPC EXISTS, chat caller MISSING | RPC `career_apply_batch_approve_own(jsonb)` (migration 20261024090000, wo branch; live ACL verified 2026-10-22: `authenticated=X`). Its only client caller is the Chrome extension (`extension/background.js` line 1248 on `origin/wo/first-real-submission`). Nothing under `supabase/functions/` calls it. |
| 3 | The approved entry the DB stores (BatchPosting: answers + ledger + manifest binding) | EXISTS only in the extension | `TraineeCore.batchPlan` (`extension/lib/trainee-core.js` line 4801, wo branch) builds `{jobId, company, url, answers[], blank[], ledger[], question_set_hash, manifest_hash, quarantine_version}`; the stored entry is `{version:1, kind:"agent-batch", ...posting}` and its hash is `batchHash` = canonical SHA-256 of that object. NOTHING in the chat world builds this entry today: 155/175 bind 149 doorstep *payload* hashes, a different artifact. The begin-caller therefore CONSUMES entries (built by the preparing engine — in the TEST world, the executor; in the extension world, Prepare) and never re-derives them. Building entries chat-side is a sibling gap, named here, not silently absorbed into this chunk. |
| 4 | Payload construction for the begin (reviewPayload shape + canonical hash) | EXISTS only in the extension | `TraineeCore.reviewPayload` (trainee-core.js line 4210): `{manifest_hash, quarantine_version, version:1, source:"extension", user_id, job_id, company, url, family, fields[{name,label,value,source,factId,detail}], resume_name, resume_sha256, privacy_epoch, account_version, expires_at}`; `approvalHash` = SHA-256 of the canonical JSON (byte-order key sort, trainee-core.js line 3483), the exact mirror of SQL `career_apply_canonical` (migration 20261020000001). Chat world: MISSING → built here (module 176). |
| 5 | The begin RPC | EXISTS live | `career_apply_extension_begin_agent_own(jsonb, text, text)` — 20261024090000 as redefined by 20261024100000 (the WO-102 contract: quarantine version, manifest binding, per-answer ledger, payload == approved answers, withdrawn-answer check). Live ACL verified: `authenticated=X`. |
| 6 | Job row | EXISTS | The contract function delegates to `career_apply_extension_begin_own` (latest: 20261021120000), which enqueues via `career_apply_enqueue` and marks the row `driving`, `source='extension'`, with a lease returned to the caller. |
| 7 | Worker claim of a begun row | OPEN SEAM (ledgered, F-030) | `career_apply_cloud_claim_at` (20261021080000) claims only `state='queued' AND source IS NULL AND approval_hash = payload_hash` rows — a begun row is pre-claimed `driving`/`extension` by construction, so the DB cloud claim never takes it. In the extension model the beginner IS the driver (and finishes via `career_apply_finish_own`). Which worker drives a chat-begun row in production is the chunk-100% arming question; this chunk does not paper over it. Compounding it: `begin_own` hard-requires `payload.source = 'extension'` (20261021120000 line 12) and stamps the row `source='extension'`, while the family gate counts email-confirmed rows with source `own_computer`/`extension` as HAND submissions (20261021075000) — a cloud-driven chat begin would be mis-stamped as a hand submission if it ever confirmed. |
| 8 | The submit flag read | EXISTS, service-role only | `career_apply_agent_submit_enabled()` — live ACL verified 2026-10-22: `{postgres=X, service_role=X}`; the 20261024090000 migration revokes it from `public, anon, authenticated`, and `career_cloud_settings` is service-role-only (RLS on, no authenticated grant). A user-JWT caller CANNOT read the flag. The chat host (edge function, server-side) can, through its service client. Design consequence, §2. |

## 2. What was built

**Module 176 — `packages/domain/176-career-agent-begin.js` (`CareerAgentBegin`)**,
the begin-caller. Pure domain code like its siblings; every effect
goes through injected deps, so tests drive it with a recording stub.

- `QUARANTINE_VERSION = "d007-v1"` — mirrors the DB constant
  (20261024100000 line 24: `qv constant text := 'd007-v1'`). A test
  pins the literal and cross-checks the migration text when the file
  is present in the tree.
- `DERIVATION_RULES` — mirrors 20261024100000 line 25, pinned by test.
- `canonicalApplyJson(v)` + `sha256Hex(text)` — the canonical JSON
  (UTF-8 byte-order key sort) and SHA-256 the DB hash checks against
  (`career_apply_canonical`). SHA-256 uses WebCrypto where present,
  node:crypto otherwise; there is NO fallback hash — a payload hash
  is a security binding, and a weak substitute would be a lie.
- `buildBeginPayload({entry, userId, family, account, expiresAt, resume})`
  — the reviewPayload shape, with the fields built FROM the entry's
  answers (name/label/value/factId, `source:"trainee"`) and the
  manifest binding copied FROM the entry (`manifest_hash`,
  `quarantine_version`). One source: the answers the person approved
  are the fields the begin sends; nothing is re-derived.
- `checkContract(entry, payload, {answeredTextAnswerIds})` — a local
  mirror of the contract's six checks, in the DB's order, refusing
  with the DB's exact messages (`agent contract: quarantine version`,
  `agent contract: manifest`, `agent contract: ledger`,
  `agent contract: quarantined fact`,
  `agent contract: payload not the approved answers`,
  `agent contract: withdrawn answer`). Check 6 is the one check whose
  ground truth lives in the DB (the question row's current state);
  locally it verifies the `text-answer:<uuid>` shape and that the id
  is in the caller-supplied still-answered set (the host reads those
  from `career_apply_answers_own`, the same read the extension's
  `facts()` makes). The DB re-runs all six inside the transaction —
  the local mirror exists so a doomed begin never leaves the process
  and the refusal is named before any network call.
- `beginApprovedPostings(input, deps)` — the caller. Input: the 175
  approval record, the approved entries, the account stamp
  (`career_apply_account_own`'s `{epoch, version}`), `expiresAt`, the
  still-answered text-answer ids, per-posting family, the resume ref,
  and `flagEnabled` (boolean | null). Deps: `rpc(name, args)` — the
  host's user-JWT client (`client.rpc`, the `career_persistence.js`
  shape). Flow:
  1. `flagEnabled === false` → refuse locally
     `{code:"AGENT_SUBMIT_OFF", message:"agent submit is off"}` with
     ZERO rpc calls. (The host reads the flag server-side — link 8.
     When `flagEnabled` is null the caller proceeds and the DB's own
     first check refuses; that refusal is surfaced distinctly as
     AGENT_SUBMIT_OFF, never confused with a contract refusal.)
  2. One `career_apply_batch_approve_own` call storing every entry
     under its canonical batch hash (the DB recomputes the hash and
     refuses a mismatch — the stored approval is the database's own).
  3. Per posting, in record order: build the payload, run
     `checkContract` (a local refusal is recorded per posting and that
     posting is never begun), compute `p_approval` as the payload's
     canonical hash, call
     `career_apply_extension_begin_agent_own {p_payload, p_approval, p_batch_hash}`.
     A DB error is surfaced VERBATIM, classified
     (AGENT_SUBMIT_OFF / AGENT_CONTRACT_REFUSED / NO_LIVE_APPROVAL /
     BEGIN_REFUSED), and never retried.
  Returns per-posting results `{jobId, ok, id, lease, payloadHash}` or
  `{jobId, ok:false, code, message}`.
- `beginFromClaim(claim, ...)` — the same caller entered from 175's
  `claimBatch` output (the approval-claim path the card tap produces):
  it refuses anything that is not a surviving claim object.

**Wiring (in-branch, default OFF, not deployed):**

- `scripts/build-router-core.py`: `176-career-agent-begin.js` added
  to the bundle names (after 155), `CareerAgentBegin` to the exports;
  both router bundles regenerated. The module is thereby reachable by
  the chat host exactly like 155.
- `supabase/functions/_shared/career_host.js`: `createCareerHost`
  accepts an `agentBegin` composition dep, following the
  boardFor/delegateBatch pattern — runtime-only, attached per turn as
  `ctx.batchDeps.agentBegin`, never persisted (batchDeps is not a
  STATE_KEYS entry, so no snapshot can carry or resurrect it). Absent
  the dep, nothing changes.
- `packages/domain/142-career-router.js`: in `handleBatchApply`'s
  approval branch, when `ctx.batchDeps.agentBegin === true` the turn
  mints via `approveRun` and returns
  `batchDelegate: {phase:"begin", runId, approvalRef}` INSTEAD of
  running `executeRun` in-turn — the J10 delegation shape, so the
  async handler/worker seam performs the begin with module 176.
  Without the dep the branch is byte-for-byte the old behavior.

**Deploy unit (named, NOT run):** the agent-chat edge function. Ship
by rebuilding the career bundle
(`python3 scripts/build-router-core.py --career-only`), staging
agent-chat with the stage-graph recipe, and deploying the staged
function — the same unit and recipe as v248. The composition root
additionally installs `agentBegin` (handler-career.ts) and the host
glue that reads the flag via the service client and supplies the
user-JWT rpc; that glue is the deploy decision's second half and is
deliberately not snuck in here.

## 3. Proof

`node --test tests/career-agent-begin.test.cjs` — see the test file
header for the groups: (a) payload builder + the six-check mirror
with negative controls, (b) flag OFF refuses before any RPC (zero
recorded calls), (c) DB refusals surfaced verbatim, never retried,
(d) the happy path against the recording stub (call order, exact
begin arguments, the returned job id/lease). Run 2026-10-22:
**25/25 pass** (fail-first: the suite was run before the module
existed and failed to load — the red state). Wiring guard
`tests/career-agent-begin-wiring.test.cjs`: **3/3 pass**. Neighbors:
career-approval-ui 5/5, career-http-host 6/6, career-batch-delegation
1/1, router-bundle 3/3, career-bundle-reachability 1/1; agent100 dry
run **103/103**; both router bundles rebuilt and `--check`-verified.
Full sweep `node --test tests/*.cjs`: branch **4,601 tests / 4,543
pass / 17 fail** vs pristine base `5ffab100` **4,573 / 4,514 / 18** —
the +28 are this chunk's tests, all green, and the failing set is a
strict subset of the base's (the mutation-coverage report was
regenerated with `scripts/build-mutation-report.cjs`, which lists
module 176 under Gaps — it has unit tests but no planted-defect
packet — and incidentally cured the report-currency failure the base
already carried; the remaining 17 are the pre-existing D11–D14
environment class, the F-007 coverage pair, and live-gaps harness
flags, identical in kind to base).
The SQL suites for the two migrations
(`tests/db/career_apply_agent_contract.test.sql`,
`tests/db/career_apply_cloud_ask.test.sql`) are NOT_RUN here — this VM
has no Postgres binaries (`tests/db/run.sh` requires them on PATH or
via PGBIN), stated plainly rather than dressed up.

## 4. What concretely improved

Before: a person could tap Approve on the Messages card and the
approval dead-ended — the record existed in chat state, the DB
approval row was never written by any chat code, and no code path
anywhere in the product could turn that tap into the begin the schema
has waited on since WO-101 (the begin RPC's only caller was a Chrome
extension the owner has ruled out as a surface). After: the tap's
record flows through one tested caller that stores the DB approval
under the database's own hash, builds the begin payload from the
exact approved answers, refuses locally anything the DB contract
would refuse (with the contract's own words), and calls the begin
RPC once per posting with the person's own JWT — while the flag is
OFF it refuses before any RPC, and every DB refusal surfaces
verbatim. The remaining distance to a driven application is named,
not hidden: the begun-row worker claim (link 7, F-030) and the
deploy + composition glue (§2), both owner-gated.
