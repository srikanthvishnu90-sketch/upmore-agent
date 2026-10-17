'use strict';
// Synthetic candidate records and actual local bytes only. No applicant data,
// network request, browser, production database or employer submission.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {hash}=require('../workers/career-browser/store.cjs');
const {createOwnedEquipmentResolver}=require('../workers/career-browser/equipment.cjs');
function sample(t,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-owned-equipment-')),cache=path.join(root,'private-bytes');let resolver;
 t.after(()=>{resolver?.close();fs.rmSync(root,{recursive:true,force:true});});
 const bytes=Buffer.from('SYNTHETIC TEST RESUME\nEvidence: built a Python service.\n'),account={exists:true,version:4,epoch:2,paused:false};
 const scope={accountVersion:4,privacyEpoch:2,postingKey:'local:test-role',resumeSha256:hash(bytes)};
 const confirmation={confirmed:true,userId:'user-a',ref:'synthetic-confirmation-1',at:'2026-10-15T12:00:00Z'};
 const fact=(key,value,extra={})=>({kind:'fact',userId:'user-a',privacyEpoch:2,key,value,confirmation:{...confirmation},...extra});
 const records={version:'career_owned_equipment/v1',userId:'user-a',accountVersion:4,privacyEpoch:2,artifact:{id:'owned-resume-1',userId:'user-a',privacyEpoch:2,versionId:'resume-v1',filename:'resume.txt',contentType:'text/plain',bytes:bytes.length,sha256:hash(bytes),confirmation:{...confirmation}},facts:[fact('name','Synthetic Test'),fact('email','synthetic@example.test')]};
 let reads=0;const load=()=>records,read=()=>{reads++;return {userId:'user-a',artifactId:'owned-resume-1',versionId:'resume-v1',bytes};};
 resolver=createOwnedEquipmentResolver({root:cache,authority:{current:()=>account},loadOwnedRecords:options.load||load,readOwnedBytes:options.read||read,...options});
 return {root,cache,bytes,account,scope,records,fact,confirmation,resolver,resolve:()=>resolver.resolveEquipment('user-a','owned-resume-1',scope),reads:()=>reads};
}
test('confirmed owned bytes materialize privately and release without changing their hash',t=>{
 const f=sample(t),e=f.resolve();assert.deepEqual(fs.readFileSync(e.resumePath),f.bytes);assert.equal(e.profile.resume.sha256,hash(f.bytes));assert.equal(e.profile.email,'synthetic@example.test');assert.equal(fs.statSync(e.resumePath).mode&0o777,0o600);assert.match(e.profile._provenanceSha256,/^[a-f0-9]{64}$/);assert.equal(f.reads(),1);e.release();assert.deepEqual(fs.readdirSync(f.cache),[]);e.release();
});
for(const [name,change,code]of [
 ['foreign record owner',f=>f.records.userId='other','EQUIPMENT_OWNER_MISMATCH'],
 ['stale record version',f=>f.records.accountVersion--,'EQUIPMENT_OWNER_MISMATCH'],
 ['foreign artifact owner',f=>f.records.artifact.userId='other','RESUME_CONFIRMATION_REQUIRED'],
 ['unconfirmed resume version',f=>f.records.artifact.confirmation.confirmed=false,'RESUME_CONFIRMATION_REQUIRED'],
 ['future confirmation',f=>f.records.artifact.confirmation.at='2099-01-01T00:00:00Z','RESUME_CONFIRMATION_REQUIRED'],
 ['changed declared bytes',f=>f.records.artifact.bytes++,'RESUME_SHA_MISMATCH'],
 ['unsafe upload filename',f=>f.records.artifact.filename='../resume.txt','RESUME_ARTIFACT_INVALID'],
 ['paused owner',f=>f.account.paused=true,'STALE_EQUIPMENT_AUTHORITY'],
 ['revoked epoch',f=>f.account.epoch++,'STALE_EQUIPMENT_AUTHORITY']
])test('equipment refuses '+name+' before creating an upload copy',t=>{const f=sample(t);change(f);assert.throws(f.resolve,{code});assert.deepEqual(fs.readdirSync(f.cache),[]);});
test('unconfirmed, foreign and stale facts are omitted rather than inferred',t=>{
 const f=sample(t);f.records.facts=[f.fact('email','unconfirmed@example.test',{confirmation:{...f.confirmation,confirmed:false}}),f.fact('country','US',{userId:'other'}),f.fact('phone','0000000000',{privacyEpoch:1})];const e=f.resolve();assert.equal(e.profile.email,undefined);assert.equal(e.profile.country,undefined);assert.equal(e.profile.phone,undefined);assert.equal(e.profile.name,undefined);assert.deepEqual(e.attestations,{});
});
test('answers and attestations bind the posting and exact observed wording',t=>{
 const f=sample(t),wording=hash('SYNTHETIC certification wording');f.records.facts.push(f.fact('sponsor','No',{kind:'answer',postingKey:'other:job'}),f.fact('sponsor','Yes',{kind:'answer',postingKey:'local:test-role'}),f.fact('certify',true,{kind:'attestation',postingKey:'local:test-role',wordingSha256:wording}));
 let e=f.resolve();assert.equal(e.profile.answers.sponsor.value,'Yes');assert.deepEqual(e.attestations,{});e.release();f.scope.attestationBindings={certify:wording};e=f.resolve();assert.deepEqual(e.attestations,{certify:{explicit:true,value:true}});
});
test('conflicting confirmed facts and unsupported secret-like fields fail closed',t=>{
 const f=sample(t);f.records.facts.push(f.fact('email','different@example.test'));assert.throws(f.resolve,{code:'CONFIRMED_FACT_CONFLICT'});f.records.facts=[f.fact('password','DUMMY-NOT-A-CREDENTIAL')];assert.throws(f.resolve,{code:'UNSUPPORTED_CONFIRMED_FIELD'});f.records.facts=[f.fact('__proto__','bad',{kind:'answer',postingKey:'local:test-role'})];assert.throws(f.resolve,{code:'CONFIRMED_FACT_INVALID'});
});
test('byte ownership, immutable version and actual digest are independently checked',t=>{
 for(const patch of [{userId:'other'},{versionId:'other'},{bytes:Buffer.from('changed')}]){
  const f=sample(t,{read:()=>({userId:'user-a',artifactId:'owned-resume-1',versionId:'resume-v1',bytes:Buffer.from('SYNTHETIC TEST RESUME\nEvidence: built a Python service.\n'),...patch})});assert.throws(f.resolve);assert.deepEqual(fs.readdirSync(f.cache),[]);
 }
});
test('erase or correction during byte retrieval prevents materialization',t=>{
 let f;f=sample(t,{read:()=>{f.account.epoch++;return {userId:'user-a',artifactId:'owned-resume-1',versionId:'resume-v1',bytes:f.bytes};}});assert.throws(f.resolve,{code:'STALE_EQUIPMENT_AUTHORITY'});assert.deepEqual(fs.readdirSync(f.cache),[]);
});
test('bounded copy TTL and explicit close remove resume bytes without a backend call',t=>{
 let callback;const f=sample(t,{schedule:(fn,ms)=>{assert.equal(ms,900000);callback=fn;return null;}}),e=f.resolve();f.account.exists=false;callback();assert.equal(fs.existsSync(e.resumePath),false);assert.deepEqual(fs.readdirSync(f.cache),[]);
});
test('real worker uses fresh scoped equipment for preparation and approval and releases both copies',t=>{
 const f=sample(t);let fixture,reads=0;const resolver=createOwnedEquipmentResolver({root:path.join(f.root,'worker-copies'),authority:{current:user=>fixture.authority.current(user)},loadOwnedRecords(user,id,scope){reads++;return {...f.records,userId:user,accountVersion:scope.accountVersion,privacyEpoch:scope.privacyEpoch,artifact:{...f.records.artifact,userId:user,privacyEpoch:scope.privacyEpoch},facts:f.records.facts.map(x=>({...x,userId:user,privacyEpoch:scope.privacyEpoch}))};},readOwnedBytes:()=>({userId:'user-a',artifactId:'owned-resume-1',versionId:'resume-v1',bytes:f.bytes})});
 t.after(()=>resolver.close());fixture=require('./fixtures/owned-worker-fixture.cjs').fixture(path.join(f.root,'worker'),{resolveEquipment:resolver.resolveEquipment});const q=fixture.worker.receive('user-a',fixture.input),r=fixture.worker.prepare('user-a',q.id);assert.equal(r.status,'review_ready');assert.deepEqual(fs.readdirSync(path.join(f.root,'worker-copies')),[]);const done=fixture.worker.approve('user-a',q.id,fixture.approval(r));assert.equal(done.status,'completed');assert.equal(reads,2);assert.equal(fixture.count().clicks,1);assert.deepEqual(fs.readdirSync(path.join(f.root,'worker-copies')),[]);
});
for(const [type,method,filename]of [['application/pdf','renderPdf','resume.pdf'],['application/vnd.openxmlformats-officedocument.wordprocessingml.document','renderDocx','resume.docx']])test('real locally rendered '+filename+' bytes survive owned resolution exactly',t=>{
 const f=sample(t),render=require('../packages/domain/148-career-render.js'),doc=render[method]({header:{name:'SYNTHETIC TEST',email:'synthetic@example.test'},sections:[{heading:'Experience',lines:[{text:'SYNTHETIC LOCAL FIXTURE ONLY',type:'bullet'}]}]});assert.equal(doc.ok,true);
 const bytes=doc.buffer;Object.assign(f.records.artifact,{filename,contentType:type,bytes:bytes.length,sha256:hash(bytes)});f.scope.resumeSha256=hash(bytes);
 const resolver=createOwnedEquipmentResolver({root:path.join(f.root,'rendered-bytes'),authority:{current:()=>f.account},loadOwnedRecords:()=>f.records,readOwnedBytes:()=>({userId:'user-a',artifactId:'owned-resume-1',versionId:'resume-v1',bytes})});t.after(()=>resolver.close());const e=resolver.resolveEquipment('user-a','owned-resume-1',f.scope);assert.deepEqual(fs.readFileSync(e.resumePath),bytes);e.release();
});
test('worker validation failure releases equipment without opening a page',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'MOCK-equip-failure-cleanup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let f,released=0;
 f=require('./fixtures/owned-worker-fixture.cjs').fixture(root,{resolveEquipment:()=>({userId:'user-a',accountVersion:f.authority.current('user-a').version,privacyEpoch:0,profile:{...f.profile,resume:{sha256:'a'.repeat(64)}},resumePath:f.resumePath,release:()=>released++})});
 const q=f.worker.receive('user-a',f.input),result=f.worker.prepare('user-a',q.id);assert.equal(result.blocker,'RESUME_SHA_MISMATCH');assert.equal(released,1);assert.equal(f.count().opens,0);assert.equal(f.count().clicks,0);
});
