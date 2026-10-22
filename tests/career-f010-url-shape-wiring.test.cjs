'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {CareerPool:P}=require('../supabase/functions/_shared/career_pool.js');
const good='https://boards.greenhouse.io/synthetic/jobs/1234567',unknown='https://careers.synthetic.example/some-custom-path';
const junk=['https://data.cityofnewyork.us/resource/abcd-efgh.json?job_id=1','https://news.ycombinator.com/item?id=12345','https://api.ashbyhq.com/posting-api/job-board/synthetic','https://boards.greenhouse.io/synthetic','not a url',''];
const row=(url,id=url)=>({posting_key:id,source:'synthetic',title:'Synthetic Engineer',company:'Synthetic',url,text_excerpt:'Synthetic role',fetched_on:'2026-10-14'});
for(const url of junk)test(`F010 mapper refuses known non-posting ${url}`,()=>assert.equal(P.mapKbPosting(row(url)),null));
test('F010 unknown shapes stay marked unclassified instead of becoming confirmed postings',()=>{
 const r=P.mapKbPosting(row(unknown));assert.equal(r.url,unknown);assert.equal(r.url_shape,'unclassified');
});
test('F010 posting identity wins over an employer route named search',()=>{
 const r=P.mapKbPosting(row('https://stripe.com/jobs/search?gh_jid=5416444'));assert.ok(r);assert.equal(r.url_shape,undefined);
});
test('F010 discovery and targeted reads both remove junk before any liveness fetch',async()=>{
 const called=[],loader=P.createKbPoolLoader({readRows:async()=>[row(junk[0]),row(good)],probeUrl:async u=>{called.push(u);return 200;}});
 for(const result of [await loader.loadPool(),await loader.loadTargeted({company:'Synthetic'})])assert.deepEqual(result.postings.map(p=>p.url),[good]);
 assert.deepEqual(called,[good]);
});
test('F010 worker discovery uses the same shape screen',async()=>{
 const {createProductionSources}=require('../workers/career-browser/production-sources.cjs');
 const s=createProductionSources({transport:{readRows:async()=>[row(junk[1]),row(good)]},probeUrl:async()=>200});assert.deepEqual((await s.postingsFor('synthetic-owner')).map(p=>p.url),[good]);
});
function python(script){const r=cp.spawnSync('python3',['-c',script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',env:{PATH:process.env.PATH,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(r.status,0,r.stderr+r.stdout);return JSON.parse(r.stdout);}
const fixture=`
import importlib.util,json,pathlib,tempfile
s=importlib.util.spec_from_file_location('kb','scripts/career/load-knowledge-db.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def forbidden(*a,**kw): raise AssertionError('database/migration access forbidden')
m.sb=m.sb_retry=m.apply_migration=forbidden
t=tempfile.TemporaryDirectory();m.HR=pathlib.Path(t.name);(m.HR/'corpus').mkdir()
(m.HR/'corpus/stats.json').write_text(json.dumps({'fetched':'2026-10-14','total':3}))
rows=[{'key':'junk','source':'socrata','title':'Synthetic','url':${JSON.stringify(junk[0])}}, {'key':'good','source':'greenhouse','title':'Synthetic','url':${JSON.stringify(good)}}, {'key':'unknown','source':'custom','title':'Synthetic','url':${JSON.stringify(unknown)},'url_shape':'posting'}]
(m.HR/'corpus/postings.jsonl').write_text('\\n'.join(json.dumps(r) for r in rows))
`;
test('F010 actual KB builder rejects junk and overwrites false source shape claims without database access',()=>{
 const r=python(fixture+"\nrows,bad,vintage=m.build_postings();print(json.dumps({'rows':rows,'bad':bad}))");assert.deepEqual(r.rows.map(x=>x.posting_key),['good','unknown']);assert.equal(r.rows[1].extra.url_shape,'unclassified');assert.equal(r.bad,0);
});
test('F010 KB load records per-source shape counts',()=>{
 const r=python(fixture+"\ncounts={};m.build_postings(url_shape_counts=counts);print(json.dumps(counts))");assert.equal(r.socrata.not_posting,1);assert.equal(r.greenhouse.posting,1);assert.equal(r.custom.unknown,1);
});
test('F010 processed metadata participates in the loader content hash',()=>{
 const r=python(fixture+`\nrows,_,_=m.build_postings();r=rows[-1]
m.db_count=lambda *a:0
m.diff_rows=lambda table,rows: (set(),set())
m.sb_retry=lambda sql:[{'n':1}] if sql=='select count(*) as n from public.career_kb_postings' else forbidden()
m.apply_rows('career_kb_postings',[r],[]);a=r['content_hash']
r['extra']['url_shape']='changed-derived-metadata'
m.apply_rows('career_kb_postings',[r],[]);print(json.dumps({'before':a,'after':r['content_hash']}))`);assert.notEqual(r.before,r.after);
});
test('F010 invalid classifier output fails closed before loading any rows',()=>{
 const r=python(fixture+`\nfrom types import SimpleNamespace
m.subprocess.run=lambda *a,**kw:SimpleNamespace(returncode=0,stdout='[]',stderr='')
try:m.build_postings();print(json.dumps({'refused':False}))
except (ValueError,RuntimeError):print(json.dumps({'refused':True}))`);assert.equal(r.refused,true);
});
test('F010 generated career bundle exports the same pure classifier',async()=>{
 const b=await import('../supabase/functions/_shared/router_core.career.js');assert.equal(typeof b.CareerUrlShape?.classifyPostingUrl,'function');assert.equal(b.CareerUrlShape.classifyPostingUrl(junk[0]).verdict,'not_posting');
});
