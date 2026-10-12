import {runtimeWorkerContext,loadRuntimeState,saveRuntimeState} from '../../supabase/functions/_shared/agent_runtime_store.ts';
const owner='11111111-1111-4111-8111-111111111111',thread='22222222-2222-4222-8222-222222222222';
const ctx={inbox_id:'33333333-3333-4333-8333-333333333333',lease_token:'44444444-4444-4444-8444-444444444444'};
function assert(v:unknown){if(!v)throw Error('assertion failed');}
async function rejects(fn:()=>unknown){try{await fn();}catch{return;}throw Error('expected rejection');}
const dto=()=>({user_id:owner,thread_id:thread,version:0,state:{paused:false,sent:[]}});
Deno.test('worker context cannot be supplied by an ordinary JWT or widened with owner authority',async()=>{
 for(const [body,bridge] of [[{runtime_context:ctx},false],[{runtime_context:{...ctx,user_id:owner}},true],[{runtime_context:{...ctx,lease_token:'bad'}},true],[{runtime_context:null},true]] as const)
  await rejects(()=>runtimeWorkerContext(body,bridge));
 assert(runtimeWorkerContext({},false)===null);assert(runtimeWorkerContext({runtime_context:ctx},true)?.inbox_id===ctx.inbox_id);
});
Deno.test('read passes durable inbox and lease to server and verifies returned owner and thread',async()=>{
 let args:any;const client={rpc:async(_:string,a:any)=>{args=a;return {data:dto()};}};
 await loadRuntimeState(client,owner,thread,ctx);assert(args.p_inbox===ctx.inbox_id && args.p_lease===ctx.lease_token && args.p_thread===thread);
 for(const changed of [{user_id:'other'},{thread_id:'other'},{version:-1},{state:{paused:false,sent:[],approval:true}},{state:{paused:false,sent:[Date.now()+60000]}},{state:{paused:false,sent:[2,1]}}])
  await rejects(()=>loadRuntimeState({rpc:async()=>({data:{...dto(),...changed}})},owner,thread,null));
 await rejects(()=>loadRuntimeState({rpc:async()=>({error:{message:'database down'}})},owner,thread,null));
});
Deno.test('unchanged state does not consume a version, changed state uses CAS and verifies receipt',async()=>{
 let calls=0,args:any;const client={rpc:async(_:string,a:any)=>{calls++;args=a;return {data:{...dto(),version:1,state:a.p_state}};}};
 const previous=dto();assert(await saveRuntimeState(client,previous,previous.state,ctx)===previous);assert(calls===0);
 const saved=await saveRuntimeState(client,previous,{paused:true,sent:[]},ctx);
 assert(saved.version===1 && calls===1 && args.p_expected_version===0 && args.p_lease===ctx.lease_token);
 for(const data of [{...saved,version:0},{...saved,user_id:'other'},{...saved,state:{paused:false,sent:[]}}])
  await rejects(()=>saveRuntimeState({rpc:async()=>({data})},previous,{paused:true,sent:[]},ctx));
 await rejects(()=>saveRuntimeState({rpc:async()=>({error:{message:'runtime state changed'}})},previous,{paused:true,sent:[]},ctx));
});
Deno.test('client cannot persist a grant, replayed approval or financial authority in runtime state',async()=>{
 let calls=0;const client={rpc:async()=>{calls++;return {data:dto()};}};
 for(const state of [{paused:true,sent:[],envelopes:[]},{paused:true,sent:[],approval:true},{paused:'yes',sent:[]},{paused:true,sent:Array(33).fill(1)}])
  await rejects(()=>saveRuntimeState(client,dto(),state as any,null));
 assert(calls===0);
});
