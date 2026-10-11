/* Native preparation and evidence tracking only. readEvidence/readApproval are
   server-owned protected stores, not callbacks supplied by a chat/client. */
const AgentSubscriptionCase = (() => {
  const text = x => typeof x === 'string' && x.length > 0 && x.length <= 500 && !/[\x00-\x1f]/.test(x);
  const cents = x => Number.isSafeInteger(x) && x >= 0;
  const canonical = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  const clone = value => JSON.parse(JSON.stringify(value));
  const date = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x;
  const timestamp = x => typeof x === 'string' && date(x.slice(0,10)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x));
  async function hash(value) {
    const result = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
    return Array.from(new Uint8Array(result),x=>x.toString(16).padStart(2,'0')).join('');
  }
  function check(ok,reason) {if (!ok) throw new Error(reason);}
  function owner(scope,state) {check(text(scope?.owner_id) && typeof scope.readEvidence === 'function','protected_scope_required');if(state)check(state.owner_id === scope.owner_id,'owner_mismatch');}
  async function evidence(scope,reference,now) {
    owner(scope);check(text(reference) && timestamp(now),'invalid_evidence_request');
    const e = await scope.readEvidence(reference);
    check(e?.id === reference && e.owner_id === scope.owner_id && e.authority === 'protected-provider' && text(e.provider_key) && text(e.external_reference),'unverified_evidence');
    check(timestamp(e.observed_at) && Date.parse(e.observed_at) <= Date.parse(now),'invalid_evidence_time');
    check(e.payload_hash === await hash(e.facts),'evidence_hash_mismatch');
    return clone(e);
  }
  function cycleDate(anchor,interval,index) {
    const d = new Date(anchor+'T00:00:00Z'),month=d.getUTCMonth()+interval*index;
    const result=new Date(Date.UTC(d.getUTCFullYear(),month,1));
    result.setUTCDate(Math.min(d.getUTCDate(),new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate()));
    return result.toISOString().slice(0,10);
  }
  async function prepare(scope,sourceRef,action,now) {
    const e=await evidence(scope,sourceRef,now),f=e.facts;
    check(e.kind === 'subscription_snapshot','subscription_snapshot_required');
    check(['cancel_contract','block_charges'].includes(action),'unsupported_action');
    const missing=[];
    for(const key of ['subscription_id','provider_account_id','merchant','plan','access_loss','refund_policy'])if(!text(f[key]))missing.push(key);
    if(!['vendor','app_store','play_store','marketplace','bundle'].includes(f.purchase_channel))missing.push('purchase_channel');
    for(const key of ['renewal_on','effective_on','review_deadline_on'])if(!date(f[key]))missing.push(key);
    for(const key of ['renewal_amount_cents','fee_cents','remaining_contract_cents'])if(!cents(f[key]))missing.push(key);
    if(f.currency !== 'USD')missing.push('supported_currency');
    if(![1,2,3,4,6,12].includes(f.interval_months))missing.push('interval_months');
    if(action === 'block_charges' && (!text(f.issuer_provider_key)||!text(f.block_scope)||!text(f.block_limitations)))missing.push('issuer_block_terms');
    if(Date.parse(now)-Date.parse(e.observed_at)>48*3600000)missing.push('fresh_source');
    if(date(f.review_deadline_on) && f.review_deadline_on < now.slice(0,10))missing.push('review_deadline_passed');
    if(missing.length)return {state:'needs_evidence',missing,proposal:null,execution:'disabled_no_adapter'};
    const terms={action,provider_key:e.provider_key,source_ref:e.id,source_hash:e.payload_hash,
      provider_account_id:f.provider_account_id,subscription_id:f.subscription_id,merchant:f.merchant,plan:f.plan,purchase_channel:f.purchase_channel,
      renewal_on:f.renewal_on,renewal_amount_cents:f.renewal_amount_cents,interval_months:f.interval_months,currency:f.currency,
      effective_on:f.effective_on,access_loss:f.access_loss,fee_cents:f.fee_cents,remaining_contract_cents:f.remaining_contract_cents,refund_policy:f.refund_policy,
      review_deadline_on:f.review_deadline_on,billing_account_id:f.billing_account_id || null,
      issuer_provider_key:f.issuer_provider_key || null,block_scope:action === 'block_charges'?f.block_scope:null,block_limitations:action === 'block_charges'?f.block_limitations:null};
    const proposal={owner_id:scope.owner_id,terms,expires_at:new Date(Math.min(Date.parse(now)+900000,Date.parse(f.review_deadline_on+'T23:59:59Z'))).toISOString()};
    proposal.hash=await hash(proposal);
    return {state:'ready_for_review',proposal,execution:'disabled_no_adapter'};
  }
  function create(proposal) {
    check(proposal?.terms && text(proposal.hash),'proposal_required');
    return {owner_id:proposal.owner_id,proposal:clone(proposal),contract_state:'active',block_state:'unknown',request_state:'not_requested',approval_ref:null,
      events:{},receipts:[],billing_windows:{},charges:{},refunds:{},fee_incurred_cents:0,monitoring_state:'not_started',deadline_on:null};
  }
  async function authorize(scope,state,approvalRef,now) {
    owner(scope,state);check(typeof scope.readApproval === 'function','protected_approval_store_required');
    const a=await scope.readApproval(approvalRef),p=state.proposal;
    check(a?.id === approvalRef && a.owner_id === scope.owner_id && a.actor === 'authenticated-owner' && a.status === 'approved' && a.proposal_hash === p.hash && canonical(a.terms)===canonical(p.terms),'approval_mismatch');
    check(timestamp(now) && timestamp(a.expires_at) && Date.parse(now)<Date.parse(a.expires_at) && Date.parse(now)<Date.parse(p.expires_at),'approval_expired');
    const copy=clone(p);delete copy.hash;check(await hash(copy)===p.hash,'proposal_changed');
    const fresh=await prepare(scope,p.terms.source_ref,p.terms.action,now);
    check(fresh.proposal && canonical(fresh.proposal.terms)===canonical(p.terms),'source_terms_changed');
    return {...clone(state),approval_ref:approvalRef,execution:'disabled_no_adapter'};
  }
  async function applyEvidence(scope,state,reference,now) {
    owner(scope,state);const e=await evidence(scope,reference,now),f=e.facts,t=state.proposal.terms;
    check(f.subscription_id===t.subscription_id && f.provider_account_id===t.provider_account_id,'subscription_identity_mismatch');
    check(f.currency===t.currency,'event_currency_mismatch');
    const fingerprint=await hash({kind:e.kind,provider_key:e.provider_key,external_reference:e.external_reference,payload_hash:e.payload_hash});
    if(state.events[e.id]){check(state.events[e.id]===fingerprint,'event_replay_conflict');return clone(state);}
    const s=clone(state);
    if(e.kind==='issuer_block') {
      check(e.provider_key===f.issuer_provider_key && f.issuer_provider_key===t.issuer_provider_key && text(f.issuer_provider_key) && typeof f.active==='boolean','issuer_evidence_required');
      s.block_state=f.active?'active':'inactive';
      // No contract status is changed by an issuer block.
    } else if(['cancellation_request','cancellation_accepted','cancellation_effective'].includes(e.kind)) {
      check(e.provider_key===t.provider_key && t.action==='cancel_contract','correct_cancellation_channel_required');
      if(e.kind==='cancellation_request') {
        check(date(f.response_deadline_on),'request_deadline_required');if(s.request_state==='not_requested'){s.request_state='requested';s.deadline_on=f.response_deadline_on;}
      } else {
        check(f.effective_on===t.effective_on && f.fee_cents===t.fee_cents && f.access_loss===t.access_loss,'cancellation_terms_changed');
        if(e.kind==='cancellation_accepted') {
          check(cents(f.fee_incurred_cents) && f.fee_incurred_cents===t.fee_cents,'actual_cancellation_fee_required');
          s.request_state='accepted';if(!['terminated','continued_charge'].includes(s.contract_state)){s.contract_state='termination_pending';s.deadline_on=f.effective_on;}s.fee_incurred_cents=f.fee_incurred_cents;
        } else {
          check(s.request_state==='accepted' && f.effective_on<=now.slice(0,10),'accepted_effective_cancellation_required');
          s.contract_state='terminated';s.monitoring_state='awaiting_next_billing';s.deadline_on=t.renewal_on;
        }
      }
      s.receipts.push({evidence_id:e.id,external_reference:e.external_reference,kind:e.kind});
    } else if(e.kind==='billing_window') {
      check(s.contract_state==='terminated' || s.contract_state==='continued_charge','verified_termination_required');
      check(text(t.billing_account_id) && f.billing_account_id===t.billing_account_id && f.coverage_complete===true && f.pending_unresolved===false,'complete_billing_coverage_required');
      check(Number.isSafeInteger(f.cycle_index) && f.cycle_index>=0 && f.cycle_index<=120,'invalid_cycle');
      const billing=cycleDate(t.renewal_on,t.interval_months,f.cycle_index),next=cycleDate(t.renewal_on,t.interval_months,f.cycle_index+1);
      check(f.billing_on===billing && date(f.covered_through) && f.covered_through>=billing && f.covered_through<next && f.covered_through<=now.slice(0,10) && billing>=t.effective_on,'billing_window_mismatch');
      check(cents(f.charged_cents) && Array.isArray(f.charges),'actual_billing_required');
      let total=0n;const seen=new Set();
      for(const charge of f.charges){check(text(charge.transaction_id) && cents(charge.amount_cents) && !seen.has(charge.transaction_id),'invalid_charge');seen.add(charge.transaction_id);total+=BigInt(charge.amount_cents);check(!s.charges[charge.transaction_id] || canonical(s.charges[charge.transaction_id])===canonical(charge),'charge_identity_conflict');s.charges[charge.transaction_id]=charge;}
      check(total===BigInt(f.charged_cents),'charge_total_mismatch');
      check(!s.billing_windows[billing],'billing_window_already_recorded');
      s.billing_windows[billing]={evidence_id:e.id,avoided_cents:f.charged_cents===0?t.renewal_amount_cents:0,charged_cents:f.charged_cents};
      s.contract_state=f.charged_cents>0?'continued_charge':s.contract_state;s.monitoring_state=f.charged_cents>0?'reopened':'monitoring';s.deadline_on=next;
    } else if(e.kind==='refund_received') {
      check(f.billing_account_id===t.billing_account_id && f.status==='posted' && text(f.transaction_id) && text(f.original_charge_id) && cents(f.amount_cents),'refund_identity_required');
      check(s.charges[f.original_charge_id],'original_charge_evidence_required');
      const refund={transaction_id:f.transaction_id,original_charge_id:f.original_charge_id,amount_cents:f.amount_cents};
      if(s.refunds[f.transaction_id])check(canonical(s.refunds[f.transaction_id])===canonical(refund),'refund_identity_conflict');
      else {const refunded=Object.values(s.refunds).filter(r=>r.original_charge_id===f.original_charge_id).reduce((sum,r)=>sum+BigInt(r.amount_cents),0n);check(refunded+BigInt(f.amount_cents)<=BigInt(s.charges[f.original_charge_id].amount_cents),'refund_exceeds_charge');s.refunds[f.transaction_id]=refund;}
    } else if(e.kind==='monitoring_gap') {
      check(['revoked','stale','disconnected','missing_coverage'].includes(f.reason),'monitoring_gap_reason_required');s.monitoring_state='unmonitorable';
    } else throw new Error('unsupported_evidence_kind');
    s.events[e.id]=fingerprint;return s;
  }
  function summary(scope,state,now) {
    owner(scope,state);check(timestamp(now),'invalid_time');const t=state.proposal.terms;
    const gross=Object.values(state.billing_windows).reduce((sum,w)=>sum+BigInt(w.avoided_cents),0n);
    const recovered=Object.values(state.refunds).reduce((sum,r)=>sum+BigInt(r.amount_cents),0n);
    const costs=BigInt(state.fee_incurred_cents)+BigInt(t.remaining_contract_cents);
    const projection=BigInt(t.renewal_amount_cents)*BigInt(12/t.interval_months)-BigInt(t.fee_cents)-BigInt(t.remaining_contract_cents);
    const safe=n=>{check(n<=BigInt(Number.MAX_SAFE_INTEGER) && n>=BigInt(Number.MIN_SAFE_INTEGER),'money_overflow');return Number(n);};
    return {contract_state:state.contract_state,block_state:state.block_state,request_state:state.request_state,monitoring_state:state.monitoring_state,
      verified_avoided_charges_cents:safe(gross),verified_net_savings_cents:Object.keys(state.billing_windows).length?safe(gross-costs):null,
      actual_fees_cents:state.fee_incurred_cents,remaining_contract_cents:t.remaining_contract_cents,refund_cash_received_cents:safe(recovered),projected_annual_net_savings_cents:t.action==='cancel_contract'?safe(projection):null,
      overdue:date(state.deadline_on) && state.deadline_on<now.slice(0,10),execution:'disabled_no_adapter',
      caveat:'Refund receipts are separate from recurring savings. Projection is not recovered cash; a block does not terminate a contract.'};
  }
  return {canonical,hash,prepare,create,authorize,applyEvidence,summary,cycleDate};
})();
if(typeof module!=='undefined' && module.exports)module.exports=AgentSubscriptionCase;
