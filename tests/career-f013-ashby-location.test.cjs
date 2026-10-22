'use strict';
// F-013: invented payloads using captured Ashby primary/secondary-location field layouts.
// Shape reference only: 348c2d4a packages/career-data/fixtures/gauntlet/jobs/public-snapshots/ashby-ramp-4e64ab86-4e30-403b-b1b9-41dc052570ce.json.
// No real posting content, fetch, database, backfill, or generated bundle is used here.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Jobs=require('../packages/domain/121-career-jobs.js');
const {CareerPool:Pool}=require('../supabase/functions/_shared/career_pool.js');
const fixture=extra=>({id:'synthetic-f013',title:'Data Analyst',jobUrl:'https://example.test/f013',descriptionPlain:'Analyze invented operational data.',...extra});
const normalized=extra=>Jobs.normalizeAshby({name:'Invented Location Lab',jobs:[fixture(extra)]},'invented')[0];
for(const [name,extra,want] of [
 ['primary string',{location:'Chicago, IL'},'Chicago, IL'],
 ['primary locationName',{locationName:'Boston, MA'},'Boston, MA'],
 ['captured secondary layout',{location:'Chicago, IL',secondaryLocations:[{location:'Boston, MA',address:{postalAddress:{addressLocality:'Boston',addressRegion:'MA',addressCountry:'USA'}}},{location:'Remote (Canada)'}]},'Chicago, IL; Boston, MA; Remote (Canada)'],
 ['secondary without primary',{secondaryLocations:[{location:'Boston, MA'},{locationName:'Remote (Canada)'}]},'Boston, MA; Remote (Canada)'],
 ['structured primary name',{location:{name:'Chicago, IL'}},'Chicago, IL'],
 ['structured primary address',{location:{address:{postalAddress:{addressLocality:'Chicago',addressRegion:'IL',addressCountry:'USA'}}}},'Chicago, IL, USA'],
 ['locations array',{locations:['Chicago, IL',{name:'Boston, MA'}]},'Chicago, IL; Boston, MA'],
 ['primary array',{location:['Chicago, IL','Boston, MA']},'Chicago, IL; Boston, MA'],
 ['deduped locations',{location:' Chicago, IL ',secondaryLocations:[{location:'Chicago, IL'},{location:'Boston, MA'},{location:'boston, ma'}]},'Chicago, IL; Boston, MA'],
 ['duplicate named secondary retains its label instead of appending its address',{location:'Chicago, IL',secondaryLocations:[{location:'Chicago, IL',address:{postalAddress:{addressLocality:'Chicago',addressRegion:'IL',addressCountry:'USA'}}}]},'Chicago, IL'],
 ['invalid primary does not shadow real fallback',{location:{unrelated:'not a location'},locationName:'Boston, MA'},'Boston, MA'],
 ['unlisted location',{},'Location not stated'],
 ['empty and malformed locations',{location:{unrelated:'not a location'},secondaryLocations:[{},null,42,false],locations:[true,5]},'Location not stated'],
 ])test('F013 Ashby source mapping: '+name,()=>assert.equal(normalized(extra).location,want));

test('F013 feed normalization preserves every source location before the hosted shelf maps it',async()=>{
 let calls=0;
 const result=await Jobs.fetchFeed(Jobs.feeds.ashby('invented'),{fetch:async()=>{calls++;return{status:200,json:async()=>({name:'Invented Location Lab',jobs:[fixture({location:'Chicago, IL',secondaryLocations:[{location:'Boston, MA'},{location:'Remote (Canada)'}]})]})}}});
 assert.equal(calls,1);assert.equal(result.postings.length,1);
 const p=result.postings[0];assert.equal(p.location,'Chicago, IL; Boston, MA; Remote (Canada)');
 const mapped=Pool.mapKbPosting({posting_key:p.job_id,source:'ashby',company:p.company,title:p.title,url:p.url,location:p.location,text_excerpt:p.jd_text},Jobs);
 assert.equal(mapped.location,p.location);assert.equal(mapped.url,'https://example.test/f013');assert.equal(mapped.company,'Invented Location Lab');
});
for(const [name,location,want] of [['structured stored location',{name:'Chicago, IL'},'Chicago, IL'],['empty snapshot','', 'Location not stated'],['missing snapshot',undefined,'Location not stated'],['unknown object',{unrelated:'not a location'},'Location not stated']])test('F013 shelf mapping: '+name,()=>{
 const row={posting_key:'synthetic:f013',source:'ashby',company:'Invented Location Lab',title:'Data Analyst',url:'https://example.test/f013',location};
 const p=Pool.mapKbPosting(row,Jobs);assert.equal(p.location,want);assert.ok(!p.location.includes('[object Object]'));
});
test('F013 bare shelf mapper also describes an unknown location without inventing a city',()=>{
 const p=Pool.mapKbPosting({posting_key:'synthetic:f013',source:'ashby',title:'Data Analyst',location:''});
 assert.equal(p.location,'Location not stated');assert.equal(p.company,null);assert.equal(p.company_not_stated,true);
});
