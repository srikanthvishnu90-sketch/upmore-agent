import {redactIdentity} from './identity_redact.ts';
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i,KEY=/^[A-Za-z0-9_-]{1,128}$/;
// Standalone workflow commands accept references and explicit confirmations.
// Owner, posting, profile and reviewed application payload are server-resolved.
export function createApplicationBatchIngress({authenticate,rpc,allowedOrigins=/** @type {string[]} */([])}){
 if(typeof authenticate!=='function'||typeof rpc!=='function')throw Error('BATCH_INGRESS_NOT_WIRED');
 return async req=>{
  const origin=req.headers.get('origin'),headers={'content-type':'application/json','cache-control':'no-store','vary':'Origin'};
  if(origin&&allowedOrigins.includes(origin))Object.assign(headers,{'access-control-allow-origin':origin,'access-control-allow-headers':'authorization,content-type,apikey','access-control-allow-methods':'POST,OPTIONS'});
  const response=(status,body)=>new Response(status===204?null:JSON.stringify(body),{status,headers});
  if(origin&&!allowedOrigins.includes(origin))return response(403,{error:'ORIGIN_NOT_ALLOWED'});
  if(req.method==='OPTIONS')return response(204,null);
  if(req.method!=='POST')return response(405,{error:'METHOD_NOT_ALLOWED'});
  try{
   const token=/^Bearer ([^\s]+)$/i.exec(req.headers.get('authorization')||'')?.[1];if(!token)return response(401,{error:'UNAUTHORIZED'});
   let user;try{user=await authenticate(token);}catch(_){return response(401,{error:'UNAUTHORIZED'});}if(!UUID.test(user?.id||''))return response(401,{error:'UNAUTHORIZED'});
   if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))return response(400,{error:'JSON_REQUIRED'});
   const chunks=[];let length=0;const reader=req.body?.getReader();if(!reader)return response(400,{error:'INVALID_BATCH_COMMAND'});
   try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();return response(413,{error:'REQUEST_SIZE_LIMIT'});}chunks.push(value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
   const input=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
   if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!['threadId','requestId','action','input'].includes(k))||!UUID.test(input.threadId||'')||!KEY.test(input.requestId||'')||!['create','review','approve','answers','reconcile','status'].includes(input.action))return response(400,{error:'INVALID_BATCH_COMMAND'});
   if(input.action==='answers'&&(!Array.isArray(input.input?.answers)||input.input.answers.some(a=>!['string','number','boolean'].includes(typeof a?.value)||redactIdentity(String(a.value)).removed.length)))return response(400,{error:'INVALID_ROLE_ANSWER'});
   let result;try{result=await rpc('career_application_batch_control_v1',{p_user:user.id,p_thread:input.threadId.toLowerCase(),p_request:input.requestId,p_action:input.action,p_input:input.input});}catch(_){return response(503,{error:'BATCH_STORAGE_UNCERTAIN',retrySameRequestId:true});}
   if(result?.error){const message=result.error.message||'',invalid=/invalid|unknown.*field/.test(message),denied=/revoked|owned.*missing/.test(message),changed=/conflict|changed|expired|reconcile|required|ready/.test(message);return response(invalid?400:denied?403:changed?409:503,{error:invalid?'INVALID_BATCH_COMMAND':denied?'BATCH_CONTEXT_REVOKED':/conflict/.test(message)?'BATCH_COMMAND_CONFLICT':/reconcile/.test(message)?'RECONCILE_REQUIRED':/expired|changed/.test(message)?'BATCH_REVIEW_CHANGED':changed?'EXACT_BATCH_REVIEW_REQUIRED':'BATCH_STORAGE_UNAVAILABLE',...(!invalid&&!denied&&!changed?{retrySameRequestId:true}:{})});}
   if(result?.data?.version!=='career_application_batch/v1')return response(503,{error:'BATCH_STORAGE_UNCERTAIN',retrySameRequestId:true});
   return response(200,result.data);
  }catch(_){return response(400,{error:'INVALID_BATCH_COMMAND'});}
 };
}
