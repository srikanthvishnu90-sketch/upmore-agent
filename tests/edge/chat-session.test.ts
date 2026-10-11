import {ownerThread,ChatThreadError} from '../../supabase/functions/agent-chat/_shared/chat_session.ts';
function assert(v:unknown){if(!v)throw new Error('assertion failed');}
const thread='11111111-1111-4111-8111-111111111111';
function client(row:any={id:thread,user_id:'owner'},error:any=null){
  const calls:any[]=[];const q:any={select(fields:string){calls.push(['select',fields]);return q;},eq(field:string,value:unknown){calls.push(['eq',field,value]);return q;},insert(value:unknown){calls.push(['insert',value]);return q;},async maybeSingle(){return {data:row,error};},async single(){return {data:row,error};}};
  return {calls,from(table:string){calls.push(['from',table]);return q;}};
}
Deno.test('service bridge history lookup is explicitly bound to its authenticated owner',async()=>{
  const c=client();assert(await ownerThread(c,'owner',thread,'hello')===thread);assert(c.calls.some(x=>x[0]==='eq' && x[1]==='user_id' && x[2]==='owner'));
});
Deno.test('cross-owner thread remains inaccessible even when a service reader bypasses RLS',async()=>{
  const c=client({id:thread,user_id:'other'});try{await ownerThread(c,'owner',thread,'hello');}catch(e){assert(e instanceof ChatThreadError && e.status===404);assert(!c.calls.some(x=>x[0]==='insert'));return;}throw new Error('expected ownership rejection');
});
Deno.test('missing thread does not silently create a different conversation',async()=>{
  const c=client(null);try{await ownerThread(c,'owner',thread,'hello');}catch(e){assert(e instanceof ChatThreadError && e.status===404);assert(!c.calls.some(x=>x[0]==='insert'));return;}throw new Error('expected missing thread rejection');
});
Deno.test('bad thread ID is rejected before any database query',async()=>{
  for(const id of [123,'not-a-uuid']){const c=client();try{await ownerThread(c,'owner',id,'hello');}catch(e){assert(e instanceof ChatThreadError && e.status===400);assert(c.calls.length===0);continue;}throw new Error('expected invalid ID rejection');}
});
Deno.test('new conversation is created only for the server-authenticated owner',async()=>{
  const c=client();await ownerThread(c,'owner',undefined,'hello');const payload=c.calls.find(x=>x[0]==='insert')![1] as any;assert(payload.user_id==='owner' && payload.title==='hello');
});
