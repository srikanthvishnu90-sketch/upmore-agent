"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApplyQueue, createApplyPool, payloadHash } = require('../workers/career-browser/apply-queue.cjs');
const payload = n => ({ version: 1, user_id: 'synthetic-owner', job_id: 'job-'+n, company: 'Company '+n,
  fields: [{name:'email',label:'Email',value:'synthetic@example.test',factId:'TEST-1'}] });
const job = n => { const p=payload(n); return {id:'job-'+n,lease_token:'claim-'+n,payload:p,payload_hash:payloadHash(p),approval_hash:payloadHash(p)}; };
const confirmedObservation = {url_before:'https://example.test/apply',url_after:'https://example.test/confirmed',form_present_after:false,required_empty_after:0,validation_errors:[],captcha:false,email_code_prompt:false,page_text:'Application received. Confirmation number: TEST-12345.'};
test('009b admission refuses changed approval before any queue RPC',async()=>{
 let calls=0;const q=createApplyQueue({rpc:async()=>{calls++;return {data:[],error:null};}});
 await assert.rejects(q.enqueue(payload(1),'0'.repeat(64)),/not_approved/);assert.equal(calls,0);
});
test('009b six independent slots fence before effects and retain claimed job bindings',async()=>{
 const jobs=Array.from({length:6},(_,n)=>job(n));let active=0,peak=0;const fenced=new Set(),finished=[];
 const queue={claim:async n=>{assert.equal(n,6);return jobs;},advance:async(j,state)=>{if(state==='submitting')fenced.add(j.id);else finished.push(j.id);}};
 const pool=createApplyPool({queue,concurrency:6,execute:async(j,ctx)=>{active++;peak=Math.max(peak,active);await ctx.beforeSubmit();assert.ok(fenced.has(j.id));await new Promise(r=>setTimeout(r,15));active--;return {state:'confirmed',observation:confirmedObservation};}});
 const out=await pool.runOnce();assert.equal(peak,6);assert.equal(finished.length,6);assert.ok(out.every(x=>x.state==='confirmed'));
});
test('009b a lost result after the submit fence is retained for readback, never redispatched',async()=>{
 const j=job(1);let clicks=0,states=[];const queue={claim:async()=>[j],advance:async(_,s)=>states.push(s)};
 const pool=createApplyPool({queue,execute:async(_,ctx)=>{await ctx.beforeSubmit();clicks++;throw Error('lost result');}});
 assert.equal((await pool.runOnce())[0].reason,'READBACK_REQUIRED');assert.equal(clicks,1);assert.deepEqual(states,['submitting']);
});
test('009b a lost submit-fence acknowledgement never reports not_submitted or allows an effect',async()=>{
 let clicks=0;const states=[];
 const pool=createApplyPool({queue:{claim:async()=>[job(1)],advance:async(_,s)=>{states.push(s);throw Error('response lost');}},execute:async(_,ctx)=>{await ctx.beforeSubmit();clicks++;}});
 assert.equal((await pool.runOnce())[0].reason,'READBACK_REQUIRED');assert.equal(clicks,0);assert.deepEqual(states,['submitting']);
});
test('009b a malformed payload stops before execute and cannot manufacture confirmation',async()=>{
 const j=job(1);j.payload.fields[0].value='changed';let calls=0;const states=[];
 const pool=createApplyPool({queue:{claim:async()=>[j],advance:async(_,s)=>states.push(s)},execute:async()=>{calls++;return {state:'confirmed'};}});
 assert.equal((await pool.runOnce())[0].state,'not_submitted');assert.equal(calls,0);assert.deepEqual(states,['not_submitted']);
});
test('009b a driver cannot report employer confirmation without consuming the submit fence',async()=>{
 const states=[];const pool=createApplyPool({queue:{claim:async()=>[job(1)],advance:async(_,s)=>states.push(s)},execute:async()=>({state:'confirmed'})});
 assert.equal((await pool.runOnce())[0].state,'not_submitted');assert.deepEqual(states,['not_submitted']);
});
test('009b a fenced driver cannot report confirmation without matching employer observation',async()=>{
 const states=[];const pool=createApplyPool({queue:{claim:async()=>[job(1)],advance:async(_,s)=>states.push(s)},execute:async(_,ctx)=>{await ctx.beforeSubmit();return {state:'confirmed'};}});
 assert.equal((await pool.runOnce())[0].reason,'READBACK_REQUIRED');assert.deepEqual(states,['submitting']);
});
test('009b live handoff binds one paused tab, consumes its token once and rejects foreign input',async()=>{
 const {EventEmitter}=require('node:events');const {createLiveView}=require('../workers/career-browser/live-view.cjs');
 const cdp=new EventEmitter(),calls=[];cdp.send=async(type,args)=>{calls.push([type,args]);if(type==='Page.startScreencast')cdp.emit('Page.screencastFrame',{data:'TEST-JPEG',sessionId:17});return {cssLayoutViewport:{clientWidth:1000,clientHeight:800}};};cdp.detach=async()=>{};
 const page={context:()=>({newCDPSession:async p=>{assert.equal(p,page);return cdp;}})};
 const view=await createLiveView();const handoff=await view.pause(page);
 try {
  const claim=await fetch(handoff.url,{redirect:'manual'});assert.equal(claim.status,303);
  const cookie=claim.headers.get('set-cookie').split(';')[0],path=claim.headers.get('location');
  assert.equal((await fetch(handoff.url,{redirect:'manual'})).status,403);
  assert.equal((await fetch(view.origin+path)).status,403);
  assert.equal((await fetch(view.origin+path,{headers:{cookie}})).status,200);
  const stream=await fetch(view.origin+path+'/frames',{headers:{cookie}}),reader=stream.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value),/TEST-JPEG/);
  assert.ok(calls.some(([type,args])=>type==='Page.screencastFrameAck'&&args.sessionId===17));await reader.cancel();
  const input=(v,origin=view.origin)=>fetch(view.origin+path+'/input',{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify(v)});
  assert.equal((await input({type:'click',x:10,y:20},'https://foreign.example.test')).status,403);
  assert.equal((await input({type:'click',x:1001,y:20})).status,400);
  assert.equal((await input({type:'click',x:10,y:20})).status,204);
  assert.equal((await input({type:'text',text:'TEST-CODE'})).status,204);
  assert.equal((await input({type:'key',key:'Tab'})).status,204);
  assert.equal(calls.filter(x=>x[0]==='Input.dispatchMouseEvent').length,2);
  assert.equal((await input({type:'resume'})).status,204);
  assert.deepEqual(await handoff.completed,{reason:'user_resume'});
  assert.equal((await fetch(view.origin+path,{headers:{cookie}})).status,410);
 }finally{await view.close();}
});
test('009b handoff expiry closes CDP without claiming human completion',async()=>{
 const {EventEmitter}=require('node:events');const {createLiveView}=require('../workers/career-browser/live-view.cjs');
 const cdp=new EventEmitter();let detached=0;cdp.send=async()=>({cssLayoutViewport:{clientWidth:800,clientHeight:600}});cdp.detach=async()=>{detached++;};
 const view=await createLiveView({ttl:20});try{const h=await view.pause({context:()=>({newCDPSession:async()=>cdp})});assert.deepEqual(await h.completed,{reason:'expired'});assert.equal(detached,1);assert.equal((await fetch(h.url)).status,410);}finally{await view.close();}
});

