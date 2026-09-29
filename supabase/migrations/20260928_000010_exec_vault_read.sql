-- 2026-09-28: secure vault read for the execution agent.
-- Applied manually to production during the Devin graduation run; codified here.
-- SECURITY DEFINER: reads vault.decrypted_secrets server-side only.
-- Name is restricted to the exec_cred_* pattern so callers can only read
-- execution-agent credentials, never arbitrary vault entries.
CREATE OR REPLACE FUNCTION public.exec_vault_read(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'vault', 'public'
AS $function$
begin
  if p_name is null or p_name not like 'exec\_cred\_%' then
    raise exception 'invalid vault name';
  end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1);
end;
$function$;

-- Lock it down: only service_role (used by edge functions) may call it.
REVOKE ALL ON FUNCTION public.exec_vault_read(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_vault_read(text) TO service_role;
