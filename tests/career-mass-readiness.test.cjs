'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Apply=require('../packages/domain/132-career-apply.js');
const Jobs=require('../packages/domain/121-career-jobs.js');

test('batch triage holds only the unresolved role and preserves its essential question',()=>{
 const profile={skills:[{name:'Python',proven:true}],level:'student',experience_years:1,
  constraints:{work_authorization:'US citizen',needs_sponsorship:false},preferences:{}};
 const base={company:'Synthetic readiness fixture',title:'Software Engineer Intern',role_family:'SWE',seniority_band:'intern',remote:'remote',source:'greenhouse'};
 const held={...base,job_id:'restricted',location:'Remote — Colorado residents only',jd_text:'Python. Must reside in Colorado for the entire employment.'};
 const clean={...base,job_id:'healthy',location:'Remote — United States',jd_text:'Python internship.'};
 assert.equal(Jobs.scoreFit(held,profile).restriction_unresolved,true);
 const [question,ready]=Apply.triageBatch([held,clean],{scoringProfile:profile});
 assert.equal(question.decision,'ask');
 assert.ok(question.needs_user_input.some(q=>q.type==='state_residency'&&/Colorado/.test(q.question)));
 assert.equal(ready.decision,'apply');
 const confirmed={...profile,residence:'Denver, CO',basics:{location:'Denver, CO'}};
 assert.equal(Apply.triageBatch([held],{scoringProfile:confirmed})[0].decision,'apply');
});
