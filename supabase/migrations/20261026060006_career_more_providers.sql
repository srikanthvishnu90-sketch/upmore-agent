-- WO-044: ingest reads seven more public job feeds (Workable, Recruitee, BambooHR, Teamtailor, Breezy, Personio, Workday;
-- supabase/functions/_shared/career_ingest_feeds.ts), so the postings table and the board read state take those
-- providers too. Only the provider lists widen; every other check stays. A Workday board is "<tenant>.<wdN>/<site>" (no
-- colon, under 200 characters), so the job id keeps its provider:board:<id> shape. Idempotent (drop if exists, add).
alter table public.career_postings drop constraint if exists career_postings_job_id_check;
alter table public.career_postings add constraint career_postings_job_id_check
  check (job_id ~ '^(greenhouse|lever|ashby|smartrecruiters|workable|recruitee|bamboohr|teamtailor|breezy|personio|workday):[^:]+:.+$');
alter table public.career_postings drop constraint if exists career_postings_provider_check;
alter table public.career_postings add constraint career_postings_provider_check
  check (provider in ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee', 'bamboohr', 'teamtailor', 'breezy', 'personio', 'workday'));
alter table public.career_board_state drop constraint if exists career_board_state_provider_check;
alter table public.career_board_state add constraint career_board_state_provider_check
  check (provider in ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee', 'bamboohr', 'teamtailor', 'breezy', 'personio', 'workday'));
