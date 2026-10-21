"use strict";
// Actual service-worker handle + actual trustedManifest bundle. Only Chrome storage/session are synthetic local fixtures.
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const ROOT = path.join(__dirname, ".."), OWNER = "SYNTHETIC-RECEIPT-OWNER";
const own = (value="SYNTHETIC-PRIOR",factId="SYNTHETIC-PRIOR") => ({value,factId,confirmed:true,user_id:OWNER,provenance:"owner stated in synthetic fixture",confirmation_event_id:"SYNTHETIC-PRIOR-EVENT"});
function fixture() {
 const data={auth:{user_id:OWNER,email:"synthetic@example.test",expires_at:0},imported_file:{user_id:OWNER,answers:{phone:own()},saved:{}}},writes=[];let network=0;
 const storage={async get(k){return{[k]:structuredClone(data[k])}},async set(v){writes.push(structuredClone(v));Object.assign(data,structuredClone(v))},async remove(ks){for(const k of Array.isArray(ks)?ks:[ks])delete data[k]}};
 const noop={addListener(){}};
 const ctx={console,crypto:webcrypto,TextEncoder,TextDecoder,URL,Uint8Array,setTimeout,clearTimeout,structuredClone,importScripts(){},fetch(){network++;throw Error("network forbidden")},chrome:{storage:{session:storage,local:storage},runtime:{id:"SYNTHETIC",getURL:p=>"chrome-extension://SYNTHETIC/"+p,onInstalled:noop,onMessage:noop},tabs:{onUpdated:noop}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(ROOT,"extension/lib/trainee-core.js"),"utf8"),ctx);
 vm.runInContext(fs.readFileSync(path.join(ROOT,"extension/background.js"),"utf8")+"\nglobalThis.__handle=handle;",ctx);
 const sender={id:"SYNTHETIC",url:"chrome-extension://SYNTHETIC/panel.html"};
 return{data,writes,network:()=>network,async send(m,s=sender){return JSON.parse(JSON.stringify(await ctx.__handle({type:"import-facts",...m},s)))}};
}
const doc=(rows={first_name:{value:"SYNTHETIC-FIRST",factId:"SYNTHETIC-FIRST",confirmed:true}})=>({format:"trainee-facts",version:1,user_id:OWNER,answers:rows,saved:{}});
async function preview(f,d=doc()){const json=JSON.stringify(d),r=await f.send({phase:"preview",json});return{json,r};}
const confirm=(p,row=p.r.receipt.needs_review[0],extra={})=>({phase:"confirm",json:p.json,actor_id:OWNER,review_token:p.r.receipt.review_token,payload_hash:p.r.receipt.payload_hash,row:{table:row.table,key:row.key,factId:row.factId,value_hash:row.value_hash},...extra});

