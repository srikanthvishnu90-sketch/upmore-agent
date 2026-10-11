const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../packages/domain/41-agent-subscription-case.js');
const now='2026-10-10T12:00:00Z';
async function fixture(change={}) {
  const facts={subscription_id:'sub',provider_account_id:'vendor-account',merchant:'Streaming',plan:'Monthly',purchase_channel:'app_store',renewal_on:'2026-10-12',effective_on:'2026-10-11',review_deadline_on:'2026-10-10',renewal_amount_cents:1500,fee_cents:100,remaining_contract_cents:200,currency:'USD',interval_months:1,access_loss:'End of paid period',refund_policy:'Not promised',billing_account_id:'bank-account',issuer_provider_key:'issuer',block_scope:'Merchant billing ID only',block_limitations:'Does not cancel contract',...change};
  const records={},approvals={};
  async function add(id,kind,fields={},extra={}) {
    const payload=kind==='subscription_snapshot'?facts:{subscription_id:'sub',provider_account_id:'vendor-account',currency:'USD',...fields};
    records[id]={id,kind,owner_id:'owner',authority:'protected-provider',provider_key:'vendor',external_reference:'receipt:'+id,observed_at:now,facts:payload,payload_hash:await C.hash(payload),...extra};return id;
  }
  await add('source','subscription_snapshot');
  const scope={owner_id:'owner',readEvidence:async id=>records[id],readApproval:async id=>approvals[id]};
  const p=await C.prepare(scope,'source','cancel_contract',now);
  return {facts,records,approvals,scope,add,p,state:p.proposal?C.create(p.proposal):null};
}
async function cancelled(f) {
  await f.add('accepted','cancellation_accepted',{effective_on:f.facts.effective_on,fee_cents:f.facts.fee_cents,fee_incurred_cents:f.facts.fee_cents,access_loss:f.facts.access_loss});
  let s=await C.applyEvidence(f.scope,f.state,'accepted',now);
  await f.add('effective','cancellation_effective',{effective_on:f.facts.effective_on,fee_cents:f.facts.fee_cents,access_loss:f.facts.access_loss});
  return C.applyEvidence(f.scope,s,'effective','2026-10-12T12:00:00Z');
}
test('channel, plan, fee, access and unresolved terms are required before review',async()=>{
  for(const patch of [{purchase_channel:'unknown'},{plan:null},{fee_cents:null},{access_loss:null},{refund_policy:null},{renewal_on:'2026-02-30'},{currency:'EUR'},{renewal_amount_cents:1.1}]) {
    const f=await fixture(patch);assert.equal(f.p.state,'needs_evidence');assert.equal(f.p.proposal,null);
  }
});
test('canonical proposal is exact, source-linked and never executable without an adapter',async()=>{
  const f=await fixture();assert.equal(f.p.state,'ready_for_review');assert.equal(f.p.proposal.terms.purchase_channel,'app_store');assert.equal(f.p.execution,'disabled_no_adapter');
  assert.equal(C.canonical({z:1,a:2}),C.canonical({a:2,z:1}));assert.match(f.p.proposal.hash,/^[a-f0-9]{64}$/);
});
test('untrusted client proof, other owners, future evidence and altered facts are rejected',async()=>{
  for(const patch of [{authority:'client-upload'},{owner_id:'other'},{observed_at:'2027-01-01T00:00:00Z'},{payload_hash:'forged'}]) {
    const f=await fixture();Object.assign(f.records.source,patch);await assert.rejects(()=>C.prepare(f.scope,'source','cancel_contract',now));
  }
});
test('stale snapshot and missed review window cannot produce an approval proposal',async()=>{
  const f=await fixture();f.records.source.observed_at='2026-10-01T00:00:00Z';assert.equal((await C.prepare(f.scope,'source','cancel_contract',now)).state,'needs_evidence');
  assert.equal((await fixture({review_deadline_on:'2026-10-09'})).p.state,'needs_evidence');
});
test('approval comes from protected owner store and binds all material terms',async()=>{
  const f=await fixture(),p=f.p.proposal;
  const a={id:'approval',owner_id:'owner',actor:'authenticated-owner',status:'approved',proposal_hash:p.hash,terms:p.terms,expires_at:'2026-10-10T12:10:00Z'};
  f.approvals.approval=a;assert.equal((await C.authorize(f.scope,f.state,'approval',now)).execution,'disabled_no_adapter');
  for(const patch of [{owner_id:'other'},{actor:'model'},{status:'revoked'},{proposal_hash:'bad'},{terms:{...p.terms,fee_cents:101}},{expires_at:'2026-10-10T11:00:00Z'}]) {
    f.approvals.approval={...a,...patch};await assert.rejects(()=>C.authorize(f.scope,f.state,'approval',now));
  }
});
test('source correction invalidates earlier approval even if stored proposal hash matches',async()=>{
  const f=await fixture(),p=f.p.proposal;f.approvals.a={id:'a',owner_id:'owner',actor:'authenticated-owner',status:'approved',proposal_hash:p.hash,terms:p.terms,expires_at:p.expires_at};
  f.records.source.facts.fee_cents=999;f.records.source.payload_hash=await C.hash(f.records.source.facts);
  await assert.rejects(()=>C.authorize(f.scope,f.state,'a',now),/source_terms_changed/);
});
test('requested and accepted are distinct from effective cancellation and savings',async()=>{
  const f=await fixture();await f.add('request','cancellation_request',{response_deadline_on:'2026-10-11'});let s=await C.applyEvidence(f.scope,f.state,'request',now);
  assert.equal(s.contract_state,'active');assert.equal(C.summary(f.scope,s,now).verified_net_savings_cents,null);
  await f.add('accepted','cancellation_accepted',{effective_on:f.facts.effective_on,fee_cents:100,fee_incurred_cents:100,access_loss:f.facts.access_loss});s=await C.applyEvidence(f.scope,s,'accepted',now);
  assert.equal(s.contract_state,'termination_pending');assert.equal(C.summary(f.scope,s,now).verified_net_savings_cents,null);
});
test('changed vendor terms, wrong channel and effective-before-accepted cannot mark done',async()=>{
  const f=await fixture();await f.add('bad','cancellation_accepted',{effective_on:'2026-10-15',fee_cents:100,fee_incurred_cents:100,access_loss:f.facts.access_loss});
  await assert.rejects(()=>C.applyEvidence(f.scope,f.state,'bad',now),/terms_changed/);
  await f.add('effective','cancellation_effective',{effective_on:f.facts.effective_on,fee_cents:100,access_loss:f.facts.access_loss});await assert.rejects(()=>C.applyEvidence(f.scope,f.state,'effective','2026-10-12T12:00:00Z'),/accepted_effective/);
  f.records.effective.provider_key='different-channel';await assert.rejects(()=>C.applyEvidence(f.scope,f.state,'effective','2026-10-12T12:00:00Z'),/correct_cancellation_channel/);
});
test('issuer block remains independent of a live subscription and creates no projected savings',async()=>{
  const f=await fixture();await f.add('block','issuer_block',{issuer_provider_key:'issuer',active:true},{provider_key:'issuer'});const s=await C.applyEvidence(f.scope,f.state,'block',now);
  assert.equal(s.block_state,'active');assert.equal(s.contract_state,'active');
  const block=await C.prepare(f.scope,'source','block_charges',now);assert.equal(C.summary(f.scope,C.create(block.proposal),now).projected_annual_net_savings_cents,null);
});
test('verified next billing requires complete owned coverage and is net of fees and debt',async()=>{
  const f=await fixture(),s=await cancelled(f);await f.add('window','billing_window',{billing_account_id:'bank-account',coverage_complete:true,pending_unresolved:false,cycle_index:0,billing_on:'2026-10-12',covered_through:'2026-10-13',charged_cents:0,charges:[]});
  for(const patch of [{coverage_complete:false},{pending_unresolved:true},{currency:'EUR'},{billing_account_id:'other-account'},{billing_on:'2026-10-14'}]) {
    const saved={...f.records.window.facts};Object.assign(f.records.window.facts,patch);f.records.window.payload_hash=await C.hash(f.records.window.facts);
    await assert.rejects(()=>C.applyEvidence(f.scope,s,'window','2026-10-14T12:00:00Z'));f.records.window.facts=saved;
  }
  f.records.window.payload_hash=await C.hash(f.records.window.facts);const result=await C.applyEvidence(f.scope,s,'window','2026-10-14T12:00:00Z'),summary=C.summary(f.scope,result,'2026-10-14T12:00:00Z');
  assert.equal(summary.verified_avoided_charges_cents,1500);assert.equal(summary.verified_net_savings_cents,1200);assert.equal(summary.projected_annual_net_savings_cents,17700);
  assert.deepEqual(await C.applyEvidence(f.scope,result,'window','2026-10-14T12:00:00Z'),result);
});
test('continued charge reopens case; linked partial refunds never inflate recurring savings',async()=>{
  const f=await fixture(),s=await cancelled(f);await f.add('charged','billing_window',{billing_account_id:'bank-account',coverage_complete:true,pending_unresolved:false,cycle_index:0,billing_on:'2026-10-12',covered_through:'2026-10-13',charged_cents:1500,charges:[{transaction_id:'charge',amount_cents:1500}]});
  let result=await C.applyEvidence(f.scope,s,'charged','2026-10-14T12:00:00Z');assert.equal(result.contract_state,'continued_charge');assert.equal(result.monitoring_state,'reopened');
  for(const [id,amount] of [['refund1',500],['refund2',1000]]) {await f.add(id,'refund_received',{billing_account_id:'bank-account',transaction_id:id,original_charge_id:'charge',status:'posted',amount_cents:amount});result=await C.applyEvidence(f.scope,result,id,'2026-10-14T12:00:00Z');}
  assert.equal(C.summary(f.scope,result,'2026-10-14T12:00:00Z').refund_cash_received_cents,1500);assert.equal(C.summary(f.scope,result,'2026-10-14T12:00:00Z').verified_avoided_charges_cents,0);
  await f.add('over','refund_received',{billing_account_id:'bank-account',transaction_id:'over',original_charge_id:'charge',status:'posted',amount_cents:1});await assert.rejects(()=>C.applyEvidence(f.scope,result,'over','2026-10-14T12:00:00Z'),/refund_exceeds/);
  await f.add('same-refund','refund_received',f.records.refund1.facts);result=await C.applyEvidence(f.scope,result,'same-refund','2026-10-14T12:00:00Z');assert.equal(C.summary(f.scope,result,'2026-10-14T12:00:00Z').refund_cash_received_cents,1500);
});
test('late request events cannot downgrade effective cancellation; disconnect stays visible',async()=>{
  const f=await fixture();let s=await cancelled(f);await f.add('late','cancellation_request',{response_deadline_on:'2026-10-11'});s=await C.applyEvidence(f.scope,s,'late','2026-10-14T12:00:00Z');assert.equal(s.contract_state,'terminated');assert.equal(s.request_state,'accepted');
  await f.add('gap','monitoring_gap',{reason:'disconnected'});s=await C.applyEvidence(f.scope,s,'gap','2026-10-14T12:00:00Z');const summary=C.summary(f.scope,s,'2026-10-14T12:00:00Z');assert.equal(summary.monitoring_state,'unmonitorable');assert.equal(summary.overdue,true);
});
test('month-end recurrence and leap years stay anchored without drifting',()=>{
  assert.equal(C.cycleDate('2024-01-31',1,1),'2024-02-29');assert.equal(C.cycleDate('2024-01-31',1,2),'2024-03-31');assert.equal(C.cycleDate('2024-02-29',12,1),'2025-02-28');
});
test('safe integer boundary never silently rounds an annual projection',async()=>{
  const f=await fixture({renewal_amount_cents:Number.MAX_SAFE_INTEGER});assert.throws(()=>C.summary(f.scope,f.state,now),/money_overflow/);
});
test('replayed evidence cannot change kind or source while retaining its payload hash',async()=>{
  const f=await fixture();await f.add('block','issuer_block',{issuer_provider_key:'issuer',active:true},{provider_key:'issuer'});const s=await C.applyEvidence(f.scope,f.state,'block',now);
  f.records.block.kind='cancellation_accepted';await assert.rejects(()=>C.applyEvidence(f.scope,s,'block',now),/event_replay_conflict/);
});
