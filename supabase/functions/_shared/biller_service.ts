import { AgentBillerModel, AgentWorkflows } from "./agent_core.js";

export interface BillerAdapter {
  id: string;
  verified: boolean;
  read(connection: any, ownerId: string): Promise<any[]>;
}
// Registration requires provider credentials, permission and contract tests.
// A supported contract is not evidence of production coverage for any biller.
export const BILLER_ADAPTERS: BillerAdapter[] = [];
function checked(result: any): any {
  if (result.error) throw new Error(result.error.message || "Biller service unavailable.");
  return result.data;
}
export async function ingestBillerRecords(admin: any, connection: any, records: any[], now: string): Promise<any> {
  const batch=AgentBillerModel.normalizeBatch(connection,records,now);
  if (!batch.ok) throw new Error("Biller data failed validation: "+batch.errors.join(", "));
  const recordsWithHashes=[];
  for (const record of batch.records) {
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(AgentWorkflows.stableJson(record)));
    recordsWithHashes.push({...record,source_hash:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("")});
  }
  return checked(await admin.rpc("agent_biller_ingest",{p_connection:connection.id,p_records:recordsWithHashes}));
}
export async function refreshBiller(ownerId: string, client: any, admin: any, connectionId: string,
  adapters: BillerAdapter[]=BILLER_ADAPTERS): Promise<any> {
  const connection=checked(await client.from("agent_biller_connections").select("*")
    .eq("user_id",ownerId).eq("id",connectionId).single());
  if (connection.user_id!==ownerId || connection.status!=="active") throw new Error("Biller connection unavailable.");
  const adapter=adapters.find(a=>a.id===connection.provider_key && a.verified);
  if (!adapter) return {ok:true,state:"needs_connection",message:"This biller's refresh adapter has not been verified."};
  const records=await adapter.read(connection,ownerId);
  return {ok:true,state:"refreshed",result:await ingestBillerRecords(admin,connection,records,new Date().toISOString())};
}
