'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'packages/career-contracts'),fixtures=path.join(dir,'fixtures/journey-contract-v1');
const read=n=>JSON.parse(fs.readFileSync(path.join(fixtures,n),'utf8')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
let modulePromise;
async function implementation(){const p=path.join(dir,'journey-contract-v1.ts');assert.ok(fs.existsSync(p),'Shared journey runtime validation is not implemented');return modulePromise||=(import('data:text/javascript,'+encodeURIComponent(require('node:module').stripTypeScriptTypes(fs.readFileSync(p,'utf8')))));}
test('frozen schema and synthetic examples retain their pre-implementation bytes',()=>{const f=read('freeze.json');assert.equal(sha(path.join(dir,'journey-contract-v1.schema.json')),f.schemaSha256);for(const[n,h]of Object.entries(f.fixtureSha256))assert.equal(sha(path.join(fixtures,n)),h,n);});
for(const [i,c]of read('valid.json').entries())test('shared v1 accepts frozen valid '+i+' '+c.type,async()=>{const m=await implementation();assert.deepEqual(m.validateJourneyContractV1(c.type,c.value),{ok:true,errors:[]});});
for(const c of read('invalid.json'))test('shared v1 refuses '+c.name,async()=>{const m=await implementation(),r=m.validateJourneyContractV1(c.type,c.value);assert.equal(r.ok,false);assert.ok(r.errors.length>0);});
test('snapshot returned to the pure reducer is deeply immutable and does not mutate canonical input',async()=>{const m=await implementation(),v=read('valid.json')[0].value,snapshot=m.freezeJourneySnapshotV1(v);assert.notEqual(snapshot,v);assert.throws(()=>{snapshot.facts[0].value='Forged experience';},TypeError);assert.equal(v.facts[0].value,'Built a synthetic class calculator.');});
test('runtime and published JSON Schema describe the same contract bytes',async()=>{const m=await implementation();assert.deepEqual(m.JOURNEY_CONTRACT_SCHEMA,JSON.parse(fs.readFileSync(path.join(dir,'journey-contract-v1.schema.json'),'utf8')));});
