-- LOCAL TEST ONLY. Minimal legacy monthly schema used BEFORE applying the
-- unchanged 20261010110000_model_call_budget.sql in a disposable database.
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create table public.agent_usage (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null references agent_threads(id) on delete cascade,
 model text not null, input_tokens integer not null default 0,
 output_tokens integer not null default 0,cache_read_tokens integer not null default 0,
 cache_write_tokens integer not null default 0,created_at timestamptz not null default now()
);
