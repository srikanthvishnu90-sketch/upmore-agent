# Provider receipts and owner-authorized context refresh

This is an isolated, zero-cost review proposal. No production SQL application,
deployment, real provider request, allowance seed, shared-release merge, browser
execution, or change to modules 127/130/155 or B-owned source occurred.

The provider compatibility oracles were frozen at `65ff58b1`. The baseline
passed 40/43; it rejected both documented full usage examples and an actual
controlled entry pair returning the approved snapshot. The repaired run passes
43/43 through the staged gateway and native PostgreSQL, retaining raw receipts.
The configured model, request, configuration digest and price remain
`gpt-5-nano`. The only additional response identity is the exact
`gpt-5-nano-2025-08-07`; there is no prefix match. Documented auxiliary counters
are accepted only as numeric integer zero. Unknown keys, nonzero, negative,
fractional and string counters, wrong models/configurations, token overruns,
conflicting settlements, redispatch and unknown-hold/global-stop violations
remain rejected. Duplicate known settlements remain idempotent.

The compatibility risk was checked against the official
[Chat Completions example](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
and [nano model catalog](https://developers.openai.com/api/docs/models/gpt-5-nano)
on 2026-10-17. These establish documented shapes and identities; no live response
or actual model-quality result is claimed.

The original six cross-thread cases were frozen at `e54bbe14`; only one passed.
Artifact continuity was frozen at `6a7d114e`, and CAS/account-scope controls at
`38dfd0d4`. All nine now pass. They use the actual staged career entry and owned
network-none PostgreSQL, without providers. An unrelated owned thread had
advanced the owner-wide account version, leaving strict reads and the writer
unable to repair the older context. A bounded owner-authorized CAS refresh now
updates the projection clock only after checking an owned source-basis witness.
The strict read equality remains. Fact values, versions, provenance, created and
effective stamps, and privacy epoch are preserved. Scope-specific source changes
mark evidence stale and append value-free invalidations; explicit writer repair
applies those to B without rewriting original answers or feedback history.

The controls cover simultaneous corrections with explicit conflict retry,
pause/resume admission, account-scoped canonical changes in another thread,
stale CAS, foreign ownership, client-role denial, attempted value edits and
privacy erasure. Exact artifact bytes remain readable across unrelated counter
updates, including an update between GET and acknowledgement. Original readback
proofs remain immutable; current delivery eligibility is revalidated separately.
Semantic changes and privacy epochs still revoke eligibility. Refresh neither
dispatches a model nor releases accounting holds.

All failed runs are retained here, including an implementation SQL precedence
error and the 8/9 intermediate run that exposed missing account-scoped authority.
The exact pre-account-scope proposal is retained as evidence, not applied SQL.
`source-manifest.json` identifies the uncommitted tested source bytes; the
recorded runner HEAD is the frozen-oracle HEAD and is not mislabeled as runtime.
Every completed fixture reports ownership verification and removal.

The independent safe source suite passes 212/212 and native Deno checks the
actual interview entry. The full native database run is recorded separately
alongside this report once complete. No protected writing fixtures were read by
these local checks. Provider-disabled and controlled-response checks establish
regression behavior only. Actual model quality and all 15 genuine browser
outcomes remain NOT_RUN; the shared $5 allowance is still unreconciled, the
normally sandboxed Chromium launch remains blocked, and seven missing original
asset groups still block required archival validation. Muse owns final review,
merge, migration and deployment.

```sh
node scripts/career/critical-repairs/ci-node.cjs --postgres-only
```
