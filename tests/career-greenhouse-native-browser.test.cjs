'use strict';
// Real sandboxed Chromium ONLY; a blocked runtime is an explicit skip, never
// substituted with an HTTP client or a modeled browser. Local candidate/server
// and SQL authority are SYNTHETIC/MOCK. Zero employer evidence is produced.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{fork}=require('node:child_process');
const Browser=require('../packages/domain/150-career-portal-browser.js');
const {createWorker}=require('../workers/career-browser/service.cjs');
const {createFileTaskStore,hash}=require('../workers/career-browser/store.cjs');
const {mockAuthority,bindMockTaskClient}=require('./fixtures/owned-worker-authority.cjs');
const {manifest}=require('./fixtures/greenhouse-native/manifest.cjs');
const {equipment}=require('./fixtures/greenhouse-native/equipment.cjs');
let blocked,root,server,m;
const report={verification:'MODELED_LOOPBACK_BROWSER_NOT_EMPLOYER',status:'NOT_RUN',chromiumSandbox:true,tests:[]};
before(async()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'MODELED-native-browser-'));let browser;
 try{const pw=require(process.env.UPMORE_PLAYWRIGHT_PATH||'playwright');browser=await pw.chromium.launch({headless:true,chromiumSandbox:true,...(process.env.UPMORE_CHROMIUM_PATH?{executablePath:process.env.UPMORE_CHROMIUM_PATH}:{}),timeout:15000});report.version=browser.version();}
 catch(error){blocked=(error.code||'SANDBOXED_BROWSER_UNAVAILABLE')+': '+String(error.message).slice(0,12000);report.status='BLOCKED';report.blocker=blocked;return;}
 finally{await browser?.close();}
 const receiptRoot=path.join(root,'receipts');fs.mkdirSync(receiptRoot,{mode:0o700});server=fork(path.join(__dirname,'fixtures/greenhouse-native/server.cjs'),[receiptRoot],{stdio:['ignore','ignore','inherit','ipc']});
 const {port}=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject);});m=manifest('http://localhost:'+port);
});
after(()=>{Browser.shutdownAll();server?.kill();if(process.env.UPMORE_NATIVE_REPORT)fs.writeFileSync(process.env.UPMORE_NATIVE_REPORT,JSON.stringify(report,null,2)+'\n',{mode:0o600});if(root)fs.rmSync(root,{recursive:true,force:true});});
for(const type of ['pdf','docx'])test('sandboxed native '+type+' bytes, exact confirmed fields, one submit and independent modeled-server readback',t=>{
 if(blocked){t.skip(blocked.split('\n').slice(0,2).join(' '));return;}
 const dir=path.join(root,type);fs.mkdirSync(dir,{mode:0o700});const authority=mockAuthority(dir),e=equipment(path.join(dir,'private-bytes'),authority,type),store=createFileTaskStore(path.join(dir,'tasks'));let latestBoard;
 t.after(()=>{e.resolver.close();});
 const evidenceRoot=process.env.UPMORE_NATIVE_EVIDENCE_DIR?path.join(process.env.UPMORE_NATIVE_EVIDENCE_DIR,type):path.join(dir,'evidence');
 const worker=bindMockTaskClient(createWorker({store,authority,nativePortals:[m],evidenceRoot,evidenceRequired:true,timeoutMs:120000,resolveEquipment:e.resolver.resolveEquipment,
  boardFactory:opts=>(latestBoard=Browser.createBrowserBoard(opts)),
  readReceipt(task){
   // Local MOCK adapter independently correlates the server's real request and
   // multipart fields to the browser capture, then to the approved task. The
   // task/user fields below are local correlation, never employer claims.
   const cap=latestBoard?.nativeReceiptCapture;if(cap?.status!=='receipt_observed')return null;
   const p=path.join(root,'receipts',cap.confirmationId+'.json');if(!fs.existsSync(p))return null;const r=JSON.parse(fs.readFileSync(p));
   if(r.requestSha256!==cap.outbound?.requestSha256||r.receivedResumeSha256!==e.sha256||r.contentType!==e.records.artifact.contentType||r.internalHeaders.length)return null;
   const observed={};for(const key of Object.keys(task.review.payload)){
    if(key==='resume_sha256')observed[key]=r.receivedResumeSha256;
    else {const f=m.fields.find(f=>f.field_id===key);observed[key]=key==='resume'?{filename:r.filename,sha256:r.receivedResumeSha256}:f.inputType==='select'?f.options.find(o=>o.value===r.fields[f.name])?.label:r.fields[f.name];}
   }
   if(hash(observed)!==task.attempt.payloadSha256)return null;
   return {source:'controlled_portal_readback',outcome:'accepted',taskId:task.id,userId:task.userId,destination:task.attempt.destination,payloadSha256:hash(observed),resumeSha256:r.receivedResumeSha256,receivedPayloadSha256:hash(observed),receivedResumeSha256:r.receivedResumeSha256,receivedFileBytes:r.receivedFileBytes,confirmationId:r.confirmationId,verification:'MODELED_LOOPBACK_ONLY'};
  }
 }),authority);
 const input={eventId:'synthetic-'+type,posting:{url:m.url,canonicalKey:m.canonicalKey,status:'open',company:'MODELED ONLY',role:'Synthetic role'},artifactId:e.artifactId,resumeSha256:e.sha256};
 const queued=worker.receive(e.userId,input),prepared=worker.prepare(e.userId,queued.id);assert.equal(prepared.status,'review_ready',JSON.stringify(prepared));assert.equal(prepared.review.payload.first_name,'Synthetic');assert.equal(prepared.review.payload.last_name,'Native Test');
 const approval={approvedByUser:true,approvalRef:'MODELED-approval-'+type,payloadSha256:prepared.review.payloadSha256,resumeSha256:e.sha256,destination:m.submitUrl};
 const done=worker.approve(e.userId,queued.id,approval);report.tests.push({type,queued,prepared,done,resumeBytes:e.bytes.length});assert.equal(done.status,'completed',JSON.stringify(done));assert.equal(done.result.receipt.receivedFileBytes,e.bytes.length);
 for(const stage of ['form-read','filled-review','confirmed-receipt'])assert.equal(done.evidence[stage].status,'CAPTURED',JSON.stringify(done.evidence));
 assert.equal(worker.approve(e.userId,queued.id,approval).status,'completed');assert.deepEqual(fs.readdirSync(path.join(dir,'private-bytes')),[]);assert.equal(e.reads(),2);report.status='MODELED_LOOPBACK_COMPLETED';
});
