'use strict';
const {fail}=require('./store.cjs');
function createPullRunner({worker,store,emit=()=>{},onStop=()=>{},intervalMs=5000,maxTasks=1,maxRunMs=900000,maxErrors=3,idleTimeoutMs=600000,uncertainTimeoutMs=120000,maxTransitions=100,now=Date.now}){
  if(typeof worker?.runPending!=='function'||typeof store?.list!=='function'||!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>60000||!Number.isInteger(maxTasks)||maxTasks<1||maxTasks>50||!Number.isInteger(maxRunMs)||maxRunMs<1000||maxRunMs>3600000||!Number.isInteger(maxErrors)||maxErrors<1||maxErrors>10)throw fail('RUNNER_CONFIGURATION_INVALID');
  if(!Number.isInteger(idleTimeoutMs)||idleTimeoutMs<1000||idleTimeoutMs>3600000||!Number.isInteger(uncertainTimeoutMs)||uncertainTimeoutMs<1000||uncertainTimeoutMs>3600000||!Number.isInteger(maxTransitions)||maxTransitions<1||maxTransitions>1000)throw fail('RUNNER_CONFIGURATION_INVALID');
  const started=now();let timer,stopped=false,busy=false,tasks=0,completed=0,evidenceReady=0,handoffs=0,errors=0,activeTaskId,activeStatus,lastProgress=started,uncertainSince,transitions=0;
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
    if(now()-lastProgress>=idleTimeoutMs){stop('idle_handoff');return;}
    if(uncertainSince!==undefined&&now()-uncertainSince>=uncertainTimeoutMs){stop('uncertain_handoff');return;}
    if(transitions>=maxTransitions){stop('transition_limit');return;}
    busy=true;
    try{
      const results=worker.runPending({limit:1,...(activeTaskId?{taskId:activeTaskId}:{})});if(!Array.isArray(results)||results.length>1)throw fail('RUNNER_RESULT_INVALID');
      for(const result of results){
        if(activeTaskId&&result.id&&result.id!==activeTaskId)throw fail('RUNNER_FOREIGN_TASK');
        if(!activeTaskId&&/^[a-f0-9]{32}$/.test(result.id||''))activeTaskId=result.id;
        transitions++;
        if(result.status!==activeStatus){lastProgress=now();activeStatus=result.status;}
        if(result.status==='unknown_outcome')uncertainSince??=now();else uncertainSince=undefined;
        event('task_result',result);
        if(['completed','cancelled','blocked','awaiting_user','failed','evidence_ready','insufficient_evidence'].includes(result.status)){
          if(result.status==='completed')completed++;else if(result.status==='evidence_ready')evidenceReady++;else handoffs++;
          tasks++;activeTaskId=undefined;activeStatus=undefined;uncertainSince=undefined;
        }
      }errors=0;
    }
    catch(e){errors++;event('worker_error',{blocker:/^[A-Z0-9_]{1,80}$/.test(e.code||'')?e.code:'WORKER_ERROR'});if(errors>=maxErrors)stop('error_limit');}
    finally{busy=false;}
    if(tasks>=maxTasks)stop('budget_reached');
  }
  function start(){
    event('worker_start');
    const active=store.list().map(id=>store.get(id)).filter(t=>t&&['queued','preparing','reading','review_ready','unknown_outcome'].includes(t.status));
    if(active.length>1){stop('multiple_active_checkpoints');return api;}
    if(active.length){const task=active[0];activeTaskId=task.id;activeStatus=task.status;if(task.status==='unknown_outcome')uncertainSince=now();event('checkpoint_requires_review',{id:task.id,status:task.status,authority:task.authority});}
    // Restore checkpoints, never force a stalled/uncertain task to queued.
    tick();if(!stopped)timer=setInterval(tick,intervalMs);return api;
  }
  const api={start,tick,stop,stats:()=>({stopped,tasks,completed,evidenceReady,handoffs,errors,transitions,activeTaskId})};return api;
}
module.exports={createPullRunner};
