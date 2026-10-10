import {FinancialToolSession} from "../../../supabase/functions/_shared/financial_tools.ts";
function assert(v:unknown,m="assertion failed"){if(!v)throw new Error(m);}
export async function rejects(fn:()=>unknown|Promise<unknown>,part:string){try{await fn();}catch(e){assert(String(e).includes(part),String(e));return;}throw new Error("expected rejection: "+part);}
export const user="00000000-0000-4000-8000-000000000001",billId="00000000-0000-4000-8000-000000000002",secondBillId="00000000-0000-4000-8000-000000000003";
export function bill(id=billId){return {id,user_id:user,creditor:"Rent",currency:"USD",amount_due_cents:123456,due_on:"2026-10-11",status:"verified",autopay:"unknown",source_type:"user",observed_at:new Date().toISOString(),revision:1,kind:"rent",source_key:"user:bill",provider_key:null,account_id:null,reference:null};}
// Mimics query filtering, ordering, pagination and SQL LIKE escape semantics;
// ownership checks also run in the real service after these filters.
export function reader(tables:Record<string,any[]>,fail?:string,ignoreOwner=false){
 const reads:any[]=[];
 return {reads,from(table:string){
  const filters:any[]=[],orders:any[]=[];let start=0,end=Infinity;
  const q:any={select(){return q;},eq(k:string,v:any){filters.push([k,"eq",v]);return q;},neq(k:string,v:any){filters.push([k,"neq",v]);return q;},gte(k:string,v:any){filters.push([k,"gte",v]);return q;},lte(k:string,v:any){filters.push([k,"lte",v]);return q;},
   in(k:string,v:any){filters.push([k,"in",v]);return q;},ilike(k:string,v:any){filters.push([k,"ilike",v]);return q;},order(k:string,opts:any={}){orders.push([k,opts]);return q;},range(a:number,b:number){start=a;end=b;return q;},single(){return result(true);},maybeSingle(){return result(true);},then(resolve:any,reject:any){return result().then(resolve,reject);}};
  async function result(single=false){
   reads.push({table,filters:structuredClone(filters),start,end});if(table===fail)return {error:{message:"fixture read failure"}};
   let rows=(tables[table]||[]).filter(r=>filters.every(([k,op,v])=>{
    if(ignoreOwner && k==="user_id")return true;
    if(op==="in")return v.includes(r[k]);
    if(op==="eq")return r[k]===v;if(op==="neq")return r[k]!==v;if(op==="gte")return r[k]>=v;if(op==="lte")return r[k]<=v;
    let pattern="";for(let i=0;i<v.length;i++){const c=v[i];if(c==="\\"){pattern+=v[++i].replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}else if(c==="%")pattern+=".*";else if(c==="_")pattern+=".";else pattern+=c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
    return new RegExp("^"+pattern+"$","i").test(r[k]||"");
   }));
   rows=rows.slice().sort((a,b)=>{for(const [k,o]of orders){const an=a[k]==null,bn=b[k]==null;if(an!==bn)return an?(o.nullsFirst?-1:1):(o.nullsFirst?1:-1);if(an)continue;const cmp=a[k]<b[k]?-1:a[k]>b[k]?1:0;if(cmp)return o.ascending===false?-cmp:cmp;}return 0;});
   rows=rows.slice(start,end+1);return single?rows.length===1?{data:rows[0]}:{error:{message:"record unavailable"}}:{data:rows};
  }return q;
 }};
}
export function fixture(tables:Record<string,any[]>={},fail?:string){const r=reader(tables,fail);const calls:any[]=[];const admin={from(){return {async upsert(){return {data:null};}};},async rpc(name:string,args:any){calls.push({name,args});if(name!=="agent_workflow_store_plan")throw new Error("unexpected RPC "+name);return {data:{id:"task",user_id:user,state:args.p_plan.state,plan:args.p_plan}};}};return {r,calls,admin,session:new FinancialToolSession(user,r,admin)};}
