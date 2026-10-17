'use strict';
// Consume A's actual frozen files. No B-authored positive shared-schema fixture.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{stripTypeScriptTypes}=require('node:module');
const C=require('../../../packages/career-interview-journey/adapters/context.js');
const root=path.resolve(__dirname,'../../..'),canonicalRoot=path.join(root,'packages/career-contracts');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function ownedPath(file){const absolute=path.resolve(root,file);assert.ok(absolute.startsWith(canonicalRoot+path.sep),'canonical inputs must be A-owned packages/career-contracts files');if(fs.existsSync(absolute))assert.ok(fs.realpathSync(absolute).startsWith(fs.realpathSync(canonicalRoot)+path.sep),'canonical input symlink escaped A package');return absolute;}
function run(options={}){
  const paths={schema:options.schema||'packages/career-contracts/journey-contract-v1.schema.json',types:'packages/career-contracts/journey-contract-v1.ts',freeze:'packages/career-contracts/fixtures/journey-contract-v1/freeze.json',valid:options.fixtures||'packages/career-contracts/fixtures/journey-contract-v1/valid.json',invalid:'packages/career-contracts/fixtures/journey-contract-v1/invalid.json'};
  Object.values(paths).forEach(ownedPath);
  if(options.producer_ref)assert.match(options.producer_ref,/^[a-f0-9]{40}$/,'use an exact fetched A producer commit');
  const bytes={},missing=[];
  for(const [kind,file]of Object.entries(paths)){
    try{bytes[kind]=options.producer_ref?execFileSync('git',['show',options.producer_ref+':'+file],{cwd:root,stdio:['ignore','pipe','pipe']}):fs.readFileSync(ownedPath(file));}catch(_){missing.push(file);}
  }
  if(missing.length)return {status:'BLOCKED',reason:'Canonical A artifacts are not in this checkout/ref; compose A or supply its actual fetched producer-ref',missing,canonical_cases_executed:0,actual_entry:'NOT_RUN'};
  return inspect(bytes,paths,options.producer_ref||null);
}
async function inspect(bytes,paths,producerRef){
  const schema=JSON.parse(bytes.schema),freeze=JSON.parse(bytes.freeze),valid=JSON.parse(bytes.valid),invalid=JSON.parse(bytes.invalid);
  assert.equal(digest(bytes.schema),freeze.schemaSha256,'A schema freeze hash mismatch');
  assert.equal(digest(bytes.valid),freeze.fixtureSha256['valid.json'],'A positive fixture freeze hash mismatch');
  assert.equal(digest(bytes.invalid),freeze.fixtureSha256['invalid.json'],'A negative fixture freeze hash mismatch');
  assert.ok(Array.isArray(valid)&&Array.isArray(invalid),'use A producer fixture arrays, not a B fixture envelope');
  const types=bytes.types.toString('utf8');assert.ok(!/^\s*import\s/m.test(types),'canonical runtime imports require an explicitly composed loader');
  const runtime=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(types,{mode:'transform'})).toString('base64'));
  assert.deepEqual(runtime.JOURNEY_CONTRACT_SCHEMA,schema,'A runtime/schema definitions diverged');
  const Ajv=schema.$schema?.includes('2020-12')?require('ajv/dist/2020'):require('ajv');const validator=new Ajv({allErrors:true,strict:true,coerceTypes:false,useDefaults:false,removeAdditional:false});require('ajv-formats')(validator);validator.addSchema(schema);
  const compiled=new Map();const check=(type,value)=>{assert.ok(Object.hasOwn(schema.$defs,type),'A fixture refers to undefined canonical type');if(!compiled.has(type))compiled.set(type,validator.compile({$ref:schema.$id+'#/$defs/'+type}));const fn=compiled.get(type);return {ok:fn(value),errors:fn.errors||[]};};
  const canonical=[],consumer=[];
  for(const [negative,examples]of [[false,valid],[true,invalid]])for(const [index,example]of examples.entries()){
    const structural=check(example.type,example.value),native=runtime.validateJourneyContractV1(example.type,example.value);
    canonical.push({id:example.name||example.type+'-'+index,type:example.type,expected:negative?'REJECT':'ACCEPT',structural_ok:structural.ok,native_ok:native.ok,pass:negative?!native.ok:structural.ok&&native.ok,native_errors:native.errors});
    if(!negative&&example.type==='CareerContextSnapshotV1'){
      const input=runtime.freezeJourneySnapshotV1(example.value),before=JSON.stringify(input);let error=null;
      try{C.validate(input);}catch(e){error=e.message;}
      assert.equal(JSON.stringify(input),before,'B mutated A producer context');consumer.push({id:'B-consumes-'+index,type:example.type,status:error?'FAIL':'PASS',error,input_sha256:digest(JSON.stringify(example.value))});
    }
  }
  const canonicalOk=canonical.every(c=>c.pass),consumerOk=consumer.length>0&&consumer.every(c=>c.status==='PASS');
  return {status:!canonicalOk||!consumerOk?'FAIL':'BLOCKED',producer_ref:producerRef,artifact_sha256:Object.fromEntries(Object.entries(bytes).map(([k,v])=>[paths[k],digest(v)])),A_fixture_validation:{pass:canonical.filter(c=>c.pass).length,total:canonical.length,valid_examples:valid.length,invalid_examples:invalid.length,checks:canonical},B_context_consumption:{pass:consumer.filter(c=>c.status==='PASS').length,total:consumer.length,checks:consumer},canonical_cases_executed:canonical.length,B_canonical_transitions_executed:0,remaining_gate:'Explicit versioned DTO/action/event/receipt adapter and genuine A producer journey cases are required before registration.',no_B_fixture_substitution:true,provider_calls:0,quality:'NOT_RUN',actual_entry:'NOT_RUN'};
}
if(require.main===module){const args=process.argv.slice(2),value=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};Promise.resolve().then(()=>run({schema:value('--schema'),fixtures:value('--fixtures'),producer_ref:value('--producer-ref')})).then(result=>{console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='PASS'?0:result.status==='BLOCKED'?2:1;}).catch(e=>{console.error(JSON.stringify({status:'BLOCKED',reason:e.message,canonical_cases_executed:0}));process.exitCode=2;});}
module.exports={run,ownedPath};
