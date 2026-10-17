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

const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture}=require('./fixtures/owned-worker-fixture.cjs');
const {fail}=require('../workers/career-browser/store.cjs');
test('durable cap history stops a role before opening a browser, without claiming a receipt',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mass-quota-preflight-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=fixture(root);f.authority.history=()=>({records:Array.from({length:15},(_,i)=>({userId:'user-a',status:'submission_admitted',timestamp:new Date(f.clock.value).toISOString(),company:'Other '+i,vendor:'controlled_loopback'}))});
 const task=f.worker.receive('user-a',f.input),held=f.worker.prepare('user-a',task.id);
 assert.equal(held.status,'blocked');assert.equal(held.blocker,'CAP_REACHED');assert.equal(held.result,null);assert.equal(f.count().opens,0);assert.equal(f.count().clicks,0);
});
test('unavailable durable history never becomes an empty application log',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mass-quota-missing-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=fixture(root);f.authority.history=()=>{throw fail('TASK_SUBMISSION_HISTORY_INCOMPLETE');};const task=f.worker.receive('user-a',f.input),held=f.worker.prepare('user-a',task.id);
 assert.equal(held.status,'blocked');assert.equal(held.blocker,'TASK_SUBMISSION_HISTORY_INCOMPLETE');assert.equal(f.count().opens,0);
});
test('a transactional quota refusal at the final race boundary proves no click; uncertainty stays fenced',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mass-quota-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const f=fixture(root),task=f.worker.receive('user-a',f.input),review=f.worker.prepare('user-a',task.id);assert.equal(review.status,'review_ready');
 const original=f.authority.begin;f.authority.begin=(...args)=>{if(args[1]==='submit')throw fail('TASK_SUBMISSION_CAP_REACHED');return original(...args);};
 const held=f.worker.approve('user-a',task.id,f.approval(review));assert.equal(held.status,'blocked');assert.equal(held.blocker,'TASK_SUBMISSION_CAP_REACHED');assert.equal(f.count().clicks,0);assert.equal(f.store.get(task.id).attempt,null);
});
