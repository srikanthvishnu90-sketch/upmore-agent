const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {publicURL,analyzeHTML,createCapture}=require('../scripts/career/capture-form.cjs');
test('009b-2 captures only public ATS GET targets and refuses lookalike hosts or credentials',()=>{
 for(const u of ['https://jobs.lever.co/test/id/apply','https://job-boards.greenhouse.io/test/jobs/1','https://jobs.ashbyhq.com/test/id/application','https://jobs.smartrecruiters.com/test/1'])assert.ok(publicURL(u));
 for(const u of ['http://jobs.lever.co/test','https://jobs.lever.co.evil.test/a','https://user:password@jobs.lever.co/test','https://www.linkedin.com/jobs/1','https://indeed.com/1'])assert.throws(()=>publicURL(u));
});
test('009b-2 field metadata comes from actual controls, not script strings or comments',()=>{
 const a=analyzeHTML('<script>const fake="<form><input required type=file>";</script><!--<input required>--><form><label for="email">Email</label><input id="email" name="email" required><input name="resume" type="file" aria-required="true"></form>');
 assert.equal(a.forms,1);assert.equal(a.resume_inputs,1);assert.equal(a.fields.filter(f=>f.required).length,2);assert.equal(a.fields[0].label,'Email');
});
test('009b-2 concurrent capture processes cannot bypass the per-URL request journal',()=>{
 const os=require('node:os'),root=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-capture-test-')),c=createCapture(root);
 try{assert.throws(()=>createCapture(root),e=>e.code==='EEXIST');}finally{c.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('009b-2 twenty-four captured real forms have provenance, resume controls and required fields',()=>{
 const root=path.join(__dirname,'fixtures/forms'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const captures=manifest.forms.filter(f=>f.status==='captured');assert.equal(captures.length,24,'24 actual captured forms required; blocked pages are not fixtures');
 for(const family of ['greenhouse','lever','ashby','smartrecruiters'])assert.equal(captures.filter(f=>f.family===family).length,6,family);
 const urls=new Set();for(const f of captures){assert.ok(!urls.has(f.source_url));urls.add(f.source_url);publicURL(f.source_url);
  const meta=JSON.parse(fs.readFileSync(path.join(root,f.id+'.json'),'utf8')),html=fs.readFileSync(path.join(root,f.id+'.html'),'utf8');
  assert.equal(meta.source_url,f.source_url);assert.ok(Number.isFinite(Date.parse(meta.captured_at)));assert.equal(meta.http_status,200);
  assert.equal(crypto.createHash('sha256').update(html).digest('hex'),meta.sha256);const a=analyzeHTML(html);
  assert.ok(a.forms>0,f.id+' has an actual form');assert.ok(a.resume_inputs>0,f.id+' mounts resume');assert.ok(a.fields.some(x=>x.required),f.id+' requires a field');
  assert.deepEqual(a.fields.filter(x=>x.required).map(x=>x.name),meta.fields.filter(x=>x.required).map(x=>x.name));
 }
});
