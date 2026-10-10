import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { workflowAction } from "../_shared/workflow_service.ts";

const origins = new Set([
  "https://upmore-topaz.vercel.app",
  "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app",
  "http://localhost:3000","http://localhost:8000","http://localhost:8080","http://localhost:8901",
  "http://127.0.0.1:8000","http://127.0.0.1:8080","http://127.0.0.1:8901",
  ...(Deno.env.get("UPMORE_ALLOWED_ORIGINS") || "").split(",").map(s=>s.trim()).filter(Boolean),
]);
serve(async req => {
  const cors: Record<string,string> = {
    "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
    "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin",
  };
  const origin = req.headers.get("Origin") || "";
  if (origins.has(origin)) cors["Access-Control-Allow-Origin"] = origin;
  const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{
    status,headers:{...cors,"Content-Type":"application/json"},
  });
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
  if (req.method !== "POST") return json({error:"Method not allowed"},405);
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") || "")?.[1];
  if (!token) return json({error:"Sign in required"},401);
  try {
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const client = createClient(url,anon,{global:{headers:{Authorization:`Bearer ${token}`}}});
    const {data:{user},error} = await client.auth.getUser(token);
    if (error || !user) return json({error:"Invalid session"},401);
    const rate = await client.rpc("agent_workflow_rate_bump");
    if (rate.error) return json({error:"Workflow service unavailable"},503);
    if (!rate.data) return json({error:"Too many workflow requests. Try again next hour."},429);
    // Bounded ingestion and planning. Identity comes exclusively from Auth.
    const input = await req.text();
    if (input.length > 24000) return json({error:"Request too large"},413);
    const body = JSON.parse(input);
    const admin = createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    return json(await workflowAction(user.id,client,admin,body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow request failed";
    return json({ok:false,error:message.slice(0,200)},400);
  }
});
