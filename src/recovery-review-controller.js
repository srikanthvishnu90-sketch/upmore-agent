/* Private, memory-only recovery research. No authority to send or certify refunds. */
globalThis.UpmoreRecoveryReview = function ({identity,request,uuid}) {
  let epoch=0,pending=new Map(),writing=null;
  const date=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const money=value=>Number.isSafeInteger(value);
  const text=value=>typeof value==='string' && value.length>0;
  function evidence(row,account) {
    if(!row || !text(row.account_id) || !text(row.transaction_id) || !money(row.amount_cents) || !date(row.posted_on) || typeof row.label!=='string' || (row.fact_hash!==null && !text(row.fact_hash)) || (account && row.account_id!==account))throw Error('Recovery evidence is incomplete or belongs to a different account. Reload the scan.');
  }
  function validate(result,offset,account,owner) {
    const r=result?.report;
    if(result?.ok!==true || !r || r.owner_id!==owner || r.currency!=='USD' || !date(r.today) || r.coverage_complete!==false || r.verified_recovered_cents!==0 || r.recovery_verification!=='unavailable_without_trusted_refund_linkage' || !Array.isArray(r.candidates) || r.candidates.length>20 || !Number.isSafeInteger(r.total_candidates) || r.total_candidates<offset+r.candidates.length || !(r.next_offset===null || Number.isSafeInteger(r.next_offset)&&r.next_offset>offset&&r.next_offset<=r.total_candidates) || !r.excluded || !Number.isSafeInteger(r.excluded.unsupported_currency) || r.excluded.unsupported_currency<0 || !Number.isSafeInteger(r.excluded.unavailable) || r.excluded.unavailable<0 || !/^([a-f0-9]{64})$/.test(r.reference_hash || '') || !r.source || r.source.type!=='retained_bank_records' || r.source.reference_hash!==r.reference_hash || r.source.observations_are_not_complete_history!==true || !Array.isArray(r.source.accounts) || !Number.isFinite(Date.parse(r.as_of)))throw Error('Recovery report is incomplete or claims an unsupported outcome. Reload the scan.');
    if(r.account_id!==undefined && r.account_id!==null && r.account_id!==account)throw Error('Recovery account scope does not match.');
    const accounts=new Set();for(const row of r.source.accounts){if(!row || !text(row.account_id) || accounts.has(row.account_id) || (account && row.account_id!==account))throw Error('Recovery source accounts are invalid.');accounts.add(row.account_id);}
    const seen=new Set();
    for(const c of r.candidates) {
      if(!c || !text(c.id) || seen.has(c.id) || !['bank_fee','duplicate_charge','stale_hold'].includes(c.kind) || c.status!=='open' || !money(c.amount_cents) || c.amount_cents<=0 || c.remaining_cents!==c.amount_cents || c.recovered_cents!==null || c.reversal!==null || !Array.isArray(c.evidence) || !c.evidence.length || !['not_found','unverified'].includes(c.refund_linkage_status))throw Error('Recovery candidate is incomplete or claims a verified recovery. Reload the scan.');
      seen.add(c.id);for(const row of c.evidence){evidence(row,account);if(!accounts.has(row.account_id))throw Error('Recovery evidence account is not in the report.');}
      if(c.possible_refund){if(c.refund_linkage_status!=='unverified')throw Error('A credit lead must remain unverified.');evidence(c.possible_refund,account);if(!accounts.has(c.possible_refund.account_id))throw Error('Credit lead account is not in the report.');if(c.possible_refund.amount_cents<=0)throw Error('Invalid credit lead.');}
      else if(c.refund_linkage_status!=='not_found')throw Error('Unverified credit lead is missing.');
      if(c.action!==null && (c.action?.type!=='draft_request' || c.action.sent_by!=='user' || c.action.executes!==false || c.action.requires_user_approval!==true || !text(c.action.text)))throw Error('Recovery scan may only prepare a request you review and send.');
    }
    return r;
  }
  async function scan({offset=0,account_id=null,reference_hash=null}={}) {
    const user=identity();if(!user?.owner || !user?.token)throw Error('Sign in to review your recovery candidates.');
    if(!Number.isSafeInteger(offset)||offset<0 || (account_id!==null && (!text(account_id)||account_id.length>200||account_id!==account_id.trim()||/[\x00-\x1f\x7f]/.test(account_id))))throw Error('Choose a valid recovery account and page.');
    if((offset>0 && reference_hash===null) || (reference_hash!==null && !/^[a-f0-9]{64}$/.test(reference_hash)))throw Error('Reload the recovery scan before requesting another page.');
    const at=epoch,owner=user.owner,body={action:'recovery_scan',offset};if(reference_hash!==null)body.reference_hash=reference_hash;if(account_id!==null)body.account_id=account_id;
    const result=await request(body,user.token);
    if(at!==epoch || identity()?.owner!==owner)return null;
    const report=validate(result,offset,account_id,owner);if(reference_hash!==null && report.reference_hash!==reference_hash)throw Error('Bank facts changed between pages. Reload the scan.');return report;
  }
  const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const kinds=['bank_fee','duplicate_charge','stale_hold'],statuses=['open','user_reported_submitted','closed_user'];
  function scope(){const user=identity();if(!user?.owner || !user?.token)throw Error('Sign in to review your recovery cases.');const at=epoch;return {user,current:()=>epoch===at && identity()?.owner===user.owner};}
  function caseProof(row,owner){
    if(!row || row.user_id!==owner || !uuidPattern.test(row.id || '') || !kinds.includes(row.kind) || !Number.isSafeInteger(row.version) || row.version<1 || !statuses.includes(row.status) || !Number.isSafeInteger(row.amount_cents) || row.amount_cents<=0 || row.currency!=='USD' || row.recovered_cents!==null || row.recovery_verification!=='unavailable_user_report_only' || (row.due_on!==null && !date(row.due_on)) || !Array.isArray(row.source_snapshot) || !row.source_snapshot.length || row.source_snapshot.length>20 || typeof row.source_stale!=='boolean')throw Error('Recovery case proof is incomplete or belongs to another owner. Reload cases.');
    for(const fact of row.source_snapshot){if(fact.user_id!==owner || !text(fact.account_id) || !text(fact.provider_transaction_id) || !text(fact.fact_hash) || fact.currency!=='USD' || !money(fact.amount_cents) || !date(fact.posted_on) || typeof fact.is_pending!=='boolean' || fact.presence!=='observed')throw Error('Recovery case source evidence is invalid.');}
    return row;
  }
  async function cases(offset=0){
    const s=scope();if(!Number.isSafeInteger(offset)||offset<0)throw Error('Choose a valid case page.');
    const result=await request({action:'recovery_case_list',offset},s.user.token);if(!s.current())return null;
    if(result?.ok!==true || result.owner_id!==s.user.owner || result.recovery_verification!=='unavailable_user_report_only' || result.verified_recovered_cents!==null || !Array.isArray(result.cases) || result.cases.length>20 || !(result.next_offset===null || Number.isSafeInteger(result.next_offset)&&result.next_offset>offset))throw Error('Recovery case history is unavailable. Reload cases.');
    const ids=new Set();for(const row of result.cases){caseProof(row,s.user.owner);if(ids.has(row.id))throw Error('Duplicate recovery cases. Reload cases.');ids.add(row.id);}return result;
  }
  async function write(body,verify){
    const s=scope();if(writing)throw Error('A recovery case change is already being saved.');
    const signature=JSON.stringify([s.user.owner,body]);let id=pending.get(signature);if(!id){id=uuid();if(!uuidPattern.test(id))throw Error('A secure request ID is unavailable.');pending.set(signature,id);}
    const lock={};writing=lock;
    try{const result=await request({...body,request_id:id},s.user.token);if(!s.current())return null;if(result?.ok!==true)throw Error('Case change was not confirmed. Retry unchanged details.');if(result.superseded===true)throw Error('This saved request has been superseded by a later case version. Reload cases.');const row=caseProof(result.case,s.user.owner);verify(row);pending.delete(signature);return row;}
    finally{if(writing===lock)writing=null;}
  }
  function openCase(candidate,confirmed=false,due_on=null){
    if(confirmed!==true)throw Error('Confirm that this saves preparation only; no request is sent.');
    if(!candidate || !kinds.includes(candidate.kind) || candidate.status!=='open' || !Number.isSafeInteger(candidate.amount_cents) || candidate.amount_cents<=0 || !Array.isArray(candidate.evidence) || !candidate.evidence.length || candidate.evidence.length>20 || (due_on!==null && !date(due_on)))throw Error('Refresh the candidate evidence before saving a case.');
    const refs=candidate.evidence.map(row=>{if(!text(row.account_id)||!text(row.transaction_id)||!text(row.fact_hash))throw Error('Current bank fact references are required to save a case.');return {account_id:row.account_id,transaction_id:row.transaction_id,fact_hash:row.fact_hash};});
    const signature=rows=>JSON.stringify(rows.map(row=>[row.account_id,row.transaction_id,row.fact_hash]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    return write({action:'recovery_case_open',kind:candidate.kind,evidence:refs,due_on,confirmed:true},row=>{
      const snap=row.source_snapshot;
      if(row.kind!==candidate.kind || row.status!=='open' || row.amount_cents!==candidate.amount_cents || row.due_on!==due_on || signature(snap.map(fact=>({...fact,transaction_id:fact.provider_transaction_id})))!==signature(refs))throw Error('Saved case does not match the reviewed candidate. Reload cases before changing details.');
    });
  }
  function updateCase(row,status,confirmed=false){
    caseProof(row,identity()?.owner);if(!statuses.includes(status) || confirmed!==true)throw Error('Review and confirm the exact user-reported case status.');if(status===row.status)throw Error('Choose a changed user-reported status before saving.');if(row.source_stale && status!=='closed_user')throw Error('Source bank facts changed. Close this case or refresh and review a new candidate; no submission is reported.');
    return write({action:'recovery_case_update',case_id:row.id,expected_version:row.version,status,confirmed:true},saved=>{if(saved.id!==row.id || saved.kind!==row.kind || saved.amount_cents!==row.amount_cents || saved.due_on!==row.due_on || saved.status!==status || saved.version!==row.version+1)throw Error('Case changed or status was not confirmed. Reload cases.');});
  }
  return {scan,cases,openCase,updateCase,invalidate(){epoch++;pending=new Map();writing=null;}};
};
