import {AgentWorkflows as planner} from '../../supabase/functions/_shared/agent_core.js';
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
const now = '2026-10-10T16:00:00Z';
const bill = {id:'invoice-a',revision:4,creditor:'Rent',provider_key:'biller',provider_account_id:'resident',reference:'invoice-1',source_type:'biller',status:'verified',kind:'rent',direction:'payable',amount_due_cents:10500,currency:'USD',due_on:'2026-10-11',observed_at:now,autopay:'off',funding_account_id:'funding',evidence:{unpaid_confirmed:true}};
const context = {now,stopped:false,accounts:[{id:'funding',currency:'USD',owned:true,payment_enabled:true,available_cents:50000,observed_at:now}],adapters:[{id:'adapter',verified:true,actions:['pay_obligation'],providers:['biller'],currencies:['USD'],kinds:['rent'],idempotent:true,reconciles:true,fee_cents:0}],cash_coverage_complete:true,other_obligations_cents:0,buffer_cents:5000};
Deno.test('applied payment with revised creditor debt cannot produce a second payment proposal',()=>{
 const result=planner.plan(bill,{...context,attempts:[{obligation_id:bill.id,status:'applied'}]});
 assert(result.state==='needs_sync' && result.code==='applied_payment_reconciliation_required' && result.proposal===null,'An applied payment requires explicit creditor reconciliation before paying again');
});
Deno.test('later bill timestamp and untrusted reconciliation assertions cannot clear an applied payment',()=>{
 const result=planner.plan({...bill,evidence:{unpaid_confirmed:true,payment_reconciled:true,remaining_due_confirmed:true,applied_reference:'invented'}},{...context,attempts:[{obligation_id:bill.id,status:'applied',updated_at:'2026-10-10T15:00:00Z'}]});
 assert(result.code==='applied_payment_reconciliation_required' && result.proposal===null,'A later refresh or arbitrary evidence cannot authorize another debit');
});
Deno.test('applied payment on a different invoice does not prevent a separately verified payment',()=>{
 const result=planner.plan(bill,{...context,attempts:[{obligation_id:'other-invoice',status:'applied'}]});
 assert(result.state==='awaiting_approval','The guard is scoped to the exact obligation');
});
Deno.test('final creditor result remains resolved without a new proposal',()=>{
 const result=planner.plan({...bill,status:'settled',amount_due_cents:0},{...context,attempts:[{obligation_id:bill.id,status:'applied'}]});
 assert(result.state==='resolved' && result.proposal===null,'Verified completed bills remain completed');
});
