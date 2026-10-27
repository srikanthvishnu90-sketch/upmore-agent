-- Resume → cloud attach (FEATURE 17 follow-up, the #202 gap): career_apply_cloud_resume_put_for is the keep the
-- confirm seam calls through _shared/career_apply_cloud_resume.ts. These cases pin the database half of that
-- wire: before any keep, nothing is kept (the gap state the hosted path used to sit in silently); a keep stores
-- the file by its own hash and reads back byte for byte; an account that does not exist refuses the keep; an
-- epoch move (erase / privacy reset) drops the kept read even though the row remains.
begin;
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-00000000f181','attach-a@example.test'),
 ('00000000-0000-4000-8000-00000000f182','attach-b@example.test');
insert into profiles(id) select id from auth.users where id::text like '00000000-0000-4000-8000-00000000f18%';
insert into career_watch_kv(user_id,key,value) select id,'career:account','{"epoch":1,"version":1,"paused":false}'::jsonb from profiles
 where id::text like '00000000-0000-4000-8000-00000000f18%';

-- The gap state: a confirmed resume exists as facts, but nothing is kept for the cloud.
select t.ok(career_apply_cloud_resume_kept_for('00000000-0000-4000-8000-00000000f181') is null,
 'before the attach, no resume is kept for the cloud');
select t.ok((select count(*) from career_apply_cloud_resumes where user_id='00000000-0000-4000-8000-00000000f181')=0,
 'and no cloud-resume row exists');

-- The keep, exactly as the module calls it: the file's own bytes, base64, by name.
select t.ok(career_apply_cloud_resume_put_for('00000000-0000-4000-8000-00000000f181','resume.pdf',
   encode(convert_to('%PDF-1.4 TEST attach resume','UTF8'),'base64'))
 = encode(sha256(convert_to('%PDF-1.4 TEST attach resume','UTF8')),'hex'),
 'the keep returns the file''s own sha256');
select t.ok((career_apply_cloud_resume_kept_for('00000000-0000-4000-8000-00000000f181')->>'filename')='resume.pdf',
 'the kept resume reads back by name');
select t.ok((career_apply_cloud_resume_kept_for('00000000-0000-4000-8000-00000000f181')->>'b64')
 = encode(convert_to('%PDF-1.4 TEST attach resume','UTF8'),'base64'),
 'and byte for byte');
select t.ok(career_apply_cloud_resume_kept_for('00000000-0000-4000-8000-00000000f182') is null,
 'another person''s keep is not this person''s');

-- No account, no keep: the put refuses rather than parking a file on a stranger.
do $$
begin
  begin
    perform career_apply_cloud_resume_put_for('00000000-0000-4000-8000-00000000f199','resume.pdf',
      encode(convert_to('%PDF-1.4 TEST attach resume','UTF8'),'base64'));
    raise exception 'FAIL a keep for a user with no account was accepted';
  exception when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    raise notice 'ok   a keep for a user with no account raises (%)', sqlerrm;
  end;
end $$;

-- An epoch move drops the kept read: what was kept under the old epoch is no longer the account's resume.
update career_watch_kv set value = jsonb_set(value,'{epoch}','2') where user_id='00000000-0000-4000-8000-00000000f181' and key='career:account';
select t.ok(career_apply_cloud_resume_kept_for('00000000-0000-4000-8000-00000000f181') is null,
 'after the epoch moves, the old keep no longer reads as kept');
rollback;
