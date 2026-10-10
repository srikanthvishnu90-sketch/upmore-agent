import {serve} from "https://deno.land/std@0.208.0/http/server.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.117.1";
import {equalSecret} from "../_shared/message_service.ts";
import {processInbox} from "../_shared/message_processing.ts";
import {deliverMessage,MESSAGE_TRANSPORTS} from "../_shared/message_delivery.ts";

serve(async req=>{
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  if(!equalSecret(req.headers.get("x-upmore-message-secret")||"",Deno.env.get("AGENT_MESSAGE_WORKER_SECRET")||"")) return json({error:"Unauthorized worker"},401);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url || !key) return json({error:"Messaging unavailable"},503);
  let batch=3;
  try {
    const raw=await req.text();if(raw.length>1000)return json({error:"Request too large"},413);
    if(raw){const body=JSON.parse(raw);if(body.batch!==undefined)batch=body.batch;}
    if(!Number.isInteger(batch)||batch<1||batch>5)return json({error:"Invalid batch"},400);
  }catch{return json({error:"Invalid request"},400);}
  const admin=createClient(url,key),results:any[]=[];
  const deadline=Date.now()+100000;
  try {
    const heads=await admin.rpc("agent_message_queue_heads",{p_limit:batch});
    if(heads.error)throw new Error("Inbox queue unavailable");
    for(const head of heads.data||[]) {
      if(Date.now()>deadline-15000)break;
      results.push({inbox_id:head.id,...await processInbox(admin,head.id,async item=>{
        const res=await fetch(url+"/functions/v1/agent-message-turn",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
          body:JSON.stringify({inbox_id:item.id,lease_token:item.lease_token}),signal:AbortSignal.timeout(Math.min(85000,deadline-Date.now()-5000))});
        return await res.json();
      })});
    }
    // The outbound registry remains empty until real account/transport checks
    // are complete. Inbound processing can still produce durable draft replies.
    if(MESSAGE_TRANSPORTS.some(t=>t.verified) && Date.now()<deadline-15000) {
      const pending=await admin.from("agent_message_outbox").select("id").in("state",["queued","submitted","accepted","unknown"]).order("created_at").order("id").limit(batch);
      if(pending.error)throw new Error("Outbox queue unavailable");
      for(const item of pending.data||[]) {
        if(Date.now()>deadline-15000)break;
        results.push({outbox_id:item.id,...await deliverMessage(admin,item.id)});
      }
    }
    return json({ok:true,results,outbound_enabled:MESSAGE_TRANSPORTS.some(t=>t.verified)});
  }catch{return json({ok:false,error:"Message worker could not finish",results},503);}
});
