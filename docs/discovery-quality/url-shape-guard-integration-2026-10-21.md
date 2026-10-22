# Integration note — F-010 URL-shape guard (DISCO-QUALITY, 2026-10-21, base cea914fe)

**Artifact:** `packages/domain/166-career-url-shape.js` (`CareerUrlShape.classifyPostingUrl(url) -> {verdict, shape, reasons}`, `isPostingUrl(url)`) + guard suite `tests/career-url-shape.test.cjs` (**33/33 pass**; fail-first recorded — the suite failed on the absent module before it was written, and one sweep-found edge — Stripe's `/jobs/search?gh_jid=` wrapper — was added as a regression cell before the precedence fix).
**Module number 166 is provisional** — above the connector block (156–159); renumber on integration if the registry assigns otherwise, the way 159 was renumbered.

## Measured evidence

- Full F-003 audit sweep (all 60 fetched-and-checked URLs, `job-link-audit-2026-10-20.json`): **52 posting / 8 not_posting / 0 unknown — 0 junk missed, 0 real postings rejected.** The 8 not_posting are exactly the junk: 6 Socrata endpoints (nyc-open-data) + 2 HN threads (hn-algolia).
- Shelf impact (read-only count, 2026-10-21): **1,475 of 21,688 rows (6.8%) carry junk-shape URLs today** — all 1,117 nyc-open-data rows (`data.cityofnewyork.us/resource/…`) and all 358 hn-algolia rows (`news.ycombinator.com/item?…`). Every one is servable to a user right now; `career_pool.js` copies the snapshot URL verbatim and no path checks shape before serving.
- Shape ≠ liveness: this guard never fetches. A "posting" verdict means the URL is the *shape* of a posting; whether it is alive remains the F-003/liveness lane's check. An unrecognized shape is `unknown` — kept and flagged, never promoted (wrong is worse than empty).

## Call sites (for the integration lane)

1. **Load side — the corpus loader that writes `public.career_kb_postings`** (the snapshot loader behind `fetched_on`/`corpus_vintage`; it lives outside the product tree in this repo). Classify each row's `url` before INSERT: `not_posting` → do not load (log the count per source); `unknown` → load with `extra.url_shape = "unclassified"` stamped so the shape debt is visible in data. This stops the next snapshot from re-importing the junk.
2. **Serve-side backstop — `supabase/functions/_shared/career_pool.js`:** rows already on the shelf need the same screen. In `adaptPosting` (the row→posting adapter, ~lines 100–116; the URL is copied at `url: s(row.url || "")`), classify the row URL: `not_posting` → return null so the row never enters the pool; `unknown` → pass through with `url_shape: "unclassified"` on the posting. This is the user-facing fix and needs no data migration.
3. **Bundle:** add `166-career-url-shape.js` to the router-core bundle names/exports (`scripts/build-router-core.py`) the same way the connector modules were staged, so the edge bundle and the domain tree carry the same classifier.

## What this does not do

- No liveness fetching (F-003's lane), no change to which sources are ingested (a source-policy call — nyc-open-data postings may be real jobs; their *served URL* is the defect, and the load side should substitute the human posting URL from the dataset row or drop the row), no edits to 121/142.
