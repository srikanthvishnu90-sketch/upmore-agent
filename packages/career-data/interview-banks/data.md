# Data Interview Bank — Data Analyst / Data Scientist / Analytics

> Product data. Researched 2026-10-13 from sources fetched live (browser search + open).
> Every canonical item lists its source. Commercial guides are labelled [commercial].
> Worked SQL below is original writing for the stated (sourced) prompts — standard SQL, not copied solution text.

## Format facts (sourced)

1. **Meta DS loop (candidate/guide-reported)**: recruiter screen, then technical screen(s) — SQL + probability/statistics — then an onsite of ~4 rounds covering SQL again, experimentation, product sense / metric definition, and behavioural/cross-functional. Guides report ~4–8 weeks end-to-end; one guide summarises a specific Meta DS track as 7 rounds / ~6 weeks. Confirm with the recruiter — tracks differ.
   Sources: DataInterview Meta DS guide [commercial] — https://www.datainterview.com/blog/meta-data-scientist-interview ; GetOraVa summary — https://www.getorava.com/interview-guides/data-scientist-meta
2. **SQL is tested twice at Meta DS** (screen + onsite) and is described as non-negotiable; product sense is weighted about as heavily as technical work in guide summaries.
   Source: DataInterview [commercial] — https://www.datainterview.com/blog/meta-data-scientist-interview
3. **Robinhood DS (guide-reported)**: ~7 rounds / ~5 weeks; emphasis on A/B testing end-to-end (power/MDE, ramp, guardrails), SQL as a *product* skill (CTE-based queries, windows for funnels/cohorts, validation aloud), and fintech guardrail metrics.
   Source: DataInterview Robinhood guide [commercial] — https://www.datainterview.com/blog/robinhood-data-scientist-interview
4. **Take-homes / projects**: StrataScratch describes its "Strata Projects" as take-home-style work — a real dataset + open-ended prompt in a hosted Python notebook — presented as the platform's model of what actual DS take-homes look like. Interview Query's comparison counts 50+ DS projects/take-home exams on StrataScratch.
   Sources: StrataScratch [commercial] — https://www.stratascratch.com/blog/the-11-best-data-science-platforms ; Interview Query comparison [commercial] — https://www.interviewquery.com/p/interviewquery-vs-stratascratch
   Expectation to teach (from those descriptions): define the metric/decision first, show data cleaning + validation, give a recommendation — not just a model score. **Exact time limits (e.g. "4 hours", "1 week") are UNVERIFIED — firms set them per role; do not teach a universal number.**
5. **What gets candidates rejected (guide consensus)**: weak metric definitions (activation/retention/conversion), misreading p-values / peeking / multiple-testing, SQL failures on realistic event data (windows, cohorting, deduping, join explosions), and unstructured product cases.
   Sources: DataInterview Robinhood — https://www.datainterview.com/blog/robinhood-data-scientist-interview ; DataInterview Meta — https://www.datainterview.com/blog/meta-data-scientist-interview

---

## A. SQL — canonical questions & skills (12 items)

DataLemur [commercial, question bank built from named-company prompts] repeatedly flags window functions as a frequent interview topic across its company pages.
Source for that claim: DataLemur — https://datalemur.com/blog/newmark-group-sql-interview-questions

1. **Histogram of Tweets (Twitter)** — count tweets per user in a year, then bucket users by that count (nested aggregation).
   Source: DataLemur (fetched) — https://datalemur.com/questions/sql-histogram-tweets?referralCode=S2PrA4li
2. **Second Highest Salary (FAANG)** — distinct salary ranking; handle duplicates (show once).
   Source: DataLemur (fetched) — https://DataLemur.com/questions/sql-second-highest-salary
3. **Top Three Salaries per department** — `DENSE_RANK()` partitioned by department.
   Source: DataLemur list (via SQLMastery index) — https://github.com/Jayita11/SQLMastery_One-Stop_SQL_Interview_PrepHub/blob/main/DataLemur/README.md
4. **User's Third Transaction (Uber)** — `ROW_NUMBER()` per user ordered by date, filter to row 3.
   Source: same DataLemur index above.
