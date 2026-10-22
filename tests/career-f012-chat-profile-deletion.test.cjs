'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {CareerHost}=require('../supabase/functions/_shared/career_host.js');
const D=n=>require('../packages/domain/'+n);
const host=CareerHost.createCareerHost({CareerAccess:D('120-career-access.js'),CareerOnboarding:D('130-career-onboarding.js'),CareerRouter:D('142-career-router.js'),CareerDoorstep:D('141-career-doorstep.js'),CareerReply:D('140-career-reply.js'),CareerContainment:D('143-career-containment.js')});
const copy=x=>JSON.parse(JSON.stringify(x));
function fresh(snapshot,extra={}){return host.createTurnCtx({userId:'synthetic-a',threadId:'synthetic-thread',now:1000,accountPersistence:true,...(snapshot?{snapshot}:{profile:D('122-career-profile.js').createProfile({facts:[{kind:'education',title:'Synthetic College',text:'Graduating in 2028'}]})}),...extra});}
const preview='delete my stored profile',confirm='confirm delete my stored profile';
test('F012 the deletion phrase offered by profile export previews actual stored facts',()=>{
 const c=fresh(),before=copy(c.profile);assert.equal(host.isHostControlled(preview,c),true);
 const r=host.runTurn(preview,c);assert.equal(r.intent,'career_profile_delete_preview');assert.equal(r.resultStatus,'awaiting_user');
 assert.deepEqual(r.deletion_preview.fact_ids,before.facts.map(f=>f.id));assert.deepEqual(c.profile,before);assert.ok(!c._hostPatch?.erase);
 assert.match(r.reply,/confirm delete my stored profile/);
});
test('F012 explicit confirmation survives snapshot round trip and uses existing account erase patch',()=>{
 const c=fresh();host.runTurn(preview,c);const next=fresh(copy(host.extractSnapshot(c)));
 assert.equal(host.isHostControlled(confirm,next),true);const r=host.runTurn(confirm,next);
 assert.equal(r.intent,'career_profile_erased');assert.deepEqual(next._hostPatch,{erase:true,paused:true});
 assert.equal(next.profile,undefined);assert.equal(next.globalPause.set,true);assert.equal(host.extractSnapshot(next).stores.profile,undefined);
});
test('F012 confirmation without the matching preview cannot erase anything',()=>{
 const c=fresh(),before=copy(c.profile);const r=host.runTurn(confirm,c);
 assert.equal(r.resultStatus,'blocked');assert.deepEqual(c.profile,before);assert.ok(!c._hostPatch?.erase);
});
test('F012 edits after preview require a fresh preview',()=>{
 const c=fresh();host.runTurn(preview,c);c.profile.facts[0].text='A different user correction';const before=copy(c.profile);
 const r=host.runTurn(confirm,c);assert.equal(r.resultStatus,'blocked');assert.deepEqual(c.profile,before);assert.ok(!c._hostPatch?.erase);
});
test('F012 expired previews cannot erase and another owner cannot reuse the preview',()=>{
 const c=fresh();host.runTurn(preview,c);const snapshot=copy(host.extractSnapshot(c));
 const expired=fresh(snapshot,{now:1000+11*60*1000});assert.equal(host.runTurn(confirm,expired).resultStatus,'blocked');assert.ok(expired.profile);
 assert.throws(()=>fresh(snapshot,{userId:'synthetic-b'}),/owner_mismatch/);
});
test('F012 a generic yes or hypothetical deletion does not authorize erasure',()=>{
 for(const text of ['yes','Should I delete my stored profile?','Do not delete my stored profile']){
  const c=fresh();host.runTurn(preview,c);const before=copy(c.profile);host.runTurn(text,c);
  for(const key of ['facts','basics','preferences','constraints'])assert.deepEqual(c.profile[key],before[key]);assert.ok(!c._hostPatch?.erase);
 }
});
test('F012 a malformed persisted preview never bypasses its expiry',()=>{
 const c=fresh();host.runTurn(preview,c);delete c.profileDeletePreview.expiresAt;
 assert.equal(host.runTurn(confirm,c).resultStatus,'blocked');assert.ok(c.profile);assert.ok(!c._hostPatch?.erase);
});
test('F012 erase clears preview, watches, resume text and active context; unrelated owner remains byte-identical',()=>{
 const c=fresh(),other=fresh(null,{userId:'synthetic-b'}),before=copy(host.extractSnapshot(other));
 c.resumeTexts={new:'synthetic resume'};c.statedFacts={facts:[{kind:'school',value:'Synthetic College'}]};c.alertWatchState={synthetic:true};
 host.runTurn(preview,c);host.runTurn(confirm,c);
 assert.deepEqual(Object.keys(host.extractSnapshot(c).stores),['globalPause']);assert.deepEqual(host.extractSnapshot(other),before);
});
test('F012 existing exact career-profile erase keeps its previous account-control behavior',()=>{
 const c=fresh();assert.equal(host.runTurn('Forget my career profile',c).intent,'career_profile_erased');assert.deepEqual(c._hostPatch,{erase:true,paused:true});
});
