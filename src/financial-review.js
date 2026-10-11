// Injected inside the existing application scope by build-app.py.
let ledgerViewGeneration = 0, ledgerRows = [], ledgerSelected = null, ledgerOffset = null;
let ledgerLinkGeneration = 0, ledgerLinks = [], ledgerLinkOffset = null;
const ledgerLinkedKinds = ['refund','internal_transfer','credit_payment'];
const ledgerController = UpmoreLedgerReview({
  identity: () => session ? {owner: session.user.id, token: session.access_token} : null,
  uuid: () => crypto.randomUUID(),
  request: async (body, token) => {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 20000);
    try {
    const response = await fetch(UPMORE_BACKEND_URL + '/functions/v1/agent-workflows', {
      method: 'POST', signal: abort.signal, headers: {'Content-Type': 'application/json', apikey: UPMORE_ANON_KEY, Authorization: 'Bearer ' + token}, body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.error || 'The ledger service is unavailable.');
    return result;
    } finally { clearTimeout(timeout); }
  }
});
function ledgerMessage(message, error = false) {
  const host = document.getElementById('ledgerStatus');
  host.textContent = message; host.setAttribute('role', error ? 'alert' : 'status');
}
function ledgerMoney(value) {
  if (!Number.isSafeInteger(value)) return 'Unknown';
  const n = BigInt(value), abs = n < 0n ? -n : n;
  return (n < 0n ? '−' : '') + '$' + (abs / 100n).toLocaleString('en-US') + '.' + String(abs % 100n).padStart(2, '0');
}
function ledgerReset() {
  ledgerViewGeneration++; ledgerController.invalidate(); ledgerRows = []; ledgerSelected = null; ledgerOffset = null;
  document.getElementById('ledgerRows').replaceChildren();
  document.getElementById('ledgerEditor').hidden = true;
  document.getElementById('ledgerMore').hidden = true;
  document.getElementById('ledgerTotals').textContent = '';
  document.getElementById('ledgerStatus').textContent = '';
  document.getElementById('ledgerChosen').textContent = '';
  document.getElementById('ledgerKind').value = '';
  document.getElementById('ledgerCategory').value = '';
  ledgerClearLinks();
}
function ledgerClearLinks() {
  ledgerLinkGeneration++; ledgerLinks = []; ledgerLinkOffset = null;
  document.getElementById('ledgerLink').replaceChildren();
  document.getElementById('ledgerLink').required = false;
  document.getElementById('ledgerLinkLabel').hidden = true;
  document.getElementById('ledgerLinkMore').hidden = true;
  document.getElementById('ledgerLinkNote').textContent = '';
  document.getElementById('ledgerLinkNote').setAttribute('role','status');
  document.getElementById('ledgerCategory').disabled = false;
  document.getElementById('ledgerSave').textContent = 'Save my classification';
}
function ledgerRecordLabel(row) {
  return [row.merchant_raw || 'Merchant not supplied',row.posted_on,ledgerMoney(row.amount_cents),row.institution,
    row.account_name || 'Account name unavailable','ID …' + row.account_id.slice(-6)].filter(Boolean).join(' · ');
}
async function ledgerLoadLinks(append = false) {
  const generation = ++ledgerLinkGeneration, row = ledgerSelected, kind = document.getElementById('ledgerKind').value;
  if (!row || !ledgerLinkedKinds.includes(kind)) return;
  const select = document.getElementById('ledgerLink'), oldChoice = append ? select.value : '';
  document.getElementById('ledgerLinkMore').hidden = true;
  document.getElementById('ledgerLinkNote').textContent = 'Loading possible linked records…';
  try {
    const page = await ledgerController.read({action:'ledger_link_candidates',offset:append ? ledgerLinkOffset : 0,
      review:{account_id:row.account_id,transaction_id:row.provider_transaction_id,fact_hash:row.fact_hash,kind}});
    if (!page || generation !== ledgerLinkGeneration || ledgerSelected !== row || document.getElementById('ledgerKind').value !== kind) return;
    const next = append ? ledgerLinks.concat(page.rows) : page.rows;
    if (new Set(next.map(r => JSON.stringify([r.account_id,r.provider_transaction_id]))).size !== next.length) throw new Error('Linked history changed. Reload possible matches.');
    ledgerLinks = next; ledgerLinkOffset = page.next_offset;
    select.replaceChildren();
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a record you recognize'; select.append(placeholder);
    ledgerLinks.forEach((record,index) => {
      const option = document.createElement('option'); option.value = String(index);
      option.textContent = ledgerRecordLabel(record) + (kind === 'refund' ? ' · Category ' + (record.latest_review?.category || 'Uncategorized') + ' · Remaining refundable ' + ledgerMoney(record.remaining_refundable_cents) :
        record.latest_review ? ' · Existing classification: ' + record.latest_review.kind.replaceAll('_',' ') : ' · Not yet classified');
      select.append(option);
    });
    select.value = oldChoice;
    document.getElementById('ledgerLinkMore').hidden = ledgerLinkOffset === null;
    document.getElementById('ledgerLinkNote').textContent = (ledgerLinks.length ? page.coverage : 'No eligible record in retained history. Review the original expense or sync missing accounts first.') +
      (kind === 'refund' ? ' A refund inherits the original expense category.' : ' Saving classifies both selected records together. This does not move money.');
  } catch (error) {
    if (generation === ledgerLinkGeneration && ledgerSelected === row) {
      document.getElementById('ledgerLinkNote').textContent = error.message;
      document.getElementById('ledgerLinkNote').setAttribute('role','alert');
    }
  }
}
function ledgerKindChanged() {
  ledgerClearLinks();
  const kind = document.getElementById('ledgerKind').value;
  if (!ledgerLinkedKinds.includes(kind)) return;
  document.getElementById('ledgerCategory').value = '';
  document.getElementById('ledgerCategory').disabled = true;
  document.getElementById('ledgerLinkLabel').hidden = false;
  document.getElementById('ledgerLink').required = true;
  document.getElementById('ledgerSave').textContent = kind === 'refund' ? 'Save linked refund' : 'Classify both records';
  return ledgerLoadLinks();
}
function ledgerDrawRows() {
  const list = document.getElementById('ledgerRows'); list.replaceChildren();
  for (const row of ledgerRows) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'ledger-row';
    const title = document.createElement('strong'); title.textContent = row.merchant_raw || 'Merchant not supplied';
    const details = document.createElement('span');
    const accountLabel = [row.institution, row.account_name || 'Account name unavailable', 'ID …' + row.account_id.slice(-6)].filter(Boolean).join(' · ');
    details.textContent = 'Posted ' + row.posted_on + ' · ' + (row.currency === 'USD' ? ledgerMoney(row.amount_cents) : 'Unsupported currency: ' + row.currency) + ' · ' + accountLabel + ' · Bank fetched ' + (row.fetched_at || 'time unknown');
    button.append(title, details);
    button.onclick = () => {
      ledgerViewGeneration++;
      ledgerSelected = row;
      document.getElementById('ledgerChosen').textContent = title.textContent + ' · ' + details.textContent;
      const prior = row.latest_review, current = prior && prior.fact_hash === row.fact_hash;
      document.getElementById('ledgerKind').value = current ? prior.kind : '';
      document.getElementById('ledgerCategory').value = current ? prior.category || '' : '';
      if (prior) document.getElementById('ledgerChosen').textContent += current ? ' · Current classification: ' + prior.kind.replaceAll('_',' ') : ' · Previous classification is stale; review the changed bank facts.';
      document.getElementById('ledgerEditor').hidden = false;
      ledgerKindChanged();
      document.getElementById('ledgerKind').focus();
    };
    list.append(button);
  }
}
async function ledgerLoad(append = false) {
  const generation = ++ledgerViewGeneration;
  ledgerController.invalidate(false); ledgerSelected = null; document.getElementById('ledgerEditor').hidden = true;
  ledgerClearLinks();
  const from = document.getElementById('ledgerFrom').value, to = document.getElementById('ledgerTo').value;
  if (!append) { ledgerRows = []; ledgerDrawRows(); document.getElementById('ledgerTotals').textContent = ''; }
  document.getElementById('ledgerMore').hidden = true;
  ledgerMessage('Loading retained bank activity…');
  try {
    const [page, totals] = await Promise.all([
      ledgerController.read({action: 'ledger_page', from, to, offset: append ? ledgerOffset : 0}),
      ledgerController.read({action: 'ledger_report', from, to})
    ]);
    if (generation !== ledgerViewGeneration || !page || !totals) return;
    ledgerRows = append ? ledgerRows.concat(page.rows) : page.rows;
    ledgerOffset = page.next_offset; ledgerDrawRows();
    document.getElementById('ledgerMore').hidden = ledgerOffset === null;
    const report = totals.report;
    document.getElementById('ledgerTotals').textContent = 'Reviewed income: ' + ledgerMoney(report.income_cents) + ' · Reviewed net spending: ' + ledgerMoney(report.spending_cents) + '. Unclassified records: ' + report.unclassified_records + '. Stale reviews: ' + report.invalidated_reviews + '. Unknown means the reviewed history is incomplete, not zero. Categories are user assertions.';
    ledgerMessage(page.rows.length ? page.coverage : 'No posted records in this range. This does not prove there was no spending. Refresh connected bank data or choose another range.');
    return true;
  } catch (error) { if (generation === ledgerViewGeneration) ledgerMessage(error.message, true); }
}
function renderFinancialReview() {
  const today = new Date(), localDate = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const from = document.getElementById('ledgerFrom'), to = document.getElementById('ledgerTo');
  if (!from.value) { from.value = localDate(new Date(today.getFullYear(), today.getMonth(), 1)); to.value = localDate(today); }
  document.getElementById('ledgerRange').onsubmit = e => { e.preventDefault(); ledgerLoad(); };
  document.getElementById('ledgerMore').onclick = () => ledgerLoad(true);
  document.getElementById('ledgerKind').onchange = ledgerKindChanged;
  document.getElementById('ledgerLinkMore').onclick = () => ledgerLoadLinks(true);
  document.getElementById('ledgerSync').onclick = async () => {
    const generation = ledgerViewGeneration;
    ledgerMessage('Refreshing the connected bank. No money will move.');
    try { const result = await ledgerController.read({action:'sync_finances'}); if (result && generation === ledgerViewGeneration) await ledgerLoad(); }
    catch (error) { if (generation === ledgerViewGeneration) ledgerMessage(error.message, true); }
  };
  document.getElementById('ledgerEditor').onsubmit = async e => {
    e.preventDefault(); if (!ledgerSelected) return;
    const button = document.getElementById('ledgerSave'), generation = ledgerViewGeneration;
    button.disabled = true; ledgerMessage('Saving your classification…');
    try {
      const kind = document.getElementById('ledgerKind').value, choice = document.getElementById('ledgerLink').value;
      const linked = ledgerLinkedKinds.includes(kind) && /^(0|[1-9]\d*)$/.test(choice) ? ledgerLinks[Number(choice)] : null;
      const result = await ledgerController.save(ledgerSelected, kind, document.getElementById('ledgerCategory').value, linked);
      if (result && generation === ledgerViewGeneration) {
        if (await ledgerLoad()) ledgerMessage('Classification saved. Bank facts were preserved. Posted records from retained connected history only; missing accounts and pending activity are not included.');
      }
    } catch (error) {
      if (generation === ledgerViewGeneration) ledgerMessage(error.message + ' If the response was lost, retry the same classification to check the existing request.', true);
    } finally { button.disabled = false; }
  };
  ledgerLoad();
}
