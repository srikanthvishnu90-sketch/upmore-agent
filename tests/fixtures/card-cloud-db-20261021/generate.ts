// Offline SQL-boundary fixture generation, not an engine/browser or database execution.
// Every P passes actual trustedFacts -> planApplication -> prepare -> assertApprovedPayload.
import { prepare, assertApprovedPayload } from '../../../workers/career-browser/approve-first.ts';
import { applicationApprovalHash, planApplication, trustedFacts } from '../../../scripts/apply.ts';
import { hashApplyPayload } from '../../../supabase/functions/_shared/career_apply_store.ts';
import { quarantinedFact } from '../../../supabase/functions/_shared/fact_quarantine.ts';
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
const own=(factId:string,value:string,extra={})=>({value,factId,user_id:owner,confirmed:true,provenance:'owner stated synthetic fixture',confirmation_event_id:'evt-'+factId,...extra});
const facts={user_id:owner,answers:{full_name:own('TEST-NAME','Synthetic Person'),email:own('TEST-EMAIL','synthetic@example.test'),sponsorship:own('TEST-SPONS','No'),work_authorization:own('TEST-AUTH','Yes')},saved:{[ack.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()]:own('TEST-ACK','Yes',{authorizes:true})}};
const manifest=trustedFacts(facts,artifact),schemaHash=await hashApplyPayload(schema),templates:Record<string,unknown>={};
const tags=['atomic-first','atomic-last','unknown-top','unknown-field','bank-quarantined','own-chat-f033','expired','expired-queued','renewal','ordinary','ordinary-expired','ordinary-revoked','ordinary-scope','ordinary-thread','ordinary-after','resume-negative','binding-negative','claim-race','tap-race','maintenance'];
for(const tag of tags){
 const job='lever:veeva:synthetic-'+tag,url='https://jobs.lever.co/veeva/synthetic-'+tag+'/apply',company='Synthetic '+tag;
 const plan=planApplication({manifest,userId:owner,jobId:job,employer:company,schema,artifact,now:0});
 if(!plan.ready)throw Error('positive plan failed '+tag+': '+JSON.stringify(plan));
 const fields=(plan as any).fields,readback=Object.fromEntries(fields.map((f:any)=>[f.name,f.name==='resume'?artifact.filename:f.name===ACK?true:String(f.value)]));
 const He=await applicationApprovalHash({userId:owner,posting:job,destination:url,fields,resumeSha256:artifact.sha256,schemaHash,pageFieldNames:[],manifest});
 const p=await prepare({url,factsPath:'synthetic.json',resumePath:'synthetic.pdf',account:{epoch:1,version:1},now:0,runEngine:async()=>({result:{state:'not_submitted',reason:'dry_run'},evidence:{approval_hash:He,schema,fields,readback,sources:manifest.byFactId,replay_sources:Object.values(manifest.byFactId),trust:{quarantine_version:manifest.version,manifest_hash:manifest.hash},payload:{user_id:owner,posting:job,company,destination:url,resume:artifact,page_fields:{},schema_hash:schemaHash}}})});
 if(!p.ready)throw Error('positive prepare failed');await assertApprovedPayload(p.payload,{url,user_id:owner});
 templates[tag]={payload:p.payload,hash:p.hash,readback:{answers:p.payload.fields,resume_name:artifact.filename,resume_sha256:artifact.sha256,destination:url,blank:[],employer_fields:[]}};
}
if(quarantinedFact({id:'F-033'})||!quarantinedFact({factId:'F-033'}))throw Error('bank identity control failed');
const document={owner,scope:'actual planner + prepare with scripted dry-run evidence; NO browser or SQL runtime proof',resume:{...artifact,bytes_base64:btoa(String.fromCharCode(...bytes))},facts,schema,raw_own_chat_control:{id:'F-033',kind:'profile',text:'My name is Synthetic Person.',status:'confirmed',needs_confirmation:false,user_id:owner},raw_to_engine_input_status:'NOT_RUN; Claude-owned engine_input must preserve id-vs-bank-factId semantics',templates};
await Deno.writeTextFile(new URL('prepared-payloads.json',folder),JSON.stringify(document,null,2)+'\n');
const literal=JSON.stringify(templates);
if(literal.includes('$card_cloud_fixture$'))throw Error('SQL literal delimiter collision');
const sql=`-- Generated by generate.ts. Included ONLY from explicitly authorized pending tests.\n-- No schema migration, flags, DB connection or automatic test discovery.\ncreate function pg_temp.cc_full_item(tag text) returns jsonb language plpgsql as $fn$\ndeclare item jsonb; deadline text; p jsonb; begin\n item := $card_cloud_fixture$${literal}$card_cloud_fixture$::jsonb->tag;\n if item is null then raise exception 'unknown synthetic fixture tag %',tag; end if;\n -- Refresh only BEFORE display. Expiry is not in He; Hq binds the fresh exact P.\n deadline := (clock_timestamp()+interval '1 hour')::text;\n p := jsonb_set(item->'payload','{expires_at}',to_jsonb(deadline));\n p := jsonb_set(p,'{approved_snapshot,original,expires_at}',to_jsonb(deadline));\n item := jsonb_set(item,'{payload}',p);\n return jsonb_set(item,'{hash}',to_jsonb(encode(sha256(convert_to(public.career_apply_canonical(p),'UTF8')),'hex')));\nend $fn$;\ncreate function pg_temp.cc_full_payload(tag text) returns jsonb language sql as $$ select pg_temp.cc_full_item(tag)->'payload' $$;\n-- Call cc_full_item ONCE per displayed item; do not independently refresh payload and hash.\n`;
await Deno.writeTextFile(new URL('fixture.sql',folder),sql);
console.log(JSON.stringify({templates:Object.keys(templates).length,fields:(templates['atomic-first'] as any).payload.fields.length,owner,resume_sha256:artifact.sha256,source_gate:'actual assertApprovedPayload passed for every generated P',raw_chat_vs_bank_control:'2/2',browser:'NOT_RUN',sql:'NOT_RUN',new_cost_usd:0}));
