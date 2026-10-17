'use strict';
// Actual credential-bearing helper, dummy key only. Invalid IPC names are
// rejected before fetch; these tests make zero network requests.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{once}=require('node:events');
const helper=require.resolve('../workers/career-browser/rpc-helper.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=2000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error('Actual RPC helper did not stop within deadline');await pause(10);}}
function dead(pid){try{return fs.readFileSync('/proc/'+pid+'/stat','utf8').split(' ')[2]==='Z';}catch(e){return e.code==='ENOENT';}}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-actual-rpc-helper-')),ipc=path.join(root,'rpc-test');fs.mkdirSync(ipc,{mode:0o700});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,ipc};}
function env(){return {PATH:process.env.PATH,UPMORE_WORKER_RPC_URL:'https://synthetic-project.example.test',UPMORE_WORKER_RPC_KEY:'DUMMY-KEY-NOT-A-CREDENTIAL'};}
test('actual RPC helper exits and removes private IPC after its parent is SIGKILLed',async t=>{
 const {root,ipc}=fixture(t),supervisor=path.join(root,'supervisor.cjs'),marker=path.join(root,'child-pid');
 fs.writeFileSync(supervisor,`const fs=require('node:fs'),{spawn}=require('node:child_process');const child=spawn(process.execPath,[${JSON.stringify(helper)},${JSON.stringify(ipc)},String(process.pid),'900000'],{stdio:'ignore',env:${JSON.stringify(env())}});fs.writeFileSync(${JSON.stringify(marker)},String(child.pid));setInterval(()=>{},100);`);
 const parent=spawn(process.execPath,[supervisor],{stdio:'ignore'});t.after(()=>parent.kill('SIGKILL'));const exited=once(parent,'exit');
 await until(()=>fs.existsSync(marker)&&fs.existsSync(path.join(ipc,'ready')));const pid=Number(fs.readFileSync(marker));t.after(()=>{try{process.kill(pid,'SIGKILL');}catch(_){}});
 parent.kill('SIGKILL');await exited;
 try{fs.writeFileSync(path.join(ipc,'cmd-1.json'),JSON.stringify({name:'INVALID_LOCAL_IPC_NOT_AN_RPC',args:{}}));}catch(e){assert.equal(e.code,'ENOENT');}
 await until(()=>!fs.existsSync(ipc)&&dead(pid));assert.equal(fs.existsSync(path.join(ipc,'resp-1.json')),false);
});
test('actual RPC helper has an absolute TTL with a live parent and clears IPC',async t=>{
 const {ipc}=fixture(t),child=spawn(process.execPath,[helper,ipc,String(process.pid),'250'],{stdio:'ignore',env:env()});t.after(()=>child.kill('SIGKILL'));const exited=once(child,'exit');
 await until(()=>fs.existsSync(path.join(ipc,'ready')));await until(()=>!fs.existsSync(ipc));const [code]=await exited;assert.equal(code,0);
});
test('actual RPC transport passes its bounded lifetime and fails closed after helper expiry',async t=>{
 const {root}=fixture(t);const {createSyncRPCTransport}=require('../workers/career-browser/rpc-transport.cjs');
 const transport=createSyncRPCTransport({url:env().UPMORE_WORKER_RPC_URL,key:env().UPMORE_WORKER_RPC_KEY,stateRoot:root,helperLifetimeMs:250});t.after(()=>transport.close());
 const ipc=fs.readdirSync(root).filter(f=>f.startsWith('rpc-')&&f!=='rpc-test');assert.equal(ipc.length,1);
 await until(()=>!fs.existsSync(path.join(root,ipc[0])));assert.throws(()=>transport.call('career_task_pending_owned_v1',{}),{code:'RPC_OUTCOME_UNCERTAIN'});
});
