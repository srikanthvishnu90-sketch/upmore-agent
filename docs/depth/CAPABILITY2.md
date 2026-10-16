# Capability 2: grounded recommendations

Local source work only. The new 15-part test contract is below; existing frozen
career tests and profile fixtures remain unchanged. No production claim is made.

| ID | Observable contract | Planted defect |
|---|---|---|
| C2-01 | Only confirmed, uniquely identified facts support recommendations | Accept draft/rejected facts |
| C2-02 | Quant comparison never invents a degree, language or project | Restore hardcoded CS/Python/project claim |
| C2-03 | Citations resolve to the user's exact confirmed fact IDs | Corrupt citation IDs |
| C2-04 | Nontechnical records produce nontechnical hypotheses | Collapse every role to software |
| C2-05 | Self-report/dangling references do not prove a skill | Treat every skill as demonstrated |
| C2-06 | Required/preferred gaps retain posting wording and evidence status | Rewrite requirement levels |
| C2-07 | Absent employer requirement stays unknown; samples fit the domain | Assume every skill is preferred |
| C2-08 | Location scope respects stated preferences and relocation limits | Replace preferences with residence |
| C2-09 | Remote/location constraints fail closed on unknown geography | Bypass remote constraint |
| C2-10 | Fixture/snapshot jobs are never current | Ignore fixture provenance |
| C2-11 | Source URL, open state and observation freshness are mandatory | Permit stale observations |
| C2-12 | Current-source results carry URLs, dates, facts, gaps and uncertainty | Drop requirement comparison |
| C2-13 | Empty pool, role mismatch and unknown pay are explicit | Bypass paid-only constraint |
| C2-14 | Resume extraction creates drafts without changing existing facts | Auto-confirm extracted facts |
| C2-15 | Recommendation routes are read-only and preserve action ownership | Capture apply/send/watch asks |

Run `node --test tests/capability2-grounding.test.cjs tests/capability2-bundle.test.cjs`
and `node evals/depth/CAPABILITY2.mutations.cjs`. The mutation runner uses isolated
copies and records a targeted failing assertion for each defect. Results and
limitations are recorded in docs/testing/runs/capability2-grounded-20261015/.

Verified on source `48f919d202c469a5d2ad1497a6eaaebc0a006d0f`: **15/15**
planted defects caught by their targeted assertions; grounding **138/138**,
bundle/host **9/9**, adjacent contracts **236/236**, Agent100 dry **103/103**,
local release harness **RELEASE OK**. Complete stdout, source hashes and the
separate optional clock-guard blocker are in the run's results.json/REVIEW.md.
