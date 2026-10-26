-- FEATURE 14 (D-024; BACKEND-GAP-MAP G6): every finished application has a receipt the person can see.
--
-- What G6 left open: the pictures stayed on the device or VM (only their hashes reached the row), and no receipt showed
-- them. This keeps, per application:
--   career_apply_receipts       one row, written by the database itself when the queue's row leaves 'driving' (whichever
--                               finish ran it: career_apply_finish_own from the person's computer or the extension, the
--                               cloud worker's finish): what was approved field by field with each answer's source fact,
--                               where (company, URL, the final URL), when (approved, clicked, finished), the payload hash
--                               and the approval hash, the resume file's hash, the employer's confirmation id and page
--                               text, the proof's hashes, and how long its pictures are kept.
--   career_apply_receipt_files  the two pictures of the proof (before the click, the page after it), as bytes, sent by the
--                               worker while it still holds the lease (career_apply_receipt_attach_own). Each is checked
--                               against its own sha256 and must be a PNG. When the row finishes, a picture is kept only
--                               if its hash is the one the bound proof names; any other is removed. Without a bound
--                               proof, no picture is kept.
-- Neither table is readable by a person's session or anon: the service role reads it for the person's own chat turn,
-- scoped to that person (agent-chat, career_apply_receipt_read.ts), the same posture as channel_artifacts.
-- Retention: the pictures are kept for career_apply_receipt_keep_days() days after the finish (PROPOSED 90, the owner sets
-- it; G6). career_apply_receipt_files_expire() removes the expired ones; nothing schedules it (the owner's call).
-- Idempotent: safe to apply twice.

create table if not exists public.career_apply_receipts (
  application_id uuid primary key references public.career_apply_jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company text not null,
  url text not null,
  final_url text,
  state text not null,
  reached_employer text not null check (reached_employer in ('yes', 'unknown', 'no')),
  reason text,
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  resume_sha256 text check (resume_sha256 is null or resume_sha256 ~ '^[a-f0-9]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  approval_hash text not null,
  engine_approval text,
  approved_at timestamptz not null,
  clicked_at timestamptz,
  finished_at timestamptz not null,
  confirmation_id text,
  confirmation_text text check (confirmation_text is null or length(confirmation_text) <= 1000),
  proof jsonb not null default '{}'::jsonb,
  pictures_keep_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists career_apply_receipts_user_idx on public.career_apply_receipts (user_id, finished_at desc);

create table if not exists public.career_apply_receipt_files (
  application_id uuid not null references public.career_apply_jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('before-click', 'after-submit')),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  mime text not null default 'image/png' check (mime = 'image/png'),
  bytes_b64 text not null check (length(bytes_b64) <= 8388608),
  bound boolean not null default false,
  keep_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (application_id, kind)
);
create index if not exists career_apply_receipt_files_keep_idx on public.career_apply_receipt_files (keep_until) where bound;

alter table public.career_apply_receipts enable row level security;
alter table public.career_apply_receipt_files enable row level security;
revoke all on public.career_apply_receipts, public.career_apply_receipt_files from public, anon, authenticated;
grant all on public.career_apply_receipts, public.career_apply_receipt_files to service_role;

-- The owner's retention period for the pictures, in one place (PROPOSED 90 days; scripts/career/evidence-retention.ts).
create or replace function public.career_apply_receipt_keep_days() returns integer
language sql immutable set search_path = public, pg_temp as $$ select 90 $$;

-- A picture of this drive, sent while the drive holds its lease. The bytes must be the PNG the hash names. Sent again for
-- the same kind during the same drive, the newer one replaces it; once the row has finished, nothing is attached.
create or replace function public.career_apply_receipt_attach(p_id uuid, p_lease uuid, p_kind text, p_sha256 text, p_bytes_b64 text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare j public.career_apply_jobs; b bytea;
begin
  select * into j from public.career_apply_jobs where id = p_id and lease_token = p_lease;
  if not found then raise exception 'invalid apply claim'; end if;
  if j.state <> 'driving' then raise exception 'receipt picture refused: the application is not being driven'; end if;
  if p_kind is null or p_kind not in ('before-click', 'after-submit') then raise exception 'receipt picture refused: unknown kind'; end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'receipt picture refused: bad hash'; end if;
  if p_bytes_b64 is null or length(p_bytes_b64) > 8388608 then raise exception 'receipt picture refused: too large'; end if;
  begin
    b := decode(p_bytes_b64, 'base64');
  exception when others then raise exception 'receipt picture refused: not base64';
  end;
  if substring(b from 1 for 8) <> '\x89504e470d0a1a0a'::bytea then raise exception 'receipt picture refused: not a PNG'; end if;
  if encode(sha256(b), 'hex') <> p_sha256 then raise exception 'receipt picture refused: the bytes are not the picture the hash names'; end if;
  insert into public.career_apply_receipt_files (application_id, user_id, kind, sha256, bytes_b64)
    values (j.id, j.user_id, p_kind, p_sha256, p_bytes_b64)
    on conflict (application_id, kind) do update set sha256 = excluded.sha256, bytes_b64 = excluded.bytes_b64, bound = false,
      keep_until = null, created_at = now();
  return jsonb_build_object('application_id', j.id, 'kind', p_kind, 'sha256', p_sha256);
end $$;

-- The person's own computer (career_apply_claim_own's lease), signed in as them: only their own drive.
create or replace function public.career_apply_receipt_attach_own(p_id uuid, p_lease uuid, p_kind text, p_sha256 text, p_bytes_b64 text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not signed in'; end if;
  if not exists (select from public.career_apply_jobs where id = p_id and user_id = u and lease_token = p_lease) then
    raise exception 'invalid apply claim'; end if;
  return public.career_apply_receipt_attach(p_id, p_lease, p_kind, p_sha256, p_bytes_b64);
end $$;

revoke all on function public.career_apply_receipt_attach(uuid, uuid, text, text, text),
  public.career_apply_receipt_attach_own(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.career_apply_receipt_attach(uuid, uuid, text, text, text) to service_role;
grant execute on function public.career_apply_receipt_attach_own(uuid, uuid, text, text, text) to authenticated;

-- ms since the epoch (the engine's clock) -> timestamptz; anything else is null.
create or replace function public.career_apply_receipt_ms(p jsonb) returns timestamptz
language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(p) = 'number' then to_timestamp((p::text)::numeric / 1000.0) end
$$;

-- The receipt, from the row as it finished. A later state change (the employer's email confirming it) updates the state
-- and the confirmation; what was sent, the times and the pictures stay as they were.
create or replace function public.career_apply_receipt_write() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ev jsonb := coalesce(new.evidence, '{}'::jsonb);
  pr jsonb := case when jsonb_typeof(ev->'proof') = 'object' then ev->'proof' else null end;
  is_bound boolean;
  fin timestamptz := now();
  keep_at timestamptz := now() + make_interval(days => public.career_apply_receipt_keep_days());
  ans jsonb;
begin
  if new.state not in ('confirmed', 'submitted_unconfirmed', 'needs_user', 'failed', 'not_submitted', 'unknown_outcome') then return new; end if;
  if exists (select from public.career_apply_receipts where application_id = new.id) then
    update public.career_apply_receipts set state = new.state, confirmation_id = coalesce(new.confirmation_id, confirmation_id), updated_at = now()
      where application_id = new.id;
    return new;
  end if;
  -- The proof counts only when it names this application and this approval (runApproved keeps no other).
  is_bound := pr is not null and pr->>'application_id' = new.id::text and pr->>'approval_hash' = new.payload->>'engine_approval';
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'name', f->>'name', 'label', coalesce(f->>'label', f->>'name'), 'answer', f->'value', 'fact_id', f->>'factId',
      'provenance', f->>'provenance', 'source', case when jsonb_typeof(f->'source') = 'object'
        then jsonb_strip_nulls(jsonb_build_object('table', f->'source'->>'table', 'key', f->'source'->>'key')) end)) order by ord), '[]'::jsonb)
    into ans
    from jsonb_array_elements(case when jsonb_typeof(new.payload->'fields') = 'array' then new.payload->'fields' else '[]'::jsonb end) with ordinality x(f, ord)
    where (f->>'value') is distinct from (new.payload->>'resume_sha256');
  insert into public.career_apply_receipts (application_id, user_id, company, url, final_url, state, reached_employer, reason, answers,
      resume_sha256, payload_hash, approval_hash, engine_approval, approved_at, clicked_at, finished_at, confirmation_id,
      confirmation_text, proof, pictures_keep_until)
    values (new.id, new.user_id, new.company, new.url, case when is_bound then left(pr->>'final_url', 2000) end, new.state,
      case when new.state in ('confirmed', 'submitted_unconfirmed') then 'yes' when new.state = 'unknown_outcome' then 'unknown' else 'no' end,
      new.reason, ans,
      coalesce(new.resume_sha256, case when new.payload->>'resume_sha256' ~ '^[a-f0-9]{64}$' then new.payload->>'resume_sha256' end),
      new.payload_hash, new.approval_hash, new.payload->>'engine_approval', new.created_at,
      case when is_bound then public.career_apply_receipt_ms(pr->'click'->'at') end, fin, new.confirmation_id,
      nullif(left(regexp_replace(coalesce(ev->>'confirmation_text', ''), '\s+', ' ', 'g'), 1000), ''),
      case when is_bound then jsonb_strip_nulls(jsonb_build_object(
          'run_id', pr->>'run_id',
          'before_click', case when jsonb_typeof(pr->'before_click') = 'object' then jsonb_build_object('sha256', pr->'before_click'->>'sha256', 'seq', pr->'before_click'->'seq', 'at', pr->'before_click'->'at') end,
          'click', pr->'click',
          'after_submit', case when jsonb_typeof(pr->'after_submit') = 'object' then jsonb_build_object('sha256', pr->'after_submit'->>'sha256', 'seq', pr->'after_submit'->'seq', 'at', pr->'after_submit'->'at') end,
          'after_submit_error', pr->>'after_submit_error'))
        when ev ? 'proof_refused' then jsonb_build_object('refused', ev->>'proof_refused')
        else '{}'::jsonb end,
      keep_at)
    on conflict (application_id) do nothing;
  -- The pictures: kept only when they are the bound proof's own, by hash; any other is removed.
  if is_bound then
    update public.career_apply_receipt_files f set bound = true, keep_until = keep_at
      where application_id = new.id
        and ((kind = 'before-click' and sha256 = pr->'before_click'->>'sha256') or (kind = 'after-submit' and sha256 = pr->'after_submit'->>'sha256'));
  end if;
  delete from public.career_apply_receipt_files f where f.application_id = new.id and not f.bound;
  return new;
exception when others then
  -- The outcome is the record that matters: a receipt that cannot be written never stops the finish from recording it.
  -- The reader then says no receipt is on record, never a guess.
  raise warning 'career_apply_receipt_write: % (%)', sqlerrm, new.id;
  return new;
end $$;
revoke all on function public.career_apply_receipt_write() from public, anon, authenticated;

drop trigger if exists career_apply_receipt_on_finish on public.career_apply_jobs;
create trigger career_apply_receipt_on_finish after update of state on public.career_apply_jobs
  for each row when (old.state is distinct from new.state) execute function public.career_apply_receipt_write();
-- An application recorded already finished (a hand submission, career_apply_record_own) gets its receipt too.
drop trigger if exists career_apply_receipt_on_record on public.career_apply_jobs;
create trigger career_apply_receipt_on_record after insert on public.career_apply_jobs
  for each row when (new.state not in ('queued', 'driving')) execute function public.career_apply_receipt_write();

-- Removes the pictures past their period. Not scheduled: deleting is the owner's call (G6).
create or replace function public.career_apply_receipt_files_expire(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from public.career_apply_receipt_files where bound and keep_until < p_now;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.career_apply_receipt_files_expire(timestamptz) from public, anon, authenticated;
grant execute on function public.career_apply_receipt_files_expire(timestamptz) to service_role;
