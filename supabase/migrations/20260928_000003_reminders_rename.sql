-- 20260928_000003_reminders_rename.sql
-- Documents the production rename of the legacy route-reminders table.
--
-- HISTORY: public.reminders originally stored route deadline reminders for
-- agent-chat (columns: id, user_id, route_id, kind, message, due_at, sent_at,
-- channel, created_at). On 2026-09-28 it was renamed to route_reminders so a
-- new Chat/Tasks-style public.reminders table could be created (see
-- 20260928_000001_chat_reminders.sql), and agent-chat was redeployed against
-- route_reminders.
--
-- This migration is idempotent: it only renames when the old name exists and
-- the new name does not, so it is safe on environments where the rename (and
-- the new table) are already in place.

do $$
begin
  if to_regclass('public.reminders') is not null
     and to_regclass('public.route_reminders') is null then
    alter table public.reminders rename to route_reminders;
  end if;
end $$;
