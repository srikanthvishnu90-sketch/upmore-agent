# Search-provider parity review handoff

Exact product and harness base: `1ec88f3cca4b21200be5c4f16ba2a948a72614b0`. The pending development gate comes unchanged from `7370e795c2170f2edf538309f64d7e0f9b40f7cb`. Canonical `supabase/functions/_shared/agent/career_tools.ts` and `evals/brain-reliability/run-comparison.ts` remain byte-identical to the base. This branch contains review artifacts and the new pending test only.

## Source cause and minimum contract

At the base, `search_jobs` in `career_tools.ts` around line 391 shortens a query only while its provider returns an empty candidate pool. `searchPostings` in `career_search.ts` around line 67 then applies the canonical all-word matcher. The fixture provider in `run-comparison.ts` around line 224 ignores its query and returns the whole posting pool. A provider that filters by the query exposes an empty candidate pool earlier and triggers fallback, so the two provider shapes can produce different final results.

The independently invented query `reservoir analyst Copper Bay`, with an explicit instruction to retain Copper Bay, has no exact match. The whole-pool provider queries once and returns **0** final results. The query-filtered provider tries that phrase, then `reservoir analyst Copper`, then `reservoir analyst`, returning **1** posting in Pine Harbor. Disclosure that the query was broadened does not authorize dropping the person's constraint.

The minimum contract is equal final job identities and relaxation disclosure across provider shapes, with explicit hard constraints retained until the person relaxes them. An explicitly permitted broader query may find the available role; the returned ID must still resolve to the original complete posting text, pay and URL.

## Recorded six-case baseline

| Development case | Recorded result |
|---|---|
| Equal results across provider shapes for an exact empty query | FAIL: 0 versus 1 |
| Retain the explicit hard location constraint | FAIL: Pine Harbor returned for Copper Bay |
| Exact query plus original complete posting lookup | PASS |
| Explicitly permitted broader query plus complete posting follow-through | PASS |
| An absent role remains empty | PASS |
| A saved employer exclusion remains enforced | PASS |

Total: **4 PASS / 2 FAIL**. Cached-only typecheck passed. `search-provider-parity-baseline.log` and `search-provider-parity-observed.json` are byte-identical copies of the recorded synthetic proof. Historical temporary paths in the proof identify its recording location; no such path is required to run the pending test. No existing evaluation cases, scenarios, heldout cases, prompts or rubric files were opened or imported. The proof records that an initial bounded read of the permitted harness file reached its adjacent rubric-construction line, which was not used; no further rubric-source reads were made.

```sh
export DENO=deno
bash review/search-provider-parity/run-tests.sh
# Recorded baseline: 4 PASS / 2 FAIL. The nonzero result is expected.
"$DENO" check --cached-only tests/architect/pending/search-provider-parity.test.ts
```

The runner uses only invented local fixtures and denies network. Existing suites and measurements were not repeated while packaging this handoff.

## Unapplied harness-only proposal

`search-provider-query-parity-proposed.patch` makes the fixture provider filter candidates with the canonical all-word matcher while retaining the original complete rows and the existing `posting(id)` lookup. Its SHA-256 is `452f950d8945746c11d79fcb2451cea5fa013e113b14e7735635f7f827800c04`. It passed a read-only application check against the exact base and remains unapplied.

**NOT a product fix. NOT a frozen-pair change.** The proposal would expose the product fallback violation; it does not repair hard-constraint handling. The source owners must agree on a future change separately. This handoff leaves the frozen paired measurement, canonical writer and existing writer handoff unchanged.

## Cost status supplied by the QA owner

| Item | Status |
|---|---|
| QA cost | $0 |
| Mini recorded cost | $2.258950 |
| Higher cost | UNRECONCILED |
| Cap | $8 |

No paid call was made for this gate or handoff. `verification.json` records the exact artifact hashes and cost status.
