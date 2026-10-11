// Inject inside the application scope after session is declared.
let recoveryCaseGeneration=0,recoveryCases=[],recoveryCaseOffset=null;
let recoveryGeneration=0,recoveryRows=[],recoveryOffset=null,recoveryReport=null,recoveryAccount=null;
const recoveryController=UpmoreRecoveryReview({
 uuid:()=>crypto.randomUUID(),
 identity:()=>session?{owner:session.user.id,token:session.access_token}:null,
 request:async(body,token)=>{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
  try{const response=await fetch(UPMORE_BACKEND_URL+'/functions/v1/agent-workflows',{method:'POST',signal:abort.signal,headers:{'Content-Type':'application/json',apikey:UPMORE_ANON_KEY,Authorization:'Bearer '+token},body:JSON.stringify(body)});
   const result=await response.json();if(!response.ok || result.ok===false)throw Error(result.error || 'Recovery scan unavailable. Try again.');return result;
  }finally{clearTimeout(timer);}
 }
});
function recoveryMoney(cents){if(!Number.isSafeInteger(cents))return 'Amount unknown';const n=BigInt(cents),m=n<0n?-n:n;return (n<0n?'-$':'$')+(m/100n).toLocaleString('en-US')+'.'+String(m%100n).padStart(2,'0');}
function recoveryText(tag,text,className){const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;}
function recoveryMessage(message,error=false){const node=document.getElementById('recoveryStatus');node.textContent=message;node.setAttribute('role',error?'alert':'status');}
function recoveryReset(){recoveryCaseGeneration++;recoveryCases=[];recoveryCaseOffset=null;for(const id of ['recoveryCases','recoveryCaseStatus']){const node=document.getElementById(id);if(node){node.replaceChildren();node.textContent='';}}const more=document.getElementById('recoveryCaseMore');if(more)more.hidden=true;recoveryGeneration++;recoveryController.invalidate();recoveryRows=[];recoveryOffset=null;recoveryReport=null;recoveryAccount=null;for(const id of ['recoveryRows','recoveryCoverage'])document.getElementById(id).replaceChildren();document.getElementById('recoveryStatus').textContent='';document.getElementById('recoveryMore').hidden=true;const account=document.getElementById('recoveryAccount');if(account){const all=recoveryText('option','All retained accounts');all.value='';account.replaceChildren(all);account.value='';}}
function recoveryDraw(){
 const generation=recoveryGeneration,owner=session?.user?.id;const host=document.getElementById('recoveryRows');host.replaceChildren();
 recoveryRows.forEach((row,index)=>{
  const item=document.createElement('article');item.className='bill-row';
  const title=row.kind==='bank_fee'?'Possible fee refund':row.kind==='duplicate_charge'?'Possible duplicate charge':'Pending authorization hold';
  item.append(recoveryText('h3',title),recoveryText('p',recoveryMoney(row.amount_cents)+(row.kind==='stale_hold'?' held; releasing a hold is not recovered money.':' candidate amount; not confirmed money owed or recovered.')),
   recoveryText('p',row.caveat || 'A fee label does not prove an error or entitlement to a refund. Review the bank terms and charge.','bill-note'));
  if(row.possible_refund)item.append(recoveryText('p','A possibly related credit of '+recoveryMoney(row.possible_refund.amount_cents)+' appears on '+row.possible_refund.posted_on+'. Linkage is unverified; confirm what it refunded before requesting more.','bill-note'));
  const evidence=document.createElement('details');evidence.append(recoveryText('summary','Review retained bank evidence'));
  for(const fact of row.evidence)evidence.append(recoveryText('p',fact.posted_on+' · '+fact.label+' · '+recoveryMoney(fact.amount_cents)+' · Account '+fact.account_id+' · Transaction '+fact.transaction_id+' · '+(fact.fact_hash?'Retained fact reference '+fact.fact_hash:'Fact reference missing'),'bill-note'));
  if(row.possible_refund){const fact=row.possible_refund;evidence.append(recoveryText('p','Unverified credit lead: '+fact.posted_on+' · '+fact.label+' · '+recoveryMoney(fact.amount_cents)+' · Account '+fact.account_id+' · Transaction '+fact.transaction_id,'bill-note'));}
  item.append(evidence);
  if(row.action){
   const button=recoveryText('button','Review draft request');button.type='button';button.className='btn';const panel=document.createElement('div');panel.hidden=true;
   const id='recoveryDraft'+index,label=recoveryText('label','Draft to review and copy yourself');label.setAttribute('for',id);const draft=document.createElement('textarea');draft.id=id;draft.value=row.action.text;draft.rows=8;
   panel.append(label,draft,recoveryText('p',row.action.review_note || 'Check the facts, recipient and amount before sending through your verified bank or merchant channel. Upmore has not sent this request.','bill-note'));
   button.setAttribute('aria-expanded','false');button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)draft.focus();};item.append(button,panel);
  }
  const confirm=document.createElement('input');confirm.type='checkbox';confirm.id='recoverySaveConfirm'+index;
  const label=recoveryText('label','');label.setAttribute('for',confirm.id);label.append(confirm,recoveryText('span','Save preparation only. No request will be sent and no refund is confirmed.'));
  const due=document.createElement('input');due.type='date';due.id='recoveryCaseDue'+index;const dueLabel=recoveryText('label','Optional follow-up date you choose');dueLabel.setAttribute('for',due.id);
  const save=recoveryText('button','Save recovery case');save.type='button';save.className='btn';
  save.onclick=async()=>{if(generation!==recoveryGeneration || session?.user?.id!==owner)return;save.disabled=true;
   try{const saved=await recoveryController.openCase(row,confirm.checked,due.value || null);if(!saved || generation!==recoveryGeneration)return;
    const loaded=await recoveryCasesLoad();if(generation===recoveryGeneration)recoveryCaseMessage('Case saved · …'+saved.id.slice(-6)+'. Preparation only; no request sent or refund confirmed.'+(loaded?'':' Case history could not refresh; reload to verify the saved case.'),!loaded);
   }catch(error){if(generation===recoveryGeneration)recoveryCaseMessage(error.message+' If a response was lost, retry unchanged details to check the same request.',true);}finally{save.disabled=false;}
  };item.append(label,dueLabel,due,save);host.append(item);
 });
}
async function recoveryLoad(append=false){
 const generation=++recoveryGeneration,account=document.getElementById('recoveryAccount')?.value.trim() || null;
 if(append && account!==recoveryAccount){recoveryMessage('Account changed. Reload the scan before loading another page.',true);return false;}
 if(!append){recoveryRows=[];recoveryOffset=null;recoveryReport=null;recoveryAccount=account;recoveryDraw();document.getElementById('recoveryCoverage').replaceChildren();}
 document.getElementById('recoveryMore').hidden=true;recoveryMessage('Checking retained bank facts for recovery candidates…');
 try{
  const report=await recoveryController.scan({offset:append?recoveryOffset:0,account_id:account,reference_hash:append?recoveryReport?.reference_hash:null});if(!report || generation!==recoveryGeneration)return false;
  if(append && report.reference_hash!==recoveryReport?.reference_hash)throw Error('Bank facts changed between pages. Reload the scan.');
  const rows=append?recoveryRows.concat(report.candidates):report.candidates;if(new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('Recovery candidates changed. Reload the scan.');
  recoveryRows=rows;recoveryOffset=report.next_offset;recoveryReport=report;recoveryDraw();
  if(!append&&!account){const select=document.getElementById('recoveryAccount');select.replaceChildren();const all=recoveryText('option','All retained accounts');all.value='';select.append(all);for(const a of report.source.accounts){const option=recoveryText('option',(a.institution||'Institution unknown')+' · '+(a.name||'Account')+' · …'+a.account_id.slice(-6)+' · '+(a.status||'status unknown'));option.value=a.account_id;select.append(option);}select.value='';}
  const coverage=document.getElementById('recoveryCoverage');coverage.replaceChildren();coverage.append(recoveryText('p','Incomplete coverage · Scan date '+report.today+' · Source '+'retained bank records'+' · Scan prepared at '+(report.as_of || 'time unavailable')+'; this is not a bank observation time.','bill-note'),
   recoveryText('p','Verified recovered: $0.00. Credit matches are unverified leads. Candidate amounts are hypotheses, not fraud findings, entitlements or realized savings.'),
   recoveryText('p','Excluded: '+report.excluded.unsupported_currency+' unsupported-currency records; '+report.excluded.unavailable+' unavailable records. Report reference '+report.reference_hash,'bill-note'));
  coverage.append(recoveryText('p','Retained records: '+(Number.isSafeInteger(report.record_count)?report.record_count:'count unavailable')+' · History '+(report.history_from || 'start unknown')+' to '+(report.history_to || 'end unknown')+' · Pending records without dates: '+(Number.isSafeInteger(report.excluded.unknown_hold_date)?report.excluded.unknown_hold_date:'unknown'),'bill-note'));
  for(const account of report.source.accounts)coverage.append(recoveryText('p',(account.institution || 'Institution unknown')+' · '+(account.name || 'Account')+' · Account '+account.account_id+' · '+(account.status || 'status unknown')+' · Balance as of '+(account.balance_as_of || 'unknown')+' · Fetched '+(account.fetched_at || 'unknown'),'bill-note'));
  document.getElementById('recoveryMore').hidden=recoveryOffset===null;
  recoveryMessage(rows.length?rows.length+' of '+report.total_candidates+' candidates shown. Review evidence and prepare a request; nothing has been sent.':'No candidates found in the included history. Incomplete coverage does not establish that no money is recoverable.');return true;
 }catch(error){if(generation===recoveryGeneration){document.getElementById('recoveryMore').hidden=recoveryOffset===null;recoveryMessage(error.message,true);}return false;}
}
function recoveryCaseMessage(text,error=false){const node=document.getElementById('recoveryCaseStatus');node.textContent=text;node.setAttribute('role',error?'alert':'status');}
function recoveryCasesDraw(){
 const generation=recoveryCaseGeneration,host=document.getElementById('recoveryCases');host.replaceChildren();
 for(const row of recoveryCases){const item=document.createElement('article');item.className='bill-row';item.append(recoveryText('h3',row.kind.replaceAll('_',' ')+' · '+recoveryMoney(row.amount_cents)),recoveryText('p',row.status==='user_reported_submitted'?'You reported submitting a request. Upmore has no provider confirmation.':row.status==='closed_user'?'Closed by you. Closed does not mean paid or recovered.':'Open preparation. No request sent.'),recoveryText('p','Version '+row.version+' · Follow-up '+(row.due_on || 'not set')+' · '+(row.source_stale?'Source bank facts changed; submit/reopen unavailable.':'Retained source facts match current records.')+' · Recovered amount unverified.','bill-note'));
  const details=document.createElement('details');details.append(recoveryText('summary','Saved source evidence'));for(const fact of row.source_snapshot)details.append(recoveryText('p',fact.posted_on+' · '+(fact.merchant_raw || fact.merchant_key || 'Bank record')+' · '+recoveryMoney(fact.amount_cents)+' · Account '+fact.account_id+' · Transaction '+fact.provider_transaction_id,'bill-note'));item.append(details);
  const select=document.createElement('select');select.id='recoveryCaseState'+row.id;select.setAttribute('aria-label','Choose a user-reported status for this case');for(const [value,label] of [['open','Open preparation'],['user_reported_submitted','I sent the request myself'],['closed_user','Close without confirming recovery']]){const option=recoveryText('option',label);option.value=value;option.disabled=row.source_stale && value!=='closed_user';select.append(option);}select.value=row.source_stale?'closed_user':row.status;
  const confirm=document.createElement('input');confirm.type='checkbox';confirm.id='recoveryCaseConfirm'+row.id;const label=recoveryText('label','');label.setAttribute('for',confirm.id);label.append(confirm,recoveryText('span','This status is my report only. Upmore sends nothing and does not verify a refund.'));
  const save=recoveryText('button','Save reported status');save.type='button';save.className='btn';save.onclick=async()=>{if(generation!==recoveryCaseGeneration)return;save.disabled=true;
   try{const saved=await recoveryController.updateCase(row,select.value,confirm.checked);if(!saved || generation!==recoveryCaseGeneration)return;const reload=recoveryCasesLoad(),reloadGeneration=recoveryCaseGeneration,loaded=await reload;if(reloadGeneration===recoveryCaseGeneration)recoveryCaseMessage('User-reported status saved. No external request or verified refund.'+(loaded?'':' History could not refresh; reload cases.'),!loaded);}
   catch(error){if(generation===recoveryCaseGeneration)recoveryCaseMessage(error.message,true);}finally{save.disabled=false;}
  };item.append(select,label,save);host.append(item);
 }
}
async function recoveryCasesLoad(append=false){
 const generation=++recoveryCaseGeneration;if(!append){recoveryCases=[];recoveryCaseOffset=null;recoveryCasesDraw();}document.getElementById('recoveryCaseMore').hidden=true;recoveryCaseMessage('Loading saved recovery preparations…');
 try{const page=await recoveryController.cases(append?recoveryCaseOffset:0);if(!page || generation!==recoveryCaseGeneration)return false;const rows=append?recoveryCases.concat(page.cases):page.cases;if(new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('Case history changed. Reload cases.');recoveryCases=rows;recoveryCaseOffset=page.next_offset;recoveryCasesDraw();document.getElementById('recoveryCaseMore').hidden=recoveryCaseOffset===null;recoveryCaseMessage(rows.length?'Saved preparations and user-reported status only. No refund is verified.':'No saved recovery cases. This does not establish that no money is recoverable.');return true;}
 catch(error){if(generation===recoveryCaseGeneration){document.getElementById('recoveryCaseMore').hidden=recoveryCaseOffset===null;recoveryCaseMessage(error.message,true);}return false;}
}
function renderRecoveryReview(){document.getElementById('recoveryReload').onclick=()=>Promise.all([recoveryLoad(),recoveryCasesLoad()]);document.getElementById('recoveryMore').onclick=()=>recoveryLoad(true);document.getElementById('recoveryCaseMore').onclick=()=>recoveryCasesLoad(true);const reload=document.getElementById('recoveryCaseReload');if(reload)reload.onclick=()=>recoveryCasesLoad();return Promise.all([recoveryLoad(),recoveryCasesLoad()]);}
