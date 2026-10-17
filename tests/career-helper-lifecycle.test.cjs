'use strict';
// Harmless Node subprocesses only. No Playwright, browser, credential or network.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events');
const runtime=require('../workers/career-browser/helper-runtime.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=3000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error('MOCK child deadline');await delay(10);}}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-helper-lifetime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const script=path.join(root,'child.cjs');fs.writeFileSync(script,`const fs=require('node:fs'),p=require('node:path');const {monitorParent}=require(${JSON.stringify(require.resolve('../workers/career-browser/helper-runtime.cjs'))});monitorParent({parentPid:Number(process.argv[3]),ttlMs:2000,intervalMs:20});fs.writeFileSync(p.join(process.argv[2],'child-ready.json'),JSON.stringify({pid:process.pid,ppid:process.ppid,hasBackendMarker:Object.values(process.env).includes('DUMMY-PRIVATE-BACKEND-MARKER')}));`);return {root,script};}
test('actual helper spawn filters backend marker and terminates on SIGTERM',async t=>{
 const f=fixture(t),old=process.env.UPMORE_EXISTING_RPC_KEY;process.env.UPMORE_EXISTING_RPC_KEY='DUMMY-PRIVATE-BACKEND-MARKER';let child;
 try{child=runtime.spawnBrowserHelper(f.script,f.root);}finally{if(old===undefined)delete process.env.UPMORE_EXISTING_RPC_KEY;else process.env.UPMORE_EXISTING_RPC_KEY=old;}
 t.after(()=>child.kill('SIGKILL'));const done=once(child,'exit');await until(()=>fs.existsSync(path.join(f.root,'child-ready.json')));const data=JSON.parse(fs.readFileSync(path.join(f.root,'child-ready.json')));assert.equal(data.hasBackendMarker,false);assert.equal(data.ppid,process.pid);child.kill('SIGTERM');const [,signal]=await done;assert.equal(signal,'SIGTERM');
});
test('helper has an absolute lifetime even while parent lives',async t=>{
 const f=fixture(t),child=runtime.spawnBrowserHelper(f.script,f.root);t.after(()=>child.kill('SIGKILL'));const [code]=await once(child,'exit');assert.equal(code,0);assert.equal(process.pid>0,true);
});
test('helper notices abrupt parent death and exits within its bounded monitor interval',async t=>{
 const f=fixture(t),supervisor=path.join(f.root,'supervisor.cjs');fs.writeFileSync(supervisor,`const runtime=require(${JSON.stringify(require.resolve('../workers/career-browser/helper-runtime.cjs'))});runtime.spawnBrowserHelper(${JSON.stringify(f.script)},${JSON.stringify(f.root)});setInterval(()=>{},100);`);
 const parent=spawn(process.execPath,[supervisor],{stdio:'ignore'});t.after(()=>parent.kill('SIGKILL'));const exited=once(parent,'exit');await until(()=>fs.existsSync(path.join(f.root,'child-ready.json')));const {pid}=JSON.parse(fs.readFileSync(path.join(f.root,'child-ready.json')));parent.kill('SIGKILL');await exited;
 await until(()=>{try{const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');return stat.split(' ')[2]==='Z';}catch(e){return e.code==='ENOENT';}},1000);
});