// Opt-in local SQL contracts: point at a throwaway cluster initialized with
// tests/db/stubs.sql, pgcrypto, career_watch_kv, and the apply migration.
// No dependency or connection to a hosted database is used by the normal gate.
if (process.env.UPMORE_APPLY_TEST_SOCKET) test('009b local SQL admission, ownership, parallel claims and one-shot transitions',async()=>{
 const {execFile}=require('node:child_process');const {promisify}=require('node:util');const exec=promisify(execFile);
 const socket=process.env.UPMORE_APPLY_TEST_SOCKET;
 assert.ok(socket.startsWith('/tmp/'));const bin=process.env.UPMORE_TEST_PSQL||'psql';
 const sql=async text=>(await exec(bin,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-p',process.env.UPMORE_TEST_PGPORT||'54339','-U','postgres','-d','postgres','-c',text])).stdout.trim();
 const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
 const owner='00000000-0000-4000-8000-000000000901',other='00000000-0000-4000-8000-000000000902';
 await sql(`insert into auth.users(id) values('${owner}'),('${other}') on conflict do nothing;insert into profiles(id) values('${owner}'),('${other}') on conflict do nothing;
 delete from career_apply_jobs where user_id in ('${owner}','${other}');
 insert into career_watch_kv values('${owner}','career:account','{"epoch":1,"version":1,"paused":false}') on conflict(user_id,key) do update set value=excluded.value;`);
 const p=n=>({...payload(n),user_id:owner,privacy_epoch:1,account_version:1,expires_at:new Date(Date.now()+300000).toISOString()});
 const enqueue=(p,d=25)=>{const h=payloadHash(p);return sql(`set role service_role;select (career_apply_enqueue(${quote(JSON.stringify(p))}::jsonb,'${h}','${h}',${d})).id;`);};
 try {
  const unicode={'10':'a','2':'b','é':'c','𐀀':'d','':'e',fields:p(1).fields};
  assert.equal(await sql(`select encode(digest(career_apply_canonical(${quote(JSON.stringify(unicode))}::jsonb),'sha256'),'hex')`),payloadHash(unicode));
  const a=p(1),id=await enqueue(a);
  await assert.rejects(enqueue(a),/duplicate_job/);
  await assert.rejects(enqueue({...p(2),company:a.company+' LLC'}),/company_cooldown/);
  await assert.rejects(enqueue(p(2),1),/daily_cap/);
  await assert.rejects(sql(`set role authenticated;select career_apply_claim(1)`),/permission denied/);
  assert.equal(await sql(`set role authenticated;set request.jwt.claim.sub='${other}';select count(*) from career_apply_jobs;`),'0');
  assert.equal(await sql(`set role authenticated;set request.jwt.claim.sub='${owner}';select count(*) from career_apply_jobs;`),'1');
  await sql(`update career_watch_kv set value='{"epoch":1,"version":1,"paused":true}' where user_id='${owner}'`);
  assert.equal(await sql('set role service_role;select count(*) from career_apply_claim(12)'),'0');
  await assert.rejects(enqueue(p(3)),/stale/);
  await sql(`update career_watch_kv set value='{"epoch":1,"version":1,"paused":false}' where user_id='${owner}'`);
  const claimed=await sql('set role service_role;select row_to_json(j) from career_apply_claim(1) j');const j=JSON.parse(claimed);assert.equal(j.id,id);
  const advance=s=>sql(`set role service_role;select (career_apply_advance('${j.id}','${j.lease_token}',${quote(s)})).state`);
  await assert.rejects(advance('confirmed'),/invalid apply transition/);
  await sql(`update career_watch_kv set value='{"epoch":2,"version":2}' where user_id='${owner}'`);
  await assert.rejects(advance('submitting'),/submit refused/);
  await sql(`update career_watch_kv set value='{"epoch":1,"version":1}' where user_id='${owner}'`);
  assert.equal(await advance('submitting'),'submitting');await assert.rejects(advance('submitting'),/submit refused/);
  assert.equal(await advance('confirmed'),'confirmed');await assert.rejects(advance('confirmed'),/invalid apply transition/);
  const race=await Promise.allSettled([enqueue(p(4)),enqueue(p(4))]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
  await Promise.all(Array.from({length:5},(_,n)=>enqueue(p(n+5))));
  const claims=await Promise.all(Array.from({length:6},()=>sql('set role service_role;select id from career_apply_claim(1)')));
  assert.equal(new Set(claims).size,6);assert.ok(claims.every(Boolean));
  await sql(`delete from career_watch_kv where user_id='${owner}'`);await assert.rejects(enqueue(p(99)),/stale/);
 } finally {await sql(`delete from career_apply_jobs where user_id='${owner}';delete from career_watch_kv where user_id='${owner}';delete from profiles where id in ('${owner}','${other}');delete from auth.users where id in ('${owner}','${other}');`);}
});
