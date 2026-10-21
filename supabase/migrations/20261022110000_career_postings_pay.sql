-- WO-069: the pay a job board states for a posting in its own structured fields (Greenhouse pay_input_ranges, Lever
-- salaryRange, Ashby compensation), kept as the text ingestion writes from the board's own numbers, currency and period
-- (career_ingest.ts boardPay); null when the board states none. Never an estimate. Idempotent: applies cleanly twice.
alter table public.career_postings add column if not exists pay text check (pay is null or char_length(pay) <= 200);
