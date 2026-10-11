import {deliverMessage,loopMessageTransport} from '../../supabase/functions/_shared/message_delivery.ts';
function assert(v:unknown){if(!v)throw new Error('assertion failed');}
async function rejects(fn:()=>Promise<unknown>){try{await fn();}catch{return;}throw new Error('expected rejection');}
const channel={id:'channel',user_id:'owner',provider:'loopmessage',account_key:'upmore',contact:'+13125550123',status:'active'};
function admin(state='queued',id:string|null=null){
  const item:any={id:'outbox',user_id:'owner',channel_id:channel.id,text:'Your bill review is ready.',state,provider_message_id:id};
  const calls:any[]=[];
  return {item,calls,failSave:false,blocked:false,
    from(table:string){const q:any={select(){return q;},eq(){return q;},async single(){return {data:table==='agent_message_outbox'?{...item}:channel};}};return q;},
    async rpc(name:string,args:any){calls.push({name,args});if(name==='agent_message_begin_delivery'){
      if(this.blocked)return {data:null};item.state='submitted';return {data:{outbox:{...item},channel}};
    }
    if(this.failSave)return {error:{message:'simulated storage failure'}};
    item.state=args.p_state;item.provider_message_id=args.p_message;return {data:{...item}};},
  };
}
function adapter(a:ReturnType<typeof admin>,fail=false){const calls={send:0,lookup:0};return {calls,provider:'loopmessage',account_key:'upmore',verified:true,
  async send(){calls.send++;assert(a.item.state==='submitted');if(fail)throw new Error('timeout');return {state:'accepted',message_id:'provider-1'};},
  async lookup(){calls.lookup++;return {state:'delivered',message_id:'provider-1'};},
};}
Deno.test('new outbound submission has a durable marker and acceptance is not delivery',async()=>{
  const a=admin(),t=adapter(a);const r=await deliverMessage(a,'outbox',[t]);assert(r.state==='accepted');assert(t.calls.send===1 && t.calls.lookup===0);
});
Deno.test('timeout cannot resend when the provider receipt is unknown',async()=>{
  const a=admin(),t=adapter(a,true);await deliverMessage(a,'outbox',[t]);assert(a.item.state==='unknown');
  await deliverMessage(a,'outbox',[t]);assert(t.calls.send===1 && t.calls.lookup===0);assert(a.item.state==='unknown');
});
Deno.test('known provider ID recovers with lookup instead of send',async()=>{
  const a=admin('submitted','provider-1'),t=adapter(a);const r=await deliverMessage(a,'outbox',[t]);
  assert(r.state==='delivered');assert(t.calls.send===0 && t.calls.lookup===1);
});
Deno.test('storage failure after accepted send preserves submission and prevents resending',async()=>{
  const a=admin(),t=adapter(a);a.failSave=true;await rejects(()=>deliverMessage(a,'outbox',[t]));
  assert(a.item.state==='submitted');a.failSave=false;await deliverMessage(a,'outbox',[t]);assert(t.calls.send===1);assert(a.item.state==='unknown');
});
Deno.test('terminal messages, missing transport and failed preflight never send',async()=>{
  for(const state of ['delivered','failed','cancelled']){const a=admin(state),t=adapter(a);await deliverMessage(a,'outbox',[t]);assert(t.calls.send===0);}
  const a=admin(),t=adapter(a);await deliverMessage(a,'outbox',[]);assert(a.calls.length===0);a.blocked=true;await deliverMessage(a,'outbox',[t]);assert(t.calls.send===0);
});
Deno.test('provider send validates full recipient and only records queue acceptance',async()=>{
  let payload:any;const t=loopMessageTransport('fixture-key',async(_url,init)=>{
    payload=JSON.parse(init!.body as string);return new Response(JSON.stringify({message_id:'provider-1',contact:channel.contact}),{status:200});
  });
  assert(!t.verified);const r=await t.send({id:'outbox',text:'hello'},channel);assert(r.state==='accepted');assert(payload.passthrough==='outbox');assert(payload.contact===channel.contact);
});
Deno.test('provider acceptance with another recipient or missing ID is not a verified receipt',async()=>{
  for(const body of [{message_id:'provider-1',contact:'+13125550999'},{contact:channel.contact},{message_id:'provider-1',contact:channel.contact,success:false}]){
    const t=loopMessageTransport('fixture-key',async()=>new Response(JSON.stringify(body)));await rejects(()=>t.send({id:'outbox',text:'hello'},channel));
  }
});
Deno.test('provider lookup binds original message and recipient and never treats not-found as permission to send',async()=>{
  let seen='';const t=loopMessageTransport('fixture-key',async url=>{seen=String(url);return new Response(JSON.stringify({message_id:'provider-1',contact:channel.contact,status:'delivered'}));});
  assert((await t.lookup({provider_message_id:'provider-1'},channel))?.state==='delivered');assert(seen==='https://a.loopmessage.com/v1/message/status/provider-1/');
  const wrong=loopMessageTransport('fixture-key',async()=>new Response(JSON.stringify({message_id:'different',contact:channel.contact,status:'delivered'})));
  await rejects(()=>wrong.lookup({provider_message_id:'provider-1'},channel));
  const missing=loopMessageTransport('fixture-key',async()=>new Response('{}',{status:404}));assert(await missing.lookup({provider_message_id:'provider-1'},channel)===null);
});
