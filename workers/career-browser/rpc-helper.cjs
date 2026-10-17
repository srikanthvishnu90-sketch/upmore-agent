'use strict';
// Private child owns bounded HTTPS I/O. The existing synchronous browser
// engine talks through private files; no HTTP job ingress or key in argv.
const fs=require('node:fs'),path=require('node:path');
const {configuration,requestRPC}=require('./rpc-client.cjs');
const {monitorParent}=require('./helper-runtime.cjs');
const root=process.argv[2],config=configuration(process.env.UPMORE_WORKER_RPC_URL,process.env.UPMORE_WORKER_RPC_KEY);
const parentPid=Number(process.argv[3]),lifetimeMs=Number(process.argv[4]||900000);
const directory=fs.lstatSync(root);
if(!path.isAbsolute(root)||!/^rpc-[A-Za-z0-9_-]+$/.test(path.basename(root))||!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o077)||fs.realpathSync(root)!==path.resolve(root)||!Number.isInteger(parentPid)||parentPid<2||!Number.isInteger(lifetimeMs)||lifetimeMs<100||lifetimeMs>900000)throw Error('RPC_HELPER_CONFIGURATION_INVALID');
// Only this process's private configuration retains the dummy/approved key.
// Exit removes the process, its sockets and private pending IPC after either
// parent death or the absolute deadline, including an in-flight HTTP request.
delete process.env.UPMORE_WORKER_RPC_KEY;delete process.env.UPMORE_WORKER_RPC_URL;
let busy=false,stopping=false,tick,cancelMonitor;
const deadline=Date.now()+lifetimeMs;
function stop(){if(stopping)return;stopping=true;clearInterval(tick);cancelMonitor?.();config.key='';try{fs.rmSync(root,{recursive:true,force:true});}catch(_){}process.exit(0);}
function live(){if(stopping||process.ppid!==parentPid||Date.now()>=deadline){stop();return false;}return true;}
cancelMonitor=monitorParent({parentPid,ttlMs:lifetimeMs,intervalMs:50,stop});
process.once('SIGTERM',stop);process.once('SIGINT',stop);
if(!live())process.exit(0);
fs.writeFileSync(path.join(root,'ready'),'',{mode:0o600});
tick=setInterval(async()=>{
  if(!live()||busy)return;busy=true;
  try{
    for(const file of fs.readdirSync(root).filter(f=>/^cmd-[0-9]+\.json$/.test(f)).sort()){
      if(!live())return;
      const target=path.join(root,file);let result;
      try{const command=JSON.parse(fs.readFileSync(target));result={ok:true,data:await requestRPC(config,command.name,command.args)};}
      catch(e){result={ok:false,code:/^[A-Z0-9_]{1,80}$/.test(e.code||'')?e.code:'RPC_OUTCOME_UNCERTAIN'};}
      if(!live())return;
      const out=path.join(root,file.replace('cmd-','resp-'));fs.writeFileSync(out+'.tmp',JSON.stringify(result),{mode:0o600});fs.renameSync(out+'.tmp',out);fs.unlinkSync(target);
    }
  }catch(_){stop();}finally{busy=false;}
},25);
