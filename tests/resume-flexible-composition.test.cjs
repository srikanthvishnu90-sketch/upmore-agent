'use strict';
// Actual staged entry, with database/provider/semantic mocks explicitly labelled.
const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('./helpers/resume-flexible-composition.cjs');
const ASK='Help me practice an interview answer.';
test('joint committed supersession governs enabled flexible facts, prior drafts/replay and colliding owner context',async t=>{
 const f=await C.fixture(t);C.seed(f);const a=f.dbs.get(C.U),b=f.dbs.get(C.V);
 assert.equal((await f.request(C.CORRECT,'first')).body.meta.result_status,'completed');assert.equal(f.requests.length,0);
 assert.equal((await f.request(ASK,'coach-2028')).body.meta.career_model.status,'generated');C.assertYear(assert,f.requests.at(-1).view,'2028',['2027']);
 a.state.career.stores.resumeTexts={new:C.NEW('2033')};assert.equal((await f.request(C.CORRECT,'second')).body.meta.result_status,'completed');assert.equal(f.requests.length,1);
 assert.equal((await f.request(ASK,'coach-2028')).status,409);assert.equal(f.requests.length,1);
 assert.equal((await f.request(ASK,'coach-2033')).body.meta.career_model.status,'generated');let v=f.requests.at(-1).view;C.assertYear(assert,v,'2033',['2027','2028']);assert.equal(v.recent_dialogue.length,0);assert.equal(v.current_draft,null);
 a.state.career.stores.resumeTexts={new:C.NEW('2030')};assert.equal((await f.request(C.CORRECT,'third')).body.meta.result_status,'completed');
 assert.equal((await f.request(ASK,'coach-2030')).body.meta.career_model.status,'generated');C.assertYear(assert,f.requests.at(-1).view,'2030',['2027','2028','2033']);
 const before=C.copy(a.state.career.stores.profile);a.state.career.stores.resumeTexts={new:C.NEW('2033')};assert.equal((await f.request(C.CORRECT,'stale')).body.meta.result_status,'blocked');assert.deepEqual(a.state.career.stores.profile,before);
 const fresh=await C.fixture(t,{dbs:f.dbs});fresh.as(C.V);const beforeB=C.copy(b.state.career.stores.profile);assert.match((await fresh.request(C.RECALL,'b-recall')).body.reply,/2031/);assert.equal((await fresh.request(ASK,'b-coach')).body.meta.career_model.status,'generated');const bv=fresh.requests[0].view;assert.ok(bv.facts.some(x=>x.kind==='graduation_date'&&x.text==='2031'));assert.doesNotMatch(JSON.stringify(bv),/2030|2033|spreadsheet/);assert.deepEqual(b.state.career.stores.profile,beforeB);
});
test('joint failed correction cannot enter active flexible context or mark its source adopted; fresh retry is owned and atomic',async t=>{
 const f=await C.fixture(t);C.seed(f);const a=f.dbs.get(C.U);await f.request(C.CORRECT,'first');const before=C.copy(a.state.career.stores.profile);a.state.career.stores.resumeTexts={new:C.NEW('2033')};a.options.failSave=true;
 assert.equal((await f.request(C.CORRECT,'retry')).status,503);assert.deepEqual(a.state.career.stores.profile,before);assert.equal(f.requests.length,0);a.options.failSave=false;
 const fresh=await C.fixture(t,{dbs:f.dbs});assert.equal((await fresh.request(ASK,'after-failure')).body.meta.career_model.status,'generated');C.assertYear(assert,fresh.requests[0].view,'2028',['2033']);
 assert.equal((await fresh.request(C.CORRECT,'retry')).body.meta.result_status,'completed');assert.equal((await fresh.request(ASK,'after-success')).body.meta.career_model.status,'generated');C.assertYear(assert,fresh.requests.at(-1).view,'2033',['2027','2028']);assert.equal(a.state.career.stores.profile.profile_corrections.length,2);
});
