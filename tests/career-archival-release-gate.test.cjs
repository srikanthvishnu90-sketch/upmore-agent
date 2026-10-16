'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),script=path.join(root,'scripts/career/critical-repairs/archive-gate.cjs');
test('missing archival assets block the release command; inventory cannot certify completion',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-empty-archives-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const env={...process.env,UPMORE_CAREER_ARCHIVE_ROOT:directory};
 const inventory=spawnSync(process.execPath,[script,'--inventory'],{env,encoding:'utf8'});assert.equal(inventory.status,0);const i=JSON.parse(inventory.stdout.trim());assert.equal(i.status,'NOT_RUN');assert.equal(i.archiveRequirementSatisfied,false);assert.equal(i.generatedHistoricalRecords,0);assert.ok(i.missing.length>=7);
 const release=spawnSync(process.execPath,[script,'--require-complete'],{env,encoding:'utf8'});assert.equal(release.status,1);assert.match(release.stderr,/Release remains blocked/);assert.deepEqual(fs.readdirSync(directory),[]);
});
test('original archival validations remain committed with their recorded hashes',()=>{
 const m=require('../docs/career/critical-repairs/ci-baseline/archive-preservation.json');assert.equal(m.generatedHistoricalRecords,0);assert.equal(m.archives.length,7);
 for(const x of m.archives)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,x.archive))).digest('hex'),x.archivedSha256,x.archive);
 const deploy=fs.readFileSync(path.join(root,'scripts/launch/go-live.sh'),'utf8');assert.ok(deploy.indexOf('archive-gate.cjs --require-complete')<deploy.indexOf('say "1. migrations'));assert.match(deploy,/archive-gate\.cjs --require-complete/);
});
