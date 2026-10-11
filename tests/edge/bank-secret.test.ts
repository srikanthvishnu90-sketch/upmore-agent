import {ownerBankAccessUrl} from "../../supabase/functions/_shared/bank_secret.ts";
const owner="00000000-0000-0000-0000-000000000001";
function assert(value:boolean){if(!value)throw new Error("Bank owner assertion failed");}
Deno.test("missing owner bank secret never falls back to a global account",async()=>{
 let calls=0;
 const value=await ownerBankAccessUrl("https://fixture.invalid","synthetic",owner,async(input)=>{
   calls++; const url=new URL(String(input));
   assert(url.searchParams.get("name")===`eq.simplefin_access_url_${owner}`);
   return Response.json([]);
 });
 assert(value===null && calls===1);
});
Deno.test("bank secret lookup uses only the server authenticated owner namespace",async()=>{
 const value=await ownerBankAccessUrl("https://fixture.invalid","synthetic",owner,async()=>Response.json([{secret:"synthetic-owner-access-url"}]));
 assert(value==="synthetic-owner-access-url");
});
Deno.test("bank storage errors cannot become a global credential fallback",async()=>{
 let calls=0,failed=false;
 try{await ownerBankAccessUrl("https://fixture.invalid","synthetic",owner,async()=>{calls++;return new Response("",{status:503});});}catch{failed=true;}
 assert(failed && calls===1);
});
Deno.test("invalid bank owner is rejected before credential lookup",async()=>{
 let calls=0,failed=false;
 try{await ownerBankAccessUrl("https://fixture.invalid","synthetic","other-user",async()=>{calls++;return Response.json([]);});}catch{failed=true;}
 assert(failed && calls===0);
});
