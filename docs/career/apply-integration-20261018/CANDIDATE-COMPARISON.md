# Pinned source comparison — no deploy-ready candidate

Compared651e41462cdf700383e3395f239b4bb95d19f1d9 with the unchanged4ba9351 runtime in audit checkpoint20057c8a200f50e935c34e678b7413901a0dabfd. Branch heads were checked read-only; the requested scope transfer is still not published in the relevant BUILD-STATUS. No claimed runtime or generated bundle was edited.

| Check |651e414 |20057c8 /4ba runtime |
| --- | --- | --- |
| Exact published BUG-240 guard |2critical failures/2controls passing, newly executed |2critical failures/2controls passing, retained prior execution |
| Published56a0285 ancestry |Not an ancestor; old pre-delegate profile return remains in142 |Not composed |
| Retained provenance cases |8/8pass, newly executed; R3 answer/citizenship derivations are absent, so this is not proof the newer R3 binding paths reject unsupported facts |8/8fail-first cases, retained prior execution; real defect remains unfixed |
| Quota boundaries |6controls pass/2validation failures, newly executed |6controls pass/2validation failures, retained prior execution |
| R3 portal stack |Missing ten later portal-related commits through4ba9351; source diff is149:317lines,150:239,helper:674,fixture:425, totaling1,509insertions/146deletions |Contains the later R3 portal stack; readiness composition and provenance repair still pending |

The original651 snapshot lacks `tests/career-batch-live-shape.test.cjs`; an initial invocation reported the missing file and was not counted as a source test result. The exact published guard was then copied into the isolated snapshot, its bytes checked, and all four cases executed. Only the two owned additional guards and that published test were added to the scratch tree; production source was unchanged. The provenance/quota guards are byte-identical to the audit checkpoint tests.

The first parallel test-launch attempts hit an exec-server transport disconnect and produced no test result. Subsequent sequential commands completed successfully and produced the retained logs. Connectivity recovered; source and data gates remain independent. No unsupported pass or completed repair is inferred from a launch attempt.

## Shortest source route

Neither exact head is eligible for deployment.651e414 does not avoid the required142 repair and also requires the later portal composition. Keep the already authorized4ba-based isolated integration as the working base; have Muse apply the narrow published56a0285 router hunks or explicitly transfer that scope. Reject generated/test facts in149 while preserving supported assertion-backed bindings, correct its contract, compose the authorized LF08/readiness behavior, and regenerate both bundles. Preserve newer Muse attribution/ownership behavior when reconciling142. Do not bulk-copy old generated artifacts or create a parallel authority.

The published BUG-240 source and adoption commands remain in MUSE-ADOPTION.md. After composition, require both critical empty-store/no-injected-business-dependency cases to pass alongside the controls. Re-run retained provenance and applicable source checks on the exact resulting head. The known inherited red checks and missing original archives remain recorded release blockers; this comparison does not waive them. Runtime version metadata alone is not proof of deployed source bytes.

## Cap semantics verified without submissions

Both source trees use `SPEC_CAPS={perDay:15,perVendorPerDay:5,perCompanyPer30Days:1}`. In149, `vendorOf` resolves a URL to its `atsFamily`, with posting.vendor/board.atsFamily also feeding the same value. A synthetic ledger of five same-day Greenhouse confirmations blocks a sixth distinct-company Greenhouse job as `perVendorPerDay`; both source trees were executed and returned vendor `greenhouse`, count5, limit5. Thus Greenhouse is one vendor here, not each employer. At most five Greenhouse confirmations per UTC ledger day are allowed, fewer if earlier history consumes capacity. This is local contract evidence, not a live ledger read or proof of production concurrency safety. No cap changed.

## Existing worker composition requirements

The existing board service and batch executor remain the intended authority. A host plus two function environment values alone does not instantiate their complete production composition:

- Run a non-root, sandbox-capable browser host. The helper explicitly sets `chromiumSandbox:true` when sandbox-off is absent; do not rely on Playwright's default. Require a normal-sandbox smoke test and approved HTTPS connectivity before any employer operation. No sandbox-off, trust alteration, relay or security bypass.
- Use the existing board service's shared150 factory, service authentication, per-owner sessions, TTL and Greenhouse-only reviewed family verdict. Resolve each resume through an owner-bound private file path; preserve its payload hash. The service binds loopback, so external ingress must be reviewed and authenticated rather than assumed reachable.
- Compose the existing batch executor with its persisted RPC store and actual `postingsFor`, `profileFor`, `boardForFor`; arrange its pending-intent drain. Preserve owner controls, claim-once/unknown handling and the existing shared ledger. No fixture data or hand-built per-user bypass counts as production wiring.
- Preserve portable operator configuration. No host/account purchase, paid integration, credentials, function configuration, privilege change or deployment occurred. The local sandbox failure remains a prerequisite failure, not justification to weaken isolation. Any host plan needs bounded cost against the verified remaining shared budget; no capacity claim follows from a small pilot.

## Reuse the existing operator setup first

The checked shared repo documents the J9 board service/J10 batch executor as Crew B's loop-acceptance implementation, with final integration/deployment owned by Muse. It documents operator-config interfaces and loopback listeners, but supplies no verified public worker endpoint or running production browser-service identity. The older owned-browser-worker document explicitly describes a local controlled-portal slice and says it provisions no public endpoint. The running alerts scheduler described by651e414 is a different process; it is not evidence that a browser worker or batch drain exists. Multiple code agents/worktrees also do not prove a reachable product runtime.

No new hosting account is needed merely to continue source work. Keep new-host provisioning on hold while Muse/Claude identifies whether its existing operator runtime already runs this exact board service and persisted batch drain. Minimum non-secret handoff: operator owner, reachable service URL/source version, existing normal-sandbox smoke evidence, and confirmation that owner-bound posting/profile/resume resolution and the pending-intent drain are connected. Do not send secrets in chat; credential configuration is a separate operator action outside this verification.

There is no documented GET `/health` route in `board-service.cjs`. Its handler authenticates first, then permits POST session operations only. An unauthenticated GET may establish TLS reachability with401 without creating a board session, but cannot prove sandbox/browser or executor readiness. Authenticated GET returns405; do not interpret either as full health or call a session-creation POST as a harmless health probe. No endpoint was supplied, guessed or probed. A remote Edge function also cannot reach another machine's127.0.0.1; a documented loopback placeholder is not a deployed connection.

Source references: `docs/career/owned-browser-worker.md` (Interfaces and ownership), `docs/career/combine-merge-record-v224-2026-10-15.md` (Worker operator-config checklist), `workers/career-browser/board-service.cjs:211` and `:270`, `workers/career-browser/batch-executor.cjs:63` and `:202`, `supabase/functions/agent-chat/handler-career.ts:172`–198. Only read-only source inspection was performed for this runtime check.

Source/test hashes and actual focused results are in `evidence/candidate651-comparison.json` and `evidence/candidate651-*.log`. No private packet or handoff-document content is included.
