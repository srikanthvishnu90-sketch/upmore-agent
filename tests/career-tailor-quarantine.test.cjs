const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const Profile=require('../packages/domain/122-career-profile.js');
const Tailor=require('../packages/domain/123-career-tailor.js');
const JD='Data Analyst\nRequirements: Excel and SQL';
const fact=(id,extra={})=>({id,kind:'experience',title:'Analyst, Synthetic Employer',text:'Built SQL dashboards for 5 synthetic teams.',bullets:['Built SQL dashboards for 5 synthetic teams.'],skills:['SQL'],status:'confirmed',needs_confirmation:false,...extra});
const own=fact('SYN-OWN-SQL');
function profile(facts){return Profile.createProfile({basics:{name:'Synthetic Applicant'},facts});}
function tailored(p){const r=Tailor.tailorResume(p,JD);assert.equal(r.ok,true,JSON.stringify(r.violations));return r;}
const selected=r=>r.resume.selectedFactIds;

test('tailoring quarantine: actual profile and resume path excludes reserved inventions and their derivations without bank mutation',()=>{
 const p=profile([fact('F-033',{source:'agent',text:'Built Excel reporting for 12 synthetic teams.',bullets:['Built Excel reporting for 12 synthetic teams.'],skills:['Excel']}),own,
  fact('SYN-DERIVED',{derivedFrom:['F-033'],text:'Created Excel reporting for 8 synthetic teams.',bullets:['Created Excel reporting for 8 synthetic teams.'],skills:['Excel']}),
  fact('SYN-TRANSITIVE',{derived_from:['SYN-DERIVED'],text:'Built Excel reporting for 6 synthetic teams.',bullets:['Built Excel reporting for 6 synthetic teams.'],skills:['Excel']}),
  fact('SYN-DRAFT',{needs_confirmation:true,status:'draft',text:'Built Excel reporting for 4 synthetic teams.',skills:['Excel']})]);
 const before=JSON.stringify(p),r=tailored(p);assert.deepEqual(selected(r),['SYN-OWN-SQL']);assert.ok(r.resume.lines.some(l=>l.text.includes('SQL')));assert.ok(r.resume.lines.every(l=>!l.text.includes('Excel')));assert.doesNotMatch(r.rendered.text,/12 synthetic teams|8 synthetic teams|6 synthetic teams/);assert.match(r.rendered.text,/SQL dashboards for 5 synthetic teams/);assert.equal(JSON.stringify(p),before);
});

test('tailoring quarantine: direct truth audit cannot bless quarantined or derived citations',()=>{
 const p=profile([fact('F-033'),fact('SYN-DERIVED',{derivedFrom:['F-033']}),own]);
 for(const id of ['F-033','SYN-DERIVED'])assert.equal(Tailor.auditResume([{text:'Built SQL dashboards for 5 synthetic teams.',factIds:[id],type:'bullet'}],p).ok,false,id);
 assert.equal(Tailor.auditResume([{text:own.text,factIds:[own.id],type:'bullet'}],p).ok,true,'own confirmed positive control');
});

test('tailoring quarantine: skill evidence cannot launder an excluded source',()=>{
 const p=profile([fact('F-033',{text:'Built Excel reporting for 12 synthetic teams.',skills:['Excel']}),own,{id:'SYN-SKILL',kind:'skill',name:'Excel',text:'Skill: Excel',skills:['Excel'],evidence:['F-033'],status:'confirmed',needs_confirmation:false}]);
 const r=tailored(p);assert.ok(r.resume.lines.every(l=>!l.factIds.includes('SYN-SKILL')&&!l.factIds.includes('F-033')));assert.ok(r.resume.lines.every(l=>!l.text.includes('Excel')));
});

test('tailoring quarantine control: independent confirmed skill evidence and ordinary metadata survive',()=>{
 const p=profile([own,{id:'SYN-SKILL',kind:'skill',name:'SQL',text:'Skill: SQL',skills:['SQL'],evidence:[own.id],status:'confirmed',needs_confirmation:false}]);
 const before=JSON.stringify(p),r=tailored(p);assert.ok(r.resume.lines.some(l=>l.text.includes('SQL')));assert.equal(r.audit.ok,true);assert.equal(JSON.stringify(p),before);
});

