'use strict';
// Confirmed-value persistence and an option refusal are different verdicts.
// Synthetic board only; no approval, real site, network, or submit.
const { test }=require('node:test');
const assert=require('node:assert/strict');
const Portal=require('../packages/domain/149-career-portal-apply.js');
const posting={canonicalKey:'localhost:recovery:test',company:'TEST Systems',role:'Intern',url:'http://localhost/recovery',status:'open'};
function fixture({reason='value_did_not_persist',recover=false,wrong=false,browser=false}={}) {
 const board=Portal.createSandboxBoard();
 const original=board.fill.bind(board);const failures=[];let attempts=0;
 board.form=()=>({fields:[{field_id:'anchor',kind:'standard',profile_key:'name',required:true,label:'Name'},{field_id:'target',kind:'screening',question_key:'work_authorization',required:true,label:'Authorized to work?'}]});
 Object.defineProperty(board,'fillFailures',{get:()=>failures.slice()});
 if(browser)board.browserDriver=true;
 board.fill=(id,value)=>{if(id!=='target')return original(id,value);attempts++;if(recover&&attempts>1)return original(id,value);if(wrong)original(id,'No');if(reason)failures.push({field_id:id,reason});return undefined;};
 const session=Portal.createPortalSession({userId:'synthetic-owner',board});
 const run=()=>Portal.runApply(session,{posting,profile:{name:'Alex Testcase (TEST)',resume:{filename:'test.pdf',sha256:'a'.repeat(64)},answers:{work_authorization:{value:'Yes',confirmed:true}}},log:{records:[]}});
 return {run,board,session,attempts:()=>attempts};
}
test('F023 a transient persistence refusal gets the existing bounded doorstep repair',()=>{
 const f=fixture({recover:true});const r=f.run();
 assert.equal(r.resultStatus,'prepared');assert.equal(r.doorstep.payload.target,'Yes');assert.equal(f.attempts(),2);
 assert.ok(r.stepLog.some(s=>s.action==='doorstep_repair'&&s.fields.includes('target')));
 assert.equal(f.board.calls.submit,0);
});
test('F023 a refusal is never logged as a successful initial fill even when repair later recovers it',()=>{
 const f=fixture({recover:true});const r=f.run();assert.equal(r.resultStatus,'prepared');
 assert.ok(r.stepLog.some(s=>s.action==='fill_refused'&&s.field_id==='target'));
 assert.equal(r.stepLog.some(s=>s.action==='fill'&&s.field_id==='target'),false);
});
test('F023 permanent persistence loss ends INCOMPLETE_PAYLOAD after bounded repair, never a user-fact ask',()=>{
 const f=fixture();const r=f.run();assert.equal(r.resultStatus,'blocked');assert.equal(r.code,'INCOMPLETE_PAYLOAD');
 assert.equal(f.attempts(),3);assert.equal(r.asks.some(a=>a.field_id==='target'),false);assert.equal(f.session.doorstep,null);assert.equal(f.board.calls.submit,0);
});
test('F023 persistence refusal with contradictory readback blocks instead of approving a different answer',()=>{
 const f=fixture({wrong:true});const r=f.run();assert.equal(r.resultStatus,'blocked');assert.equal(r.code,'ANSWER_OBSERVATION_MISMATCH');assert.equal(f.board.calls.submit,0);
});
test('F023 option mismatch remains a user choice and is never retried as persistence repair',()=>{
 const f=fixture({reason:'option_not_found',recover:true});const r=f.run();assert.equal(r.resultStatus,'awaiting_user');assert.equal(f.attempts(),1);
 assert.ok(r.asks.some(a=>a.field_id==='target'&&a.reason==='fill_refused'));assert.equal(f.session.doorstep,null);
});
test('F023 opaque real-driver refusal cannot turn a confirmed answer into an ask to restate it',()=>{
 const f=fixture({reason:null,browser:true});const r=f.run();assert.equal(r.resultStatus,'blocked');assert.equal(r.code,'INCOMPLETE_PAYLOAD');
 assert.equal(r.asks.some(a=>a.field_id==='target'),false);assert.equal(f.board.calls.submit,0);
});
test('F023 a current-page persistence failure cannot reuse an earlier-page answer as current readback',()=>{
 const board=Portal.createSandboxBoard();const original=board.fill.bind(board);const read=board.answers.bind(board);const failures=[];let phase=0;
 board.form=()=>({fields:[{field_id:'anchor',kind:'standard',profile_key:'name',required:true,label:'Name'},{field_id:'target',kind:'screening',question_key:'work_authorization',required:true,label:'Authorized to work?'}]});
 Object.defineProperty(board,'fillFailures',{get:()=>failures.slice()});
 board.fill=(id,value)=>{if(id==='target'&&phase){original(id,undefined);failures.push({field_id:id,reason:'value_did_not_persist'});return undefined;}return original(id,value);};
 board.answers=()=>Object.fromEntries(Object.entries(read()).filter(([,v])=>v!==undefined));
 board.atReview=()=>{if(!phase){phase++;return {needsFields:true};}return {atFinalReview:true};};
 const session=Portal.createPortalSession({userId:'synthetic-owner',board});
 const r=Portal.runApply(session,{posting,profile:{name:'Alex Testcase (TEST)',resume:{filename:'test.pdf',sha256:'a'.repeat(64)},answers:{work_authorization:{value:'Yes',confirmed:true}}},log:{records:[]}});
 assert.equal(r.resultStatus,'blocked');assert.equal(r.code,'INCOMPLETE_PAYLOAD');assert.equal(session.doorstep,null);assert.equal(board.calls.submit,0);
});
test('F023 a repair that leaves a different answer cannot reach a prepared payload',()=>{
 const f=fixture({recover:true});const fill=f.board.fill;let tries=0;
 f.board.fill=(id,value)=>fill(id,id==='target'&&++tries>1?'No':value);
 const r=f.run();assert.equal(r.resultStatus,'blocked');assert.equal(r.code,'ANSWER_OBSERVATION_MISMATCH');assert.equal(f.session.doorstep,null);assert.equal(f.board.calls.submit,0);
});
