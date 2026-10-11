import {processInbox} from '../../supabase/functions/_shared/message_processing.ts';
function assert(v:unknown){if(!v)throw new Error('assertion failed');}
function admin(state='queued',turn:any=null){
  const item={id:'inbox',state,user_id:'owner',lease_token:'lease'};const calls:any[]=[];
  return {item,calls,claimable:true,from(table:string){const q:any={select(){return q;},eq(){return q;},async single(){return {data:item};},async maybeSingle(){return {data:turn};}};return q;},
    async rpc(name:string,args:any){calls.push({name,args});return {data:this.claimable?{...item,state:'processing'}:null};}};
}
Deno.test('new inbox item gets one lease before invoking the dedicated brain endpoint',async()=>{
  const a=admin();let called=0;const r=await processInbox(a,'inbox',async item=>{called++;assert(a.calls[0].name==='agent_message_claim');assert(item.lease_token==='lease');return {ok:true,state:'completed'};});assert(r.state==='completed' && called===1);
});
Deno.test('existing started turn is not rerun after a lost worker response',async()=>{
  const a=admin('processing',{state:'started'});let called=0;const r=await processInbox(a,'inbox',async()=>{called++;return {};});assert(r.state==='needs_reconciliation' && called===0);assert(a.calls.length===0);
});
Deno.test('unstarted expired processing attempts use checked recovery instead of creating another inbox',async()=>{
  const a=admin('uncertain');await processInbox(a,'inbox',async()=>({ok:true,state:'completed'}));assert(a.calls[0].name==='agent_message_retry_unstarted');
});
Deno.test('busy leases and terminal inbox states cannot invoke the brain',async()=>{
  const a=admin();a.claimable=false;let called=0;await processInbox(a,'inbox',async()=>{called++;return {};});assert(called===0);
  for(const state of ['completed','cancelled']){const x=admin(state);await processInbox(x,'inbox',async()=>{called++;return {};});assert(x.calls.length===0);}assert(called===0);
});
Deno.test('worker timeout reports reconciliation rather than submitting a new turn',async()=>{
  const a=admin();const r=await processInbox(a,'inbox',async()=>{throw new Error('network timeout');});assert(r.state==='needs_reconciliation');assert(a.calls.length===1);
});
