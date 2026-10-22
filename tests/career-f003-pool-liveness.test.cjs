'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {CareerPool:P}=require('../supabase/functions/_shared/career_pool.js');
const url=n=>`https://boards.greenhouse.io/synthetic/jobs/${n}`;
const row=(id,u=url(id))=>({posting_key:String(id),source:'greenhouse',title:'Synthetic Software Engineer',company:'Synthetic',url:u,text_excerpt:'Synthetic job',fetched_on:'2026-10-14'});
test('F003 discovery excludes only definitive dead links and preserves the snapshot vintage',async()=>{
 const loader=P.createKbPoolLoader({readRows:async()=>[row(1),row(2),row(3),row(4)],probeUrl:async u=>u===url(1)?404:u===url(2)?410:u===url(3)?403:200});
 const r=await loader.loadPool();assert.deepEqual(r.postings.map(p=>p.job_id),['3','4']);assert.equal(r.deadExcluded,2);assert.equal(r.fetchedOn,'2026-10-14');
});
test('F003 targeted lookup applies the same dead-link filter',async()=>{
 const loader=P.createKbPoolLoader({readRows:async()=>[row(1),row(2)],probeUrl:async u=>u===url(1)?404:200});
 const r=await loader.loadTargeted({company:'Synthetic'});assert.deepEqual(r.postings.map(p=>p.job_id),['2']);assert.equal(r.deadExcluded,1);
});
test('F003 distinct URLs are checked once across discovery and targeted reads',async()=>{
 let calls=0;const loader=P.createKbPoolLoader({readRows:async()=>[row(1),row(2,url(1))],probeUrl:async()=>{calls++;return 410;}});
 await loader.loadPool();await loader.loadTargeted({company:'Synthetic'});assert.equal(calls,1);
});
test('F003 uncertain responses and probe errors cannot manufacture closed postings',async()=>{
 const loader=P.createKbPoolLoader({readRows:async()=>[row(1),row(2)],probeUrl:async u=>{if(u===url(1))throw Error('synthetic reset');return null;}});
 const r=await loader.loadPool();assert.equal(r.postings.length,2);assert.equal(r.deadExcluded,0);
});
test('F003 stalled probes respect the whole-load time budget',async()=>{
 const start=Date.now(),loader=P.createKbPoolLoader({readRows:async()=>[row(1),row(2)],probeBudgetMs:20,probeUrl:()=>new Promise(()=>{})});
 const r=await loader.loadPool();assert.equal(r.postings.length,2);assert.equal(r.deadExcluded,0);assert.ok(Date.now()-start<500,'probe budget must not hang the turn');
});
test('F003 probing is concurrency bounded',async()=>{
 let active=0,max=0,calls=0;const loader=P.createKbPoolLoader({readRows:async()=>Array.from({length:15},(_,i)=>row(i)),probeConcurrency:3,probeUrl:async()=>{active++;max=Math.max(max,active);calls++;await new Promise(r=>setTimeout(r,2));active--;return 200;}});
 await loader.loadPool();assert.equal(calls,15);assert.ok(max<=3);
});
test('F003 the fetch probe is HEAD-only until a server explicitly refuses HEAD',async()=>{
 const calls=[],probe=P.createFetchProbe({fetchImpl:async(u,o)=>{calls.push([u,o]);return{status:o.method==='HEAD'?405:410,body:{cancel:async()=>{}}};}});
 assert.equal(await probe(url(1)),410);assert.deepEqual(calls.map(x=>x[1].method),['HEAD','GET']);assert.equal(calls[1][1].headers.Range,'bytes=0-0');assert.ok(calls.every(x=>x[1].redirect==='manual'&&x[1].credentials==='omit'));
});
test('F003 private, credentialed and untrusted destinations never reach fetch',async()=>{
 let calls=0;const probe=P.createFetchProbe({fetchImpl:async()=>{calls++;return{status:200};}});
 for(const u of ['http://127.0.0.1/a','https://127.0.0.1/a','https://metadata.google.internal/a','https://boards.greenhouse.io.evil.test/a','https://u:p@boards.greenhouse.io/a','https://boards.greenhouse.io:8443/a'])assert.equal(await probe(u),null,u);
 assert.equal(calls,0);
});
test('F003 unsafe redirects are stopped before the destination is fetched',async()=>{
 const calls=[],probe=P.createFetchProbe({fetchImpl:async(u)=>{calls.push(u);return{status:302,headers:{get:()=> 'http://169.254.169.254/latest/meta-data/'}};}});
 assert.equal(await probe(url(1)),null);assert.deepEqual(calls,[url(1)]);
});
test('F003 a safe redirect can establish a dead destination',async()=>{
 const calls=[],probe=P.createFetchProbe({fetchImpl:async(u)=>{calls.push(u);return calls.length===1?{status:302,headers:{get:()=>url(2)}}:{status:404};}});
 assert.equal(await probe(url(1)),404);assert.deepEqual(calls,[url(1),url(2)]);
});
test('F003 a fetch that ignores abort is still time bounded',async()=>{
 const probe=P.createFetchProbe({timeoutMs:15,fetchImpl:()=>new Promise(()=>{})}),start=Date.now();assert.equal(await probe(url(1)),null);assert.ok(Date.now()-start<500);
});
test('F003 probe results expire rather than keeping a dead URL dead forever',async()=>{
 let now=0,status=404,calls=0;const loader=P.createKbPoolLoader({now:()=>now,probeCacheMs:10,readRows:async()=>[row(1)],probeUrl:async()=>{calls++;return status;}});
 assert.equal((await loader.loadPool()).postings.length,0);status=200;now=11;assert.equal((await loader.loadPool()).postings.length,1);assert.equal(calls,2);
});
test('F003 Edge and worker composition roots both bind the actual probe',()=>{
 for(const name of ['supabase/functions/agent-chat/handler-career.ts','workers/career-browser/production-sources.cjs']){
  const src=fs.readFileSync(path.join(__dirname,'..',name),'utf8');assert.match(src,/probeUrl:\s*(?:typeof d\.probeUrl[^\n]*|CareerPool\.createFetchProbe\()/,name);
 }
});
test('F003 worker production source removes dead links before returning discovery candidates',async()=>{
 const {createProductionSources}=require('../workers/career-browser/production-sources.cjs');
 const called=[],sources=createProductionSources({transport:{readRows:async()=>[row(1),row(2)]},fetchImpl:async(u,o)=>{assert.equal(o.method,'HEAD');called.push(u);return{status:u===url(1)?404:200};}});
 assert.deepEqual((await sources.postingsFor('synthetic-owner')).map(p=>p.job_id),['2']);assert.deepEqual(called.sort(),[url(1),url(2)].sort());
});
if(require('node:vm').SourceTextModule)test('F003 actual staged Edge discovery checks and excludes a dead posting with mock-only fetch',async()=>{
 const P=require('../packages/domain/122-career-profile.js'),U='11111111-1111-4111-8111-111111111111',T='22222222-2222-4222-8222-222222222222';
 const profile=P.createProfile({basics:{name:'Synthetic Student',location:'Chicago, IL'},preferences:{roles:['software engineering intern'],locations:['Chicago']}});
 const db={options:{},account:{},messages:[],state:{career:{v:1,scope:{userId:U},stores:{profile}}}},called=[];
 const rows=[row(1),row(2)].map((r,i)=>({...r,title:'Software Engineering Intern',company:i?'AliveCo':'DeadCo',location:'Chicago, IL',posted_at:new Date().toISOString()}));
 const client={auth:{getUser:async()=>({data:{user:{id:U}}})},rpc:(name,args)=>require('./helpers/career-persistence-fake.cjs')(db,U,T,name,args),from(table){
  const get=()=>Promise.resolve({data:table==='agent_threads'?{id:T,user_id:U}:table==='career_kb_postings'?rows:[],error:null});
  const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},ilike(){return q;},range(){return q;},in(){return q;},is(){return q;},gte(){return q;},maybeSingle:get,single:get,insert:get,upsert:get,then:(a,b)=>get().then(a,b)};return q;
 }};
 const app=await require('./helpers/career-staged-entry.cjs')(path.resolve(__dirname,'..'),client,{fetch:async(u,o)=>{assert.equal(o.method,'HEAD');assert.equal(o.credentials,'omit');called.push(u);return{status:u===url(1)?410:200};}});
 try{const r=await app.request(T,'Find me software engineering internships in Chicago','f003-staged');assert.equal(r.status,200);assert.ok(called.includes(url(1))&&called.includes(url(2)));assert.doesNotMatch(r.body.reply,/DeadCo/);assert.match(r.body.reply,/AliveCo/);}finally{app.close();}
});