test('tailoring quarantine: malformed missing or excluded dependency aliases stay unavailable',()=>{
 for(const extra of [{derived_from:['F-033']},{derivedFrom:['F-033']},{derived_from:['SYN-ABSENT']},{derivedFrom:['SYN-ABSENT']},{derived_from:'F-033'},{derivedFrom:'F-033'},{derived_from:[own.id],derivedFrom:['F-033']},{derivedFrom:[own.id],derived_from:['F-033']}]){
  const p=profile([own,fact('SYN-DEPENDENT',extra)]);assert.ok(!selected(tailored(p)).includes('SYN-DEPENDENT'),JSON.stringify(extra));
 }
});

test('tailoring quarantine: ID and provenance policy agrees with the canonical pure TypeScript policy',()=>{
 const esbuild=process.env.UPMORE_ESBUILD_PATH||(process.env.ESBUILD_BIN?path.resolve(path.dirname(process.env.ESBUILD_BIN),'..','esbuild'):'esbuild');
 const code=require(esbuild).buildSync({entryPoints:[path.join(__dirname,'../supabase/functions/_shared/fact_quarantine.ts')],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'}).outputFiles[0].text;
 const mod=new Module('synthetic-policy-parity',module);mod.filename=__filename;mod._compile(code,__filename);const {quarantinedFact}=mod.exports;
 const cases=[];for(let n=23;n<=83;n++)for(const prefix of ['F-','F-0','F-00'])cases.push(fact(prefix+n));
 cases.push(fact('SYN-FACT',{factId:'F-033'}),fact('SYN-FACT',{provenance:'owner-delegated'}),fact('SYN-FACT',{provenance:'answer-all'}),fact('SYN-FACT',{provenance:'owner stated SQL directly'}));
 for(const f of cases){const p=profile([f]);const kept=Tailor.selectFacts(p,Tailor.parseJD(JD)).some(x=>x.fact.id===f.id);assert.equal(kept,!quarantinedFact(f),JSON.stringify({id:f.id,factId:f.factId,provenance:f.provenance}));}
});


test("tailoring quarantine: negative metadata agrees with canonical policy without classifying the person's words",()=>{
 const esbuild=process.env.UPMORE_ESBUILD_PATH||(process.env.ESBUILD_BIN?path.resolve(path.dirname(process.env.ESBUILD_BIN),'..','esbuild'):'esbuild');
 const code=require(esbuild).buildSync({entryPoints:[path.join(__dirname,'../supabase/functions/_shared/personal_fact_source.ts')],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'}).outputFiles[0].text;
 const mod=new Module('synthetic-source-parity',module);mod.filename=__filename;mod._compile(code,__filename);const {personalSourceDenied,personalSourceGuard}=mod.exports;
 const cases=[{source:'agent'},{source:'assistant'},{origin:'model'},{source:'AI generated'},{provenance:'answer-all'},{provenance:'owner-delegated'},{provenance:{source:'agent'}},{rejected:true},{quarantined:true},{unproven:true},{source:'user',provenance:'owner stated SQL directly'},{text:'Built SQL dashboards while working as an AI engineer.'}];
 for(const extra of cases){const f=fact('SYN-POLICY',extra),p=profile([f]);const kept=Tailor.selectFacts(p,Tailor.parseJD(JD)).some(x=>x.fact.id===f.id);assert.equal(kept,!personalSourceDenied(f),JSON.stringify(extra));}
 const original=[own,fact('F-033'),fact('SYN-CAMEL',{derivedFrom:['F-033']}),fact('SYN-TRANSITIVE',{derived_from:['SYN-CAMEL']}),fact('SYN-MISSING',{derivedFrom:['SYN-ABSENT']}),fact('SYN-OWN-DERIVED',{derivedFrom:[own.id]})];
 // Domain stores camel-case dependencies too. Normalize its declarations for the canonical graph (which currently
 // accepts snake-case); this comparison makes no claim that the canonical graph itself accepts camel case yet.
 const normalized=original.map(f=>({...f,...(Object.hasOwn(f,'derivedFrom')?{derived_from:f.derivedFrom}:{})})),denied=personalSourceGuard(normalized);
 const selectedIds=new Set(Tailor.selectFacts(profile(original),Tailor.parseJD(JD)).map(x=>x.fact.id));for(const f of normalized)assert.equal(selectedIds.has(f.id),!denied(f),f.id);
});
