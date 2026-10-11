import { AgentFinancialModel, AgentPostedFlow, AgentWorkflows, AgentClassifiedLedger } from "./agent_core.js";

function checked(result: any): any {
  if (result.error) throw new Error(result.error.message || "Financial data unavailable.");
  return result.data;
}
// Supabase defaults to 1,000 rows. Every read uses stable pagination; a cap
// fails explicitly instead of silently calculating from truncated history.
async function readAll(client: any, table: string, userId: string, order: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let offset=0; offset<100000; offset+=500) {
    let query = client.from(table).select("*").eq("user_id",userId);
    for (const field of order) query = query.order(field);
    const page = checked(await query.range(offset,offset+499)) || [];
    if (page.some((row:any)=>row.user_id!==userId)) throw new Error("Financial record ownership mismatch.");
    rows.push(...page);
    if (page.length<500) return rows;
  }
  throw new Error("Financial history exceeds this version's processing limit.");
}
export async function financialContext(userId: string, client: any): Promise<any> {
  const [accounts,preferences,obligations,syncs] = await Promise.all([
    readAll(client,"agent_financial_accounts",userId,["account_id"]),
    readAll(client,"agent_account_preferences",userId,["account_id"]),
    readAll(client,"agent_obligations",userId,["id"]),
    readAll(client,"agent_financial_syncs",userId,["provider"]),
  ]);
  const now = new Date().toISOString();
  return {ok:true,accounts,preferences,syncs,obligation_sources:obligations.map((o:any)=>({id:o.id,revision:o.revision,source_type:o.source_type,observed_at:o.observed_at,status:o.status})),summary:AgentFinancialModel.cashSummary(accounts,obligations,now,preferences)};
}
export async function classifiedLedgerReport(userId:string,client:any,from:string,to:string,accountId?:string):Promise<any> {
  if(typeof from!=="string"||typeof to!=="string"||AgentWorkflows.date(from)!==from||AgentWorkflows.date(to)!==to||from>to)throw new Error("A real inclusive date range is required.");
  // Linked transfer/refund evidence can sit outside the requested period or
  // account. Resolve it from owned retained history, not from a search page.
  const [rows,reviews]=await Promise.all([
    readAll(client,"agent_financial_transactions",userId,["account_id","provider_transaction_id"]),
    readAll(client,"agent_transaction_reviews",userId,["account_id","provider_transaction_id","review_revision"]),
  ]);
  const report=AgentClassifiedLedger.report(rows,reviews,from,to,accountId);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(AgentWorkflows.stableJson(report)));
  const reference_hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
  return {...report,reference_hash,categories:report.categories.slice(0,25),other_category_count:Math.max(0,report.categories.length-25),
    references:report.references.slice(0,20),references_are_sample:report.references.length>20};
}
export async function postedFlowReport(userId:string,client:any,from:string,to:string,accountId?:string):Promise<any> {
  if(typeof from!=="string" || typeof to!=="string" || AgentWorkflows.date(from)!==from || AgentWorkflows.date(to)!==to || from>to)throw new Error("A real inclusive date range is required.");
  const rows:any[]=[];
  for(let offset=0;offset<100000;offset+=500){
    let q=client.from("agent_financial_transactions").select("*").eq("user_id",userId).eq("is_pending",false)
      .eq("presence","observed").gte("posted_on",from).lte("posted_on",to);
    if(accountId)q=q.eq("account_id",accountId);
    const page=checked(await q.order("posted_on").order("account_id").order("provider_transaction_id").range(offset,offset+499))||[];
    if(page.some((r:any)=>r.user_id!==userId))throw new Error("Financial record ownership mismatch.");
    rows.push(...page);
    if(page.length<500) {
      const calculated=AgentPostedFlow.report(rows,from,to,accountId);
      // Query exclusions are not counts. A posted-only read cannot prove
      // that this owner has zero pending or unavailable transactions.
      const report={...calculated,excluded:{...calculated.excluded,pending:null,superseded:null,unavailable:null},
        excluded_count_scope:"Only provider-labeled transfers and unsupported currencies among the queried posted records are counted. Pending, superseded and unavailable records require separate reads."};
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(AgentWorkflows.stableJson(report)));
      const reference_hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
      return {...report,merchants:report.merchants.slice(0,10),other_merchant_count:Math.max(0,report.merchants.length-10),
        reference_hash,references:report.references.slice(0,20),references_are_sample:report.references.length>20};
    }
  }
  throw new Error("Financial history exceeds this version's processing limit.");
}
export async function syncFinancialEvidence(userId: string, userClient: any, admin: any): Promise<any> {
  const now = new Date(), fetchedAt = now.toISOString();
  const startDate = new Date(now.getTime()-90*86400000).toISOString().slice(0,10), endDate=fetchedAt.slice(0,10);
  // Only the authenticated proxy fetch supplies bank facts. Client body data
  // cannot inject balances, account IDs, payment authority or transactions.
  const response = await userClient.functions.invoke("simplefin-proxy",{body:{startDate,endDate}});
  const payload = checked(response);
  if (!payload || payload.error) throw new Error("Bank refresh failed. Reconnect or try again.");
  return await persistFinancialEvidence(userId,userClient,admin,payload,{fetched_at:fetchedAt,requested_start:startDate,requested_end:endDate});
}
export async function persistFinancialEvidence(userId: string, reader: any, admin: any, payload: any, metadata: any): Promise<any> {
  const fetchedAt=metadata.fetched_at, endDate=metadata.requested_end;
  const batch = AgentFinancialModel.normalizeSimplefin(payload,metadata);
  if (!batch.ok) throw new Error("Bank data failed validation: "+batch.errors.join(", "));
  const ingestion = checked(await admin.rpc("agent_financial_ingest",{p_user:userId,p_batch:batch}));
  if (ingestion.ignored_stale_batch) return {ok:true,...ingestion,...await financialContext(userId,reader)};
  // Derive from durable history; candidate writes lock the connection and
  // deduplicate without overwriting reviewed bills.
  const history = await readAll(reader,"agent_financial_transactions",userId,["account_id","provider_transaction_id"]);
  const candidates = AgentFinancialModel.inferObligations(history,endDate,fetchedAt);
  for (const candidate of candidates) {
    const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(candidate.source_key));
    candidate.source_key="bank-pattern:"+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
  }
  checked(await admin.rpc("agent_obligation_expire_candidates",{p_user:userId,p_today:endDate}));
  const discovery = checked(await admin.rpc("agent_financial_store_candidates",{p_user:userId,p_candidates:candidates}));
  return {ok:true,ingestion,discovery,errors:batch.errors,...await financialContext(userId,reader)};
}
