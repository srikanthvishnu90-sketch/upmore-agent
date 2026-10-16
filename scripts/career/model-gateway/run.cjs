'use strict';
// Reproducible zero-cost evidence. SQL funding is synthetic and local only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),[label,group]=process.argv.slice(2);
if(!/^[-a-z0-9]+$/.test(label||'')||!['contracts','postgres'].includes(group))throw Error('unique-label contracts|postgres');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),out=path.join(root,'docs/testing/runs/career-model-gateway-20261016',label);
fs.mkdirSync(out); // never replace an earlier run
const env={...process.env,RESEARCH_REVIEW_TRANSCRIPTS:path.join(out,'transcripts.jsonl')};
env.NODE_OPTIONS=(env.NODE_OPTIONS||'')+' --require='+path.join(root,'tests/helpers/career-entry-recorder.cjs');
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
let database;const container='upmore-career-integration-pg-recovery';
const ddl=['tests/fixtures/career-persistence-schema.sql','supabase/migrations/20261015020000_career_watch_kv.sql','supabase/migrations/20261015234000_career_task_intents_v1.sql','supabase/sql/proposals/career_public_research_v1.sql','supabase/sql/proposals/career_model_budget_v1.sql'];
if(group==='postgres'){
 if(docker(['inspect','--format','{{.HostConfig.NetworkMode}}',container])!=='none')throw Error('Explicit network-none local fixture required');
 database='career_test_model_'+label.replaceAll('-','_');docker(['exec',container,'createdb','-U','postgres',database]);
 for(const f of ddl)docker(['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],fs.readFileSync(path.join(root,f),'utf8'));
 Object.assign(env,{CAREER_TEST_CONTAINER:container,CAREER_TEST_DATABASE:database});
}
const files=['supabase/functions/agent-chat/handler-career.ts','supabase/functions/agent-chat/index-career.ts','supabase/functions/_shared/career_model_reply.ts','supabase/functions/_shared/model_gateway.ts','supabase/functions/_shared/model_calls.ts','supabase/functions/_shared/identity_redact.ts','supabase/functions/_shared/career_host.js','supabase/functions/_shared/career_persistence.js','supabase/functions/_shared/router_core.career.js','packages/domain/130-career-onboarding.js',...ddl,'tests/fixtures/career-model-gateway/freeze.json','tests/career-model-gateway.test.cjs','tests/career-model-budget-postgres.test.cjs','tests/helpers/career-model-fixture.cjs','tests/helpers/career-staged-entry.cjs','tests/helpers/career-entry-recorder.cjs'];
const test=group==='postgres'?'tests/career-model-budget-postgres.test.cjs':'tests/career-model-gateway.test.cjs',args=['--experimental-vm-modules','--test','--test-concurrency=1',test];
const meta={group,label,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),started:new Date().toISOString(),frozenExpectationsCommit:'bfb1d163',sourceFiles:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(root,f)))])),command:[process.execPath,...args],database,paidCalls:0,realProviderRequests:0,modelQuality:'NOT_RUN',browserOutcomes:0,verification:group==='postgres'?'ACTUAL_STAGED_ENTRY_REAL_LOCAL_POSTGRES_SYNTHETIC_AUTH_AND_PROVIDER_MONTHLY_RPC_INJECTED':'ACTUAL_STAGED_ENTRY_SYNTHETIC_DATABASE_AND_PROVIDER'};
fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify(meta,null,2)+'\n');
const run=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024}),log=(run.stdout||'')+(run.stderr||'');
fs.writeFileSync(path.join(out,'test.log'),log);
if(database){const dump=execFileSync('docker',['exec',container,'pg_dump','-U','postgres','--no-owner','--no-privileges',database]);fs.writeFileSync(path.join(out,'final-local-database.sql.gz'),zlib.gzipSync(dump));}
Object.assign(meta,{finished:new Date().toISOString(),exitCode:run.status,error:run.error?.message,logSha256:sha(log),transcriptSha256:fs.existsSync(env.RESEARCH_REVIEW_TRANSCRIPTS)?sha(fs.readFileSync(env.RESEARCH_REVIEW_TRANSCRIPTS)):null});fs.writeFileSync(path.join(out,'metadata.json'),JSON.stringify(meta,null,2)+'\n');process.stdout.write(log);process.exitCode=run.status??2;
