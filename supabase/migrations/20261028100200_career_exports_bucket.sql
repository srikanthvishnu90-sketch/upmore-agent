-- "Export my data" (2026-10-28): one json file per person at <user_id>/trainee-data-export.json in a private bucket, handed
-- back as a signed link that lives one hour. Written and signed by the edge function with the service role; a signed-in
-- person may read only their own folder. delete-account removes the folder. Idempotent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('career-exports', 'career-exports', false, 20000000, array['application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists career_exports_owner_read on storage.objects;
create policy career_exports_owner_read on storage.objects for select to authenticated
 using (bucket_id = 'career-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
