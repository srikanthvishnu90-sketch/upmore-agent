-- Career knowledge base (Mega Tasks 1 + 3 libraries, Mega Task 2 board directory, postings corpus).
-- Owner order 2026-10-14: "when these tasks are done, implement all of them into the database."
-- ADDITIVE ONLY: four new tables in the career_kb_ namespace. No existing table is altered.
-- Loaded by scripts/career/load-knowledge-db.py (idempotent upserts on natural keys, service role).
-- RLS is enabled on every table with NO anon/authenticated policies: reads happen from the
-- backend (agent-chat) with the service role, which bypasses RLS. See docs/career/knowledge-db.md.
-- Every row carries its source file and vintage so nothing in these tables is unsourced.

create table if not exists public.career_kb_roles (
  role_key text primary key,
  soc_code text,
  slug text not null,
  title text not null,
  sector_code text,
  sector_name text,
  employment_2024_k numeric,
  is_market_split boolean not null default false,
  parent_soc_code text,
  brief text,
  evidence jsonb not null default '{}'::jsonb,
  experience_statistics text,
  acquisition_methodology text,
  unknown_unknowns text,
  method_note text,
  full_text text not null,
  source_files jsonb not null default '[]'::jsonb,
  researched_on text,
  source_vintage text,
  content_hash text not null,
  loaded_at timestamptz not null default now()
);

create index if not exists career_kb_roles_soc_idx on public.career_kb_roles (soc_code);
create index if not exists career_kb_roles_sector_idx on public.career_kb_roles (sector_code);
create index if not exists career_kb_roles_slug_idx on public.career_kb_roles (slug);

comment on table public.career_kb_roles is 'Mega Task 1 hired-research library, one row per taxonomy line (849 base) plus market splits. Source: ~/workspace/your_files/hired-research. Tier 3 research content loaded by Muse harness (tier 2 load).';

create table if not exists public.career_kb_role_skills (
  role_key text not null references public.career_kb_roles (role_key) on delete cascade,
  source_file text not null,
  primary key (role_key, source_file),
  soc_code text,
  slug text not null,
  title text not null,
  what_gets_picked text,
  exact_skills text,
  learn_order text,
  learn_methods text,
  resume_killers text,
  keyword_reality text,
  keyword_terms jsonb,
  postings_basis_n integer,
  evidence_note text,
  pairs_with_file text,
  full_text text not null,
  source_bytes integer,
  source_vintage text,
  content_hash text not null,
  loaded_at timestamptz not null default now()
);

create index if not exists career_kb_role_skills_soc_idx on public.career_kb_role_skills (soc_code);

comment on table public.career_kb_role_skills is 'Mega Task 3 resume+skills library, one row per MT3 FILE (primary key role_key + source_file): most roles have exactly one file, but shared-family roles can carry the family-level file as an additional row (e.g. the physician family file alongside a specialty file). Sections 1-6 of each file as columns. Skill frequencies and n values live inside exact_skills verbatim as the files print them (the files are prose instruments; nothing is re-computed at load). Source: ~/workspace/your_files/resume-skills.';

create table if not exists public.career_kb_postings (
  posting_key text primary key,
  source text,
  board text,
  company text,
  title text,
  location text,
  url text,
  posted_at timestamptz,
  posted_raw text,
  fetched_on date,
  cluster text,
  text_excerpt text,
  extra jsonb not null default '{}'::jsonb,
  corpus_vintage text,
  content_hash text not null,
  loaded_at timestamptz not null default now()
);

create index if not exists career_kb_postings_board_idx on public.career_kb_postings (board);
create index if not exists career_kb_postings_cluster_idx on public.career_kb_postings (cluster);
create index if not exists career_kb_postings_company_idx on public.career_kb_postings (company);

comment on table public.career_kb_postings is 'The hired-research postings corpus (corpus/postings.jsonl), one row per posting, key = the corpus dedupe key (source + url). Text excerpts are capped at 1500 chars by the corpus itself.';

create table if not exists public.career_kb_boards (
  provider text not null,
  board_token text not null,
  company text,
  status text,
  postings_seen integer,
  last_verified date,
  source text,
  directory_generated_at text,
  content_hash text not null,
  loaded_at timestamptz not null default now(),
  primary key (provider, board_token)
);

create index if not exists career_kb_boards_status_idx on public.career_kb_boards (status);

comment on table public.career_kb_boards is 'Mega Task 2 board directory v2 (packages/career-data/board-directory.json). status live means a real fetch returned the board postings JSON during discovery (107 live of 109 rows).';

alter table public.career_kb_roles enable row level security;
alter table public.career_kb_role_skills enable row level security;
alter table public.career_kb_postings enable row level security;
alter table public.career_kb_boards enable row level security;
