export class ModelBudgetError extends Error {
  constructor(message:string,readonly code:"quota_unavailable"|"monthly_limit"|"already_reserved"="quota_unavailable"){super(message);}
}
export async function reserveModelCall(admin:any,userId:string,threadId:string,requestId:string,step:number,model:string):Promise<string> {
  const result=await admin.rpc("agent_model_call_reserve",{p_user:userId,p_thread:threadId,p_request:requestId,p_step:step,p_model:model});
  if(result.error)throw new ModelBudgetError("Model budget could not be verified.");
  if(!result.data?.ok || !result.data.call_id) {
    if(result.data?.state==="monthly_limit")throw new ModelBudgetError("The monthly AI limit has been reached.","monthly_limit");
    if(result.data?.state==="already_reserved")throw new ModelBudgetError("This model call was already reserved; its result needs review.","already_reserved");
    throw new ModelBudgetError("Model budget could not be verified.");
  }
  return result.data.call_id;
}
export async function recordModelUsage(admin:any,callId:string,usage:any):Promise<void> {
  const values={input_tokens:usage?.input_tokens,output_tokens:usage?.output_tokens,
    cache_read_tokens:usage?.cache_read_input_tokens===undefined?0:usage.cache_read_input_tokens,
    cache_write_tokens:usage?.cache_creation_input_tokens===undefined?0:usage.cache_creation_input_tokens};
  if(Object.values(values).some(v=>!Number.isSafeInteger(v)||v<0||v>10000000))throw new Error("Model token usage is unknown or invalid.");
  const result=await admin.rpc("agent_model_call_record",{p_call:callId,p_usage:values});
  if(result.error)throw new Error("Model usage receipt could not be saved.");
}
export function anthropicPlannerModel(admin:any,userId:string,threadId:string,model:string,apiKey:string,request:typeof fetch=fetch):any {
  const requestId=crypto.randomUUID(),deadline=Date.now()+70000;
  return {async complete(payload:any,step:number){
    if(!apiKey)throw new Error("Financial model is not configured.");
    if(Date.now()>deadline-5000)throw new Error("Financial model deadline reached.");
    const callId=await reserveModelCall(admin,userId,threadId,requestId,step,model);
    const res=await request("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({...payload,model,max_tokens:1200}),signal:AbortSignal.timeout(Math.min(18000,deadline-Date.now()))});
    if(!res.ok)throw new Error("Financial model unavailable.");
    const raw=await res.text();if(raw.length>60000)throw new Error("Financial model response is too large.");
    const response=JSON.parse(raw);
    await recordModelUsage(admin,callId,response.usage);
    return response;
  }};
}
