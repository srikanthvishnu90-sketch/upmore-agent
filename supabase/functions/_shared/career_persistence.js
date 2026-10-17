// Host-only persistence adapter. The RPCs preserve Muse's snapshot shape;
// callers cannot turn client-supplied owner/state into storage authority.
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function validTask(value,userId){return record(value)&&value.userId===userId&&typeof value.status==='string'&&((value.version==='career_task_intent/v1'&&value.kind==='pending_task_intent'&&/^[a-f0-9]{64}$/.test(value.intent_id||'')&&(value.id===null||/^[a-f0-9]{32}$/.test(value.id)))||(value.version==='career_task/v1'&&/^[a-f0-9]{32}$/.test(value.id||'')));}
function validResponse(value,threadId,turnKey,userId){return record(value)&&value.thread_id===threadId&&value.turn_key===turnKey&&typeof value.reply==='string'&&Array.isArray(value.reminders)&&(!('task' in value)||validTask(value.task,userId));}
function unavailable(){throw Object.assign(new Error('career_storage_invalid'),{code:'storage_unavailable'});}
const canonical=value=>Array.isArray(value)?value.map(canonical):record(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const evidenceHash=value=>digest(new TextEncoder().encode(JSON.stringify(canonical(value))));
async function validateResearchObservation(data,{userId,taskId,intentId}) {
  const t=data.task,r=t?.result;
  if(t?.kind!=='public_research/v1'&&r?.kind!=='public_research_result'&&data.researchProof==null)return;
  const p=data.researchProof,b=p?.binding;
  if(!record(p)||!record(b)||p.userId!==userId||b.user_id!==userId||b.action!=='research'||t?.id!==p.taskId||t?.authority?.intentId!==p.intentId||(taskId&&taskId!==p.taskId)||(intentId&&intentId!==p.intentId))unavailable();
  if(r==null)return;
  const a=r.artifact,c=a?.capture,s=a?.source,n=a?.provenance;
  if(r.kind!=='public_research_result'||r.artifactEncoding!=='sorted-json/v1'||r.sends!==0||r.submissions!==0||a?.version!=='public_research_artifact/v1'||a.taskId!==p.taskId||a.intentId!==p.intentId||a.question!==b.research?.question||a.trust!=='untrusted_source_data'||a.objectiveStatus!=='requires_review'||n?.threadId!==b.thread_id||n?.turnKey!==b.turn_key||n?.requestHash!==b.request_hash)unavailable();
  if(c?.version!=='public_research_capture/v1'||c.provenance!=='owned_chromium_dom'||c.untrusted!==true||c.taskId!==p.taskId||c.intentId!==p.intentId||!c.sessionId||c.url!==b.destination||s?.url!==c.url||s?.title!==c.title||s?.capturedAt!==c.capturedAt||s?.sourceSha256!==c.sourceSha256||!/^[a-f0-9]{64}$/.test(c.sourceSha256||'')||typeof c.text!=='string'||c.text.length>24000||!Array.isArray(c.navigation)||!c.navigation.some(e=>e.status==='read'&&e.url===c.url&&e.method==='GET'&&e.httpStatus===200&&e.sourceSha256===c.sourceSha256))unavailable();
  const observed=Date.parse(c.capturedAt),admitted=Date.parse(p.read?.admittedAt);
  if(p.read?.state!=='completed'||!Number.isFinite(observed)||!Number.isFinite(admitted)||observed<admitted-30000||observed>admitted+150000||await evidenceHash(a)!==r.artifactSha256||await evidenceHash(c)!==p.read.afterSha256)unavailable();
  // The completed effect hashes the exact capture, including screenshot bytes.
  // PNG framing/decoding is checked by the worker before publication.
  const image=c.screenshot;
  if(image?.mimeType!=='image/png'||typeof image.base64!=='string'||image.base64.length>666668||!Number.isInteger(image.bytes)||image.bytes<57||image.bytes>500000)unavailable();
  if(!/^[a-f0-9]{64}$/.test(image.sha256||''))unavailable();
}
export function createCareerPersistence(client) {
  async function call(name, args) {
    const result = await client.rpc(name, args);
    if (result.error) throw Object.assign(new Error('career_storage_unavailable'), { code: 'storage_unavailable' });
    if (!record(result.data)) throw Object.assign(new Error('career_storage_invalid'), { code: 'storage_unavailable' });
    if (result.data.error) throw Object.assign(new Error(result.data.error), { code: result.data.error });
    return result.data;
  }
  return {
    async load({ userId, threadId, turnKey, requestHash }) {
      const data=await call('career_host_load',{p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash});
      if('replay' in data){if(!validResponse(data.replay,threadId,turnKey,userId))unavailable();}
      else if(!Number.isSafeInteger(data.revision)||data.revision<0||!Number.isSafeInteger(data.accountVersion)||data.accountVersion<0||!record(data.account)||!record(data.watchState)||!Array.isArray(data.reminders)||(data.snapshot!==null&&!record(data.snapshot)))unavailable();
      return data;
    },
    async commit({ userId, threadId, turnKey, requestHash, revision, accountVersion, snapshot, patch, input, response, taskIntent, native=false }) {
      const base={
        p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash,
        p_revision:revision,p_account_version:accountVersion,
        p_snapshot:snapshot,p_patch:patch||{},p_input:input,p_response:response,
      };
      const data=native?await call('career_native_turn_commit_v1',{p_base:base}):taskIntent?await call('career_task_turn_commit_v1',{p_base:base,p_intent:taskIntent}):await call('career_host_commit',base);
      if(!validResponse(data.response,threadId,turnKey,userId))unavailable();
      return data;
    },
    async readTask({userId,taskId,intentId}) {
      const data=await call('career_task_result_v1',{p_user:userId,p_task:taskId,p_intent:intentId});
      if(data.task!==null&&!validTask(data.task,userId))unavailable();
      await validateResearchObservation(data,{userId,taskId,intentId});
      return data.task;
    },
  };
}

/** @param {unknown} message @param {unknown} images @param {unknown} careerTask */
export async function careerRequestHash(message, images, careerTask=null) {
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical({version:'career_turn/v2',message,acceptedImages:images||null,careerTask})));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
