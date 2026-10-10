// Shared by web chat and the dedicated workflow endpoint. User identity comes
// from verified Auth, never body.user_id. Production adapters remain empty
// until their submit/reconcile contracts are implemented and verified.
import { AgentWorkflows, AgentFinancialModel } from "./agent_core.js";
import { financialContext, syncFinancialEvidence, classifiedLedgerReport } from "./financial_service.ts";
import { refreshBiller } from "./biller_service.ts";
import { paymentPlanningContext, reserveReviewedPayment } from "./payment_service.ts";
import { recoveryReport, recoveryCaseAction } from "./recovery_service.ts";

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function checked(result: any): any {
  if (result.error) throw new Error(result.error.message || "Workflow request failed.");
  return result.data;
}
async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(AgentWorkflows.stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2,"0")).join("");
}
export async function workflowAction(userId: string, userClient: any, admin: any, body: any): Promise<any> {
  const action = body.action;
  if(["recovery_case_open","recovery_case_update","recovery_case_list"].includes(action))return await recoveryCaseAction(userId,userClient,body);
  if(action === "recovery_scan") {
    const {action:_action,...args}=body;
    return {ok:true,report:await recoveryReport(userId,userClient,args)};
  }
  if(action === "ledger_link_candidates") {
    const result=checked(await userClient.rpc("agent_transaction_link_candidates",{p_review:body.review,p_offset:body.offset??0}));
    if(!result || !Array.isArray(result.rows) || result.rows.some((r:any)=>r.user_id!==userId || r.latest_review && r.latest_review.user_id!==userId))throw new Error("Financial record ownership mismatch.");
    return result;
  }
  if(action === "ledger_page" || action === "ledger_report") {
    if(typeof body.from!=="string" || typeof body.to!=="string" || AgentWorkflows.date(body.from)!==body.from || AgentWorkflows.date(body.to)!==body.to || body.from>body.to)throw new Error("Choose a real inclusive date range.");
    if(action === "ledger_report")return {ok:true,report:await classifiedLedgerReport(userId,userClient,body.from,body.to)};
    const offset=body.offset ?? 0;
    if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new Error("Invalid ledger page.");
    const result=checked(await userClient.rpc("agent_transaction_review_page",{p_from:body.from,p_to:body.to,p_offset:offset}));
    if(!result || !Array.isArray(result.rows) || result.rows.some((r:any)=>r.user_id!==userId || r.latest_review && r.latest_review.user_id!==userId))throw new Error("Financial record ownership mismatch.");
    return result;
  }
  if(action === "classify_transaction" || action === "classify_transaction_pair") {
    if(!uuid(body.request_id)||body.confirmed!==true)throw new Error("Review and explicitly confirm these transaction facts first.");
    // The Auth-bound RPC writes only interpretations; it cannot write bank
    // facts, approve a payment or choose another owner.
    return {ok:true,review:checked(await userClient.rpc(action === "classify_transaction_pair" ? "agent_transaction_review_pair" : "agent_transaction_review",{p_request:body.request_id,p_review:body.review}))};
  }
  if (action === "begin_message_link") return checked(await userClient.rpc("agent_message_begin_link"));
  if (action === "revoke_message_channel") {
    if (!uuid(body.channel_id)) throw new Error("Choose a messaging connection.");
    return checked(await userClient.rpc("agent_message_revoke",{p_channel:body.channel_id}));
  }
  if (action === "message_channels") return {ok:true,channels:checked(await userClient.from("agent_message_channels").select("id,provider,account_key,contact,status,verified_at,revoked_at").eq("user_id",userId).order("created_at").limit(50)) || []};
  if (action === "refresh_biller" || action === "revoke_biller") {
    if (!uuid(body.connection_id)) throw new Error("Choose a specific biller connection.");
    if (action === "revoke_biller") return checked(await userClient.rpc("agent_biller_revoke",{p_connection:body.connection_id}));
    return await refreshBiller(userId,userClient,admin,body.connection_id);
  }
  if (action === "dismiss_candidate") {
    if (!uuid(body.obligation_id)) throw new Error("Choose a possible bill first.");
    return {ok:true,obligation:checked(await userClient.rpc("agent_obligation_dismiss_candidate",{p_id:body.obligation_id}))};
  }
  if (action === "sync_finances") return await syncFinancialEvidence(userId,userClient,admin);
  if (action === "financial_context") return await financialContext(userId,userClient);
  if (action === "account_preferences") {
    if (typeof body.account_id !== "string" || !AgentFinancialModel.kinds.includes(body.account_kind)) throw new Error("Choose an account and its type.");
    checked(await userClient.from("agent_financial_accounts").select("account_id").eq("user_id",userId).eq("account_id",body.account_id).single());
    checked(await admin.from("agent_account_preferences").upsert({user_id:userId,account_id:body.account_id,account_kind:body.account_kind,updated_at:new Date().toISOString()},{onConflict:"user_id,account_id"}));
    return await financialContext(userId,userClient);
  }
  if (action === "confirm_candidate") {
    if (!uuid(body.obligation_id) || body.confirmed !== true) throw new Error("Explicitly confirm the current unpaid bill first.");
    const normalized = AgentWorkflows.normalize({...body.obligation,status:"verified",source_type:"user"});
    if (!normalized.ok) throw new Error(normalized.errors.join(", "));
    return {ok:true,obligation:checked(await userClient.rpc("agent_obligation_confirm_candidate",{
      p_id:body.obligation_id,p_fields:{...normalized.obligation,confirmed:true},
    }))};
  }
  if (action === "list") {
    checked(await admin.rpc("agent_obligation_expire_candidates",{p_user:userId,p_today:new Date().toISOString().slice(0,10)}));
    const offset = Number.isSafeInteger(body.offset) && body.offset >= 0 && body.offset <= 100000 ? body.offset : 0;
    const rows = checked(await userClient.from("agent_obligations").select("*").eq("user_id",userId)
      .neq("status","invalid").order("due_on",{ascending:true,nullsFirst:false}).order("id").range(offset,offset+49));
    if (rows && (!Array.isArray(rows) || rows.some((row:any)=>row.user_id!==userId))) throw new Error("Bill ownership mismatch.");
    return { ok:true, obligations:rows || [], next_offset:rows && rows.length===50 ? offset+50 : null };
  }
  if (action === "edit") {
    if (!uuid(body.obligation_id) || !uuid(body.request_id) || body.confirmed!==true ||
        !Number.isSafeInteger(body.expected_revision) || body.expected_revision<1 || body.expected_revision>2147483646)
      throw new Error("Explicitly review the current bill version before editing.");
    const n=AgentWorkflows.normalize({...body.obligation,status:"verified",source_type:"user"});
    if(!n.ok || n.obligation.amount_due_cents===null || !n.obligation.due_on) throw new Error("Please review current bill facts: "+n.errors.join(", "));
    const fields=Object.fromEntries((["creditor","kind","direction","currency","amount_due_cents","due_on","autopay"] as const).map(key=>[key,n.obligation[key]]));
    const result=checked(await userClient.rpc("agent_obligation_edit",{p_request:body.request_id,p_obligation:body.obligation_id,
      p_expected_revision:body.expected_revision,p_fields:fields}));
    if(!result?.ok || result.obligation?.user_id!==userId || result.obligation.id!==body.obligation_id ||
      result.obligation.source_type!=="user")throw new Error("Bill edit ownership mismatch.");
    return result;
  }
  if (action === "save") {
    const raw = body.obligation || {};
    if (raw.id) throw new Error("Use versioned bill editing to change a saved bill.");
    // Client assertions are user-supplied facts, never a forged provider sync.
    const normalized = AgentWorkflows.normalize({ ...raw, status: body.confirmed === true ? "verified" : "asserted",
      source_type:"user", observed_at:new Date().toISOString(), evidence:{ user_confirmed:body.confirmed === true } });
    if (!normalized.ok) throw new Error(normalized.errors.join(", "));
    const n = normalized.obligation;
    const { id, revision: _revision, ...fields } = n;
    let row;
    {
      // Unique entry key makes retried requests idempotent. Clients cannot
      // overwrite provider-owned records by choosing a matching source key.
      const entry = uuid(body.entry_id) ? body.entry_id : crypto.randomUUID();
      const sourceKey = "user:" + entry;
      row = checked(await admin.from("agent_obligations").upsert({...fields,user_id:userId,source_key:sourceKey},
        {onConflict:"user_id,source_key",ignoreDuplicates:true}).select("*").maybeSingle());
      if (!row) row = checked(await userClient.from("agent_obligations").select("*")
        .eq("user_id",userId).eq("source_key",sourceKey).single());
      if (!row || row.user_id!==userId || row.source_type!=="user" || row.source_key!==sourceKey) throw new Error("Bill ownership mismatch.");
      // A retry may have a newer observation timestamp, but must describe the
      // same financial facts. Returning an earlier entry for changed terms
      // would silently discard the user's corrected amount or payee.
      const materialKeys=Object.keys(fields).filter(key=>key!=="observed_at" && key!=="source_key");
      const material=(value:any)=>Object.fromEntries(materialKeys.map(key=>[key,value[key]]));
      if (AgentWorkflows.stableJson(material(row))!==AgentWorkflows.stableJson(material(fields))) throw new Error("This entry ID was already used for different bill details. Review the saved bill or create a new entry.");
    }
    return {ok:true,obligation:row};
  }
  if (action === "reserve_payment") {
    if (!uuid(body.task_id) || typeof body.snapshot_hash !== "string") throw new Error("Choose an approved payment proposal.");
    return await reserveReviewedPayment(userId,userClient,admin,body.task_id,body.snapshot_hash);
  }
  if (action === "approve") {
    if (!uuid(body.task_id) || typeof body.snapshot_hash !== "string") throw new Error("Review a specific payment proposal first.");
    return checked(await userClient.rpc("agent_workflow_approve",{p_task:body.task_id,p_snapshot_hash:body.snapshot_hash}));
  }
  if (!uuid(body.obligation_id)) throw new Error("Choose a specific bill first.");
  const obligation = checked(await userClient.from("agent_obligations").select("*")
    .eq("id",body.obligation_id).eq("user_id",userId).single());
  if (!obligation || obligation.user_id!==userId || obligation.id!==body.obligation_id) throw new Error("Bill ownership mismatch.");
  if (action === "plan") {
    checked(await admin.from("agent_settings").upsert({user_id:userId},{onConflict:"user_id",ignoreDuplicates:true}));
    const settings = checked(await userClient.from("agent_settings").select("stopped_at,buffer")
      .eq("user_id",userId).single());
    const attempts = checked(await userClient.from("agent_payment_attempts").select("obligation_id,status")
      .eq("user_id",userId).eq("obligation_id",obligation.id).order("created_at").order("id"));
    const execution = await paymentPlanningContext(userId,userClient,admin);
    const financial = execution.financial;
    // A read-only bank connection cannot establish payment authority.
    const plan = AgentWorkflows.plan(obligation,{
      now:new Date().toISOString(), stopped:settings.stopped_at !== null,
      adapters:obligation.source_type === "biller" ? execution.adapters : [], attempts, accounts:execution.accounts.concat(financial.accounts.map((a:any)=>({
        id:a.account_id,owned:a.status==="active",payment_enabled:false,currency:a.currency,
        available_cents:a.sync_error ? null : a.available_cents,observed_at:a.balance_as_of,
      }))),
      buffer_cents:AgentWorkflows.moneyToCents(settings.buffer),
      other_obligations_cents:financial.summary.known_due_cents == null ? null : Math.max(0,financial.summary.known_due_cents - (["verified","partially_paid"].includes(obligation.status) ? (obligation.amount_due_cents || 0) : 0)), cash_coverage_complete:execution.cash_coverage_complete,
    });
    const task = checked(await admin.rpc("agent_workflow_store_plan",{
      p_user:userId,p_obligation:obligation.id,p_revision:obligation.revision,
      p_plan:plan,p_hash:plan.proposal ? await hash(plan.proposal) : null,
    }));
    return {ok:true,obligation,task,assessment:plan,attempts};
  }
  throw new Error("Unsupported workflow action.");
}
