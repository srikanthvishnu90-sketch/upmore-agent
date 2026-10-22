-- HELD undo of the operator's own steps, in one transaction: both switches off, every live card enrollment revoked, the
-- named account's live waivers revoked. Rows are kept for the record (revoked_at), never deleted. It does not touch what
-- the person did themselves: their opt-in ("cloud off" in chat turns it off; that also deletes their cloud resume), their
-- career account or their cards. The migrations' own rollbacks are docs/apply/held-card-bridge/90 and 91.
begin;
create temp table undo_target on commit drop as
 select u.id as user_id from auth.users u where lower(btrim(u.email)) = lower(btrim('__OWNER_ACCOUNT_EMAIL__'));   -- target email
do $$
begin
 if '__OWNER_ACCOUNT_EMAIL__' = '__OWNER' || '_ACCOUNT_EMAIL__' then raise exception 'placeholder not replaced: name the account email first'; end if;
 if (select count(*) from undo_target) <> 1 then raise exception 'expected exactly one account with that email'; end if;
end $$;
delete from public.career_cloud_settings where key in ('CAREER_CLOUD_APPLY', 'CAREER_AGENT_SUBMIT');
do $$
begin
 if to_regclass('career_message_approval_private.cloud_card_enrollments') is not null then
  execute 'update career_message_approval_private.cloud_card_enrollments set revoked_at = now() where revoked_at is null';
 end if;
end $$;
update public.career_apply_cloud_gate_waivers set revoked_at = now()
 where user_id = (select user_id from undo_target) and revoked_at is null returning id, portal, revoked_at;
do $$
declare uid uuid := (select user_id from undo_target); ok boolean := false;
begin
 if public.career_apply_cloud_enabled() or public.career_apply_agent_submit_enabled() then raise exception 'verify: a switch still reads on'; end if;
 if to_regclass('career_message_approval_private.cloud_card_enrollments') is not null then
  execute 'select career_message_approval_private.cloud_eligible($1, now())' into ok using uid;
 end if;
 if ok then raise exception 'verify: still enrolled'; end if;
 if public.career_apply_cloud_waiver_left(uid, 'lever', now()) <> 0 then raise exception 'verify: waiver sends left'; end if;
end $$;
commit;
