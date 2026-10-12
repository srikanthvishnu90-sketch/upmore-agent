// Narrow messaging seam. Pure engines prepare; no execution adapter is wired.
// The caller authenticates ownership and persists this bounded state before
// claiming an update. No text or model output can create financial authority.
import {AgentLoop,AgentProactive,AgentControl,AgentMoney,AgentMoneyPlans,AgentVoice,
 CapabilityRegistry,RuntimeRegistryData,RuntimeSourceHash,DataGuard} from './agent_runtime.js';
export type RuntimeState={paused:boolean;sent:number[]};
export type RuntimeWakeInput={text:string;now:number;state?:RuntimeState;persistent?:boolean;feedInput?:Record<string,unknown>};
export type RuntimeWakeResult={handled:boolean;reply?:string;state:RuntimeState;runtime:{source_hash:string;outcome:string;data_available:boolean;external_execution:'NOT_WIRED'}};
const baseRegistry=CapabilityRegistry.load(RuntimeRegistryData);
const source='checked-in capability registry snapshot';
function voiced(text:string,question:string,now:number,registryEvidence=false):string {
 const chunks:string[]=[];let chunk='';
 // The voice limit also scales with question length (an ID is seven chars).
 // Reserve room for provenance even for that shortest supported question.
 for(const sentence of text.split(/(?<=[.!?])\s+/)){
  const units=sentence.length<=130?[sentence]:sentence.split(/\s+/);
  for(const word of units){if(chunk&&chunk.length+word.length+1>130){chunks.push(chunk);chunk='';}chunk+=(chunk?' ':'')+word;}
 }
 if(chunk)chunks.push(chunk);
 return chunks.flatMap(text=>AgentVoice.compose('answer',{text,...(registryEvidence?{source,as_of:new Date(now).toISOString()}:{})},{question}).bubbles).join('\n\n');
}
function amount(text:string):number|null {
 if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
 const [whole,fraction='']=text.split('.'),cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return cents>0n && cents<=BigInt(Number.MAX_SAFE_INTEGER)?Number(cents):null;
}
function boundedState(state:RuntimeState|undefined,now:number):RuntimeState {
 if(state!==undefined && (!state||typeof state.paused!=='boolean'||!Array.isArray(state.sent)||state.sent.some(t=>!Number.isSafeInteger(t)||t<0||t>now)))throw Error('Runtime state is invalid.');
 return {paused:state?.paused===true,sent:(state?.sent||[]).filter(t=>now-t<7*86400000).slice(-32)};
}
export async function runtimeWake(input:RuntimeWakeInput):Promise<RuntimeWakeResult> {
 if(typeof input.text!=='string'||input.text.length>6000||!Number.isSafeInteger(input.now)||input.now<=0)throw Error('Invalid runtime wake.');
 const state=boundedState(input.state,input.now),control=AgentControl.create();
 if(state.paused)control.pause.set('previous authenticated pause',input.now);
 // No grants are loaded from messages or this state. The helper remains wired
 // so a future reviewed control adapter must supply real bounded authority.
 const envelopes=(now:number)=>control.envelopes.forLoop([],now);
 const registry={get:(id:string)=>{const cap=baseRegistry.get(id);return cap?{...cap,...(!['T0','T1'].includes(cap.tier)?{status:'NOT_WIRED'}:{})}:null;},
  answer:(id:string)=>({text:baseRegistry.answer(id).text+' Messaging execution is NOT_WIRED; no external action is available.'})};
 let dataAvailable=false,feedInput:any={today:new Date(input.now).toISOString().slice(0,10),isLive:false};
 if(input.feedInput){
  // Only a trusted caller with owned records may supply this adapter input.
  // Missing provenance never becomes a live financial picture.
  const supplied=input.feedInput;
  if(typeof supplied.source!=='string'||!supplied.source.trim()||typeof supplied.as_of!=='string'||!Number.isFinite(Date.parse(supplied.as_of))||Date.parse(supplied.as_of)>input.now)throw Error('Grounded engine input needs its actual source and observation time.');
  const guarded=DataGuard.wrap(supplied);if(guarded.flagged)throw Error('Engine evidence requires review before the runtime can use it.');
  feedInput={...guarded.value,today:feedInput.today,isLive:supplied.isLive===true};dataAvailable=supplied.isLive===true;
 }
 const feed=AgentProactive.feed(feedInput,{now:input.now});
 // Deadline reminders are notifications, not payment requests. The pure
 // feed's act:false commitments otherwise enter the loop's action branch.
 const observational={...feed,commitments:[],watches:[...feed.watches,...feed.commitments.filter((c:any)=>c.act===false&&c.due_at<=input.now).map((c:any)=>({...c,reason:'recorded deadline; notification only'}))]};
 const loop=AgentLoop.create({registry,clock:()=>input.now,control:control.pause,envelopes,
  sent:state.sent,guard:DataGuard,connectors:{
   read:async()=>{throw Error('No grounded capability read adapter is connected to this seam.');},
   write:async()=>{throw Error('NOT_WIRED: external execution is disabled.');},
   verify:async()=>({confirmed:null,source:null}),
  }});
 const t=input.text.trim(),idMatches=t.match(/\b[A-Z]{3,4}-\d{3}\b/g)||[];
 let handled=false,reply:string|undefined,request:any=null,registryEvidence=false;
 const pause=/^(?:pause|pause upmore|pause (?:all )?(?:actions|automation)|stop automation)[.!]?$/i.test(t),resume=/^(?:resume|resume upmore|resume (?:actions|automation))[.!]?$/i.test(t);
 if(pause||resume){
  handled=true;
  if(input.persistent!==true)reply='I cannot save a pause or resume change without a verified persistent conversation. No setting was changed.';
  else{if(pause)control.pause.set('user requested pause',input.now);else control.pause.clear(input.now);state.paused=pause;reply=pause?'Paused. I can answer questions; runtime actions stay off. This does not cancel anything already submitted.':'Runtime pause cleared. External actions remain NOT_WIRED; this grants no payment or cancellation authority.';}
 }else if(idMatches.length===1 && (t===idMatches[0]||/\b(can|what|status|capability|available|support|do you|does)\b/i.test(t))){
  handled=true;registryEvidence=true;const answer=baseRegistry.answer(idMatches[0]);reply=answer.text+(/[.!?]$/.test(answer.text)?' ':'. ')+'Messaging execution is NOT_WIRED. A local test does not establish live access.';
 }else if(/^(send|transfer|move|request)\b/i.test(t)){
  handled=true;
  const parsed=/^(send|transfer|move|request)\s+\$(\d+(?:\.\d{1,2})?)\s+(?:to|from)\s+(.+)$/i.exec(t),cents=parsed?amount(parsed[2]):null;
  if(!parsed||cents===null)reply='What exact USD amount and recipient or owned accounts do you mean? No payment is prepared, queued or approved; the execution rail is NOT_WIRED.';
  else{
   const kind=parsed[1].toLowerCase();
   const plan:any=kind==='request'?AgentMoneyPlans.requestMoney({from:parsed[3],amount_cents:cents},{people:[],today:feedInput.today}):
    kind==='move'||kind==='transfer'?AgentMoneyPlans.ownTransfer({amount_cents:cents,from:null,to:null},{accounts:[],today:feedInput.today}):
    AgentMoney.prepareSend({amount_cents:cents,recipient:parsed[3],instruction:t},{people:[],partners:{},today:feedInput.today});
   if(plan.stop)reply=plan.message || plan.text;
   else reply='The execution rail is NOT_WIRED. I still need a verified recipient or owned accounts, funding details and a current fee quote. Nothing was sent, queued or approved.';
   request={capability_id:kind==='request'?'PAY-003':kind==='send'?'PAY-001':'PAY-009',params:{amount_cents:cents},key:'preparation-only'};
  }
 }
 const outcome=await loop.wake({...observational,...(request?{request}:{}),kind:'event'});
 // Observational decisions are not outgoing messages. Do not consume the
 // delivery budget until a separately authorized outbox commits delivery.
 if(reply)reply=voiced(reply,t,input.now,registryEvidence);
 return {handled,...(reply?{reply}:{}),state,runtime:{source_hash:RuntimeSourceHash,outcome:outcome.outcome,data_available:dataAvailable,external_execution:'NOT_WIRED'}};
}
