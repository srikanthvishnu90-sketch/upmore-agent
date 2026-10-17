'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {configuration,METHODS}=require('./rpc-client.cjs'),{fail}=require('./store.cjs');
function createSyncRPCTransport({url,key,stateRoot,timeoutMs=12000,helperPath=path.join(__dirname,'rpc-helper.cjs')}){
  const config=configuration(url,key);
  if(!path.isAbsolute(stateRoot)||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)throw fail('RPC_CONFIGURATION_INVALID');
  fs.mkdirSync(stateRoot,{recursive:true,mode:0o700});
  if(fs.statSync(stateRoot).mode&0o077)throw fail('RPC_PRIVATE_DIRECTORY_REQUIRED');
  const root=fs.mkdtempSync(path.join(stateRoot,'rpc-'));
  const child=spawn(process.execPath,[helperPath,root],{stdio:'ignore',env:{PATH:process.env.PATH,LANG:process.env.LANG||'C.UTF-8',UPMORE_WORKER_RPC_URL:config.url,UPMORE_WORKER_RPC_KEY:config.key}});child.unref();
  let sequence=0,closed=false,spawnError=false;child.on('error',()=>{spawnError=true;});
  const pause=new Int32Array(new SharedArrayBuffer(4));
  function awaitFile(file){const until=Date.now()+timeoutMs;while(!fs.existsSync(file)){if(closed||spawnError||Date.now()>=until){close();throw fail('RPC_OUTCOME_UNCERTAIN');}Atomics.wait(pause,0,0,10);}return file;}
  function close(){if(closed)return;closed=true;try{child.kill('SIGTERM');}catch(_){}fs.rmSync(root,{recursive:true,force:true});process.removeListener('exit',close);}
  try{awaitFile(path.join(root,'ready'));}catch(e){close();throw e;}
  function call(name,args){
    if(closed)throw fail('RPC_TRANSPORT_CLOSED');
    if(!METHODS.has(name)||!args||typeof args!=='object'||Array.isArray(args))throw fail('RPC_METHOD_REFUSED');
    const payload=JSON.stringify({name,args});if(Buffer.byteLength(payload)>2097152)throw fail('RPC_REQUEST_TOO_LARGE');
    const id=++sequence,target=path.join(root,'cmd-'+id+'.json');fs.writeFileSync(target+'.tmp',payload,{mode:0o600});fs.renameSync(target+'.tmp',target);
    const response=awaitFile(path.join(root,'resp-'+id+'.json'));let value;
    try{if(fs.statSync(response).size>2098176)throw fail('RPC_RESPONSE_INVALID');value=JSON.parse(fs.readFileSync(response));}finally{fs.unlinkSync(response);}
    if(value.ok!==true)throw fail(value.code==='TASK_AUTHORITY_REVOKED'?'TASK_AUTHORITY_REVOKED':'RPC_OUTCOME_UNCERTAIN',value.code==='TASK_AUTHORITY_REVOKED'?'task authority revoked':'RPC outcome uncertain');
    return value.data;
  }
  process.once('exit',close);
  return {call,close};
}
module.exports={createSyncRPCTransport};
