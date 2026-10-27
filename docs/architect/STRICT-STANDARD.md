# Strict standard (owner, 2026-10-26: "be extremely strict... don't let anything be accustomed to error... mimic genuine perfection")

Every change must meet all of these before it is reported done. "Mostly", "environment-only", "pre-existing" and "follow-up" are not acceptable without proof.

1. Outcome, not wording: every test asserts real state (DB rows, events, outbox deliveries, external requests made with exact params), and that the reply is true to that state. A reply that claims more than the state shows is a failure.
2. Fail-first, shown: each new test fails on the base for the stated reason (quote the failure) and passes after.
3. Mutation check: for each guard you add, break it once (comment out the check / flip the condition) and show a test goes red. A guard no test catches is not done.
4. Negative and adversarial cases: wrong user, double tap/retry, stale card, empty/huge input, injection text in postings/emails, network failure, partial failure. Each one has a test.
5. No silent excuses: a failure you call "environment" or "pre-existing" must be reproduced on the base with the same error, and named in the report with evidence. Otherwise fix it.
6. No invented facts or numbers, in code, replies, docs or reports. Every number in a report is measured, with how.
7. Plain, exact user-facing words; no internal codes, no promises the deployed system can't keep.
8. Every user-visible behavior works on every channel (web, Telegram, SMS) or the reply says exactly what isn't available there.
9. Report precisely: what is proven, what is not, what was not run and why. Coverage as fractions with a reason for every gap.
10. Before reporting, re-read your diff as a hostile reviewer and list anything you'd reject. Fix it or report it.
