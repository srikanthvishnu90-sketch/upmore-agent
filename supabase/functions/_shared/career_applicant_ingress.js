// Standalone source endpoint. Existing conversation handlers are untouched.
import {Buffer} from 'node:buffer';
import {validateResume,MAX_RESUME_BYTES} from './career_applicant_format.js';
import {createCareerPersistence} from './career_persistence.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,KEY=/^[A-Za-z0-9_-]{1,128}$/;
const FIELDS=new Set(['name','first_name','last_name','email','phone','location','country','city','state','postal_code','linkedin','website','github']);
const error=(code,status=400)=>Object.assign(new Error(code),{code,status});
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export async function applicantRequestHash(value){const b=new TextEncoder().encode(JSON.stringify(canonical(value))),h=await crypto.subtle.digest('SHA-256',b);return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,'0')).join('');}
function fields(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>FIELDS.size)throw error('INVALID_APPLICANT_FIELDS');for(const [k,v]of Object.entries(value))if(!FIELDS.has(k)||typeof v!=='string'||!v.trim()||v.length>300||/[\x00-\x1f\x7f]/.test(v))throw error('INVALID_APPLICANT_FIELDS');return value;}
async function bodyBytes(req,limit){
 const declared=req.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw error('REQUEST_SIZE_LIMIT',413);
 const chunks=[];let size=0;const reader=req.body?.getReader();if(!reader)throw error('REQUEST_BODY_REQUIRED');
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw error('REQUEST_SIZE_LIMIT',413);}chunks.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks,size);
}
export function createApplicantIngress({authenticate,rpc,allowedOrigins=[]}){
 if(typeof authenticate!=='function'||typeof rpc!=='function')throw error('APPLICANT_INGRESS_NOT_WIRED',503);
 const persistence=createCareerPersistence({rpc});
 return async function handle(req){
  const origin=req.headers.get('origin'),headers={'content-type':'application/json','cache-control':'no-store','vary':'Origin'};
  if(origin&&allowedOrigins.includes(origin)){headers['access-control-allow-origin']=origin;headers['access-control-allow-headers']='authorization,content-type';headers['access-control-allow-methods']='POST,OPTIONS';}
  const respond=(status,data)=>new Response(status===204?null:JSON.stringify(data),{status,headers});
  if(origin&&!allowedOrigins.includes(origin))return respond(403,{error:'ORIGIN_NOT_ALLOWED'});
  if(req.method==='OPTIONS')return respond(204,null);
  if(req.method!=='POST')return respond(405,{error:'METHOD_NOT_ALLOWED'});
  try{
   const bearer=/^Bearer ([^\s]+)$/i.exec(req.headers.get('authorization')||'');if(!bearer)throw error('UNAUTHORIZED',401);
   let user;try{user=await authenticate(bearer[1]);}catch(_){throw error('UNAUTHORIZED',401);}if(!UUID.test(user?.id||''))throw error('UNAUTHORIZED',401);
   const path=new URL(req.url).pathname,action=path.endsWith('/uploads')?'upload':path.endsWith('/review')?'review':path.endsWith('/confirm')?'confirm':null;if(!action)throw error('APPLICANT_ROUTE_NOT_FOUND',404);
   async function call(name,args){let result;try{result=await rpc(name,args);}catch(_){throw error('APPLICANT_STORAGE_UNCERTAIN',503);}if(result?.error||!result?.data||typeof result.data!=='object')throw error('APPLICANT_STORAGE_UNAVAILABLE',503);if(result.data.error)throw error(result.data.error,409);return result.data;}
   let threadId,requestId,uploadId,input,validation,encoded,requestHash;
   if(action==='upload'){
    const type=req.headers.get('content-type')||'';if(!/^multipart\/form-data;\s*boundary=/i.test(type))throw error('MULTIPART_FILE_REQUIRED');
    const bytes=await bodyBytes(req,MAX_RESUME_BYTES+16384),parsed=await new Request('http://local.invalid/',{method:'POST',headers:{'content-type':type},body:bytes}).formData();
    if([...parsed.keys()].some(k=>!['threadId','requestId','file'].includes(k))||['threadId','requestId','file'].some(k=>parsed.getAll(k).length!==1))throw error('INVALID_UPLOAD_FIELDS');
    threadId=parsed.get('threadId');requestId=parsed.get('requestId');const file=parsed.get('file');
    if(!UUID.test(threadId||'')||!KEY.test(requestId||'')||!file||typeof file.arrayBuffer!=='function')throw error('INVALID_UPLOAD_FIELDS');
    const original=await file.arrayBuffer();validation=await validateResume(original,file.name,file.type);encoded=Buffer.from(original).toString('base64');
    requestHash=await applicantRequestHash({version:'career_applicant_upload/v1',threadId,requestId,filename:validation.filename,contentType:validation.contentType,sha256:validation.sha256,bytes:validation.bytes});
   }else{
    if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')||''))throw error('JSON_REQUIRED');
    try{input=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await bodyBytes(req,12288)));}catch(e){if(e.status)throw e;throw error('INVALID_JSON');}
    if(!input||typeof input!=='object'||Array.isArray(input))throw error('INVALID_APPLICANT_REQUEST');
    const allowed=action==='review'?['threadId','uploadId','fields']:['threadId','requestId','uploadId','fields','reviewHash','message'];
    if(Object.keys(input).some(k=>!allowed.includes(k)))throw error('INVALID_APPLICANT_REQUEST');
    ({threadId,requestId,uploadId}=input);if(!UUID.test(threadId||'')||!UUID.test(uploadId||''))throw error('OWNED_UPLOAD_REFERENCE_REQUIRED');fields(input.fields);
    if(action==='review'){const result=await call('career_applicant_review_v1',{p_user:user.id,p_thread:threadId,p_upload:uploadId,p_fields:input.fields});return respond(200,result);}
    const phrase=Object.keys(input.fields).length?'use this resume and confirm these fields':'use this resume';
    if(!KEY.test(requestId||'')||typeof input.message!=='string'||input.message.length>120||input.message.trim().toLowerCase()!==phrase||!/^[a-f0-9]{64}$/.test(input.reviewHash||''))throw error('EXPLICIT_REVIEW_CONFIRMATION_REQUIRED');
    requestHash=await applicantRequestHash({version:'career_applicant_confirm/v1',threadId,requestId,uploadId,reviewHash:input.reviewHash,fields:input.fields,message:input.message});
   }
   let loaded;try{loaded=await persistence.load({userId:user.id,threadId,turnKey:requestId,requestHash});}catch(e){throw error(e.code==='storage_unavailable'?'APPLICANT_STORAGE_UNAVAILABLE':e.code,['turn_key_conflict','privacy_epoch_changed','owned_thread_missing'].includes(e.code)?409:503);}
   if(loaded.replay)return respond(200,loaded.replay);
   const base={p_user:user.id,p_thread:threadId,p_key:requestId,p_hash:requestHash,p_revision:loaded.revision,p_account_version:loaded.accountVersion};
   const result=action==='upload'?await call('career_applicant_upload_turn_v1',{p_base:base,p_upload:validation,p_encoded:encoded}):await call('career_applicant_confirm_turn_v1',{p_base:base,p_upload:uploadId,p_review:input.reviewHash,p_fields:input.fields,p_message:input.message});
   if(!result.response||result.response.thread_id!==threadId||result.response.turn_key!==requestId||!result.response.applicant)throw error('APPLICANT_STORAGE_UNCERTAIN',503);
   return respond(200,result.response);
  }catch(e){return respond(e.status||400,{error:e.code||'INVALID_APPLICANT_REQUEST',...(e.status===503?{retrySameRequestId:true}:{})});}
 };
}
