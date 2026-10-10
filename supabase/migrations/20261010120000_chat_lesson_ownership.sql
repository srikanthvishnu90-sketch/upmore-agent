-- A service-role chat has no auth.uid(). It must never write a private
-- correction with user_id NULL, which means a globally visible lesson.
create or replace function public.record_agent_lesson_as(
 p_user uuid, p_kind text, p_scope text, p_category text, p_title text,
 p_what_happened text, p_what_to_do_instead text, p_signal text default ''
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if p_user is null then raise exception 'verified lesson owner required'; end if;
 perform id from public.profiles where id=p_user for update;
 if not found then raise exception 'verified lesson owner required'; end if;
 if p_kind not in ('chat_caught','user_correction') or p_kind is null
    or nullif(trim(p_scope),'') is null or nullif(trim(p_category),'') is null
    or nullif(trim(p_title),'') is null or nullif(trim(p_what_to_do_instead),'') is null
    or p_what_happened is null then raise exception 'invalid chat lesson'; end if;
 if p_kind <> 'user_correction' then
   select id into v_id from public.agent_lessons
     where user_id=p_user and not resolved and scope=p_scope and category=p_category
     order by created_at,id limit 1;
   if found then
     update public.agent_lessons set times_seen=times_seen+1,
       what_happened=left(p_what_happened,500),signal=left(coalesce(p_signal,''),200),updated_at=now()
       where id=v_id and user_id=p_user;
     return v_id;
   end if;
 end if;
 insert into public.agent_lessons(user_id,kind,scope,category,title,what_happened,what_to_do_instead,signal)
 values(p_user,p_kind,left(p_scope,200),left(p_category,100),left(p_title,200),
        left(p_what_happened,500),left(p_what_to_do_instead,500),left(coalesce(p_signal,''),200))
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.record_agent_lesson_as(uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_agent_lesson_as(uuid,text,text,text,text,text,text,text) to service_role;

create or replace function public.record_agent_lesson(
 p_kind text,p_scope text,p_category text,p_title text,p_what_happened text,p_what_to_do_instead text,p_signal text default ''
) returns uuid language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'authenticated lesson owner required'; end if;
 return public.record_agent_lesson_as(auth.uid(),p_kind,p_scope,p_category,p_title,p_what_happened,p_what_to_do_instead,p_signal);
end $$;
revoke all on function public.record_agent_lesson(text,text,text,text,text,text,text) from public,anon,service_role;
grant execute on function public.record_agent_lesson(text,text,text,text,text,text,text) to authenticated;

create or replace function public.agent_lessons_note_applied_as(p_user uuid,p_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_user is null or not exists(select 1 from public.profiles where id=p_user)
 then raise exception 'verified lesson owner required'; end if;
 update public.agent_lessons set times_applied=times_applied+1,updated_at=now()
 where id=any(p_ids) and not resolved and (user_id=p_user or user_id is null);
end $$;
revoke all on function public.agent_lessons_note_applied_as(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.agent_lessons_note_applied_as(uuid,uuid[]) to service_role;
