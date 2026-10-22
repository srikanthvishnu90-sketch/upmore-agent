import json,subprocess,hashlib
from pathlib import Path
OUT=Path(__file__).parent
U='11111111-66cc-4abe-a507-111111111175'
T='22222222-66cc-4abe-a507-222222221175'
SHA='a'*64
def lit(s):return "'"+str(s).replace("'","''")+"'"
def jlit(x):return lit(json.dumps(x,ensure_ascii=False))+"::jsonb"
def entry(kind):
 job='lever:synthetic:qa-message-'+kind
 return {'version':1,'kind':'agent-batch','jobId':job,'company':'Synthetic QA '+kind,'url':'https://jobs.lever.co/synthetic/'+kind+'/apply','answers':[{'name':'name','label':'Full name','value':'TEST Person','shown':'TEST Person','kind':'text','factId':'TEST-NAME','file':None},{'name':'resume','label':'Resume/CV','value':'synthetic.pdf','shown':'synthetic.pdf','kind':'file','factId':'approved-local-resume:'+SHA,'file':SHA}],'blank':[],'ledger':[{'application_id':job,'field_id':'name','question_hash':'1'*64,'answer_hash':'2'*64,'fact_refs':['TEST-NAME'],'source_refs':['own synthetic statement'],'confirmation_event_id':'synthetic:confirmed:name','derivation_rule':'verbatim'},{'application_id':job,'field_id':'resume','question_hash':'3'*64,'answer_hash':'4'*64,'fact_refs':['approved-local-resume:'+SHA],'source_refs':['owner picked this synthetic fixture file'],'confirmation_event_id':'resume:'+SHA,'derivation_rule':'attachment'}],'question_set_hash':'5'*64,'manifest_hash':'6'*64,'quarantine_version':'d007-v1'}
sql=["begin;reset role;select set_config('qa.payload_expires',(clock_timestamp()+interval '2 hours')::text,true);",f"insert into auth.users(id,email) values({lit(U)},'qa-message-consumer@example.test');insert into profiles(id) values({lit(U)});insert into agent_threads(id,user_id,title) values({lit(T)},{lit(U)},'Synthetic QA consumer');",f"insert into career_message_approval_private.test_users(user_id) values({lit(U)});",f"insert into career_watch_kv(user_id,key,value) values({lit(U)},'career:account','{{\"epoch\":2,\"version\":3,\"paused\":false,\"daily_limit\":\"5\"}}');", "insert into career_cloud_settings(key,value) values('CAREER_AGENT_SUBMIT','on') on conflict(key) do update set value=excluded.value;", "create temp table qa_cards(kind text,entry jsonb,card jsonb,receipt jsonb,payload jsonb,result jsonb,after_attempt jsonb,rescue jsonb);grant all on qa_cards to authenticated,service_role;", "create function pg_temp.qa_hash(x jsonb) returns text language sql security definer set search_path=public,pg_temp as $$select encode(sha256(convert_to(public.career_apply_canonical(x),'UTF8')),'hex')$$;"]
for kind in ['answer','resume','url','company','positive']:
 e=entry(kind)
 p={'version':1,'source':'extension','user_id':U,'manifest_hash':'6'*64,'quarantine_version':'d007-v1','job_id':e['jobId'],'company':e['company'],'url':e['url'],'family':'lever','fields':[{'name':a['name'],'label':a['label'],'value':a['value'],'source':'trainee','factId':a['factId'],'detail':''} for a in e['answers']],'resume_name':'synthetic.pdf','resume_sha256':SHA,'privacy_epoch':2,'account_version':3}
 p['fields'][1]['detail']=SHA+':12345:application/pdf'
 original=json.loads(json.dumps(p))
 if kind=='answer':p['fields'][0]['value']='CHANGED AFTER REVIEW'
 if kind=='resume':p['resume_sha256']='b'*64
 if kind=='url':p['url']='https://jobs.lever.co/synthetic/different-after-review/apply'
 if kind=='company':p['company']='Different company after review'
 sql += ["reset role;set role service_role;",f"insert into qa_cards(kind,entry,card,payload) select {lit(kind)},{jlit(e)},career_apply_message_card_show_as({lit(U)},{lit(T)},jsonb_build_array(jsonb_build_object('entry',{jlit(e)},'hash',pg_temp.qa_hash({jlit(e)})))),{jlit(p)}||jsonb_build_object('expires_at',current_setting('qa.payload_expires'));", "reset role;",f"select t.as_user({lit(U)});set role authenticated;",f"update qa_cards set receipt=career_apply_message_card_approve_own((card->>'id')::uuid,card->>'hash') where kind={lit(kind)};",f"do $qa$ begin update qa_cards set result=career_apply_extension_begin_agent_own(payload,pg_temp.qa_hash(payload),pg_temp.qa_hash(entry)) where kind={lit(kind)}; exception when others then update qa_cards set result=jsonb_build_object('refused',true,'reason',SQLERRM) where kind={lit(kind)}; end $qa$;",
  'reset role;',f"update qa_cards q set after_attempt=jsonb_build_object('jobs',(select count(*) from career_apply_jobs j where j.user_id='{U}'::uuid and j.job_id=q.entry->>'jobId'),'approval_unused',(select bool_and(a.used_at is null) from career_apply_batch_approvals a where a.user_id='{U}'::uuid and a.job_id=q.entry->>'jobId' and a.revoked_at is null)) where kind={lit(kind)};",
  f"select t.as_user({lit(U)});set role authenticated;",f"do $qa$ begin if exists(select 1 from qa_cards where kind={lit(kind)} and result->>'refused'='true') then update qa_cards set rescue=career_apply_extension_begin_agent_own({jlit(original)}||jsonb_build_object('expires_at',current_setting('qa.payload_expires')),pg_temp.qa_hash({jlit(original)}||jsonb_build_object('expires_at',current_setting('qa.payload_expires'))),pg_temp.qa_hash(entry)) where kind={lit(kind)}; end if; exception when others then update qa_cards set rescue=jsonb_build_object('refused',true,'reason',SQLERRM) where kind={lit(kind)}; end $qa$;"]
