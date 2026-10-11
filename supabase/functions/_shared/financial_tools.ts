import {AgentWorkflows} from "./agent_core.js";
import {financialContext,postedFlowReport,classifiedLedgerReport} from "./financial_service.ts";
import {workflowAction} from "./workflow_service.ts";
import {recoveryReport,recoveryCaseAction} from "./recovery_service.ts";

type Field={type:string;minLength?:number;maxLength?:number;minimum?:number;maximum?:number;format?:string;enum?:string[];items?:Field;maxItems?:number};
const text=(maxLength=160):Field=>({type:"string",minLength:1,maxLength});
const id:Field={...text(36),format:"uuid"},offset:Field={type:"integer",minimum:0,maximum:100000};
const date:Field={...text(10),format:"date"};
const questions:Record<string,string>={
  which_bill:"Which bill do you want to review?",current_amount:"What is the current unpaid amount?",due_date:"When is the bill due?",
  connect_biller:"Connect the biller so I can verify the current unpaid amount and payment options.",
  connect_bank:"Connect your bank and refresh it so I can see current cash evidence.",
  classify_cash:"Which linked accounts contain spendable cash? Classify them in Money owed.",
  review_approval:"Review the exact amount, creditor, allocation, funding account, fees and expiry before approving in Money owed.",
  time_period:"Which date range should I use, and what is your local timezone for relative dates?",
  unsupported:"This capability still needs its verified connector or financial engine. It is not available to execute yet.",
};
function definition(name:string,description:string,properties:Record<string,Field>,required:string[]=[]){
  return {name,description,input_schema:{type:"object",additionalProperties:false,properties,required}};
}
export const FINANCIAL_TOOLS=[
  definition("get_cash_position","Read classified, fresh linked USD cash and recorded bill totals. Coverage is incomplete; this never authorizes spending.",{}),
  definition("find_obligations","Find recorded bills by creditor. Returns exact identities, source age and whether amounts are authoritative, user-confirmed or inferred. Paginated; never assumes this is every debt.",{creditor:text(),offset}),
  definition("get_obligation","Read one owned bill and its source age. Required before preparing a payment proposal.",{obligation_id:id},["obligation_id"]),
  definition("search_transactions","Search retained posted transactions in an inclusive date range. Pending and superseded records are excluded. Transfers remain explicitly labeled; bank debits do not prove bill application.",{date_from:date,date_to:date,account_id:text(200),merchant:text(),offset},["date_from","date_to"]),
  definition("get_pending_transactions","Read pending records separately. Missing pending records are unknown, not cancellations. Their posted date may be unknown.",{account_id:text(200),offset}),
  definition("get_posted_flow_report","Aggregate every retained observed posted transaction in an inclusive date range, beyond a 50-row search page. Exact USD bank debit/credit totals and top merchants only; credits are not income and debits are not spending until classified. Explicit provider transfers are excluded. Never claims comprehensive account/history coverage.",{date_from:date,date_to:date,account_id:text(200)},["date_from","date_to"]),
  definition("get_spending_income_report","Calculate spending and income from owned current transaction reviews. Resolves matched transfers, card payments and linked refunds across retained history. Unknown or changed classifications keep totals unknown; known subtotals remain visible. User reviews are assertions, not verified payroll or complete household coverage.",{date_from:date,date_to:date,account_id:text(200)},["date_from","date_to"]),
  definition("get_recovery_report","Find possible fee refunds, duplicate charges and older pending holds in owned retained history. Findings and matching credits are hypotheses, not fraud, entitlement or verified recovery. Draft preparation only; nothing is sent. Later pages require the original reference_hash.",{account_id:text(200),offset,reference_hash:text(64)}),
  definition("get_recovery_cases","Read saved owned recovery cases and user-reported statuses. Stale evidence remains labeled. A user-reported request or closed case is not an external submission or recovered funds. This tool cannot create or update a case.",{offset}),
  definition("preview_payment","Prepare a server-reviewed proposal for a bill already read this turn. Does not approve, reserve or submit money. Requires exact source/funding/fees/coverage and freshness.",{obligation_id:id},["obligation_id"]),
  definition("get_payment_history","Read owned payment attempts for a known bill. Submitted or bank-settled is not creditor-applied. Paginated; no provider calls or new submissions.",{obligation_id:id,offset},["obligation_id"]),
  definition("finish_financial_reply","Finish by selecting evidence IDs returned this turn, in the order most useful to the user, and optional missing-information questions. The server renders financial amounts, outcomes and approval terms. Do not invent IDs or put arbitrary prose/amounts in the arguments.",{
    evidence_ids:{type:"array",items:{...text(12)},maxItems:8},questions:{type:"array",items:{type:"string",enum:Object.keys(questions)},maxItems:3},
  },["evidence_ids"]),
];
function field(value:any,schema:Field):boolean {
  if(schema.type==="string") {
    if(typeof value!=="string" || value.length<(schema.minLength||0) || value.length>(schema.maxLength||100000) || /[\x00-\x1f]/.test(value))return false;
    if(schema.enum && !schema.enum.includes(value))return false;
    if(schema.format==="uuid" && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))return false;
    if(schema.format==="date" && AgentWorkflows.date(value)!==value)return false;
    return true;
  }
  if(schema.type==="integer")return Number.isSafeInteger(value) && value>=(schema.minimum||0) && value<=(schema.maximum??Number.MAX_SAFE_INTEGER);
  if(schema.type==="array")return Array.isArray(value) && value.length<=(schema.maxItems||0) && value.every(v=>field(v,schema.items!));
  return false;
}
export function financialArguments(name:string,input:any):any {
  const tool=FINANCIAL_TOOLS.find(t=>t.name===name);
  if(!tool)throw new Error("This tool is not registered. No action was performed.");
  const schema=tool.input_schema;
  if(!input || typeof input!=="object" || Array.isArray(input) || Object.keys(input).some(k=>!Object.hasOwn(schema.properties,k)) || schema.required.some(k=>!Object.hasOwn(input,k))
    || Object.entries(input).some(([k,v])=>!field(v,schema.properties[k])))throw new Error("Tool arguments do not match its strict contract.");
  if(["search_transactions","get_posted_flow_report","get_spending_income_report"].includes(name) && input.date_from>input.date_to)throw new Error("The transaction date range is reversed.");
  return input;
}
export function moneyText(cents:any,currency="USD"):string {
  if(currency!=="USD" || !Number.isSafeInteger(cents))return "amount unknown";
  const n=BigInt(cents),a=n<0n?-n:n;
  return (n<0n?"-":"")+"$"+(a/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,",")+"."+(a%100n).toString().padStart(2,"0");
}
function label(value:any):string {
  return String(value||"Unknown").replace(/https?:\/\/\S+/g,"[unverified link]").replace(/<!--[\s\S]*?-->/g,"")
    .replace(/[<>\x00-\x1f]/g," ").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").slice(0,180);
}
function checked(result:any):any{if(result.error)throw new Error("The linked financial record could not be read. Do not treat this as zero or empty.");return result.data;}
const escapeLike=(value:string)=>value.replace(/[\\%_]/g,"\\$&");
type Evidence={id:string;text:string;source:{type:string;reference:string;observed_at:string|null};data:any};
export class FinancialToolSession {
  evidence=new Map<string,Evidence>(); bills=new Map<string,any>();private proposals=new Map<string,any>();
  constructor(private userId:string,private reader:any,private admin:any,private now=()=>new Date().toISOString(),private prepare=workflowAction){}
  private add(text:string,type:string,reference:string,observed_at:string|null,data:any):Evidence {
    const fact={id:"F"+(this.evidence.size+1),text,source:{type,reference,observed_at},data};this.evidence.set(fact.id,fact);return fact;
  }
  private owner(row:any):any {if(!row || row.user_id!==this.userId)throw new Error("Financial record missing or ownership mismatch.");return row;}
  private bill(row:any):Evidence {
    this.owner(row);this.bills.set(row.id,row);
    const age=Date.parse(this.now())-Date.parse(row.observed_at||"");
    const stale=!Number.isFinite(age)||age<0||age>48*3600000;
    const truth=row.source_type==="biller" ? "biller record" : row.source_type==="user" ? "user-entered record" : "inferred or extracted record";
    const data={id:row.id,creditor:label(row.creditor),currency:row.currency,amount_due_cents:row.amount_due_cents,due_on:row.due_on,
      status:row.status,autopay:row.autopay,source_type:row.source_type,observed_at:row.observed_at,stale,revision:row.revision};
    return this.add(`${data.creditor}: recorded ${moneyText(data.amount_due_cents,data.currency)}, ${data.due_on?"due "+data.due_on:"due date unknown"}; status ${label(data.status)}, autopay ${label(data.autopay)}. Source: ${truth}${stale?"; refresh required":""}.`,truth,row.id,row.observed_at||null,data);
  }
  private async page(query:any,start:number):Promise<{rows:any[];next_offset:number|null}> {
    const rows=checked(await query.range(start,start+50))||[];rows.forEach((r:any)=>this.owner(r));
    return {rows:rows.slice(0,50),next_offset:rows.length>50?start+50:null};
  }
  async run(name:string,input:any):Promise<any> {
    const args=financialArguments(name,input),start=args.offset||0;
    if(name==="finish_financial_reply") {
      if(new Set(args.evidence_ids).size!==args.evidence_ids.length || args.evidence_ids.some((id:string)=>!this.evidence.has(id)))throw new Error("Select only distinct evidence IDs returned this turn.");
      const facts=args.evidence_ids.map((id:string)=>this.evidence.get(id)!);
      const asks=[...new Set<string>(args.questions||[])].map(q=>questions[q]);
      if(!facts.length && !asks.length)throw new Error("A reply needs verified evidence or a missing-information question.");
      const reply=facts.map((f:Evidence)=>`${f.text} [${f.id}]`).concat(asks).join("\n\n");
      const selected=facts.filter((f:Evidence)=>this.proposals.has(f.id));
      const proposal=selected.length===1?this.proposals.get(selected[0].id):null;
      return {done:true,reply,sources:facts.map((f:Evidence)=>({id:f.id,...f.source})),action:proposal?{type:"workflow",obligation_id:proposal.obligation.id,task_id:proposal.task.id}:null};
    }
    if(name==="get_cash_position") {
      const c=await financialContext(this.userId,this.reader);c.accounts.forEach((r:any)=>this.owner(r));
      const s=c.summary;
      const cash_sources=c.accounts.filter((a:any)=>s.cash_account_ids.includes(a.account_id)).map((a:any)=>({account_id:a.account_id,observed_at:a.balance_as_of}));
      const oldest=cash_sources.map((a:any)=>a.observed_at).sort()[0]||null;
      return {facts:[this.add(`Linked USD cash available: ${moneyText(s.available_cents)}${oldest?", oldest included bank observation "+oldest:"; no eligible cash observation"}. Recorded verified bill amounts: ${moneyText(s.known_due_cents)}; these amounts may need a biller refresh. ${s.unverified_obligations} recorded bills need verification. Coverage is incomplete; this is not spending authorization.`,"linked cash calculation","cash-summary",oldest,{...s,calculated_at:this.now(),cash_sources,obligation_sources:c.obligation_sources})]};
    }
    if(name==="get_posted_flow_report") {
      const r=await postedFlowReport(this.userId,this.reader,args.date_from,args.date_to,args.account_id);
      const top=r.merchants.slice(0,5).map((m:any)=>`${label(m.label)}: debits ${moneyText(m.recorded_debits_cents)}, credits ${moneyText(m.recorded_credits_cents)}`).join("; ");
      const text=r.record_count ? `${r.date_from} through ${r.date_to}: ${r.record_count} retained USD posted records. Recorded bank debits ${moneyText(r.recorded_debits_cents)}, credits ${moneyText(r.recorded_credits_cents)}, net flow ${moneyText(r.recorded_net_flow_cents)}. These are not verified spending or income totals. ${top?"Top merchants by recorded debits: "+top+". ":""}` : `${r.date_from} through ${r.date_to}: no eligible retained USD posted records. This does not establish zero spending or income. `;
      return {facts:[this.add(text+`${r.excluded.provider_labeled_transfers} provider-labeled transfers and ${r.excluded.unsupported_currency} unsupported-currency records excluded. Coverage is incomplete.`,"posted bank activity calculation","posted-flow:"+r.reference_hash,r.oldest_receipt_at,r)]};
    }
    if(name==="get_spending_income_report") {
      const r=await classifiedLedgerReport(this.userId,this.reader,args.date_from,args.date_to,args.account_id);
      const text=`${r.date_from} through ${r.date_to}: ${r.record_count} retained USD posted records. Spending ${moneyText(r.spending_cents)}, income ${moneyText(r.income_cents)}. Known user-classified expenses ${moneyText(r.known_expenses_cents)}, refunds ${moneyText(r.known_refunds_cents)}, income subtotal ${moneyText(r.known_income_cents)}. ${r.unclassified_records} records still need classification; ${r.invalidated_reviews} reviews need renewed evidence or linked-leg reconciliation. ${r.transfer_records} transfer records and ${r.credit_payment_records} card-payment records are excluded from spending/income. Loan proceeds ${moneyText(r.loan_proceeds_cents)} are not earned income. User classifications are assertions; account/history coverage is incomplete.`;
      return {facts:[this.add(text,"user-reviewed ledger calculation","classified-ledger:"+r.reference_hash,null,r)]};
    }
    if(name==="get_recovery_report") {
      const r=await recoveryReport(this.userId,this.reader,args,this.now());
      const text=`${r.total_candidates} recovery candidates in ${r.record_count} retained bank records; ${r.candidates.length} shown on this page. Candidate total ${moneyText(r.open_candidate_cents)} is not money owed or recovered and includes pending holds. No recovery has been verified by this scanner. ${r.excluded.unknown_hold_date||0} pending records have unknown dates; ${r.excluded.unsupported_currency} unsupported-currency and ${r.excluded.unavailable} unavailable records are excluded. Coverage is incomplete. No request was sent.`;
      const data={owner_id:r.owner_id,total_candidates:r.total_candidates,record_count:r.record_count,open_candidate_cents:r.open_candidate_cents,
        verified_recovered_cents:r.verified_recovered_cents,coverage_complete:false,excluded:r.excluded,source:r.source,
        candidates:r.candidates.map((c:any)=>({id:c.id,kind:c.kind,amount_cents:c.amount_cents,status:c.status,recovered_cents:null,
          evidence:c.evidence,possible_refund:c.possible_refund,refund_linkage_status:c.refund_linkage_status,
          caveat:c.caveat||"A label or matching credit does not prove money is owed."}))};
      return {facts:[this.add(text,"recovery candidates from retained bank records","recovery:"+r.reference_hash,r.source.oldest_record_observation,data)],
        next_offset:r.next_offset,reference_hash:r.reference_hash,coverage_complete:false};
    }
    if(name==="get_recovery_cases") {
      const page=await recoveryCaseAction(this.userId,this.reader,{action:"recovery_case_list",...args});
      if(!page.cases.length)return {facts:[this.add("No saved local recovery cases were returned on this page. This does not establish that no money is recoverable. No external request or refund was verified.","owned recovery case query","recovery-case-page:"+(args.offset??0),null,{offset:args.offset??0,empty_saved_cases:true,verified_recovered_cents:null})],next_offset:page.next_offset,verified_recovered_cents:null};
      return {facts:page.cases.map((c:any)=>this.add(`${label(c.kind.replaceAll("_"," "))} case: candidate ${moneyText(c.amount_cents)}, local status ${label(c.status.replaceAll("_"," "))}, version ${c.version}${c.due_on?", user-selected follow-up date "+c.due_on:"; no follow-up date recorded"}${c.source_stale?"; source bank facts changed and require review":"; retained source references still match"}. Recovered amount is unverified. A user-reported submission or closed case does not prove a request was sent, accepted or paid.`,"owned recovery case",c.id,c.updated_at??null,
        {id:c.id,kind:c.kind,status:c.status,version:c.version,amount_cents:c.amount_cents,currency:c.currency,due_on:c.due_on,source_stale:c.source_stale,recovered_cents:null,recovery_verification:c.recovery_verification,
          evidence:c.source_snapshot.map((r:any)=>({account_id:r.account_id,transaction_id:r.provider_transaction_id,fact_hash:r.fact_hash,posted_on:r.posted_on}))})),
        next_offset:page.next_offset,verified_recovered_cents:null,recovery_verification:"unavailable_user_report_only",empty_means:"No matching saved local cases; this does not establish no recoverable money."};
    }
    if(name==="find_obligations") {
      let q=this.reader.from("agent_obligations").select("*").eq("user_id",this.userId).neq("status","invalid");
      if(args.creditor)q=q.ilike("creditor","%"+escapeLike(args.creditor)+"%");
      const p=await this.page(q.order("due_on",{ascending:true,nullsFirst:false}).order("id"),start);
      return {facts:p.rows.map(r=>this.bill(r)),next_offset:p.next_offset,coverage_complete:false,empty_means:"No matching recorded bills; unconnected or unrecorded bills may be missing."};
    }
    if(name==="get_obligation") {
      const row=this.owner(checked(await this.reader.from("agent_obligations").select("*").eq("user_id",this.userId).eq("id",args.obligation_id).single()));
      return {facts:[this.bill(row)]};
    }
    if(name==="search_transactions" || name==="get_pending_transactions") {
      let q=this.reader.from("agent_financial_transactions").select("*").eq("user_id",this.userId).eq("is_pending",name==="get_pending_transactions").neq("presence","superseded");
      if(name==="search_transactions")q=q.eq("presence","observed").gte("posted_on",args.date_from).lte("posted_on",args.date_to);
      if(args.account_id)q=q.eq("account_id",args.account_id);
      if(args.merchant)q=q.ilike("merchant_raw","%"+escapeLike(args.merchant)+"%");
      const p=await this.page(q.order("posted_on",{ascending:false,nullsFirst:false}).order("account_id").order("provider_transaction_id"),start);
      return {facts:p.rows.map(r=>this.add(`${label(r.merchant_raw)}: ${moneyText(r.amount_cents,r.currency)}, ${r.is_pending?"pending; posting date unknown":"posted "+r.posted_on}${r.is_transfer?"; provider-labeled transfer":""}${r.presence==="not_seen"?"; no longer observed, outcome unknown":""}. This bank record does not prove a creditor applied a payment.`,"bank transaction",r.account_id+":"+r.provider_transaction_id,r.fetched_at,{account_id:r.account_id,provider_transaction_id:r.provider_transaction_id,amount_cents:r.amount_cents,currency:r.currency,posted_on:r.posted_on,is_pending:r.is_pending,is_transfer:r.is_transfer,presence:r.presence})),next_offset:p.next_offset,coverage_complete:false};
    }
    if(name==="preview_payment" || name==="get_payment_history") {
      if(!this.bills.has(args.obligation_id))throw new Error("Read this exact bill this turn before using it in a dependent tool.");
      if(name==="get_payment_history") {
        const p=await this.page(this.reader.from("agent_payment_attempts").select("*").eq("user_id",this.userId).eq("obligation_id",args.obligation_id).order("created_at").order("id"),start);
        return {facts:p.rows.map(r=>this.add(`Payment attempt: ${moneyText(r.amount_cents,r.currency)}, status ${label(r.status)}${r.status==="applied"?"; creditor application recorded":"; do not treat this as creditor application"}.`,"payment attempt",r.id,r.updated_at,{id:r.id,status:r.status,amount_cents:r.amount_cents,currency:r.currency,provider_payment_id:r.provider_payment_id||null})),next_offset:p.next_offset};
      }
      const result=await this.prepare(this.userId,this.reader,this.admin,{action:"plan",obligation_id:args.obligation_id});
      this.owner(result.obligation);this.owner(result.task);
      const p=result.assessment.proposal;
      const details=p ? ` Proposal: ${moneyText(p.amount_cents,p.currency)} to ${label(p.creditor)}, fee ${moneyText(p.fee_cents,p.currency)}, funding ${label(p.funding_account_id)}, allocation ${label(p.reference)}, expires ${p.expires_at}.` : "";
      const missing=result.assessment.missing||[];
      const fact=this.add(`Payment review for ${label(result.obligation.creditor)}: ${label(result.assessment.state)}; saved task state ${label(result.task.state)}. ${label(result.assessment.message)}${missing.length?" Needed: "+missing.map((x:string)=>label(x.replace(/_/g," "))).join(", ")+".":""}${details} No money was approved or submitted by this tool. Review the exact saved proposal before approval.`,"server payment assessment",result.task.id,this.now(),{obligation_id:result.obligation.id,task_id:result.task.id,state:result.assessment.state,task_state:result.task.state,missing,proposal:p||null});
      this.proposals.set(fact.id,result);
      return {facts:[fact]};
    }
    throw new Error("Unsupported financial tool.");
  }
  fallback():any {
    const facts=[...this.evidence.values()].slice(-5);
    return {reply:"I couldn’t complete the requested financial plan. These are the records I verified; no payment was approved or submitted by the planner."+(facts.length?"\n\n"+facts.map(f=>`${f.text} [${f.id}]`).join("\n\n"):" Check your financial connections or provide the missing bill details."),sources:facts.map(f=>({id:f.id,...f.source})),action:null};
  }
}
