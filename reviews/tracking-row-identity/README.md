# Tracking row identity: review-only QA

Exact base: `1ec88f3cca4b21200be5c4f16ba2a948a72614b0`. The paid product pin, canonical writer, domain 126, generated career bundle, and frozen architect tests are unchanged. This branch is a review package for Claude; do not merge or apply the patch without architect ownership. No corpus or held-out case was read. All companies, roles, application IDs, dates, and URLs in the reproduction are invented. No provider, network, database, live action, paid run, or deployment occurred.

## Confirmed cause

At this base, `supabase/functions/_shared/agent/career_tools.ts:325` exposes no `app_id`; line 336 calls company-only `CareerTrack.manualUpdate`, and line 337 uses the requested role only for `addApplication` after no existing company match. An existing row keeps its old role even when a new role is explicitly requested.

`packages/domain/126-career-track.js:73-78` implements `findByCompany` using `Array.find` and a normalized substring match. Its `manualUpdate` at lines 94-100 selects that first company match and only calls `moveStage`; it accepts no row selector or role update. The generated bundle contains the same behavior at lines 4654-4670. The direct domain reproduction independently confirms this without a model.

## Recorded baseline and controls

The new pending regression file has **5 expected failures and 5 passing controls** against the exact base. Failures cover the missing app-id schema, ignored role correction, ignored explicit second-row identity, company-only ambiguity, and unknown/mismatched/duplicate explicit ID refusal. The latter refusal cases share one test; the unpatched baseline fails at its first unknown-ID case.

The unchanged WO-002 and WO-061 suites pass **11/11**. The direct domain run passes **9 observational assertions**, confirming the bug and unique-company stage control. Runtime test permissions deny network, env access, subprocesses and writes, with API key cleared; local reads are restricted to the checkout (and the review-copy directory for the candidate run).

## Proposed writer-only change

`proposed-writer.patch` changes only `supabase/functions/_shared/agent/career_tools.ts`. It adds an optional existing-row `app_id` selector; refuses blank, unknown, duplicated or company-mismatched explicit IDs without fallback or creation; asks which row is meant on company-only ambiguity; permits an explicitly requested role correction on a single selected row; and updates only role, canonical stage and a next-step time verified against this turn. It retains the actual stored application as the returned receipt and records event identity and fields from that row.

This patch is **not applied** to repository product code. To check the proposal, an import map redirected only the writer module to a temporary review copy with its relative imports resolved to the unchanged base. The new pending suite and both frozen suites then passed **21/21**. This validates the proposed writer logic locally; it is not product integration, a held-out score, or a live result. `git apply --check` also passed against the exact base.

Patch SHA-256: `fdce2db0a28a5bf211ba822a0393d1fd21ce67e9c9739ac438830937bead6bcf`.

## Files and reproduction

- `tests/architect/pending/qa-tracking-row-identity.test.ts`: new pending acceptance tests; no existing test edited.
- `domain-reproduction.cjs` and `domain-baseline.log`: direct domain 126 reproduction and observed behavior.
- `pending-regressions-baseline.log`: 5 FAIL / 5 controls PASS.
- `frozen-controls.log`: 11 frozen PASS.
- `proposed-patch-review-copy.log`: 21 PASS with temporary writer review copy only.
- `proposed-writer.patch`: writer-only proposal, not applied.

Run the baseline reproduction with Node and the tests offline with Deno 2.9.6:

```sh
node reviews/tracking-row-identity/domain-reproduction.cjs
deno test --no-check --cached-only --no-remote --deny-net --deny-env --deny-run --deny-write --allow-read="$PWD" --no-prompt tests/architect/pending/qa-tracking-row-identity.test.ts
deno test --no-check --cached-only --no-remote --deny-net --deny-env --deny-run --deny-write --allow-read="$PWD" --no-prompt tests/architect/wo-002-career-tools.test.ts tests/architect/wo-061-tracker-stage.test.ts
```

The full gate was not run for this pending-test/review package. Only the focused offline suites above were run. No product fix is claimed.
