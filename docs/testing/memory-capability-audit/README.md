# Independent score baseline

Baseline production commit: `192132dfd83f6f9834a7e8c962be91f570f6bbc7`. It was already on origin/main and was pushed unchanged to the dedicated audit branch before changes.

- Deterministic workflow memory: 45/50 (90%), every scenario passed all three JSON-restored trials or was counted failed.
- Capability completion on the offline-evaluable existing corpus: 39/50 (78%); 9 LIMITED and 2 DIVERGES are unmet expectations, not passes. An additional 29/79 examples need the live model and are unrun. This evaluates 63.3% of that corpus.
- Strict corpus variants: 75/103 passed; 23 LIMITED and 5 FAIL. The existing variant reporter treats every non-FAIL status as passing; this audit requires PASS.
- Real-world proof inventory: 0/206 have recorded qualifying live completion evidence; logic 108 TESTED, 74 PARTLY_TESTED, 21 DESIGNED, 3 PROVEN; rails 205 NOT_WIRED and 1 local SANDBOX. This is an evidence inventory, not 206 executed live failures.
- Baseline regressions: 2,153 Node tests and 563 Deno edge tests passed. These counts are not a semantic memory score.

## Repaired candidate

Production repair commit: `4b31e822502e9f9837cbcbfb593f8fac05dbe77a`.

Workflow memory is now 50/50 at pass-three. The separate 60-variant corpus scored 10/60 against an extracted original-source snapshot and 60/60 after repairs; these exposed variants are now regressions. Capability completion remains 39/50 on the 50 evaluated cases; all 29 model-dependent cases remain unrun.

The candidate passed 2,168 Node tests, 563 Deno tests, Agent100 103/103, 15 depth checks with 15 planted defects detected, router-bundle verification and the local release evaluator (RELEASE OK, LLM judge unrun). Exact commands, source digest and log hashes are under `docs/testing/runs/memory-capability-audit-20261013/`. The real handler type-check passed; its server entrypoint needs deno.land network access, saved as an additive draft requirement.

The before/after JSON files retain all synthetic transcripts. The larger seven-dimension campaign is separate from these initial scores; see the overnight plan for coverage and release gates.

Reproduce from the repository root with Deno 2:

```bash
mkdir -p /tmp/upmore-audit
 deno run --allow-read --allow-write --allow-run tests/memory-audit/run.ts /tmp/upmore-audit/memory.json
 deno run --allow-read --allow-write --allow-run tests/memory-audit/capabilities.ts /tmp/upmore-audit/capabilities.json
```

A nonzero memory command means at least one case failed; consult its JSON transcript. Neither runner changes application files. Inputs use synthetic people and local data; the model extractor is disabled in memory tests, while corpus replay uses its documented deterministic extraction fixture. All observed text and state come from production flow code. No deployment, real iMessage, bank/broker operation, or live model result is represented here.

The owner's exact career-memory 50 are not this suite. General semantic memory and full deployed capability scores remain unmeasured pending a supplied target endpoint, authenticated synthetic test user, model configuration and the intended career implementation. Do not convert that gap into a 0/50 failure claim.
