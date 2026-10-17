'use strict';
// Source-only deployment bundle. No packages, credentials, resumes, browser
// binaries, .git directory or operator configuration are copied into it.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
function build(output){
 if(!path.isAbsolute(output)||fs.existsSync(output))throw Error('new absolute output path required');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-worker-source-'));
 try{
  const files=fs.readdirSync(path.join(ROOT,'workers/career-browser')).filter(f=>f.endsWith('.cjs')).map(f=>'workers/career-browser/'+f).concat(['scripts/career/build-owned-worker.cjs','packages/domain/148-career-render.js','packages/domain/149-career-portal-apply.js','packages/domain/150-career-portal-browser.js','scripts/career/portal-browser-helper.cjs','supabase/functions/_shared/career_research_policy.js','tests/career-owned-worker-browser.test.cjs','tests/career-greenhouse-native-browser.test.cjs','tests/fixtures/greenhouse-native/equipment.cjs','tests/fixtures/greenhouse-native/manifest.cjs','tests/fixtures/greenhouse-native/server.cjs','tests/fixtures/greenhouse-native/form.html','tests/fixtures/owned-worker-authority.cjs','tests/fixtures/owned-portal.cjs']).sort();
  if(execFileSync('git',['status','--porcelain','--',...files],{cwd:ROOT,encoding:'utf8'}).trim())throw Error('Commit the reviewed source allowlist before building');
  const manifest={version:'upmore_owned_worker_source/v1',codeSha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),verification:'SOURCE_ONLY_NOT_DEPLOYED',files:[]};
  for(const file of files){const bytes=fs.readFileSync(path.join(ROOT,file));const target=path.join(temp,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);manifest.files.push({path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
  fs.writeFileSync(path.join(temp,'worker-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  execFileSync('tar',['--format=gnu','--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-czf',output,'-C',temp,'.']);
  return {output,sha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),files:manifest.files.length,codeSha:manifest.codeSha};
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(require.main===module)console.log(JSON.stringify(build(process.argv[2]),null,2));
module.exports={build};
