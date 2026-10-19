// WO-009b-1. Service-side queue adapter; no browser, provider or retry path.
import { admitApplication, dailyLimit } from './career_apply.ts';
export const APPLY_TIMEOUT_MS=15*60000;
export const APPLY_UNKNOWN_REASON='application outcome unknown: the drive stopped before recording it; not retried';
export type ApplyOutcome='confirmed'|'submitted_unconfirmed'|'needs_user'|'failed'|'not_submitted'|'unknown_outcome';
export interface ApplyPayload {version:1;user_id:string;job_id:string;company:string;url:string;fields:unknown[];privacy_epoch:number;account_version:number;expires_at:string;[key:string]:unknown}
const outcomes=new Set(['confirmed','submitted_unconfirmed','needs_user','failed','not_submitted','unknown_outcome']);
const bytes=new TextEncoder();
function canonical(v:unknown):string{
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'&&Number.isSafeInteger(v))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype){
  const cmp=(a:string,b:string)=>{const x=bytes.encode(a),y=bytes.encode(b);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;};
  return '{'+Object.keys(v).sort(cmp).map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}';
 }
 throw Error('INVALID_APPLY_PAYLOAD');
}
export async function hashApplyPayload(payload:unknown):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.encode(canonical(payload))))).map(n=>n.toString(16).padStart(2,'0')).join('');}
function must(r:any):any{if(r.error)throw Error('APPLY_STORE_UNAVAILABLE');return r.data;}
// The caller supplies the operator's existing service client, never a key from chat.
export function supabaseApplyStore(admin:any){
 const rpc=async(name:string,args:unknown)=>must(await admin.rpc(name,args));
 return {
  async enqueue(payload:ApplyPayload,approvalHash:string,o:{now?:number;daily?:number}={}){
   const now=o.now??Date.now(),daily=dailyLimit({daily:o.daily}),hash=await hashApplyPayload(payload);
   const app={user_id:payload.user_id,job_id:payload.job_id,company:payload.company,payload_hash:hash,approval_hash:approvalHash};
   let admitted=admitApplication([],app,now,{daily});if(!admitted.ok)throw Error(admitted.reason!);
   const prior=must(await admin.from('career_apply_jobs').select('job_id,company,state,created_at').eq('user_id',payload.user_id));
   if(!Array.isArray(prior))throw Error('APPLY_STORE_UNAVAILABLE');
   if(prior.some(r=>r.job_id===payload.job_id))throw Error('duplicate_job');
   admitted=admitApplication(prior.map(r=>({user_id:payload.user_id,job_id:r.job_id,company:r.company,at:Date.parse(r.created_at),state:['driving','unknown_outcome'].includes(r.state)?'submitting':r.state})),app,now,{daily});
   if(!admitted.ok)throw Error(admitted.reason!);
   return await rpc('career_apply_enqueue',{p_payload:payload,p_hash:hash,p_approval:approvalHash,p_daily:daily});
  },
  async claim(now:number,limit=3){
   if(!Number.isFinite(now)||!Number.isInteger(limit)||limit<0||limit>6)throw Error('INVALID_APPLY_CLAIM');
   await rpc('career_apply_sweep',{p_now:new Date(now).toISOString()});
   const rows=await rpc('career_apply_claim',{p_now:new Date(now).toISOString(),p_limit:limit});
   if(!Array.isArray(rows))throw Error('APPLY_STORE_UNAVAILABLE');return rows;
  },
  async sweep(now:number){return Number(await rpc('career_apply_sweep',{p_now:new Date(now).toISOString()}));},
  async finish(job:{id:string;lease_token:string},state:ApplyOutcome,evidence:Record<string,unknown>){
   if(!outcomes.has(state))throw Error('INVALID_APPLY_OUTCOME');
   return await rpc('career_apply_finish',{p_id:job.id,p_lease:job.lease_token,p_state:state,p_evidence:evidence});
  },
 };
}
