'use strict';
// Browser children have no backend transport authority. Never inherit arbitrary
// worker environment, NODE_OPTIONS, proxies or backend keys.
const {spawn}=require('node:child_process');
function browserEnvironment(source,scratch){
 const env={};for(const name of ['PATH','HOME','LANG','LC_ALL','TZ','NODE_PATH','UPMORE_PLAYWRIGHT_PATH','UPMORE_CHROMIUM_PATH','PLAYWRIGHT_BROWSERS_PATH','XDG_CACHE_HOME','XDG_RUNTIME_DIR'])if(typeof source[name]==='string')env[name]=source[name];
 env.TMPDIR=scratch;return env;
}
function spawnBrowserHelper(script,scratch){
 return spawn(process.execPath,[script,scratch,String(process.pid)],{detached:false,stdio:'ignore',env:browserEnvironment(process.env,scratch)});
}
// Independent hard deadline applies even while a page command is stuck. Parent
// death reparents the child; checking ppid also avoids PID reuse confusion.
function monitorParent({parentPid,ttlMs=900000,intervalMs=250,stop=()=>process.exit(0),now=Date.now,ppid=()=>process.ppid}={}){
 const started=now();const check=()=>{if(ppid()!==parentPid||now()-started>=ttlMs)stop();};
 const timer=setInterval(check,intervalMs);return ()=>clearInterval(timer);
}
module.exports={browserEnvironment,spawnBrowserHelper,monitorParent};
