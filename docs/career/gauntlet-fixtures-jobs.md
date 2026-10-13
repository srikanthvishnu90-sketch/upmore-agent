# Gauntlet fixtures — jobs lane (F2): corpus design notes

Branch `career/gauntlet-f2-jobs` off `pivot/career` @ a6ef2cd. No merge, no deploy.
Built 2026-10-13 (America/Chicago). Public read-only GETs only; no forms submitted anywhere.

Files:

- `packages/career-data/fixtures/gauntlet/jobs/scored-corpus.json` — 24 synthetic postings, ground truth labelled at authoring time, **before any product run**.
- `packages/career-data/fixtures/gauntlet/jobs/public-listings.json` + `public-snapshots/` — 14 current real listings with verbatim raw JSON, plus 3 blocked attempts recorded as coverage, not data.

Board source of truth reused, not reinvented: `BOARD_REGISTRY` in `packages/domain/121-career-jobs.js` (commit a699051, registry-fix doc `docs/career/board-registry-fix-2026-10-13.md`, bundle merge b8de356) and the live-only pull pattern in `scripts/career/proof-jobs.mjs`. Every board used below is a `live` entry in that registry; every dead entry (Goldman Sachs, Netflix, Square, Visa) was either avoided or recorded under `blocked_coverage`.

Reference profiles (fixtures built in parallel by another lane; written against the lane-brief specs):

- **P1** — SWE, graduating May 2027, Python + SQL, **no Java**, Chicago / remote.
- **P3** — operations career switcher with a SQL portfolio.

## A. Synthetic corpus — how each category is detectable from posting content alone

Every posting carries all of its signal in the fields a real ATS posting carries (title, location/remote terms, requirements, salary block or explicit `null`, deadline). No category depends on outside knowledge about the (fictional) company.

| Category | Count | Detection rule a product can actually apply |
|---|---|---|
| `suitable` (GJ-S01…S06) | 6 | Requirements subset of the profile's proven skills; location is Chicago or remote-US; graduation window, where stated, includes May 2027 (P1) or the posting explicitly accepts portfolio/project evidence (P3). Salary present. |
| `suitable_with_tradeoff` (GJ-T01…T06) | 6 | Exactly one named friction, stated in the posting itself: relocation (T01), on-call (T02), preferred-but-not-required language ramp (T03), fixed evening shift (T04), contract-with-unguarded-conversion (T05), ~25% travel (T06). The `tradeoff` field names it; a correct run surfaces it rather than hiding it or excluding the role. GJ-T06 is the corpus's **conditional** case: ground truth note says *ask about travel tolerance* — if the profile caps travel below 25%, reclassify before shortlisting. |
| `hard_exclusion` (GJ-H01…H06) | 6 | A mandatory, non-waivable line that the profile fails: **location/residency** — onsite Berlin, must already be resident in Germany (H01); **required credential** — active CPA, "no exceptions" (H02); **graduation window** — class of 2025 only (H03); **genuinely required missing skill** — Java-first stack, 5+ years production Java required, repeated as the core stack, not a "plus" (H04, contrast T03); **explicit policy mismatch** — active TS/SCI clearance + citizenship required at start (H05); **seniority** — staff level, 8+ years (H06, the sixth exclusion beyond the five named kinds). These align with the hard filters already in `121-career-jobs.js` `hardFilters()` (location, clearance, graduation window, seniority, degree/credential-style requirements). |
| `trap` (GJ-X01…X06) | 6 | **Closed role** (X01): body says applications closed 2026-09-30, listing retained for reference — fit without reading the body wrongly shortlists it. **Duplicate mirror pair** (X02 direct + X03 mirror): same requisition `OPS-4471`, same title/company/location/deadline, different boards and posting IDs; the mirror carries a **stale salary** ($58k–$70k) vs the direct board's current $72k–$88k — dedupe must collapse to one role and keep the direct salary (the repo `dedupe()` merges cross-source duplicates by company/title/city; the requisition ID is the stronger key and is provided explicitly). **Title/body level mismatch** (X04): "Junior" title, staff-level body (6+ years, architecture ownership, team of 5), junior salary band. **Missing salary** (X05): salary is explicit `null`; the posting says only "competitive pay" — must be flagged, never estimated (matches `qualityFlags()` `missing_salary`). **Scam-like** (X06): FTC job-scam pattern — $289 upfront "starter equipment kit" purchase plus a check to deposit for equipment; must be flagged as suspected scam and never shortlisted, despite the attractive $35–$45/hr figure. |

Scoring expectation, stated plainly: suitable = shortlist-eligible; tradeoff = shortlist-eligible **with the tradeoff named to the user**; hard exclusion = excluded with the specific failed line as the reason; trap = excluded or flagged for its trap reason (closed / duplicate / level-mismatch / missing-salary / scam), never silently scored as a normal fit.

