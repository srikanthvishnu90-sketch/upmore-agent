import '../../src/ledger-review-controller.js';
import {workflowAction} from '../../supabase/functions/_shared/workflow_service.ts';
import {rejects, user} from './lib/financial_fixture.ts';
const create=(globalThis as any).UpmoreLedgerReview;
function assert(v:unknown){if(!v)throw new Error('ledger UI assertion failed');}
const row={user_id:user,account_id:'checking',provider_transaction_id:'tx',fact_hash:'original',posted_on:'2026-10-10',presence:'observed',is_pending:false};
function deferred(){let resolve:any;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
Deno.test('ledger drops a delayed response after owner change or explicit reset',async()=>{
  for(const reset of [false,true]) {
    let owner=user;const d=deferred();const c=create({identity:()=>({owner,token:'token'}),request:()=>d.promise,uuid:()=>crypto.randomUUID()});
    const pending=c.read({action:'ledger_page'});if(reset)c.invalidate();else owner='other';
    d.resolve({rows:[row]});assert(await pending===null);
  }
});
Deno.test('ledger rejects cross-owner rows and never submits another owner classification',async()=>{
  let calls=0;const c=create({identity:()=>({owner:user,token:'token'}),request:()=>{calls++;return {rows:[{...row,user_id:'other'}]};},uuid:()=>crypto.randomUUID()});
  await rejects(()=>c.read({}),'ownership mismatch');
  await rejects(()=>c.save({...row,user_id:'other'},'expense','Food'),'own transaction');assert(calls===1);
});
Deno.test('lost classification response retries exact request ID and reviewed bank fingerprint',async()=>{
  const calls:any[]=[];let id=0;
  const c=create({identity:()=>({owner:user,token:'token'}),uuid:()=>String(++id),request:(b:any)=>{calls.push(b);if(calls.length===1)throw new Error('lost response');return {ok:true};}});
  await rejects(()=>c.save(row,'expense','Food'),'lost response');c.invalidate(false);await c.save(row,'expense','Food');
  assert(calls[0].request_id===calls[1].request_id && calls[1].review.fact_hash==='original' && calls[1].confirmed===true);
  await c.save({...row,fact_hash:'changed'},'expense','Food');assert(calls[2].request_id!==calls[1].request_id);
});
Deno.test('classification blocks double click, stale owner response and missing linked evidence',async()=>{
  let owner=user;const d=deferred();let calls=0;
  const c=create({identity:()=>({owner,token:'token'}),uuid:()=>crypto.randomUUID(),request:()=>{calls++;return d.promise;}});
  await rejects(()=>c.save(row,'refund',''),'owned linked record');
  const pending=c.save(row,'expense','Food');await rejects(()=>c.save(row,'expense','Food'),'already being saved');
  owner='other';d.resolve({ok:true});assert(await pending===null && calls===1);
});
Deno.test('ledger page uses the Auth-bound snapshot RPC and rejects malformed ranges or owner leaks',async()=>{
  const calls:any[]=[];const r={rpc:(name:string,args:any)=>{calls.push({name,args});return {data:{ok:true,rows:[row],next_offset:null}};}};
  const page=await workflowAction(user,r,{}, {action:'ledger_page',from:'2026-10-01',to:'2026-10-31',offset:50,user_id:'other'});
  assert(page.rows[0]===row && calls[0].name==='agent_transaction_review_page');
  assert(JSON.stringify(calls[0].args)===JSON.stringify({p_from:'2026-10-01',p_to:'2026-10-31',p_offset:50}));
  await rejects(()=>workflowAction(user,r,{}, {action:'ledger_page',from:'2026-02-30',to:'2026-10-31'}),'real inclusive date');
  await rejects(()=>workflowAction(user,r,{}, {action:'ledger_page',from:null,to:null}),'real inclusive date');
  for(const leaked of [{...row,user_id:'other'},{...row,latest_review:{user_id:'other'}}]) {
    await rejects(()=>workflowAction(user,{rpc:()=>({data:{rows:[leaked]}})}, {},{action:'ledger_page',from:'2026-10-01',to:'2026-10-31'}),'ownership mismatch');
  }
});
Deno.test('linked save binds both fingerprints, uses an atomic pair action and preserves retry identity',async()=>{
  const calls:any[]=[];let count=0;const linked={...row,account_id:'savings',provider_transaction_id:'credit',fact_hash:'opposite'};
  const c=create({identity:()=>({owner:user,token:'token'}),uuid:()=>crypto.randomUUID(),request:(b:any)=>{calls.push(b);if(++count===1)throw new Error('lost pair response');return {ok:true};}});
  await rejects(()=>c.save(row,'internal_transfer','',linked),'lost pair response');await c.save(row,'internal_transfer','',linked);
  assert(calls[0].request_id===calls[1].request_id && calls[1].action==='classify_transaction_pair' && calls[1].review.linked_fact_hash==='opposite');
  await rejects(()=>c.save(row,'internal_transfer','Food',linked),'not spending categories');
  await rejects(()=>c.save(row,'refund','', {...linked,user_id:'other'}),'owned linked record');
  await c.save(row,'refund','',linked);assert(calls[2].action==='classify_transaction');
});
Deno.test('linked workflow RPCs are user-bound and pair writes require explicit confirmation',async()=>{
  const calls:any[]=[];const client={rpc:(name:string,args:any)=>{calls.push({name,args});return {data:name==='agent_transaction_link_candidates'?{rows:[row]}:{}};}};
  await workflowAction(user,client,{}, {action:'ledger_link_candidates',review:{fact_hash:'exact'},offset:20,user_id:'other'});
  assert(calls[0].name==='agent_transaction_link_candidates' && calls[0].args.p_offset===20 && !('p_user' in calls[0].args));
  await rejects(()=>workflowAction(user,client,{}, {action:'classify_transaction_pair',request_id:crypto.randomUUID(),review:{}}),'explicitly confirm');
  await workflowAction(user,client,{}, {action:'classify_transaction_pair',request_id:crypto.randomUUID(),confirmed:true,review:{}});
  assert(calls[1].name==='agent_transaction_review_pair');
  await rejects(()=>workflowAction(user,{rpc:()=>({data:{rows:[{...row,user_id:'other'}]}})}, {},{action:'ledger_link_candidates',review:{}}),'ownership mismatch');
});
