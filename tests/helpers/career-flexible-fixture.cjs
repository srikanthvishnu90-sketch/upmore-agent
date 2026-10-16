'use strict';
// All generation and semantic decisions here are scripted mocks. No HTTP,
// credentials or actual entailment/model-quality measurements occur.
const path=require('node:path'),crypto=require('node:crypto');
const B=require('./model-boundary-fixture.cjs'),{U,V,T,TV,copy}=B;
const record=event=>{if(process.env.CAREER_FLEX_EVIDENCE)require('node:fs').appendFileSync(process.env.CAREER_FLEX_EVIDENCE,JSON.stringify({at:new Date().toISOString(),verification:'SCRIPTED_GENERATION_AND_SEMANTIC_MOCK',...event})+'\n');};
function receipt(request){return {version:'career_semantic_receipt/v1',verifier_id:'scripted-test-oracle',verifier_revision:'frozen-v1',context_sha256:request.context_sha256,response_sha256:request.response_sha256,verdict:'supported',whole_response_checked:true,authority_safe:true,unlisted_claims:[],claims:request.candidate.claims.map(c=>({id:c.id,verdict:'entailed',evidence_ids:c.evidence_ids}))};}
function candidate(view){const fact=view.facts.find(f=>f.kind==='project');return {version:'career_grounded_reply/v2',blocks:[{kind:'prose',text:'It makes sense to want an answer that feels honest and still shows the work clearly.',claim_ids:[]},{kind:'draft',text:fact.text,claim_ids:['C1']},{kind:'question',text:'Which part of that work felt hardest to explain?',claim_ids:[]}],claims:[{id:'C1',text:fact.text,scope:'person',evidence_ids:[fact.id]}]};}
function contextRead(dbs,user,thread,a){
 const db=dbs.get(user),rows=[...(db.receipts?.values()||[])].map(r=>r.response).filter(r=>r.meta?.career_dialogue?.epoch===(db.account?.epoch||0));
 const barrier=Math.max(0,...rows.filter(r=>r.meta.career_dialogue.barrier).map(r=>r.meta.career_dialogue.account_version));
 const current=rows.filter(r=>r.thread_id===thread&&r.meta.career_dialogue.account_version>barrier).sort((x,y)=>x.meta.career_dialogue.account_version-y.meta.career_dialogue.account_version);
 return {ok:true,user_id:user,thread_id:thread,revision:db.state.career.revision||0,account_version:db.version||0,epoch:db.account?.epoch||0,barrier_version:barrier,dialogue:current.slice(-8).map(r=>({user:r.meta.career_dialogue.user_text,assistant:r.reply})),current_draft:[...current].reverse().find(r=>r.meta.career_model?.current_draft)?.meta.career_model.current_draft||null};
}
async function fixture(t,options={}){
 let owner=U;const dbs=options.dbs||new Map([U,V].map(u=>[u,{state:{career:B.snapshot(u)},messages:[],options:{}}])),calls=[],requests=[],verifications=[],tickets=new Map();
 const sql=options.sql;
 const client={auth:{getUser:async()=>({data:{user:{id:owner}}})},async rpc(name,a){calls.push({name,args:copy(a)});if(options.onRPC){const custom=await options.onRPC(name,a,dbs);if(custom!==undefined)return custom;}
  if(name==='agent_rl_bump')return {data:true,error:null};
  if(sql){
   if(/^agent_model_call_(reserve|record)$/.test(name)){
    const quote=v=>v==null?'NULL':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
    try {const raw=sql.sql('select public.'+name+'('+Object.entries(a).map(([k,v])=>k+'=>'+quote(v)).join(',')+');','service_role');return {data:raw?JSON.parse(raw):null,error:null};}catch(_){return {data:null,error:{message:'SYNTHETIC local monthly RPC failure'}};}
   }
   return sql.client.rpc(name,a);
  }
  if(name==='career_model_context_read_v2')return options.readUnavailable?{data:null,error:{message:'SYNTHETIC unavailable context'}}:{data:{...contextRead(dbs,owner,owner===U?T:TV,a),...(options.readOverride||{})},error:null};
  if(name==='career_model_budget_reserve_v1'){
   if(options.budgetDenied)return {data:{ok:false,reason:'budget_exhausted'},error:null};
   const key=owner+':'+a.p_key,old=tickets.get(key);if(old)return {data:{ok:false,reason:old.hash===a.p_hash&&old.payload===a.p_payload?'already_reserved':'turn_key_conflict'},error:null};
   const ticket=crypto.randomUUID();tickets.set(key,{ticket,hash:a.p_hash,payload:a.p_payload});return {data:{ok:true,ticket,boundMicros:a.p_bound},error:null};
  }
  if(name==='career_model_budget_consume_v1')return {data:{ok:!options.consumeDenied,ticket:a.p_ticket},error:null};
  if(name==='career_model_budget_settle_v1')return options.settleFails?{data:null,error:{message:'SYNTHETIC unsettled'}}:{data:{ok:true,state:a.p_outcome,contextCurrent:!options.contextChanged},error:null};
  if(name==='agent_model_call_reserve')return {data:{ok:true,call_id:crypto.randomUUID()},error:null};
  if(name==='agent_model_call_record')return {data:null,error:null};
  return require('./career-persistence-fake.cjs')(dbs.get(owner),owner,owner===U?T:TV,name,a);
 },from(table){const filters={},q={select(){return q;},eq(k,v){filters[k]=v;return q;},async upsert(row){if(sql)sql.sql(`insert into profiles(id)values('${row.id}')on conflict do nothing;`);return {error:null};},async maybeSingle(){if(table!=='agent_threads')throw Error('unexpected table');if(sql){const raw=sql.sql(`select row_to_json(t) from agent_threads t where id='${filters.id}' and user_id='${filters.user_id}';`);return {data:raw?JSON.parse(raw):null,error:null};}return {data:filters.id===(owner===U?T:TV)&&filters.user_id===owner?{id:filters.id,user_id:owner}:null,error:null};}};return q;}};
 const verifier={id:'scripted-test-oracle',revision:'frozen-v1',capability:'entailment_coverage_authority/v1',costPolicy:'local_no_external_calls',async verify(r,signal){verifications.push(r);const result=options.verify?await options.verify(r,signal,receipt):receipt(r);record({kind:'semantic_mock',request:r,receipt:result});return result;},...(options.verifierOverride||{})};
 const app=await require('./career-staged-entry.cjs')(path.resolve(__dirname,'../..'),client,{env:{CAREER_MODEL_ENABLED:options.disabled?undefined:'true',CAREER_MODEL_CONTRACT:'grounded_v2',OPENAI_API_KEY:'SYNTHETIC_NOT_A_CREDENTIAL'},dependencies:options.noVerifier?{}:{semanticVerifier:verifier},async request(url,init){if(url!=='https://api.openai.com/v1/chat/completions')throw Error('unexpected network');const body=JSON.parse(init.body),view=JSON.parse(body.messages.at(-1).content);requests.push({body,view});record({kind:'injected_generation_request',body});await options.onProvider?.(dbs,view);if(options.providerError)throw Error('SYNTHETIC provider unavailable');return new Response(JSON.stringify({id:'synthetic-flexible',choices:[{message:options.toolCall?{content:'',tool_calls:[{id:'fake-tool',type:'function',function:{name:'save_memory',arguments:'{}'}}]}:{content:JSON.stringify(options.output?options.output(view,requests.length):candidate(view))},finish_reason:'stop'}],usage:options.usage||{prompt_tokens:500,completion_tokens:200,prompt_tokens_details:{cached_tokens:0}}}),{headers:{'content-type':'application/json'}});}});
 t.after(()=>app.close());return {app,dbs,calls,requests,verifications,verifier,as(u){owner=u;return this;},async request(message='Help me practice an interview answer.',key='flex-turn',thread=owner===U?T:TV,task){const response=await app.request(thread,message,key,task);record({kind:'entry_turn',input:{message,key,thread,task},response});return response;},module:app.exportsFor('_shared/career_model_grounded.ts')};
}
module.exports={fixture,receipt,candidate,U,V,T,TV,copy,contextRead};
