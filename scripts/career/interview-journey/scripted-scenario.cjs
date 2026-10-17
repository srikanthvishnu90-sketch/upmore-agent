'use strict';
// Visible development scenario, not an independent semantic evaluation.
const F=require('../../../tests/career-interview-journey/fixtures.cjs');
const {sourceSession,capture}=require('../../../tests/career-interview-journey/research-fixture.cjs');
function run(){
  const snapshot=F.snapshot();snapshot.facts.find(f=>f.id==='target').value.company='Synthetic Tools';
  const s=sourceSession(snapshot);capture(s);s.turn('time_change',{available_minutes:90});
  const original='The import duplicated rows on retries. I proposed a unique request key and payload comparison; my teammate implemented the change. In one class-project test batch, duplicate rows stopped. We did not measure production rates.';
  const practice='My contribution was proposing the retry rule and reviewing its tests. My teammate implemented the backend and UI. The only observed outcome was a small test batch, so I cannot claim a measured production improvement.';
  const revision='For our class import tool, retries could duplicate rows. I proposed making request identity unique and rejecting a reused key with a different payload. A teammate implemented it; I reviewed the tests. Duplicate rows stopped in one test batch. I would next test concurrent retries and a timeout after commit; we have no production measurements.';
  const transfer='In the hypothetical handoff I would say I proposed the fix and reviewed the checks, and credit my teammate with implementation. I would report the actual test observation and environment, then propose collecting production evidence before claiming a broader improvement.';
  s.answer(original);
  s.deliver(s.candidate({brief:{text:'The supplied current role capture emphasizes backend review and retry reasoning. The project supports a truthful proposal-and-review story. It does not establish that the candidate implemented the system.',limits:'Fictional development source; no employer prediction, live capture or real quality measurement.',source_refs:[{id:'role-source',version:2},{id:'project',version:1}]},plan_updates:[{competency:'technical',reason:'The captured role names retry behavior; practice invariant and failure recovery reasoning.',source_refs:[{id:'role-source',version:2}]}]}));
  s.turn('begin_practice');s.answer(practice,'practice');s.deliver(s.candidate({feedback:'This practice statement separates proposal from implementation and limits the outcome to the observed batch. In the revised story, connect the retry rule to the duplicate-effect risk.'}));
  s.turn('begin_revision');s.answer(revision,'revision');s.deliver(s.candidate({feedback:'The revision explains the proposed guard and keeps implementation credit and outcome limits explicit. Try the handoff situation without copying the draft.'}));
  s.turn('begin_transfer');s.answer(transfer,'transfer');s.deliver(s.candidate({feedback:'This hypothetical keeps contribution and measurement claims separate. This is a scripted transfer observation, not proof of mastery.'}));
  s.turn('select_question',{question_id:'retry-design'});
  s.answer('Assume one database transaction can protect the stored result and effect. Store a unique request key with a canonical payload hash and result. Concurrent inserts compete on that key; a duplicate with the same payload reads the committed result, while a different payload conflicts. A timeout after commit retries the same key. For external effects, a transactional outbox and idempotent downstream handling are needed; a database key alone is insufficient. I would test concurrent retries and crashes before and after commit. This is text reasoning, not an executed test.');
  s.deliver(s.candidate({feedback:'The static explanation identifies the atomic boundary and distinguishes local database effects from external delivery. Retention and canonical payload rules still need explicit requirements; no code was executed.'}));
  s.turn('select_question',{question_id:'team-decision'});
  s.answer('In the class project, I preferred protecting imports with a request identity rather than disabling the retry button. I proposed the backend rule and explained why a UI-only guard would not cover a timeout or another client. My teammate implemented the change. We checked one test batch and saw duplicates stop. I would ask for concurrency tests before treating that as robust evidence.');
  s.deliver(s.candidate({feedback:'The account separates your reasoning from teammate implementation and uses a limited observation. It does not claim that the suggested concurrency checks were run.'}));
  const transition=s.turn('build_pack');return {session:s,proposal:transition.proposed_actions[0],provider_mode:'SCRIPTED_CONTRACT',real_provider_calls:0};
}
module.exports={run};
