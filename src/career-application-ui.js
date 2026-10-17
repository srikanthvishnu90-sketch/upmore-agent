/* Explicit application workflow controls. All dynamic text uses textContent;
   reviews/answers stay in memory and the server remains execution authority. */
const applicationChat=UpmoreApplicationChat({capture:()=>chatRequests.capture(),getToken:()=>getSessionToken(),onChange:renderCareerApplications,
 adopt:(ticket,id)=>ticket.adoptThread(id,value=>{upmoreThread=value;}),
 request:async(body,token)=>{const r=await fetch(UPMORE_BACKEND_URL+'/functions/v1/agent-chat',{method:'POST',headers:{apikey:UPMORE_ANON_KEY,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});let value;try{value=await r.json();}catch(_){value=null;}return {status:r.status,body:value};}
});
let applicationFactDraft=null;
function careerApplicationReset(){applicationFactDraft=null;applicationChat.reset();const el=$('careerApplicationsSheet');if(el)el.hidden=true;}
function appElement(tag,text,parent){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(parent)parent.appendChild(el);return el;}
function appButton(parent,label,run,disabled){const el=appElement('button',label,parent);el.type='button';el.className='btn';el.disabled=!!disabled;el.onclick=()=>applicationAction(run);return el;}
async function applicationAction(run){const ticket=chatRequests.capture();const result=await run();if(result&&ticket.current())addAI([result.reply],null,null,ticket);renderCareerApplications();return result;}
function appLink(parent,url,label){try{const u=new URL(url);if(u.protocol!=='https:')return appElement('span',label,parent);const a=appElement('a',label,parent);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch(_){return appElement('span',label,parent);}}
function applicationFactsForm(parent,v){
 const form=appElement('form',undefined,parent),draft=applicationFactDraft||v.data?.factDefaults||{},refs={};
 const input=(key,label,type='text')=>{const row=appElement('label',label,form),el=appElement('input',undefined,row);el.name=key;el.type=type;el.required=true;el.value=draft[key]||'';refs[key]=el;return el;};
 input('workCountry','Country where you are authorized to work (two-letter code, for example US or GB)');
 input('workAuthorization','Your actual work authorization');
 const sponsorRow=appElement('label','Do you require sponsorship?',form),sponsor=appElement('select',undefined,sponsorRow);sponsor.required=true;for(const [value,label]of [['','Choose an answer'],['yes','Yes'],['no','No']]){const o=appElement('option',label,sponsor);o.value=value;}if(typeof draft.needsSponsorship==='boolean')sponsor.value=draft.needsSponsorship?'yes':'no';
 const levelRow=appElement('label','Current career stage',form),level=appElement('select',undefined,levelRow);level.required=true;for(const [value,label]of [['','Choose a stage'],['student','Student'],['new_grad','New graduate'],['experienced','Experienced']]){const o=appElement('option',label,level);o.value=value;}level.value=draft.level||'';
 input('graduationDate','Expected or actual graduation month','month');input('education','Your actual education');input('location','Your current city/state').required=false;
 const label=appElement('label','Skills and supporting evidence — one “skill | evidence” pair per line',form),skills=appElement('textarea',undefined,label);skills.required=true;skills.rows=5;skills.value=(draft.skills||[]).map(s=>s.name+' | '+s.evidence).join('\n');
 const submit=appElement('button','Review these facts',form);submit.type='submit';submit.className='btn';submit.disabled=v.busy||v.pending;
 form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;const lines=skills.value.split('\n').map(x=>x.trim()).filter(Boolean),items=[];for(const line of lines){const at=line.indexOf('|');if(at<1||!line.slice(at+1).trim()){toast('Use skill | supporting evidence on each line.');return;}items.push({name:line.slice(0,at).trim(),evidence:line.slice(at+1).trim()});}
  applicationFactDraft={workCountry:refs.workCountry.value.trim().toUpperCase(),workAuthorization:refs.workAuthorization.value.trim(),needsSponsorship:sponsor.value==='yes',level:level.value,graduationDate:refs.graduationDate.value,education:refs.education.value.trim(),location:refs.location.value.trim(),skills:items};applicationAction(()=>applicationChat.facts(applicationFactDraft));};
}
function renderCareerApplications(){
 const panel=$('careerApplicationsContent');if(!panel)return;const v=applicationChat.view(),d=v.data;panel.replaceChildren();
 const messages={idle:'Ask for investment internships to start a sourced shortlist.',loading:'Checking the current application records…',uncertain:'This step could not be confirmed. Retry the same request to recover its acknowledgement.',sign_in:'Sign in again to continue.',refused:'The request or saved context changed. Refresh the owned batch and review again.'};
 if(v.state!=='ready')appElement('p',messages[v.state]||messages.idle,panel);
 if(v.state==='uncertain')appButton(panel,'Retry same request',()=>applicationChat.retry(),v.busy);
 const locked=v.busy||v.pending;
 if(!d){appButton(panel,'Check saved batch',()=>applicationChat.status(),locked);return;}
 const rows=d.batch?.roles||d.batch?.manifest?.roles||[],synthetic=d.synthetic||rows.some(r=>r.posting?.observationProvenance==='synthetic_fixture/v1');
 if(synthetic)appElement('p','SYNTHETIC FIXTURE — these records do not establish a real employer outcome.',panel);
 if(['needs_resume','needs_facts'].includes(d.status)){
  if(d.status==='needs_resume')appButton(panel,'Add or review original resume',async()=>{$('careerApplicationsSheet').hidden=true;openApplicantResume();return null;},locked);
  if(d.missingFacts?.length){appElement('p','Needed: '+d.missingFacts.join(', '),panel);applicationFactsForm(panel,v);}
  appButton(panel,'Find my internships',()=>applicationChat.search(),locked);return;
 }
 if(d.status==='facts_review'){
  appElement('p','Confirm only the facts and evidence you supplied. This updates your current career context.',panel);const pre=appElement('pre',JSON.stringify(d.fields,null,2),panel);pre.style.whiteSpace='pre-wrap';
  appButton(panel,'Confirm exactly these facts',()=>applicationChat.confirmFacts(),locked||Date.parse(d.expiresAt)<=Date.now());const edit=appElement('details',undefined,panel);appElement('summary','Edit or renew this facts review',edit);applicationFactsForm(edit,{...v,data:{factDefaults:d.fields}});return;
 }
 if(d.status==='profile_confirmed'){appElement('p','Your explicitly confirmed application facts are saved.',panel);appButton(panel,'Find my internships',()=>applicationChat.search(),locked);return;}
 if(d.status==='needs_search_clarification'){appElement('p',d.question,panel);appElement('p','Clarify the complete search request below before searching. The current request has not fetched or selected any roles.',panel);const form=appElement('form',undefined,panel),label=appElement('label','Updated complete search request',form),input=appElement('input',undefined,label);input.type='text';input.required=true;input.value=d.originalAsk||v.lastSearch;const submit=appElement('button','Search with the clarified request',form);submit.type='submit';submit.disabled=locked;form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;if(!applicationChat.accepts(input.value)){toast('Include the internship role and your clarified constraint.');return;}applicationAction(()=>applicationChat.send(input.value));};return;}
 if(d.status==='no_batch'){appElement('p','Start with a sourced internship shortlist.',panel);appButton(panel,'Find my internships',()=>applicationChat.search(),locked);return;}
 if(['shortlist','shortlist_expired'].includes(d.status)){
  appElement('p',d.matched+' of '+d.requested+' requested roles have sourced fit evidence. '+(d.status==='shortlist_expired'?'Refresh the source snapshot before preparing.':''),panel);
  const choices=[];for(const row of [...(d.shortlist||[]),...(d.held||[])]){
   const card=appElement('article',undefined,panel);card.className='item';const label=appElement('label',undefined,card),check=appElement('input',undefined,label);check.type='checkbox';check.checked=false;check.disabled=locked||d.status==='shortlist_expired';choices.push({id:row.taskId,check});appElement('span',row.posting.title+' — '+row.posting.company,label);
   appElement('p',row.posting.location||'Location not stated',card);appLink(card,row.posting.url,'Employer posting');appLink(card,row.source.url,' Source record');
   appElement('p','Observed '+new Date(row.source.observedAt).toLocaleString()+(row.posting.posted_at?' · First published '+new Date(row.posting.posted_at).toLocaleDateString():' · First publication date unavailable'),card);
   for(const line of row.eligibility.fit?.fitLines||[])appElement('p',line,card);if(row.eligibility.status!=='eligible')appElement('p','Held for eligibility answers before preparation.',card);
  }
  appButton(panel,'Prepare selected roles',()=>applicationChat.prepare(choices.filter(x=>x.check.checked).map(x=>x.id)),locked||d.status==='shortlist_expired'||!choices.length);
  const health=appElement('details',undefined,panel);appElement('summary','Source coverage',health);for(const h of d.sourceHealth||[])appElement('p',h.provider+': '+h.postings+' observed postings · '+(h.error||'HTTP '+h.status),health);
  appButton(panel,'Refresh search',()=>applicationChat.search(),locked);return;
 }
 if(d.status==='batch_review'){
  appElement('p',rows.length+' exact ready roles. '+(d.batch.manifest.withheld||[]).length+' held roles are excluded from this approval.',panel);
  for(const row of rows){const card=appElement('article',undefined,panel);card.className='item';appElement('h3',row.posting.title+' — '+row.posting.company,card);appLink(card,row.posting.url,'Employer posting');for(const line of row.review.eligibility?.fit?.fitLines||[])appElement('p',line,card);
   appElement('p','Resume '+(row.review.artifactVersion||'confirmed version')+' · SHA-256 '+row.review.resumeSha256,card);const detail=appElement('details',undefined,card);appElement('summary','Exact payload and observed question bindings',detail);const pre=appElement('pre',JSON.stringify({payload:row.review.payload,questions:row.review.questions,answers:row.review.answerBindings},null,2),detail);pre.style.whiteSpace='pre-wrap';}
  appElement('p','Review expires '+new Date(d.batch.expiresAt).toLocaleString()+'. Daily, vendor and company limits still apply.',panel);
  appButton(panel,'Approve these '+rows.length+' exact applications',()=>applicationChat.approve(),locked||Date.parse(d.batch.expiresAt)<=Date.now());
 }
 if(d.status==='batch'){
  if(d.batch?.approvedTaskIds)appElement('p',d.batch.approvedTaskIds.length+' reviewed roles are queued. Check authoritative outcomes below.',panel);
  for(const role of rows){const card=appElement('article',undefined,panel);card.className='item';appElement('h3',(role.posting?.title||'Application')+' — '+(role.posting?.company||''),card);appElement('p',role.status==='unknown_outcome'?'Outcome unknown. Check the destination receipt.':role.status.replaceAll('_',' '),card);if(role.task?.blocker)appElement('p',role.task.blocker.replaceAll('_',' ').toLowerCase(),card);
   if(role.status==='awaiting_user'&&role.task?.questionsSha256){const inputs=[];for(const ask of role.task.asks||[]){if(!ask.answerable){appElement('p',ask.question||ask.reason||'Manual review required.',card);continue;}const label=appElement('label',ask.field?.label||ask.question||ask.field_id,card),boolean=ask.field?.answerType==='boolean'||ask.field?.kind==='attestation',el=appElement(boolean?'select':'input',undefined,label);if(boolean){for(const [value,text]of [['','Choose an answer'],['true','Yes'],['false','No']]){const o=appElement('option',text,el);o.value=value;}}else el.type='text';el.disabled=locked;inputs.push({ask,el,boolean});}
    if(inputs.length)appButton(card,'Confirm answers for this role',async()=>{if(inputs.some(x=>!x.el.value.trim())){toast('Answer the displayed questions before confirming.');return null;}return applicationChat.answers(role.taskId,inputs.map(x=>({fieldId:x.ask.field_id,questionSha256:x.ask.questionSha256,value:x.boolean?x.el.value==='true':x.el.value})));},locked);
   }
   if(role.status==='unknown_outcome')appButton(card,'Check receipt without resending',()=>applicationChat.reconcile(role.taskId),locked);
  }
 }
 appButton(panel,'Refresh posting sources and prepare a new review',()=>applicationChat.refresh(),locked);
 appButton(panel,'Refresh batch status',()=>applicationChat.status(),locked);appButton(panel,'Review ready roles',()=>applicationChat.review(),locked);
}
function openCareerApplications(){if(!session){toast('Sign in to view your application records.');return;}$('careerApplicationsSheet').hidden=false;renderCareerApplications();if(!applicationChat.view().data)applicationAction(()=>applicationChat.status());}
function wireCareerApplications(){$('chatApplications').onclick=openCareerApplications;$('careerApplicationsClose').onclick=()=>{$('careerApplicationsSheet').hidden=true;$('chatApplications').focus();};$('careerApplicationsSheet').addEventListener('keydown',e=>{if(e.key==='Escape'){$('careerApplicationsSheet').hidden=true;$('chatApplications').focus();}});}
