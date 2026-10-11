import {financialContext} from "./financial_service.ts";

export interface PaymentAdapter {
  id: string;
  verified: boolean;
  // A lookup must use the original idempotency key even if submit timed out
  // before returning a provider payment ID. Not found does not mean retry.
  lookup(attempt: any, context: any): Promise<any | null>;
  submit(attempt: any, context: any): Promise<any>;
}
export const EXECUTION_ADAPTERS: PaymentAdapter[] = [];
async function providerResult<T>(operation:Promise<T>):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Provider result timed out; reconcile original attempt.")),5000);})]);}
  finally{if(timer!==undefined)clearTimeout(timer);}
}
function checked(result: any): any {
  if (result.error) throw new Error(result.error.message || "Payment service unavailable.");
  return result.data;
}
export async function paymentPlanningContext(userId: string, reader: any, admin: any, registry: PaymentAdapter[]=EXECUTION_ADAPTERS): Promise<any> {
  const financial=await financialContext(userId,reader);
  const registered=registry.filter(a=>a.verified).map(a=>a.id);
  if (!registered.length) return {financial,adapters:[],accounts:[],cash_coverage_complete:false};
  const [definitions,funding,coverage]=await Promise.all([
    admin.from("agent_payment_adapters").select("*").in("id",registered).eq("verified",true),
    reader.from("agent_payment_funding_accounts").select("*").eq("user_id",userId),
    reader.from("agent_payment_coverage").select("*").eq("user_id",userId).maybeSingle(),
  ]);
  const now=Date.now(), c=checked(coverage);
  const adapters=(checked(definitions) || []).map((a:any)=>({...a,actions:["pay_obligation"]}));
  const accounts=(checked(funding) || []).map((a:any)=>({...a,owned:a.user_id===userId && a.status==="active",
    payment_enabled:a.verified===true && adapters.some((d:any)=>d.funding_providers.includes(a.provider_key)),
  }));
  const stamp=Date.parse(c?.observed_at || "");
  return {financial,adapters,accounts,cash_coverage_complete:c?.complete===true && Number.isFinite(stamp) && stamp<=now && now-stamp<=900000 && financial.summary.unverified_obligations===0};
}
export async function reserveReviewedPayment(userId: string, reader: any, admin: any, taskId: string, snapshotHash: string): Promise<any> {
  const task=checked(await reader.from("agent_workflow_tasks").select("*").eq("id",taskId).eq("user_id",userId).single());
  if (task.user_id!==userId || task.state!=="authorized" || task.snapshot_hash!==snapshotHash) throw new Error("Approve this exact payment proposal first.");
  if (!EXECUTION_ADAPTERS.some(a=>a.id===task.approved_snapshot?.adapter_id && a.verified)) return {ok:true,state:"needs_connection",message:"No verified execution adapter is available."};
  const attempt=checked(await admin.rpc("agent_payment_reserve",{p_task:task.id,p_hash:snapshotHash}));
  return {...await runPaymentAttempt(admin,attempt.id),attempt_id:attempt.id};
}
export async function runPaymentAttempt(admin: any, attemptId: string, adapters: PaymentAdapter[]=EXECUTION_ADAPTERS): Promise<any> {
  const existing=checked(await admin.from("agent_payment_attempts").select("*").eq("id",attemptId).single());
  if (["applied","failed","returned","cancelled"].includes(existing.status)) return {ok:true,state:existing.status};
  const adapter=adapters.find(a=>a.id===existing.adapter_id && a.verified);
  if (!adapter) return {ok:true,state:"needs_connection",message:"No verified execution adapter is available."};
  const attempt=checked(await admin.rpc("agent_payment_claim",{p_attempt:attemptId,p_seconds:45}));
  if (!attempt) return {ok:true,state:"busy_or_terminal"};
  // Recovery needs the original approved recipient/allocation even when the
  // bill was corrected or the user stopped the agent after submission.
  const task=checked(await admin.from("agent_workflow_tasks").select("*").eq("id",attempt.task_id).eq("user_id",attempt.user_id).single());
  let context:any={task};
  let event:any;
  let submittedAttempt=attempt;
  if (attempt.status==="reserved") {
    try {
      const begun=checked(await admin.rpc("agent_payment_begin_submission",{p_attempt:attempt.id,p_lease:attempt.lease_token}));
      context=begun.context; submittedAttempt=begun.attempt;
    } catch {
      let cancelled:any=null;
      try {cancelled=checked(await admin.rpc("agent_payment_cancel_reserved",{p_attempt:attempt.id,p_lease:attempt.lease_token}));} catch { /* No confirmed cancellation is not proof of no submission. */ }
      if(cancelled?.status==="cancelled")return {ok:false,state:"blocked",message:"Payment preflight changed. The reserved attempt was cancelled before submission. Review a fresh proposal."};
      try {checked(await admin.rpc("agent_payment_uncertain",{p_attempt:attempt.id,p_lease:attempt.lease_token}));} catch { /* Durable submitted marker remains recoverable. */ }
      return {ok:false,state:"unknown",message:"Submission preparation could not be confirmed. The original attempt needs reconciliation; do not start another payment."};
    }
  }
  try {
    if (attempt.status==="reserved") {
      event=await providerResult(adapter.submit(submittedAttempt,context));
    } else {
      // No path from uncertain/submitted/processing back to submit.
      event=await providerResult(adapter.lookup(attempt,context));
      if (!event) {
        checked(await admin.rpc("agent_payment_uncertain",{p_attempt:attempt.id,p_lease:attempt.lease_token}));
        return {ok:true,state:attempt.status === "settled" ? "settled" : "unknown",message:"Awaiting a verified creditor result for the original payment."};
      }
    }
  } catch {
    // This is conservative even when the provider rejected the request:
    // only a verified response can distinguish rejected from timed-out.
    checked(await admin.rpc("agent_payment_uncertain",{p_attempt:attempt.id,p_lease:attempt.lease_token}));
    return {ok:false,state:attempt.status === "settled" ? "settled" : "unknown",message:"No verified new payment result. The original attempt needs reconciliation."};
  }
  // A storage failure after a provider success must propagate. The existing
  // submitted marker forces the next run to lookup rather than send again.
  const result=checked(await admin.rpc("agent_payment_record_event",{p_attempt:attempt.id,p_adapter:adapter.id,p_event:event}));
  return {ok:true,state:result.attempt.status,result};
}