sql += ["reset role;", "select jsonb_build_object('checks',(select jsonb_agg(jsonb_build_object('case',kind,'consumer_accepted',(result->>'id') is not null,'after_attempt',after_attempt,'rescue_accepted',(rescue->>'id') is not null,'recorded_job',(select count(*)=1 from career_apply_jobs j where j.id=(q.result->>'id')::uuid and j.user_id='"+U+"'::uuid))) from qa_cards q),'total_jobs',(select count(*) from career_apply_jobs where user_id='"+U+"'::uuid),'consumer_function_sha256',encode(sha256(convert_to(pg_get_functiondef('public.career_apply_extension_begin_agent_own(jsonb,text,text)'::regprocedure),'UTF8')),'hex'));", "rollback;"]
body='\n'.join(sql)+'\n'
(OUT/'consumer-mutations-gate.sql').write_text(body)
cmd=['docker','exec','-i','approval-card-nonce-db-20261021','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','/tmp/upmore-db-test.YHN4IQ','-p54329','-Upostgres','-dpostgres']
r=subprocess.run(cmd,input=body,text=True,capture_output=True,timeout=60)
if r.returncode:
 (OUT/'consumer-mutations-gate-error.log').write_text(r.stderr)
 raise RuntimeError('local synthetic SQL proof failed; see consumer-mutations-gate-error.log')
result=json.loads([x for x in r.stdout.splitlines() if x.startswith('{')][-1])
result.update({'scope':'actual full-migration local synthetic PostgreSQL; new nonce38121fdf; canonical consumer unchanged; positive filedetail corrected to actual readDetail SHA:size:MIME format','transaction':'ROLLED_BACK','provider_calls':0,'real_profile_access':False,'sql_sha256':hashlib.sha256(body.encode()).hexdigest()})
(OUT/'consumer-mutations-gate-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
