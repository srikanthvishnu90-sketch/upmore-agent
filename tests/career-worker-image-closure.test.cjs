'use strict';
// Execute the proposal's COPY graph into a local scratch filesystem. This is
// source-image closure proof, not an image build, browser or deployment claim.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('Dockerfile COPY staging loads application/batch/native dependencies and both controlled preflight source graphs',t=>{
 const repo=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-image-copy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const docker=fs.readFileSync(path.join(repo,'workers/career-browser/deploy/Dockerfile.proposal'),'utf8');let copies=0;
 for(const line of docker.split('\n').filter(l=>/^COPY\s/.test(l))){
  const parts=line.trim().split(/\s+/).slice(1),dest=parts.pop();assert.ok(dest.startsWith('/app/'));assert.ok(parts.length);assert.ok(parts.every(p=>!p.includes('..')&&!/[\[\]*?]/.test(p)));
  const target=path.join(root,dest.slice('/app/'.length));
  for(const source of parts){const from=path.join(repo,source),directory=fs.statSync(from).isDirectory();fs.mkdirSync(directory?path.dirname(target):target,{recursive:true});fs.cpSync(from,directory?target:path.join(target,path.basename(source)),{recursive:true});copies++;}
 }
 assert.ok(copies>=6);assert.match(docker,/USER 1000:1000/);assert.doesNotMatch(docker.split('\n').filter(l=>!l.startsWith('#')).join('\n'),/^RUN\s|--no-sandbox|--disable-setuid-sandbox|chmod|chown/m);
 const script=`const p=require('node:path'),root=process.argv[1];for(const f of ['workers/career-browser/run.cjs','workers/career-browser/batch-context.cjs','workers/career-browser/greenhouse-native.cjs','packages/domain/121-career-jobs.js','packages/domain/122-career-profile.js','packages/domain/132-career-apply.js','packages/domain/148-career-render.js','packages/domain/151-career-alert-watch.js','tests/fixtures/greenhouse-native/equipment.cjs','tests/fixtures/greenhouse-native/manifest.cjs'])require(p.join(root,f));const fs=require('node:fs');for(const f of ['tests/career-owned-worker-browser.test.cjs','tests/career-greenhouse-native-browser.test.cjs','tests/fixtures/greenhouse-native/server.cjs','tests/fixtures/greenhouse-native/form.html'])if(!fs.statSync(p.join(root,f)).isFile())throw Error('Missing '+f);console.log('COPY_GRAPH_LOADED_WITHOUT_BROWSER_OR_NETWORK');`;
 assert.equal(execFileSync(process.execPath,['-e',script,root],{encoding:'utf8'}).trim(),'COPY_GRAPH_LOADED_WITHOUT_BROWSER_OR_NETWORK');
});
