'use strict';
// SYNTHETIC LOCAL CONTRACT ONLY. No owner facts, browser or employer IO.
// A delegation to generate test answers is not an assertion of their truth.
const test=require('node:test'),assert=require('node:assert/strict');
const Portal=require('../packages/domain/149-career-portal-apply.js');
const NOW='2026-10-18T12:00:00Z';
const delegated='owner-delegated 2026-10-17 (answer-all directive)';
const fact=(key,value)=>({id:'SYNTHETIC-'+key,kind:'application_answer',question_key:key,value,status:'confirmed',needs_confirmation:false,provenance:delegated,evidence:'answer all of these questions urself. For test'});
const derive=facts=>Portal.deriveAnswers({basics:{name:'SYNTHETIC LOCAL FIXTURE'},facts},NOW);
for(const [key,value]of [['restrictive_agreements','No'],['gender_identity','SYNTHETIC TEST VALUE'],['twelve_week_availability','Yes'],['acknowledgment_receipt',true],['relocation_required','Yes'],['work_authorization_other_region','No']]){
 test('test-generated '+key+' cannot become a confirmed applicant answer',()=>{
  assert.equal(derive([fact(key,value)]).answers[key],undefined,'confirmed status cannot launder a test-generation directive into personal truth');
 });
}
test('test-generated citizenship cannot produce citizenship/export/visa assertions',()=>{
 const f={id:'SYNTHETIC-CITIZENSHIP',kind:'profile',name:'Citizenship status',value:'United States citizen',status:'confirmed',provenance:delegated,evidence:'answer all of these questions urself. For test'};
 const d=derive([f]);for(const key of ['citizenship_status','student_visa_holder','us_person_status','deemed_export_affects_employment'])assert.equal(d.answers[key],undefined,key+' needs an actual owner/employer assertion');
});
function localBoard(fields){const held={},calls={submit:0};return{kind:'browser',sandbox:false,browserDriver:true,atsFamily:'greenhouse',host:'boards.greenhouse.io',held,calls,
 open:()=>({ok:true,captcha:null}),form:()=>({fields,captchaAt:null}),fill:(id,v)=>(held[id]=v),answers:()=>({...held}),atReview:()=>({ok:true,captcha:null}),armForSubmit:()=>({armed:true}),submit(){calls.submit++;throw Error('SYNTHETIC TEST MUST NOT SUBMIT');},submissionState:()=>({submitted:false,confirmationId:null})};}
test('unproven required answer becomes a named ask for that job; another job remains independent',()=>{
 const profile={name:'SYNTHETIC LOCAL FIXTURE',email:'fixture@example.test',resume:{filename:'synthetic.pdf',sha256:'a'.repeat(64)},answers:derive([fact('restrictive_agreements','No')]).answers};
 const posting={id:'SYNTHETIC-JOB',canonicalKey:'greenhouse:synthetic:fixture',company:'SYNTHETIC LOCAL ONLY',role:'Fixture',url:'https://boards.greenhouse.io/synthetic-fixture/jobs/1',status:'open',atsFamily:'greenhouse'};
 const field={field_id:'restrictions',kind:'screening',question_key:'restrictive_agreements',label:'SYNTHETIC required restrictions question',required:true};
 const affected=localBoard([field]),other=localBoard([]);
 const run=board=>Portal.runApply(Portal.createPortalSession({userId:'synthetic-owner',board}),{posting,profile,log:{records:[]}});
 const held=run(affected),healthy=run(other);
 assert.equal(held.resultStatus,'awaiting_user');assert.ok(held.asks.some(x=>x.field_id==='restrictions'));assert.equal(affected.held.restrictions,undefined);
 assert.notEqual(healthy.resultStatus,'awaiting_user');assert.equal(affected.calls.submit+other.calls.submit,0);
});
