import {ingestBillerRecords,refreshBiller} from '../../supabase/functions/_shared/biller_service.ts';
function assert(v:unknown){if(!v)throw new Error('assertion failed');}
async function rejects(fn:()=>Promise<unknown>){try{await fn();}catch{return;}throw new Error('expected rejection');}
const now='2026-10-08T12:00:00Z';
const connection={id:'connection',user_id:'owner',provider_key:'provider',provider_account_id:'account',status:'active',capabilities:{read_obligations:true}};
const record={external_id:'invoice',provider_account_id:'account',source_version:1,creditor:'Biller',status:'verified',unpaid_confirmed:true,amount_due_cents:10000,currency:'USD',due_on:'2026-10-09',observed_at:now};
function admin(){const calls:any[]=[];return {calls,async rpc(name:string,args:any){calls.push({name,args});return {data:{applied:1}};}};}
function reader(c=connection){const query:any={select(){return query;},eq(){return query;},async single(){return {data:c};}};return {from(){return query;}};}
Deno.test('biller ingestion uses stable hashes and scoped connection identity',async()=>{const a=admin();await ingestBillerRecords(a,connection,[record],now);await ingestBillerRecords(a,connection,[record],now);const x=a.calls[0].args;assert(x.p_connection==='connection');assert(/^[a-f0-9]{64}$/.test(x.p_records[0].source_hash));assert(x.p_records[0].source_hash===a.calls[1].args.p_records[0].source_hash);});
Deno.test('invalid correction never reaches service-owned storage',async()=>{const a=admin();await rejects(()=>ingestBillerRecords(a,connection,[record,{...record,external_id:'bad',amount_due_cents:-1}],now));assert(a.calls.length===0);});
Deno.test('unregistered biller reports missing connection without a fabricated refresh',async()=>{const a=admin();const r=await refreshBiller('owner',reader(),a,'connection');assert(r.state==='needs_connection');assert(a.calls.length===0);});
Deno.test('another owner cannot cause a connector read',async()=>{let reads=0;const a=admin();const adapter={id:'provider',verified:true,async read(){reads++;return [record];}};await rejects(()=>refreshBiller('wrong-owner',reader(),a,'connection',[adapter]));assert(reads===0);assert(a.calls.length===0);});
Deno.test('revoked connection does not call a provider even when adapter is registered',async()=>{let reads=0;const a=admin();await rejects(()=>refreshBiller('owner',reader({...connection,status:'revoked'}),a,'connection',[{id:'provider',verified:true,async read(){reads++;return [record];}}]));assert(reads===0);});
