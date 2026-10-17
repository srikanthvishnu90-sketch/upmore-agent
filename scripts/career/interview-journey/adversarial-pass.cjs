'use strict';
// Structural completion ledger; no provider, actual entry or durability claims.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{cases,runCase}=require('../../../tests/career-interview-journey/adversarial-compositions.cjs');
const root=path.resolve(__dirname,'../../..'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function run(output,producerRef){assert.match(producerRef,/^[a-f0-9]{40}$/);fs.mkdirSync(output,{recursive:false});const ledger=[];
  for(const spec of cases){const r=runCase(spec),filename=spec.id+'.trace.json',bytes=JSON.stringify(r.trace,null,2)+'\n';fs.writeFileSync(path.join(output,filename),bytes);delete r.trace;ledger.push({...r,trace:filename,trace_sha256:hash(bytes)});}
  const handlerPath='supabase/functions/agent-chat/handler-career.ts',handler=execFileSync('git',['show',producerRef+':'+handlerPath],{cwd:root});
  ledger.push({id:'actual-entry-journey',expected:'A actual career entry routes an owned synthetic interview journey through interruption, terminal settlement, current feedback and authorized artifact readback.',outcome:'blocked',proof:'ACTUAL_ENTRY_NOT_RUN',producer_ref:producerRef,inspected_path:handlerPath,sha256:hash(handler),reason:/planInterviewTurn|CareerInterviewJourney|interview-journey/.test(handler.toString())?'Entry marker requires A-owned event/proof/persistence harness before an end-to-end claim.':'Published A handler has no B interview registration; context-only projection cannot execute this task.',required_owner:'A/Muse'});
  const result={label:'BOUNDED_BUILDER_AUTHORED_STRUCTURAL_PASS',baseline_or_source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scenarios:ledger,counts:Object.fromEntries(['completed','failed','blocked'].map(k=>[k,ledger.filter(r=>r.outcome===k).length])),provider_calls:0,semantic_quality:'NOT_RUN',actual_entry:'BLOCKED',deployment:'NOT_RUN'};fs.writeFileSync(path.join(output,'ledger.json'),JSON.stringify(result,null,2)+'\n');return result;
}
if(require.main===module){const value=k=>process.argv[process.argv.indexOf(k)+1],r=run(path.resolve(value('--output')),value('--producer-ref'));console.log(JSON.stringify({counts:r.counts,provider_calls:r.provider_calls,actual_entry:r.actual_entry}));process.exitCode=r.counts.failed?1:r.counts.blocked?2:0;}
module.exports={run};
