import {serve} from "https://deno.land/std@0.208.0/http/server.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.117.1";
import {handleChat} from "../agent-chat/handler.ts";
import {messageTurnRequest} from "../_shared/message_turn.ts";

// This dedicated deployment bundles its brain and idempotency guard together.
// It cannot route a request to the older live chat that ignores the protocol.
serve(req=>{
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const url=Deno.env.get("SUPABASE_URL")||"";
  if(!key || !url) return new Response(JSON.stringify({error:"Messaging unavailable"}),{status:503,headers:{"Content-Type":"application/json"}});
  return messageTurnRequest(req,createClient(url,key),key,handleChat);
});
