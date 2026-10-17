'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('actual applicant entry permits the shipped client public apikey preflight only for configured origins',async()=>{
 let auth=0,rpcs=0;const app=await require('./helpers/applicant-ingress-entry.cjs')({authenticate:async()=>{auth++;return null;},rpc:async()=>{rpcs++;throw Error('Unexpected write');}});
 const request=origin=>new Request('https://synthetic-app.test/career-applicant/uploads',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'apikey,authorization,content-type'}});
 const allowed=await app.request(request('https://synthetic-app.test'));assert.equal(allowed.status,204);assert.ok(allowed.headers.get('access-control-allow-headers').split(',').includes('apikey'));
 const denied=await app.request(request('https://unconfigured.test'));assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);assert.equal(auth,0);assert.equal(rpcs,0);
});
test('metadata status uses only authenticated owner/thread read RPC and rejects injected data',async()=>{
 const U='00000000-0000-4000-8000-000000000001',T='00000000-0000-4000-8000-000000000003';let calls=0;
 const app=await require('./helpers/applicant-ingress-entry.cjs')({authenticate:async()=>({id:U}),rpc:async(name,args)=>{calls++;assert.equal(name,'career_applicant_status_v1');assert.deepEqual(JSON.parse(JSON.stringify(args)),{p_user:U,p_thread:T});return {data:{version:'career_applicant_status/v1',userId:U,threadId:T,status:'none',applicant:null},error:null};}});
 const request=body=>new Request('https://synthetic-app.test/career-applicant/status',{method:'POST',headers:{authorization:'Bearer synthetic-owner','content-type':'application/json'},body:JSON.stringify(body)});
 for(const extra of [{userId:'foreign'},{includeBytes:true},{artifactId:'guessed'},{fields:{}}])assert.equal((await app.request(request({threadId:T,...extra}))).status,400);
 assert.equal(calls,0);assert.equal((await app.request(request({threadId:T}))).status,200);assert.equal(calls,1);
});
