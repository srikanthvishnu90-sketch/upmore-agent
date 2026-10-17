'use strict';
// Read actual A-owned Git blobs at one explicit producer commit. Never fetch,
// rewrite A files, substitute a B context fixture, execute tools or call providers.
const path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{stripTypeScriptTypes}=require('node:module');
const C=require('../../../packages/career-interview-journey/adapters/context.js'),J=require('../../../packages/domain/interview-journey/index.js');
const M=require('../../../packages/career-interview-journey/adapters/reasoning.js'),Pack=require('../../../packages/domain/interview-journey/pack.js');
const root=path.resolve(__dirname,'../../..'),clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const paths={types:'packages/career-contracts/journey-contract-v1.ts',schema:'packages/career-contracts/journey-contract-v1.schema.json',schema_freeze:'packages/career-contracts/fixtures/journey-contract-v1/freeze.json',adapter:'packages/career-contracts/interview-context-compat-v1.ts',fixture:'tests/fixtures/career-critical-repairs/interview-context-v1/snapshot.json',fixture_freeze:'tests/fixtures/career-critical-repairs/interview-context-v1/freeze.json'};
async function run(producerRef){
  assert.match(producerRef||'',/^[a-f0-9]{40}$/,'use an exact fetched A producer commit');assert.ok(vm.SourceTextModule,'use --experimental-vm-modules');
  const bytes=Object.fromEntries(Object.entries(paths).map(([key,file])=>[key,execFileSync('git',['show',producerRef+':'+file],{cwd:root,stdio:['ignore','pipe','pipe']})]));
  const fixture=JSON.parse(bytes.fixture),schema=JSON.parse(bytes.schema);
  assert.equal(hash(bytes.fixture),JSON.parse(bytes.fixture_freeze).snapshot_sha256,'actual A fixture freeze');assert.equal(hash(bytes.schema),JSON.parse(bytes.schema_freeze).schemaSha256,'actual A schema freeze');
  assert.equal(schema.$defs.FactV1.properties.item_version.minimum,0);assert.equal(schema.$defs.SourceV1.properties.item_version.minimum,0);
  const context=vm.createContext({TextEncoder,TextDecoder,URL,crypto:crypto.webcrypto}),modules=new Map();
  const load=key=>{if(modules.has(key))return modules.get(key);assert.ok(['types','adapter'].includes(key));const m=new vm.SourceTextModule(stripTypeScriptTypes(bytes[key].toString('utf8'),{mode:'transform'}),{context,identifier:paths[key]});modules.set(key,m);return m;};
  const entry=load('adapter');await entry.link(id=>{assert.equal(id,'./journey-contract-v1.ts','unexpected A import');return load('types');});await entry.evaluate();
  const A=entry.namespace,V=modules.get('types').namespace;
  assert.deepEqual(clone(V.JOURNEY_CONTRACT_SCHEMA),schema,'A runtime/schema agreement');
  const Ajv=require('ajv/dist/2020'),ajv=new Ajv({allErrors:true,strict:true,coerceTypes:false,useDefaults:false,removeAdditional:false});require('ajv-formats')(ajv);ajv.addSchema(schema);const validate=ajv.compile({$ref:schema.$id+'#/$defs/CareerContextSnapshotV1'});
  const checks=[],projections={};const check=async(name,fn)=>{try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',error:e.message});}};
  async function bind(s){s.binding.context_sha256=await A.interviewContextDigestV1(s);return s;}
  // Cross the VM boundary by exact JSON serialization, as A's own consumer
  // tests do. No field, value or version is normalized during this transfer.
  async function project(s){assert.equal(validate(s),true,JSON.stringify(validate.errors));assert.equal(V.validateJourneyContractV1('CareerContextSnapshotV1',s).ok,true);const before=JSON.stringify(s),r=await A.toInterviewContextV1(s);assert.equal(JSON.stringify(s),before);return clone(r.snapshot);}
  function consume(p,name){
    const before=JSON.stringify(p);C.validate(p);const target=p.facts.find(f=>f.kind==='target'),resume=p.facts.find(f=>f.kind==='resume');
    const t=J.planInterviewTurn({snapshot:p,state:null,event:{id:name,type:'start',at:p.captured_at,journey_id:'synthetic-zero-'+name,target_ref:C.ref(target),resume_ref:C.ref(resume),available_minutes:30,mode:'coaching'}});
    assert.equal(t.next_state.role_support,'early_career_software');assert.equal(t.next_state.target_ref.version,target.version);assert.equal(t.next_state.resume_ref.version,resume.version);
    for(const r of t.next_state.dependencies)assert.equal(C.resolve(p,r).version,r.version);assert.equal(JSON.stringify(p),before);return t.next_state;
  }
  const variants=[['original',()=>{}],['zero-project',s=>{s.facts[0].item_version=0;}],['zero-target',s=>{s.facts.find(f=>f.kind==='target').item_version=0;}],['zero-classification',s=>{s.facts.filter(f=>['target_role_family','target_level'].includes(f.kind)).forEach(f=>{f.item_version=0;});}],['zero-resume',s=>{s.facts.find(f=>f.kind==='resume').item_version=0;}],['zero-source',s=>{s.sources[0].item_version=0;s.facts.find(f=>f.kind==='resume').provenance.revision=0;}],['all-zero',s=>{[...s.facts,...s.sources].forEach(f=>{f.item_version=0;});s.facts.find(f=>f.kind==='resume').provenance.revision=0;}],['maximum-safe',s=>{s.facts[0].item_version=Number.MAX_SAFE_INTEGER;}]];
  for(const [name,edit]of variants)await check(name,async()=>{
    const s=clone(fixture);edit(s);await bind(s);const p=await project(s),state=consume(p,name);
    for(const row of [...s.facts,...s.sources]){const projected=[...p.facts,...p.sources].find(f=>f.id===row.id);assert.ok(projected,'canonical evidence dropped: '+row.id);assert.equal(projected.version,row.item_version,'canonical evidence renumbered');}
    const resume=p.facts.find(f=>f.kind==='resume');assert.equal(resume.source_refs[0].version,s.sources[0].item_version);
    if(name==='all-zero'){
      const submitted=J.planInterviewTurn({snapshot:p,state,event:{id:'zero-answer',type:'submit_answer',at:p.captured_at,text:'I built the synthetic class calculator.',source_refs:[{id:s.facts[0].id,version:0}],scripted:true}}),next=submitted.next_state,attempt=next.attempts[0];
      assert.deepEqual(attempt.source_refs,[{id:s.facts[0].id,version:0}]);assert.equal(submitted.proposed_actions.length,0,'context-only bridge must not enable paid execution');
      const request=M.request(p,next,attempt);assert.equal(request.status,'planned');assert.ok(request.body.evidence.every(e=>e.version===0));assert.ok(Pack.build(p,next).markdown.includes(s.facts[0].id+'@0'));
      assert.throws(()=>C.resolve(p,{id:s.facts[0].id,version:1}),/missing\/stale/);
    }
    projections[name]=clone(p);
  });
  for(const collection of ['facts','sources'])for(const version of [-1,0.5,'0',null,true,Number.MAX_SAFE_INTEGER+1])await check(collection+'-invalid-'+JSON.stringify(version),async()=>{
    const s=clone(fixture);s[collection][0].item_version=version;assert.equal(validate(s),false);assert.equal(V.validateJourneyContractV1('CareerContextSnapshotV1',s).ok,false);await assert.rejects(A.toInterviewContextV1(s),/invalid_canonical/);
    const p=await project(clone(fixture));const changed=clone(p);changed[collection][0].version=version;assert.throws(()=>C.validate(changed),/missing evidence lineage/);
  });
  for(const violation of ['owner','thread','epoch'])await check('zero-'+violation+'-fence',async()=>{
    const s=clone(fixture);s.facts[0].item_version=0;await bind(s);const p=clone(await project(s));
    if(violation==='owner'){p.facts[0].owner_id='00000000-0000-4000-8000-000000000099';s.facts[0].scope.owner_id=p.facts[0].owner_id;}
    if(violation==='thread'){p.facts[0].scope='thread';p.facts[0].thread_id='00000000-0000-4000-8000-000000000099';s.facts[0].scope={kind:'thread',owner_id:s.owner_id,thread_id:p.facts[0].thread_id};}
    if(violation==='epoch')p.facts[0].validity.epoch++;
    assert.throws(()=>C.validate(p),/foreign evidence|old epoch/);assert.throws(()=>C.resolve(p,{id:s.facts[0].id,version:0}),/missing\/stale/);
    if(violation!=='epoch'){assert.equal(V.validateJourneyContractV1('CareerContextSnapshotV1',s).ok,false);await assert.rejects(A.toInterviewContextV1(s),/invalid_canonical/);}
  });
  return {status:checks.every(c=>c.status==='PASS')?'PASS':'FAIL',producer_ref:producerRef,actual_A_blobs_sha256:Object.fromEntries(Object.entries(bytes).map(([k,v])=>[paths[k],hash(v)])),checks,pass:checks.filter(c=>c.status==='PASS').length,total:checks.length,projected_A_snapshots:projections,B_versions_renumbered:false,A_files_modified:false,provider_calls:0,quality:'NOT_RUN',execution_integration:'NOT_RUN'};
}
if(require.main===module){const i=process.argv.indexOf('--producer-ref');run(process.argv[i+1]).then(r=>{console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='PASS'?0:1;}).catch(e=>{console.error(e);process.exitCode=2;});}
module.exports={run};
