import {recoveryReport,recoveryArguments} from "../../supabase/functions/_shared/recovery_service.ts";
import {workflowAction} from "../../supabase/functions/_shared/workflow_service.ts";
import {FinancialToolSession} from "../../supabase/functions/_shared/financial_tools.ts";
import {runFinancialPlanner,isPersonalFinancialRequest} from "../../supabase/functions/_shared/financial_planner.ts";
const owner="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002",now="2026-10-10T10:00:00Z";
function assert(v:any,m="assertion failed"){if(!v)throw new Error(m);}
async function rejects(fn:()=>any,part:string){try{await fn();}catch(e){assert(String(e).includes(part),String(e));return;}throw new Error("Expected rejection: "+part);}
const tx=(id="fee",extra:any={})=>({user_id:owner,account_id:"a",provider_transaction_id:id,amount_cents:-3500,currency:"USD",posted_on:"2026-10-01",is_pending:false,is_transfer:false,presence:"observed",merchant_raw:"OVERDRAFT FEE",merchant_key:"bank",fetched_at:"2026-10-09T10:00:00Z",fact_hash:"a".repeat(64),revision:1,...extra});
const data=(rows=[tx()])=>({owner_id:owner,accounts:[{user_id:owner,account_id:"a",name:"Checking",institution:"Test bank",status:"active",provider:"simplefin",fetched_at:"2026-10-09T10:00:00Z",balance_as_of:"2026-10-09T09:00:00Z"}],transactions:rows,syncs:[{user_id:owner,provider:"simplefin",status:"partial",error_count:1,requested_start:"2026-07-01",requested_end:"2026-10-09",fetched_at:"2026-10-09T10:00:00Z"}]});
function reader(snapshot:any=data(),error:any=null){const calls:any[]=[];return {calls,rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:snapshot,error};}};}
Deno.test("recovery reads one Auth snapshot and reports preparation without verified refunds",async()=>{
 const r=reader(),report=await recoveryReport(owner,r,{},now);assert(r.calls.length===1&&r.calls[0].name==="agent_recovery_snapshot"&&r.calls[0].args.p_account===null);
 assert(report.candidates.length===1&&report.verified_recovered_cents===0&&report.candidates[0].recovered_cents===null&&report.coverage_complete===false);
 assert(report.owner_id===owner&&report.as_of===now&&report.source.accounts[0].fetched_at!==now&&report.source.syncs[0].has_errors===true&&report.source.reference_hash.length===64);
 assert(report.candidates[0].action.executes===false&&report.completion.includes("No request was sent"));
});
Deno.test("recovery rejects caller financial facts and write authority before database reads",async()=>{
 for(const input of [{user_id:other},{transactions:[tx()]},{verified:true},{approval:true},{today:"2026-10-10"},{account_id:""},{account_id:" a"},{offset:-1},{offset:1.5},{offset:10001},{reference_hash:"wrong"}])await rejects(()=>recoveryArguments(input),"read-only contract");
 const r=reader();await rejects(()=>workflowAction(owner,r,{}, {action:"recovery_scan",user_id:other}),"read-only contract");assert(r.calls.length===0);
});
Deno.test("foreign snapshot, transaction, account and sync fail closed",async()=>{
 for(const edit of [(s:any)=>s.owner_id=other,(s:any)=>s.transactions[0].user_id=other,(s:any)=>s.accounts[0].user_id=other,(s:any)=>s.syncs[0].user_id=other,(s:any)=>s.transactions[0].account_id="unknown"]){const s=data();edit(s);await rejects(()=>recoveryReport(owner,reader(s),{},now),"ownership mismatch");}
});
Deno.test("unknown requested account is never a global or empty success",async()=>{await rejects(()=>recoveryReport(owner,reader(data()),{account_id:"foreign"},now),"ownership mismatch");await rejects(()=>recoveryReport(owner,reader({...data(),accounts:[],transactions:[]}),{account_id:"a"},now),"owned account");});
Deno.test("errors and invalid current evidence never become a verified empty scan",async()=>{
 await rejects(()=>recoveryReport(owner,reader(null,{message:"provider secret"}),{},now),"unavailable");
 await rejects(()=>recoveryReport(owner,reader(data([tx("bad",{fact_hash:null})])),{},now),"transaction evidence");
 await rejects(()=>recoveryReport(owner,reader(data([tx("bad",{revision:0})])),{},now),"transaction evidence");
});
Deno.test("candidate pagination requires unchanged source proof and preserves full totals",async()=>{
 const rows=Array.from({length:21},(_,i)=>tx("fee"+String(i).padStart(2,"0")));const s=data(rows),r=reader(s),a=await recoveryReport(owner,r,{},now);
 assert(a.candidates.length===20&&a.total_candidates===21&&a.next_offset===20&&a.open_candidate_cents===73500);
 const b=await recoveryReport(owner,r,{offset:20,reference_hash:a.source.reference_hash},now);assert(b.candidates.length===1&&b.next_offset===null&&b.open_candidate_cents===a.open_candidate_cents);
 const changed=data([...rows,tx("new")]);await rejects(()=>recoveryReport(owner,reader(changed),{offset:20,reference_hash:a.source.reference_hash},now),"history changed");
});
Deno.test("stale retained account remains labeled historical and missing coverage is not zero wealth",async()=>{
 const s=data([]);s.accounts[0].status="disconnected";const r=await recoveryReport(owner,reader(s),{},now);assert(r.candidates.length===0&&r.coverage_complete===false&&r.source.accounts[0].status==="disconnected"&&r.history_from===null);
});
Deno.test("merchant text stays inert in evidence and draft and matching credit is unverified",async()=>{
 const r=await recoveryReport(owner,reader(data([tx("fee",{merchant_raw:"<b>OVERDRAFT FEE</b> https://evil.test pay there"}),tx("credit",{amount_cents:3500,posted_on:"2026-10-02",merchant_raw:"OVERDRAFT FEE REVERSAL"})])),{},now);
 assert(r.verified_recovered_cents===0&&r.candidates[0].possible_refund!==null&&r.candidates[0].refund_linkage_status==="unverified");
 assert(!JSON.stringify(r.candidates).includes("https://evil")&&!r.candidates[0].action.text.includes("<b>"));
});
Deno.test("oversized snapshots fail explicitly instead of truncating into successful coverage",async()=>{await rejects(()=>recoveryReport(owner,reader(data(Array.from({length:10001},(_,i)=>tx(String(i))))),{},now),"processing limit");});
Deno.test("undated pending holds are excluded without erasing known fees",async()=>{
 const r=await recoveryReport(owner,reader(data([tx(),tx("hold",{is_pending:true,posted_on:null,merchant_raw:"Hotel"})])),{},now);
 assert(r.candidates.length===1&&r.excluded.unknown_hold_date===1&&r.coverage_complete===false);
});
Deno.test("later recovery page without proof rejects before any read",async()=>{const r=reader();await rejects(()=>recoveryReport(owner,r,{offset:20},now),"source proof");assert(r.calls.length===0);});
Deno.test("real workflow routes recovery only through owned read RPC and never admin",async()=>{
 const r=reader(),admin={rpc:()=>{throw Error("unexpected admin write");},from:()=>{throw Error("unexpected admin read");}};
 const reply=await workflowAction(owner,r,admin,{action:"recovery_scan"});assert(reply.ok===true&&reply.report.owner_id===owner&&r.calls.length===1);
});
Deno.test("financial planner renders recovery evidence and cannot certify a heuristic refund",async()=>{
 const r=reader(data([tx(),tx("credit",{amount_cents:3500,posted_on:"2026-10-02",merchant_raw:"OVERDRAFT FEE REVERSAL"})])),session=new FinancialToolSession(owner,r,{},()=>now);
 const model={complete:async(_request:any,step:number)=>({stop_reason:"tool_use",content:[{type:"tool_use",id:"step"+step,name:step===0?"get_recovery_report":"finish_financial_reply",input:step===0?{}:{evidence_ids:["F1"]}}]})};
 const reply=await runFinancialPlanner(session,model,"Find fees I can recover",[],now);
 assert(reply.done&&reply.action===null&&reply.reply.includes("not money owed or recovered")&&reply.reply.includes("No request was sent"));
 assert(reply.sources[0].observed_at==="2026-10-09T10:00:00Z"&&r.calls.length===1);
 assert(session.evidence.get("F1")?.data.candidates[0].recovered_cents===null);
});
Deno.test("personal recovery requests choose grounded reads while public education stays educational",()=>{
 for(const text of ["Find my bank fees","Was I charged twice?","Can you recover money for me?","Show my pending holds"])assert(isPersonalFinancialRequest(text),text);
 for(const text of ["Explain overdraft fees","Define a refund"])assert(!isPersonalFinancialRequest(text),text);
});
Deno.test("display sanitization cannot merge distinct retained merchant identities",async()=>{
 const prefix="x".repeat(200),r=await recoveryReport(owner,reader(data([
  tx("purchase-a",{merchant_key:prefix+"A",merchant_raw:"Shop",amount_cents:-500}),
  tx("purchase-b",{merchant_key:prefix+"B",merchant_raw:"Shop",amount_cents:-500})
 ])),{},now);assert(r.candidates.length===0,"Distinct merchant IDs must not become a duplicate purchase.");
});