5. **Active User Retention (Facebook)** — users active in both the current and previous month (monthly retained / MAU logic).
   Source: DataLemur problem as documented in a solutions repo — https://github.com/honoka09062026-dotcom/sql-solutions
6. **Page With No Likes (Facebook)** — anti-join: `LEFT JOIN … WHERE … IS NULL` or `NOT IN`.
   Source: DataLemur solutions index — https://github.com/bhaveshratan/DataLemur-SQL-Solutions
7. **Data Science Skills (LinkedIn)** — candidates having all of a required skill set: filter + `GROUP BY … HAVING COUNT(DISTINCT skill) = 3`.
   Source: same index above.
8. **Tweets' Rolling Averages (Twitter)** — windowed `AVG() OVER (PARTITION BY … ORDER BY … ROWS BETWEEN …)`.
   Source: DataLemur index — https://github.com/Jayita11/SQLMastery_One-Stop_SQL_Interview_PrepHub/blob/main/DataLemur/README.md
9. **Sending vs. Opening Snaps (Snapchat)** — conditional aggregation / percentages by segment.
   Source: DataLemur problem as documented — https://github.com/honoka09062026-dotcom/sql-solutions
10. **Consecutive Filing Years (Intuit)** — `LAG(value, 2)` over a per-user ordered series to detect 3-in-a-row.
    Source: same repo above.
11. **Running totals & ranking by group/month with window functions** (generic form asked across many firms on DataLemur: monthly total per group + rank per month + cumulative sum).
    Source: DataLemur — https://datalemur.com/blog/newmark-group-sql-interview-questions
12. **Joins / CTEs / deduping / cohort & retention logic as a named skill cluster** for DS interviews (not one prompt): joins, aggregations, CTEs, window functions, cohort analysis, retention logic, date handling.
    Source: Intuit DS guide summary — https://dev.to/feng_zhang_cedb4581bee881/intuit-data-scientist-interview-guide-2026-11lh ; StrataScratch SQL path (joins, aggregating, subqueries/CTEs, window functions modules) [commercial] — https://www.stratascratch.com/

## B. Statistics & A/B testing (8 items)

Sources (apply to items 13–20 unless a second source is shown): DataInterview Meta DS [commercial] — https://www.datainterview.com/blog/meta-data-scientist-interview ; DataInterview Robinhood DS [commercial] — https://www.datainterview.com/blog/robinhood-data-scientist-interview ; Intuit DS guide — https://dev.to/feng_zhang_cedb4581bee881/intuit-data-scientist-interview-guide-2026-11lh

13. **Design an A/B test end-to-end** — hypothesis, unit of randomisation, primary metric, guardrails, ramp plan.
14. **Power / sample size / Minimum Detectable Effect (MDE)** — trade MDE against duration and traffic.
15. **Interpret a result: p-values & confidence intervals** — what they do/don't prove; don't ship on a headline lift alone.
16. **Peeking & multiple testing** — why repeated early looks and many metrics inflate false positives; corrections / pre-registration.
17. **Novelty / primacy effects and network effects (interference)** — especially in social products, where treatment leaks to control.
18. **Sampling bias, confounding & selection bias** — and, when randomisation is limited, identification strategies guides name for Meta-style cases: difference-in-differences, matching, synthetic controls. Source: DataInterview Meta DS (fetched page) — https://www.datainterview.com/blog/meta-data-scientist-interview
19. **Core probability / distributions** — Bayes, binomial/normal/Poisson, CLT, hypothesis-testing mechanics (t/z tests). Source: DS learning-path synthesis — https://github.com/ashid332/interview-preparation/blob/HEAD/02-learning-paths/data-scientist.md
20. **Debug a flawed experiment** — bad metric choice, broken randomisation, or a result that shouldn't ship despite an improved headline metric. Source: Intuit guide above.

## C. ML concepts (5 items)

Source: DS learning-path synthesis (weeks 7–10 topics) — https://github.com/ashid332/interview-preparation/blob/HEAD/02-learning-paths/data-scientist.md ; StrataScratch non-coding bank (ML/stats/product categories) [commercial] — https://www.interviewquery.com/p/interviewquery-vs-stratascratch

