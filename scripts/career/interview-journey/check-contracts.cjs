'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const allowed=['packages/domain/interview-journey/','packages/career-interview-journey/','tests/career-interview-journey/','evals/career-interview-journey/','scripts/career/interview-journey/','docs/career/interview-journey/'];
function check(){
  const changed=spawnSync('git',['diff','--name-only','123943e1c12cee3459155562add892fa996872c7'],{cwd:root,encoding:'utf8'});assert.equal(changed.status,0,changed.stderr);
  for(const file of changed.stdout.trim().split('\n').filter(Boolean))assert.ok(allowed.some(prefix=>file.startsWith(prefix)),'A-owned path changed: '+file);
  const untracked=spawnSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'});assert.equal(untracked.status,0);
  for(const file of untracked.stdout.trim().split('\n').filter(Boolean))assert.ok(allowed.some(prefix=>file.startsWith(prefix)),'unexpected untracked path: '+file);
  const protocol=JSON.parse(fs.readFileSync(path.join(root,'evals/career-interview-journey/protocol.json'),'utf8'));assert.equal(protocol.required_episodes,24);assert.equal(protocol.protected_holdout_content,'evaluator_owned_absent');
  const freeze=JSON.parse(fs.readFileSync(path.join(root,'docs/career/interview-journey/evidence/B0-freeze.json'),'utf8'));const crypto=require('node:crypto');
  for(const [file,digest]of Object.entries(freeze.sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),digest,'B0 freeze changed: '+file);
  const reserve=JSON.parse(fs.readFileSync(path.join(root,'docs/career/interview-journey/evidence/B2-reserve-freeze.json'),'utf8'));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,reserve.file))).digest('hex'),reserve.sha256,'reserve fixture freeze changed');
  const files=fs.readdirSync(path.join(root,'tests/career-interview-journey')).filter(f=>f.endsWith('.test.cjs')).map(f=>'tests/career-interview-journey/'+f);
  const run=spawnSync(process.execPath,['--test',...files],{cwd:root,encoding:'utf8'});process.stdout.write(run.stdout);process.stderr.write(run.stderr);assert.equal(run.status,0,'offline contracts failed');
  const canonical=['journey-contract-v1.ts','journey-contract-v1.schema.json'].map(f=>path.join(root,'packages/career-contracts',f));
  const status={offline_contracts:'PASS',ownership_scope:'PASS',frozen_inputs:'PASS',shared_contract_compatibility:canonical.every(f=>fs.existsSync(f))?'PRESENT_REVIEW_REQUIRED':'BLOCKED_A_CONTRACT_MISSING',actual_entry:'NOT_RUN',quality:'NOT_RUN',provider_calls:0};
  console.log(JSON.stringify(status,null,2));return status;
}
if(require.main===module)check();module.exports={check};
