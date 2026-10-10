import {messageTurnRequest,messageBubbles} from '../../supabase/functions/_shared/message_turn.ts';
function assert(v:unknown){if(!v)throw new Error('assertion failed');}
const inbox='11111111-1111-4111-8111-111111111111',lease='22222222-2222-4222-8222-222222222222',key='fixture-service-secret-that-is-long-enough';
function request(extra:any={},token=key){return new Request('https://example.com/turn',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({inbox_id:inbox,lease_token:lease,...extra})});}
function admin(kind='message'){
  const context={user_id:'verified-owner',thread_id:'33333333-3333-4333-8333-333333333333',text:'What is due tomorrow?',kind};
  const a:any={state:'new',context,calls:[],receipt:null,failFinish:false,commitBeforeError:false,async rpc(name:string,args:any){
    a.calls.push({name,args});
    if(name==='agent_message_turn_begin') {
      if(a.state==='new'){a.state='started';return {data:{ready:true,context}};}
      return {data:{ready:false,state:a.state,response:a.receipt,http_status:200}};
    }
    if(!a.failFinish || a.commitBeforeError){a.state='completed';a.receipt=args.p_response;}
    return a.failFinish ? {error:{message:'storage interrupted'}} : {data:{state:'completed'}};
  }};
  return a;
}
Deno.test('message-turn authentication and strict request shape fail before brain or storage',async()=>{
  for(const req of [request({},'user-jwt'),request({as_user_id:'attacker'}),request({text:'pay someone else'}),request({inbox_id:'bad'})]){
    const a=admin();let calls=0;const r=await messageTurnRequest(req,a,key,async()=>{calls++;return new Response('{}');});
    assert(r.status===400 || r.status===401);assert(calls===0 && a.calls.length===0);
  }
});
Deno.test('brain receives owner, thread and text exclusively from the durable inbox',async()=>{
  const a=admin();let sent:any;
  const r=await messageTurnRequest(request(),a,key,async req=>{sent=await req.json();assert(a.state==='started');return new Response(JSON.stringify({thread_id:a.context.thread_id,reply:'Rent is due tomorrow.'}));});
  assert(r.status===200);assert(sent.as_user_id===a.context.user_id && sent.message===a.context.text && sent.thread_id===a.context.thread_id);
  assert(a.calls[1].name==='agent_message_turn_finish');assert(a.calls[1].args.p_replies[0]==='Rent is due tomorrow.');
});
Deno.test('completed turn retries reuse the receipt without another model or financial turn',async()=>{
  const a=admin();let calls=0;const brain=async()=>{calls++;return new Response(JSON.stringify({reply:'Your review is ready.',thread_id:a.context.thread_id}));};
  await messageTurnRequest(request(),a,key,brain);const r=await messageTurnRequest(request(),a,key,brain);
  assert(calls===1);assert((await r.json()).state==='completed');
});
Deno.test('lost persistence response after commit recovers the saved reply without rerunning',async()=>{
  const a=admin();a.failFinish=true;a.commitBeforeError=true;let calls=0;const brain=async()=>{calls++;return new Response(JSON.stringify({reply:'Saved answer.',thread_id:a.context.thread_id}));};
  assert((await messageTurnRequest(request(),a,key,brain)).status===503);
  const r=await messageTurnRequest(request(),a,key,brain);assert(r.status===200 && calls===1);assert((await r.json()).response.reply==='Saved answer.');
});
Deno.test('uncommitted result failure leaves the original turn pending and does not rerun',async()=>{
  const a=admin();a.failFinish=true;let calls=0;const brain=async()=>{calls++;return new Response(JSON.stringify({reply:'Result.',thread_id:a.context.thread_id}));};
  await messageTurnRequest(request(),a,key,brain);const r=await messageTurnRequest(request(),a,key,brain);assert(r.status===202 && calls===1);
});
Deno.test('network/model exception remains pending rather than producing a fabricated reply',async()=>{
  const a=admin();let calls=0;const brain=async()=>{calls++;throw new Error('model timeout');};
  assert((await messageTurnRequest(request(),a,key,brain)).status===503);assert((await messageTurnRequest(request(),a,key,brain)).status===202);assert(calls===1);
  assert(a.calls.every((x:any)=>x.name!=='agent_message_turn_finish'));
});
Deno.test('verified account-link acknowledgement skips the financial brain',async()=>{
  const a=admin('account_link');let calls=0;await messageTurnRequest(request(),a,key,async()=>{calls++;return new Response('{}');});assert(calls===0);assert(a.receipt.reply.includes('linked'));
});
Deno.test('brain HTTP failure saves an honest review message without claiming an action failed safely',async()=>{
  const a=admin();await messageTurnRequest(request(),a,key,async()=>new Response(JSON.stringify({error:'internal'}),{status:500}));
  assert(a.calls[1].args.p_status===500);assert(a.calls[1].args.p_replies[0].includes('pending actions'));assert(!a.calls[1].args.p_replies[0].includes('nothing was submitted'));
});
Deno.test('bubbles retain complete money text and links while hiding internal annotations',()=>{
  const text='Rent: $1,234.56. '+('x'.repeat(2500))+' https://example.com/receipt/'+('a'.repeat(1800))+' balance $100.00';
  const bubbles=messageBubbles(text+'<!-- internal action -->');assert(bubbles.every(b=>b.length<=4000));assert(bubbles.join('')===text);
  assert(bubbles.some(b=>b.includes('https://example.com/receipt/'+'a'.repeat(1800))));
});
Deno.test('delivery never silently truncates oversized replies or breaks surrogate pairs',()=>{
  for(const text of ['x'.repeat(16001),'https://example.com/'+'x'.repeat(4100),'<!-- hidden only -->']){let threw=false;try{messageBubbles(text);}catch{threw=true;}assert(threw);}
  const text='x'.repeat(3999)+'😀'+'y'.repeat(100);const bubbles=messageBubbles(text);assert(bubbles.join('')===text);assert(!/[\uD800-\uDBFF]$/.test(bubbles[0]));
});
