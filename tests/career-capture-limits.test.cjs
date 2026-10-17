'use strict';
// Storage policy only. Empty/sparse/invalid files exercise limits; no PNG or
// screenshot is manufactured and none is counted as a browser outcome.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pngBudget,LIMITS,createEvidenceCapture}=require('../workers/career-browser/evidence.cjs');
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-evidence-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('submit and CAPTCHA screenshot commands share the bounded buffer writer',()=>{
 const source=fs.readFileSync(require.resolve('../scripts/career/portal-browser-helper.cjs'),'utf8');
 assert.doesNotMatch(source,/\.screenshot\(\{\s*path:/);assert.match(source,/capturePNG\(board,cmd.screenshotPath\)/);assert.match(source,/case "screenshot": await capturePNG\(board,cmd.path\)/);assert.match(source,/screenshotError=e.code/);
});
test('file size, task byte quota and capture count fail before creating another file',t=>{
 const root=temp(t),target=path.join(root,'new.png');assert.throws(()=>pngBudget(target,LIMITS.maxFileBytes+1),{code:'EVIDENCE_STORAGE_BUDGET'});
 const old=path.join(root,'EMPTY-NOT-A-SCREENSHOT.png');fs.writeFileSync(old,'');fs.truncateSync(old,LIMITS.maxTaskBytes);
 assert.throws(()=>pngBudget(target,1),{code:'EVIDENCE_STORAGE_BUDGET'});fs.unlinkSync(old);
 for(let i=0;i<LIMITS.maxFiles;i++)fs.writeFileSync(path.join(root,'EMPTY-'+i+'.png'),'');
 assert.throws(()=>pngBudget(target,0),{code:'EVIDENCE_STORAGE_BUDGET'});assert.equal(fs.existsSync(target),false);
});
test('one private root bounds evidence across multiple tasks',t=>{
 const root=temp(t),a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a,{mode:0o700});fs.mkdirSync(b,{mode:0o700});
 const file=path.join(a,'EMPTY-NOT-A-SCREENSHOT.png');fs.writeFileSync(file,'');fs.truncateSync(file,LIMITS.maxRootBytes);
 assert.throws(()=>pngBudget(path.join(b,'new.png'),1,{...LIMITS,root}),{code:'EVIDENCE_STORAGE_BUDGET'});assert.equal(fs.readdirSync(b).length,0);
});
test('failed direct capture is cleaned up and TTL expiration is explicit',t=>{
 const root=temp(t),id='a'.repeat(32),capture=createEvidenceCapture(root);
 const result=capture.capture({id},{screenshot(target){fs.writeFileSync(target,'INVALID-NOT-PNG');throw Error('MOCK disk failure');}},'form-read');assert.equal(result.status,'BLOCKED');const dir=path.join(root,id);assert.deepEqual(fs.readdirSync(dir),[]);
 const old=path.join(dir,'EXPIRED-INVALID-NOT-PNG.png');fs.writeFileSync(old,'INVALID-NOT-PNG');const clock=Date.now();fs.utimesSync(old,new Date(clock-LIMITS.ttlMs-1),new Date(clock-LIMITS.ttlMs-1));
 assert.deepEqual(capture.expire(id,clock),[id+'/'+path.basename(old)]);assert.deepEqual(fs.readdirSync(dir),[]);
});
test('symlink targets and public evidence directories are refused',t=>{
 const root=temp(t),outside=path.join(root,'outside');fs.mkdirSync(outside,{mode:0o755});fs.chmodSync(outside,0o755);assert.throws(()=>pngBudget(path.join(outside,'file.png'),1),{code:'EVIDENCE_PRIVATE_DIRECTORY_REQUIRED'});
 const link=path.join(root,'link');fs.symlinkSync(outside,link);assert.throws(()=>pngBudget(path.join(link,'file.png'),1),{code:'EVIDENCE_PRIVATE_DIRECTORY_REQUIRED'});
});
test('referenced janitor expires proof after polling stops without retaining RPC authority',t=>{
 const root=temp(t),id='a'.repeat(32),dir=path.join(root,id);fs.mkdirSync(dir,{mode:0o700});const file=path.join(dir,'EXPIRED-INVALID-NOT-PNG.png');fs.writeFileSync(file,'INVALID-NOT-PNG');
 let clock=Date.now();fs.utimesSync(file,new Date(clock),new Date(clock));let callback,delay,expired=[];
 const cancel=createEvidenceCapture(root).scheduleExpiry((id,refs)=>expired.push({id,refs}),()=>clock,(fn,ms)=>{callback=fn;delay=ms;});
 assert.ok(delay>0&&delay<=LIMITS.ttlMs);assert.equal(fs.existsSync(file),true);clock+=LIMITS.ttlMs+1;callback();assert.equal(fs.existsSync(file),false);assert.equal(expired.length,1);cancel();
});