// Separate quotas: a repeated reconciliation result cannot consume reservation
// capacity. Reserve first, then look up due attempts using their original key.
export async function runPaymentQueue(admin:any,limit=5,adapters:PaymentAdapter[]=EXECUTION_ADAPTERS):Promise<any> {
  const verified=adapters.filter(a=>a.verified);
  if(!verified.length)return {ok:true,state:"needs_connection",registered_adapters:0,processed:0,results:[]};
  if(!Number.isSafeInteger(limit)||limit<1||limit>10)throw Error("Invalid payment queue limit.");
  const ids=verified.map(a=>a.id),results:any[]=[],seen=new Set<string>();
  const tasks=checked(await admin.rpc("agent_payment_due_tasks",{p_adapters:ids,p_limit:limit})) || [];
  for(const task of tasks){
    try {
      const attempt=checked(await admin.rpc("agent_payment_reserve",{p_task:task.id,p_hash:task.snapshot_hash}));
      seen.add(attempt.id);results.push({task_id:task.id,attempt_id:attempt.id,...await runPaymentAttempt(admin,attempt.id,verified)});
    }catch{results.push({task_id:task.id,ok:false,state:"reservation_or_result_unconfirmed",message:"Check the original task and attempt before retrying."});}
  }
  const attempts=checked(await admin.rpc("agent_payment_due_attempts",{p_adapters:ids,p_limit:limit})) || [];
  for(const attempt of attempts){
    if(seen.has(attempt.id))continue;
    try{results.push({attempt_id:attempt.id,...await runPaymentAttempt(admin,attempt.id,verified)});}
    catch{results.push({attempt_id:attempt.id,ok:false,state:"unknown",message:"The original attempt needs reconciliation."});}
  }
  return {ok:true,processed:results.length,results};
}
