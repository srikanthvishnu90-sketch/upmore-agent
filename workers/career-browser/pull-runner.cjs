'use strict';
const {fail}=require('./store.cjs');
function createPullRunner({worker,store,emit=()=>{},onStop=()=>{},intervalMs=5000,maxTasks=1,maxRunMs=900000,maxErrors=3,idleTimeoutMs=600000,uncertainTimeoutMs=120000,maxTransitions=100,scheduling='single_task',now=Date.now}){
  if(typeof worker?.runPending!=='function'||typeof store?.list!=='function'||!Number.isInteger(intervalMs)||intervalMs<1000||intervalMs>60000||!Number.isInteger(maxTasks)||maxTasks<1||maxTasks>50||!Number.isInteger(maxRunMs)||maxRunMs<1000||maxRunMs>3600000||!Number.isInteger(maxErrors)||maxErrors<1||maxErrors>10)throw fail('RUNNER_CONFIGURATION_INVALID');
  if(!Number.isInteger(idleTimeoutMs)||idleTimeoutMs<1000||idleTimeoutMs>3600000||!Number.isInteger(uncertainTimeoutMs)||uncertainTimeoutMs<1000||uncertainTimeoutMs>3600000||!Number.isInteger(maxTransitions)||maxTransitions<1||maxTransitions>1000)throw fail('RUNNER_CONFIGURATION_INVALID');
  if(!['single_task','per_role'].includes(scheduling))throw fail('RUNNER_CONFIGURATION_INVALID');
  const perRole=scheduling==='per_role',visited=new Set();
  const started=now();let timer,stopped=false,busy=false,tasks=0,completed=0,evidenceReady=0,handoffs=0,errors=0,activeTaskId,activeStatus,lastProgress=started,uncertainSince,transitions=0;
  const publicationPending=t=>t?.kind==='public_research/v1'&&t.publicationPending===true;
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
        const publishing=result.kind==='public_research/v1'&&(result.blocker==='TASK_RESULT_UNCONFIRMED'||publicationPending(store.get?.(result.id)));
        if(result.status==='unknown_outcome'||publishing)uncertainSince??=now();else uncertainSince=undefined;
        event('task_result',result);
        const expired=result.blocker==='PRIVATE_RETENTION_EXPIRED';
        if(expired||(!publishing&&(['completed','cancelled','blocked','awaiting_user','failed','evidence_ready','insufficient_evidence'].includes(result.status)||(perRole&&['review_ready','unknown_outcome'].includes(result.status))))){
          // Waiting applications have a durable result and no runnable local
          // transition. Poll the authoritative queue for another role rather
          // than pinning the whole process to their review/unknown checkpoint.
          // Count unique roles within this bounded window; approvals/readback
          // still require fresh existing queue grants and never requeue a role.
          if(!perRole||!visited.has(result.id)){
            if(expired)handoffs++;else if(result.status==='completed')completed++;else if(result.status==='evidence_ready')evidenceReady++;else handoffs++;
            tasks++;visited.add(result.id);
          }
          activeTaskId=undefined;activeStatus=undefined;uncertainSince=undefined;
          if(expired)stop('private_expiry_handoff');
        }
      }errors=0;
    }
    catch(e){errors++;event('worker_error',{blocker:/^[A-Z0-9_]{1,80}$/.test(e.code||'')?e.code:'WORKER_ERROR'});if(errors>=maxErrors)stop('error_limit');}
    finally{busy=false;}
    if(tasks>=maxTasks)stop('budget_reached');
  }
  function start(){
    event('worker_start');
    const checkpoints=store.list().map(id=>store.get(id));
    for(const t of checkpoints)if(t?.privateExpiredAt!==undefined)event('checkpoint_expired_handoff',{id:t.id,status:t.status,blocker:'PRIVATE_RETENTION_EXPIRED'});
    const active=checkpoints.filter(t=>t&&t.privateExpiredAt===undefined&&(publicationPending(t)||['queued','preparing','reading','review_ready','unknown_outcome'].includes(t.status)));
    if(!perRole&&active.length>1){stop('multiple_active_checkpoints');return api;}
    for(const task of active)event('checkpoint_requires_review',{id:task.id,status:task.status,authority:task.authority});
    const restored=perRole?active.find(publicationPending):active[0];
    if(restored){activeTaskId=restored.id;activeStatus=restored.status;if(restored.status==='unknown_outcome'||publicationPending(restored))uncertainSince=now();}
    // Restore checkpoints, never force a stalled/uncertain task to queued.
    tick();if(!stopped)timer=setInterval(tick,intervalMs);return api;
  }
  const api={start,tick,stop,stats:()=>({stopped,tasks,completed,evidenceReady,handoffs,errors,transitions,activeTaskId})};return api;
}
module.exports={createPullRunner};
