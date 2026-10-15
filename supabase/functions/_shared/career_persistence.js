// Host-only persistence adapter. The RPCs preserve Muse's snapshot shape;
// callers cannot turn client-supplied owner/state into storage authority.
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function validResponse(value,threadId,turnKey){return record(value)&&value.thread_id===threadId&&value.turn_key===turnKey&&typeof value.reply==='string'&&Array.isArray(value.reminders);}
function unavailable(){throw Object.assign(new Error('career_storage_invalid'),{code:'storage_unavailable'});}
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
      if('replay' in data){if(!validResponse(data.replay,threadId,turnKey))unavailable();}
      else if(!Number.isSafeInteger(data.revision)||data.revision<0||!Number.isSafeInteger(data.accountVersion)||data.accountVersion<0||!record(data.account)||!record(data.watchState)||!Array.isArray(data.reminders)||(data.snapshot!==null&&!record(data.snapshot)))unavailable();
      return data;
    },
    async commit({ userId, threadId, turnKey, requestHash, revision, accountVersion, snapshot, patch, input, response }) {
      const data=await call('career_host_commit',{
        p_user:userId,p_thread:threadId,p_key:turnKey,p_hash:requestHash,
        p_revision:revision,p_account_version:accountVersion,
        p_snapshot:snapshot,p_patch:patch||{},p_input:input,p_response:response,
      });
      if(!validResponse(data.response,threadId,turnKey))unavailable();
      return data;
    },
  };
}

export async function careerRequestHash(message, images) {
  const bytes = new TextEncoder().encode(JSON.stringify([message, images || null]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
