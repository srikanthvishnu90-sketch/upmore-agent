import {writePrivateChatLesson,notePrivateLessonsApplied} from "../../supabase/functions/agent-chat/_shared/chat_lesson_write.ts";
const owner="00000000-0000-0000-0000-000000000001";
const lesson={kind:"user_correction",scope:"global",category:"user_correction",title:"Private correction",what_happened:"Synthetic fact",what_to_do_instead:"Keep it private"};
function assert(value:boolean){if(!value)throw new Error("Lesson ownership assertion failed");}
Deno.test("bridge lesson write explicitly binds verified owner rather than auth.uid null",async()=>{
  const calls:any[]=[];const client={rpc:async(name:string,args:any)=>{calls.push({name,args});return {error:null};}};
  await writePrivateChatLesson(client,owner,lesson,true);
  await notePrivateLessonsApplied(client,owner,[owner],true);
  assert(calls[0].name==="record_agent_lesson_as" && calls[0].args.p_user===owner);
  assert(calls[1].name==="agent_lessons_note_applied_as" && calls[1].args.p_user===owner);
});
Deno.test("normal chat uses authenticated owner RPC without accepting a supplied owner",async()=>{
  let call:any;const client={rpc:async(name:string,args:any)=>{call={name,args};return {error:null};}};
  await writePrivateChatLesson(client,owner,lesson,false);
  assert(call.name==="record_agent_lesson" && !("p_user" in call.args));
});
Deno.test("failed bridge writes do not fall back to globally visible insertion",async()=>{
  let calls=0;let failed=false;
  try{await writePrivateChatLesson({rpc:async()=>{calls++;return {error:{message:"missing RPC"}};}},owner,lesson,true);}catch{failed=true;}
  assert(failed && calls===1);
});
