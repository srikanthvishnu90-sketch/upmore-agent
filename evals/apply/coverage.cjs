"use strict";
// Saved public questions -> planning coverage. No network, browser or submit path.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {planBatch,classifyField,normLabel,greenhouseQuestions}=require('../../supabase/functions/_shared/career_apply.ts');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),families=['greenhouse','lever','ashby','smartrecruiters'];
const SOURCED=Symbol('verified saved source');
const cmp=(a,b)=>a<b?-1:a>b?1:0,canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort(cmp).map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const commonFacts=Object.entries({first_name:'Alex',last_name:'Testcase',full_name:'Alex Testcase',email:'alex.testcase@example.test',phone:require('../../tests/fixtures/apply-profile.json').profile.phone,location:'Chicago, IL',resume:'SYNTHETIC_APPROVED_RESUME',linkedin:'https://example.test/profile',github:'https://example.test/code',website:'https://example.test',work_authorization:'Yes',sponsorship:'No',start_date:'2027-06-01',salary_expectation:'$80,000',how_heard:'Company website','label:country':'United States','label:school':'TEST University','label:degree':"Bachelor's",'label:field of study':'Computer Science','label:graduation year':'2028','label:gpa':'3.7','label:years of experience':'1','label:current company':'TEST Systems','label:city':'Chicago','label:state':'Illinois'}).map(([key,value])=>({key,value,factId:'SYNTHETIC-COMMON:'+key,confirmed:true}));
commonFacts.find(a=>a.key==='resume').value=sha(Buffer.from(require('../../tests/fixtures/apply-profile.json').resume.text));
function records(input,owner){const out={};for(const [k,a]of Object.entries(input||{})){if(a.user_id&&a.user_id!==owner)throw Error('FACT_OWNER_MISMATCH');if(a.confirmed===true&&typeof a.value==='string'&&typeof a.factId==='string'&&a.factId)out[k]={value:a.value,factId:a.factId};}return out;}
function scorePosting(p,profile,{clock=()=>performance.now()}={}){
 if(profile.synthetic!==true||!/^TEST[-_]/.test(profile.user_id))throw Error('SYNTHETIC_BENCHMARK_PROFILE_REQUIRED');
 const answers=records(profile.answers,profile.user_id),saved=records(profile.saved,profile.user_id);
 if(!Array.isArray(p.fields)||!p.fields.some(f=>f.required))return {status:'QUESTIONS_UNAVAILABLE',required:null,answered:null,ratio:null,missing:[],elapsed_ms:null};
 if(p.fields.some(f=>!f.name||!f.label||typeof f.required!=='boolean'||!Array.isArray(f.options))||new Set(p.fields.map(f=>f.name)).size!==p.fields.length)throw Error('QUESTION_SCHEMA_INVALID');
 const fields=p.fields.filter(f=>f.required),missing=[];let answered=0;const start=clock();
 // Independent question scoring preserves partial coverage and avoids daily caps.
 for(const f of fields){if(/select|radio/.test(f.type)&&!f.options.length){missing.push(f.label);continue;}const r=planBatch({userId:profile.user_id,postings:[{job_id:p.id,company:p.id,title:'',fields:[f]}],answers,saved,log:[],now:0});if(r.ready[0]?.fields.some(a=>a.name===f.name))answered++;else missing.push(f.label);}
 return {status:'MEASURED',required:fields.length,answered,ratio:answered/fields.length,missing,elapsed_ms:Math.max(0,Math.round((clock()-start)*1e6)/1e6)};
}
const factKey=f=>{const k=classifyField(f.label,f.type);return k==='unknown'||k==='eeo'?'label:'+normLabel(f.label):k;};
function benchmark(postings,profile,{catalog=commonFacts,clock,binding='CONTROLLED_INPUT'}={}){
 const frequency=new Map(),eligible=catalog.filter(a=>a.confirmed===true&&a.key&&typeof a.value==='string'&&a.factId),keys=new Set(eligible.map(a=>a.key));
 const sourced=postings.filter(p=>p[SOURCED]&&!p.synthetic&&p.evidence!=='PUBLIC_DEMO'),rankSource=sourced.length?sourced:postings.filter(p=>!p[SOURCED]||p.synthetic);
 for(const p of rankSource)for(const key of new Set((p.fields||[]).filter(f=>f.required).map(factKey)))if(keys.has(key))frequency.set(key,(frequency.get(key)||0)+1);
 const selected=eligible.slice().sort((a,b)=>(frequency.get(b.key)||0)-(frequency.get(a.key)||0)||cmp(a.key,b.key)).slice(0,20),common={user_id:profile.user_id,synthetic:true,answers:{},saved:{}};
 for(const a of selected)(a.key.startsWith('label:')?common.saved:common.answers)[a.key.replace(/^label:/,'')]={value:a.value,factId:a.factId,confirmed:true};
 const rows=postings.map(p=>({id:p.id,family:p.family,source_url:p.source_url,evidence:!p[SOURCED]||p.synthetic?'SYNTHETIC_CONTROL':p.evidence,reason:p.reason||null,profiles:{base:scorePosting(p,profile,{clock}),common20:scorePosting(p,common,{clock})}}));
 function summary(rows){const measured=rows.filter(r=>r.profiles.base.status==='MEASURED'),profiles={};
  for(const name of ['base','common20']){const required=measured.reduce((n,r)=>n+r.profiles[name].required,0),answered=measured.reduce((n,r)=>n+r.profiles[name].answered,0);profiles[name]={required,answered,ratio:required?answered/required:null};}
  function missing(name){const by=new Map();for(const r of measured)for(const label of new Set(r.profiles[name].missing)){const k=normLabel(label);if(!by.has(k))by.set(k,{label,postings:[]});by.get(k).postings.push({id:r.id,source_url:r.source_url});}return [...by.values()].sort((a,b)=>b.postings.length-a.postings.length||cmp(a.label,b.label));}
  return {postings:rows.length,measured_postings:measured.length,families:Object.fromEntries(families.map(f=>[f,rows.filter(r=>r.family===f).length])),profiles,missing:missing('base'),missing_common20:missing('common20')};
 }
 const real=summary(rows.filter(r=>!['SYNTHETIC_CONTROL','PUBLIC_DEMO'].includes(r.evidence))),synthetic=summary(rows.filter(r=>r.evidence==='SYNTHETIC_CONTROL'));real.target_postings=100;
 const complete=real.postings===100&&real.measured_postings===100&&families.every(f=>real.families[f]>=20&&real.families[f]<=30);
 return {version:1,binding,status:complete?'COMPLETE':real.measured_postings?'PARTIAL':'NOT_RUN',scope:'Saved required-question planning only; not application readiness or live outcomes',common_fact_keys:frequency.size?selected.map(a=>a.key):[],real,synthetic,public_demo_postings:rows.filter(r=>r.evidence==='PUBLIC_DEMO').length,rows};
}
// Built-in HTML parser only: scripts are never executed and no resource is fetched.
function fieldsFromHTML(html){
 const python=[
 "import sys,json",
 "from html.parser import HTMLParser",
 "class P(HTMLParser):",
 " def __init__(self): super().__init__(convert_charrefs=True); self.fields=[]; self.labels=[]; self.label=None; self.legend=None; self.group=None; self.control=None; self.option=None; self.in_script=0; self.forms=0; self.optgroup=False; self.form=None; self.form_ids={}",
 " def handle_starttag(self,t,a):",
 "  a=dict(a)",
 "  if t in ('script','style'): self.in_script+=1",
 "  if self.in_script: return",
 "  if t=='form': self.forms+=1; self.form=self.forms; self.form_ids[a.get('id')]=self.form",
 "  if t=='fieldset': self.group={'text':''}",
 "  if t=='legend': self.legend=self.group",
 "  if t=='label': self.label={'for':a.get('for'),'text':''}; self.labels.append(self.label)",
 "  if t in ('input','select','textarea') and a.get('type','').lower() not in ('hidden','submit','button','reset') and 'disabled' not in a:",
 "   f={'name':a.get('name') or a.get('id',''),'id':a.get('id'),'type':a.get('type',t).lower(),'required':'required' in a or a.get('aria-required')=='true','options':[],'label_ref':self.label,'group_ref':self.group,'aria':a.get('aria-label',''),'value':a.get('value'),'form':self.form,'form_attr':a.get('form')}; self.fields.append(f)",
 "   if t in ('select','textarea'): self.control=f",
 "  if t=='optgroup': self.optgroup='disabled' in a",
 "  if t=='option' and self.control is not None: self.option={'value':a.get('value'),'label':'','disabled':'disabled' in a or self.optgroup}",
 " def handle_data(self,s):",
 "  if self.in_script: return",
 "  if self.option is not None: self.option['label']+=s",
 "  elif self.control is None and self.label is not None: self.label['text']+=s",
 "  if self.legend is not None: self.legend['text']+=s",
 " def handle_endtag(self,t):",
 "  if t in ('script','style'): self.in_script=max(0,self.in_script-1); return",
 "  if self.in_script: return",
 "  if t=='option' and self.option is not None: self.option['label']=' '.join(self.option['label'].split()); self.option['value']=self.option['label'] if self.option['value'] is None else self.option['value']; self.control['options']+=[] if self.option.pop('disabled') else [self.option]; self.option=None",
 "  if t=='optgroup': self.optgroup=False",
 "  if t in ('select','textarea'): self.control=None",
 "  if t=='label': self.label=None",
 "  if t=='legend': self.legend=None",
 "  if t=='fieldset': self.group=None",
 "  if t=='form': self.form=None",
 "p=P(); p.feed(sys.stdin.read()); out=[]; groups={}",
 "for f in p.fields: f['form']=p.form_ids.get(f['form_attr'],f['form']) if f['form_attr'] else f['form']",
 "application_forms={f['form'] for f in p.fields if f['type']=='file' and ('resume' in (f['name']+' '+str(f['id'])+' '+str(f['aria'])+' '+str((f['label_ref'] or {}).get('text',''))).lower() or 'cv' in (f['name']+' '+str(f['aria'])).lower().split())}",
 "for f in p.fields if p.forms else []:",
 " if f['form'] is None or (application_forms and f['form'] not in application_forms): continue",
 " label=next((x['text'] for x in p.labels if x['for'] and x['for']==f['id']),None) or (f['label_ref'] or {}).get('text') or f['aria'] or f['name']; f['required']=f['required'] or label.rstrip().endswith(('*','✱')); label=' '.join(label.split()).rstrip('*✱ ').strip()",
 " if f['type'] in ('radio','checkbox') and f['group_ref'] and f['name']:",
 "  if f['name'] not in groups: groups[f['name']]={'name':f['name'],'label':' '.join(f['group_ref']['text'].split()),'type':f['type'],'required':False,'options':[]}; out.append(groups[f['name']])",
 "  g=groups[f['name']]; g['required']=g['required'] or f['required']; g['options'].append({'label':label,'value':f['value'] or 'on'}); continue",
 " out.append({'name':f['name'],'label':label,'type':f['type'],'required':f['required'],'options':f['options']})",
 "print(json.dumps(out))"
 ].join('\n');
 return JSON.parse(execFileSync('python3',['-c',python],{input:html,encoding:'utf8',maxBuffer:4*1024*1024}));
}
function loadPostings(file=path.join(__dirname,'postings.json'),base=root){
 const data=JSON.parse(fs.readFileSync(file,'utf8')),seen=new Set(),urls=new Set(),identities=new Set(),sources={};
 const prefixes=['packages/career-data/fixtures/gauntlet/jobs/public-snapshots','tests/fixtures/forms'];let references;
 const inside=p=>fs.realpathSync(p).startsWith(fs.realpathSync(base)+path.sep);
 function reference(ref){
  if(!Array.isArray(ref?.sha256_bytes)||ref.sha256_bytes.length!==32||ref.sha256_bytes.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('PUBLIC_SOURCE_REFERENCE_INVALID');
  if(!references){references=new Map();for(const dir of prefixes){const at=path.join(base,dir);if(!fs.existsSync(at))continue;for(const name of fs.readdirSync(at).filter(n=>n.endsWith('.json'))){const p=path.join(at,name);if(fs.lstatSync(p).isSymbolicLink()||!inside(p))continue;references.set(sha(fs.readFileSync(p)),dir+'/'+name);}}}
  const digest=Buffer.from(ref.sha256_bytes).toString('hex'),source_path=references.get(digest);if(!source_path)throw Error('PUBLIC_SOURCE_REFERENCE_MISSING');return {source_path,source_sha256:digest};
 }
 const postings=data.postings.map(row=>{
  if(!row.id||seen.has(row.id)||!families.includes(row.family))throw Error('POSTING_ID_OR_FAMILY_INVALID');seen.add(row.id);
  // Content-addressed references reuse existing public source files. Raw ATS ids,
  // URLs and hex digests are not duplicated into the privacy-swept eval corpus.
  if(row.source_ref)row={...row,...reference(row.source_ref)};
  if(!/^(packages\/career-data\/fixtures\/gauntlet\/jobs\/public-snapshots|tests\/fixtures\/forms)\/[a-zA-Z0-9_-]+\.json$/.test(row.source_path))throw Error('PUBLIC_SOURCE_PATH_REQUIRED');
  const p=path.join(base,row.source_path);if(fs.lstatSync(p).isSymbolicLink()||!inside(p))throw Error('PUBLIC_SOURCE_SYMLINK');const bytes=fs.readFileSync(p);
  if(sha(bytes)!==row.source_sha256)throw Error('PUBLIC_SOURCE_HASH_MISMATCH');sources[row.source_path]=sha(bytes);
  // A saved ATS response may link to the employer's own careers domain.
  // These are provenance links only; the benchmark never requests a URL.
  const source=JSON.parse(bytes);
  if(row.source_url&&typeof row.source_url==='object'){const key=row.source_url.from_snapshot;if(!['source_url','applyUrl','absolute_url','postingUrl','hostedUrl','jobUrl'].includes(key))throw Error('PUBLIC_SOURCE_URL_REFERENCE');row={...row,source_url:source[key]};}
  const url=new URL(row.source_url);
  if(url.protocol!=='https:'||url.username||url.password||/^[\d.]+$|:|(^|\.)localhost$|\.(test|invalid|local|internal)$/.test(url.hostname))throw Error('PUBLIC_SOURCE_URL_INVALID');
  const actual=source.source_url||source.applyUrl||source.absolute_url||source.postingUrl||source.hostedUrl||source.jobUrl;if(actual!==row.source_url)throw Error('PUBLIC_SOURCE_URL_BINDING');
  const canonicalURL=new URL(url);canonicalURL.hash='';for(const key of [...canonicalURL.searchParams.keys()])if(/^(utm_|gh_src$|oga$|source$|referrer$)/i.test(key))canonicalURL.searchParams.delete(key);
  const identity=row.family+':'+(source.id||source.uuid||source.questions?.id||canonicalURL.href);if(urls.has(canonicalURL.href)||identities.has(identity))throw Error('DUPLICATE_PUBLIC_POSTING');urls.add(canonicalURL.href);identities.add(identity);
  let fields=null,reason=row.family==='greenhouse'?'public_questions_not_saved':'application_snapshot_not_saved';
  if(Array.isArray(source.questions)&&source.questions.length){fields=greenhouseQuestions(source);reason=null;}
  else if(row.family==='greenhouse'&&source.questions_status===200&&source.questions?.questions){fields=greenhouseQuestions(source.questions);reason=null;}
  else if(source.sha256&&source.http_status===200&&source.source_url&&row.family!=='greenhouse'){
   const html=p.replace(/\.json$/,'.html');if(fs.lstatSync(html).isSymbolicLink()||!inside(html))throw Error('PUBLIC_SOURCE_SYMLINK');const body=fs.readFileSync(html);if(sha(body)!==source.sha256)throw Error('FORM_HTML_HASH_MISMATCH');sources[row.source_path.replace(/\.json$/,'.html')]=sha(body);fields=fieldsFromHTML(body.toString('utf8'));reason=fields.length?null:'no_static_application_controls';
  }
  return {...row,[SOURCED]:true,synthetic:row.synthetic===true||source.synthetic===true,fields,reason,evidence:row.evidence==='PUBLIC_DEMO'||url.pathname.includes('/leverdemo/')?'PUBLIC_DEMO':'SAVED_PUBLIC_SOURCE'};
 });
 return {postings,binding:sha(canonical({data:sha(fs.readFileSync(file)),sources,implementation:sha(fs.readFileSync(__filename)),profile:sha(fs.readFileSync(path.join(base,'tests/fixtures/apply-profile.json')))}))};
}
function baseProfile(){const p=require('../../tests/fixtures/apply-profile.json'),answers={};if(p.synthetic!==true||!/^TEST[-_]/.test(p.user_id))throw Error('SYNTHETIC_BENCHMARK_PROFILE_REQUIRED');for(const [key,value]of Object.entries({full_name:p.profile.name,email:p.profile.email,phone:p.profile.phone,location:p.profile.location,resume:sha(Buffer.from(p.resume.text))}))if(typeof value==='string')answers[key]={value,factId:'SYNTHETIC-BASE:'+key,confirmed:true};return {user_id:p.user_id,synthetic:true,answers:{...answers,...p.profile.answers},saved:{}};}
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
const link=r=>r.source_url?.startsWith('https:')?'['+escape(r.id)+']('+r.source_url.replace(/[()]/g,c=>encodeURIComponent(c))+')':escape(r.id)+' (SYNTHETIC)';
function render(r){
 const fraction=p=>p.ratio===null?'NOT RUN':p.answered+'/'+p.required+' ('+(100*p.ratio).toFixed(1)+'%)';
 const lines=['# Saved-question Application Coverage','','Status: **'+r.status+'**. Real question sets measured: **'+r.real.measured_postings+'/100**. Real saved posting sources: '+r.real.postings+'. Public demos excluded: '+r.public_demo_postings+'.','',''+r.scope+'. All profiles are explicitly synthetic; no owner facts or submissions. Static HTML analysis does not execute dynamic questions. Existing posting snapshots do not establish current availability.','','| Profile | Required questions answered |','|---|---|','| Base synthetic | '+fraction(r.real.profiles.base)+' |','| At most 20 most common supplied synthetic facts | '+fraction(r.real.profiles.common20)+' |','','## Postings','','| Saved source | Evidence | Base | Common facts | Planning ms (base/common) |','|---|---|---|---|---|'];
 for(const row of r.rows)lines.push('| '+link(row)+' | '+escape(row.reason||row.evidence)+' | '+fraction(row.profiles.base)+' | '+fraction(row.profiles.common20)+' | '+(row.profiles.base.elapsed_ms??'—')+'/'+(row.profiles.common20.elapsed_ms??'—')+' |');
 lines.push('','## Missing required questions','');for(const m of r.real.missing)lines.push('- '+escape(m.label)+': '+m.postings.map(link).join(', '));if(!r.real.missing.length)lines.push('NOT RUN: no measured real question set; no missing-question frequency is inferred.');
 lines.push('','Inputs and implementation are hash-bound. Run node evals/apply/coverage.cjs --check to detect stale or manually edited output. --require-real requires 100 measured real postings across all four families.','','<!-- apply-coverage-v1:'+Buffer.from(JSON.stringify(r)).toString('base64')+' -->','');return lines.join('\n');
}
function savedReport(text){const m=text.match(/<!-- apply-coverage-v1:([A-Za-z0-9+/=]+) -->/);if(!m)throw Error('SAVED_REPORT_MISSING');return JSON.parse(Buffer.from(m[1],'base64').toString());}
function normalized(r){const c=JSON.parse(JSON.stringify(r));for(const row of c.rows)for(const p of Object.values(row.profiles))delete p.elapsed_ms;return c;}
function checkReport(text,expected){try{const saved=savedReport(text);return text===render(saved)&&saved.rows.every(r=>Object.values(r.profiles).every(p=>p.elapsed_ms===null||Number.isFinite(p.elapsed_ms)&&p.elapsed_ms>=0))&&canonical(normalized(saved))===canonical(normalized(expected));}catch{return false;}}
function requireReal(r){if(r.status!=='COMPLETE')throw Error('REAL_COVERAGE_NOT_READY: '+r.real.measured_postings+'/100 measured; '+r.real.postings+' saved real-source postings');}
function main(args){if(args.some(a=>!['--check','--require-real'].includes(a)))throw Error('USAGE: coverage.cjs [--check] [--require-real]');const input=loadPostings(),r=benchmark(input.postings,baseProfile(),{binding:input.binding}),file=path.join(root,'docs/apply/coverage.md');if(args.includes('--require-real'))requireReal(r);if(args.includes('--check')){if(!fs.existsSync(file)||!checkReport(fs.readFileSync(file,'utf8'),r))throw Error('COVERAGE_REPORT_STALE');}else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,render(r));}console.log(JSON.stringify({status:r.status,real_sources:r.real.postings,measured:r.real.measured_postings,target:100,synthetic_counted_as_real:0,network_calls:0,submissions:0}));}
if(require.main===module)try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={scorePosting,benchmark,fieldsFromHTML,commonFacts,loadPostings,render,savedReport,checkReport,requireReal};
