# Which live application forms put up a human gate (2026-10-20)

**VERIFIED-LIVE**, CI run 39461483337 (`.github/workflows/gate-census.yml`, branch `ci/gate-census`, seed 21).

The run:
- loaded 120 live postings from employers not in sealed samples A–H, read-only;
- aborted every request that was not a GET or HEAD;
- clicked, typed and submitted nothing;
- never opened LinkedIn or Indeed.

| ATS | Postings | Forms rendered | Captcha on the form | Kind | Blocked or challenged | Resume required |
|---|---|---|---|---|---|---|
| Greenhouse | 40 | 38 | **38/38** | reCAPTCHA Enterprise, score-based (invisible) | 1 Cloudflare challenge, 1 timeout | 29/38 |
| Lever | 30 | 29 | **29/29** | hCaptcha, invisible; Cloudflare bot script on 30/30 | 0 | 29/29 |
| Ashby | 30 | 0 | not measured | the form loads through a POST (aborted); the page carries the reCAPTCHA badge | 0 | – |
| SmartRecruiters | 10 | 0 | – | – | **10/10 blocked by DataDome (HTTP 403)** | – |
| Workday | 10 | the posting page only | – | – | 0 | – |
| **All** | 120 | 67 | **67/67 (100%)** | none visible on load | 11/120 | 58/67 |

## What it means
- **Every form a cloud browser can reach scores the visitor at submit.**
  - A server headless browser on a datacenter address is exactly what that score is built to stop.
  - This is consistent with the owner's report that all 18 real cloud attempts stopped at a captcha or an emailed code.
- **SmartRecruiters does not serve a cloud browser at all.**
- **The person's own browser, signed in, is the volume path.**
  - The Trainee extension fills the form and the person submits it; their own session carries their own reputation.
  - The cloud worker (D-028) stays a fallback for the forms that let it through. It never solves a captcha (§6.3).

## Caveats
- **Present is not challenged.** An invisible captcha can pass silently. Against "will be challenged", the counts are an
  upper bound.
- **Load time is not submit time.** A captcha loaded only at submit would not be counted. Against "gates at submit", the
  counts are a lower bound.
- **Emailed codes** arrive after submit, so a read-only census cannot see them: 0 of 120 pages mention one before submit.
- **The test browser looked like a cloud worker:** Playwright's default headless agent on a GitHub address. A person's
  browser scores better.
