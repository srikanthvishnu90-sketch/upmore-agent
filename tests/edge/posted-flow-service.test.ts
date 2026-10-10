import {postedFlowReport} from "../../supabase/functions/_shared/financial_service.ts";
import {FinancialToolSession} from "../../supabase/functions/_shared/financial_tools.ts";
import {reader,user,rejects} from "./lib/financial_fixture.ts";
function assert(v:unknown,m="assertion failed"){if(!v)throw new Error(m);}
const tx=(id:string)=>({user_id:user,account_id:"bank:a",provider_transaction_id:id,currency:"USD",amount_cents:-1234,posted_on:"2026-09-15",is_pending:false,is_transfer:false,presence:"observed",merchant_key:"coffee",merchant_raw:"Coffee",fetched_at:"2026-10-01T00:00:00Z"});
Deno.test("posted report aggregates every owned page instead of a 50-row or 1000-row sample",async()=>{
 const rows=Array.from({length:1001},(_,i)=>tx(String(i).padStart(4,"0")));rows.push({...tx("foreign"),user_id:"other"});const r=reader({agent_financial_transactions:rows});const report=await postedFlowReport(user,r,"2026-09-01","2026-09-30");assert(report.record_count===1001&&report.recorded_debits_cents===1235234);assert(r.reads.length===3&&r.reads.every(q=>q.filters.some(([k,,v]:any)=>k==="user_id"&&v===user)));assert(report.references.length===20&&report.references_are_sample&&/^[a-f0-9]{64}$/.test(report.reference_hash));
});
Deno.test("report fails if an intermediate page fails, rather than publishing a partial total",async()=>{
 const base=reader({agent_financial_transactions:Array.from({length:501},(_,i)=>tx(String(i)))});let pages=0;const client={from(table:string){const q=base.from(table);const range=q.range;q.range=(a:number,b:number)=>{pages++;return pages===2?Promise.resolve({error:{message:"second page failed"}}):range(a,b);};return q;}};await rejects(()=>postedFlowReport(user,client,"2026-09-01","2026-09-30"),"second page failed");assert(pages===2);
});
Deno.test("report rejects owner bypass and mismatched transaction facts",async()=>{
 const r=reader({agent_financial_transactions:[{...tx("foreign"),user_id:"other"}]},undefined,true);await rejects(()=>postedFlowReport(user,r,"2026-09-01","2026-09-30"),"ownership mismatch");
 const conflict=reader({agent_financial_transactions:[tx("same"),{...tx("same"),amount_cents:-999}]});await rejects(()=>postedFlowReport(user,conflict,"2026-09-01","2026-09-30"),"Conflicting duplicate");
});
Deno.test("account-scoped report and merchant summaries are bounded without trimming aggregate money",async()=>{
 const rows=Array.from({length:12},(_,i)=>({...tx(String(i)),merchant_key:"merchant"+i,merchant_raw:"Merchant "+i}));rows.push({...tx("b"),account_id:"bank:b",amount_cents:-50000});const r=reader({agent_financial_transactions:rows});const report=await postedFlowReport(user,r,"2026-09-01","2026-09-30","bank:a");assert(report.record_count===12&&report.recorded_debits_cents===14808&&report.merchants.length===10&&report.other_merchant_count===2);
});
Deno.test("posted report facts render real amounts with a source digest and preserve spending uncertainty",async()=>{
 const r=reader({agent_financial_transactions:[tx("one"),{...tx("refund"),amount_cents:100}]});const s=new FinancialToolSession(user,r,{});const result=await s.run("get_posted_flow_report",{date_from:"2026-09-01",date_to:"2026-09-30"});const done=await s.run("finish_financial_reply",{evidence_ids:[result.facts[0].id]});assert(done.reply.includes("debits $12.34, credits $1.00, net flow -$11.34"));assert(done.reply.includes("not verified spending or income totals"));assert(done.sources[0].reference.startsWith("posted-flow:")&&done.action===null);
});
Deno.test("empty retained range is reported as missing evidence rather than zero lifetime spending",async()=>{const s=new FinancialToolSession(user,reader({}),{});const r=await s.run("get_posted_flow_report",{date_from:"2026-09-01",date_to:"2026-09-30"});assert(r.facts[0].text.includes("does not establish zero spending or income")&&r.facts[0].source.observed_at===null);});
Deno.test("query-excluded pending records cannot be reported as a zero pending-charge count",async()=>{
 const r=reader({agent_financial_transactions:[tx("posted"),{...tx("pending"),is_pending:true},{...tx("missing"),presence:"not_seen"}]});const report=await postedFlowReport(user,r,"2026-09-01","2026-09-30");assert(report.record_count===1&&report.excluded.pending===null&&report.excluded.unavailable===null&&report.excluded_count_scope.includes("separate reads"));
});
