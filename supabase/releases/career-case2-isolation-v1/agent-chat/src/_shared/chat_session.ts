// The service-role messaging bridge bypasses RLS. Check thread ownership
// explicitly before reading history or appending either side of a turn.
export class ChatThreadError extends Error {
  constructor(public status:number,public code:string){super(code);}
}
export async function ownerThread(client:any,userId:string,threadId:unknown,message:string):Promise<string> {
  if(threadId!==undefined && threadId!==null && typeof threadId!=="string") throw new ChatThreadError(400,"thread_id must be a string");
  if(threadId) {
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(threadId as string)) throw new ChatThreadError(400,"Invalid thread ID");
    const result=await client.from("agent_threads").select("id,user_id").eq("id",threadId).eq("user_id",userId).maybeSingle();
    if(result.error) throw new Error("Conversation unavailable.");
    if(!result.data || result.data.user_id!==userId || result.data.id!==threadId) throw new ChatThreadError(404,"Conversation unavailable");
    return result.data.id;
  }
  const result=await client.from("agent_threads").insert({user_id:userId,title:message.slice(0,60)}).select("id,user_id").single();
  if(result.error || !result.data || result.data.user_id!==userId) throw new Error("Conversation could not be created.");
  return result.data.id;
}
