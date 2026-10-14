// Internal API endpoint for this cloud machine; synthetic data, serial request execution.
import {handlerWorld,auditModelConfigured,auditBudget} from './handler-world.ts';
const portIndex=Deno.args.indexOf('--port');
const port=Number(portIndex<0?8010:Deno.args[portIndex+1]);
const worlds=new Map<string,any>();let queue=Promise.resolve();
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
Deno.serve({hostname:'127.0.0.1',port},async req=>{
 const url=new URL(req.url);
 if(req.method==='GET'&&url.pathname==='/health')return json({isolated:true,model:'gpt-5-nano',model_configured:auditModelConfigured,synthetic_authentication:true,synthetic_database:true,actual_handler:true,budget:await auditBudget.status(),paid_images:false});
 if(req.method!=='POST'||url.pathname!=='/functions/v1/agent-chat')return json({error:'not_found'},404);
 let body:any;try{body=await req.json()}catch{return json({error:'invalid_json'},400)}
 if(typeof body.message!=='string')return json({error:'message_required'},400);
 const caseId=String(body.audit_case_id||req.headers.get('x-upmore-audit-case')||'manual-test');
 if(!/^[A-Za-z0-9_.-]{1,100}$/.test(caseId))return json({error:'invalid_audit_case_id'},400);
 let resolve!:(r:Response)=>void;const response=new Promise<Response>(r=>{resolve=r});
 queue=queue.then(async()=>{try{
  if(!worlds.has(caseId)){const uid='00000000-0000-4000-8000-'+String(worlds.size+1).padStart(12,'0');const w=handlerWorld(uid);w.caseId=caseId;worlds.set(caseId,w);}
  const w=worlds.get(caseId);w.thread=String(body.audit_session||'A');if(body.thread_id)w.threadIds[w.thread]=body.thread_id;
  const result=await w.turn(body.message);resolve(json(result,result.http_status||200));
 }catch(e){resolve(json({error:'audit_handler_error',message:e instanceof Error?e.message:String(e)},500))}});
 return await response;
});
