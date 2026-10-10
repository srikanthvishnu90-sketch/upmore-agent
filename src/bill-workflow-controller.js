/* Owner-scoped memory only. This controller prepares bills; it never pays. */
globalThis.UpmoreBillWorkflow = function ({identity, request, uuid}) {
  let epoch = 0, pending = null, writing = false;
  const kinds = ['rent','utility','installment','credit','tax','medical','invoice','insurance','informal','other'];
  function scope() {
    const user = identity();
    if (!user?.owner || !user?.token) throw Error('Sign in to see your bills.');
    const generation = epoch;
    return {user, current: () => generation === epoch && identity()?.owner === user.owner};
  }
  function owned(result, owner) {
    if (!result || typeof result !== 'object' || Array.isArray(result) || result.ok !== true) throw Error('The bill service did not confirm this request. Retry unchanged details.');
    if (result.obligations !== undefined && !Array.isArray(result.obligations)) throw Error('Bill list response is incomplete. Reload the list.');
    if (result.obligations?.some(row => !row || typeof row !== 'object' || row.user_id !== owner) || result.obligation && result.obligation.user_id !== owner || result.task?.user_id && result.task.user_id !== owner) throw Error('Bill ownership mismatch.');
    return result;
  }
  async function read(body) {
    if (!['list','plan'].includes(body.action)) throw Error('Unsupported bill review.');
    const s = scope(), result = await request(body, s.user.token);
    if (!s.current()) return null;
    owned(result,s.user.owner);
    if (body.action === 'list' && (!Array.isArray(result.obligations) || result.obligations.some(row => typeof row.id !== 'string') || result.next_offset !== null && (!Number.isSafeInteger(result.next_offset) || result.next_offset <= (body.offset || 0)))) throw Error('Bill list response is incomplete. Reload the list.');
    if (body.action === 'plan' && (result.obligation?.id !== body.obligation_id || !result.assessment || result.assessment.obligation_id && result.assessment.obligation_id !== body.obligation_id)) throw Error('The assessment does not match this bill. Reload its details.');
    if (body.action === 'plan' && (!['blocked','needs_review','needs_information','needs_sync','monitoring','resolved','needs_connection','awaiting_approval'].includes(result.assessment.state) || typeof result.assessment.message !== 'string')) throw Error('The bill assessment is incomplete. Reload its details.');
    return result;
  }
  function facts(input) {
    const creditor = String(input.creditor || '').trim(), amount = String(input.amount || '').trim();
    if (!creditor || creditor.length > 160) throw Error('Enter the biller name, up to 160 characters.');
    if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount)) throw Error('Enter a USD amount with at most two decimal places.');
    const [whole, fraction = ''] = amount.split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2,'0'));
    if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('Enter a positive supported amount.');
    const due = String(input.due_on || ''), date = new Date(due + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== due) throw Error('Enter a valid due date.');
    if (!kinds.includes(input.kind)) throw Error('Choose the bill type.');
    if (!['on','off','unknown'].includes(input.autopay)) throw Error('Choose what you know about autopay.');
    if (input.confirmed !== true) throw Error('Confirm this is your current unpaid bill.');
    return {creditor,amount_due_cents:Number(cents),currency:'USD',due_on:due,kind:input.kind,autopay:input.autopay,direction:'payable'};
  }
  async function write(input, candidate = null, dismiss = false, editing = null) {
    if (writing) throw Error('A bill update is already in progress.');
    const s = scope();
    if (candidate && (candidate.user_id !== s.user.owner || !candidate.id)) throw Error('Choose your own bill.');
    if (candidate && (candidate.status !== 'asserted' || candidate.source_type !== 'bank')) throw Error('Only an unconfirmed bank candidate can be confirmed or dismissed here.');
    if (dismiss && !candidate) throw Error('Choose a possible bill first.');
    if (editing && (editing.user_id !== s.user.owner || !editing.id || editing.source_type !== 'user' || editing.currency !== 'USD' || editing.direction !== 'payable' || !['asserted','verified','disputed','partially_paid'].includes(editing.status) || !Number.isSafeInteger(editing.revision) || editing.revision < 1 || editing.revision >= 2147483647)) throw Error('Reload your current editable bill before changing it.');
    const obligation = dismiss ? null : facts(input);
    const signature = JSON.stringify({owner:s.user.owner,candidate:candidate?.id || null,editing:editing ? {id:editing.id,revision:editing.revision} : null,dismiss,obligation});
    if (!pending || pending.signature !== signature) pending = {signature,id:uuid()};
    const body = editing ? {action:'edit',obligation_id:editing.id,expected_revision:editing.revision,request_id:pending.id,confirmed:true,obligation} : dismiss ? {action:'dismiss_candidate',obligation_id:candidate.id} : candidate ?
      {action:'confirm_candidate',obligation_id:candidate.id,confirmed:true,obligation} :
      {action:'save',entry_id:pending.id,confirmed:true,obligation};
    writing = true;
    try {
      const result = await request(body,s.user.token);
      if (!s.current()) return null;
      owned(result,s.user.owner);
      const saved = result.obligation;
      if (!saved || typeof saved.id !== 'string' || !saved.id || saved.user_id !== s.user.owner || candidate && saved.id !== candidate.id || editing && saved.id !== editing.id) throw Error('The service did not return the matching saved bill. Retry unchanged details.');
      if (editing && result.superseded === true) { pending=null; throw Error('That earlier edit was saved, but this bill has since changed. Reload bills to review the current version.'); }
      if (editing && (result.superseded !== false || typeof result.replay !== 'boolean' || !Number.isSafeInteger(saved.revision) || saved.revision !== editing.revision+1 || result.current_revision !== saved.revision)) throw Error('The edit receipt does not confirm the current version. Reload bills.');
      if (dismiss) {
        if (saved.status !== 'invalid' || saved.source_type !== 'bank' || saved.evidence?.dismissed_by_user !== true) throw Error('The service did not confirm dismissal. Retry this possible bill.');
      } else {
        if (saved.status !== 'verified' || saved.source_type !== 'user' || Object.keys(obligation).some(key => saved[key] !== obligation[key]) || !candidate && !editing && saved.source_key !== 'user:' + pending.id) throw Error('Saved bill details differ from your review. Keep your details and reload before changing them.');
      }
      pending = null; return result;
    } finally { writing = false; }
  }
  return {read,save:(input,candidate) => write(input,candidate),edit:(input,row)=>write(input,null,false,row),dismiss:candidate => write(null,candidate,true), invalidate(){epoch++;pending=null;},facts};
};
