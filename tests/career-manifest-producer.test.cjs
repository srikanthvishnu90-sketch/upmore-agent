"use strict";
// Actual service-worker facts -> planSurveyed -> actual contract bundle. Synthetic local Chrome/RPC only.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto'),ROOT=path.join(__dirname,'..'),OWNER='SYN-MANIFEST-PRODUCER';
const own=(value,factId)=>({value,factId,confirmed:true,user_id:OWNER,provenance:'owner stated exact synthetic answer',confirmation_event_id:'SYN-EVENT-'+factId});
function fixture(answers={legal_name:own('Test Legal','SYN-LEGAL')},saved={}){
 const data={auth:{user_id:OWNER,access_token:'SYN-LOCAL-ONLY',expires_at:0},imported_file:{user_id:OWNER,answers,saved}};
 const storage={async get(key){return{[key]:structuredClone(data[key])}},async set(v){Object.assign(data,structuredClone(v))},async remove(){}};
 const noop={addListener(){}},ctx={console,crypto:webcrypto,TextEncoder,TextDecoder,URL,Uint8Array,setTimeout,clearTimeout,structuredClone,importScripts(){},
  TRAINEE_DEFAULTS:{supabaseUrl:'https://synthetic.invalid',anonKey:'SYN-ONLY'},
  fetch:async url=>{assert.equal(url,'https://synthetic.invalid/rest/v1/rpc/career_apply_answers_own');return{ok:true,text:async()=>'[]'}},
  chrome:{storage:{session:storage,local:storage},runtime:{id:'SYN',getURL:p=>'chrome-extension://SYN/'+p,onInstalled:noop,onMessage:noop},tabs:{onUpdated:noop}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,'extension/lib/trainee-core.js'),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(ROOT,'extension/background.js'),'utf8')+'\nglobalThis.__qa={facts,planSurveyed};',ctx);
 return{facts:async()=>ctx.__qa.facts(OWNER),prepare:f=>ctx.__qa.planSurveyed({jobId:'SYN-JOB',company:'Synthetic',family:'ashby',pageUrl:'https://example.invalid/apply',schema:[{name:'legal',label:'Legal name',type:'input_text',required:true,options:[]}]},f,null)};
}
test('manifest producer: actual background retains canonical answer and saved maps beside their evidence',async()=>{
 const f=fixture(undefined,{'favorite question':own('Exact answer','SYN-SAVED')}),m=await f.facts();
 assert.deepEqual(m.manifest.answers,m.answers);assert.deepEqual(m.manifest.saved,m.saved);
 assert.equal(m.manifest.byFactId['SYN-LEGAL'].factId,m.manifest.answers.legal_name.factId);
});
test('manifest producer: actual prepared survey uses the confirmed legal identity without asking again',async()=>{
 const f=fixture(),p=f.prepare(await f.facts());assert.equal(p.needs.length,0);assert.equal(p.batch.ok,true);
 assert.equal(p.batch.posting.answers[0].value,'Test Legal');assert.equal(p.batch.posting.answers[0].factId,'SYN-LEGAL');
});
test('manifest producer control: full-name-only source leaves distinct legal identity as a question',async()=>{
 const f=fixture({full_name:own('Test Public','SYN-FULL')}),p=f.prepare(await f.facts());
 assert.equal(p.needs.length,1);assert.equal(p.batch.ok,false);
});
