# Career datasets (finisher lane C, built 2026-10-13 — FREE public sources only)

| File | Source | Retrieved | Coverage |
|---|---|---|---|
| `bls-labor-data.json` | U.S. Bureau of Labor Statistics — Employment Projections / Occupational Outlook Handbook (2024–34 vintage, May 2024 wages) + CPS "Education pays" Table 5.1 (2024). URLs per record inside the file. bls.gov returns 403 to scripted fetches here, so values were taken from browser-search extracts of those official bls.gov pages (method recorded in the file). | 2026-10-13 | Occupations for the TEST persona's fields (software developers, financial analysts, management analysts) + all-occupation summary + earnings/unemployment by educational attainment (9 rows). |
| `dol-lca-fy2025q4-cir-companies.json` | U.S. Department of Labor OFLC performance data — `LCA_Disclosure_Data_FY2025_Q4.xlsx` (https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/LCA_Disclosure_Data_FY2025_Q4.xlsx) | 2026-10-13 | AGGREGATE ONLY (no raw rows): all 563,689 rows of FY2025 Q4 scanned, 9,392 matched to 32 of 33 real CIR companies (Anduril: 0 filings matched); per company — case counts, statuses, top SOC/job titles, annualized wage median/p25/p75. Aggregator: `scripts/career/datasets/aggregate-lca.py`. An LCA is a filing, not a grant or a hire. |
| `posting-degree-signals.json` | Firms' own public ATS feeds (Greenhouse boards-api + Ashby posting-api) — the same endpoints as run 1 of `docs/career/evidence/jobs-feeds.json`; run 1 saved only 325-char samples, so full text was re-pulled from those same free endpoints and aggregated immediately (raw text not retained). | 2026-10-13 | Population of POSTINGS, not of hires: 3,108 live postings at 10 target companies; per-company degree/major requirement-signal counts. Extractor: `scripts/career/datasets/extract-posting-signals.cjs` (boilerplate guard FIN-C-001). |

Honesty rule: numbers without a source record do not ship — every file carries its source
URL(s), retrieval date, and coverage; known limits are inside the files themselves.
The one population no free source holds — majors of actual hires at target companies —
remains a licensed-dataset input (PDL/Coresignal class) and is named as such in SC-244.
