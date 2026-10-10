// Scheduler-only payment worker. A verified adapter registry is required;
// unconfigured production routes remain disabled and cannot move money.
import {serve} from "https://deno.land/std@0.208.0/http/server.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.117.1";
import {EXECUTION_ADAPTERS,runPaymentQueue} from "../_shared/payment_service.ts";
function sameSecret(a:string,b:string):boolean {
 if (!a || !b || a.length!==b.length) return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
serve(async req=>{
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const expected=Deno.env.get("AGENT_PAYMENT_WORKER_SECRET") || "";
 if(!sameSecret(req.headers.get("x-upmore-payment-secret") || "",expected))return json({error:"Unauthorized"},401);
 try {
  const text=await req.text();if(text.length>1000)return json({error:"Request too large"},413);
  const body=text ? JSON.parse(text) : {};
  const limit=Number.isSafeInteger(body.limit) && body.limit>=1 && body.limit<=10 ? body.limit : 5;
  const adapters=EXECUTION_ADAPTERS.filter(a=>a.verified);
  if(!adapters.length)return json({ok:true,state:"needs_connection",registered_adapters:0,processed:0});
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  return json(await runPaymentQueue(admin,limit,adapters));
 } catch {return json({ok:false,error:"Payment worker failed; existing attempts retain their recovery state."},503);}
});
