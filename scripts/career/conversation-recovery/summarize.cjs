'use strict';
// Pure evidence readback; never executes a run or changes the frozen oracle.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),base=path.join(root,'docs/testing/runs/conversation-recovery-20261016');
const frozen=path.join(root,'tests/fixtures/conversation-recovery'),manifest=JSON.parse(fs.readFileSync(path.join(frozen,'freeze.json')));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [p,h]of Object.entries(manifest.files))if(hash(path.join(frozen,p))!==h)throw Error('Freeze mismatch '+p);
const summary={expectationsUnchanged:true,modelQuality:'NOT_EVALUATED',browserCompleted:0,browserPlanned:15,runs:[]};
const labels=process.argv.slice(2);if(!labels.length)labels.push('release-first','integration-first','capability2-first','release-current-first');
for(const name of labels){const dir=path.join(base,name),m=JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'))),ts=fs.readFileSync(path.join(dir,'transcripts.jsonl'),'utf8').trim().split('\n').map(JSON.parse);if(ts.length!==83||m.turns!==83||m.checks!==543)throw Error('Incomplete run '+name);if(ts.some(t=>t.result.networkAttempts||t.result.body.action!=null))throw Error('Unexpected effect '+name);summary.runs.push({label:name,commit:m.commit,turns:m.turns,checks:m.checks,passed:m.passed,failed:m.failed,failedConversations:m.cases.filter(c=>c.failed).length,unmatchedFallbacks:ts.filter(t=>/^I didn't catch/.test(t.result.body.reply||'')).length,externalNetworkAttempts:m.networkAttempts,transcriptSha256:hash(path.join(dir,'transcripts.jsonl')),started:m.started,finished:m.finished});}
fs.writeFileSync(path.join(base,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
