'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const core='packages/domain/interview-journey/index.js',context='packages/career-interview-journey/adapters/context.js',reasoning='packages/career-interview-journey/adapters/reasoning.js',pack='packages/domain/interview-journey/pack.js',research='packages/career-interview-journey/adapters/research.js';
const cases=[
  {id:'foreign_fact',file:context,from:"return item.owner_id===snapshot.owner_id&&(item.scope==='owner'||item.thread_id===snapshot.thread_id);",to:'return true;',test:'journey',pattern:'foreign fact is refused'},
  {id:'revive_invalidated_answer',file:core,from:'a.context_outdated=true;',to:'a.context_outdated=false;',test:'invalidation',pattern:'ownership correction invalidates only'},
  {id:'fabricate_tool_success',file:research,from:'function read(snapshot,result,pending){',to:"function read(snapshot,result,pending){ return {status:'succeeded',action_id:result.action_id};",test:'research',pattern:'fabricated success and altered source bytes'},
  {id:'posting_becomes_personal_skill',file:reasoning,from:"C.assert(snapshot.facts.includes(fact),'source requirement cannot become personal fact');",to:'/* planted: allow a posting to become a personal fact */',test:'research',pattern:'posting requirements cannot become personal skills'},
  {id:'change_answer_after_grading',file:core,from:"for(const a of s.assessments)if(a.status==='active')C.assert(s.attempts.some(t=>t.id===a.attempt_id&&t.answer_sha256===a.answer_sha256&&t.question_id===a.question_id&&t.rubric_id===a.rubric_id),'assessment no longer binds immutable attempt');",to:'/* planted: permit assessment to survive changed answer */',test:'boundaries',pattern:'changing an answer after grading'},
  {id:'drop_interruption_checkpoint',file:core,from:'s.checkpoint.interruption_stack.push({stage:s.stage,active_question:s.checkpoint.active_question,active_attempt_id:s.checkpoint.active_attempt_id,unresolved_asks:H.clone(s.checkpoint.unresolved_asks)});',to:'/* planted: forget checkpoint */',test:'journey',pattern:'pause stores unresolved side question'},
  {id:'keyword_wrong_answer_correct',file:core,from:'s.attempts.push(attempt);',to:"s.attempts.push(attempt);if(/Python|STAR/.test(attempt.text))s.assessments.push({id:'planted-keyword-grade',status:'planted',score:4});",test:'boundaries',pattern:'keyword-stuffed wrong answer'},
  {id:'reuse_stale_pack',file:pack,from:"C.assert(r.journey_revision===pending.journey_revision&&state.revision-1===pending.journey_revision&&C.sameBinding(r.validated_binding,C.binding(snapshot,state.revision-1))&&H.canonical(r.target_ref)===H.canonical(state.target_ref)&&H.canonical(r.resume_ref)===H.canonical(state.resume_ref),'stale artifact target/resume/revision');",to:'/* planted: accept stale pack readback */',test:'boundaries',pattern:'readable partial pack stays partial and stale pack'},
  {id:'sum_coached_and_transfer_into_improvement',file:core,from:'s.content_sha256=contentHash(s);validateState(s);',to:"if(s.observations.length>1)s.improvement_score=s.assessments.reduce((n,a)=>n+(a.dimensions||[]).reduce((m,d)=>m+(typeof d.score==='number'?d.score:0),0),0);s.content_sha256=contentHash(s);validateState(s);",test:'journey',pattern:'complete scripted practice loop'},
  {id:'skip_artifact_readback',file:core,from:"if(a){s.stage='pack_ready';s.checkpoint.pending_artifact=",to:"if(a){s.stage='completed';s.checkpoint.pending_artifact=",test:'boundaries',pattern:'artifact cannot complete on assembly'},
  {id:'retain_stale_practice_checkpoint',file:core,from:'invalidGuide=guided&&!guidedValid(s,checkpoint,checkpoint.stage)',to:'invalidGuide=false',test:'recovery-checkpoints',pattern:'company correction sanitizes a paused practice'},
  {id:'retry_with_foreign_question',file:core,from:'s.stage=phase;s.checkpoint.active_question=frame.active_question;',to:'s.stage=phase;/* planted: keep another question */',test:'recovery-checkpoints',pattern:'retrying a failed saved project answer'},
  {id:'discard_outstanding_on_cancel',file:core,from:'trackOutstanding(s,s.checkpoint.pending_reasoning,true);',to:'s.checkpoint.outstanding_reasoning=[];',test:'recovery-checkpoints',pattern:'first unknown after control'},
  {id:'reopen_terminal_settlement',file:reasoning,from:"previous?.budget_state==='uncertain'&&previous.request?.action_id===event.action_id",to:'previous?.request?.action_id===event.action_id',test:'recovery-settlement',pattern:'detached settlement authenticates'},
  {id:'reject_canonical_zero_version',file:context,from:'Number.isSafeInteger(item.version)&&item.version>=0',to:'Number.isSafeInteger(item.version)&&item.version>0',test:'context-versions',pattern:'facts preserve canonical nonnegative safe version 0'},
  {id:'accept_negative_fractional_version',file:context,from:'Number.isSafeInteger(item.version)&&item.version>=0',to:"typeof item.version==='number'",test:'context-versions',pattern:'facts reject invalid evidence version (-1|0.5)'},
  {id:'repeat_pause_frames',file:core,from:"if(s.status==='active'){\n      s.checkpoint.interruption_stack.push",to:'if(true){\n      s.checkpoint.interruption_stack.push',test:'adversarial-controls',pattern:'stop dominates subsequent pause'},
  {id:'retain_resumed_pause_frames',file:core,from:'s.checkpoint.interruption_stack=[];if(prior)',to:'/* planted: retain old frames */if(prior)',test:'adversarial-controls',pattern:'resume consumes legacy duplicate'},
  {id:'block_stale_stop',file:core,from:"!['pause','stop','reasoning_result'].includes(event.type)",to:"!['pause','reasoning_result'].includes(event.type)",test:'adversarial-compositions',pattern:'stop-before-invalidation'},
  {id:'discard_stale_settlement',file:core,from:"!['pause','stop','reasoning_result'].includes(event.type)",to:"!['pause','stop'].includes(event.type)",test:'adversarial-compositions',pattern:'settlement-before-invalidation'}
];
function run(output){
  fs.mkdirSync(output,{recursive:false});const temp=fs.mkdtempSync(path.join(os.tmpdir(),'interview-negative-'));const records=[];
  try{
    for(const dir of ['packages/domain/interview-journey','packages/career-interview-journey','tests/career-interview-journey','scripts/career/interview-journey'])fs.cpSync(path.join(root,dir),path.join(temp,dir),{recursive:true});
    for(const c of cases){
      const command=['--test','--test-name-pattern',c.pattern,'tests/career-interview-journey/'+c.test+'.test.cjs'];
      const baseline=spawnSync(process.execPath,command,{cwd:temp,encoding:'utf8'});assert.equal(baseline.status,0,c.id+' baseline must pass: '+baseline.stdout+baseline.stderr);
      const file=path.join(temp,c.file),source=fs.readFileSync(file,'utf8');assert.equal(source.split(c.from).length-1,1,c.id+' mutation anchor must be unique');const changed=source.replace(c.from,c.to);fs.writeFileSync(file,changed);
      const mutant=spawnSync(process.execPath,command,{cwd:temp,encoding:'utf8'});fs.writeFileSync(file,source);
      const log=mutant.stdout+mutant.stderr;fs.writeFileSync(path.join(output,c.id+'.log'),log,{flag:'wx'});
      const caught=mutant.status===1&&log.includes('AssertionError')&&!/SyntaxError|MODULE_NOT_FOUND/.test(log);
      records.push({id:c.id,file:c.file,pattern:c.pattern,baseline_exit:baseline.status,mutant_exit:mutant.status,caught,mutant_source_sha256:crypto.createHash('sha256').update(changed).digest('hex'),log_sha256:crypto.createHash('sha256').update(log).digest('hex'),command:[process.execPath,...command]});
      if(!caught)throw Error('Negative control not caught by assertion: '+c.id+'\n'+log);
    }
  }finally{fs.rmSync(temp,{recursive:true,force:true});fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({label:'OFFLINE_SCRIPTED_NEGATIVE_CONTROLS',controls:records,total:cases.length,caught:records.filter(r=>r.caught).length,semantic_accuracy:'NOT_MEASURED',provider_calls:0},null,2)+'\n',{flag:'wx'});}
  return records;
}
if(require.main===module){const i=process.argv.indexOf('--output');if(i<0)throw Error('--output <new-directory> required');const records=run(path.resolve(process.argv[i+1]));console.log(records.length+'/'+cases.length+' intentional defects caught by assertions');}
module.exports={run,cases};
