import {AgentRecovery, AgentWorkflows} from "./agent_core.js";

const uuid=(v:any)=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const clean=(v:any,max=200)=>String(v||"").replace(/https?:\/\/\S+/g,"[unverified link]").replace(/[<>\x00-\x1f]/g," ").slice(0,max);
const key=(v:any)=>typeof v==="string"&&v.length>0&&v.length<=200&&!/[\x00-\x1f]/.test(v)&&v.trim()===v;
export function recoveryArguments(input:any):{account_id?:string;offset?:number;reference_hash?:string} {
  if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!["account_id","offset","reference_hash"].includes(k))||
    Object.hasOwn(input,"account_id")&&!key(input.account_id)||
    Object.hasOwn(input,"offset")&&(!Number.isSafeInteger(input.offset)||input.offset<0||input.offset>10000)||
    Object.hasOwn(input,"reference_hash")&&(typeof input.reference_hash!=="string"||!/^[a-f0-9]{64}$/.test(input.reference_hash)))
    throw new Error("Recovery arguments do not match the read-only contract.");
  return input;
}

// Auth-only snapshot RPC reads accounts/transactions/sync metadata in one
// statement. No admin fallback or client-submitted financial facts are accepted.
export async function recoveryReport(userId:string,reader:any,input:any={},now=new Date().toISOString()):Promise<any> {
  const args=recoveryArguments(input);
  if((args.offset??0)>0&&!args.reference_hash)throw new Error("Reload recovery before reading another page; current source proof is required.");
  if(!uuid(userId)||!Number.isFinite(Date.parse(now)))throw new Error("Verified identity and current server time are required.");
  const result=await reader.rpc("agent_recovery_snapshot",{p_account:args.account_id??null});
  if(result.error)throw new Error("Recovery history is unavailable. Refresh the connection or try again; no empty result was verified.");
  const snapshot=result.data;
  if(!snapshot||snapshot.owner_id!==userId||![snapshot.accounts,snapshot.transactions,snapshot.syncs].every(Array.isArray))throw new Error("Recovery snapshot ownership mismatch.");
  if(snapshot.transactions.length>10000||snapshot.accounts.length>1000)throw new Error("Recovery history exceeds this version's processing limit.");
  const accounts=new Map<string,any>();
  for(const a of snapshot.accounts) {
    if(a.user_id!==userId||!key(a.account_id)||accounts.has(a.account_id)||args.account_id&&a.account_id!==args.account_id)throw new Error("Recovery account ownership mismatch.");
    accounts.set(a.account_id,a);
  }
  if(args.account_id&&!accounts.has(args.account_id))throw new Error("Choose a connected or retained owned account.");
  for(const s of snapshot.syncs)if(s.user_id!==userId)throw new Error("Recovery sync ownership mismatch.");
  for(const r of snapshot.transactions) {
    if(r.user_id!==userId||!accounts.has(r.account_id)||!key(r.provider_transaction_id)||args.account_id&&r.account_id!==args.account_id)
      throw new Error("Recovery transaction ownership mismatch.");
    if(!/^[a-f0-9]{64}$/.test(r.fact_hash||"")||!Number.isSafeInteger(r.revision)||r.revision<1)throw new Error("Refresh retained transaction evidence before reviewing recovery.");
  }
  const today=now.slice(0,10);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(AgentWorkflows.stableJson({owner_id:userId,today,account_id:args.account_id??null,snapshot})));
  const reference_hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
  if(args.reference_hash&&args.reference_hash!==reference_hash)throw new Error("Recovery history changed. Reload before reading another page.");
  // Display text is sanitized, but matching identity must remain exact. A
  // truncated/rewritten merchant key can merge unrelated purchases.
  const report=AgentRecovery.scan(snapshot.transactions.map((r:any)=>({...r,merchant_raw:clean(r.merchant_raw||r.merchant_key),merchant_key:r.merchant_key})),{today,accountId:args.account_id});
  const offset=args.offset??0,page=report.candidates.slice(offset,offset+20);
  const dates=snapshot.transactions.filter((r:any)=>r.presence==="observed"&&AgentWorkflows.date(r.posted_on)).map((r:any)=>r.posted_on).sort();
  const observed=snapshot.transactions.map((r:any)=>r.fetched_at);
  const oldest_record_observation=observed.length&&observed.every((s:any)=>typeof s==="string"&&Number.isFinite(Date.parse(s)))?
    observed.slice().sort((a:string,b:string)=>Date.parse(a)-Date.parse(b))[0]:null;
  return {...report,owner_id:userId,candidates:page,total_candidates:report.candidates.length,
    next_offset:offset+20<report.candidates.length?offset+20:null,offset,coverage_complete:false,record_count:snapshot.transactions.length,
    history_from:dates[0]??null,history_to:dates.at(-1)??null,as_of:now,reference_hash,
    source:{type:"retained_bank_records",reference_hash,oldest_record_observation,observations_are_not_complete_history:true,
      accounts:[...accounts.values()].map(a=>({account_id:a.account_id,name:clean(a.name),institution:clean(a.institution),
        status:clean(a.status),provider:clean(a.provider),balance_as_of:a.balance_as_of??null,fetched_at:a.fetched_at??null})),
      syncs:snapshot.syncs.map((s:any)=>({provider:clean(s.provider),status:clean(s.status),fetched_at:s.fetched_at,
        requested_start:s.requested_start,requested_end:s.requested_end,has_errors:Number.isInteger(s.error_count)&&s.error_count>0}))},
    completion:"Read and preparation only. No request was sent. Suspected duplicate charges and credits require review; no verified recovery was established."};
}

