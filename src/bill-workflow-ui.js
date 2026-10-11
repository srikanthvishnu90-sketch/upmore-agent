// Inject inside the existing application scope after session is declared.
let billGeneration = 0, billRows = [], billOffset = null, billCandidate = null, billEditing = null;
const billController = UpmoreBillWorkflow({
  identity: () => session ? {owner:session.user.id,token:session.access_token} : null,
  uuid: () => crypto.randomUUID(),
  request: async (body,token) => {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(),20000);
    try {
      const response = await fetch(UPMORE_BACKEND_URL + '/functions/v1/agent-workflows',{method:'POST',signal:abort.signal,
        headers:{'Content-Type':'application/json',apikey:UPMORE_ANON_KEY,Authorization:'Bearer '+token},body:JSON.stringify(body)});
      const result = await response.json();
      if (!response.ok || result.ok === false) throw Error(result.error || 'Bills are unavailable. Try again.');
      return result;
    } finally { clearTimeout(timeout); }
  }
});
function billMessage(message,error=false) {
  const node = document.getElementById('billStatus'); node.textContent = message; node.setAttribute('role',error ? 'alert':'status');
}
function billMoney(cents,currency='USD') {
  if (currency !== 'USD') return currency + ' amount; USD entry is supported here';
  if (!Number.isSafeInteger(cents) || cents < 0) return 'Amount unknown';
  const value = BigInt(cents); return '$' + (value / 100n).toLocaleString('en-US') + '.' + String(value % 100n).padStart(2,'0');
}
function billClearForm() {
  billCandidate = null; billEditing = null;
  for (const id of ['billCreditor','billAmount','billDue','billKind']) document.getElementById(id).value = '';
  document.getElementById('billAutopay').value = 'unknown';
  document.getElementById('billConfirmed').checked = false;
  document.getElementById('billSave').textContent = 'Save current bill';
  document.getElementById('billEditorTitle').textContent = 'Add a current bill';
  document.getElementById('billDismiss').hidden = true;
}
function billReset() {
  billGeneration++; billController.invalidate(); billRows = []; billOffset = null;
  document.getElementById('billRows').replaceChildren(); document.getElementById('billAssessment').replaceChildren();
  document.getElementById('billStatus').textContent = ''; document.getElementById('billMore').hidden = true; billClearForm();
}
function billSelectCandidate(row) {
  billGeneration++; document.getElementById('billAssessment').replaceChildren(); billClearForm(); billCandidate = row;
  document.getElementById('billCreditor').value = row.creditor || '';
  document.getElementById('billAmount').value = Number.isSafeInteger(row.amount_due_cents) ? String(BigInt(row.amount_due_cents)/100n)+'.'+String(BigInt(row.amount_due_cents)%100n).padStart(2,'0') : '';
  document.getElementById('billDue').value = row.due_on || ''; document.getElementById('billKind').value = row.kind || 'other';
  document.getElementById('billAutopay').value = row.autopay || 'unknown';
  document.getElementById('billSave').textContent = 'Confirm current unpaid bill'; document.getElementById('billEditorTitle').textContent = 'Review possible bill';
  document.getElementById('billDismiss').hidden = false; document.getElementById('billCreditor').focus();
  billMessage('A recurring charge is a possible bill, not proof of an unpaid obligation. Check the current statement before confirming.');
}
function billSelectEdit(row) {
  billSelectCandidate(row); billCandidate=null; billEditing=row;
  document.getElementById('billSave').textContent='Save reviewed changes';
  document.getElementById('billEditorTitle').textContent='Edit current bill · version '+row.revision;
  document.getElementById('billDismiss').hidden=true;
  billMessage('Review the current unpaid amount and due date. Saving changes invalidates earlier proposals; it does not change a payment already submitted.');
}
function billDraw() {
  const host = document.getElementById('billRows'); host.replaceChildren();
  for (const row of billRows) {
    const item = document.createElement('article'); item.className = 'bill-row';
    const title = document.createElement('h3'); title.textContent = row.creditor || 'Biller not supplied';
    const details = document.createElement('p'); details.textContent = billMoney(row.amount_due_cents,row.currency) + ' · Due ' + (row.due_on || 'unknown') + ' · ' + String(row.status || 'unknown').replaceAll('_',' ');
    const provenance = document.createElement('p'); provenance.className = 'bill-note';
    provenance.textContent = 'Source: ' + (row.source_type === 'user' ? 'your assertion, not provider confirmation' : row.source_type || 'unknown') + ' · Observed ' + (row.observed_at || 'time unknown') + ' · Autopay ' + (row.autopay || 'unknown') + ' · Bill ID …' + row.id.slice(-6);
    const assess = document.createElement('button'); assess.type = 'button'; assess.className = 'btn'; assess.textContent = 'Check next step'; assess.onclick = () => billAssess(row);
    item.append(title,details,provenance,assess);
    if (row.status === 'asserted' && row.source_type === 'bank' && row.currency === 'USD' && row.direction === 'payable') {
      const review = document.createElement('button'); review.type = 'button'; review.className = 'btn'; review.textContent = 'Review possible bill'; review.onclick = () => billSelectCandidate(row); item.append(review);
    }
    if (row.source_type==='user' && row.currency==='USD' && row.direction==='payable' && ['asserted','verified','disputed','partially_paid'].includes(row.status) && Number.isSafeInteger(row.revision) && row.revision>0) {
      const edit=document.createElement('button'); edit.type='button'; edit.className='btn'; edit.textContent='Edit current bill'; edit.onclick=()=>billSelectEdit(row); item.append(edit);
    }
    host.append(item);
  }
}
async function billLoad(append=false) {
  const generation = ++billGeneration; document.getElementById('billAssessment').replaceChildren();
  if (!append) { billRows=[]; billDraw(); }
  document.getElementById('billMore').hidden = true; billMessage('Loading saved bills…');
  try {
    const page = await billController.read({action:'list',offset:append ? billOffset : 0});
    if (!page || generation !== billGeneration) return false;
    const rows = append ? billRows.concat(page.obligations) : page.obligations;
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Bill history changed. Reload the list.');
    billRows = rows; billOffset = page.next_offset; billDraw(); document.getElementById('billMore').hidden = billOffset === null;
    billMessage(rows.length ? 'Saved bills only. Missing billers and obligations may not be included. No payment has been submitted.' : 'No saved bills. Add a current statement below; an empty list does not mean nothing is owed.');
    return true;
  } catch (error) { if (generation === billGeneration) billMessage(error.message,true); return false; }
}
async function billAssess(row) {
  const generation = ++billGeneration, host = document.getElementById('billAssessment'); host.replaceChildren(); billMessage('Checking bill details and supported connections…');
  try {
    const result = await billController.read({action:'plan',obligation_id:row.id});
    if (!result || generation !== billGeneration) return;
    const assessment = result.assessment, title = document.createElement('h3'), detail = document.createElement('p'), gate = document.createElement('p');
    title.textContent = result.obligation.creditor + ': ' + String(assessment.state || 'unknown').replaceAll('_',' ');
    detail.textContent = assessment.message || 'No verified next step is available.';
    gate.textContent = assessment.state === 'awaiting_approval' ? 'Payment approval is unavailable here until the complete delivery terms and supported execution are verified. Nothing has been submitted.' : 'This check prepares a next step. It does not pay the bill or confirm that autopay completed.';
    host.append(title,detail,gate); billMessage('Bill assessment loaded.');
  } catch (error) { if (generation === billGeneration) billMessage(error.message,true); }
}
function renderBillWorkflows() {
  document.getElementById('billReload').onclick = () => billLoad(); document.getElementById('billMore').onclick = () => billLoad(true);
  document.getElementById('billNew').onclick = () => { billGeneration++; billClearForm(); document.getElementById('billCreditor').focus(); };
  document.getElementById('billEditor').onsubmit = async event => {
    event.preventDefault(); const generation = billGeneration, button = document.getElementById('billSave'); button.disabled=true;
    try {
      const input = {creditor:document.getElementById('billCreditor').value,amount:document.getElementById('billAmount').value,
        due_on:document.getElementById('billDue').value,kind:document.getElementById('billKind').value,autopay:document.getElementById('billAutopay').value,confirmed:document.getElementById('billConfirmed').checked};
      const wasEditing=!!billEditing;
      const result = billEditing ? await billController.edit(input,billEditing) : await billController.save(input,billCandidate);
      if (result && generation === billGeneration) {
        billClearForm(); const reload = billLoad(), reloadGeneration = billGeneration, loaded = await reload;
        if (reloadGeneration === billGeneration) billMessage((wasEditing?'Bill changes saved; earlier proposals invalidated. ':'Bill saved as your current unpaid-bill assertion. ')+'ID …' + result.obligation.id.slice(-6) + '. No payment was made.' + (loaded ? '' : ' The saved-bill list could not refresh. Reload bills to check the saved record.'),!loaded);
      }
    } catch (error) { if (generation === billGeneration) billMessage(error.message + ' If the response was lost, retry unchanged details to check the same entry.',true); }
    finally { button.disabled=false; }
  };
  document.getElementById('billDismiss').onclick = async () => {
    const generation=billGeneration, button=document.getElementById('billDismiss'); button.disabled=true;
    try { const result=await billController.dismiss(billCandidate); if(result && generation===billGeneration){billClearForm();const reload=billLoad(),reloadGeneration=billGeneration,loaded=await reload;if(reloadGeneration===billGeneration)billMessage('Possible bill dismissed (ID …'+result.obligation.id.slice(-6)+'). No debt or contract was cancelled.'+(loaded?'':' The list could not refresh. Reload bills to check its status.'),!loaded);} }
    catch(error){if(generation===billGeneration)billMessage(error.message,true);} finally{button.disabled=false;}
  };
  return billLoad();
}
