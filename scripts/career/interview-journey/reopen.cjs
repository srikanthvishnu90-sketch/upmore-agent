'use strict';
// Offline test sink only. Reads explicit local fixture files; no database/API.
const fs=require('node:fs'),path=require('node:path');
const J=require('../../../packages/domain/interview-journey/index.js');
const H=require('../../../packages/domain/interview-journey/hash.js');
const F=require('../../../tests/career-interview-journey/fixtures.cjs');
const {savedArtifact}=require('../../../tests/career-interview-journey/scripted-host.cjs');
function reopen(directory){
  const input=JSON.parse(fs.readFileSync(path.join(directory,'local-sink.json'),'utf8'));
  J.validateState(input.state);
  const content=fs.readFileSync(path.join(directory,'interview-preparation.md'),'utf8');
  if(H.sha256(content)!==input.proposal.args.manifest.sha256)throw Error('local sink bytes changed');
  const local={snapshot:input.snapshot,state:input.state};
  const receipt=savedArtifact(local,input.proposal,content);
  return J.planInterviewTurn({snapshot:local.snapshot,state:local.state,event:F.event('fresh-process-readback','artifact_readback',{receipt_id:receipt.id})});
}
if(require.main===module){try{const result=reopen(process.argv[2]);process.stdout.write(JSON.stringify(result));}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
module.exports={reopen};
