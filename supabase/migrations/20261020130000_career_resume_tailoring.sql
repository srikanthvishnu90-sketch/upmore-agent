-- WO-028: tailored resumes, stored privately, and every application tagged tailored or untailored.
--
-- 1. The bucket. career-resumes is private (never public): a person's tailored PDFs live at <user_id>/<sha256>.pdf. The
--    edge function writes them with the service role and hands out links signed for 7 days; a signed-in person may read
--    only their own folder, and nobody else may write, change or delete there.
-- 2. The tag. career_apply_jobs gains resume_sha256, tailored and resume_persona, set by a trigger from the approved
--    payload on every insert: tailored is true only when the payload says so AND that exact file is one Trainee stored
--    for this person; resume_persona is kept only for a tailored resume. Nothing existing is dropped or renamed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('career-resumes', 'career-resumes', false, 2500000, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists career_resumes_owner_read on storage.objects;
create policy career_resumes_owner_read on storage.objects for select to authenticated
 using (bucket_id = 'career-resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter table public.career_apply_jobs add column if not exists resume_sha256 text check (resume_sha256 is null or resume_sha256 ~ '^[a-f0-9]{64}$');
alter table public.career_apply_jobs add column if not exists tailored boolean not null default false;
alter table public.career_apply_jobs add column if not exists resume_persona text check (resume_persona is null or length(resume_persona) between 1 and 24);

create or replace function public.career_apply_resume_tag() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 new.resume_sha256 := case when coalesce(new.payload->>'resume_sha256', '') ~ '^[a-f0-9]{64}$' then new.payload->>'resume_sha256' end;
 new.tailored := new.resume_sha256 is not null and (new.payload->'resume_tailored') is not distinct from 'true'::jsonb
  and exists (select from storage.objects o where o.bucket_id = 'career-resumes' and o.name = new.user_id::text || '/' || new.resume_sha256 || '.pdf');
 new.resume_persona := case when new.tailored and length(new.payload->>'resume_persona') between 1 and 24 then new.payload->>'resume_persona' end;
 return new;
end $$;
revoke all on function public.career_apply_resume_tag() from public, anon, authenticated;

drop trigger if exists career_apply_resume_tag on public.career_apply_jobs;
create trigger career_apply_resume_tag before insert or update of payload on public.career_apply_jobs
 for each row execute function public.career_apply_resume_tag();
