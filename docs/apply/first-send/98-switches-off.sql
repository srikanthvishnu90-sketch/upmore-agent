-- The kill switch: both switches off at once (no row reads as off). Safe at any moment: nothing new is claimed, and the
-- worker re-checks the card's authorization before the engine and again before the one effect, so a drive in progress
-- stops at its next check. No placeholder. Whether anyone may run it without asking is the owner's call (ask 9).
begin;
delete from public.career_cloud_settings where key in ('CAREER_CLOUD_APPLY', 'CAREER_AGENT_SUBMIT') returning key, value;
do $$
begin
 if public.career_apply_cloud_enabled() or public.career_apply_agent_submit_enabled() then raise exception 'verify: a switch still reads on'; end if;
end $$;
commit;
