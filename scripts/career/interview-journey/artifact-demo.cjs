'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {run}=require('./scripted-scenario.cjs');
const Artifact=require('../../../packages/career-interview-journey/adapters/artifact.js');
function demo(directory){
  fs.mkdirSync(directory,{recursive:false}); // Unique output only; never overwrite a failed run.
  const {session,proposal}=run();const payload=Artifact.payload(proposal);
  assert.equal(proposal.args.pack.status,'complete');assert.equal(proposal.args.pack.sections.length,10);
  fs.writeFileSync(path.join(directory,payload.filename),payload.content,{encoding:'utf8',flag:'wx'});
  fs.writeFileSync(path.join(directory,'prep-pack.json'),JSON.stringify(proposal.args.pack,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(directory,'local-sink.json'),JSON.stringify({state:session.state,snapshot:session.snapshot,proposal})+'\n',{flag:'wx'});
  const child=spawnSync(process.execPath,[path.join(__dirname,'reopen.cjs'),directory],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);
  const reopened=JSON.parse(child.stdout);assert.equal(reopened.next_state.stage,'completed');assert.equal(reopened.next_state.completion.artifact.readback_status,'verified');
  const report={label:'OFFLINE_SCRIPTED_CONTRACT_FILE_SINK',episodes:1,user_improvement:'NOT_MEASURED',provider_quality:'NOT_RUN',real_provider_calls:0,production_host_durability:'NOT_RUN',actual_entry_integration:'BLOCKED_A_CONTRACT_AND_ENTRY',artifact:{filename:payload.filename,sha256:payload.sha256,byte_length:payload.byte_length,mime_type:payload.mime_type,fresh_process_readback:true,structured_sha256:payload.structured_sha256},memory:{storage:{pass:1,total:1,scope:'local JSON/file round trip only'},retrieval:{pass:session.turns.filter(t=>t.proposed_actions.some(a=>a.type==='coach_answer')).length,total:session.state.attempts.length,scope:'exact scripted request binding'},use:{pass:0,total:0,status:'NOT_RUN_REAL_PROVIDER'}}};
  fs.writeFileSync(path.join(directory,'ordered-turns.json'),JSON.stringify(session.turns,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(require.main===module){const i=process.argv.indexOf('--output');if(i<0)throw Error('--output <new-existing-parent/new-directory> required');console.log(JSON.stringify(demo(path.resolve(process.argv[i+1])),null,2));}
module.exports={demo};
