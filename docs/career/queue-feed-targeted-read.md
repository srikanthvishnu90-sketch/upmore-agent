# Queue feed — the targeted shelf read (integration note)

Throughput Package B, 2026-10-21. Root failure: **MUSE-F-005**.
Benchmark context: 50 applications in 30 minutes starts with a feed
that can assemble a 50-posting eligible queue at all. Today it
cannot. This note ships the fix as a new module plus the exact
merge point; it edits no existing file.

## The defect, measured (live shelf snapshot, 2026-10-21)

Method: the full `career_kb_postings` shelf (21,688 rows) pulled
read-only through the Management API SQL endpoint; the loader
contract (`career_pool.createKbPoolLoader` over an emulated
`readRows`: recency order `posted_at DESC`, limit) run locally with
the real module 121 classifiers. Load-bearing F-005 figures
reproduce exactly: the window's intern band is **2 postings, both
Operations**; **SWE+intern in the window is 0**; Data/ML postings
in the window number **48** (F-006's figure). Band totals in the
large bands differ from F-005's record by ≤14 (mid 238 vs 224,
senior 143 vs 148, manager 108 vs 113, staff 71 vs 73, director 32
vs 29; junior 5 and intern 2 identical) — the original count ran
over the 595 postings the filter's input carried; this run maps
all 600 window rows. The conclusion is unchanged.

| | BEFORE — window feed only | AFTER — window + targeted supplement |
|---|---|---|
| Reads per queue assembly | 1 window pull — and re-pulls are **byte-identical** (pulls 2, 3 verified): the same 600 rows forever | 8 (1 window + 7 keyed: 6 title keys + 1 text key) |
| Rows moved per assembly | 600 per pull, unbounded pulls | 2,148 total (600 window + 1,548 keyed) |
| Eligible yield (SWE + intern) | **0** per pull, every pull | **50 of 50** (shelf holds 173) |
| Second witness (Data/ML + intern) | 0 in window | 35 of 35 (the whole shelf count) |
| Assembly wall time | ~0.44 s of map+classify buys 0 eligible postings | median **2.26 s** local compute over the snapshot (5 runs: 0.89–3.75 s) → **≈1,325 eligible postings/min**, compute-bound; excludes read wire latency, which is one bounded read class per `postingsFor` call either way |
| 50-posting queue | **unreachable** — starves at 0 | assembled from one `postingsFor` call |

Shelf truth the feed now reaches: 397 intern-band postings
shelf-wide (SWE 173, Data/ML 35), vs 2 in the window.

Superset, measured: the keyed candidates contain 392 of the 397
intern-band postings. The 5 misses are one mechanism, diagnosed
row by row: the intern text key (`text_excerpt ilike '%intern%'`)
matches 5,346 shelf rows and its 1,000-row recency-first cap
leaves ranks 2,154–4,929 unfetched — all 5 stale (posted
2026-08-27…10-02 or undated), 4 of 5 junk/Other-family rows; SWE
coverage is 172/173, Data/ML 35/35. Recency-first capping is the
right trade for a feed that wants the freshest 50; it is a trade,
and it is named in the module header rather than hidden.

## What ships in this branch

- `workers/career-browser/career-shelf-targeted.cjs` — NEW.
  `createTargetedShelfRead({ readRows, jobs, perKeyLimit })` →
  `loadKeyed({ family, band, limit })`, plus `mergePostings`.
  Keying is candidate fetch only: ilike substring patterns
  mirrored from the title side of 121's `FAMILY_RULES` /
  `seniorityBand` checks, plus the intern text key the band
  classifier's own JD-head fallback credits. Patterns are module
  constants, never user input. Reads are single-filter specs in
  the exact shape `career_pool.loadTargeted` already emits.
  Failure posture mirrors the pool loader: never throws; a failed
  read fails the supplement with `KB_POOL_READ_FAILED`; no key →
  `SHELF_TARGETED_KEY_REQUIRED`; unknown key →
  `SHELF_TARGETED_KEY_UNKNOWN`.
- `tests/career-shelf-targeted.test.cjs` — NEW, 6 tests: every
  classifier path to intern is fetched; over-fetched mid/senior/
  manager postings still classify mid/senior/manager and never
  enter the intern queue (the band filter is 121's, unchanged);
  family keying never relabels; merge dedupes with the base copy
  winning; named-error postures; and the F-005 starvation guard in
  miniature (window-only starves, window+targeted assembles).

## The merge point (exact)

`workers/career-browser/production-sources.cjs`, `postingsFor`
(line 94) — today it ignores its `familyText`/`count` parameters
and returns `loadPool()`'s 600-row window whole. The wiring, for
the owning lane:

1. After `loadPool()` succeeds, derive the named keys from
   `familyText`: family via 121's `askRoleFamilies`, band via the
   band tokens in the same text (the batch ask's own words —
   "software engineering **intern** roles" names both).
2. `const keyed = await shelfTargeted.loadKeyed({ family, band })`
   with a `createTargetedShelfRead` built on the same transport
   `readRows` and the same `jobs` (121) the loader already gets.
   On `keyed.error`, keep the window pool alone — today's exact
   behavior.
3. Return `mergePostings(pool.postings, keyed.postings)`.

Module 155's prepare screen and 121's classifiers are **not**
touched: the merged pool enters `batch-executor.cjs:118` →
155's discover → dedupe → screen exactly as today, and the band
filter is **not relaxed** — the supplement only widens what the
filter gets to see, which is the whole defect.

**One prerequisite wiring edit (not in this branch's ownership):**
`workers/career-browser/supabase-transport.cjs` `readRows` binds
only the object shape `{ column: { eq } }`; the keyed specs use
the array shape `filters: [{ column, op: "ilike", value }]` that
`career_pool.loadTargeted` already emits and the Edge root already
binds (`handler-career.ts:231-232`). The transport owner adds the
ilike binding (one branch in the filters loop); until it lands,
the module and its guard are ready ahead of the wire, and nothing
in production behavior changes.

## Residuals, named

- Per-key cap (1,000, recency-first) truncates the intern text
  key's stale tail — measured above; the queue's freshest 50 are
  unaffected.
- An intern token split mid-word by an HTML tag in the raw
  excerpt is invisible to the text key (0 measured cases).
- Family has no superset claim: families 121 reaches from JD text
  alone (firm-identity / JD-fallback passes) cannot be title-keyed;
  the window pool remains their carrier. The band dimension —
  the one that starves queues — is the covered one.
