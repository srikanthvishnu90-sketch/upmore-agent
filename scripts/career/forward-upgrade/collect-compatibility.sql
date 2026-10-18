-- Optional follow-up metadata probe. OWNER READ ONLY; no row/body/secret output.
-- Review before use. This does not approve a catalog or enable an upgrade.
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog,public;
SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object(
 'version','career_forward_compatibility_probe/v1',
 'readOnly',current_setting('transaction_read_only')='on',
 'dependencies',(SELECT jsonb_agg(jsonb_build_object(
  'name',v.name,'exists',c.oid IS NOT NULL,'owner',pg_get_userbyid(c.relowner),
  'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
  'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
   'hasDefault',d.oid IS NOT NULL,
   'defaultSha',encode(sha256(convert_to(coalesce(pg_get_expr(d.adbin,d.adrelid),''),'UTF8')),'hex')
  )ORDER BY a.attnum),'[]')FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'kind',k.contype,'validated',k.convalidated,
   'definitionSha',encode(sha256(convert_to(pg_get_constraintdef(k.oid),'UTF8')),'hex'))ORDER BY k.conname),'[]')FROM pg_constraint k WHERE k.conrelid=c.oid),
  'acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)END,
   'privilege',a.privilege_type,'grantable',a.is_grantable)ORDER BY a.grantee,a.privilege_type),'[]')
   FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a)
 )ORDER BY v.name)FROM unnest(ARRAY['auth.users','public.profiles','public.agent_threads','public.agent_flow_state','public.agent_messages','public.agent_usage'])v(name)
 LEFT JOIN pg_class c ON c.oid=to_regclass(v.name)),
 'accountTriggers',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'name',t.tgname,'enabled',t.tgenabled,
  'triggerDefinitionSha',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex'),
  'functionSchema',n.nspname,'functionName',p.proname,
  'functionArguments',pg_get_function_identity_arguments(p.oid),'returns',pg_get_function_result(p.oid),
  'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,
  'language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
  'acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)END,'privilege',a.privilege_type,'grantable',a.is_grantable)ORDER BY a.grantee,a.privilege_type),'[]')FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a),
  'definitionSha',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
  'bodySha',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
  'configSha',encode(sha256(convert_to(coalesce(p.proconfig::text,''),'UTF8')),'hex')
 )ORDER BY t.tgname),'[]')FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE t.tgrelid=to_regclass('public.career_watch_kv')AND NOT t.tgisinternal)
);
COMMIT;
