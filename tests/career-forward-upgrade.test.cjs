'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const b=require('../scripts/career/forward-upgrade/build.cjs');
test('SQL splitter preserves quoted bodies, escaping, comments and top-level statement ordering',()=>{
 const sql="/* outer /* nested; */ still; */ create function x()returns text as $body$select ';';$body$ language sql;\n-- a;\nselect E'it\\'s;ok', 'x'';y', \"semi;\";";
 const parts=b.splitSQL(sql);assert.equal(parts.length,2);assert.equal(parts.join(''),sql);
 assert.equal(b.splitSQL('select 1; -- trailing;').length,1);
 for(const bad of ["select 'unfinished",'/* unfinished','$body$unfinished'])assert.throws(()=>b.splitSQL(bad),/UNTERMINATED/);
});
test('immutable eighteen-unit inventory skips original authority replay and validates all source hashes',()=>{
 const i=b.inventory();assert.equal(i.units.length,18);assert.equal(i.units.filter(u=>u.skip).length,3);
 assert.equal(i.scope.relations.length,21);assert.equal(i.scope.functions.length,101);
 const result=b.render();assert.equal(result.manifest.defaultRefusesWithoutCatalog,true);
 assert.equal(result.manifest.orderedForwardUnits.length,15);assert.equal(result.manifest.operations.length,202);
 assert.match(result.sql,/UPGRADE_REVIEWED_CATALOG_REQUIRED/);assert.match(result.sql,/UPGRADE_BASELINE_CATALOG_MISMATCH/);
 assert.match(result.sql,/UPGRADE_INSTALLED_CATALOG_DRIFT/);assert.match(result.sql,/UPGRADE_WORKER_QUIESCENCE_REQUIRED/);
 assert.equal(result.sql.includes('create table public.career_task_intents_v1 ('),false);
 assert.equal(result.sql.includes('drop policy if exists agent_model_call_owner'),false);
 assert.equal(b.hash(result.sql),result.manifest.sqlSha256);
 assert.deepEqual(result,b.render());
 assert.throws(()=>b.render({catalog:{unknown:'cannot whitelist arbitrary metadata'}}),/UNSUPPORTED_BASELINE_METADATA/);
});
test('metadata collector is fresh, read-only and excludes row content and function bodies',()=>{
 const actual=fs.readFileSync(path.join(b.ROOT,'scripts/career/forward-upgrade/collect-catalog.sql'),'utf8');
 const expected='-- READ ONLY METADATA. No rows, credentials, function bodies or policy expressions are returned.\nBEGIN READ ONLY;\nSET LOCAL search_path=pg_catalog,public;\nSET LOCAL statement_timeout=\'15s\';\n'+b.catalogSelect(b.inventory().scope)+';\nCOMMIT;\n';
 assert.equal(actual,expected);assert.match(actual,/bodySha/);assert.match(actual,/policies/);assert.match(actual,/overloads/);
 assert.doesNotMatch(actual,/pg_authid|rolpassword|select \*|jsonb_build_object\('body',/i);
});
test('CLI refuses unknown flags, duplicate arguments and preexisting deliverables',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-forward-pure-')),script=path.join(b.ROOT,'scripts/career/forward-upgrade/build.cjs');
 try{
  for(const args of [['--out',path.join(dir,'x.sql'),'--approve','yes'],['--out',path.join(dir,'x.sql'),'--out',path.join(dir,'y.sql')],['--out']])assert.notEqual(spawnSync(process.execPath,[script,...args]).status,0);
  const out=path.join(dir,'candidate.sql');assert.equal(spawnSync(process.execPath,[script,'--out',out]).status,0);
  const bytes=fs.readFileSync(out);assert.notEqual(spawnSync(process.execPath,[script,'--out',out]).status,0);assert.deepEqual(fs.readFileSync(out),bytes);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('changing a manifest-bound SQL unit refuses before compiling',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-forward-hashes-'));
 try{
  const manifest='docs/career/mass-applications-20261017/release-source-manifest.json';
  for(const file of [manifest,...b.inventory().units.map(u=>u.path)]){const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(b.ROOT,file),dest);}
  const changed=b.inventory().units[3].path;fs.appendFileSync(path.join(root,changed),'\n-- changed source\n');
  assert.throws(()=>b.inventory(root),/SOURCE_HASH_CHANGED/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
