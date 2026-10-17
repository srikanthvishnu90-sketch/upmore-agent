/* Application-chat resume flow; no file bytes enter agentAsk or chatImages. */
const applicantResume=UpmoreApplicantResume({
  capture:()=>chatRequests.capture(),getToken:()=>getSessionToken(),onChange:renderApplicantResume,
  request:async(route,body,token)=>{const multipart=body instanceof FormData,response=await fetch(UPMORE_BACKEND_URL+'/functions/v1/career-applicant/'+route,{method:'POST',headers:{apikey:UPMORE_ANON_KEY,authorization:'Bearer '+token,...(multipart?{}:{'content-type':'application/json'})},body:multipart?body:JSON.stringify(body)});let result;try{result=await response.json();}catch(_){result=null;}return {status:response.status,body:result};}
});
function applicantFields(){const values={};for(const key of ['first_name','last_name','email','location'])values[key]=$('applicant_'+key)?.value||'';return values;}
function renderApplicantResume(){
  const panel=$('applicantResumeSheet');if(!panel)return;const v=applicantResume.view(),status=$('applicantResumeStatus');
  const messages={idle:'Choose your original PDF or DOCX, up to 1 MiB.',uploading:'Uploading your original file…',uploaded:'File uploaded. Review the file and any details you want to confirm.',reviewing:'Preparing your exact review…',review_ready:'Review this file and the details below. Confirm only what you want used in applications.',confirming:'Saving your confirmation…',confirmed:'Resume confirmed for this application chat. Job applications still need a reviewed approval.',upload_uncertain:'The upload could not be confirmed. Retry the same upload to check it.',confirm_uncertain:'The confirmation could not be confirmed. Retry the same confirmation to check it.',changed:'Your review changed or expired. Review it again before confirming.',chat_required:'Start or open your application chat first.',sign_in:'Sign in again to continue.',file_required:'Choose an original PDF or DOCX up to 1 MiB.',unavailable:'Resume upload is unavailable. No new confirmation is claimed.',uncertain:'The review is unavailable. Try reviewing again.'};
  status.textContent=messages[v.state]||messages.unavailable;
  const proof=$('applicantResumeFile');proof.textContent=v.upload?`${v.upload.filename} · ${v.upload.bytes} bytes · SHA-256 ${v.upload.sha256}`:v.filename||'';
  $('applicantResumeChoose').disabled=v.busy;$('applicantResumeReview').disabled=v.busy||!v.upload||v.state==='confirmed';
  $('applicantResumeConfirm').disabled=v.busy||!v.review||v.state==='confirmed';
  $('applicantResumeConfirm').textContent=v.state==='confirm_uncertain'?'Retry same confirmation':Object.keys(applicantFields()).some(k=>applicantFields()[k].trim())?'Use this resume and confirm these details':'Use this resume';
  const retry=$('applicantResumeRetry');retry.hidden=v.state!=='upload_uncertain';retry.disabled=v.busy;
  for(const key of ['first_name','last_name','email','location'])$('applicant_'+key).disabled=v.busy||v.state==='confirmed';
}
function careerResumeReset(){applicantResume.reset();const panel=$('applicantResumeSheet');if(panel)panel.hidden=true;const file=$('applicantResumeInput');if(file)file.value='';for(const key of ['first_name','last_name','email','location']){const el=$('applicant_'+key);if(el)el.value='';}renderApplicantResume();}
function openApplicantResume(){
  if(!session){toast('Sign in to use your resume.');show('login');return;}
  if(!upmoreThread){toast('Start or open your application chat first, then add your resume.');return;}
  if(applicantResume.view().state==='idle'&&!applicantResume.start())return;
  $('applicantResumeSheet').hidden=false;renderApplicantResume();$('applicantResumeChoose').focus();
}
function wireApplicantResume(){
  $('chatResume').onclick=openApplicantResume;
  $('applicantResumeChoose').onclick=()=>$('applicantResumeInput').click();
  $('applicantResumeInput').onchange=()=>{const file=$('applicantResumeInput').files?.[0];$('applicantResumeInput').value='';if(file)applicantResume.upload(file);};
  $('applicantResumeRetry').onclick=()=>applicantResume.upload();
  $('applicantResumeReview').onclick=()=>{if(applicantResume.edit(applicantFields()))applicantResume.review();};
  $('applicantResumeConfirm').onclick=()=>applicantResume.confirm();
  $('applicantResumeClose').onclick=()=>{$('applicantResumeSheet').hidden=true;$('chatResume').focus();};
  for(const key of ['first_name','last_name','email','location'])$('applicant_'+key).oninput=()=>applicantResume.edit(applicantFields());
  $('applicantResumeSheet').addEventListener('keydown',event=>{if(event.key==='Escape'){$('applicantResumeSheet').hidden=true;$('chatResume').focus();}});
}
