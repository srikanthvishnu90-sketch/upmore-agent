import {recoveryCaseAction} from "../../supabase/functions/_shared/recovery_service.ts";
import {workflowAction} from "../../supabase/functions/_shared/workflow_service.ts";
import {FinancialToolSession} from "../../supabase/functions/_shared/financial_tools.ts";
const owner="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002",id="00000000-0000-4000-8000-000000000003",request="00000000-0000-4000-8000-000000000004";
function assert(v:any,m="assertion failed"){if(!v)throw new Error(m);}
async function rejects(fn:()=>any,part:string){try{await fn();}catch(e){assert(String(e).includes(part),String(e));return;}throw Error("Expected rejection: "+part);}
const evidence=()=>[{account_id:"bank:a",transaction_id:"fee",fact_hash:"a".repeat(64)}];
const row=(extra:any={})=>({id,user_id:owner,kind:"bank_fee",version:1,status:"open",amount_cents:3500,currency:"USD",due_on:null,
 source_stale:false,recovered_cents:null,recovery_verification:"unavailable_user_report_only",source_snapshot:[{user_id:owner,account_id:"bank:a",provider_transaction_id:"fee",fact_hash:"a".repeat(64),amount_cents:-3500,currency:"USD",posted_on:"2026-10-01",is_pending:false,presence:"observed"}],...extra});
function reader(data:any={case:row(),replay:false,current_version:1,superseded:false},error:any=null){const calls:any[]=[];return {calls,rpc:async(name:string,args:any)=>{calls.push({name,args});return {data,error};}};}
const open=()=>({action:"recovery_case_open",request_id:request,kind:"bank_fee",evidence:evidence(),confirmed:true});
Deno.test("recovery case opening sends exact refs to Auth RPC and cannot inject amount or financial authority",async()=>{
 const r=reader(),result=await recoveryCaseAction(owner,r,open());assert(result.ok&&result.case.recovered_cents===null&&r.calls[0].name==="agent_recovery_case_open");
 assert(JSON.stringify(r.calls[0].args)===JSON.stringify({p_request:request,p_kind:"bank_fee",p_evidence:evidence(),p_due_on:null}));
 for(const extra of [{user_id:other},{amount_cents:99999},{status:"paid"},{verified:true},{approval:true},{confirmed:false},{due_on:"2026-02-30"}])await rejects(()=>recoveryCaseAction(owner,r,{...open(),...extra}),"exact candidate");assert(r.calls.length===1);
});
Deno.test("unknown, duplicate, forged and missing evidence fields reject before database calls",async()=>{
 const r=reader();for(const e of [[],[...evidence(),...evidence()],[{...evidence()[0],amount_cents:-3500}],[{...evidence()[0],fact_hash:"bad"}],[{account_id:"bank:a",fact_hash:"a".repeat(64)}]])await rejects(()=>recoveryCaseAction(owner,r,{...open(),evidence:e}),"exact candidate");assert(r.calls.length===0);
});
Deno.test("recovery case transitions require exact version, request identity and user confirmation",async()=>{
 const body={action:"recovery_case_update",case_id:id,request_id:request,expected_version:1,status:"user_reported_submitted",confirmed:true},r=reader({case:row({version:2,status:"user_reported_submitted"}),replay:false,current_version:2,superseded:false});
 const result=await recoveryCaseAction(owner,r,body);assert(result.case.status==="user_reported_submitted"&&result.completion.includes("No request was sent"));assert(r.calls[0].args.p_expected_version===1);
 for(const extra of [{confirmed:false},{expected_version:0},{expected_version:null},{status:"received"},{status:"verified"},{approval:true},{user_id:other}])await rejects(()=>recoveryCaseAction(owner,r,{...body,...extra}),"current case version");assert(r.calls.length===1);
});
Deno.test("owned case pages retain unverified totals and reject ownership bypasses",async()=>{
 const r=reader({owner_id:owner,recovery_verification:'unavailable_user_report_only',cases:[row()],next_offset:null,verified_recovered_cents:null}),result=await recoveryCaseAction(owner,r,{action:"recovery_case_list"});assert(result.cases.length===1&&result.verified_recovered_cents===null&&r.calls[0].args.p_offset===0);
 for(const changed of [row({user_id:other}),row({source_snapshot:[{...row().source_snapshot[0],user_id:other}]}),row({recovered_cents:3500}),row({currency:"EUR"}),row({source_stale:undefined})])await rejects(()=>recoveryCaseAction(owner,reader({owner_id:owner,recovery_verification:'unavailable_user_report_only',cases:[changed],next_offset:null,verified_recovered_cents:null}),{action:"recovery_case_list"}),"ownership or evidence");
});
Deno.test("historical retry receipts remain superseded, never silently current",async()=>{
 const r=reader({case:row(),replay:true,current_version:3,superseded:true}),result=await recoveryCaseAction(owner,r,open());assert(result.superseded&&result.current_version===3&&result.case.version===1);
 await rejects(()=>recoveryCaseAction(owner,reader({case:row(),replay:true,current_version:3,superseded:false}),open()),"retry receipt");
});
Deno.test("case query failures and malformed pages never become empty completion",async()=>{
 await rejects(()=>recoveryCaseAction(owner,reader(null,{message:"internal secret"}),{action:"recovery_case_list"}),"could not be saved or read");
 for(const result of [{cases:[],next_offset:null},{cases:[],next_offset:0,verified_recovered_cents:null},{cases:Array.from({length:21},()=>row()),next_offset:null,verified_recovered_cents:null}])await rejects(()=>recoveryCaseAction(owner,reader(result),{action:"recovery_case_list"}),"page is incomplete");
});
Deno.test("recovery workflow case dispatch never calls admin and rejects caller identity",async()=>{
 const r=reader(),admin={rpc:()=>{throw Error("unexpected admin");}};const result=await workflowAction(owner,r,admin,open());assert(result.ok&&r.calls.length===1);
 await rejects(()=>workflowAction(owner,r,admin,{...open(),user_id:other}),"exact candidate");assert(r.calls.length===1);
});

