/* Original resume bytes stay outside chat/model payloads. State is memory-only. */
globalThis.UpmoreApplicantResume = function ({capture,getToken,request,onChange=()=>{},newId=()=>crypto.randomUUID().replace(/-/g,''),now=Date.now}) {
  const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i,HASH=/^[a-f\d]{64}$/;
  const fieldsAllowed=new Set(['first_name','last_name','name','email','phone','location','country','city','state','postal_code','linkedin','website','github']);
  const canonical=x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))));
  let ticket,file,upload,review,confirmed,pendingFields={},uploadKey,confirmKey,revision=0,busy=false,state='idle';
  function reset(){revision++;ticket=file=upload=review=confirmed=uploadKey=confirmKey=undefined;pendingFields={};busy=false;state='idle';onChange();}
  function current(){return !!ticket?.current();}
  function bound(){return current()&&UUID.test(ticket.owner||'')&&UUID.test(ticket.thread||'');}
  function view(){if(ticket&&!current())reset();return {state,busy,filename:file?.name||upload?.filename||null,upload:upload?{...upload}:null,review:review?{...review,fields:{...pendingFields}}:null,confirmed:confirmed?{...confirmed}:null};}
  function start(){reset();ticket=capture();if(!ticket.owner||!UUID.test(ticket.thread||'')){state='chat_required';onChange();return false;}return true;}
  async function call(route,body,version){
    let token;try{token=await getToken();}catch(_){throw Error('sign_in');}if(version!==revision||!bound())return null;
    if(typeof token!=='string'||!token)throw Error('sign_in');
    let result;try{result=await request(route,body,token);}catch(_){throw Error('uncertain');}if(version!==revision||!bound())return null;
    if(result.status!==200)throw Error(result.status===401?'sign_in':result.status===503?'uncertain':result.status===409?'changed':result.status===400?'rejected':'unavailable');
    return result.body;
  }
  function ownedReply(body,key){return body?.thread_id===ticket.thread&&body.turn_key===key&&body.applicant;}
  async function uploadFile(selected){
    if(busy)return false;if(!bound()&&!start())return false;
    if(selected){file=selected;upload=review=confirmed=undefined;uploadKey='resume_upload_'+newId();confirmKey=undefined;revision++;}
    if(!file||!file.size||file.size>1048576||!(/\.(pdf|docx)$/i.test(file.name))){state='file_required';onChange();return false;}
    const mime=/\.pdf$/i.test(file.name)?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const form=new FormData();form.set('threadId',ticket.thread);form.set('requestId',uploadKey);form.set('file',new Blob([file],{type:mime}),file.name);form.set('filename',file.name);
    const version=revision;busy=true;state='uploading';onChange();
    try{const body=await call('uploads',form,version);if(!body)return false;const a=ownedReply(body,uploadKey);
      if(!a||a.status!=='uploaded_unconfirmed'||!UUID.test(a.uploadId)||!HASH.test(a.sha256)||a.filename!==file.name||a.bytes!==file.size||a.contentType!==mime)throw Error('unavailable');
      upload={...a};state='uploaded';return true;
    }catch(e){if(version===revision&&current())state=e.message==='uncertain'?'upload_uncertain':e.message;return false;}
    finally{if(version===revision&&current()){busy=false;onChange();}}
  }
  function edit(values){if(!bound()||busy)return false;const next={};for(const [key,value]of Object.entries(values||{})){if(!fieldsAllowed.has(key)||typeof value!=='string')return false;if(value.trim())next[key]=value.trim();}
    if(canonical(next)!==canonical(pendingFields)){pendingFields=next;review=undefined;confirmKey=undefined;revision++;if(upload)state='uploaded';onChange();}return true;
  }
  async function reviewFile(){
    if(busy||!bound()||!upload)return false;const version=revision,fields={...pendingFields};busy=true;state='reviewing';onChange();
    try{const body=await call('review',{threadId:ticket.thread,uploadId:upload.uploadId,fields},version);if(!body)return false;
      const r=body.review,b=r?.binding;if(!HASH.test(r?.sha256||'')||b?.userId!==ticket.owner||b.threadId!==ticket.thread||b.uploadId!==upload.uploadId||b.sha256!==upload.sha256||canonical(b.fields||{})!==canonical(fields)||!(Date.parse(r.expiresAt)>now()))throw Error('unavailable');
      review={sha256:r.sha256,expiresAt:r.expiresAt};confirmKey='resume_confirm_'+newId();state='review_ready';return true;
    }catch(e){if(version===revision&&current())state=e.message;return false;}
    finally{if(version===revision&&current()){busy=false;onChange();}}
  }
  async function confirmFile(){
    if(busy||!bound()||!upload||!review)return false;if(state!=='confirm_uncertain'&&!(Date.parse(review.expiresAt)>now())){state='changed';review=undefined;onChange();return false;}
    const version=revision,fields={...pendingFields};busy=true;state='confirming';onChange();
    try{const body=await call('confirm',{threadId:ticket.thread,requestId:confirmKey,uploadId:upload.uploadId,reviewHash:review.sha256,fields,message:Object.keys(fields).length?'use this resume and confirm these fields':'use this resume'},version);if(!body)return false;const a=ownedReply(body,confirmKey);
      if(!a||a.status!=='confirmed'||a.uploadId!==upload.uploadId||a.sha256!==upload.sha256||a.artifactId!==upload.artifactId||a.filename!==upload.filename||a.bytes!==upload.bytes||a.contentType!==upload.contentType||typeof a.versionId!=='string'||!a.versionId||!Array.isArray(a.confirmedFieldKeys)||new Set(a.confirmedFieldKeys).size!==a.confirmedFieldKeys.length||canonical(Object.fromEntries(a.confirmedFieldKeys.map(k=>[k,true])))!==canonical(Object.fromEntries(Object.keys(fields).map(k=>[k,true]))))throw Error('unavailable');
      confirmed={...a};file=undefined;state='confirmed';return true;
    }catch(e){if(version===revision&&current())state=e.message==='uncertain'?'confirm_uncertain':e.message;return false;}
    finally{if(version===revision&&current()){busy=false;onChange();}}
  }
  async function restore(){
    // A read must never overwrite a retained upload/review or its uncertain
    // confirmation nonce. New owner/thread tickets fence delayed responses.
    if(busy||file||upload||review)return false;if(!bound()&&!start())return false;
    const version=revision;busy=true;state='loading';onChange();
    try{const body=await call('status',{threadId:ticket.thread},version);if(!body)return false;
      if(body.version!=='career_applicant_status/v1'||body.userId!==ticket.owner||body.threadId!==ticket.thread||!Number.isSafeInteger(body.accountVersion)||body.accountVersion<0||!Number.isSafeInteger(body.privacyEpoch)||body.privacyEpoch<0)throw Error('unavailable');
      if(body.status==='none'&&body.applicant===null){confirmed=undefined;state='idle';return true;}
      const a=body.applicant;if(body.status!=='confirmed'||a?.status!=='confirmed'||!HASH.test(a.sha256||'')||!(/^[A-Za-z0-9_-]{1,160}$/).test(a.artifactId||'')||!(/^[A-Za-z0-9_-]{1,160}$/).test(a.versionId||'')||typeof a.filename!=='string'||!a.filename||a.filename.length>180||!Number.isInteger(a.bytes)||a.bytes<1||a.bytes>1048576||!['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(a.contentType)||!Number.isFinite(Date.parse(a.confirmedAt)))throw Error('unavailable');
      confirmed={status:'confirmed',artifactId:a.artifactId,versionId:a.versionId,sha256:a.sha256,filename:a.filename,contentType:a.contentType,bytes:a.bytes,confirmedAt:a.confirmedAt};state='confirmed';return true;
    }catch(e){if(version===revision&&current()){confirmed=undefined;state=e.message==='sign_in'?'sign_in':'unavailable';}return false;}
    finally{if(version===revision&&current()){busy=false;onChange();}}
  }
  return {start,reset,view,upload:uploadFile,edit,review:reviewFile,confirm:confirmFile,restore};
};
