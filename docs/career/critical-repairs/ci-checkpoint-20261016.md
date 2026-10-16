# CI repair checkpoint

Base checkpoint: `5ab2cc9456ee9cc6f9bbff9c6c7765888df6794b`.
GitHub Actions run `38982474751` confirms the engineering Node job and database
job passed. Node reported 4414 source passes and 38 existing skips; the isolated
SQL suite reported 134 passes without skips. These are engineering checks,
not actual provider quality or browser outcomes.

The remaining Deno failures were the second Gmail source-contract file lacking
read permission, the obsolete M09 cancellation mutation anchor, and a testing
agent expectation counting an existing cadence-exempt standing request against
the unsolicited finding budget. The fixed checker preserves exactly one
non-cadence finding and required daily-budget suppression. Financial runtime
is unchanged. Frozen failures remain in `ci-baseline/`.

Native Deno 2.9.7 now reports 92/92 offline testing-agent checks, including
`--check`, and 12/12 planted defects caught after a green unmutated baseline.
The generated reports match the committed reports. Raw outputs are retained
beside the earlier failures. Full local Edge tests remain NOT_RUN because JSR
dependency metadata returns HTTP 403; the next exact-SHA remote run must verify
the narrowed read permission and all Deno steps.

The shared journey boundary has 15 synthetic contract checks and a Deno type
check. Together with the two archival gate checks, the targeted Node run passes
17/17. The runtime helper validates bounded data and freezes a copied snapshot;
it does not authenticate receipts or grant execution authority. B compatibility,
production registration, paired accounting/verifier and context v3 are pending.

The separate required archival CI job deliberately uses `--require-complete`.
Seven original asset groups remain unavailable; their preserved assertions have
not run. Missing assets block CI and release. No historical records are invented.
An engineering-only green job cannot certify the original complete suite.

No paid calls, production mutations, sends or browser outcomes were performed.
Actual model/verifier quality and all 15 live-browser outcomes remain NOT_RUN.
Muse owns final merge, migrations and deployment.

Fresh flexible-grounding controls ran against implementation commit
`98d6d99ba5c5c50e250277648a3704be2ff7ce2a`: all 52 unmutated checks passed,
then all 15 independently planted defects were killed. Their raw logs remain
under `docs/testing/runs/career-flexible-grounding-20261016/spec-a-ci-final-98d6d99b/`.
The following evidence-only commit changes no runtime or test oracle. The three
common mutation guard/report checks also pass. This is MOCK_CONTRACT evidence;
actual provider and semantic verifier quality remain NOT_RUN.
