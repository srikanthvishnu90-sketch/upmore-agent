// This is conversation control memory, never financial consent.
export type RuntimeState = {paused:boolean;sent:number[]};
type Context = {inbox_id:string;lease_token:string};
const uuid=(v:unknown):v is string=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function runtimeWorkerContext(body:any,isBridge:boolean):Context|null {
  const supplied=body.runtime_context;
  if(supplied===undefined) return null;
  if(!isBridge || !supplied || Object.keys(supplied).sort().join(',')!=='inbox_id,lease_token'
    || !uuid(supplied.inbox_id) || !uuid(supplied.lease_token)) throw new Error('Invalid runtime worker context.');
  return supplied;
}
function checked(data:any,owner:string,thread:string):any {
  if(!data || data.user_id!==owner || data.thread_id!==thread || !Number.isInteger(data.version) || data.version<0
    || !data.state || Object.keys(data.state).sort().join(',')!=='paused,sent' || typeof data.state.paused!=='boolean'
    || !Array.isArray(data.state.sent) || data.state.sent.length>32
    || data.state.sent.some((v:any,i:number)=>!Number.isFinite(v) || v<0 || v>Date.now() || (i>0 && v<data.state.sent[i-1])))
    throw new Error('Conversation control state unavailable.');
  return data;
}
export async function loadRuntimeState(client:any,owner:string,thread:string,context:Context|null) {
  const result=await client.rpc('agent_runtime_state_read',{p_thread:thread,p_inbox:context?.inbox_id??null,p_lease:context?.lease_token??null});
  if(result.error) throw new Error('Conversation control state unavailable.');
  return checked(result.data,owner,thread);
}
export async function saveRuntimeState(client:any,previous:any,state:RuntimeState,context:Context|null) {
  checked({...previous,state},previous.user_id,previous.thread_id);
  if(JSON.stringify(previous.state)===JSON.stringify(state)) return previous;
  const result=await client.rpc('agent_runtime_state_save',{p_thread:previous.thread_id,p_expected_version:previous.version,p_state:state,
    p_inbox:context?.inbox_id??null,p_lease:context?.lease_token??null});
  if(result.error) throw new Error('Conversation control changed; retry your request.');
  const saved=checked(result.data,previous.user_id,previous.thread_id);
  if(saved.version!==previous.version+1 || JSON.stringify(saved.state)!==JSON.stringify(state)) throw new Error('Conversation control save not verified.');
  return saved;
}
