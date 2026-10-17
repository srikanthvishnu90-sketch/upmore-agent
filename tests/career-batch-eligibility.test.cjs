'use strict';
// Synthetic confirmed facts/current posting only. No provider, browser or employer.
const {test}=require('node:test'),assert=require('node:assert/strict');
const B=require('../workers/career-browser/batch-context.cjs'),Assign=require('../packages/domain/152-career-assign.js');
const now=Date.parse('2026-10-17T12:00:00Z');
function fixture(){
 const posting={job_id:'SYNTHETIC',canonicalKey:'SYNTHETIC:pe',company:'SYNTHETIC ONLY',title:'Private Equity Analyst Intern',url:'http://localhost:8123/form',role_family:'Finance',seniority_band:'intern',jd_text:'Private equity internship: Excel valuation financial modeling.',location:'New York, NY',status:'open'};
 const skills=['Excel','valuation','financial modeling'];
 const e={careerProfile:{facts:skills.map((name,i)=>({id:'fact'+i,kind:'skill',status:'confirmed',name,evidence:['SYNTHETIC confirmed source']}))},scoringProfile:{skills:skills.map((name,i)=>({name,proven:true,fact_id:'fact'+i,evidence:['SYNTHETIC confirmed source']})),level:'student',experience_years:0,constraints:{work_authorization:'US citizen',needs_sponsorship:false},preferences:{role_families:['Finance']}},roleInterests:[{interest_id:'confirmed_pe_intern',role:Assign.roleSpecFor({split:'Private Equity Analyst'}),filters:{bands:['intern'],locations:['New York']}}],currentPosting:{posting,observedAt:new Date(now).toISOString(),sourceSha256:'a'.repeat(64)}};
 const t={id:'b'.repeat(32),userId:'owner',privacyEpoch:0,authority:{accountVersion:1},spec:{posting}};
 return {e,t,run:answers=>B.eligibility(t,e,{records:[]},now,answers)};
}
test('batch admission requires meaningful fit and actual cited confirmed facts',()=>{
 const good=fixture();assert.equal(good.run().status,'eligible');
 const zero=fixture();zero.e.careerProfile.facts=[];zero.e.scoringProfile.skills=[];assert.equal(zero.run().code,'CONFIRMED_FIT_EVIDENCE_REQUIRED');
 const weak=fixture();weak.e.careerProfile.facts=weak.e.careerProfile.facts.slice(0,1);weak.e.scoringProfile.skills=weak.e.scoringProfile.skills.slice(0,1);assert.equal(weak.run().code,'MEANINGFUL_FIT_REQUIRED');
 const orphan=fixture();orphan.e.careerProfile.facts=[];assert.equal(orphan.run().code,'CONFIRMED_FIT_EVIDENCE_REQUIRED');
 const draft=fixture();draft.e.careerProfile.facts[0].status='draft';draft.e.careerProfile.facts[0].needs_confirmation=true;assert.equal(draft.run().code,'CONFIRMED_FIT_EVIDENCE_REQUIRED');
});
test('confirmed role terms, family and internship band cannot be padded with unrelated roles',()=>{
 for(const [key,value]of [['title','Software Engineer Intern'],['seniority_band','senior'],['role_family','SWE']]){const f=fixture();f.e.currentPosting.posting={...f.e.currentPosting.posting,[key]:value,jd_text:'Excel valuation financial modeling engineering role'};f.t.spec.posting=f.e.currentPosting.posting;assert.equal(f.run().code,'ROLE_TARGET_MISMATCH');}
 const missing=fixture();delete missing.e.roleInterests;assert.equal(missing.run().code,'ROLE_INTEREST_CONTEXT_REQUIRED');
});
test('explicit scoped eligibility answers bind exact question/posting context and never mutate master facts',()=>{
 const f=fixture();f.e.currentPosting.posting.jd_text+=' No sponsorship offered.';f.e.scoringProfile.constraints={};const original=JSON.stringify(f.e.scoringProfile),held=f.run();assert.equal(held.status,'awaiting_user');
 const q=held.asks[0];assert.equal(q.answerable,true);assert.equal(q.required,true);assert.match(q.questionSha256,/^[a-f0-9]{64}$/);
 const answer={kind:'eligibility',fieldId:q.field_id,questionSha256:q.questionSha256,value:false,source:'user_explicit_role_confirmation'};
 assert.equal(f.run([answer]).status,'eligible');assert.equal(JSON.stringify(f.e.scoringProfile),original);assert.equal(f.run([{...answer,value:true}]).status,'blocked');
 f.e.currentPosting.sourceSha256='c'.repeat(64);const changed=f.run([answer]);assert.equal(changed.status,'awaiting_user');assert.notEqual(changed.asks[0].questionSha256,q.questionSha256);
});
test('residency answers are actual supplied locations, never an inferred address from yes',()=>{
 const f=fixture();f.e.currentPosting.posting.jd_text+=' Colorado residents only.';const held=f.run(),q=held.asks[0];assert.equal(held.status,'awaiting_user');
 const answer=value=>({kind:'eligibility',fieldId:q.field_id,questionSha256:q.questionSha256,value,source:'user_explicit_role_confirmation'});
 assert.equal(f.run([answer('Boulder, Colorado')]).status,'eligible');assert.equal(f.run([answer('Chicago, Illinois')]).status,'blocked');assert.equal(f.run([answer('yes')]).status,'awaiting_user');
});
