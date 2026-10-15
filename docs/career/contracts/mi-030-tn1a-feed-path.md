# CONTRACT — MI-030 / BUG-226: the feed path can never produce a company-less posting (TN-1a residue)

**Written:** 2026-10-15, BEFORE the fix (Crew A machinery: contract first).
**Owner's ruling (2026-10-14, TN-1a):** every detected job gets its record; when the source
names no company, the record carries company: null + a company_not_stated marker — never
invented, never a substitute token. The chat path closed under that ruling (FR-199); the
feed path is the residue (14 Lane A scenarios blocked, not graded).

## Defect statement

121's normalizers substitute the board token as the company: Greenhouse
`(json.name) || token`, Lever `company: companyToken` unconditionally, Ashby
`(json.name) || name`, SmartRecruiters `(j.company.name) || companyToken`. A posting whose
payload names no company therefore arrives with the token (a URL slug) rendered as its
company — a fabricated attribution, and the not-stated state is unreachable through feeds.
Meanwhile `fetchFeed` discards the one honest source it holds: registry feed descriptors
(`boardFeeds()`) carry an explicit `company`, never threaded into the normalizers.

## Done-test (from the master list, MI-030)

1. Feed-path postings whose payload and descriptor name no company carry
   `company: null` + `company_not_stated: true`; the board token appears as a company
   NOWHERE (all four normalizers + the fetchFeed end-to-end path).
2. Company stated by the payload wins; company stated by the feed descriptor (registry
   boards) is used when the payload is silent; stated postings carry
   `company_not_stated: false`.
3. Not-stated postings survive dedupe with the marker intact; job_id stays stable.
4. Fail-first guard stands permanently (tests/career-tn1a-feed-path.test.cjs); existing
   121 consumers' suites stay green; full sweep shows no failures beyond the MI-048 set.
5. Bug law: ledger BUG-226 + register FR-384 in both copies, byte-identical.

## Results (2026-10-15, Crew A)

- **Fail-first:** the guard stood 8/8 RED on the unfixed tree.
- **Post-fix:** tests/career-tn1a-feed-path.test.cjs **8/8, pass^3**; the 121-consumer
  suites (jobs, jobs-domain, discover, assign, alert-watch ×2, tn1a-not-stated, ibtn,
  alerts, depth-ALERTS) **161/161**. One consumer test encoded the defect's assumption
  (DISC-003 cross-board dedupe staged Lever with the token as its only company source);
  it now stages the production way — the descriptor states the company — with the reason
  recorded in the test, the same doctrine as MI-001's guard correction.
- **Full sweep:** 3,865 / 3,831 / 12 vs the MI-001 sweep's 3,855 / 3,821 / 12 (+10 tests:
  this guard + the staged-size and GC guards; the 12 fails are exactly the MI-048 set).
- **Paperwork:** ledger BUG-226; register FR-384 (ENFORCED at birth) in both copies,
  byte-identical; totals 368 rules = 273 ENFORCED / 94 UNENFORCED / 1 HARD-SHUT.
- **Coordination note:** 151 (Crew B in-flight) passes posting.company through untouched
  and builds one ad-hoc Greenhouse descriptor with a token only — after this fix such a
  feed yields not-stated postings instead of token-companies, which is the TN-1a-correct
  behavior; 152 already tolerates company-less postings (BUG-161). No 151 edit made.
- **Lane A done-test residue:** the 14 blocked feed-path scenarios can now be graded —
  their re-run belongs to the Lane A re-run (MI-051) once the fix merges.
