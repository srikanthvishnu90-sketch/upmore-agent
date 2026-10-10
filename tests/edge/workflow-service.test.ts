import {workflowAction} from '../../supabase/functions/_shared/workflow_service.ts';
function assert(value:unknown,message='Assertion failed'){if(!value)throw new Error(message);}
async function rejects(work:()=>Promise<unknown>,message:string){try{await work();}catch(error){assert(String(error).includes(message),String(error));return;}throw new Error('Expected rejection: '+message);}
const owner='owner-a',entry='10000000-0000-0000-0000-000000000001';
function fixture(){
 let saved:any=null;let writes=0;let foreign=false;
 const user={from(){const query:any={select(){return query;},eq(){return query;},neq(){return query;},order(){return query;},async range(){return {data:saved?[{...saved,user_id:foreign?'owner-b':owner}]:[]};},async single(){return {data:{...saved,user_id:foreign?'owner-b':owner}};}};return query;}};
 const admin={async rpc(){return {data:{ok:true}};},from(){return {upsert(row:any){writes++;const result=saved?null:(saved={...row,id:entry,revision:1});return {select(){return {async maybeSingle(){return {data:result};}};}};}};}};
 const body={action:'save',entry_id:entry,confirmed:true,obligation:{creditor:'Rent',kind:'rent',amount_due_cents:230000,currency:'USD',due_on:'2026-11-01',autopay:'off'}};
 return {user,admin,body,get saved(){return saved;},get writes(){return writes;},set foreign(value:boolean){foreign=value;}};
}
Deno.test('bill entry retry returns the same record without changing financial facts',async()=>{const f=fixture();const first=await workflowAction(owner,f.user,f.admin,f.body);const retry=await workflowAction(owner,f.user,f.admin,f.body);assert(first.obligation.id===retry.obligation.id);assert(retry.obligation.amount_due_cents===230000);assert(retry.obligation.source_type==='user');});
Deno.test('reused bill entry ID cannot silently discard a changed amount',async()=>{const f=fixture();await workflowAction(owner,f.user,f.admin,f.body);await rejects(()=>workflowAction(owner,f.user,f.admin,{...f.body,obligation:{...f.body.obligation,amount_due_cents:240000}}),'different bill details');assert(f.saved.amount_due_cents===230000);});
Deno.test('reused bill entry ID cannot silently discard a changed payee or currency',async()=>{for(const change of [{creditor:'Other landlord'},{currency:'EUR'},{due_on:'2026-12-01'},{autopay:'on'}]){const f=fixture();await workflowAction(owner,f.user,f.admin,f.body);await rejects(()=>workflowAction(owner,f.user,f.admin,{...f.body,obligation:{...f.body.obligation,...change}}),'different bill details');}});
Deno.test('bill entry retry cannot return another owner record',async()=>{const f=fixture();await workflowAction(owner,f.user,f.admin,f.body);f.foreign=true;await rejects(()=>workflowAction(owner,f.user,f.admin,f.body),'ownership mismatch');});
Deno.test('bill list rejects a foreign row even if an upstream client violates its filter',async()=>{const f=fixture();await workflowAction(owner,f.user,f.admin,f.body);f.foreign=true;await rejects(()=>workflowAction(owner,f.user,f.admin,{action:'list'}),'ownership mismatch');});
Deno.test('invalid bill facts never reach storage',async()=>{const f=fixture();await rejects(()=>workflowAction(owner,f.user,f.admin,{...f.body,obligation:{...f.body.obligation,amount_due_cents:23.5}}),'invalid_amount');assert(f.writes===0);});
Deno.test('bill editing delegates only reviewed owner RPC fields with an exact revision and retry ID',async()=>{
 const calls:any[]=[];const f=fixture();const edited={...f.body.obligation,id:entry,user_id:owner,revision:2,status:'verified',source_type:'user',direction:'payable'};
 const reader={async rpc(name:string,args:any){calls.push({name,args});return {data:{ok:true,obligation:edited,current_revision:2}};}};
 const result=await workflowAction(owner,reader,{}, {action:'edit',request_id:entry,obligation_id:entry,expected_revision:1,confirmed:true,obligation:{...f.body.obligation,direction:'payable'}});
 assert(result.obligation.id===entry && calls.length===1);assert(calls[0].name==='agent_obligation_edit');assert(calls[0].args.p_expected_revision===1);assert(calls[0].args.p_request===entry);
 assert(Object.keys(calls[0].args.p_fields).sort().join(',')==='amount_due_cents,autopay,creditor,currency,direction,due_on,kind');
});
Deno.test('bill edits require explicit confirmation, revision and canonical current facts before RPC',async()=>{
 let calls=0;const reader={async rpc(){calls++;return {data:{}};}};const f=fixture();
 const body={action:'edit',request_id:entry,obligation_id:entry,expected_revision:1,confirmed:true,obligation:f.body.obligation};
 for(const change of [{confirmed:false},{expected_revision:0},{expected_revision:1.5},{request_id:'wrong'},{obligation:{...f.body.obligation,due_on:'2026-02-30'}}])await rejects(()=>workflowAction(owner,reader,{}, {...body,...change}),'review');
 assert(calls===0);
});
Deno.test('legacy blind bill update cannot overwrite a newer version',async()=>{const f=fixture();await rejects(()=>workflowAction(owner,{}, {},{...f.body,obligation:{...f.body.obligation,id:entry}}),'versioned');});
