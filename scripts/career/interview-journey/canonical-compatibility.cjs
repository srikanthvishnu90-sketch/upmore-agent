'use strict';
// Validate actual A producer fixtures against actual A schema, then validate B's
// outputs with that same schema. No B-authored positive fixture or shadow schema.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const J=require('../../../packages/domain/interview-journey/index.js');
const C=require('../../../packages/career-interview-journey/adapters/context.js');
const root=path.resolve(__dirname,'../../..'),canonicalRoot=path.join(root,'packages/career-contracts');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function ownedPath(file){const absolute=path.resolve(root,file);assert.ok(absolute.startsWith(canonicalRoot+path.sep),'canonical inputs must be A-owned packages/career-contracts files');if(fs.existsSync(absolute))assert.ok(fs.realpathSync(absolute).startsWith(fs.realpathSync(canonicalRoot)+path.sep),'canonical input symlink escaped A package');return absolute;}
function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
function run(options={}){
  const schemaPath=ownedPath(options.schema||'packages/career-contracts/journey-contract-v1.schema.json');
  const fixturesPath=ownedPath(options.fixtures||'packages/career-contracts/journey-contract-v1.fixtures.json');
  const missing=[schemaPath,fixturesPath].filter(p=>!fs.existsSync(p));
  if(missing.length)return {status:'BLOCKED',reason:'A canonical schema/producer fixtures absent',missing:missing.map(p=>path.relative(root,p)),canonical_cases_executed:0,actual_entry:'NOT_RUN'};
  const schemaBytes=fs.readFileSync(schemaPath),fixturesBytes=fs.readFileSync(fixturesPath),schema=JSON.parse(schemaBytes),fixtures=JSON.parse(fixturesBytes);
  assert.equal(fixtures.canonical_schema_sha256,digest(schemaBytes),'A fixture bundle must bind the exact canonical schema bytes');
  assert.ok(Array.isArray(fixtures.cases)&&fixtures.cases.length>0,'A must supply producer cases');
  for(const kind of ['snapshot','transition','action'])assert.match(fixtures.pointers?.[kind]||'',/^#(?:\/(?:\$defs|definitions)\/[A-Za-z0-9_/-]+)?$/,'A must identify each canonical definition pointer');
  const Ajv=schema.$schema?.includes('2020-12')?require('ajv/dist/2020'):require('ajv');
  const validator=new Ajv({allErrors:true,strict:true,coerceTypes:false,useDefaults:false,removeAdditional:false,validateFormats:false});
  const id=schema.$id||'urn:upmore:a-journey-contract:'+digest(schemaBytes);validator.addSchema({...schema,$id:id});
  const compiled=Object.fromEntries(Object.entries(fixtures.pointers).map(([kind,pointer])=>[kind,validator.compile({$ref:id.replace(/#$/,'')+pointer})]));
  const results=[];
  for(const example of fixtures.cases){
    assert.ok(typeof example.id==='string'&&typeof example.family==='string','producer case identity required');
    let state=example.state??null;const steps=example.steps||[{snapshot:example.snapshot,event:example.event}];let expectedRejections=0;
    try{
      for(const step of steps){
        const snapshot=JSON.parse(JSON.stringify(step.snapshot)),event=JSON.parse(JSON.stringify(step.event));
        assert.ok(compiled.snapshot(snapshot),JSON.stringify({boundary:'A producer snapshot',errors:compiled.snapshot.errors}));
        const before=JSON.stringify({snapshot,state,event});freeze(snapshot);freeze(state);freeze(event);
        let transition;
        if(step.expect_consumer_rejection){assert.throws(()=>J.planInterviewTurn({snapshot,state,event}));expectedRejections++;continue;}
        C.validate(snapshot);transition=J.planInterviewTurn({snapshot,state,event});
        assert.equal(JSON.stringify({snapshot,state,event}),before,'consumer mutated a producer input');
        assert.ok(compiled.transition(transition),JSON.stringify({boundary:'B transition vs A schema',errors:compiled.transition.errors}));
        for(const action of transition.proposed_actions)assert.ok(compiled.action(action),JSON.stringify({boundary:'B action vs A schema',errors:compiled.action.errors}));
        assert.deepEqual(transition.expected_binding,C.binding(snapshot,state?.revision||0),'transition CAS binding mismatch');state=transition.next_state;
      }
      results.push({id:example.id,family:example.family,status:'PASS',steps:steps.length,expected_rejections:expectedRejections});
    }catch(e){results.push({id:example.id,family:example.family,status:'FAIL',error:e.message});}
  }
  const required=['start','paused_role_change','abstention','reasoning_failed','reasoning_unknown','artifact_readback'];
  const missingFamilies=required.filter(f=>!results.some(r=>r.family===f));
  return {status:results.some(r=>r.status==='FAIL')?'FAIL':missingFamilies.length?'BLOCKED':'PASS',canonical_schema_sha256:digest(schemaBytes),A_producer_fixtures_sha256:digest(fixturesBytes),canonical_cases_executed:results.length,missing_producer_families:missingFamilies,results,scope:'canonical consumer compatibility only; actual entry, paid providers and semantic quality NOT_RUN'};
}
if(require.main===module){try{const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};const result=run({schema:value('--schema'),fixtures:value('--fixtures')});console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='PASS'?0:result.status==='BLOCKED'?2:1;}catch(e){console.error(JSON.stringify({status:'BLOCKED',reason:e.message,canonical_cases_executed:0}));process.exitCode=2;}}
module.exports={run,ownedPath};
