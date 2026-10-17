'use strict';
// Private child owns bounded HTTPS I/O. The existing synchronous browser
// engine talks through private files; no HTTP job ingress or key in argv.
const fs=require('node:fs'),path=require('node:path');
const {configuration,requestRPC}=require('./rpc-client.cjs');
const root=process.argv[2],config=configuration(process.env.UPMORE_WORKER_RPC_URL,process.env.UPMORE_WORKER_RPC_KEY);
fs.writeFileSync(path.join(root,'ready'),'',{mode:0o600});
let busy=false;
const tick=setInterval(async()=>{
  if(busy)return;busy=true;
  try{
    for(const file of fs.readdirSync(root).filter(f=>/^cmd-[0-9]+\.json$/.test(f)).sort()){
      const target=path.join(root,file);let result;
      try{const command=JSON.parse(fs.readFileSync(target));result={ok:true,data:await requestRPC(config,command.name,command.args)};}
      catch(e){result={ok:false,code:/^[A-Z0-9_]{1,80}$/.test(e.code||'')?e.code:'RPC_OUTCOME_UNCERTAIN'};}
      const out=path.join(root,file.replace('cmd-','resp-'));fs.writeFileSync(out+'.tmp',JSON.stringify(result),{mode:0o600});fs.renameSync(out+'.tmp',out);fs.unlinkSync(target);
    }
  }finally{busy=false;}
},25);
process.on('SIGTERM',()=>{clearInterval(tick);process.exit(0);});
