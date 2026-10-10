import { financialContext, persistFinancialEvidence, syncFinancialEvidence } from "../../supabase/functions/_shared/financial_service.ts";
function assert(value:unknown,message="Assertion failed") { if (!value) throw new Error(message); }
async function rejects(fn:()=>Promise<unknown>,text:string) {
  try { await fn(); } catch(e) { assert(String(e).includes(text),String(e)); return; }
  throw new Error("Expected rejection: "+text);
}
function client(tables:Record<string,any[]>,failTable?:string) {
  const reads:any[]=[];
  return {reads,from(table:string) {
    let owner:string;
    const query:any={select(){return query;},eq(field:string,value:string){assert(field==="user_id");owner=value;return query;},order(){return query;},range(start:number,end:number){
      reads.push({table,owner,start,end});
      return Promise.resolve(table===failTable ? {error:{message:"read failed"}} : {data:(tables[table] || []).filter(r=>r.user_id===owner).slice(start,end+1)});
    }};
    return query;
  }};
}
const user="owner-a",now=()=>new Date().toISOString();
function payload(){return {accounts:[{id:"a",currency:"USD",balance:"100",available_balance:"90",balance_date:now()}],transactions:[],errlist:[]};}
const metadata=()=>({fetched_at:now(),requested_start:"2026-07-10",requested_end:"2026-10-08"});
function admin(result:any={ok:true}) {const calls:any[]=[];return {calls,async rpc(name:string,args:any){calls.push({name,args});return {data:result};}};}
Deno.test("context reads every page with owner filter, excluding other owners",async()=>{
 const accounts=Array.from({length:1001},(_,i)=>({user_id:user,account_id:"a"+i,account_kind:"unknown",currency:"USD"}));
 accounts.push({user_id:"owner-b",account_id:"foreign",account_kind:"checking",currency:"USD"});
 const reader=client({agent_financial_accounts:accounts});const context=await financialContext(user,reader);
 assert(context.accounts.length===1001);assert(context.summary.available_cents===null);
 assert(reader.reads.filter(r=>r.table==="agent_financial_accounts").length===3);assert(reader.reads.every(r=>r.owner===user));
});
Deno.test("read failures cannot yield a fabricated empty financial picture",async()=>{await rejects(()=>financialContext(user,client({},"agent_obligations")),"read failed");});
Deno.test("malformed bank response never reaches storage",async()=>{
 const service=admin();await rejects(()=>persistFinancialEvidence(user,client({}),service,{accounts:[],transactions:[{}],errlist:[]},metadata()),"failed validation");assert(service.calls.length===0);
});
Deno.test("failed ingestion stops discovery and context",async()=>{
 const reader=client({});const service={async rpc(){return {error:{message:"connection unavailable"}};}};
 await rejects(()=>persistFinancialEvidence(user,reader,service,payload(),metadata()),"connection unavailable");assert(reader.reads.length===0);
});
Deno.test("ignored old sync cannot add recurring candidates",async()=>{
 const service=admin({ok:true,ignored_stale_batch:true});const context=await persistFinancialEvidence(user,client({}),service,payload(),metadata());
 assert(context.ignored_stale_batch);assert(service.calls.length===1);
});
Deno.test("durable history generates bounded stable candidate identities without payment authority",async()=>{
 const rows=["2026-07-09","2026-08-09","2026-09-09"].map((d,i)=>({user_id:user,account_id:"simplefin:a",provider_transaction_id:"t"+i,currency:"USD",amount_cents:-8500,posted_on:d,merchant_raw:"Utility",merchant_key:"utility",is_pending:false,is_transfer:false}));
 const service=admin();const reader=client({agent_financial_transactions:rows});
 await persistFinancialEvidence(user,reader,service,payload(),metadata());
 await persistFinancialEvidence(user,reader,service,payload(),metadata());
 const calls=service.calls.filter(c=>c.name==="agent_financial_store_candidates");const a=calls[0].args.p_candidates[0],b=calls[1].args.p_candidates[0];
 assert(/^bank-pattern:[a-f0-9]{64}$/.test(a.source_key));assert(a.source_key===b.source_key);assert(a.status==="asserted" && a.provider_key===null && a.evidence.user_confirmation_required);assert(calls.every(c=>c.args.p_user===user));
});
Deno.test("refresh invokes authenticated bank proxy and surfaces its failure",async()=>{
 let invoked="";const reader:any=client({});reader.functions={async invoke(name:string){invoked=name;return {data:{error:"unconnected"}};}};
 const service=admin();await rejects(()=>syncFinancialEvidence(user,reader,service),"Bank refresh failed");assert(invoked==="simplefin-proxy");assert(service.calls.length===0);
});
