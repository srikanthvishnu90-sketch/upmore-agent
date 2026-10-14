// Exercise the actual authenticated handler over synthetic PostgREST transport.
// No provider model is impersonated, and no real network request is sent after imports.
import {handleChat} from '../../supabase/functions/agent-chat/handler.ts';
import {world,clone} from './world.ts';
import {AuditBudget,MODEL} from './budget.ts';
const nativeFetch=globalThis.fetch.bind(globalThis);
const requestedModel=Deno.args.includes('--real-model');
const existingKey=Deno.env.get('UPMORE_AUDIT_MODEL_KEY')||Deno.env.get('OPENAI_API_KEY')||'';
export const auditModelConfigured=requestedModel&&existingKey.length>0;
export const auditBudget=new AuditBudget();
const USER='00000000-0000-4000-8000-000000000001';
let active:any=null;
const NativeDate=Date;
class AuditDate extends NativeDate {
 constructor(value?:any){super(value===undefined?(active?.now??NativeDate.now()):value);}
 static override now(){return active?.now??NativeDate.now();}
}
globalThis.Date=AuditDate as DateConstructor;
Deno.env.set('SUPABASE_URL','https://audit.supabase.test');
Deno.env.set('SUPABASE_ANON_KEY','mock-anon-key');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','mock-service-key');
Deno.env.set('MODEL_PROVIDER','openai');
if(auditModelConfigured)Deno.env.set('OPENAI_API_KEY',existingKey);else Deno.env.delete('OPENAI_API_KEY');
Deno.env.set('OPENAI_MODEL',MODEL);
Deno.env.set('OPENAI_ROUTER_MODEL',MODEL);
Deno.env.delete('ANTHROPIC_API_KEY');
const json=(value:any,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
const error=(message:string)=>json({message,code:'MOCK_STORAGE_UNAVAILABLE',details:'Synthetic fault injection'},503);
function matches(row:any,key:string,filter:string){
 if(['select','order','limit','offset','on_conflict','or','and'].includes(key))return true;
 const dot=filter.indexOf('.');const op=filter.slice(0,dot),value=filter.slice(dot+1),got=row[key];
 if(op==='eq')return String(got)===value;if(op==='neq')return String(got)!==value;
 if(op==='is')return value==='null'?got==null:String(got)===value;
 if(op==='in')return value.replace(/^\(|\)$/g,'').split(',').includes(String(got));
 if(op==='gte')return String(got)>=value;if(op==='lte')return String(got)<=value;
 if(op==='gt')return String(got)>value;if(op==='lt')return String(got)<value;
 return true;
}
globalThis.fetch=async(input:any,init:any={})=>{
 if(!active)throw Error('No synthetic audit world is active');
 const request=input instanceof Request?input:null;
 const url=new URL(request?request.url:String(input));
 const method=String(init.method||request?.method||'GET').toUpperCase();
 const headers=new Headers(init.headers||request?.headers);
 let body:any=null;const raw=init.body||(request&&method!=='GET'&&method!=='HEAD'?await request.text():null);
 if(raw)body=JSON.parse(String(raw));
 const op:any={method,host:url.hostname,path:url.pathname,table:url.pathname.split('/').at(-1)};
 active.journal.push(op);
 if(url.hostname!=='audit.supabase.test'){
  if(url.hostname==='api.openai.com'&&url.pathname==='/v1/chat/completions'&&auditModelConfigured){
   let reservation:any;try{
    reservation=await auditBudget.reserve(body,active.caseId||active.thread);
    const response=await nativeFetch(input,{...init,redirect:'error'});
    let usage:any=null;try{usage=(await response.clone().json()).usage;}catch{}
    if(response.ok&&usage)await auditBudget.settle(reservation.id,usage);else await auditBudget.unknown(reservation.id);
    op.paid_model=true;op.reservation=reservation.id;return response;
   }catch(e){if(reservation)await auditBudget.unknown(reservation.id);op.budget_or_model_blocked=true;return json({error:{type:'audit_budget_blocked',message:e instanceof Error?e.message:'Audit model request blocked'}},429);}
  }
  op.blocked_external=true;return json({message:'No external provider is wired in this synthetic audit'},403);
 }
 if(url.pathname==='/auth/v1/user')return json({id:active.userId,aud:'authenticated',role:'authenticated',email:'synthetic@example.test',created_at:'2026-10-01T00:00:00Z'});
 if(url.pathname.startsWith('/rest/v1/rpc/')){
  const name=op.table;
  if(name.startsWith('agent_rl_bump'))return json(true);
  if(name==='agent_model_call_reserve')return json({ok:true,call_id:crypto.randomUUID()});
  return json(null);
 }
 if(!url.pathname.startsWith('/rest/v1/'))throw Error('Unsupported synthetic endpoint '+url.pathname);
 const table=op.table;
 if((table==='agent_flow_state'&&active.failState&&method!=='GET')||(table==='saved_recipients'&&active.failRecipients&&['POST','PATCH'].includes(method))||(table==='standing_payments'&&active.failStanding&&['POST','PATCH'].includes(method)))return error('simulated '+table+' storage unavailable');
 if(active.unreadable&&table==='agent_financial_transactions'&&method==='GET')return error('simulated saved data unavailable');
 let rows=active.tables[table]||(active.tables[table]=[]);
 const filters=[...url.searchParams.entries()];
 const chosen=()=>rows.filter((row:any)=>filters.every(([key,value])=>matches(row,key,value)));
 if(method==='POST'){
  const incoming=Array.isArray(body)?body:[body];
  const written=[];
  for(const item of incoming){
   const row=clone(item);row.id??=table==='agent_messages'?++active.messageSeq:crypto.randomUUID();row.created_at??=new Date().toISOString();
   const conflict=url.searchParams.get('on_conflict')?.split(',')||(table==='profiles'?['id']:table==='agent_flow_state'?['thread_id']:[]);
   const old=conflict.length?rows.find((r:any)=>conflict.every(key=>r[key]===row[key])):null;
   if(old)Object.assign(old,row);else rows.push(row);
   written.push(old||row);
   if(table==='agent_flow_state'){const thread=Object.entries(active.threadIds).find(([,id])=>id===row.thread_id)?.[0]||active.thread;active.states[thread]=clone(row.state);}
   if(['saved_recipients','standing_payments'].includes(table))active.ops.push({table,method,row:clone(old||row)});
  }
  return json(headers.get('accept')?.includes('vnd.pgrst.object')?written[0]:written,201);
 }
 if(method==='PATCH'){
  const updated=chosen();for(const row of updated)Object.assign(row,clone(body));
  if(table==='standing_payments'||table==='saved_recipients'&&body.nickname!==null)active.ops.push({table,method,body:clone(body)});
  return json(updated);
 }
 if(method==='DELETE'){const removed=chosen();active.tables[table]=rows.filter((r:any)=>!removed.includes(r));return json(removed);}
 let result=chosen();
 const order=url.searchParams.get('order');if(order)for(const term of order.split(',').reverse()){const [key,direction]=term.split('.');result.sort((a:any,b:any)=>(String(a[key]??'').localeCompare(String(b[key]??'')))*(direction==='desc'?-1:1));}
 const count=result.length;
 const range=headers.get('range');const offset=Number(url.searchParams.get('offset')||range?.split('-')[0]||0);
 const limit=Number(url.searchParams.get('limit')||(range?Number(range.split('-')[1])-offset+1:result.length));
 result=result.slice(offset,offset+limit);
 if(method==='HEAD')return new Response(null,{status:200,headers:{'content-range':`*/${count}`}});
 if(headers.get('accept')?.includes('vnd.pgrst.object'))return result.length===1?json(result[0]):json({message:'JSON object requested, multiple (or no) rows returned',code:'PGRST116',details:result.length+' rows'},406);
 return json(result,200,{'content-range':`0-${Math.max(0,result.length-1)}/${count}`});
};
export function handlerWorld(userId=USER){
 const w=world();w.threadIds={};w.journal=[];w.messageSeq=0;w.userId=userId;
 w.recipients=w.recipients.map((r:any)=>({...r,user_id:userId}));
 const tx=[];for(const [merchant,cents] of [['NETFLIX.COM',1799],['HULU',999]] as const)for(const d of ['2026-07-03','2026-08-03','2026-09-03','2026-10-03'])tx.push({user_id:userId,presence:'observed',account_id:'visa',provider_transaction_id:merchant+d,currency:'USD',amount_cents:-cents,posted_on:d,merchant_raw:merchant,is_pending:false,is_transfer:false,fetched_at:'2026-10-12T13:00:00Z'});
 w.tables={profiles:[],agent_threads:[],agent_messages:[],agent_flow_state:[],saved_recipients:w.recipients,standing_payments:w.standing,agent_financial_transactions:tx,agent_proactive_settings:[{user_id:userId,time_zone:'America/Chicago',alerts_on:true,quiet_start:'22:00',quiet_end:'07:00',category_rules:[],watches:[]}]};
 w.turn=async(message:string)=>{
  active=w;const body:any={message};if(w.threadIds[w.thread])body.thread_id=w.threadIds[w.thread];
  const firstOp=w.journal.length;
  const res=await handleChat(new Request('https://audit.supabase.test/functions/v1/agent-chat',{method:'POST',headers:{Authorization:'Bearer mock-user-token','content-type':'application/json'},body:JSON.stringify(body)}));
  const result=await res.json();if(result.thread_id)w.threadIds[w.thread]=result.thread_id;
  result.http_status=res.status;
  w.transcript.push({thread:w.thread,user:message,result:clone(result),operations:clone(w.journal.slice(firstOp))});
  return result;
 };
 return w;
}
if(import.meta.main){
 for(const sequence of [['send sam 20','$35 instead','yes','did it go through'],['save sam as brother','yes','send brother 20'],['pay my rent','Sam $900 on the 1st via Venmo','yes','pay my rent'],["I'm Nia, a finance sophomore at DePaul.",'What do you know about me?']]){
  const w=handlerWorld();for(const text of sequence)await w.turn(text);console.log(JSON.stringify({transcript:w.transcript,state:w.state(),standing:w.standing}));
 }
}