21. **Linear & logistic regression** — assumptions, coefficients/log-odds, multicollinearity, fit measures.
22. **Tree models** — decision trees, random forests, gradient boosting (e.g. XGBoost), feature importance, overfitting controls.
23. **Unsupervised** — k-means clustering, PCA / dimensionality reduction, segmentation use-cases.
24. **Evaluation metrics — choose & justify**: precision/recall, F1, ROC-AUC for classification; RMSE for regression; why accuracy alone misleads on imbalanced data.
25. **Bias–variance / train-test hygiene** — leakage, validation splits, and why a take-home model can look good and still be wrong. (Framing item; the underlying topics — evaluation + modelling — are sourced above; the exact wording "bias-variance" as a named interview prompt is **UNVERIFIED** in the fetched sources.)

## D. Case / product analytics (5 items)

Sources: DataInterview Meta DS — https://www.datainterview.com/blog/meta-data-scientist-interview ; GetOraVa Meta DS summary — https://www.getorava.com/interview-guides/data-scientist-meta

26. **Define success metrics for a product/feature** — primary metric, supporting metrics, guardrails; e.g. DAU/MAU, activation, D7/D30 retention for a new product.
27. **"Why did this metric move?"** — diagnose a drop/spike: segment, check instrumentation, separate internal vs external causes, then quantify.
28. **Funnel analysis in SQL & in words** — step conversion, where the drop is, which segment drives it.
29. **Cohort / retention analysis** — define the cohort, the retention event, and the denominator before querying.
30. **Turn an ambiguous business question into a measurable plan** — decompose, state grain/keys/definitions, give a decision recommendation with estimated impact. Source: DataInterview Meta DS (fetched) — https://www.datainterview.com/blog/meta-data-scientist-interview

**Total canonical items: 30** (12 SQL + 8 stats/experimentation + 5 ML + 5 product-analytics), plus 5 format facts.

---

## Worked example 1 — Histogram of Tweets (original SQL for item 1)

```sql
WITH per_user AS (
  SELECT user_id, COUNT(*) AS tweets_in_2022
  FROM tweets
  WHERE tweet_date >= '2022-01-01' AND tweet_date < '2023-01-01'
  GROUP BY user_id
)
SELECT tweets_in_2022 AS tweet_bucket, COUNT(*) AS users_num
FROM per_user
GROUP BY tweets_in_2022
ORDER BY tweet_bucket;
```
Why it's canonical teaching material: two levels of aggregation — a very common interview trap is trying to do both counts in one `GROUP BY`.

## Worked example 2 — Second Highest Salary (original SQL for item 2)

```sql
SELECT MAX(salary) AS second_highest_salary
FROM employees
WHERE salary < (SELECT MAX(salary) FROM employees);
```
Alternative interviewers like to see: `DENSE_RANK() OVER (ORDER BY salary DESC)` in a CTE, filter rank = 2 — that version generalises to "Nth highest" and to "top 3 per department" (item 3). Mention the duplicate rule explicitly: distinct salary, not second row.

## Worked example 3 — A/B test answer skeleton (original)

Prompt: "Design an experiment for a new onboarding flow."
1. **Decision & hypothesis:** "If new users see the shorter flow, activation (completed setup within 24h) rises, because drop-off is concentrated at step 3."
2. **Unit & randomisation:** randomise by user (not session) to avoid cross-contamination; check SRM (sample-ratio mismatch) daily.
3. **Metrics:** primary = activation rate; guardrails = D7 retention, support contacts, crash/error rate — no ship if a guardrail breaches its pre-set threshold.
4. **Power/MDE (illustrative maths, state assumptions):** baseline 30%, MDE +2pts, α=0.05, power=0.8 → roughly ~8–9k users per arm for a two-proportion test; if traffic gives that in 5 days, still run ≥1 full week to cover day-of-week effects.
5. **Read-out discipline:** no peeking-based early ship; report effect + CI, not just p; segment pre-declared cuts only; state the ship / no-ship / iterate call and what evidence would change it.

## Standardisation note
Data is **moderately standardised**: SQL patterns (windows, ranking, retention, nested aggregation) and the A/B-testing checklist are near-universal, but the *mix* swings hard by firm — Meta/Robinhood-style product DS is metrics + experimentation first, while other firms weight ML modelling or pure analytics SQL more. There is no single canonical loop like SWE's.
