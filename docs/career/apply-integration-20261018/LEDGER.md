# Integration defect ledger

## Work quota consumed before cheap input validation — OPEN

- Reproduced through the real staged handler: an authenticated empty message returns400 after calling the work limiter; an invalid turn key at exhausted quota returns429 instead of named400.
- Permanent guard: new unclaimed `tests/career-chat-quota-boundary.test.cjs`;2fail-first cases/6passing protocol and owner-binding controls, no skips. No runtime fix claimed.
- Required correction after handler scope coordination: cheap input validation before valid-work allowance, with a separate abuse guard preserved. Do not remove limits or claim measured capacity.
- Evidence: `evidence/quota-boundary-before.log` and `.json` retain actual result and exact source/test/stager hashes. No external fetch, business-state read, model or browser call occurs.

## Factual confirmation from a test-generation directive — OPEN

- Trigger: an application/profile fact is marked status=confirmed but its documented provenance is an owner delegation to generate answers “For test.”
- Before behavior: deriveAnswers emits confirmed applicant answers; a required restrictions field is filled and the result reaches prepared. This is not proof the applicant asserted the fact.
- Required behavior: generated/test values cannot become confirmed factual answers. Missing actual owner/employer assertions produce named asks, holding the affected job only. Preserve valid technical binding and field matching.
- Permanent guard: tests/career-apply-fact-provenance.test.cjs, eight synthetic local cases. Fail-first:0pass/8fail on unchanged4ba9351; no employer/browser/model IO.
- Evidence: evidence/provenance-before.json and .log pin source/test hashes and exit1.
- Implementation status: pending scoped ownership coordination for149 and associated contract/bundle changes. No BUG/FR identifier self-allocated; registry coordination remains with Crew A/Muse.

## BUG-240 unreachable batch loop — EXISTING FIX FOUND; COMPOSITION PENDING

- Published repair: `fix/bug-240-batch-seam` at `56a0285fa71212b98e955781fa92ec49c4323d53`. Reuse its existing router repair; do not introduce another batch implementation or ledger.
- Fail-first: the exact published staged-handler guard, retained byte-for-byte in `evidence/bug240-published-guard.cjs`, reports two critical failures and two passing controls against unchanged4ba9351. Empty stores with no injected profile, postings or board must produce a named PROFILE_REQUIRED outcome or one delegated prepare, rather than career_fallback.
- Permanent enforcement: `tests/career-apply-batch-live-shape.test.cjs` replays that immutable guard through `scripts/career/apply-integration/replay-published-guard.cjs`. Both critical cases exercise the real staged entry/handler/router composition; auth/database services alone are local fakes. No browser, external request or model call occurs.
- Evidence: `evidence/bug240-before.json`, `.log` and `bug240-wrapper-before.log`; retained published-test SHA-256 `c84f496184662f2dab2a1f99539ed59dd0b94892fd359d9e894f2976f1749dd6`.
- Status: source fix not composed;142 and generated bundle ownership release remains pending. The guard stays red. Product-only live proof remains stage3, after source verification and the owner deploy tap.
