"use strict";
const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const crypto=require('node:crypto');
const {createPullWorker}=require('../workers/career-browser/pull.cjs');const {hashApplyPayload}=require('../supabase/functions/_shared/career_apply_store.ts');
const clone=v=>JSON.parse(JSON.stringify(v));const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const observed=url=>({url_before:url,url_after:url+'/done',form_present_after:false,required_empty_after:0,validation_errors:[],captcha:false,email_code_prompt:false,page_text:'Application received. Confirmation number: TEST-12345.'});
async function job(n,url){const p={version:1,user_id:uuid(901),job_id:'TEST-'+n,company:'Employer '+n,url,fields:[{name:'email',label:'Email',value:'synthetic@example.test',factId:'TEST-EMAIL'}],resume:{sha256:crypto.createHash('sha256').update('TEST RESUME').digest('hex'),filename:'synthetic.pdf'},privacy_epoch:1,account_version:1,expires_at:new Date(Date.now()+3600000).toISOString(),synthetic:true};const hash=await hashApplyPayload(p);return {id:uuid(n),user_id:p.user_id,job_id:p.job_id,company:p.company,url,payload:p,payload_hash:hash,approval_hash:hash,state:'queued',attempts:0};}
function memory(jobs){const rows=new Map(jobs.map(j=>[j.id,clone(j)])),messages=new Map();let finishLost=false,authority=true;
 const queue={async sweep(now){let n=0;for(const j of rows.values())if(j.state==='driving'&&now-Date.parse(j.claimed_at)>900000){j.state='unknown_outcome';j.reason='drive stopped; not retried';j.evidence={};n++;}return n;},
 async claim(now,n){return [...rows.values()].filter(j=>j.state==='queued').slice(0,n).map(j=>{Object.assign(j,{state:'driving',attempts:1,claimed_at:new Date(now).toISOString(),lease_token:uuid(5000+Number(j.id.slice(-4)))});return clone(j);});},
 async current(j){const r=rows.get(j.id);return authority&&r?.state==='driving'&&r.lease_token===j.lease_token;},async get(j){return clone(rows.get(j.id));},
 async finish(j,state,evidence){const r=rows.get(j.id);assert.equal(r.state,'driving');assert.equal(r.lease_token,j.lease_token);Object.assign(r,{state,reason:evidence.reason,confirmation_id:evidence.confirmation_id,evidence});if(finishLost){finishLost=false;throw Error('settlement acknowledgement lost');}return clone(r);},
 async notifications(){return [...rows.values()].filter(j=>!['queued','driving'].includes(j.state)&&!messages.has('apply:'+j.id)).map(clone);}};
 const outbox={async put(row){const key=row.key;if(!messages.has(key))messages.set(key,clone(row));}};
 return {rows,messages,queue,outbox,allowLocalFixtures:true,loseNextFinish(){finishLost=true;},pause(){authority=false;}};
}
const info=j=>({fields:j.payload.fields,resume_sha256:j.payload.resume.sha256,destination:j.payload.destination||j.url});
const receipt=j=>({state:'confirmed',reason:'driver claim',confirmation_id:'INVENTED',evidence:{observation:observed(j.url),post:{mutations:1,status:200,destination:j.url}}});
test('009b-5 N parallel drives and one per host, against local fixture receipt servers',async()=>{
 let active=0,peak=0;const byHost=new Map(),peaks=new Map();const servers=await Promise.all([1,2,3].map(()=>new Promise(resolve=>{const s=http.createServer(async(req,res)=>{const host=req.headers.host;active++;peak=Math.max(peak,active);byHost.set(host,(byHost.get(host)||0)+1);peaks.set(host,Math.max(peaks.get(host)||0,byHost.get(host)));await new Promise(r=>setTimeout(r,40));active--;byHost.set(host,byHost.get(host)-1);res.writeHead(200,{'Content-Type':'application/json'}).end('{"received":true}');});s.listen(0,'127.0.0.1',()=>resolve(s));})));
 try{const urls=servers.map(s=>'http://127.0.0.1:'+s.address().port),jobs=await Promise.all([job(1,urls[0]+'/1'),job(2,urls[1]+'/2'),job(3,urls[0]+'/3'),job(4,urls[2]+'/4')]),m=memory(jobs);
  const worker=createPullWorker({...m,concurrency:4,allowLocalFixtures:true,drive:async(j,ctx)=>{await ctx.approve(info(j));assert.equal((await fetch(j.url,{method:'POST',body:'SYNTHETIC FIXTURE'})).status,200);return receipt(j);}});
  const r=await worker.runOnce();assert.equal(peak,3);assert.ok([...peaks.values()].every(n=>n===1));assert.equal(r.length,4);assert.ok(r.every(x=>x.state==='confirmed'));assert.equal(m.messages.size,4);
  for(const msg of m.messages.values()){assert.equal(msg.kind,'apply');assert.match(msg.key,/^apply:/);assert.doesNotMatch(msg.text,/INVENTED/);}await worker.runOnce();assert.equal(m.messages.size,4);
 }finally{await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));}
});
test('009b-5 crash after admission becomes unknown and cannot be claimed or driven again',async()=>{
 const m=memory([await job(1,'http://127.0.0.1:19399/test/'+uuid(1))]);let effects=0;
 const w=createPullWorker({...m,drive:async(j,ctx)=>{await ctx.approve(info(j));effects++;throw Error('connection lost after effect');}});
 assert.equal((await w.runOnce())[0].state,'unknown_outcome');await w.runOnce();assert.equal(effects,1);assert.equal(m.messages.size,1);
});
test('009b-5 approval mismatch and a fresh authority denial stop before the driver',async()=>{
 const a=await job(1,'http://127.0.0.1:19399/test/'+uuid(1));a.approval_hash='0'.repeat(64);const m=memory([a]);let drives=0;
 const w=createPullWorker({...m,drive:async()=>{drives++;}});assert.equal((await w.runOnce())[0].state,'not_submitted');assert.equal(drives,0);
 const p=memory([await job(2,'http://127.0.0.1:19399/test/'+uuid(2))]);p.pause();const x=createPullWorker({...p,drive:async()=>{drives++;}});assert.equal((await x.runOnce())[0].state,'not_submitted');assert.equal(drives,0);
});
test('009b-5 a dead claim sweeps to unknown and its outcome is queued once',async()=>{
 const j=await job(1,'http://127.0.0.1:19399/test/'+uuid(1)),m=memory([j]);await m.queue.claim(Date.now()-960000,1);let drives=0;
 const w=createPullWorker({...m,drive:async()=>{drives++;}});await w.runOnce();await w.runOnce();assert.equal(m.rows.get(j.id).state,'unknown_outcome');assert.equal(drives,0);assert.equal(m.messages.size,1);
});
test('009b-5 lost settlement acknowledgement reads the recorded result instead of resending',async()=>{
 const m=memory([await job(1,'http://127.0.0.1:19399/test/'+uuid(1))]);m.loseNextFinish();let effects=0;
 const w=createPullWorker({...m,drive:async(j,ctx)=>{await ctx.approve(info(j));effects++;return receipt(j);}});assert.equal((await w.runOnce())[0].state,'confirmed');await w.runOnce();assert.equal(effects,1);assert.equal(m.messages.size,1);
});
test('009b-5 refuses unadmitted confirmation and parallelism above six',async()=>{
 assert.throws(()=>createPullWorker({concurrency:7,queue:{},outbox:{},drive:()=>{}}));const m=memory([await job(1,'http://127.0.0.1:19399/test/'+uuid(1))]);const w=createPullWorker({...m,drive:async j=>receipt(j)});assert.equal((await w.runOnce())[0].state,'not_submitted');assert.doesNotMatch([...m.messages.values()][0].text,/INVENTED/);
});
test('009b-5 changed actual fields, foreign destination and missing observation proof cannot confirm',async()=>{
 for(const change of [p=>p.fields[0].value='INVENTED',p=>p.destination='https://example.invalid/submit']){
  const m=memory([await job(1,'http://127.0.0.1:19399/test/1')]);let effects=0;const w=createPullWorker({...m,drive:async(j,ctx)=>{const p=clone(info(j));change(p);await ctx.approve(p);effects++;return receipt(j);}});
  assert.equal((await w.runOnce())[0].state,'not_submitted');assert.equal(effects,0);
 }
 const m=memory([await job(2,'http://127.0.0.1:19399/test/2')]);const w=createPullWorker({...m,drive:async(j,ctx)=>{await ctx.approve(info(j));const r=receipt(j);delete r.evidence.observation.form_present_after;return r;}});assert.equal((await w.runOnce())[0].state,'unknown_outcome');assert.doesNotMatch([...m.messages.values()][0].text,/INVENTED/);
});
test('009b-5 synthetic packets cannot reach real ATS hosts, and authority is checked again at approval',async()=>{
 const m=memory([await job(1,'https://jobs.lever.co/test/'+uuid(1))]);let effects=0;assert.equal((await createPullWorker({...m,drive:async()=>{effects++;}}).runOnce())[0].state,'not_submitted');assert.equal(effects,0);
 const p=memory([await job(2,'http://127.0.0.1:19399/form')]);let checks=0;p.queue.current=async()=>++checks===1;assert.equal((await createPullWorker({...p,drive:async(j,ctx)=>{await ctx.approve(info(j));effects++;return receipt(j);}}).runOnce())[0].state,'not_submitted');assert.equal(checks,2);assert.equal(effects,0);
});
test('009b-5 an outbox acknowledgement failure retries only notification, never the settled drive',async()=>{
 const m=memory([await job(1,'http://127.0.0.1:19399/test/1')]);let drives=0,fail=true;const put=m.outbox.put;m.outbox.put=async row=>{await put(row);if(fail){fail=false;throw Error('outbox acknowledgement lost');}};
 const w=createPullWorker({...m,drive:async(j,ctx)=>{await ctx.approve(info(j));drives++;return receipt(j);}});await assert.rejects(w.runOnce());await w.runOnce();assert.equal(drives,1);assert.equal(m.messages.size,1);
});
test('009b-5 service adapter binds reads to the owner and uses deduplicating outbox inserts',async()=>{
 const {createBackend}=require('../workers/career-browser/pull.cjs');const calls=[],j={...(await job(1,'http://127.0.0.1:19399/form')),lease_token:uuid(999),state:'driving',attempts:1};
 const backend=createBackend({url:'https://worker.example.test',key:'SYNTHETIC_FIXTURE_ONLY',request:async(url,o)=>{calls.push({url:new URL(url),o});let data;if(url.pathname.endsWith('/career_apply_finish'))data=[{...j,state:'confirmed'}];else if(url.pathname.endsWith('/career_apply_current'))data=true;else if(url.pathname.endsWith('/career_apply_jobs'))data=[j];else if(url.pathname.endsWith('/career_apply_notifications'))data=[];else return new Response(null,{status:201});return Response.json(data);}});
 assert.equal((await backend.queue.finish(j,'confirmed',{reason:'TEST'})).state,'confirmed');assert.equal(await backend.queue.current(j),true);await backend.outbox.put({user_id:j.user_id,key:'apply:'+j.id,kind:'apply',text:'TEST',deliver_at:new Date().toISOString()});
 const read=calls.find(c=>c.url.pathname.endsWith('/career_apply_jobs'));assert.equal(read.url.searchParams.get('user_id'),'eq.'+j.user_id);assert.equal(read.url.searchParams.get('id'),'eq.'+j.id);const write=calls.find(c=>c.url.pathname.endsWith('/career_outbox'));assert.equal(write.url.searchParams.get('on_conflict'),'user_id,key');assert.match(write.o.headers.Prefer,/ignore-duplicates/);
});
test('009b-5 default CLI drive sends the exact approved artifact once and refuses a changed plan',async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createCliDrive}=require('../workers/career-browser/pull.cjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-apply-pull-test-'));let posts=0,received;
 const server=http.createServer(async(req,res)=>{if(req.method==='POST'){posts++;const chunks=[];for await(const b of req)chunks.push(b);const data=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers['content-type']}}).formData();received={email:data.get('email'),resume:Buffer.from(await data.get('resume').arrayBuffer()).toString()};res.writeHead(200,{'Content-Type':'text/html'}).end('<h1>Application received. Confirmation number: TEST-12345.</h1>');return;}res.writeHead(200,{'Content-Type':'text/html'}).end('<form method="post" action="/submit" enctype="multipart/form-data"><label for="email">Email</label><input id="email" name="email" required><label for="resume">Resume</label><input id="resume" name="resume" type="file" required><button type="submit">Submit application</button></form>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{const j=await job(1,base+'/form');j.payload.destination=base+'/submit';j.payload_hash=j.approval_hash=await hashApplyPayload(j.payload);const artifacts=path.join(root,'artifacts'),owner=path.join(artifacts,crypto.createHash('sha256').update(j.user_id).digest('hex'));fs.mkdirSync(owner,{recursive:true,mode:0o700});fs.writeFileSync(path.join(owner,j.payload.resume.sha256),'TEST RESUME',{mode:0o600});
  const drive=createCliDrive({artifactRoot:artifacts,stateRoot:path.join(root,'state'),allowLocalFixtures:true});const m=memory([j]),w=createPullWorker({...m,drive});const results=await w.runOnce();assert.equal(results[0].state,'confirmed',JSON.stringify(results));assert.equal(results[0].confirmation_id,'TEST-12345');assert.equal(posts,1);assert.deepEqual(received,{email:'synthetic@example.test',resume:'TEST RESUME'});await w.runOnce();assert.equal(posts,1);assert.equal(m.messages.size,1);
  const changed=await job(2,base+'/changed');changed.payload.destination=base+'/submit';changed.payload.fields[0].label='E-mail address';changed.payload_hash=changed.approval_hash=await hashApplyPayload(changed.payload);const bad=memory([changed]);const r=await createPullWorker({...bad,drive}).runOnce();assert.equal(r[0].state,'not_submitted');assert.equal(posts,1);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
});
