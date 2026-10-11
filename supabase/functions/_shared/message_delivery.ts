import {normalizeContact} from "./message_service.ts";
export interface MessageTransport {
  provider:string;account_key:string;verified:boolean;
  send(outbox:any,channel:any):Promise<{state:string;message_id:string|null}>;
  lookup(outbox:any,channel:any):Promise<{state:string;message_id:string|null}|null>;
}
// No transport becomes executable merely because a credential exists.
// Register after verifying account binding, webhook ingress and real delivery.
export const MESSAGE_TRANSPORTS:MessageTransport[]=[];
function checked(result:any):any {
  if(result.error) throw new Error("Message delivery state could not be saved.");
  return result.data;
}
export async function deliverMessage(admin:any,outboxId:string,registry:MessageTransport[]=MESSAGE_TRANSPORTS):Promise<any> {
  let item=checked(await admin.from("agent_message_outbox").select("*").eq("id",outboxId).single());
  if(["delivered","failed","cancelled"].includes(item.state)) return {ok:true,state:item.state};
  let channel=checked(await admin.from("agent_message_channels").select("*").eq("id",item.channel_id).eq("user_id",item.user_id).single());
  const transport=registry.find(t=>t.provider===channel.provider && t.account_key===channel.account_key && t.verified);
  if(!transport) return {ok:true,state:"needs_connection"};
  let initial=false;
  if(item.state==="queued") {
    const begun=checked(await admin.rpc("agent_message_begin_delivery",{p_outbox:item.id}));
    if(!begun) return {ok:true,state:"busy_or_disconnected"};
    item=begun.outbox;channel=begun.channel;initial=true;
  }
  let result:{state:string;message_id:string|null}|null;
  try {
    // Never resend submitted/uncertain messages. No-ID recovery remains
    // uncertain until a verified provider callback can identify the receipt.
    result=initial ? await transport.send(item,channel) : item.provider_message_id ? await transport.lookup(item,channel) : null;
  } catch {result=null;}
  if(!result) result={state:"unknown",message_id:item.provider_message_id||null};
  const stored=checked(await admin.rpc("agent_message_delivery_result",{
    p_outbox:item.id,p_provider:channel.provider,p_account:channel.account_key,p_contact:channel.contact,
    p_state:result.state,p_message:result.message_id,
  }));
  return {ok:true,state:stored.state};
}

// Official contract: https://loopmessage.com/apidocs/send-message/
// https://loopmessage.com/apidocs/statuses/
// Constructing this adapter does not register or verify it. Its account/key
// association and delivery still require a supervised provider check.
export function loopMessageTransport(apiKey:string,request:typeof fetch=fetch):MessageTransport {
  return {provider:"loopmessage",account_key:"upmore",verified:false,
    async send(item,channel) {
      if(!apiKey) throw new Error("Messaging credential unavailable.");
      const res=await request("https://a.loopmessage.com/api/v1/message/send/",{
        method:"POST",headers:{Authorization:apiKey,"Content-Type":"application/json"},
        body:JSON.stringify({contact:channel.contact,text:item.text,passthrough:item.id}),signal:AbortSignal.timeout(12000),
      });
      const body=await res.json();
      if(!res.ok || body.success===false || typeof body.message_id!=="string" || !body.message_id || body.message_id.length>200
        || normalizeContact(body.contact??body.recipient)!==channel.contact) throw new Error("No verified send receipt.");
      // 200 acknowledges the provider's queue, not successful delivery.
      return {state:"accepted",message_id:body.message_id};
    },
    async lookup(item,channel) {
      if(!apiKey || !item.provider_message_id) return null;
      const res=await request("https://a.loopmessage.com/v1/message/status/"+encodeURIComponent(item.provider_message_id)+"/",{
        headers:{Authorization:apiKey,"Content-Type":"application/json"},signal:AbortSignal.timeout(12000),
      });
      if(!res.ok) return null;
      const body=await res.json();
      if(body.message_id!==item.provider_message_id || normalizeContact(body.contact)!==channel.contact) throw new Error("Message status identity mismatch.");
      const states:Record<string,string>={processing:"accepted",delivered:"delivered",failed:"failed",unknown:"unknown"};
      if(!states[body.status]) throw new Error("Unsupported provider delivery state.");
      return {state:states[body.status],message_id:body.message_id};
    },
  };
}
