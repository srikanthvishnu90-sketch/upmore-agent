import {equalSecret} from "./message_service.ts";

const uuid=(value:unknown):value is string=>typeof value==="string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
function checked(result:any):any {
  if(result.error) throw new Error("Message turn could not be saved.");
  return result.data;
}
export function messageBubbles(reply:string):string[] {
  // Hide internal action annotations. Retain financial numbers, links and
  // wording; never silently truncate an amount, approval or receipt.
  const text=reply.replace(/<!--[\s\S]*?-->/g,"").trim();
  if(!text || text.length>16000) throw new Error("Reply requires review before delivery.");
  if((text.match(/https?:\/\/\S+/g)||[]).some(url=>url.length>4000)) throw new Error("A receipt link requires review before delivery.");
  const bubbles:string[]=[];
  let remaining=text;
  while(remaining.length>4000) {
    let cut=remaining.lastIndexOf("\n",4000);
    if(cut<2000) cut=remaining.lastIndexOf(" ",4000);
    if(cut<2000) cut=4000;
    for(const url of remaining.matchAll(/https?:\/\/\S+/g)) {
      if(url.index!<cut && url.index!+url[0].length>cut) {cut=url.index! || url[0].length;break;}
    }
    // Do not bisect a UTF-16 surrogate pair.
    if(/[\uD800-\uDBFF]/.test(remaining[cut-1])) cut--;
    bubbles.push(remaining.slice(0,cut));remaining=remaining.slice(cut);
  }
  bubbles.push(remaining);
  if(bubbles.length>4) throw new Error("Reply requires review before delivery.");
  return bubbles;
}
export async function messageTurnRequest(req:Request,admin:any,serviceKey:string,brain:(req:Request)=>Promise<Response>):Promise<Response> {
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const supplied=/^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization")||"")?.[1]||"";
  if(!equalSecret(supplied,serviceKey)) return json({error:"Backend authentication required"},401);
  let input:any;
  try {
    const raw=await req.text();
    if(raw.length>2000) return json({error:"Request too large"},413);
    input=JSON.parse(raw);
    if(!input || !uuid(input.inbox_id) || !uuid(input.lease_token) || Object.keys(input).some(k=>!["inbox_id","lease_token"].includes(k))) return json({error:"Invalid message-turn request"},400);
  } catch {return json({error:"Invalid message-turn request"},400);}
  try {
    const begun=checked(await admin.rpc("agent_message_turn_begin",{p_inbox:input.inbox_id,p_lease:input.lease_token}));
    if(!begun.ready) {
      if(begun.state==="completed") return json({ok:true,state:"completed",response:begun.response,http_status:begun.http_status});
      return json({ok:true,state:"pending",message:"The original turn is awaiting reconciliation."},202);
    }
    const context=begun.context;
    // The caller supplies only the inbox and worker lease. Financial owner,
    // thread and text all come from authenticated, durable server records.
    let response:any,status=200;
    if(context.kind==="account_link") {
      response={reply:"Your Upmore account is linked. I’ll ask for a separate approval before moving money."};
    } else {
      const result=await brain(new Request(req.url,{method:"POST",headers:{Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},body:JSON.stringify({
        message:context.text,thread_id:context.thread_id||undefined,as_user_id:context.user_id,
      })}));
      status=result.status;response=await result.json();
      if(result.ok && (typeof response.reply!=="string" || !response.reply.trim())) throw new Error("Missing brain receipt.");
      if(result.ok && !uuid(response.thread_id)) throw new Error("Missing conversation receipt.");
    }
    const bubbles=status>=200 && status<300 ? messageBubbles(response.reply) : ["I couldn’t finish this turn. Check any pending actions before retrying."];
    const saved=checked(await admin.rpc("agent_message_turn_finish",{
      p_inbox:input.inbox_id,p_lease:input.lease_token,p_status:status,p_response:response,p_replies:bubbles,
    }));
    return json({ok:true,state:saved.state,response,http_status:status});
  } catch {
    // A started turn remains durable if the brain or persistence failed. It
    // is never replayed simply because the caller did not get an HTTP reply.
    return json({ok:false,state:"needs_reconciliation",error:"The original message turn needs review"},503);
  }
}
