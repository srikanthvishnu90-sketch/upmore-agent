import {financialArguments,FinancialToolSession,moneyText,FINANCIAL_TOOLS} from "../../supabase/functions/_shared/financial_tools.ts";
import {rejects,user,billId,secondBillId,bill,reader,fixture} from "./lib/financial_fixture.ts";
function assert(v:unknown,m="assertion failed"){if(!v)throw new Error(m);}
Deno.test("financial tools register only the explicit read/preparation allowlist",()=>{
 const allowed=["get_cash_position","find_obligations","get_obligation","search_transactions","get_pending_transactions","get_posted_flow_report","get_spending_income_report","get_recovery_report","get_recovery_cases","preview_payment","get_payment_history","finish_financial_reply"];
 assert(JSON.stringify(FINANCIAL_TOOLS.map(t=>t.name).sort())===JSON.stringify(allowed.sort()));
 assert(FINANCIAL_TOOLS.every(t=>t.input_schema.additionalProperties===false));
});
Deno.test("strict arguments reject injected ownership, malformed dates, offsets and tool names",async()=>{
 for(const [name,args]of [["get_cash_position",{user_id:user}],["get_obligation",{obligation_id:"guess"}],["search_transactions",{date_from:"2026-02-30",date_to:"2026-10-10"}],["find_obligations",{offset:-1}],["find_obligations",{offset:1.5}],["finish_financial_reply",{evidence_ids:[],questions:["pay_it"]}]])await rejects(()=>financialArguments(String(name),args),"strict contract");
 await rejects(()=>financialArguments("approve_payment",{}),"not registered");await rejects(()=>financialArguments("search_transactions",{date_from:"2026-10-11",date_to:"2026-10-10"}),"reversed");
});
Deno.test("financial rendering keeps exact cents, signs and unsupported money unknown",()=>{assert(moneyText(9007199254740991)==="$90,071,992,547,409.91");assert(moneyText(-1)==="-$0.01");assert(moneyText(null)==="amount unknown");assert(moneyText(10,"EUR")==="amount unknown");assert(moneyText(1.1)==="amount unknown");});
Deno.test("bill lookup is owner scoped and literal creditor wildcards cannot broaden a search",async()=>{
 const f=fixture({agent_obligations:[bill(),{...bill(),id:secondBillId,creditor:"Power_100%"},{...bill(),user_id:"other",id:"foreign"}]});
 const found=await f.session.run("find_obligations",{creditor:"_100%"});assert(found.facts.length===1&&found.facts[0].data.id===secondBillId);assert(f.r.reads[0].filters.some(([k,,v]:any)=>k==="user_id"&&v===user));
 await rejects(()=>f.session.run("get_obligation",{obligation_id:"00000000-0000-4000-8000-000000000099"}),"could not be read");
});
Deno.test("server-role ownership bypass cannot leak another owner's bill",async()=>{const r=reader({agent_obligations:[{...bill(),user_id:"other"}]},undefined,true);const s=new FinancialToolSession(user,r,{});await rejects(()=>s.run("get_obligation",{obligation_id:billId}),"ownership mismatch");assert(s.evidence.size===0);});
Deno.test("stale bill evidence stays stale and user assertions are not called biller records",async()=>{
 const b={...bill(),observed_at:"2026-01-01T00:00:00Z"};const f=fixture({agent_obligations:[b]});const r=await f.session.run("get_obligation",{obligation_id:billId});assert(r.facts[0].data.stale);assert(r.facts[0].source.observed_at===b.observed_at);assert(r.facts[0].text.includes("user-entered record; refresh required"));
});
Deno.test("bill pagination reads a probe row and never claims complete coverage",async()=>{
 const rows=Array.from({length:51},(_,i)=>({...bill(),id:"bill-"+String(i).padStart(3,"0")}));const f=fixture({agent_obligations:rows});const a=await f.session.run("find_obligations",{});const b=await f.session.run("find_obligations",{offset:a.next_offset});assert(a.facts.length===50&&a.next_offset===50&&a.coverage_complete===false);assert(b.facts.length===1&&b.next_offset===null);assert(f.r.reads[0].end===50);
});
Deno.test("posted searches separate pending, superseded and missing records; transfers remain labeled",async()=>{
 const t={user_id:user,account_id:"bank:a",provider_transaction_id:"posted",merchant_raw:"Coffee",amount_cents:-1001,currency:"USD",posted_on:"2026-10-08",is_pending:false,presence:"observed",is_transfer:true,fetched_at:"2026-10-09T00:00:00Z"};
 const f=fixture({agent_financial_transactions:[t,{...t,provider_transaction_id:"pending",is_pending:true},{...t,provider_transaction_id:"old",presence:"superseded"},{...t,provider_transaction_id:"gone",presence:"not_seen"},{...t,user_id:"other",provider_transaction_id:"foreign"},{...t,provider_transaction_id:"outside",posted_on:"2026-10-11"}]});
 const a=await f.session.run("search_transactions",{date_from:"2026-10-08",date_to:"2026-10-08"});assert(a.facts.length===1&&a.facts[0].text.includes("provider-labeled transfer"));assert(a.facts[0].text.includes("does not prove"));const p=await f.session.run("get_pending_transactions",{});assert(p.facts.length===1&&p.facts[0].text.includes("posting date unknown"));
});
Deno.test("disappeared pending charge is retained as unknown instead of cancelled",async()=>{const f=fixture({agent_financial_transactions:[{user_id:user,account_id:"bank",provider_transaction_id:"gone",merchant_raw:"Hotel",amount_cents:-5000,currency:"USD",is_pending:true,presence:"not_seen"}]});const r=await f.session.run("get_pending_transactions",{});assert(r.facts[0].text.includes("outcome unknown")&&!r.facts[0].text.includes("cancelled"));});
Deno.test("failed financial query does not become an empty success",async()=>{const f=fixture({},"agent_financial_transactions");await rejects(()=>f.session.run("get_pending_transactions",{}),"could not be read");assert(f.session.evidence.size===0);});
Deno.test("dependent payment tools require an exact bill read in this turn",async()=>{const f=fixture();await rejects(()=>f.session.run("preview_payment",{obligation_id:billId}),"Read this exact bill");await rejects(()=>f.session.run("get_payment_history",{obligation_id:billId}),"Read this exact bill");assert(f.calls.length===0);});
Deno.test("real workflow preflight gives a blocked review with no live adapter and never approves",async()=>{
 const f=fixture({agent_obligations:[bill()],agent_settings:[{user_id:user,stopped_at:null,buffer:100}]});await f.session.run("get_obligation",{obligation_id:billId});const r=await f.session.run("preview_payment",{obligation_id:billId});assert(r.facts[0].data.proposal===null);assert(r.facts[0].data.state!=="awaiting_approval");assert(f.calls.length===1&&f.calls[0].name==="agent_workflow_store_plan");const done=await f.session.run("finish_financial_reply",{evidence_ids:[r.facts[0].id]});assert(done.action.obligation_id===billId&&done.reply.includes("No money was approved or submitted"));
});
Deno.test("bank settlement is distinct from creditor application in owned payment history",async()=>{
 const f=fixture({agent_obligations:[bill()],agent_payment_attempts:[{id:"attempt",user_id:user,obligation_id:billId,status:"settled",currency:"USD",amount_cents:123456},{id:"foreign",user_id:"other",obligation_id:billId,status:"applied",amount_cents:123456}]});await f.session.run("get_obligation",{obligation_id:billId});const r=await f.session.run("get_payment_history",{obligation_id:billId});assert(r.facts.length===1&&r.facts[0].text.includes("do not treat this as creditor application"));
});
Deno.test("finish chooses only evidence from this turn and never invents financial prose",async()=>{
 const f=fixture({agent_obligations:[bill()]});const read=await f.session.run("get_obligation",{obligation_id:billId});await rejects(()=>f.session.run("finish_financial_reply",{evidence_ids:["F99"]}),"returned this turn");await rejects(()=>f.session.run("finish_financial_reply",{evidence_ids:["F1","F1"]}),"distinct");await rejects(()=>f.session.run("finish_financial_reply",{evidence_ids:[],reply:"Paid $99"}),"strict contract");const done=await f.session.run("finish_financial_reply",{evidence_ids:["F1"]});assert(done.reply===read.facts[0].text+" [F1]"&&done.action===null);
});
Deno.test("selected proposal controls the review button; last unselected bill never wins",async()=>{
 const r=reader({agent_obligations:[bill(),bill(secondBillId)]});const prepare=async(_u:any,_r:any,_a:any,body:any)=>({obligation:bill(body.obligation_id),task:{user_id:user,id:"task:"+body.obligation_id,state:"awaiting_approval"},assessment:{state:"awaiting_approval",message:"Review",proposal:{amount_cents:123456,currency:"USD",creditor:"Rent",fee_cents:199,funding_account_id:"verified:bank",reference:"invoice",expires_at:"2026-10-10T20:00:00Z"}}});
 const s=new FinancialToolSession(user,r,{},undefined,prepare);await s.run("find_obligations",{});const a=await s.run("preview_payment",{obligation_id:billId}),b=await s.run("preview_payment",{obligation_id:secondBillId});const first=await s.run("finish_financial_reply",{evidence_ids:[a.facts[0].id]});assert(first.action.obligation_id===billId);assert(first.reply.includes("fee $1.99")&&first.reply.includes("allocation invoice"));const neither=await s.run("finish_financial_reply",{evidence_ids:["F1"]});assert(neither.action===null);const both=await s.run("finish_financial_reply",{evidence_ids:[a.facts[0].id,b.facts[0].id]});assert(both.action===null);
});
Deno.test("cash source time is the oldest included provider observation, not calculation time",async()=>{
 const now=Date.now(),old=new Date(now-3600000).toISOString(),fresh=new Date(now-1000).toISOString();const a=(id:string,stamp:string)=>({user_id:user,account_id:id,account_kind:"checking",currency:"USD",status:"active",available_cents:10000,balance_as_of:stamp});
 const f=fixture({agent_financial_accounts:[a("a",old),a("b",fresh)]});const result=await f.session.run("get_cash_position",{});const fact=result.facts[0];assert(fact.source.observed_at===old&&fact.data.available_cents===20000&&fact.data.cash_sources.length===2);assert(fact.data.calculated_at!==old);
});
Deno.test("no eligible cash balance is unknown instead of zero",async()=>{const f=fixture();const r=await f.session.run("get_cash_position",{});assert(r.facts[0].data.available_cents===null&&r.facts[0].source.observed_at===null&&r.facts[0].text.includes("amount unknown"));});
