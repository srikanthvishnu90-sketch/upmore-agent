"use strict";
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
const fixtureFile=path.join(__dirname,'fixtures/portal-fixture-server.cjs'),packet=require('./fixtures/apply-profile.json');
let api,base,child,root,resume;const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const form=extra=>`<!doctype html><h1>SYNTHETIC TEST FORM</h1><form method="post" action="/never-submit"><label for="name">Full name</label><input id="name" name="name" required><label for="email">Email</label><input id="email" name="email" required><label for="resume">Resume</label><input id="resume" name="resume" type="file" required><label for="work">Are you authorized to work in the US?</label><select id="work" name="work_authorization" required><option value="">Select</option><option value="y">Yes</option><option value="n">No</option></select>${extra||''}<button type="submit">Submit application</button></form>`;
before(async()=>{
 const check=spawnSync(process.execPath,['-e',`const a=require(${JSON.stringify(fixtureFile)});if(typeof a.loadSnapshots!=='function'||typeof a.probeSnapshot!=='function')throw Error('SNAPSHOT_HARNESS_MISSING');`],{encoding:'utf8',timeout:4000});assert.equal(check.status,0,check.stderr||check.error?.message);
 api=require(fixtureFile);root=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-fill-harness-'));resume=path.join(root,packet.resume.filename);fs.writeFileSync(resume,packet.resume.text);
 const cases=[{id:'synthetic-ready',synthetic:true,html:form(),fields:[]},{id:'synthetic-unknown',synthetic:true,html:form('<label for="unknown">Favorite programming language</label><input id="unknown" name="unknown" required>'),fields:[]},{id:'synthetic-offsite',synthetic:true,html:'<script>location.href="https://jobs.lever.co/never-requested/id"</script>',fields:[]}];
 const inventory=api.loadSnapshots(process.env.UPMORE_FORM_SNAPSHOT_ROOT||path.join(__dirname,'fixtures/forms'));
 const config=path.join(root,'local-bundle.json');fs.writeFileSync(config,JSON.stringify([...cases,...inventory.snapshots]));child=spawn(process.execPath,[fixtureFile,'--snapshot-bundle',config],{stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('fixture server startup')),10000);child.stdout.on('data',b=>{out+=b;const m=out.match(/FIXTURE_PORT (\d+)/);if(m){clearTimeout(timer);resolve('http://localhost:'+m[1]);}});child.once('exit',()=>{clearTimeout(timer);reject(Error('fixture server exited'));});});
});
after(()=>{if(child)child.kill();if(api)api.shutdownProbe();if(root)fs.rmSync(root,{recursive:true,force:true});});
const expectedFields=['name','email','resume','work_authorization'].map(name=>({name,required:true}));
function probe(id,over={}){return api.probeSnapshot({url:base+'/snapshots/'+id,snapshot:{id,synthetic:true,fields:expectedFields},packet,resumePath:resume,evidenceDir:root,...over});}
test('009b-3 absent captures report NOT_RUN, never synthetic real-source coverage',()=>{
 const r=api.loadSnapshots(path.join(root,'missing'));assert.equal(r.real_count,0);assert.equal(r.status,'NOT_RUN');assert.equal(r.expected,24);
});
test('009b-3 real inventory rejects traversal, modified HTML and synthetic provenance',()=>{
 const dir=path.join(root,'inventory');fs.mkdirSync(dir);const manifest={forms:[{id:'../escape',status:'captured',family:'greenhouse',source_url:'https://job-boards.greenhouse.io/acme/jobs/1'}]};const save=()=>fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));save();assert.throws(()=>api.loadSnapshots(dir),/CAPTURE_ID/);
 manifest.forms[0].id='case';save();fs.writeFileSync(path.join(dir,'case.html'),form());const meta={source_url:manifest.forms[0].source_url,captured_at:'2026-10-19T00:00:00Z',http_status:200,sha256:'0'.repeat(64),fields:[]};fs.writeFileSync(path.join(dir,'case.json'),JSON.stringify(meta));assert.throws(()=>api.loadSnapshots(dir),/CAPTURE_HASH/);
 meta.sha256=digest(form());meta.synthetic=true;fs.writeFileSync(path.join(dir,'case.json'),JSON.stringify(meta));assert.throws(()=>api.loadSnapshots(dir),/SYNTHETIC_CAPTURE/);
});
test('009b-3 149/150 fill and read back all required fields and the exact resume, without submit',async()=>{
 const r=probe('synthetic-ready');console.log('SYNTHETIC_CONTROL '+JSON.stringify(r));assert.equal(r.status,'prepared');assert.equal(r.expected_raw,4);assert.equal(r.detected_raw,4);assert.equal(r.required,4);assert.equal(r.bound,4);assert.equal(r.read_back,4);assert.equal(r.ratio,1);assert.equal(r.resume_verified,true);assert.equal(r.submit_calls,0);assert.equal((await(await fetch(base+'/__snapshot_stats')).json()).mutations,0);
});
test('009b-3 unknown required questions stop before review and name the question',()=>{
 const r=probe('synthetic-unknown');console.log('SYNTHETIC_CONTROL '+JSON.stringify(r));assert.equal(r.status,'awaiting_user');assert.ok(r.unknown.includes('Favorite programming language'));assert.equal(r.review_calls,0);assert.equal(r.submit_calls,0);
});
test('009b-3 a mismatched resume cannot pass the harness',()=>{
 const bad=path.join(root,'wrong-resume.txt');fs.writeFileSync(bad,'DIFFERENT SYNTHETIC BYTES');assert.throws(()=>probe('synthetic-ready',{resumePath:bad}),e=>e.code==='RESUME_SHA_MISMATCH');
});
test('009b-3 required source controls missing from the DOM remain visibly unmatched',()=>{
 const r=probe('synthetic-ready',{snapshot:{id:'synthetic-ready',synthetic:true,fields:[...expectedFields,{name:'missing',required:true}]}});assert.equal(r.expected_raw,5);assert.equal(r.detected_raw,4);
});
test('009b-3 saved pages cannot navigate synthetic facts outside the fixture origin',()=>{
 const r=probe('synthetic-offsite');assert.notEqual(r.status,'prepared');assert.equal(r.submit_calls,0);
});
test('009b-3 fixture server refuses mutation and traversal',async()=>{
 assert.equal((await fetch(base+'/snapshots/synthetic-ready',{method:'POST',body:'TEST'})).status,405);assert.equal((await fetch(base+'/snapshots/%2e%2e%2fprivate')).status,404);assert.match((await fetch(base+'/snapshots/synthetic-ready')).headers.get('content-security-policy'),/connect-src 'none'/);
});
test('009b-3 real capture inventory stays separate from synthetic controls',()=>{
 const inventory=api.loadSnapshots(process.env.UPMORE_FORM_SNAPSHOT_ROOT||path.join(__dirname,'fixtures/forms'));console.log('REAL_CAPTURE_ACCEPTANCE '+JSON.stringify({status:inventory.status,real_forms:inventory.real_count,required:24,synthetic_counted_as_real:0}));
 if(process.argv.includes('--require-real'))assert.equal(inventory.real_count,24,'strict real acceptance requires 24 genuine captures');
 const counts={};for(const s of inventory.snapshots){counts[s.family]=(counts[s.family]||0)+1;const r=api.probeSnapshot({url:base+'/snapshots/'+s.id,snapshot:s,packet,resumePath:resume,evidenceDir:root});console.log('REAL_FORM '+JSON.stringify(r));assert.equal(r.status,'prepared');assert.equal(r.expected_raw,r.detected_raw);assert.equal(r.bound,r.required);assert.ok(r.ratio>=0.95);assert.equal(r.resume_verified,true);assert.equal(r.submit_calls,0);}
 if(inventory.real_count===24)for(const f of ['greenhouse','lever','ashby','smartrecruiters'])assert.equal(counts[f],6);
});
