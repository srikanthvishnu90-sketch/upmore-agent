/* Application chat commands share the existing endpoint. Private views and
   uncertain command nonces live only in memory and are fenced by chat tickets. */
globalThis.UpmoreApplicationChat=function({capture,getToken,request,adopt=()=>false,onChange=()=>{},newId=()=>crypto.randomUUID().replace(/-/g,'')}){
 const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,HASH=/^[a-f0-9]{64}$/;
 let ticket,revision=0,pending=null,data=null,busy=false,state='idle',lastSearch='Find 10 investment internships';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const accepts=text=>typeof text==='string'&&!/^(?:please\s+)?(?:do not|don't|stop|never)\s+(?:find|show|search|look)/i.test(text)&&!(!/\b(?:find|show|search|look(?:ing)? for|recommend)\b/i.test(text)&&/\b(?:help|writing|write|draft|prepare|learn|explain|interview)\b/i.test(text))&&((/\b(?:find|show|search|look(?:ing)? for|want|need|recommend)\b/i.test(text)&&/\b(?:investment|private equity|equity research)\b/i.test(text)&&/\b(?:intern(?:ship)?s?|summer analyst)\b/i.test(text))||/^(?:(?:Approve|Review) (?:my |the )?(?:application )?batch|(?:Show|Check|Refresh|Status(?: of)?) (?:my |the )?(?:application )?batch|Reconcile batch role|Confirm application facts)\b/i.test(text)||/^(?:(?:show|check|refresh) my applications|(?:what(?:'s| is) the status of|how are) my applications(?: doing)?)[.!?]?$/i.test(text));
 function reset(){revision++;ticket=undefined;pending=data=null;busy=false;state='idle';lastSearch='Find 10 investment internships';onChange();}
 function current(){return !!ticket?.current();}
 function view(){if(ticket&&!current())reset();return {state,busy,pending:!!pending,data:data?clone(data):null,lastSearch};}
 function observe(body,t){if(!t?.current()||body?.application?.version!=='career_application_chat/v1'||!UUID.test(body.thread_id||'')||(t.thread&&body.thread_id!==t.thread))return false;ticket=t;data=clone(body.application);if(typeof data.originalAsk==='string')lastSearch=data.originalAsk;state='ready';onChange();return true;}
 async function dispatch(item){
  const rev=revision;ticket=item.ticket;busy=true;state='loading';onChange();
  try{
   const token=await getToken();if(rev!==revision||!current())return null;if(typeof token!=='string'||!token)throw Error('sign_in');
   const result=await request(item.body,token);if(rev!==revision||!current())return null;
   if(result.status!==200){if(result.status===503)throw Error('uncertain');pending=null;data=null;state=result.status===401?'sign_in':'refused';return null;}
   const body=result.body;if(!body||typeof body.reply!=='string'||!UUID.test(body.thread_id||'')||(ticket.thread&&body.thread_id!==ticket.thread))throw Error('uncertain');
   if(!ticket.thread&&!adopt(ticket,body.thread_id))return null;
   if(item.body.career_application&&!body.application)throw Error('uncertain');
   if(body.application){if(!observe(body,ticket))throw Error('uncertain');}else state='idle';pending=null;return body;
  }catch(e){if(rev===revision&&current())state=e.message==='sign_in'?'sign_in':'uncertain';return null;}
  finally{if(rev===revision&&current()){busy=false;onChange();}}
 }
 async function send(message,control,t=capture()){
  if(busy||pending)return null;if(!t?.current()||!UUID.test(t.owner||'')||(t.thread&&!UUID.test(t.thread)))return null;
  const body={thread_id:t.thread,turn_key:'application_'+newId(),message,...(control?{career_application:clone(control)}:{})};pending={ticket:t,body};if(/\b(?:find|search|look for)\b/i.test(message))lastSearch=message;return dispatch(pending);
 }
 const batch=()=>data?.batch?.batchId;
 return {accepts,send,reset,view,observe,retry:()=>!busy&&pending?dispatch(pending):Promise.resolve(null),
  search:()=>send(lastSearch),
  facts:fields=>send('Review my application facts',{action:'facts_review',input:fields}),
  confirmFacts:()=>data?.status==='facts_review'&&HASH.test(data.reviewHash||'')?send(data.confirmationPhrase,{action:'facts_confirm',input:{reviewHash:data.reviewHash}}):Promise.resolve(null),
  prepare:taskIds=>data?.status==='shortlist'?send('Prepare selected applications',{action:'prepare',input:{searchId:data.searchId,taskIds}}):Promise.resolve(null),
  status:()=>send('Show my application batch',batch()?{action:'status',input:{batchId:batch()}}:undefined),
  refresh:()=>batch()?send('Refresh application sources',{action:'refresh',input:{batchId:batch()}}):Promise.resolve(null),
  review:()=>send('Review my application batch',batch()?{action:'review',input:{batchId:batch()}}:undefined),
  approve:()=>data?.status==='batch_review'&&HASH.test(data.batch?.reviewHash||'')?send(data.batch.approvalPhrase,{action:'approve',input:{batchId:batch(),reviewHash:data.batch.reviewHash}}):Promise.resolve(null),
  answers:(taskId,answers)=>{const r=data?.batch?.roles?.find(r=>r.taskId===taskId);return r?.status==='awaiting_user'&&HASH.test(r.task?.questionsSha256||'')?send('Confirm answers for '+taskId+' '+r.task.questionsSha256,{action:'answers',input:{batchId:batch(),taskId,questionsHash:r.task.questionsSha256,answers}}):Promise.resolve(null);},
  reconcile:taskId=>send('Reconcile batch role '+taskId,{action:'reconcile',input:{batchId:batch(),taskId}})
 };
};
