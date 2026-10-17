# One Greenhouse application: implementation and verification handoff

**STRUCTURAL ONLY. No browser, employer submit, hosted deployment or new spend.**
The later [worker review repair](worker-review-repair-20261017.md) addresses
confirmed structural defects in this handoff source. The actual Greenhouse
destination/upload/receipt adapter and hosted runtime remain blocked/unverified.
Recovery follow-up: [native browser recovery](browser-native-recovery-20261017.md) adds exact native multipart mechanics, real local PDF/DOCX wire tests and latest-confirmed equipment v2. These are modeled-loopback checks; no employer manifest or production mapping is activated. Module 150/helper/service now have native seams, so the older ownership summary below describes the original contribution only.

Shared release: `f67db048599db308f2691a7be7feada841143da5`.
Browser review base: `c574352c11958f9a27242a273255d88e72997be5`.
The product target is cloud text → owned worker → application proof. A desktop
or Mac is not a product dependency. The broken Codex sandbox is a test-host
limitation, separate from the required target Linux worker.

## Portal choice and limits

Use one owner-authorized Greenhouse **hosted form**, one board/job-post ID and
one confirmed resume version first. Greenhouse's official documentation says
public job GETs need no authentication, while application API POSTs require an
employer Job Board API key. Its API also leaves required-field validation to
the client. Therefore do not substitute direct API submission, acquire an
employer key or treat a 200 as a complete application. The hosted form must
retain its validation, consent, upload and anti-abuse behavior.
[Primary documentation](https://docs.greenhouse.io/job-board.html#applications).

## Exact gaps and smallest changes

| Boundary | Existing code / evidence | Remaining implementation or gate |
| --- | --- | --- |
| Text and durable account state | `supabase/functions/agent-chat/handler-career.ts`, `_shared/career_task_bridge.js`, `_shared/career_persistence.js`; SQL `career_task_turn_commit_v1` | Queue one application from confirmed memory. Preserve exact job URL/board/post ID and canonical posting key, resume artifact/hash, confirmed answers and profile hash. Generic "yes" remains insufficient. A/Muse owns memory and chat composition. |
| Owned artifact and confirmed facts | New `workers/career-browser/equipment.cjs` resolver/materializer; worker equip/release integration; module 149 asks | The [confirmed equipment contract](owned-equipment-contract-20261017.md) is tested with real local bytes. A/Muse must map the existing owned records/bytes to that contract and approve runtime binding. No production storage path, credential or applicant record was guessed. |
| Destination permission | worker constructor `CONTROLLED_LOCAL_PORTAL_REQUIRED`, receive `DESTINATION_NOT_REGISTERED` | Still blocked by design. Add a separate operator-reviewed **single Greenhouse posting adapter**, rather than broadening `controlledPortals`. No adapter is activated by this contribution. |
| Form/network adapter | `scripts/career/portal-browser-helper.cjs` route gate and `cmdFill`; module 150 observation references / File hash | On the supported worker, observe the actual hosted form's frame, origin, redirects, form action, upload requests and final submit endpoint. An exact destination manifest must distinguish staged uploads from the one submit mutation. Do not guess endpoints from the public Job Board API or allow arbitrary first-party POSTs. Current controlled mode permits only one exact POST and one origin, so real Greenhouse upload/frame flows are not proven compatible. |
| Data minimization | helper controlled-mode `x-upmore-*` task/user/hash headers | Those are for the owned local server only. A future employer adapter must not forward internal user/task headers, RPC credentials or local file paths to Greenhouse. |
| Approval | worker `approve` and `prepareLocked`; module 149 `submitDoorstep`; existing MI-116 tests | Bind exact application/post ID, canonical destination, answer payload, resume bytes and profile version. Existing ten-minute review expiry, re-preparation hash check and Muse's payload-hash forwarding stay intact. A mass text request does not authorize silently changed applications. |
| Duplicate prevention | `store.cjs` exclusive/fsynced checkpoints; write-ahead `t.attempt`; SQL `career_task_one_submit_v1` | Keep all three. Across worker restart, queue replay and new turn keys, one application seat must map to the same durable task/fence. Do not make a fresh task ID to escape uncertainty. |
| Authoritative receipt | `service.cjs` destination readback; new `receipt.cjs` | Current proof source is controlled-local only. Build a Greenhouse-specific readback adapter from actual destination evidence. A generic thanks page, screenshot, client ID, or HTTP success alone does not prove the approved application was accepted. Do not fabricate server-side payload/resume hashes when the ATS does not expose them. |
| Unknown outcome | worker `reconcile`, `authority.cjs`, SQL effect receipts; module 149 unknown-outcome resolver | After an admitted submit or process death, read back the same application. No automatic re-click, even if no receipt is found. A destination readback capability that can distinguish accepted/rejected/unknown remains a live gate. |
| Genuine artifacts | optional worker `evidenceRoot`/`evidenceRequired`; real-browser controlled test | Preserve form-read, filled-review and confirmed-receipt PNGs, hashes and exact task/intent trace on private storage. Missing evidence is not filled with synthesized images. Receipt-stage capture requires the browser's captured ID to match authoritative readback. |

## Bounded source fixes in this branch

`workers/career-browser/receipt.cjs` replaces the truthy-ID predicate. Boolean,
object/blank IDs, explicit negative/pending results, and conflicting actual
received payload/resume hashes cannot yield completed. Existing legacy trusted
local receipt shapes remain supported; the validator does not authenticate an
untrusted caller. The real local multipart fixture now records its computed
payload/resume hashes and accepted outcome. MOCK fixtures are labeled MOCK.

`tests/career-receipt-integrity.test.cjs` exercises each bad readback through
actual worker approval and reconciliation: outcome stays unknown, the fence
remains, there is one MOCK click, and a later corrected trusted readback can
reconcile without another click. No test counts as an employer outcome.

## Required verification sequence

1. Owner/Muse supplies the approved cloud worker resource and existing secret
   bindings in the [hosted-worker proposal](hosted-worker-proposal-20261017.md).
   Do not repair the Codex sandbox or require a personal Mac.
2. Run the packaged **existing controlled-form** test on normal sandboxed
   Chromium with evidence capture enabled. Save exact synthetic input/output,
   authoritative local server receipt and all three actual PNGs. Its authority
   is explicitly MOCK; it is a browser/form check, not production queue proof.
3. Run the authenticated chat → real task RPC → worker → persisted evidence
   chain with that same controlled destination. Existing structural tests are
   `career-task-authority-postgres.test.cjs` and `career-public-research-postgres.test.cjs`.
4. Inspect one real job's hosted form read-only. Stop for CAPTCHA, account,
   consent, missing facts, unverified upload or an unreviewed destination hop.
   Build the exact posting adapter from the observed trace; do not relax the
   global loopback guard. This step is not performed here.
5. Resolve the real owned resume/facts from memory. Present only the necessary
   missing answers and the exact application review. Get the specifically
   scoped approval; then allow one submit only after all pre-submit evidence
   gates pass. No fake eligibility or transcript-derived candidate data.
6. Read back the employer record, correlate the same job/task/upload/approval,
   capture its real receipt stage, and persist proof. If this cannot be proved,
   report unknown and reconcile. Do not submit again to improve a screenshot.
7. Test crash-after-click, replay, revoked authority, changed resume/profile,
   stale DOM, upload mismatch and ambiguous receipt before considering scale.

## A / Muse coordination request

This branch changes browser-owned worker/runner/transport/receipt/evidence
files and synthetic fixtures. It leaves account/SQL functions, Edge handler,
host gate and modules 130/149/150 untouched relative to the browser review
base. Preserve A's single account version/epoch/pause authority. A/Muse must
review the existing backend credential binding, implement the owned artifact
resolver and privacy revocation, wire a private artifact readback surface, and
integrate the source-only research SQL proposal if that route is used.
Parent relays this request; no other thread was edited or messaged directly.
