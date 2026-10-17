'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const U='00000000-0000-4000-8000-000000000001',T='00000000-0000-4000-8000-000000000003';
const request=body=>new Request('https://synthetic-app.test/career-batch',{method:'POST',headers:{authorization:'Bearer synthetic-owner','content-type':'application/json'},body:JSON.stringify(body)});
test('actual batch entry authenticates owner and excludes injected profile, owner and posting data',async()=>{
 let calls=0;const app=await require('./helpers/application-batch-entry.cjs')({authenticate:async t=>t==='synthetic-owner'?{id:U}:null,rpc:async(name,args)=>{calls++;assert.equal(name,'career_application_batch_control_v1');assert.equal(args.p_user,U);return {data:{version:'career_application_batch/v1',batchId:T},error:null};}});
 assert.equal((await app.request(new Request('https://synthetic-app.test/career-batch',{method:'POST',body:'{}'}))).status,401);
 const body={threadId:T,requestId:'test',action:'create',input:{taskIds:['a'.repeat(32)]}};
 for(const key of ['userId','profile','posting','serviceRole'])assert.equal((await app.request(request({...body,[key]:'injected'}))).status,400);
 assert.equal(calls,0);assert.equal((await app.request(request(body))).status,200);assert.equal(calls,1);
 const preflight=await app.request(new Request('https://synthetic-app.test/career-batch',{method:'OPTIONS',headers:{origin:'https://synthetic-app.test','access-control-request-headers':'apikey,authorization,content-type'}}));assert.equal(preflight.status,204);assert.ok(preflight.headers.get('access-control-allow-headers').split(',').includes('apikey'));
});
test('lost batch acknowledgement asks for the same request ID; explicit role answers cannot contain identity digits',async()=>{
 const app=await require('./helpers/application-batch-entry.cjs')({authenticate:async()=>({id:U}),rpc:async()=>{throw Error('lost acknowledgement');}});
 const body={threadId:T,requestId:'exact-request',action:'approve',input:{batchId:T,reviewHash:'a'.repeat(64),message:'Approve batch '+ 'a'.repeat(64)}};
 const lost=await app.request(request(body));assert.equal(lost.status,503);assert.equal((await lost.json()).retrySameRequestId,true);
 assert.equal((await app.request(request({...body,action:'answers',input:{answers:[{value:'SSN 123-45-6789'}]}}))).status,400);
});
test('changed question wording refuses a scoped answer; missing eligibility is not invented',()=>{
 const B=require('../workers/career-browser/batch-context.cjs'),field={field_id:'attest',kind:'attestation',label:'Exact original terms',required:true};
 const answer={fieldId:'attest',questionSha256:B.digest(field),value:true};
 const changed={profile:{},attestations:{}};assert.deepEqual(B.applyAnswers(changed,[{...field,label:'Different terms'}],[answer]),['attest']);assert.deepEqual(changed.attestations,{});
 assert.equal(B.eligibility({spec:{posting:{}}},{},{records:[]},Date.now()).code,'CURRENT_ELIGIBILITY_CONTEXT_REQUIRED');
 const e={profile:{},attestations:{}};B.applyAnswers(e,[field],[answer]);assert.deepEqual(e.attestations.attest,{explicit:true,value:true});
});
