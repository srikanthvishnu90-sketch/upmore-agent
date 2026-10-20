-- Trainee landing page capture (owner-ordered 2026-10-19).
-- Written by the public edge functions site-signup / site-careers, which use
-- the service role. RLS is enabled on both tables with NO public policies:
-- anon/authenticated roles can do nothing; only the service role (which
-- bypasses RLS) writes, and reads happen through operator tooling.

create table if not exists public.site_waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  consent boolean not null default false,
  consent_text text,
  consent_at timestamptz,
  source text,
  created_at timestamptz not null default now()
);

alter table public.site_waitlist enable row level security;

create table if not exists public.site_careers_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  resume_path text not null,
  created_at timestamptz not null default now()
);

alter table public.site_careers_applications enable row level security;

-- Private bucket for uploaded resumes (public = false).
insert into storage.buckets (id, name, public)
values ('careers-resumes', 'careers-resumes', false)
on conflict (id) do nothing;
