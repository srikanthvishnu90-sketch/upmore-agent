// Webhook input is untrusted content. No user ID, approval, payment amount or
// tool authority is accepted from the provider's arbitrary metadata.
export function equalSecret(actual: string, expected: string): boolean {
  const a=new TextEncoder().encode(actual),b=new TextEncoder().encode(expected);
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a[i]||0)^(b[i]||0);
  return expected.length>=32 && diff===0;
}
export function normalizeContact(value:unknown):string {
  if(typeof value!=="string" || value.length>254) throw new Error("Invalid message contact.");
  const contact=value.trim().toLowerCase();
  if(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(contact)) return contact;
  // LoopMessage documents country-code numbers and lowercase email addresses.
  // Never guess a country code or match by only the last ten digits.
  if(!/^\+?[0-9 ()-]+$/.test(contact)) throw new Error("Invalid message contact.");
  const digits=contact.replace(/[+ ()-]/g,"");
  if(!/^[1-9][0-9]{7,14}$/.test(digits)) throw new Error("Invalid message contact.");
  return "+"+digits;
}
export async function messageHash(value:string):Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function normalizeLoopMessage(body:any,organizationId:string):Promise<any> {
  if(!body || typeof body!=="object" || Array.isArray(body)) throw new Error("Invalid webhook.");
  if(!organizationId || body.organization_id!==organizationId) throw new Error("Unrecognized provider organization.");
  if(typeof body.event!=="string") throw new Error("A provider event type is required.");
  // Delivery, reaction, attachment and group events need separate contracts.
  // An outbound status must never be treated as a user request.
  if(body.event!=="message_inbound") return {ignored:true};
  if(body.group || body.participants || body.attachments?.length || body.reaction) throw new Error("Unsupported inbound message type.");
  if(typeof body.message_id!=="string" || body.message_id.length<1 || body.message_id.length>200 || /[\x00-\x1f]/.test(body.message_id)) throw new Error("Stable provider message ID required.");
  if(typeof body.text!=="string" || !body.text.trim() || body.text.length>4000) throw new Error("Invalid message text.");
  const contact=normalizeContact(body.contact),text=body.text.trim();
  const command=/^CONNECT ([a-f0-9]{32})$/i.exec(text);
  const linkHash=command ? await messageHash(command[1].toLowerCase()) : null;
  // Ignore changing delivery metadata while binding every meaningful field.
  const sourceHash=await messageHash(JSON.stringify({organization_id:organizationId,message_id:body.message_id,contact,text}));
  return {ignored:false,provider:"loopmessage",account_key:"upmore",organization_id:organizationId,
    contact,provider_message_id:body.message_id,source_hash:sourceHash,text:command ? "[Account linked]" : text,link_hash:linkHash};
}
export async function ingestLoopMessage(admin:any,body:any,organizationId:string):Promise<any> {
  const item=await normalizeLoopMessage(body,organizationId);
  if(item.ignored) return {ok:true,ignored:true};
  const result=await admin.rpc("agent_message_ingest",{
    p_provider:item.provider,p_account:item.account_key,p_organization:item.organization_id,
    p_contact:item.contact,p_message:item.provider_message_id,p_hash:item.source_hash,
    p_text:item.text,p_link_hash:item.link_hash,
  });
  if(result.error) throw new Error("Message could not be persisted.");
  return result.data;
}
