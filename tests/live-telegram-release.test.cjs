'use strict';
// The actual pinned Telegram package, with synthetic storage and transport.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
if(!process.execArgv.includes('--experimental-transform-types')){
 test('pinned Telegram document ownership and bytes',()=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(process.execPath,['--experimental-transform-types','--test',__filename],{env,encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
 });
}else{
 const bytes=new TextEncoder().encode('%PDF-1.4 synthetic document — exact stored bytes');
 async function fixture(owner){
  const F=await import('./edge/lib/channel_fixture.ts');
  const {handleTelegramWebhook}=await import('../supabase/releases/career-case2-isolation-v1/telegram-inbound/_shared/telegram.ts');
  const admin=new F.FakeAdminArtifacts();
  if(owner!=='missing')admin.artifacts.set('synthetic-document',{
   id:'synthetic-document',user_id:owner==='self'?F.TEST_USER:'00000000-0000-4000-8000-000000000002',
   thread_id:'thread-1',kind:'document',filename:'Synthetic_Resume.pdf',mime:'application/pdf',
   bytes_b64:Buffer.from(bytes).toString('base64'),sha256:'f'.repeat(64),
   created_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),
  });
  const f=F.fakeFetchRich({chat:()=>({reply:'Your tailored resume is attached.',artifacts:[{kind:'document',ref:'synthetic-document',filename:'Synthetic_Resume.pdf',mime:'application/pdf'}]})});
  const env=F.envOf({SUPABASE_URL:F.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:F.SERVICE_KEY,
   TELEGRAM_BOT_TOKEN:'fixture-token',TELEGRAM_WEBHOOK_SECRET:'fixture-secret',
   CHANNEL_TEST_USER_ID:F.TEST_USER,TELEGRAM_ALLOWED_CHAT_IDS:'424242'});
  const request=new Request(F.SUPABASE_URL+'/functions/v1/telegram-inbound',{method:'POST',
   headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'fixture-secret'},
   body:JSON.stringify({update_id:9011,message:{message_id:11,text:'send me the PDF',chat:{id:424242,type:'private'}}})});
  const res=await handleTelegramWebhook(request,{env,fetchFn:f.fn,createAdmin:()=>admin,paceMs:0});
  return {res,docs:f.calls.filter(c=>c.url.endsWith('/sendDocument')),
   texts:f.calls.filter(c=>c.url.endsWith('/sendMessage')).map(c=>JSON.parse(c.init.body).text)};
 }
 test('pinned Telegram delivers exactly the stored owner document bytes',async()=>{
  const w=await fixture('self');assert.equal(w.res.status,200);assert.equal(w.docs.length,1);
  const body=w.docs[0].init.body;assert.ok(body instanceof FormData);
  const file=body.get('document');assert.equal(file.name,'Synthetic_Resume.pdf');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()),bytes);
  assert.equal(String(body.get('chat_id')),'424242');assert.ok(w.texts.some(t=>t.includes('tailored resume')));
 });
 for(const owner of ['foreign','missing'])test(`pinned Telegram refuses a ${owner} document without losing reply text`,async()=>{
  const w=await fixture(owner);assert.equal(w.res.status,200);assert.equal(w.docs.length,0);
  assert.ok(w.texts.some(t=>t.includes("didn't go through")));assert.ok(w.texts.some(t=>t.includes('tailored resume')));
 });
}
