'use strict';
// MOCK_CONTRACT: actual staged gateway; injected transport only. No credentials
// or provider calls. Freeze these outcomes before changing the shared gateway.
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../helpers/career-model-fixture.cjs');
const cfg={provider:'openai',model:'gpt-5-nano',apiKey:'SYNTHETIC_NOT_REAL',reasoningEffort:null};
const payload={messages:[{role:'user',content:'Synthetic deadline check.'}],max_tokens:16};
const message=(text='Synthetic answer.')=>JSON.stringify({choices:[{message:{content:text},finish_reason:'stop'}],usage:{prompt_tokens:4,completion_tokens:2}});
async function gateway(t){return (await F.fixture(t)).app.exportsFor('_shared/model_gateway.ts');}
async function bounded(p){let timer;try{return await Promise.race([p,new Promise(resolve=>{timer=setTimeout(()=>resolve({escaped_deadline:true}),250);})]);}finally{clearTimeout(timer);}}
async function rejected(p,type){const result=await bounded(p.then(()=>({unexpected_success:true}),e=>({type:e.type})));assert.deepEqual(result,{type});}
test('deadline bounds a transport that ignores the abort signal before headers',async t=>{
 const g=await gateway(t);let signal;
 await rejected(g.callModel(cfg,payload,{timeoutMs:25,request:async(_u,init)=>{signal=init.signal;return await new Promise(()=>{});}}),'timeout');assert.equal(signal.aborted,true);
});
for(const status of [200,503])test('deadline bounds and cancels a stalled '+status+' response body',async t=>{
 const g=await gateway(t);let cancelled=false,signal;
 const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
 await rejected(g.callModel(cfg,payload,{timeoutMs:25,request:async(_u,init)=>{signal=init.signal;return new Response(body,{status});}}),'timeout');
 assert.equal(signal.aborted,true);assert.equal(cancelled,true);
});
test('an already aborted parent prevents dispatch',async t=>{
 const g=await gateway(t),controller=new AbortController();controller.abort();let calls=0;
 await rejected(g.callModel(cfg,payload,{signal:controller.signal,request:async()=>{calls++;return new Response(message());}}),'aborted');assert.equal(calls,0);
});
test('parent abort cancels a body read after headers',async t=>{
 const g=await gateway(t),controller=new AbortController();let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}});
 const pending=g.callModel(cfg,payload,{signal:controller.signal,timeoutMs:200,request:async()=>new Response(body)}),timer=setTimeout(()=>controller.abort(),5);
 try{await rejected(pending,'aborted');}finally{clearTimeout(timer);}assert.equal(cancelled,true);
});
test('response size is measured in UTF-8 bytes before parsing',async t=>{
 const g=await gateway(t),raw=message('界'.repeat(80000));assert.ok(raw.length<200000);assert.ok(Buffer.byteLength(raw)>200000);
 await rejected(g.callModel(cfg,payload,{request:async()=>new Response(raw)}),'too_large');
});
test('over-limit stream is cancelled without draining the remaining response',async t=>{
 const g=await gateway(t);let pulled=0,cancelled=false;
 const body=new ReadableStream({pull(c){pulled++;c.enqueue(new Uint8Array(8192).fill(32));if(pulled===80)c.close();},cancel(){cancelled=true;}});
 await rejected(g.callModel(cfg,payload,{request:async()=>new Response(body)}),'too_large');assert.equal(cancelled,true);assert.ok(pulled<30,`read ${pulled} chunks`);
});
test('bounded successful raw usage retains exact normal gateway translation',async t=>{
 const g=await gateway(t),r=await g.callModel(cfg,payload,{requireUsageReceipt:true,request:async()=>new Response(message())});
 assert.equal(r.content[0].text,'Synthetic answer.');assert.equal(r.usage.input_tokens,4);assert.equal(r.usage.output_tokens,2);
});
