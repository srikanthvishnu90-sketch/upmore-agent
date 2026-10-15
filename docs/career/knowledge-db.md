# Career Knowledge DB — read contract

The career knowledge libraries (Mega Task 1 hired-research, Mega Task 3
resume+skills, the Mega Task 2 board directory, and the postings corpus)
live in the Upmore Supabase project (`mrwngntwmnaqrqhupvlt`) as four
additive tables. This doc is the contract for reading them.

**Status: NOT WIRED.** The live product does not read these tables yet.
Wiring the career host / router to query them is host work for a later
build round. Nothing in the deployed agent-chat function changes because
these tables exist.

**Tier label:** the content is Tier 3 (Muse research, public sources
only). The load is Tier 2 (product database, loaded by Muse's
harness). Product answers built on this data inherit the research tier
and must keep the files' own evidence labels (CORPUS-COMPUTED vs
ANALYZED-SET, REPORTED, "insufficient data (n=X)").

## Access posture

- RLS is enabled on all four tables with **no anon/authenticated
  policies**. Reads happen from the backend (agent-chat edge function)
  with the service role, which bypasses RLS — the same posture as the
  rest of the career state. Never expose these tables to the anon key.
- Loader: `scripts/career/load-knowledge-db.py` (idempotent upserts on
  natural keys, diffed by `content_hash`; re-running changes nothing).
  Migration: `supabase/migrations/20261015010000_career_knowledge_base.sql`.
- Every row carries provenance: `source_files` / `source_file`,
  `source_vintage`, and `content_hash`. An answer that cannot name its
  source row is not allowed to cite this knowledge base.

## Tables

### career_kb_roles — one row per role (849 base + market splits)

Key: `role_key` = `soc:<SOC code>` for base occupations,
`split:<slug>` for market splits. Columns: `soc_code` (parent SOC for
splits), `slug`, `title`, `sector_code` / `sector_name` (SOC major
group), `employment_2024_k` (BLS 2024 employment, thousands; null where
the taxonomy prints none), `is_market_split`, `parent_soc_code`,
`brief` (the 7–9 sentence brief), `evidence` (jsonb: `postings_analyzed`,
`hired_patterns`, `recruiting_mechanics`, `timeline`, `pay_evidence`,
`myths`), `experience_statistics` (Block A — computed statistics, every
figure with its n), `acquisition_methodology` (Block B — how to land
each prerequisite), `unknown_unknowns` (Block C), `method_note`,
`full_text` (the complete source file), `source_files` (jsonb array of
`{file, bytes, sha256, relation}` — relation is `primary`, `alternate`
(the 12 occupations that carry both a numbered and a slice study), or
`shared` (a line served by a family file, e.g. the 17 physician
specialties served by the physician file)).

```sql
-- a role by SOC code
select role_key, title, brief, experience_statistics
from public.career_kb_roles where soc_code = '13-2051' and not is_market_split;

-- the market split under a parent occupation
select role_key, title, brief from public.career_kb_roles
where parent_soc_code = '13-2051' and is_market_split;

-- every role in a sector, biggest first
select soc_code, title, employment_2024_k from public.career_kb_roles
where sector_code = '29' and not is_market_split
order by employment_2024_k desc nulls last;
```

### career_kb_role_skills — one row per MT3 file

Key: `(role_key, source_file)` — `role_key` FKs to career_kb_roles.
Most roles have exactly one MT3 file and therefore one row.
Shared-family roles can carry more: the physician family file's row
sits alongside specialty rows (e.g. anesthesiologists), each under its
own `source_file`. Columns are the file's six
sections: `what_gets_picked`, `exact_skills` (the exact skills at real
proficiency depth — **skill frequencies and their n's live inside this
text verbatim**, exactly as the file prints them; the files are prose
instruments and the loader re-computes nothing), `learn_order`,
`learn_methods` (best way to learn each, including the proof artifact
for each skill), `resume_killers`, `keyword_reality`, plus
`keyword_terms` (jsonb array extracted only where the file enumerates
its terms in §6 — null where it does not; never inferred),
`postings_basis_n` (the posting-set size the file states, where it
states one), `evidence_note` (the file's own evidence/population note),
`pairs_with_file` (the MT1 filename from the file's own "Pairs with"
line), `full_text`, provenance columns.

```sql
-- tailoring input for one role: MT1 evidence + MT3 skills together
select r.title, r.brief, s.exact_skills, s.learn_order, s.resume_killers, s.keyword_terms
from public.career_kb_roles r
join public.career_kb_role_skills s using (role_key)
where r.role_key = 'split:investment-banking-analyst';

-- roles whose skills file states a posting basis of n >= 20
select role_key, postings_basis_n from public.career_kb_role_skills
where postings_basis_n >= 20 order by postings_basis_n desc;
```

Coverage note: until Mega Task 3 completes, some roles have no skills
row. A missing row means "not yet researched", never "no skills" —
callers must say so. Shared-family lines (the physician specialties,
real-estate sales agents) are served by one MT1 family file; an MT3
file that names one of the served lines carries its own row for that
line, and the family-level MT3 file's row anchors to the family's
primary line.

### career_kb_postings — the postings corpus (21,688 rows at first load)

Key: `posting_key` = the corpus dedupe key (`<source>:<url>`). Columns:
`source`, `board`, `company`, `title`, `location`, `url`, `posted_at`
(parsed; `posted_raw` keeps the original string), `fetched_on`,
`cluster` (the corpus's own role cluster label), `text_excerpt`
(capped at 1,500 chars **by the corpus itself** — requirement
statistics computed from these excerpts are floors, and the role files
print them as such), `extra` (jsonb: any further corpus fields, e.g.
SOC-group hints on civil-service rows), `corpus_vintage`.

```sql
-- recent postings in a cluster
select company, title, location, url, posted_at from public.career_kb_postings
where cluster = 'software-engineer' order by posted_at desc nulls last limit 50;

-- postings from one watched board
select count(*) from public.career_kb_postings where board = 'stripe';
```

### career_kb_boards — the Mega Task 2 board directory (109 rows)

Key: `(provider, board_token)`. Columns: `company`, `status`
(`live` = a real fetch returned the board's postings JSON during
discovery — 107 of 109; the 2 Breezy rows are present with their
non-live status, not hidden), `postings_seen`, `last_verified`,
`source`, `directory_generated_at`.

```sql
-- the watchable set for the alert watcher (module 151)
select provider, board_token, company, postings_seen
from public.career_kb_boards where status = 'live';
```

## Refresh procedure

1. Libraries change on disk (new waves, corpus pulls).
2. Re-run `python3 scripts/career/load-knowledge-db.py load --stage <label> --log`.
   Only new/changed rows are written; the run writes a reconciliation
   report to `~/workspace/your_files/knowledge-db/` (rows in DB vs
   files on disk vs INDEX claims, mismatches named).
3. `python3 scripts/career/load-knowledge-db.py verify` re-checks
   counts, RLS, and spot content.
