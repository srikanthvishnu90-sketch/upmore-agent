'use strict';
const {fail}=require('./store.cjs');
function createPullRunner({worker,store,emit=()=>{},onStop=()=>{},intervalMs=5000,maxTasks=1,maxRunMs=900000,maxErrors=3,now=Date.now}){
  if(typeof worker?.runPending!=='function'||typeof store?.list!=='function'||!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>60000||!Number.isInteger(maxTasks)||maxTasks<1||maxTasks>50||!Number.isInteger(maxRunMs)||maxRunMs<1000||maxRunMs>3600000||!Number.isInteger(maxErrors)||maxErrors<1||maxErrors>10)throw fail('RUNNER_CONFIGURATION_INVALID');
  const started=now();let timer,stopped=false,busy=false,tasks=0,errors=0;
  function event(type,result={}){
    const value={event:type,at:new Date(now()).toISOString(),tasks,errors};
    if(/^[a-f0-9]{32}$/.test(result.id||''))value.taskId=result.id;
    if(/^[a-f0-9]{64}$/.test(result.intentId||result.authority?.intentId||''))value.intentId=result.intentId||result.authority.intentId;
    for(const field of ['status','phase','blocker'])if(typeof result[field]==='string'&&/^[A-Za-z0-9_:-]{1,80}$/.test(result[field]))value[field]=result[field];
    try{emit(value);}catch(_){stopped=true;clearInterval(timer);onStop();} // no sensitive payload in logs
  }
  function stop(reason='stopped'){if(stopped)return;stopped=true;clearInterval(timer);event('worker_stop',{status:reason});onStop();}
  function tick(){
    if(stopped||busy)return;
    if(now()-started>=maxRunMs||tasks>=maxTasks){stop('budget_reached');return;}
    busy=true;
    try{const results=worker.runPending({limit:Math.min(maxTasks-tasks,50)});if(!Array.isArray(results))throw fail('RUNNER_RESULT_INVALID');for(const result of results){tasks++;event('task_result',result);}errors=0;}
    catch(e){errors++;event('worker_error',{blocker:/^[A-Z0-9_]{1,80}$/.test(e.code||'')?e.code:'WORKER_ERROR'});if(errors>=maxErrors)stop('error_limit');}
    finally{busy=false;}
    if(tasks>=maxTasks)stop('budget_reached');
  }
  function start(){
    event('worker_start');
    for(const id of store.list()){const task=store.get(id);if(task&&['preparing','reading','unknown_outcome'].includes(task.status))event('checkpoint_requires_review',{id:task.id,status:task.status,authority:task.authority});}
    // Restore checkpoints, never force a stalled/uncertain task to queued.
    tick();if(!stopped)timer=setInterval(tick,intervalMs);return api;
  }
  const api={start,tick,stop,stats:()=>({stopped,tasks,errors})};return api;
}
module.exports={createPullRunner};
