'use strict';
const {fail}=require('./store.cjs');
const METHODS=new Set(['career_task_pending_scoped_v1','career_task_claim_owned_v1','career_task_claim_readback_v1','career_task_pending_owned_v1','career_task_account_v1','career_task_claim_v1','career_task_begin_effect_v1','career_task_consume_effect_v1','career_task_settle_effect_v1','career_task_effect_status_v1','career_task_finish_v1','career_task_result_v1','career_task_pending_v1']);
function configuration(url,key){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||typeof key!=='string'||!key||key.length>8192)throw fail('RPC_CONFIGURATION_INVALID');
  return {url:u.origin,key};
}
async function requestRPC({url,key},name,args,{fetch:fetcher=fetch,timeoutMs=10000,maxBytes=2097152}={}){
  ({url,key}=configuration(url,key));
  if(!METHODS.has(name)||!args||typeof args!=='object'||Array.isArray(args))throw fail('RPC_METHOD_REFUSED');
  const body=JSON.stringify(args);if(Buffer.byteLength(body)>maxBytes)throw fail('RPC_REQUEST_TOO_LARGE');
  let response;
  try{response=await fetcher(url+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(timeoutMs),headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},body});}
  catch(_){throw fail('RPC_OUTCOME_UNCERTAIN');} // never automatically retry a write
  let data;
  try{
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw fail('RPC_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
    data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch(_){throw fail('RPC_OUTCOME_UNCERTAIN');}
  if(!response.ok){
    // Do not expose SQL error text, payloads, URLs, or credentials in logs.
    if(/revoked|stale|paused|binding|already consumed/i.test(data?.message||''))throw fail('TASK_AUTHORITY_REVOKED','task authority revoked');
    throw fail('RPC_OUTCOME_UNCERTAIN');
  }
  if(!data||typeof data!=='object'||Array.isArray(data))throw fail('RPC_RESPONSE_INVALID');
  return data;
}
module.exports={configuration,requestRPC,METHODS};
