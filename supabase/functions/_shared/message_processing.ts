function checked(result:any):any {
  if(result.error) throw new Error("Message processing unavailable.");
  return result.data;
}
export async function processInbox(admin:any,inboxId:string,invoke:(item:any)=>Promise<any>):Promise<any> {
  let item=checked(await admin.from("agent_message_inbox").select("*").eq("id",inboxId).single());
  if(["completed","cancelled"].includes(item.state)) return {ok:true,state:item.state};
  const existing=checked(await admin.from("agent_message_turns").select("state").eq("inbox_id",item.id).eq("user_id",item.user_id).maybeSingle());
  if(existing) return {ok:true,state:existing.state==='completed' ? 'completed' : 'needs_reconciliation'};
  item=checked(await admin.rpc(item.state==='queued' ? "agent_message_claim" : "agent_message_retry_unstarted",item.state==='queued' ? {p_inbox:item.id,p_seconds:120}:{p_inbox:item.id}));
  if(!item) return {ok:true,state:"busy_or_disconnected"};
  // invoke always targets the dedicated bundled message-turn endpoint. Even
  // if its network response is lost, it journals before any brain operation.
  try {
    const result=await invoke(item);
    return {ok:result.ok===true,state:result.state||"needs_reconciliation"};
  } catch {
    return {ok:false,state:"needs_reconciliation"};
  }
}