test("import receipt: unsupported envelopes versions and typed values never erase prior maps",async()=>{
 for(const d of [{user_id:OWNER,facts:[{text:"SYNTHETIC-RAW"}]},{...doc(),version:99},doc({first_name:{value:true,factId:"SYNTHETIC-BOOLEAN",confirmed:true}})]){
  const f=fixture(),before=JSON.stringify(f.data.imported_file),r=await f.send({json:JSON.stringify(d)});
  assert.equal(JSON.stringify(f.data.imported_file),before,"invalid import erased prior answers");assert.equal(r.receipt?.accepted?.length,0);assert.equal(f.network(),0);
 }
});
test("import receipt: file confirmation flags alone produce review rows without importing",async()=>{
 const f=fixture(),before=JSON.stringify(f.data.imported_file),p=await preview(f,doc({first_name:own("SYNTHETIC-FIRST","SYNTHETIC-FIRST"),last_name:own("SYNTHETIC-LAST","SYNTHETIC-LAST")}));
 assert.equal(JSON.stringify(f.data.imported_file),before);assert.equal(p.r.receipt.accepted.length,0);assert.equal(p.r.receipt.needs_review.length,2);assert.ok(p.r.receipt.review_token);assert.equal(p.r.receipt.actor_id,OWNER);
});
test("import receipt: exact owned row review creates grounded confirmation event and preserves other maps",async()=>{
 const f=fixture(),p=await preview(f),r=await f.send(confirm(p));
 assert.equal(r.ok,true);assert.equal(r.receipt.accepted.length,1);const a=r.receipt.accepted[0],stored=f.data.imported_file.answers.first_name;
 assert.equal(a.actor_id,OWNER);assert.match(a.confirmation_event_id,/^panel-import:/);assert.equal(stored.confirmation_event_id,a.confirmation_event_id);assert.equal(stored.user_id,OWNER);assert.equal(stored.provenance,a.provenance);
 assert.equal(stored.value,"SYNTHETIC-FIRST");assert.equal(f.data.imported_file.answers.phone.value,"SYNTHETIC-PRIOR");assert.ok(f.data.fact_import_receipts.some(x=>x.id===r.receipt.id&&x.actor_id===OWNER));assert.equal(f.network(),0);
});
test("import receipt: actor payload row and sender substitutions cannot commit",async()=>{
 for(const mutation of [{actor_id:"SYNTHETIC-OTHER"},{payload_hash:"0".repeat(64)},{row:{table:"answers",key:"last_name",factId:"SYNTHETIC-OTHER",value_hash:"0".repeat(64)}}]){
  const f=fixture(),p=await preview(f),before=JSON.stringify(f.data.imported_file),r=await f.send(confirm(p,undefined,mutation));assert.equal(r.ok,false);assert.equal(JSON.stringify(f.data.imported_file),before);
 }
 const f=fixture(),before=JSON.stringify(f.data.imported_file),r=await f.send({phase:"preview",json:JSON.stringify(doc())},{id:"SYNTHETIC",url:"https://employer.invalid/form",tab:{id:1}});assert.equal(r.ok,false);assert.equal(JSON.stringify(f.data.imported_file),before);
});
test("import receipt: quarantine cannot be cleared by a new row-review event",async()=>{
 const f=fixture(),before=JSON.stringify(f.data.imported_file),p=await preview(f,doc({sponsorship:own("No","F-033")}));
 assert.equal(p.r.receipt.needs_review.length,0);assert.match(p.r.receipt.rejected[0].reason,/quarantin/i);assert.equal(JSON.stringify(f.data.imported_file),before);
});
test("import receipt: mixed input reports rejected rows and only the selected valid row is imported",async()=>{
 const f=fixture(),p=await preview(f,doc({first_name:{value:"SYNTHETIC-FIRST",factId:"SYNTHETIC-FIRST"},last_name:{value:false,factId:"SYNTHETIC-BAD"}}));
 assert.equal(p.r.receipt.rejected.length,1);assert.equal(p.r.receipt.needs_review.length,1);const r=await f.send(confirm(p));assert.equal(r.receipt.accepted.length,1);assert.equal(f.data.imported_file.answers.last_name,undefined);assert.equal(f.data.imported_file.answers.phone.value,"SYNTHETIC-PRIOR");
});
test("import receipt: a lost acknowledgement can replay the exact row without creating a second event",async()=>{
 const f=fixture(),p=await preview(f),m=confirm(p),r=await f.send(m),before=JSON.stringify(f.data.imported_file),again=await f.send(m);
 assert.equal(again.ok,true);assert.equal(again.receipt.id,r.receipt.id);assert.equal(again.receipt.accepted[0].confirmation_event_id,r.receipt.accepted[0].confirmation_event_id);assert.equal(JSON.stringify(f.data.imported_file),before);
});
test("import receipt: generated nested provenance and excluded derivations cannot be relabelled by review",async()=>{
 for(const extra of [{provenance:{quarantined:true}},{source:"agent"},{source:"user",origin:"agent"},{provenance:{source:"user",origin:"assistant"}},{provenance:"inferred by agent from unknown source"},{derived_from:["F-033"]},{provenance:"owner-delegated answer-all"}]){
  const f=fixture(),before=JSON.stringify(f.data.imported_file),p=await preview(f,doc({first_name:{value:"SYNTHETIC-DENIED",factId:"SYNTHETIC-DENIED",...extra}}));
  if(p.r.receipt.needs_review.length){const r=await f.send(confirm(p));assert.equal(r.ok,false);assert.equal(r.receipt.accepted.length,0);}else assert.equal(p.r.receipt.rejected.length,1);
  assert.equal(JSON.stringify(f.data.imported_file),before);
 }
});
test("import receipt: actor change and altered JSON invalidate the exact-row token",async()=>{
 const f=fixture(),p=await preview(f),m=confirm(p),before=JSON.stringify(f.data.imported_file);
 const changed=JSON.parse(p.json);changed.answers.first_name.value="SYNTHETIC-UNSEEN";
 assert.equal((await f.send({...m,json:JSON.stringify(changed)})).ok,false);
 f.data.auth={...f.data.auth,user_id:"SYNTHETIC-OTHER"};assert.equal((await f.send(m)).ok,false);assert.equal(JSON.stringify(f.data.imported_file),before);
});
test("import receipt: concurrent owned rows merge and imported flags cannot authorize an attestation",async()=>{
 const f=fixture(),p=await preview(f,doc({first_name:{value:"SYNTHETIC-FIRST",factId:"SYNTHETIC-FIRST",authorizes:true}})),q=await preview(f,doc({last_name:{value:"SYNTHETIC-LAST",factId:"SYNTHETIC-LAST"}}));
 const r=await Promise.all([f.send(confirm(p)),f.send(confirm(q))]);assert.ok(r.every(x=>x.ok));assert.equal(f.data.imported_file.answers.first_name.authorizes,false);assert.ok(f.data.imported_file.answers.phone&&f.data.imported_file.answers.first_name&&f.data.imported_file.answers.last_name);assert.equal(f.data.fact_import_receipts.length,2);
});
