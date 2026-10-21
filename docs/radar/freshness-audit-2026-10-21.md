# Job Radar — discovery shelf freshness audit (measured 2026-10-21)

Method: read-only `sb.py query` against prod (`mrwngntwmnaqrqhupvlt`),
one statement per call, results read from the response body. Audit run
2026-10-21 ~18:1x UTC. Re-runnable SQL at the bottom.

## Per-source freshness — `public.career_kb_postings`

| source | rows | boards | oldest posted_at | newest posted_at | last fetched_on |
|---|---|---|---|---|---|
| greenhouse | 12,072 | 65 | 2024-07-24 | 2026-10-14 17:54Z | 2026-10-14 |
| ashby | 2,776 | 41 | 2021-04-27 | 2026-10-14 17:46Z | 2026-10-14 |
| arbeitnow | 2,608 | 1 | NULL (all rows) | NULL | 2026-10-14 |
| themuse | 1,505 | 1 | 2024-04-30 | 2026-10-13 18:44Z | 2026-10-14 |
| nyc-open-data | 1,117 | 1 | 2026-03-17 | 2026-10-12 | 2026-10-14 |
| lever | 507 | 8 | 1709-06-16 ⚠ | 1790-01-27 ⚠ | 2026-10-14 |
| workday | 404 | 1 | NULL (all rows) | NULL | 2026-10-14 |
| hn-algolia | 358 | 1 | 2026-10-01 | 2026-10-14 17:28Z | 2026-10-14 |
| jobicy | 227 | 1 | 2026-10-08 | 2026-10-14 14:04Z | 2026-10-14 |
| remoteok | 99 | 1 | 2026-08-03 | 2026-10-13 | 2026-10-14 |
| remotive | 15 | 1 | 2026-09-14 | 2026-10-11 | 2026-10-14 |
| **total** | **21,688** | | | | |

Headline facts:

- **`fetched_on` min = max = 2026-10-14 across all 21,688 rows.** The
  entire shelf is ONE bulk load from a single day, 7 days stale at audit
  time. Nothing has entered the shelf since 2026-10-14.
- Pilot families (Greenhouse + Lever + Ashby) = 15,355 rows (70.8% of
  the shelf), but their newest postings are from 2026-10-14 — a Radar
  pilot on this shelf alone would alert on week-old postings.
- Data-quality flags: **lever `posted_at` is unusable** (values land in
  1709–1790 — an epoch-unit misparse in the source corpus); **arbeitnow
  and workday carry no `posted_at` at all.** For those sources,
  freshness can only be judged by `fetched_on` and the seen-set, never
  by posting date.

## How postings enter today (file evidence)

- The table is created by
  `supabase/migrations/20261015010000_career_knowledge_base.sql`.
- The only writer is `scripts/career/load-knowledge-db.py` — a loader
  for a STATIC research corpus (`hired-research/corpus/postings.jsonl`
  under `~/workspace/your_files/`, owner order 2026-10-14), run
  manually through sb.py, idempotent by `content_hash` diff. Its
  `watch` mode polls the research INDEX files for load completion; it
  is not a job-feed poller and nothing schedules it.
- No cron, timer, or edge function in the repo re-runs the loader or
  writes `career_kb_postings`. The one recurring job in this area, the
  alerts scheduler (`scripts/career/alerts-scheduler.mjs` +
  `alerts-host.mjs`, modules 151/152), polls board feeds directly per
  user and keeps seen-snapshots in `career_watch_kv`; it never writes
  the shelf (every recent cycle logs `boards_seeded: 0` for the KB
  sense — its seeding is snapshot state, not shelf rows).
- Chat discovery reads the shelf via
  `supabase/functions/_shared/career_pool.js` (the 600-row recency
  window `postingsFor`).

**Verdict:** there is no live ingestion. Radar's freshness must come
from a new recurring ingestion piece (pilot build list, item 2) or from
the alerts host's own per-board polling — the shelf as-is is a
week-old snapshot.

## Re-run SQL

```sql
select source, count(*) as rows, min(posted_at) as oldest_posted,
       max(posted_at) as newest_posted, max(fetched_on) as last_fetched_on,
       count(distinct board) as boards
from public.career_kb_postings group by source order by rows desc;

select count(*) as total_rows, max(fetched_on), min(fetched_on)
from public.career_kb_postings;
```