Deno.test("case response economics and source identity must match the requested operation",async()=>{
 const receipt=(r:any)=>({case:r,replay:false,current_version:r.version,superseded:false});
 await rejects(()=>recoveryCaseAction(owner,reader(receipt(row({kind:'stale_hold'}))),open()),'evidence identity');
 await rejects(()=>recoveryCaseAction(owner,reader(receipt(row({source_snapshot:[{...row().source_snapshot[0],provider_transaction_id:'different'}]}))),open()),'evidence identity');
 const update={action:'recovery_case_update',case_id:id,request_id:request,expected_version:1,status:'closed_user',confirmed:true};
 await rejects(()=>recoveryCaseAction(owner,reader(receipt(row({version:2,status:'user_reported_submitted'}))),update),'status or version');
 await rejects(()=>recoveryCaseAction(owner,reader(receipt(row({version:1,status:'closed_user'}))),update),'status or version');
 await rejects(()=>recoveryCaseAction(owner,reader({owner_id:other,recovery_verification:'unavailable_user_report_only',cases:[],next_offset:null,verified_recovered_cents:null}),{action:'recovery_case_list'}),'page is incomplete');
});
Deno.test("typed case tool renders user-reported state and stale evidence without financial completion",async()=>{
 const r=reader({owner_id:owner,recovery_verification:"unavailable_user_report_only",cases:[row({status:"user_reported_submitted",source_stale:true,due_on:"2026-10-11"})],next_offset:null,verified_recovered_cents:null});
 const session=new FinancialToolSession(owner,r,{}),facts=await session.run("get_recovery_cases",{}),reply=await session.run("finish_financial_reply",{evidence_ids:[facts.facts[0].id]});
 assert(reply.action===null&&reply.reply.includes("source bank facts changed")&&reply.reply.includes("does not prove a request was sent, accepted or paid"));assert(r.calls.length===1&&r.calls[0].name==="agent_recovery_case_page");
 await rejects(()=>session.run("get_recovery_cases",{status:"paid"}),"strict contract");
});
Deno.test("verified empty case page has grounded evidence without claiming no money recoverable",async()=>{
 const r=reader({owner_id:owner,recovery_verification:"unavailable_user_report_only",cases:[],next_offset:null,verified_recovered_cents:null}),session=new FinancialToolSession(owner,r,{});
 const result=await session.run("get_recovery_cases",{}),reply=await session.run("finish_financial_reply",{evidence_ids:[result.facts[0].id]});
 assert(reply.reply.includes("No saved local recovery cases")&&reply.reply.includes("does not establish")&&reply.action===null);
});
