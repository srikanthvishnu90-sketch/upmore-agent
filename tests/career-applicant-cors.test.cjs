'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('actual applicant entry permits the shipped client public apikey preflight only for configured origins',async()=>{
 let auth=0,rpcs=0;const app=await require('./helpers/applicant-ingress-entry.cjs')({authenticate:async()=>{auth++;return null;},rpc:async()=>{rpcs++;throw Error('Unexpected write');}});
 const request=origin=>new Request('https://synthetic-app.test/career-applicant/uploads',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'apikey,authorization,content-type'}});
 const allowed=await app.request(request('https://synthetic-app.test'));assert.equal(allowed.status,204);assert.ok(allowed.headers.get('access-control-allow-headers').split(',').includes('apikey'));
 const denied=await app.request(request('https://unconfigured.test'));assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);assert.equal(auth,0);assert.equal(rpcs,0);
});
