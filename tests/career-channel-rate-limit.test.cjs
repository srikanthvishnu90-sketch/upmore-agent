'use strict';
// Real channel handlers, synthetic transport only. The live Case 2 failed
// because an account429 was turned into a generic internal-error reply.
// All phone numbers below use the reserved example range; no real recipient.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
if(!process.execArgv.includes('--experimental-transform-types')){
 test('channel rate-limit recovery',()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;const r=spawnSync(process.execPath,['--experimental-transform-types','--test',__filename],{env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
}else{
 async function world(channel,{status=429,retry='3600',dry=false}={}){
  const F=await import('./edge/lib/channel_fixture.ts');
  const {handleTelegramWebhook}=await import(process.env.UPMORE_TELEGRAM_RELEASE_CONTRACT==='1'
   ? '../supabase/releases/career-case2-isolation-v1/telegram-inbound/_shared/telegram.ts'
   : '../supabase/functions/_shared/telegram_bridge.ts');
  const {handleWhatsappWebhook,twilioSignature}=await import('../supabase/functions/_shared/whatsapp_twilio.ts');
  const admin=new F.FakeAdmin(),calls=[];let upstreamStatus=status;
  const env=F.envOf({SUPABASE_URL:F.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:F.SERVICE_KEY,CHANNEL_TEST_USER_ID:F.TEST_USER,TELEGRAM_BOT_TOKEN:'fixture-token',TELEGRAM_WEBHOOK_SECRET:'fixture-secret',TELEGRAM_ALLOWED_CHAT_IDS:'424242',TWILIO_ACCOUNT_SID:'ACfixture',TWILIO_AUTH_TOKEN:'fixture-auth',TWILIO_WHATSAPP_FROM:'whatsapp:+12025550100',WHATSAPP_ALLOWED_NUMBERS:'+12025550101'});
  const deps={env,createAdmin:()=>admin,paceMs:0,fetchFn:async(url,init)=>{
   calls.push({url:String(url),init});if(String(url).includes('/functions/v1/agent-chat'))return new Response(JSON.stringify(upstreamStatus===200?{reply:'Hello from fixture.'}:{error:upstreamStatus===429?'rate_limited':'internal',message:'upstream detail must not be exposed'}),{status:upstreamStatus,headers:retry===null?{}:{'retry-after':retry}});
   if(String(url).includes('api.telegram.org'))return new Response(JSON.stringify({ok:true,result:{message_id:1}}));
   if(String(url).includes('api.twilio.com'))return new Response(JSON.stringify({sid:'SMfixture'}),{status:201});
   throw Error('unexpected network target');
  }};
  let request;
  if(channel==='telegram')request=(id)=>new Request(F.SUPABASE_URL+'/functions/v1/telegram-inbound'+(dry?'?dry_run=1':''),{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'fixture-secret'},body:JSON.stringify({update_id:id,message:{message_id:id,text:'/start',chat:{id:424242,type:'private'}}})});
  else{
   const url=F.SUPABASE_URL+'/functions/v1/whatsapp-inbound'+(dry?'?dry_run=1':'');
   request=async(id)=>{const params={From:'whatsapp:+12025550101',To:'whatsapp:+12025550100',Body:'/start',MessageSid:'SM'+id,NumMedia:'0'};
    const sig=await twilioSignature('fixture-auth',url,params);
    return new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':sig},body:new URLSearchParams(params)});};
  }
  return {calls,quotaPermits:()=>{upstreamStatus=200;},run:async(id=25)=>channel==='telegram'?handleTelegramWebhook(await request(id),deps):handleWhatsappWebhook(await request(id),deps),agent:()=>calls.filter(x=>x.url.includes('/functions/v1/agent-chat')),sends:()=>calls.filter(x=>x.url.endsWith('/sendMessage')||x.url.includes('api.twilio.com'))};
 }
 for(const channel of ['telegram','whatsapp']){
  test(`${channel}429 is acknowledged truthfully with backoff and no automatic redispatch`,async()=>{
   const w=await world(channel),res=await w.run(),body=await res.json();assert.equal(res.status,200);assert.equal(body.ok,false);assert.equal(body.error,'rate_limited');assert.equal(body.retry_after_seconds,3600);
   assert.equal(w.agent().length,1);assert.equal(w.sends().length,1);
   const call=w.sends()[0],text=channel==='telegram'?JSON.parse(call.init.body).text:new URLSearchParams(call.init.body).get('Body');
   assert.match(text,/message limit/i);assert.doesNotMatch(text,/Something went wrong|nothing was changed|upstream detail/);
   const duplicate=await w.run();assert.equal((await duplicate.json()).ignored,'duplicate webhook');assert.equal(w.agent().length,1);assert.equal(w.sends().length,1);
  });
  test(`${channel}dry run exposes429 without sending a notice`,async()=>{
   const w=await world(channel,{dry:true}),res=await w.run();assert.equal((await res.json()).error,'rate_limited');assert.equal(w.agent().length,1);assert.equal(w.sends().length,0);
  });
  test(`${channel}a new explicit message succeeds only when upstream quota permits it`,async()=>{
   const w=await world(channel);assert.equal((await(await w.run()).json()).error,'rate_limited');
   w.quotaPermits();const body=await(await w.run(26)).json();assert.equal(body.ok,true);assert.equal(body.parts_sent,1);assert.equal(w.agent().length,2);assert.equal(w.sends().length,2);
  });
  test(`${channel}unrelated upstream500 remains an internal failure`,async()=>{
   const w=await world(channel,{status:500}),res=await w.run();assert.equal(res.status,500);assert.equal((await res.json()).error,'internal');assert.equal(w.agent().length,1);
  });
 }
 for(const retry of [null,'not-a-delay','9999999999999999'])test(`untrusted Retry-After is not reflected: ${retry}`,async()=>{
  const w=await world('telegram',{retry}),body=await(await w.run()).json();assert.equal(body.error,'rate_limited');assert.equal(body.retry_after_seconds,null);
 });
}
