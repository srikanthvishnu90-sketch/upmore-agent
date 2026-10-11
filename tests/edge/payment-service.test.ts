import {runPaymentAttempt,type PaymentAdapter} from '../../supabase/functions/_shared/payment_service.ts';
function assert(v:unknown,m='assertion failed'){if(!v)throw new Error(m);}
async function rejects(fn:()=>Promise<unknown>,message:string){try{await fn();}catch(e){assert(String(e).includes(message));return;}throw new Error('expected rejection');}
function fixture(status='reserved'){
 const attempt:any={id:'attempt',task_id:'task',user_id:'owner',adapter_id:'rail',status,lease_token:'lease',idempotency_key:'original-key'};
 const calls:string[]=[];const flags={preflightFail:false,eventFail:false,busy:false};
 const admin={from(table:string){const eqs:Record<string,string>={};const query={select(){return query;},eq(k:string,v:string){eqs[k]=v;return query;},async single(){if(table==='agent_workflow_tasks')assert(eqs.user_id==='owner');return {data:table==='agent_payment_attempts'?{...attempt}:{id:'task',user_id:'owner',approved_snapshot:{reference:'invoice'}}};}};return query;},async rpc(name:string,args:any){
  calls.push(name);
  if(name==='agent_payment_claim')return {data:flags.busy?null:{...attempt}};
  if(name==='agent_payment_begin_submission'){
   if(flags.preflightFail)return {error:{message:'preflight failed'}};
   assert(attempt.status==='reserved');attempt.status='submitted';return {data:{attempt:{...attempt},context:{task:{id:'task'}}}};
  }
  if(name==='agent_payment_cancel_reserved'){attempt.status='cancelled';return {data:{...attempt}};}
  if(name==='agent_payment_uncertain'){if(attempt.status!=='settled')attempt.status='unknown';return {data:{...attempt}};}
  if(name==='agent_payment_record_event'){
   if(flags.eventFail)return {error:{message:'storage failed'}};
   attempt.status=args.p_event.status;return {data:{attempt:{...attempt}}};
  }
  throw new Error('unexpected RPC');
 }};
 const counts={submit:0,lookup:0};
 const adapter:PaymentAdapter={id:'rail',verified:true,async submit(a){assert(attempt.status==='submitted','durable marker must precede network');assert(a.idempotency_key==='original-key');counts.submit++;return {status:'processing'};},async lookup(a){assert(a.idempotency_key==='original-key');counts.lookup++;return {status:'processing'};}};
 return {admin,adapter,attempt,calls,flags,counts};
}
Deno.test('unverified adapter cannot reserve a worker or call a provider',async()=>{const f=fixture();const result=await runPaymentAttempt(f.admin,'attempt',[{...f.adapter,verified:false}]);assert(result.state==='needs_connection');assert(f.calls.length===0);assert(f.counts.submit===0);});
Deno.test('preflight failure cancels reservation and never submits',async()=>{const f=fixture();f.flags.preflightFail=true;const r=await runPaymentAttempt(f.admin,'attempt',[f.adapter]);assert(r.state==='blocked');assert(f.attempt.status==='cancelled');assert(f.counts.submit===0);});
Deno.test('submission starts durably before provider call and stores processing separately from applied',async()=>{const f=fixture();const r=await runPaymentAttempt(f.admin,'attempt',[f.adapter]);assert(r.state==='processing');assert(f.counts.submit===1);assert(f.calls.indexOf('agent_payment_begin_submission')<f.calls.indexOf('agent_payment_record_event'));});
Deno.test('timeout after accepted submit recovers by lookup without a second send',async()=>{
 const f=fixture();f.adapter.submit=async()=>{f.counts.submit++;throw new Error('timeout after acceptance');};
 const first=await runPaymentAttempt(f.admin,'attempt',[f.adapter]);assert(first.state==='unknown');
 const next=await runPaymentAttempt(f.admin,'attempt',[f.adapter]);assert(next.state==='processing');assert(f.counts.submit===1);assert(f.counts.lookup===1);
});
Deno.test('crash after durable submission marker recovers only with original lookup',async()=>{const f=fixture('submitted');await runPaymentAttempt(f.admin,'attempt',[f.adapter]);assert(f.counts.submit===0);assert(f.counts.lookup===1);});
Deno.test('receipt storage failure propagates and next run cannot submit twice',async()=>{const f=fixture();f.flags.eventFail=true;await rejects(()=>runPaymentAttempt(f.admin,'attempt',[f.adapter]),'storage failed');f.flags.eventFail=false;await runPaymentAttempt(f.admin,'attempt',[f.adapter]);assert(f.counts.submit===1);assert(f.counts.lookup===1);});
Deno.test('busy lease cannot call submit or lookup',async()=>{const f=fixture();f.flags.busy=true;const r=await runPaymentAttempt(f.admin,'attempt',[f.adapter]);assert(r.state==='busy_or_terminal');assert(f.counts.submit+f.counts.lookup===0);});
Deno.test('settlement remains known while waiting for creditor application',async()=>{const f=fixture('settled');f.adapter.lookup=async()=>null;const r=await runPaymentAttempt(f.admin,'attempt',[f.adapter]);assert(r.state==='settled');assert(f.attempt.status==='settled');assert(f.counts.submit===0);});
Deno.test('terminal outcomes never reopen network execution',async()=>{for(const status of ['applied','returned','failed','cancelled']){const f=fixture(status);const r=await runPaymentAttempt(f.admin,'attempt',[f.adapter]);assert(r.state===status);assert(f.calls.length===0);assert(f.counts.submit+f.counts.lookup===0);}});