## B. Pilot-case mapping (C05, C06, C07, C08, C09, C21)

**Honest caveat first:** no career-pilot definitions for C05–C09 / C21 exist in this repo at a6ef2cd — the C-numbers in the repo belong to an unrelated finance capability list (e.g. C05 is an IOU-log case, C21 a watchlist briefing). The mapping below is therefore **functional, by what each fixture exercises**, for the parent orchestrator to reconcile against the gauntlet plan's own case definitions:

| Pilot case (functional reading) | Postings that feed it |
|---|---|
| C05 — live discovery: poll real boards, report new/changed postings, skip dead boards honestly | `public-listings.json` (14 live, 4 families) + `blocked_coverage` (Goldman/Netflix/Square) |
| C06 — fit scoring: suitable roles shortlisted for the right profile | GJ-S01…S06 (and S06/S04/S05 for P3) |
| C07 — hard exclusions enforced with reasons | GJ-H01…H06 |
| C08 — trap / ghost / scam safety | GJ-X01, GJ-X04, GJ-X06 (closed, level mismatch, scam) |
| C09 — salary & tradeoff transparency | GJ-T01…T06, GJ-X05 (missing salary), GJ-X02/X03 (which salary is current) |
| C21 — dedupe & cross-board identity | GJ-X02 + GJ-X03 (one requisition, two boards/IDs, stale mirror salary) |

Every synthetic posting also lists its reference profile(s), so a case can be run per-profile: P1 sees S01–S03, T01–T03, H01/H03/H04/H05; P3 sees S04–S06, T04/T05, H02; H06, T06, X06 are shared.

## C. Live listings — what was actually pulled

14 listings, 4 ATS families, all from `BOARD_REGISTRY` live boards, retrieved 2026-10-13 (America/Chicago; per-listing timestamps in `public-listings.json`):

- **Greenhouse (7):** Stripe ×3, Datadog ×2, Jane Street ×2 — single-posting endpoint snapshots, verbatim.
- **Ashby (4):** Ramp ×3, Linear ×1 — Ashby's public API has no single-posting endpoint used here, so each snapshot is the verbatim job object extracted unchanged from the board response; the snapshot note says so.
- **Lever (2):** `leverdemo` only. That is Lever's public **demo** board and the only live Lever board in the registry — flagged per-listing. No real-employer Lever board is in the registry (Netflix and Ramp on Lever are dead). The 3-family minimum does not depend on Lever: Greenhouse + Ashby + SmartRecruiters cover it.
- **SmartRecruiters (1):** Bosch Group — single-posting endpoint, verbatim. (Registry spot-check: Bosch `totalFound` 4948.)

Blocked coverage (attempted, unavailable, **not** listings): Goldman Sachs Greenhouse → 404; Netflix Lever → 404; Square SmartRecruiters → HTTP 200 with `totalFound: 0` (identical to a gibberish-token response — evidences no board). Raw bodies saved as `public-snapshots/BLOCKED-*.json`. Visa was not re-attempted; it carries the same registry dead record as Square.

Verification: at finish time every listing URL was re-fetched and checked for the same posting ID (see the re-curl note in `public-listings.json` consumers should expect live boards to move — a posting that disappears later is churn, not a fixture error; any change found at finish time is recorded, not hidden).

## D. Honest limits of the synthetic corpus

1. **Author-clean text.** Synthetic postings state their signals in plain sentences. Real JDs bury the same signals in boilerplate, legal footers, and HTML (Greenhouse `content=true` bodies are entity-escaped HTML). A product that passes this corpus can still fail on real text — that is what section C's live listings are for, and they are unscored on purpose.
2. **One signal per posting, by design.** Tradeoff postings have exactly one tradeoff and exclusions exactly one failing line, so a wrong answer is attributable. Real postings stack frictions; the corpus does not test prioritisation among several.
3. **Salary is structured here, prose in the wild.** Real boards often put compensation only inside JD text (or nowhere). Only X05/X02/X03 exercise salary absence/staleness.
4. **The scam fixture is a textbook FTC pattern**, deliberately legible. Real scams are subtler (spoofed domains, messaging-app interviews); X06 tests the floor, not the ceiling.
5. **Profiles are specs, not the finished fixtures.** P1/P3 profile fixtures are built in parallel; if their final fields differ from the brief specs above (e.g. a stated travel cap), GJ-T06's conditional note is the one ground truth that must be re-read against them.
6. **Fictional companies** mean no CIR/company-bar data exists for them; fit scoring against this corpus runs on the neutral bar, and starred-company behaviour is untested here.
