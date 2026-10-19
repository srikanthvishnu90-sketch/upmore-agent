"use strict";
// WO-009b-5. One claim, one approved drive, one durable outcome; never requeue.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {hashApplyPayload,supabaseApplyStore}=require('../../supabase/functions/_shared/career_apply_store.ts');
const {classifyOutcome,classifyField,normLabel}=require('../../supabase/functions/_shared/career_apply.ts');
const {hostAllowed}=require('../../packages/domain/150-career-portal-browser.js');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const final=new Set(['confirmed','submitted_unconfirmed','needs_user','failed','not_submitted','unknown_outcome']);
const reject=code=>Object.assign(Error(code),{code});
const label=s=>String(s).normalize('NFC').replace(/\s+/g,' ').replace(/\s*\*$/,'').trim();
function target(value,local){const u=new URL(value),gate=hostAllowed(u.href);if(!gate.allowed||u.username||u.password||(gate.kind==='local_test'?!local:u.protocol!=='https:'))throw reject('APPLY_HOST_REFUSED');return u;}
function bound(j,r){return r&&r.id===j.id&&r.user_id===j.user_id&&r.job_id===j.job_id&&r.payload_hash===j.payload_hash&&r.approval_hash===j.approval_hash&&r.lease_token===j.lease_token;}
async function validJob(j,local){
 const p=j.payload;if(j.state!=='driving'||j.attempts!==1||!j.lease_token||!p||p.user_id!==j.user_id||p.job_id!==j.job_id||p.url!==j.url||p.company!==j.company||j.approval_hash!==j.payload_hash||await hashApplyPayload(p)!==j.payload_hash)throw reject('APPLICATION_NOT_APPROVED');
 target(j.url,local);if(p.synthetic&&(!local||hostAllowed(j.url).kind!=='local_test'))throw reject('SYNTHETIC_FACTS_REQUIRE_LOCAL_FIXTURE');
 if(!/^[a-f0-9-]{36}$/.test(j.id)||!Array.isArray(p.fields)||p.fields.some(f=>!f.name||!f.label||typeof f.value!=='string'||!f.factId||(f.user_id&&f.user_id!==j.user_id))||new Set(p.fields.map(f=>f.name)).size!==p.fields.length||!p.resume||!/^[a-f0-9]{64}$/.test(p.resume.sha256)||!p.resume.filename||path.basename(p.resume.filename)!==p.resume.filename)throw reject('APPROVED_FIELDS_REQUIRED');
 if(!Number.isFinite(Date.parse(p.expires_at))||Date.parse(p.expires_at)<=Date.now())throw reject('APPROVAL_EXPIRED');
}
function exactPlan(j,plan,local){
 const p=j.payload,actual=plan?.fields;if(!Array.isArray(actual)||plan.resume_sha256!==p.resume.sha256)throw reject('APPROVED_PLAN_CHANGED');
 const u=target(plan.destination,local),base=target(j.url,local);if(u.origin!==base.origin||plan.destination!==(p.destination||j.url))throw reject('APPROVED_DESTINATION_CHANGED');
 const pending=new Map(p.fields.map(f=>[f.name,f]));let resume=0;
 for(const f of actual){const want=pending.get(f.name);const file=classifyField(f.label,'file')==='resume'&&f.value===p.resume.sha256&&f.factId==='approved-local-resume:'+p.resume.sha256;
  if(file){if(++resume>1)throw reject('APPROVED_PLAN_CHANGED');if(want&&(want.value!==f.value||label(want.label)!==label(f.label)))throw reject('APPROVED_PLAN_CHANGED');}
  else if(!want||f.value!==want.value||f.factId!==want.factId||label(f.label)!==label(want.label))throw reject('APPROVED_PLAN_CHANGED');
  if(!file&&!pending.has(f.name))throw reject('APPROVED_PLAN_CHANGED');pending.delete(f.name);
 }
 if(pending.size||new Set(actual.map(f=>f.name)).size!==actual.length)throw reject('APPROVED_PLAN_CHANGED');
}
function observed(j,r,local){
 const o=r?.evidence?.observation,p=r?.evidence?.post;
 if(!o||!['form_present_after','captcha','email_code_prompt'].every(k=>typeof o[k]==='boolean')||!['url_before','url_after','page_text'].every(k=>typeof o[k]==='string')||!Number.isSafeInteger(o.required_empty_after)||o.required_empty_after<0||!Array.isArray(o.validation_errors)||!o.validation_errors.every(x=>typeof x==='string')||!p||p.mutations!==1||p.status<200||p.status>=300||p.destination!==(j.payload.destination||j.url)||o.url_before!==j.url)throw reject('EMPLOYER_OBSERVATION_REQUIRED');
 if(target(o.url_after,local).origin!==new URL(j.url).origin)throw reject('EMPLOYER_OBSERVATION_REQUIRED');
 return classifyOutcome(o);
}
function outcomeText(j){const id=j.confirmation_id?' Reference: '+j.confirmation_id+'.':'';const prefix='Application to '+String(j.company).slice(0,180)+': ';
 if(j.state==='confirmed')return prefix+'the employer confirmed receipt.'+id;
 if(j.state==='submitted_unconfirmed')return prefix+'submitted, but employer confirmation is still missing.';
 if(j.state==='unknown_outcome')return prefix+'the outcome is unknown; it will not be resent automatically.';
 if(j.state==='needs_user')return prefix+(j.reason==='captcha'?'please complete the human verification.':j.reason==='email_code'?'please complete the email verification.':'your help is needed; please review the application.');
 return prefix+'not submitted. Please review the application details.';
}
function createPullWorker(d={}){
 const concurrency=d.concurrency??3;if(!Number.isInteger(concurrency)||concurrency<1||concurrency>6)throw reject('INVALID_APPLY_CONCURRENCY');
 const {queue,outbox,drive}=d,now=d.now||Date.now,local=d.allowLocalFixtures===true;let busy=false;const hosts=new Map();
 if(!queue||!outbox||typeof drive!=='function')throw reject('APPLY_WORKER_NOT_WIRED');
 async function notify(){for(const j of await queue.notifications()){if(!final.has(j.state))continue;await outbox.put({user_id:j.user_id,key:'apply:'+j.id,kind:'apply',text:outcomeText(j),deliver_at:new Date(now()).toISOString()});}}
 async function execute(j){let admitted=false,result,evidence;
  try{await validJob(j,local);if(!await queue.current(j))throw reject('APPROVAL_STALE');
   const r=await drive(j,{async approve(plan){if(admitted)throw reject('APPROVAL_ALREADY_USED');exactPlan(j,plan,local);await validJob(j,local);if(!await queue.current(j))throw reject('APPROVAL_STALE');admitted=true;}});
   if(admitted){if(['confirmed','submitted_unconfirmed'].includes(r?.state))result=observed(j,r,local);else if(final.has(r?.state))result={state:r.state,reason:r.reason||'DRIVE_STOPPED',confirmation_id:null};else throw reject('DRIVE_RESULT_MISSING');}
   else if(['not_submitted','needs_user','failed'].includes(r?.state))result={state:r.state,reason:r.reason||'DRIVE_STOPPED',confirmation_id:null};else throw reject('SUBMISSION_NOT_ADMITTED');
   evidence={...(r?.evidence||{}),...result};
  }catch(e){result={state:admitted?'unknown_outcome':'not_submitted',reason:admitted?'READBACK_REQUIRED':e.code||'DRIVE_REFUSED',confirmation_id:null};evidence={...result};}
  try{const saved=await queue.finish(j,result.state,evidence);if(!bound(j,saved)||!final.has(saved.state))throw reject('OUTCOME_RECORD_UNCERTAIN');return saved;}
  catch{try{const saved=await queue.get(j);if(bound(j,saved)&&final.has(saved.state))return saved;}catch{/* Keep the durable claim; only the dead-claim sweep may finalize it. */}return {id:j.id,state:'unknown_outcome',reason:'OUTCOME_RECORD_PENDING',recorded:false};}
 }
 async function one(j){let host;try{host=new URL(j.url).host.toLowerCase();}catch{host='invalid';}const prior=hosts.get(host)||Promise.resolve();let release;const next=new Promise(r=>release=r);hosts.set(host,next);
  await prior;try{return await execute(j);}finally{release();if(hosts.get(host)===next)hosts.delete(host);}}
 return {async runOnce(){if(busy)return [];busy=true;try{await queue.sweep(now());await notify();const rows=await queue.claim(now(),concurrency);if(!Array.isArray(rows)||rows.length>concurrency)throw reject('INVALID_APPLY_CLAIM');const results=await Promise.all(rows.map(one));await notify();return results;}finally{busy=false;}},
  async run(signal){while(!signal?.aborted){await this.runOnce();await new Promise(resolve=>{const timer=setTimeout(done,1000);function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();}signal?.addEventListener('abort',done,{once:true});if(signal?.aborted)done();});}}};
}
function privateDir(dir){fs.mkdirSync(dir,{recursive:true,mode:0o700});const s=fs.lstatSync(dir);if(s.isSymbolicLink()||!s.isDirectory()||(s.mode&0o077))throw reject('PRIVATE_DIRECTORY_REQUIRED');return dir;}
// Each child uses the existing CLI and its persistent, owner-bound dispatch fence.
function createCliDrive({artifactRoot,stateRoot,deno=process.env.DENO_BIN||'deno',allowLocalFixtures=false,timeoutMs=180000}={}){
 if(!path.isAbsolute(artifactRoot||'')||!path.isAbsolute(stateRoot||''))throw reject('ARTIFACT_STORE_NOT_WIRED');privateDir(stateRoot);
 return async(j,ctx)=>{
  await validJob(j,allowLocalFixtures);
  const p=j.payload,owner=path.join(artifactRoot,sha(j.user_id)),dir=fs.lstatSync(owner),file=path.join(owner,p.resume.sha256),st=fs.lstatSync(file);
  if(dir.isSymbolicLink()||!dir.isDirectory()||(dir.mode&0o077)||st.isSymbolicLink()||!st.isFile()||(st.mode&0o077)||sha(fs.readFileSync(file))!==p.resume.sha256)throw reject('APPROVED_ARTIFACT_MISSING');
  if(p.synthetic&&!allowLocalFixtures)throw reject('SYNTHETIC_FACTS_REQUIRE_LOCAL_FIXTURE');
  const saved=Object.create(null);for(const f of p.fields){const key=normLabel(f.label);if(saved[key]&&(saved[key].value!==f.value||saved[key].factId!==f.factId))throw reject('AMBIGUOUS_CONFIRMED_LABEL');saved[key]={value:f.value,factId:f.factId,confirmed:true,user_id:j.user_id};}
  const work=privateDir(path.join(stateRoot,j.id)),evidenceDir=path.join(work,'evidence'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-apply-packet-')),resume=path.join(temp,p.resume.filename),factsPath=path.join(temp,'facts.json');
  const args=['run','-A',path.resolve(__dirname,'../../scripts/apply.ts'),'--url',j.url,'--facts',factsPath,'--resume',resume,'--state-dir',privateDir(path.join(stateRoot,'cli-journal')),'--evidence-dir',evidenceDir,'--submit'];
  let child,tail='',lines=[],prompted=false,admissionError,answerPromise;const plan={fields:[]};
  try{fs.writeFileSync(resume,fs.readFileSync(file),{mode:0o600});fs.writeFileSync(factsPath,JSON.stringify({user_id:j.user_id,saved,posting:{url:j.url,company:j.company},synthetic:!!p.synthetic,expires_at:p.expires_at}),{mode:0o600});
   child=spawn(deno,args,{stdio:['pipe','pipe','pipe'],env:{...process.env,UPMORE_CHROMIUM_SANDBOX:'on'}});child.stdin.on('error',()=>{});
   const consume=line=>{if(line.startsWith('{')){try{plan.fields.push(JSON.parse(line));}catch{admissionError=reject('INVALID_CLI_PLAN');}}
    else if(line.startsWith('Resume SHA-256: '))plan.resume_sha256=line.slice(16);
    else if(line.startsWith('Destination: '))plan.destination=line.slice(13);
    else if(line.startsWith('Submit this application to ')&&!prompted){prompted=true;answerPromise=(async()=>{try{if(admissionError)throw admissionError;await ctx.approve(plan);child.stdin.end('yes\n');}catch(e){admissionError=e;child.stdin.end('no\n');}})();}
    if(line.startsWith('RESULT '))lines.push(line);
   };
   child.stdout.on('data',b=>{tail+=b.toString();if(tail.length>262144){admissionError=reject('CLI_OUTPUT_LIMIT');child.kill('SIGTERM');return;}let at;while((at=tail.indexOf('\n'))>=0){consume(tail.slice(0,at).replace(/\r$/,''));tail=tail.slice(at+1);}});child.stderr.resume();
   const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}finally{clearTimeout(timer);}if(tail)consume(tail);await answerPromise;
   if(admissionError)throw admissionError;if(code!==0||!lines.length)throw reject('CLI_DRIVE_INTERRUPTED');const result=JSON.parse(lines.at(-1).slice(7));
   let evidence;try{evidence=JSON.parse(fs.readFileSync(path.join(evidenceDir,'evidence.json'),'utf8'));}catch{throw reject('CLI_EVIDENCE_MISSING');}
   if(['confirmed','submitted_unconfirmed'].includes(result.state)){if(evidence.payload?.user_id!==j.user_id||evidence.payload?.resume?.sha256!==p.resume.sha256||await hashApplyPayload(evidence.payload)!==evidence.payload_hash)throw reject('CLI_EVIDENCE_BINDING');exactPlan(j,{fields:evidence.fields,resume_sha256:evidence.payload.resume.sha256,destination:evidence.payload.destination},allowLocalFixtures);}
   return {...result,evidence:{...evidence,evidence_path:evidenceDir}};
  }finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');fs.rmSync(temp,{recursive:true,force:true});}
 };
}
// Existing service-role REST API. Transport errors contain no URL, key or body.
function createBackend({url,key,request=fetch,allowLocalFixtures=false}){
 const base=new URL(url);if((base.protocol!=='https:'&&!(allowLocalFixtures&&['localhost','127.0.0.1'].includes(base.hostname)))||base.username||base.password||!key)throw reject('APPLY_BACKEND_NOT_WIRED');
 const call=async(route,{method='GET',body,prefer}={})=>{try{const r=await request(new URL('/rest/v1/'+route,base),{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const text=await r.text();return text?JSON.parse(text):null;}catch{throw reject('APPLY_BACKEND_UNAVAILABLE');}};
 const rpc=async(name,args)=>call('rpc/'+name,{method:'POST',body:args});
 const store=supabaseApplyStore({async rpc(name,args){return {data:await rpc(name,args),error:null};}});
 const get=async j=>(await call('career_apply_jobs?select=*&id=eq.'+encodeURIComponent(j.id)+'&user_id=eq.'+encodeURIComponent(j.user_id)))[0]||null;
 return {queue:{...store,get,async finish(j,state,evidence){const r=await store.finish(j,state,evidence);if(Array.isArray(r)){if(r.length!==1)throw reject('OUTCOME_RECORD_UNCERTAIN');return r[0];}return r;},async current(j){const r=await get(j);return bound(j,r)&&r.state==='driving'&&await rpc('career_apply_current',{p_user:j.user_id,p_payload:j.payload})===true;},async notifications(){return await rpc('career_apply_notifications',{p_limit:100});}},
  outbox:{async put(row){return await call('career_outbox?on_conflict=user_id,key',{method:'POST',body:row,prefer:'resolution=ignore-duplicates,return=minimal'});}}};
}
async function main(args){
 const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','UPMORE_ARTIFACT_ROOT'];if(args.length===1&&args[0]==='--check'){const missing=names.filter(n=>!Object.hasOwn(process.env,n));console.log(JSON.stringify({state:missing.length?'NOT_WIRED':'CONFIG_NAMES_PRESENT_NOT_VERIFIED',missing,provider_calls:0}));return;}
 if(args.length!==1||!['--run','--once'].includes(args[0]))throw reject('USAGE: node workers/career-browser/pull.cjs --check|--once|--run');
 if(names.some(n=>!process.env[n]))throw reject('APPLY_WORKER_NOT_WIRED');const stateRoot=privateDir(path.join(os.homedir(),'.local/state/upmore/apply-worker')),lock=path.join(stateRoot,'worker.lock');let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}catch{throw reject('APPLY_WORKER_ALREADY_RUNNING_OR_INTERRUPTED');}
 try{const backend=createBackend({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}),drive=createCliDrive({artifactRoot:process.env.UPMORE_ARTIFACT_ROOT,stateRoot}),worker=createPullWorker({...backend,drive});
  if(args[0]==='--once')console.log(JSON.stringify((await worker.runOnce()).map(j=>({id:j.id,state:j.state}))));
  else{const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());await worker.run(stop.signal);}
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(e.code||'APPLY_WORKER_FAILED');process.exitCode=1;});
module.exports={createPullWorker,createCliDrive,createBackend};
