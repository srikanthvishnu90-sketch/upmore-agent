const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const thread='11111111-1111-4111-8111-111111111111',otherThread='22222222-2222-4222-8222-222222222222',obligation='33333333-3333-4333-8333-333333333333',task='44444444-4444-4444-8444-444444444444';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(overrides={}){
  let owner='owner',place={thread:null,mode:'ask'},calls=[];
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/chat-request-controller.js'),'utf8'),context);
  const controller=context.UpmoreChatRequests({identity:()=>owner?{owner}:null,conversation:()=>place,
    getToken:async()=> 'token',request:async(body,token)=>{calls.push({body,token});return {thread_id:body.thread_id || thread,reply:'Grounded response'};},
    readThreads:async owner=>[{id:thread,user_id:owner}],readHistory:async(owner,id)=>({thread:{id,user_id:owner},messages:[{thread_id:id,role:'assistant',content:'Private history'}]}),...overrides});
  return {controller,calls,setOwner(value){owner=value;},setPlace(value){place=value;}};
}
test('delayed token resolution after owner change never sends the previous message under the new token',async()=>{
  const token=deferred(),f=fixture({getToken:()=>token.promise});const result=f.controller.ask('my rent');f.setOwner('other');token.resolve('other-token');assert.equal((await result).state,'stale');assert.equal(f.calls.length,0);
});
test('new chat invalidation drops delayed replies and does not fall back to private local data',async()=>{
  const network=deferred(),f=fixture({request:()=>network.promise}),ticket=f.controller.capture();const result=f.controller.ask('rent',null,ticket);
  await new Promise(resolve=>setImmediate(resolve));f.controller.invalidate();network.resolve({thread_id:thread,reply:'Old private balance'});
  const outcome=await result;assert.equal(outcome.state,'stale');assert.equal(outcome.value,undefined);
  let fallback=0;if(outcome.state==='unavailable')fallback++;assert.equal(fallback,0);assert.equal(ticket.adoptThread(thread,()=>{throw Error('must not commit');}),false);
});
test('thread switch and chat mode changes invalidate captured work even without explicit invalidation',async()=>{
  for(const changed of [{thread:otherThread,mode:'ask'},{thread,mode:'agent'}]){
    const network=deferred(),f=fixture({request:()=>network.promise});f.setPlace({thread,mode:'ask'});const result=f.controller.ask('question');
    await new Promise(resolve=>setImmediate(resolve));f.setPlace(changed);network.resolve({thread_id:thread,reply:'Old private answer'});assert.equal((await result).state,'stale');
  }
});
test('current new chat adopts only its own valid server thread and existing chats reject substitution',async()=>{
  const f=fixture(),ticket=f.controller.capture(),result=await f.controller.ask('rent',null,ticket);
  assert.equal(result.state,'ok');assert.equal(ticket.adoptThread(result.value.thread_id,id=>f.setPlace({thread:id,mode:'ask'})),true);assert.equal(ticket.current(),true);
  assert.equal(ticket.adoptThread(otherThread,()=>{}),false);
  const wrong=fixture({request:async()=>({thread_id:otherThread,reply:'wrong conversation'})});wrong.setPlace({thread,mode:'ask'});assert.equal((await wrong.controller.ask('rent')).state,'unavailable');
});
test('late errors are stale rather than triggering fallback, while current outages may use general guidance',async()=>{
  const network=deferred(),f=fixture({request:()=>network.promise});const result=f.controller.ask('private question');await new Promise(resolve=>setImmediate(resolve));f.setOwner(null);network.reject(Error('private error'));assert.equal((await result).state,'stale');
  const outage=fixture({request:async()=>{throw Error('unavailable');}});assert.equal((await outage.controller.ask('question')).state,'unavailable');
});
test('thread list and history cannot repopulate an old owner or switched conversation',async()=>{
  const listing=deferred(),f=fixture({readThreads:()=>listing.promise});const list=f.controller.list();f.setOwner('other');listing.resolve([{id:thread,user_id:'owner'}]);assert.equal((await list).state,'stale');
  const history=deferred(),h=fixture({readHistory:()=>history.promise});h.setPlace({thread,mode:'ask'});const result=h.controller.history();h.setPlace({thread:otherThread,mode:'ask'});history.resolve({thread:{id:thread,user_id:'owner'},messages:[{thread_id:thread,role:'assistant',content:'Private'}]});assert.equal((await result).state,'stale');
});
test('current history requires separately owned thread and exact message binding',async()=>{
  for(const bad of [{thread:{id:thread,user_id:'other'},messages:[]},{thread:{id:otherThread,user_id:'owner'},messages:[]},{thread:{id:thread,user_id:'owner'},messages:[{thread_id:otherThread,role:'assistant',content:'private'}]}]){
    const f=fixture({readHistory:async()=>bad});f.setPlace({thread,mode:'ask'});assert.equal((await f.controller.history()).state,'unavailable');
  }
  const f=fixture();f.setPlace({thread,mode:'ask'});assert.equal((await f.controller.history()).value[0].content,'Private history');
});
test('workflow link validates exact identifiers, drops authority fields and stops after navigation changes',async()=>{
  const f=fixture(),ticket=f.controller.capture();const bound=ticket.workflow({type:'workflow',obligation_id:obligation,task_id:task,approved:true,amount_cents:9999});
  assert.ok(bound);assert.equal(bound.link.approved,undefined);assert.equal(bound.link.amount_cents,undefined);let opened;
  assert.equal(bound.open(link=>opened=link),true);assert.equal(opened.obligation_id,obligation);
  f.controller.invalidate();assert.equal(bound.open(()=>{throw Error('stale link');}),false);
  assert.equal(f.controller.capture().workflow({type:'workflow',obligation_id:'javascript:pay()',task_id:task}),null);
  assert.equal(f.controller.capture().workflow({type:'approve',obligation_id:obligation,task_id:task}),null);
});
test('invalid workflow payload cannot become a bill link or financial approval',async()=>{
  const f=fixture({request:async()=>({thread_id:thread,reply:'Pay now',action:{type:'workflow',obligation_id:obligation,task_id:'forged'}})});assert.equal((await f.controller.ask('bill')).state,'unavailable');
});
test('anonymous local scopes stay usable until sign-in changes their identity',async()=>{
  const f=fixture();f.setOwner(null);const ticket=f.controller.capture();assert.equal((await ticket.run(async()=> 'general facts')).state,'ok');assert.equal((await f.controller.ask('question',null,ticket)).state,'unavailable');assert.equal(f.calls.length,0);f.setOwner('owner');assert.equal(ticket.current(),false);
});
test('sign-out and same-owner sign-in still invalidate old conversation tickets',async()=>{
  const f=fixture(),ticket=f.controller.capture();f.setOwner(null);f.controller.invalidate();f.setOwner('owner');assert.equal(ticket.current(),false);
  assert.equal((await ticket.run(async()=> 'old private data')).state,'stale');
});
test('malformed history and thread lists stay unavailable instead of leaking unbound rows',async()=>{
  const f=fixture({readThreads:async()=>[{id:thread,user_id:'other'}],readHistory:async()=>({thread:{id:thread,user_id:'owner'},messages:[null]})});
  assert.equal((await f.controller.list()).state,'unavailable');f.setPlace({thread,mode:'ask'});assert.equal((await f.controller.history()).state,'unavailable');
});