const caseKinds=["bank_fee","duplicate_charge","stale_hold"],caseStates=["open","user_reported_submitted","needs_review","closed_user"];
function ownedCase(row:any,userId:string):any {
  if(!row||row.user_id!==userId||!uuid(row.id)||!caseKinds.includes(row.kind)||!caseStates.includes(row.status)||
    !Number.isSafeInteger(row.version)||row.version<1||row.currency!=="USD"||!Number.isSafeInteger(row.amount_cents)||row.amount_cents<=0||
    row.due_on!==null&&(typeof row.due_on!=="string"||AgentWorkflows.date(row.due_on)!==row.due_on)||
    row.recovered_cents!==null||row.recovery_verification!=="unavailable_user_report_only"||typeof row.source_stale!=="boolean"||!Array.isArray(row.source_snapshot)||!row.source_snapshot.length||
    row.source_snapshot.some((r:any)=>r.user_id!==userId||!key(r.account_id)||!key(r.provider_transaction_id)||!/^[a-f0-9]{64}$/.test(r.fact_hash||"")))
    throw new Error("Recovery case ownership or evidence mismatch.");
  return row;
}
export async function recoveryCaseAction(userId:string,reader:any,body:any):Promise<any> {
  if(!uuid(userId)||!body||typeof body!=="object"||Array.isArray(body))throw new Error("Verified recovery owner required.");
  let rpc:string,args:any;
  if(body.action==="recovery_case_list") {
    if(Object.keys(body).some(k=>!["action","offset"].includes(k))||Object.hasOwn(body,"offset")&&(!Number.isSafeInteger(body.offset)||body.offset<0||body.offset>100000))throw new Error("Choose a valid recovery case page.");
    rpc="agent_recovery_case_page";args={p_offset:body.offset??0};
  }else if(body.action==="recovery_case_open") {
    if(Object.keys(body).some(k=>!["action","request_id","kind","evidence","due_on","confirmed"].includes(k))||!uuid(body.request_id)||body.confirmed!==true||!caseKinds.includes(body.kind)||
      !Array.isArray(body.evidence)||body.evidence.length!==(body.kind==="duplicate_charge"?2:1)||
      body.evidence.some((r:any)=>!r||typeof r!=="object"||Array.isArray(r)||Object.keys(r).length!==3||Object.keys(r).some(k=>!["account_id","transaction_id","fact_hash"].includes(k))||!key(r.account_id)||!key(r.transaction_id)||!/^[a-f0-9]{64}$/.test(r.fact_hash||""))||
      new Set(body.evidence.map((r:any)=>JSON.stringify([r.account_id,r.transaction_id]))).size!==body.evidence.length||
      body.due_on!=null&&(typeof body.due_on!=="string"||AgentWorkflows.date(body.due_on)!==body.due_on))throw new Error("Review the exact candidate evidence before saving a recovery case.");
    rpc="agent_recovery_case_open";args={p_request:body.request_id,p_kind:body.kind,p_evidence:body.evidence,p_due_on:body.due_on??null};
  }else if(body.action==="recovery_case_update") {
    if(Object.keys(body).some(k=>!["action","request_id","case_id","expected_version","status","confirmed"].includes(k))||!uuid(body.request_id)||!uuid(body.case_id)||body.confirmed!==true||
      !Number.isSafeInteger(body.expected_version)||body.expected_version<1||body.expected_version>2147483646||!["open","user_reported_submitted","closed_user"].includes(body.status))
      throw new Error("Review the current case version and explicitly confirm your reported status.");
    rpc="agent_recovery_case_transition";args={p_request:body.request_id,p_case:body.case_id,p_expected_version:body.expected_version,p_status:body.status,p_confirmed:true};
  }else throw new Error("Unsupported recovery case action.");
  const result=await reader.rpc(rpc,args);
  if(result.error)throw new Error("The recovery case could not be saved or read. Check current evidence and retry the unchanged request if its result is unknown.");
  const data=result.data;
  if(body.action==="recovery_case_list") {
    if(!data||data.owner_id!==userId||data.recovery_verification!=="unavailable_user_report_only"||data.verified_recovered_cents!==null||!Array.isArray(data.cases)||data.cases.length>20||!(data.next_offset===null||Number.isSafeInteger(data.next_offset)&&data.next_offset>(body.offset??0)&&data.next_offset<=100000))throw new Error("Recovery case page is incomplete.");
    data.cases.forEach((row:any)=>ownedCase(row,userId));
    return {ok:true,...data};
  }
  const row=ownedCase(data?.case,userId);
  if(body.action==="recovery_case_update"&&row.id!==body.case_id)throw new Error("Recovery case identity mismatch.");
  if(body.action==="recovery_case_update"&&(row.status!==body.status||row.version!==body.expected_version+1))throw new Error("Recovery case status or version mismatch.");
  if(body.action==="recovery_case_open") {
    const refs=(rows:any[])=>AgentWorkflows.stableJson(rows.map(r=>[r.account_id,r.transaction_id??r.provider_transaction_id]).sort((a,b)=>AgentWorkflows.stableJson(a).localeCompare(AgentWorkflows.stableJson(b))));
    if(row.kind!==body.kind||refs(row.source_snapshot)!==refs(body.evidence))throw new Error("Recovery case evidence identity mismatch.");
  }
  if(typeof data.replay!=="boolean"||typeof data.superseded!=="boolean"||!Number.isSafeInteger(data.current_version)||data.current_version<row.version||data.superseded!==(data.current_version>row.version))throw new Error("Recovery case retry receipt is incomplete.");
  return {ok:true,...data,completion:"Local case tracking only. No request was sent or refund verified."};
}
