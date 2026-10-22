// Offline SQL-boundary fixture generation, not an engine/browser or database execution.
// Every P passes actual engineInput -> trustedManifest -> planner -> prepare -> current-source assertion.
import { prepare, assertApprovedPayload } from '../../../workers/career-browser/approve-first.ts';
import { applicationApprovalHash, planApplication } from '../../../scripts/apply.ts';
import { hashApplyPayload } from '../../../supabase/functions/_shared/career_apply_store.ts';
import { quarantinedFact } from '../../../supabase/functions/_shared/fact_quarantine.ts';
import { engineInput } from '../../../workers/career-cloud/engine_input.ts';
import { assertCurrentApprovedSources } from '../../../workers/career-cloud/current_sources.ts';
import { trustedManifest } from '../../../extension/src/apply_core.ts';
import { answerKey, mapQuestion } from '../../../supabase/functions/_shared/question_map.ts';
const owner='00000000-0000-4000-8000-00000000cb01';
const folder=new URL('.',import.meta.url),html=await Deno.readTextFile(new URL('../forms-ci/lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027.html',folder));
const SPONS='cards[651d37ec-0ef2-40dc-9bf5-6f5973ab81c0][field0]',AUTH='cards[651d37ec-0ef2-40dc-9bf5-6f5973ab81c0][field1]',ACK='cards[f7ecb5fe-3e81-46f9-9b63-f1a6b71d53c3][field0]';
const ack='I understand that next steps will be sent via email and I have marked the sender address above as safe.';
for(const name of ['name','email','resume',SPONS,AUTH,ACK])if(!html.includes('name="'+name+'"'))throw Error('captured field missing '+name);
const bytes=new TextEncoder().encode('%PDF-1.4 SYNTHETIC TEST RESUME');
const digest=async(b:Uint8Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(n=>n.toString(16).padStart(2,'0')).join('');
const artifact={filename:'synthetic.pdf',sha256:await digest(bytes)};
const schema=[{name:'name',label:'Full name',type:'text',required:true,options:[]},{name:'email',label:'Email',type:'email',required:true,options:[]},
 {name:SPONS,label:'Do you now, or in the future require sponsorship?',type:'select',required:true,options:[{label:'Yes',value:'Yes'},{label:'No',value:'No'}]},
 {name:AUTH,label:'Do you have the unrestricted right to work in the United States?',type:'select',required:true,options:[{label:'Yes',value:'Yes'},{label:'No',value:'No'}]},
 {name:ACK,label:ack,type:'checkbox',required:true,options:[]},{name:'resume',label:'Resume/CV',type:'file',required:true,options:[]}];
const tags=['atomic-first','atomic-last','unknown-top','unknown-field','bank-quarantined','own-chat-f033','expired','expired-queued','renewal','ordinary','ordinary-expired','ordinary-revoked','ordinary-scope','ordinary-thread','ordinary-after','resume-negative','binding-negative','claim-race','tap-race','maintenance'];
const thread={id:'00000000-0000-4000-8000-00000000cba1',user_id:owner,title:'Synthetic card cloud source fixtures'};
const account={epoch:1,version:1,paused:false},profile={user_id:owner,facts:[]};
const jobs=tags.map(tag=>'lever:veeva:synthetic-'+tag),questionRows:any[]=[];
const addRow=(key:string,answer:string,field:any,n:number,jobIds:string[]=[])=>questionRows.push({
 id:'00000000-0000-4000-8000-'+(0xcb10+n).toString(16).padStart(12,'0'),user_id:owner,key,kind:mapQuestion(field).kind,
 label:field.label,type:field.type,options:field.options.map((x:any)=>x.label),job_ids:jobIds,company:null,state:'answered',answer,misfit:false,
 answered_at:'2026-10-21T00:00:00.000Z'});
addRow('fact:full_name','Synthetic Person',schema[0],1);
addRow('fact:email','synthetic@example.test',schema[1],2);
addRow('fact:sponsorship','No',schema[2],3);
addRow('fact:work_authorization','Yes',schema[3],4);
const ackKeys=new Map<string,string[]>();
for(const job of jobs){const key=answerKey(schema[4],job);ackKeys.set(key,[...ackKeys.get(key)??[],job]);}
let nextRow=5;
for(const [key,scopes] of ackKeys)addRow(key,'Yes',schema[4],nextRow++,scopes);
const rows=questionRows.map(({id,user_id,key,kind,answer,state})=>({id,user_id,key,kind,answer,state}));
const input=engineInput({owner,profile,rows,resumeSha256:artifact.sha256}),facts=input.facts;
if(input.skipped.length||Object.keys(facts.answers).length||Object.keys(facts.saved).length)throw Error('source normalization repaired/promoted an answer');
const manifest=trustedManifest({owner,file:facts,rows:facts.text_answers,resume:{sha256:artifact.sha256}});
const schemaHash=await hashApplyPayload(schema),templates:Record<string,unknown>={},identities:Record<string,unknown>={};
let currentSourceChecks=0;
for(const tag of tags){
 const job='lever:veeva:synthetic-'+tag,url='https://jobs.lever.co/veeva/synthetic-'+tag+'/apply',company='Synthetic '+tag;
 const plan=planApplication({manifest,userId:owner,jobId:job,employer:company,schema,artifact,now:0});
 if(!plan.ready)throw Error('positive plan failed '+tag+': '+JSON.stringify(plan));
 const fields=(plan as any).fields,readback=Object.fromEntries(fields.map((f:any)=>[f.name,f.name==='resume'?artifact.filename:f.name===ACK?true:String(f.value)]));
 const He=await applicationApprovalHash({userId:owner,posting:job,destination:url,fields,resumeSha256:artifact.sha256,schemaHash,pageFieldNames:[],manifest});
 const dry={result:{state:'not_submitted',reason:'dry_run'},evidence:{approval_hash:He,schema,fields,readback,sources:manifest.byFactId,replay_sources:Object.values(manifest.byFactId),trust:{quarantine_version:manifest.version,manifest_hash:manifest.hash},payload:{user_id:owner,posting:job,company,destination:url,resume:artifact,page_fields:{},schema_hash:schemaHash}}};
 const p=await prepare({url,factsPath:'synthetic.json',resumePath:'synthetic.pdf',account:{epoch:1,version:1},now:0,runEngine:async()=>dry});
 if(!p.ready)throw Error('positive prepare failed');await assertApprovedPayload(p.payload,{url,user_id:owner});
 assertCurrentApprovedSources(p.payload,engineInput({owner,profile:structuredClone(profile),rows:structuredClone(rows),resumeSha256:artifact.sha256}));
 currentSourceChecks++;
 const answers=p.payload.fields.map((f:any)=>{
  let shown:unknown=f.factId===`approved-local-resume:${artifact.sha256}`?artifact.filename:dry.evidence.readback[f.name];
  if(typeof shown==='boolean')shown=shown?'Yes (checked)':'No (left unchecked)';
  if(Array.isArray(shown)&&shown.every(v=>typeof v==='string'))shown=shown.join(', ');
  if(typeof shown!=='string')throw Error('actual dry readback missing '+f.name);
  return{name:f.name,label:f.label,value:f.value,shown,factId:f.factId};
 });
 if(answers.length!==p.payload.fields.length||answers.some((r:any,i:number)=>r.value!==p.payload.fields[i].value||typeof r.shown!=='string')||await hashApplyPayload(p.payload)!==p.hash)throw Error('prepared readback/hash mismatch');
 templates[tag]={payload:p.payload,hash:p.hash,readback:{answers,resume_name:artifact.filename,resume_sha256:artifact.sha256,destination:url,blank:[],employer_fields:[]}};
 identities[tag]={He,Hq:p.hash};
}
if(quarantinedFact({id:'F-033'})||!quarantinedFact({factId:'F-033'}))throw Error('bank identity control failed');
const resume={...artifact,bytes_base64:btoa(String.fromCharCode(...bytes))};
const flow_state={career:{stores:{profile}}};
const source_fixture={owner,thread,account,resume,profile,rows,question_rows:questionRows,flow_state};
const source_digest=await hashApplyPayload({user_id:owner,profile,rows});
const document={owner,scope:'actual engineInput + trustedManifest + planner + prepare + assertCurrentApprovedSources; scripted dry evidence; NO browser or SQL runtime proof',
 source_commit:Deno.env.get('CARD_CLOUD_SOURCE_COMMIT')??null,resume,profile,rows,account,thread,source_fixture,source_digest,facts,schema,
 raw_own_chat_control:{id:'F-033',kind:'profile',text:'My name is Synthetic Person.',status:'confirmed',needs_confirmation:false,user_id:owner},
 raw_to_engine_input_status:'actual engineInput source contract exercised for all 20 templates; raw id F-033 is not promoted to bank factId',current_source_checks:currentSourceChecks,identities,templates};
await Deno.writeTextFile(new URL('prepared-payloads.json',folder),JSON.stringify(document,null,2)+'\n');
const literal=JSON.stringify(templates);
if(literal.includes('$card_cloud_fixture$'))throw Error('SQL literal delimiter collision');
const sourceLiteral=JSON.stringify(source_fixture);
if(sourceLiteral.includes('$card_cloud_sources$'))throw Error('source SQL literal delimiter collision');
const sql=`-- Generated by generate.ts. Included ONLY from explicitly authorized pending tests.\n-- No schema migration, flags, DB connection or automatic test discovery.\ncreate function pg_temp.cc_full_item(tag text) returns jsonb language plpgsql as $fn$\ndeclare item jsonb; deadline text; p jsonb; begin\n item := $card_cloud_fixture$${literal}$card_cloud_fixture$::jsonb->tag;\n if item is null then raise exception 'unknown synthetic fixture tag %',tag; end if;\n -- Refresh only BEFORE display. Expiry is not in He; Hq binds the fresh exact P.\n deadline := (clock_timestamp()+interval '1 hour')::text;\n p := jsonb_set(item->'payload','{expires_at}',to_jsonb(deadline));\n p := jsonb_set(p,'{approved_snapshot,original,expires_at}',to_jsonb(deadline));\n item := jsonb_set(item,'{payload}',p);\n return jsonb_set(item,'{hash}',to_jsonb(encode(sha256(convert_to(public.career_apply_canonical(p),'UTF8')),'hex')));\nend $fn$;\ncreate function pg_temp.cc_full_payload(tag text) returns jsonb language sql as $$ select pg_temp.cc_full_item(tag)->'payload' $$;\n-- Call cc_full_item ONCE per displayed item; do not independently refresh payload and hash.\n`;
const seedSql=`
-- DDL inspected: 20261020060000_career_apply_questions.sql, 20261011010000_flow_state.sql,
-- 20261021080000_career_apply_cloud.sql, 20261024130000_career_apply_card_cloud_bridge.sql.
-- This function is not called on inclusion. Call explicitly AFTER base synthetic actors, before show/tap.
-- No switches, opt-in, enrollments, approvals, jobs or lease state are seeded here.
create function pg_temp.cc_source_fixture() returns jsonb language sql as $source$
 select $card_cloud_sources$${sourceLiteral}$card_cloud_sources$::jsonb
$source$;
create function pg_temp.cc_seed_sources() returns jsonb language plpgsql as $seed$
declare s jsonb:=pg_temp.cc_source_fixture(); u uuid:=(s->>'owner')::uuid;
 tid uuid:=(s#>>'{thread,id}')::uuid; q jsonb; existing jsonb; snapshot jsonb;
begin
 if u<>'00000000-0000-4000-8000-00000000cb01'::uuid or tid<>'00000000-0000-4000-8000-00000000cba1'::uuid
  then raise exception 'synthetic source identity changed'; end if;
 if not exists(select 1 from auth.users where id=u) then
  insert into auth.users(id,email) values(u,'card-cloud-source@example.test'); end if;
 if not exists(select 1 from public.profiles where id=u) then insert into public.profiles(id) values(u); end if;
 if exists(select 1 from public.agent_threads where id=tid and user_id<>u) then raise exception 'source thread owner mismatch'; end if;
 if not exists(select 1 from public.agent_threads where id=tid) then
  insert into public.agent_threads(id,user_id,title) values(tid,u,s#>>'{thread,title}'); end if;
 select value into existing from public.career_watch_kv where user_id=u and key='career:account';
 if found then
  if not existing @> (s->'account') then raise exception 'source account mismatch'; end if;
 else insert into public.career_watch_kv(user_id,key,value) values(u,'career:account',s->'account'); end if;
 if exists(select 1 from public.career_apply_cloud_resumes where user_id=u and sha256=s#>>'{resume,sha256}') then
  if not exists(select 1 from public.career_apply_cloud_resumes where user_id=u and sha256=s#>>'{resume,sha256}'
   and filename=s#>>'{resume,filename}' and bytes=decode(s#>>'{resume,bytes_base64}','base64')
   and privacy_epoch=(s#>>'{account,epoch}')::bigint) then raise exception 'source resume mismatch'; end if;
 else insert into public.career_apply_cloud_resumes(user_id,sha256,filename,bytes,privacy_epoch)
  values(u,s#>>'{resume,sha256}',s#>>'{resume,filename}',decode(s#>>'{resume,bytes_base64}','base64'),(s#>>'{account,epoch}')::bigint); end if;
 for q in select value from jsonb_array_elements(s->'question_rows') loop
  select jsonb_build_object('id',id,'user_id',user_id,'key',key,'kind',kind,'label',label,'type',type,'options',options,
   'job_ids',job_ids,'company',company,'state',state,'answer',answer,'misfit',misfit) into existing
   from public.career_apply_questions where user_id=u and key=q->>'key';
  if found then
   if existing is distinct from (q-'answered_at') then raise exception 'source question mismatch: %',q->>'key'; end if;
  else
   if exists(select 1 from public.career_apply_questions where id=(q->>'id')::uuid) then raise exception 'source question id already owned'; end if;
   insert into public.career_apply_questions(id,user_id,key,kind,label,type,options,job_ids,company,state,answer,misfit,answered_at)
    values((q->>'id')::uuid,u,q->>'key',q->>'kind',q->>'label',q->>'type',q->'options',
     array(select jsonb_array_elements_text(q->'job_ids')),q->>'company',q->>'state',q->>'answer',(q->>'misfit')::boolean,(q->>'answered_at')::timestamptz);
  end if;
 end loop;
 select jsonb_build_object('user_id',user_id,'profile',state#>'{career,stores,profile}') into existing
  from public.agent_flow_state where thread_id=tid;
 if found then
  if existing is distinct from jsonb_build_object('user_id',u,'profile',s->'profile') then raise exception 'source flow owner/profile mismatch'; end if;
 else insert into public.agent_flow_state(thread_id,user_id,state) values(tid,u,s->'flow_state'); end if;
 snapshot:=public.career_apply_message_cloud_sources(u);
 if snapshot->'profile' is distinct from s->'profile' or snapshot->'rows' is distinct from s->'rows' then
  raise exception 'seeded source RPC does not reproduce fixture'; end if;
 return jsonb_build_object('owner',u,'thread_id',tid,'resume_sha256',s#>>'{resume,sha256}',
  'resume_filename',s#>>'{resume,filename}','account',s->'account','question_count',jsonb_array_length(s->'rows'),'source_digest',snapshot->>'digest');
end $seed$;
`;
await Deno.writeTextFile(new URL('fixture.sql',folder),sql+seedSql);
console.log(JSON.stringify({templates:Object.keys(templates).length,fields:(templates['atomic-first'] as any).payload.fields.length,readback_answers:Object.values(templates).reduce((n:number,t:any)=>n+t.readback.answers.length,0),owner,resume_sha256:artifact.sha256,source_rows:rows.length,current_source_checks:currentSourceChecks,source_digest,source_gate:'actual engineInput/trustedManifest/planner/prepare/assertApprovedPayload/assertCurrentApprovedSources and exact He/Hq passed for all templates',raw_chat_vs_bank_control:'2/2',browser:'NOT_RUN',sql:'WRITTEN_NOT_RUN',new_cost_usd:0}));
