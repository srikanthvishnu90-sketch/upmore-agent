"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const C=require('../evals/apply/coverage.cjs');
const field=(name,label,options=[])=>({name,label,required:true,type:options.length?'select':'text',options});
const profile={user_id:'TEST-COVERAGE',synthetic:true,answers:{email:{value:'test@example.test',factId:'TEST-EMAIL',confirmed:true},work_authorization:{value:'No',factId:'TEST-WORK',confirmed:true}},saved:{}};
const posting=(id,fields)=>({id,family:'greenhouse',synthetic:true,source_url:'synthetic://'+id,fields});
test('009b-6 partial-ready postings measure individual required fields without inventing unknown answers',()=>{
 const r=C.scorePosting(posting('mixed',[field('email','Email'),field('why','Why do you want this employer?')]),profile);assert.equal(r.required,2);assert.equal(r.answered,1);assert.equal(r.ratio,0.5);assert.deepEqual(r.missing,['Why do you want this employer?']);
});
test('009b-6 100 independent postings do not accidentally measure the daily application cap',()=>{
 const r=C.benchmark(Array.from({length:100},(_,i)=>posting('synthetic-'+i,[field('email','Email')])),profile,{catalog:C.commonFacts,clock:()=>0});assert.equal(r.synthetic.profiles.base.required,100);assert.equal(r.synthetic.profiles.base.answered,100);assert.equal(r.real.measured_postings,0);assert.equal(r.real.profiles.base.ratio,null);assert.equal(r.status,'NOT_RUN');assert.throws(()=>C.requireReal(r),/REAL_COVERAGE_NOT_READY/);
});
test('009b-6 unconfirmed, foreign-owner and impossible option values never count as answered',()=>{
 const p=posting('choice',[field('work','Are you authorized to work in the US?',[{label:'Yes',value:'y'}])]);assert.equal(C.scorePosting(p,profile).answered,0);
 const a=JSON.parse(JSON.stringify(profile));a.answers.email.confirmed=false;assert.equal(C.scorePosting(posting('a',[field('email','Email')]),a).answered,0);a.answers.email.confirmed=true;a.answers.email.user_id='OTHER';assert.throws(()=>C.scorePosting(posting('a',[field('email','Email')]),a),/FACT_OWNER/);
});
test('009b-6 a choice question without captured options cannot become a free-text answer',()=>{
 const r=C.scorePosting(posting('empty-options',[{...field('work','Are you authorized to work in the US?'),type:'select'}]),profile);assert.equal(r.answered,0);assert.equal(r.ratio,0);
});
test('009b-6 missing question frequencies retain posting links and rank descending',()=>{
 const r=C.benchmark([posting('a',[field('why','Why here?')]),posting('b',[field('why','Why here?'),field('other','Unique question?')])],profile,{catalog:[],clock:()=>0});assert.equal(r.synthetic.missing[0].label,'Why here?');assert.equal(r.synthetic.missing[0].postings.length,2);assert.equal(r.synthetic.missing[1].postings.length,1);
});
test('009b-6 common profile selects only 20 explicitly supplied synthetic facts by observed frequency',()=>{
 const catalog=Array.from({length:25},(_,i)=>({key:'label:fact '+i,value:'SYNTHETIC '+i,factId:'TEST-'+i,confirmed:true}));const rows=Array.from({length:4},(_,i)=>posting('rank-'+i,[field('f','Fact 24')]));const r=C.benchmark(rows,profile,{catalog,clock:()=>0});assert.equal(r.common_fact_keys.length,20);assert.equal(r.common_fact_keys[0],'label:fact 24');assert.equal(r.synthetic.profiles.common20.answered,4);
});
test('009b-6 static snapshots preserve required flags, select values, labels and grouped radios',()=>{
 const fields=C.fieldsFromHTML('<form><label for="e">Email</label><input id="e" name="email" required><label>Resume<input name="resume" type="file" required></label><fieldset><legend>Are you authorized to work in the US?</legend><label><input name="work" type="radio" value="y" required>Yes</label><label><input name="work" type="radio" value="n">No</label></fieldset><label for="s">Sponsorship</label><select id="s" name="sponsor" required><option value="">Select</option><option value="no">No</option></select></form>');assert.equal(fields.length,4);assert.equal(fields[0].label,'Email');assert.equal(fields[1].type,'file');assert.equal(fields[2].required,true);assert.deepEqual(fields[2].options,[{label:'Yes',value:'y'},{label:'No',value:'n'}]);assert.equal(fields[3].options[1].value,'no');
});
test('009b-6 required label markers and disabled choices are not mis-scored',()=>{
 const fields=C.fieldsFromHTML('<form><label for="e">Email *</label><input id="e" name="email"><label for="w">Work authorization</label><select id="w" name="work" required><option value="y" disabled>Yes</option><option value="n">No</option></select></form>');assert.equal(fields[0].required,true);assert.deepEqual(fields[1].options,[{label:'No',value:'n'}]);
});
test('009b-6 unrelated newsletter forms do not enter an application denominator',()=>{
 const fields=C.fieldsFromHTML('<form><label>Newsletter email<input name="newsletter" required></label></form><form id="app"><label for="email">Email</label><input id="email" name="email" required><label>Resume<input name="resume" type="file" required></label></form><label for="phone">Phone</label><input form="app" name="phone" id="phone" required>');assert.deepEqual(fields.map(f=>f.name),['email','resume','phone']);
});
test('009b-6 an unproven in-memory row cannot claim real-source coverage even with an ATS URL',()=>{
 const r=C.benchmark([{id:'fake',family:'greenhouse',source_url:'https://job-boards.greenhouse.io/example/jobs/1',synthetic:false,fields:[field('email','Email')]}],profile,{clock:()=>0});assert.equal(r.real.measured_postings,0);assert.equal(r.synthetic.measured_postings,1);
});
test('009b-6 generated reports detect changed inputs and manual edits without timing drift',()=>{
 const rows=[posting('saved',[field('email','Email')])],r=C.benchmark(rows,profile,{catalog:[],clock:()=>1,binding:'source-a'}),text=C.render(r);assert.equal(C.checkReport(text,r),true);assert.equal(C.checkReport(text.replace('Coverage','CHANGED'),r),false);assert.equal(C.checkReport(text,C.benchmark(rows,profile,{catalog:[],clock:()=>4,binding:'source-b'})),false);
});
test('009b-6 saved GH questions and non-GH HTML load with hash proof; marked controls stay synthetic',()=>{
 const os=require('node:os'),crypto=require('node:crypto'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-coverage-source-')),dir=path.join(temp,'tests/fixtures/forms'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(path.join(__dirname,'fixtures/apply-profile.json'),path.join(temp,'tests/fixtures/apply-profile.json'));
 try{const html='<form><label for="email">Email</label><input id="email" name="email" required><label>Resume<input name="resume" type="file" required></label></form>',items=[{id:'synthetic-gh',family:'greenhouse',source_url:'https://job-boards.greenhouse.io/SYNTHETIC/jobs/1',synthetic:true,questions_status:200,questions:{questions:[{label:'Email',required:true,fields:[{name:'email',type:'input_text'}]}]}},{id:'synthetic-lever',family:'lever',source_url:'https://jobs.lever.co/SYNTHETIC/1/apply',synthetic:true,http_status:200,sha256:hash(html)}],rows=[];
  for(const x of items){const file=path.join(dir,x.id+'.json'),bytes=JSON.stringify(x);fs.writeFileSync(file,bytes);rows.push({id:x.id,family:x.family,source_url:x.source_url,source_path:'tests/fixtures/forms/'+x.id+'.json',source_sha256:hash(bytes)});}fs.writeFileSync(path.join(dir,'synthetic-lever.html'),html);const manifest=path.join(temp,'postings.json');fs.writeFileSync(manifest,JSON.stringify({postings:rows}));const input=C.loadPostings(manifest,temp),r=C.benchmark(input.postings,profile,{binding:input.binding});assert.equal(r.real.measured_postings,0);assert.equal(r.synthetic.measured_postings,2);assert.equal(r.synthetic.profiles.base.required,3);assert.equal(r.synthetic.profiles.base.answered,2);
  fs.writeFileSync(manifest,JSON.stringify({postings:[...rows,{...rows[0],id:'duplicate-alias'}]}));assert.throws(()=>C.loadPostings(manifest,temp),/DUPLICATE_PUBLIC_POSTING/);fs.writeFileSync(manifest,JSON.stringify({postings:rows}));
  fs.appendFileSync(path.join(dir,'synthetic-lever.html'),'MODIFIED');assert.throws(()=>C.loadPostings(manifest,temp),/FORM_HTML_HASH/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('009b-6 saved public-source report is current; synthetic controls are never its real coverage',()=>{
 const p=spawnSync(process.execPath,[path.join(__dirname,'../evals/apply/coverage.cjs'),'--check'],{encoding:'utf8'});assert.equal(p.status,0,p.stdout+p.stderr);const report=C.savedReport(fs.readFileSync(path.join(__dirname,'../docs/apply/coverage.md'),'utf8'));assert.equal(report.real.target_postings,100);assert.equal(report.synthetic.postings,0);assert.ok(report.real.profiles.base.ratio===null||report.real.measured_postings>0);
});
