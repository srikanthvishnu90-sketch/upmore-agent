import {runPaymentAttempt,runPaymentQueue} from '../../supabase/functions/_shared/payment_service.ts';
function assert(v:unknown,m:string){if(!v)throw Error(m);}
Deno.test('lost begin_submission response cannot claim nothing was submitted',async()=>{
 const attempt={id:'a',task_id:'t',user_id:'u',adapter_id:'rail',status:'reserved',lease_token:'l'};let submits=0;
 const admin={from(table:string){const q:any={select:()=>q,eq:()=>q,single:async()=>({data:table==='agent_payment_attempts'?attempt:{id:'t',user_id:'u'}})};return q;},rpc:async(name:string)=>{
  if(name==='agent_payment_claim')return {data:attempt};
  if(name==='agent_payment_begin_submission'){attempt.status='submitted';throw Error('lost response');}
  if(name==='agent_payment_cancel_reserved')return {data:null};
  if(name==='agent_payment_uncertain')return {data:{...attempt,status:'unknown'}};
  throw Error(name);
 }};
 const r=await runPaymentAttempt(admin,'a',[{id:'rail',verified:true,submit:async()=>{submits++;return {};},lookup:async()=>null}]);
 assert(r.state==='unknown','committed marker without response is unknown');assert(!/nothing was submitted/i.test(r.message),'no false negative submission proof');assert(submits===0,'never call submit after ambiguous begin');
});

Deno.test('five stagnant settlements cannot consume the approved-task reservation quota',async()=>{
 const calls:string[]=[],attempts:any={fresh:{id:'fresh',task_id:'task',user_id:'u',adapter_id:'rail',status:'reserved',lease_token:'l'}};
 for(let i=0;i<5;i++)attempts['old'+i]={id:'old'+i,task_id:'old-task'+i,user_id:'u',adapter_id:'rail',status:'settled',lease_token:'l'};
 const admin={from(table:string){let id='';const q:any={select:()=>q,eq:(key:string,value:string)=>{if(key==='id')id=value;return q;},single:async()=>({data:table==='agent_payment_attempts'?{...attempts[id]}:{id,user_id:'u'}})};return q;},rpc:async(name:string,args:any)=>{
  calls.push(name);
  if(name==='agent_payment_due_tasks')return {data:[{id:'task',snapshot_hash:'hash'}]};
  if(name==='agent_payment_due_attempts')return {data:Object.values(attempts).filter((a:any)=>a.status==='settled')};
  if(name==='agent_payment_reserve')return {data:attempts.fresh};
  if(name==='agent_payment_claim')return {data:{...attempts[args.p_attempt]}};
  if(name==='agent_payment_begin_submission'){attempts.fresh.status='submitted';return {data:{attempt:{...attempts.fresh},context:{}}};}
  if(name==='agent_payment_record_event'){attempts[args.p_attempt].status=args.p_event.status;return {data:{attempt:{...attempts[args.p_attempt]}}};}
  if(name==='agent_payment_uncertain')return {data:attempts[args.p_attempt]};
  throw Error(name);
 }};let submits=0,lookups=0;
 const result=await runPaymentQueue(admin,5,[{id:'rail',verified:true,submit:async()=>{submits++;return {status:'processing'};},lookup:async()=>{lookups++;return null;}}]);
 assert(submits===1,'fresh authorized task gets its own reservation quota');assert(lookups===5,'settled attempts retain independent reconciliation quota');assert(result.processed===6,'both quotas represented honestly');assert(calls.indexOf('agent_payment_reserve')<calls.indexOf('agent_payment_due_attempts'),'reservation before stagnant lookups');
});

Deno.test('new unknown recovery advances within two runs while leased rows remain excluded',async()=>{
 const rows:any[]=Array.from({length:5},(_,i)=>({id:'old'+i,task_id:'t'+i,user_id:'u',adapter_id:'rail',status:'settled',lease_token:'lease',due:true}));
 rows.push({id:'new',task_id:'new-task',user_id:'u',adapter_id:'rail',status:'unknown',lease_token:'lease',due:true});rows.push({id:'leased',task_id:'leased-task',user_id:'u',adapter_id:'rail',status:'unknown',due:true,leased:true});
 const looked:string[]=[];const admin={from(table:string){let id='';const q:any={select:()=>q,eq:(key:string,value:string)=>{if(key==='id')id=value;return q;},single:async()=>({data:table==='agent_payment_attempts'?rows.find(a=>a.id===id):{id,user_id:'u'}})};return q;},rpc:async(name:string,args:any)=>{
  if(name==='agent_payment_due_tasks')return {data:[]};
  if(name==='agent_payment_due_attempts')return {data:rows.filter(a=>a.due&&!a.leased).slice(0,args.p_limit)};
  const row=rows.find(a=>a.id===args.p_attempt);
  if(name==='agent_payment_claim')return {data:row};
  if(name==='agent_payment_uncertain'){row.due=false;return {data:row};}
  throw Error(name);
 }};const adapter={id:'rail',verified:true,submit:async()=>{throw Error('must never resubmit');},lookup:async(a:any)=>{looked.push(a.id);return null;}};
 await runPaymentQueue(admin,5,[adapter]);await runPaymentQueue(admin,5,[adapter]);
 assert(looked.includes('new'),'new unknown gets reconciliation after prior due entries advance');assert(!looked.includes('leased'),'leased rows do not consume quota');assert(rows[0].status==='settled','null lookup retains financial settlement');
});
