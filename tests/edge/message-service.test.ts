import {equalSecret,normalizeContact,normalizeLoopMessage,ingestLoopMessage,messageHash} from '../../supabase/functions/_shared/message_service.ts';
function assert(v:unknown){if(!v)throw new Error('assertion failed');}
async function rejects(fn:()=>Promise<unknown>|unknown){try{await fn();}catch{return;}throw new Error('expected rejection');}
const base={organization_id:'org',event:'message_inbound',message_id:'inbound-1',contact:'+1 (312) 555-0123',text:'What is due tomorrow?'};
Deno.test('webhook secret fails closed when absent short or mismatched',()=>{
  assert(!equalSecret('',''));assert(!equalSecret('short','short'));assert(!equalSecret('a'.repeat(31),'a'.repeat(32)));
  assert(!equalSecret('a'.repeat(32)+'b','a'.repeat(32)));assert(equalSecret('a'.repeat(32),'a'.repeat(32)));
});
Deno.test('canonical sender uses full international identity without founder suffix matching',async()=>{
  assert(normalizeContact(base.contact)==='+13125550123');assert(normalizeContact('User@Example.COM')==='user@example.com');
  assert(normalizeContact('+44 20 7946 0123')==='+442079460123');
  await rejects(()=>normalizeContact('03125550123'));await rejects(()=>normalizeContact('abc3125550123'));await rejects(()=>normalizeContact('+12'));
});
Deno.test('provider metadata cannot choose a financial owner or approve an action',async()=>{
  const item=await normalizeLoopMessage({...base,user_id:'attacker',as_user_id:'attacker',parameters:{approved:true,amount:1}},'org');
  assert(!('user_id' in item));assert(!('approved' in item));assert(item.text===base.text);
});
Deno.test('dedupe hashes ignore webhook retries but bind meaningful content',async()=>{
  const a=await normalizeLoopMessage({...base,webhook_id:'delivery-1'},'org');
  const b=await normalizeLoopMessage({...base,webhook_id:'delivery-2',updated_at:'later'},'org');
  const c=await normalizeLoopMessage({...base,text:'Pay $999 instead'},'org');
  assert(a.source_hash===b.source_hash);assert(a.source_hash!==c.source_hash);
});
Deno.test('one-time link code is hashed and removed from persisted content',async()=>{
  const code='ab'.repeat(16),item=await normalizeLoopMessage({...base,text:'CONNECT '+code},'org');
  assert(item.link_hash===await messageHash(code));assert(item.text==='[Account linked]');assert(!JSON.stringify(item).includes(code));
});
Deno.test('missing ID, organization, event, groups and oversized texts fail before persistence',async()=>{
  for(const body of [{...base,message_id:''},{...base,organization_id:'other'},{...base,event:undefined},{...base,group:{id:'group'}},{...base,text:'x'.repeat(4001)},{...base,attachments:['https://example.com/a']},{...base,text:''}]) await rejects(()=>normalizeLoopMessage(body,'org'));
});
Deno.test('delivery and read status events are ignored without generating requests',async()=>{
  let calls=0;const result=await ingestLoopMessage({async rpc(){calls++;}}, {...base,event:'message_delivered'},'org');
  assert(result.ignored && calls===0);
});
Deno.test('inbound persistence uses canonical server-scoped RPC and redacted code',async()=>{
  let saved:any;const code='ab'.repeat(16);
  const result=await ingestLoopMessage({async rpc(name:string,args:any){saved={name,args};return {data:{ok:true,state:'queued'}};}},{...base,text:'CONNECT '+code},'org');
  assert(result.state==='queued');assert(saved.name==='agent_message_ingest');assert(saved.args.p_contact==='+13125550123');
  assert(saved.args.p_account==='upmore');assert(!JSON.stringify(saved).includes(code));assert(saved.args.p_link_hash===await messageHash(code));
});
Deno.test('storage failure is retryable and never leaks provider contents',async()=>{
  try{await ingestLoopMessage({async rpc(){return {error:{message:base.text}};}},base,'org');}catch(e){assert(e instanceof Error && !e.message.includes(base.text));return;}
  throw new Error('expected storage error');
});
