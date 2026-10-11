import {serve} from "https://deno.land/std@0.208.0/http/server.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.117.1";
import {equalSecret,ingestLoopMessage} from "../_shared/message_service.ts";

// Separate from the currently deployed founder test bridge. Configure this
// endpoint in the provider only after its schema and transport are verified.
// verify_jwt must be false: the webhook secret authenticates the provider.
serve(async req=>{
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const secret=Deno.env.get("UPMORE_MESSAGE_WEBHOOK_SECRET")||"";
  // Retains the test bridge's header/query authentication convention. A
  // query token must be configured as a secret, excluded from request logs.
  const supplied=req.headers.get("x-imessage-secret")||new URL(req.url).searchParams.get("secret")||"";
  if(!equalSecret(supplied,secret)) return json({error:"Unauthorized webhook"},401);
  const organization=Deno.env.get("LOOPMESSAGE_UPMORE_ORGANIZATION_ID")||"";
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!organization || !url || !key) return json({error:"Messaging is not configured"},503);
  let body:any;
  try {
    const raw=await req.text();
    if(new TextEncoder().encode(raw).length>24000) return json({error:"Request too large"},413);
    body=JSON.parse(raw);
  } catch {return json({error:"Invalid webhook"},400);}
  try {
    const result=await ingestLoopMessage(createClient(url,key),body,organization);
    // Acknowledgement means durable ingestion, never delivery or execution.
    return json(result);
  } catch {
    // The provider may retry a transient persistence failure with the same
    // message ID. Logs and errors never echo message text or link codes.
    return json({error:"Webhook could not be processed"},503);
  }
});
