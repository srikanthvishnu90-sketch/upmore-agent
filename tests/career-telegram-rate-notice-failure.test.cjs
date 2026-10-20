'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
if(!process.execArgv.includes('--experimental-transform-types')){
 test('Telegram rate-limit notice delivery failure',()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;const r=spawnSync(process.execPath,['--experimental-transform-types','--test',__filename],{env,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);});
}else{

async function fixture(mode){
  const F=await import('./edge/lib/channel_fixture.ts');
  const {handleTelegramWebhook}=await import(process.env.UPMORE_TELEGRAM_RELEASE_CONTRACT==='1'
    ? '../supabase/releases/career-case2-isolation-v1/telegram-inbound/_shared/telegram.ts'
    : '../supabase/functions/_shared/telegram_bridge.ts');
  const admin=new F.FakeAdmin(),calls=[];
  const env=F.envOf({SUPABASE_URL:F.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:F.SERVICE_KEY,CHANNEL_TEST_USER_ID:F.TEST_USER,TELEGRAM_BOT_TOKEN:'fixture-token',TELEGRAM_WEBHOOK_SECRET:'fixture-secret',TELEGRAM_ALLOWED_CHAT_IDS:'424242'});
  const deps={env,createAdmin:()=>admin,paceMs:0,fetchFn:async(url,init)=>{
    const u=String(url);calls.push({url:u,init});
    if(u.endsWith('/functions/v1/agent-chat'))return new Response(JSON.stringify({error:'rate_limited'}),{status:429,headers:{'retry-after':'3600'}});
    if(u.endsWith('/sendChatAction'))return new Response(JSON.stringify({ok:true}));
    if(u.endsWith('/sendMessage')){
      if(mode==='network')throw Error('synthetic network failure');
      return new Response(JSON.stringify({ok:false,description:'synthetic transport refusal'}),{status:mode});
    }
    throw Error('unexpected network target');
  }};
  const request=()=>new Request(F.SUPABASE_URL+'/functions/v1/telegram-inbound',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'fixture-secret'},body:JSON.stringify({message:{message_id:25,text:'/start',chat:{id:424242,type:'private'}}})});
  return {run:()=>handleTelegramWebhook(request(),deps),calls};
}

for(const failure of [429,503,'network'])test(`Telegram quota refusal remains acknowledged when notice delivery fails: ${failure}`,async()=>{
  const w=await fixture(failure),res=await w.run(),body=await res.json();
  assert.equal(res.status,200,'notice transport must not reclassify a known quota refusal');
  assert.equal(body.error,'rate_limited');assert.equal(body.retry_after_seconds,3600);
  assert.equal(w.calls.filter(c=>c.url.endsWith('/functions/v1/agent-chat')).length,1);
  assert.equal(w.calls.filter(c=>c.url.endsWith('/sendMessage')).length,1);
  const duplicate=await w.run();assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).ignored,'duplicate webhook');
  assert.equal(w.calls.filter(c=>c.url.endsWith('/functions/v1/agent-chat')).length,1);
  assert.equal(w.calls.filter(c=>c.url.endsWith('/sendMessage')).length,1);
});
}
