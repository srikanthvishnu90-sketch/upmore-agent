# Correction writer review handoff

This branch contains review artifacts only, based on correction pin `0cb4b9800bbce44a89bc93df79c1f6d95b5098db`. It does not apply changes to product files, merge, deploy, or authorize a submission. The correction owner can review and apply the patch.

`writer.patch` is the proposed `career_tools.ts` change: build one `personalSourceGuard([profile])` closure and allow only current non-denied facts to preserve superseded role/location preference cache entries. Own independent draft goals remain eligible for search; this is not application-answer confirmation.

The patch is **not standalone** on `0cb4b980`: it imports `personalSourceGuard`. `dependencies.patch` supplies the pure shared helper, quarantine policy (including both dependency aliases), and search reader exactly from integrated root `d748097b4ca12c37d2704460ab7a9b1a624ecc06`. It changes no correction writer. These dependencies are already on that integrated root; do not apply them a second time there. The writer patch itself applies to the correction block at `0cb4b980`.

## Reproduce on this branch

Use Deno with the project's dependencies already cached. All tests use invented fixtures, stub the model where needed, and deny network. No paid call, live DB, browser, or submission runs.

```sh
# Optional: set DENO to the executable available in your environment.
export DENO=deno
bash review/correction-current-goal/run-tests.sh original
# Baseline at 0cb4b980: 8 PASS.
bash review/correction-current-goal/run-tests.sh new
# Baseline: 1 PASS / 3 FAIL. The nonzero result is expected.

git apply --check review/correction-current-goal/dependencies.patch
git apply review/correction-current-goal/dependencies.patch
# Dependencies alone do not repair stale cache reconciliation.
bash review/correction-current-goal/run-tests.sh new
# Still 1 PASS / 3 FAIL.

git apply --check review/correction-current-goal/writer.patch
git apply review/correction-current-goal/writer.patch
bash review/correction-current-goal/run-tests.sh all
# Expected: 38 PASS (frozen 8 + source 4 + reader residue 4 + provenance 16 + lineage 6).
"$DENO" check --cached-only --no-remote supabase/functions/_shared/agent/career_tools.ts
```

The original eight-case gate is byte-identical to the frozen existing test (SHA-256 `0456ca2813848fcbef0988e0d1e213ea690c081c93c70245cb4ceca28fbd8d41`). The other tests change only local import paths for this portable handoff; their fixtures and assertions are unchanged. The 16-case gate comes from test-only commit `b5067ee60bbabdfcfc34c462e3659b13b1b31626`. Every correction crosses JSON persistence before fresh search. The lineage cases cover F-033, direct and transitive derivation, absent reserved parents, and own confirmed/draft positive controls.

Local verification and SHA-256 values are recorded in `verification.json`. These are source-level tests; this handoff makes no live or full-CI claim. The correction writer remains owned by its assigned judge/builder.
