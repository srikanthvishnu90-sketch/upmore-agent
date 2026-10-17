'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('./fixtures.cjs'),{session}=require('./scripted-host.cjs');
const J=require('../../packages/domain/interview-journey/index.js');
const {sourceSession,capture}=require('./research-fixture.cjs');
function invalidate(s,id,kind,value){
  const row=s.snapshot.facts.find(f=>f.id===id);
  if(kind==='withdrawal')s.snapshot.facts=s.snapshot.facts.filter(f=>f.id!==id);
  else{row.version++;row.value=value;}
  s.snapshot.binding.thread_revision++;s.snapshot.binding.context_sha256=F.hash({id,kind,revision:s.snapshot.binding.thread_revision});
  const invalidation={id:'audit-invalidation-'+s.snapshot.binding.thread_revision,evidence_id:id,kind,previous_version:row.version-(kind==='withdrawal'?0:1)};s.snapshot.invalidations.push(invalidation);
  return s.turn('context_changed',{invalidation_ids:[invalidation.id],...(id==='target'&&kind!=='withdrawal'?{target_ref:{id,version:row.version}}:{})});
}
function abstain(s){const c=s.candidate();c.dimensions=c.dimensions.map(d=>({id:d.id,score:'not_assessed',spans:[],missing_criterion:'The supplied response does not permit judgment of this criterion.',rationale:'Abstain rather than invent a grade.',uncertainty:'Not assessed'}));c.strength.text='No substantiated strength assessed.';c.priority_fix.text='The competency remains unassessed.';return s.deliver(c);}
test('audit: pause technical -> role correction -> restart -> resume never restores unsupported technical work',()=>{
  const s=session();s.start();s.turn('select_question',{question_id:'retry-design'});s.answer();const oldPending=F.copy(s.state.checkpoint.pending_reasoning),oldCandidate=s.candidate();s.turn('pause');
  invalidate(s,'target','target_changed',{role:'Synthetic finance analyst',role_family:'finance',level:'early-career',company:'Fictional',stage:'behavioral'});
  assert.equal(s.state.status,'paused','a correction must not implicitly resume a paused journey');
  s.state=JSON.parse(JSON.stringify(s.state));s.turn('resume');assert.equal(s.state.checkpoint.active_question.family,'project');
  const late=s.turn('model_candidate',{action_id:oldPending.action_id,candidate:oldCandidate,receipt_id:'old'});assert.equal(late.reply_plan.status,'stale_context');
  const answer=s.answer('A truthful general project account.');assert.equal(answer.proposed_actions[0].args.request.question.family,'project');assert.equal(s.state.checkpoint.interruption_stack.length,0);
});
test('audit: all-abstention assessments cannot satisfy family, practice, revision or transfer completion',()=>{
  const s=sourceSession();capture(s);s.answer();abstain(s);s.turn('begin_practice');s.answer('I need more clarification before giving an example.','practice');abstain(s);s.turn('begin_revision');s.answer('I still cannot supply the missing evidence.','revision');abstain(s);s.turn('begin_transfer');s.answer('I do not know how to apply it in this situation.','transfer');abstain(s);
  s.turn('select_question',{question_id:'retry-design'});s.answer('I cannot assess the technical boundary.');abstain(s);s.turn('select_question',{question_id:'team-decision'});s.answer('No evidence-based answer supplied.');abstain(s);
  const pack=s.turn('build_pack').proposed_actions[0].args.pack;
  for(const unmet of ['project answer not assessed','technical answer not assessed','behavioral answer not assessed','practice not assessed','revision not assessed','Unassisted transfer not assessed'])assert.ok(pack.unmet_conditions.includes(unmet),unmet);
  assert.equal(s.state.observations.filter(o=>o.kind==='transfer')[0].status,'not_assessed');assert.equal(pack.status,'partial');
});
test('audit: declaring minutes remaining reanchors the budget after elapsed work',()=>{
  const s=session();s.start({available_minutes:30});s.turn('submit_answer',{text:'A partial project account.',minutes_spent:8,scripted:true});assert.equal(s.state.plan.remaining_minutes,22);s.turn('pause');s.turn('time_change',{available_minutes:12});assert.equal(s.state.plan.remaining_minutes,12);assert.equal(s.state.constraints.spent_minutes,8);s.turn('resume');assert.ok(s.state.plan.items.reduce((n,i)=>n+i.minutes,0)<=12);
});
test('audit: withdrawing a retrieved but unused project preserves the specifically linked answer and draft',()=>{
  const snapshot=F.snapshot(),other=F.copy(snapshot.facts[0]);other.id='unused-project';other.value='UNUSED_PROJECT_VALUE';snapshot.facts.push(other);const s=session(snapshot);s.start();
  s.turn('submit_answer',{text:'I proposed the import fix; my teammate implemented it.',source_refs:[{id:'project',version:1}],scripted:true});
  const request=s.last.proposed_actions[0].args.request;assert.ok(request.evidence.some(e=>e.id==='unused-project'),'retrieved is distinct from declared use');
  s.deliver(s.candidate({evidence_refs:[{id:'project',version:1}]}));const selected=s.state.checkpoint.selected_draft_id;
  invalidate(s,'unused-project','withdrawal');assert.equal(s.state.attempts[0].status,'active');assert.equal(s.state.assessments[0].status,'active');assert.equal(s.state.checkpoint.selected_draft_id,selected);
  const pack=s.turn('build_pack').proposed_actions[0].args.markdown;assert.match(pack,/proposed the import fix/);assert.doesNotMatch(pack,/UNUSED_PROJECT_VALUE/);
});
test('audit: an unaddressed side question survives feedback and an explicit answer resolves only that ask',()=>{
  const s=session();s.start();s.turn('submit_answer',{text:'I proposed the import change.',side_question:'How should I explain the class-project setting?',scripted:true});s.deliver();assert.equal(s.state.checkpoint.unresolved_asks.length,1,'feedback alone cannot stand in for a side answer');
  const ask=s.state.checkpoint.unresolved_asks[0];assert.equal(ask.text,'How should I explain the class-project setting?');
  s.turn('style_edit',{instruction:'Make the selected draft warmer.'});s.deliver(s.candidate({ask_responses:[{ask_id:ask.id,text:'Call it a class project and name the test setting; do not imply production experience.',evidence_refs:[{id:'project',version:1}]}]}));
  assert.equal(s.state.checkpoint.unresolved_asks.length,0);assert.match(s.last.reply_plan.text,/Call it a class project/);
});
test('audit: a project ownership hint does not become technical assistance or irrelevant retrieved coaching',()=>{
  const s=session();s.start();s.answer();s.deliver();s.turn('begin_practice');s.answer('My contribution was the proposal.','practice');s.deliver();s.turn('select_question',{question_id:'retry-design'});s.answer('I would define request identity and atomic effects.');const a=s.state.attempts.at(-1),request=s.last.proposed_actions[0].args.request;
  assert.equal(a.assistance,'none');assert.equal(request.hints.length,0);assert.equal(request.prior_attempts.length,0);
});
test('audit: wording-only edits do not create another competency assessment or leave two selected drafts active',()=>{
  const s=session();s.start();s.answer();s.deliver();const assessmentCount=s.state.assessments.length,old=s.state.checkpoint.selected_draft_id;s.turn('style_edit',{instruction:'Make the wording more conversational.'});s.deliver();assert.equal(s.state.assessments.length,assessmentCount);assert.equal(s.state.drafts.find(d=>d.id===old).status,'superseded');assert.equal(s.state.drafts.filter(d=>d.status==='active').length,1);
});
module.exports={invalidate};
