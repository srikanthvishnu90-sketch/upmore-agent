# Route-hijack regression test (2026-09-28)

`tryFastPath` in `supabase/functions/agent-chat/index.ts` was matching routes
on single common words / substrings, hijacking unrelated messages:

- "Say hello in five words" -> Five Star Credit Union card ("five")
- "My credit score dropped" -> Five Star Credit Union card ("credit")
- "Which debt do I pay off first" -> First National Bank card ("first")
- "Cancel everything I'm not actually using" -> Ally ("ally" in "actually")
- "I need $300 by Friday" -> Appen ("appen" in "happen")
- "Track my progress toward the signup bonus I started" -> Five Star ("star" in "started")

Fix: word-boundary matching + distinctive-word rule (2+ distinct non-generic
words, or 1 word naming at most 2 providers catalog-wide) + number words in
GENERIC_PROVIDER_WORDS + bill/dispute/cancel guard on the named-route fallback.

Run: `node --experimental-strip-types run.mts` (self-contained; route catalog
is synthetic but document frequencies mirror production for the tested words).

Note: `index.ts` + `_shared/` here are a SNAPSHOT of
`supabase/functions/agent-chat/` taken 2026-09-28. Re-copy them when
`tryFastPath` changes, or the test silently tests old code.

Also: finance-intent suppression (2026-09-28) — when `financeFactMatch`
matches, the request handler skips `tryFastPath` entirely so finance
questions reach the model with the FINANCE Q&A nudge instead of a route card.
`run.mts` covers only the matching rules; the suppression is at the call site.
