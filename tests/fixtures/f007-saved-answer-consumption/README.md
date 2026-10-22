# F-007: VERIFIED_BASE

Pinned current base: `348c2d4a3564c54135d0c485bb0d09d763ee0901`.
Existing fix: `774f24b0` (already an ancestor). This branch adds verification only; it changes no product source.

The carried audit claim that module 149 never consumes `application_answer` / `application_text` does not reproduce on this base. The production stored-profile adapter passes the owner and canonical WO-102 contract into `deriveAnswers`; `savedAnswersOf` keeps trusted answers, and preparation fills their exact question with a fact/event/manifest ledger. Long answers also require the same employer. Foreign, quarantined, unconfirmed, unprovenanced, eventless, delegated, and conflicting answers remain asks.

| Exact source tree | Existing answer-map suite | Independent production-adapter integration |
| --- | --- | --- |
| Before the existing fix: `cb54a5838c416732d78f08ff60a8253726809e58` | 8 pass / 4 fail | 9 pass / 2 fail |
| Current base: `348c2d4a3564c54135d0c485bb0d09d763ee0901` | 12 pass / 0 fail | 11 pass / 0 fail |

The same test bytes run on both source trees; each report records their hashes and every loaded source hash. Raw logs are losslessly gzip-compressed, with their uncompressed SHA-256 recorded; use `gzip -dc` to read them. The two independent historical failures are the positive short-answer and employer-scoped long-answer cases. Nine refusal/conflict controls pass on both trees. The audit's old `6b6551cf` object was unavailable locally; the historical comparison uses the exact parent of the existing fix, rather than claiming a run on that unavailable object.

Reproduce offline from this checkout:

```sh
node tests/fixtures/f007-saved-answer-consumption/reproduce.cjs cb54a5838c416732d78f08ff60a8253726809e58 /tmp/f007-before
node tests/fixtures/f007-saved-answer-consumption/reproduce.cjs 348c2d4a3564c54135d0c485bb0d09d763ee0901 /tmp/f007-base
```

Only synthetic fixtures and local synchronous board seams ran. No browser, real user, provider, submit, live store, deploy, migration, paid evaluation, or live closure is claimed. New spend: $0.
