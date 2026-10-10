# Current workstreams

Branch/HEAD and dirty digests appear in `docs/testing/evidence-ledger.json`. No workstream below is complete merely because files exist. Local progress remains distinct from owner/partner launch gates.

| Dependency order | Owner | Status | Implementation / evidence | Next dependency |
| --- | --- | --- | --- | --- |
| A: repository baseline and fixed benchmark | Root | IN PROGRESS | selection-method.md, 241 seed inventory, sources/features registry; scripts/capture-checks.py | Expand every seed into verified atoms; authenticated unknowns retained |
| A: parity evidence validator | Checker reviewer + root | BUILT, local validation pending final changes | scripts/parity-check, tests/parity-check.test.py | Browser/provider/launch proof packets; cannot promote mocks |
| B: retained read ledger and truthful classifications | Existing integration + root | PARTIAL | financial_service.ts, domain40, migrations13/14, ledger UI and SQL/edge tests | Actual browser, raw ingestion provenance, multicurrency/splits and coverage |
| B/C: general bills | Bill interface agent + root | PARTIAL | workflow_service.ts, domain36, new retry/owner regression tests | Accessible interface integration; real biller/rail, full delivery terms and browser proof |
| D: verified payments and reconciliation | Root | BLOCKED-PARTNER for live; local engine implemented | payment_service.ts, execution migration06, synthetic/fault/concurrency tests | Registered provider/commercial/legal/security/owner launch gates |
| C: earning, benefits, savings/recovery | Research agent + future implementation | DISCOVERED/PARTIAL catalogs | Existing 50 scenarios, benchmark seeds | Atomic state/jurisdiction/source contracts; complete native workflows |
| E/F: investing, credit, wallet | Research + future implementation | PARTIAL research / blocked execution | Existing catalogs and strict empty provider gates | Exact partner and certified capabilities; specialist approvals |
| G: Messages durability | Root | PARTIAL; live transport blocked | Inbox/turn/outbox/model quota services, migrations07–11 | Registered verified transport and controlled delivery verification |
| G: adversarial/mutation evidence | Root + checker reviewer | IN PROGRESS | Current boundary tests and mutation register | Actually weaken/restore all20 guards in isolated work; no production edits |
| G: deployment and operations | Owner release decision + root preparation | BLOCKED-OWNER/PARTNER | Current deployed source previously audited read-only | Migration history, security/legal review, restore evidence and exact deployment approval |

Existing six requested areas (obligations, execution, Messages, tools/planning, financial engines, production verification) remain open. Original 50 scenarios and supplied C001–130/B01–12 are retained; new benchmark does not replace them. No 100/100 claim, inherited test-count claim or operational live feature claim is made.

## October 10 continuation: versioned bills and conversation routing

- User-source bill editing now uses Auth-only `agent_obligation_edit` with exact owned record, expected revision, reviewed seven-field payload and request UUID. SQL stores immutable before/after receipts, blocks unresolved payment attempts, and lets the existing revision guard cancel earlier workflow proposals. A retry of an older receipt explicitly reports whether later edits superseded it. New migration15 remains unapplied to production.
- Bills UI exposes editing only for versioned USD payable user records. It asks for a new unpaid-bill confirmation, preserves input on conflict/uncertain response, and displays saved evidence separately from a failed list reload. It never submits a payment.
- The real chat application now consumes `UpmoreChatRequests`: owner/thread/mode tickets fence token acquisition, network calls, history, delayed typing and photo reads. Workflow responses can open the exact owned bill through a fresh server read; no approval fields from the reply are accepted. History outages remain distinct from verified empty history.
- Subscription cases have a deterministic preparation/tracking module and synthetic unit contracts. It is **not connected to API, persistence, UI or a vendor**. Protected evidence/approval callbacks and state must be supplied by authenticated server storage before integration; caller-created callbacks/state are not authority. Cross-case deduplication and corrected billing windows remain integration dependencies.
- The competition ledger has 241 retained seeds, 699 atomic records and 68 supplemental discoveries. The original 300 atoms and C001–130/B01–12 mappings are retained in `docs/upmore-capability-trace.json`. Detailed unexpanded contracts and complete end-to-end proof remain gaps; no local module alone earns feature parity.

### Handoff findings received during implementation

The owner supplied Claude's independent review (`docs/testing/claude-review.txt`) and research directory. Two HIGH payment defects from the owner’s handoff are now fixed locally: a revised bill could be proposed again after its earlier payment was applied, and unresolved/duplicate lookup records could monopolize the payment worker. Stale-edit and candidate-replay defects are already addressed locally by versioned edits and exact-field confirmation. Lost begin-submission responses also require an honest unknown status rather than claiming nothing was submitted.

A further actual-template regression caught legacy OAuth onboarding/referral keys outside the private namespace. It failed before the follow-up patch (10 passed, 1 failed); after scoping those keys and rebuilding, 11 privacy tests passed. No real account or network was used.

Recovery review found that the inherited scanner's same-merchant/fee-keyword credit match was insufficient refund proof. It now returns unverified leads and cannot certify recovered money without a trusted linkage service. This is a correction of a product claim, not a reduction of verified recovered cash. Nineteen current unit tests pass; the module remains unwired and tenant-scoped service integration is a dependency.

The inherited local cancellation harness uses a Spotify playbook against a local fake merchant. It was read, not executed by this iteration. Its separate gate checks do not prove approval enforcement inside the browser execution path. No real merchant has been selected or exercised in this iteration. A future live test requires an owner-selected subscription and exact external-action authorization; the local fixture is not such approval.

### Verified handoff checkpoint

Both payment hotfixes passed 148 edge tests and the full 476-assertion/race disposable SQL suite. All 26 captured code checks passed at unchanged source digest 03d9003ac4b254b1858e46d754488ef94aae7391425a7a62bfec91835a5af1d5. All 720 incoming research rows and 325 sources are merged as claims, preserving uncertainty. See [pairing handoff](upmore-codex-pairing-state.md) for exact logs, scope and next work. No production action or complete parity outcome is claimed.

### Recovery integration continuation

Recovery is now bundled and wired to an Auth-only atomic snapshot, read-only workflow endpoint, typed financial tool and app evidence/draft screen. Indexed matching replaces quadratic loops; unknown hold dates remain excluded instead of erasing dated findings. Later pages bind the unchanged source hash. Actual-template regressions caught and fixed delayed reads surviving same-owner Auth refresh; disconnect/reset clears findings and private account choices. See [recovery integration](recovery-integration.md). Protected allocation, durable recovery cases, official recipient verification and cross-case deduplication remain open. No recovered funds, external request or live deployment is certified.
