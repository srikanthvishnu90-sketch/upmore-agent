'use strict';
// Whole root Node selection, including isolated SQL suites. No remote database,
// credentials, campaign funding, browser, or provider call is configured here.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),argv=process.argv.slice(2);
if(argv.some(x=>!['--postgres-only','--source-only'].includes(x)))throw Error('Only explicit source/SQL selection flags are supported');
if(argv.includes('--postgres-only')&&argv.includes('--source-only'))throw Error('Conflicting test selection');
for(const k of ['CAREER_TEST_CONTAINER','CAREER_TEST_DATABASE','CAREER_TEST_PORT'])if(process.env[k])throw Error('Refusing inherited/shared SQL target: '+k);
const token=crypto.randomBytes(8).toString('hex'),out=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-ci-node-'));
const run=(bin,args,extra={})=>execFileSync(bin,args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],...extra}).trim();
const dependencyDir=path.join(__dirname,'node_modules');
require(require.resolve('pg',{paths:[__dirname]}));
run(process.execPath,['--experimental-vm-modules','-e',"if(typeof require('node:vm').SourceTextModule!=='function')process.exit(1)"]);
run('python3',['-c','import docx;print(docx.__version__)']);
run('pdftotext',['-v']);run('pdfinfo',['-v']);
const testsRoot=path.join(root,'tests');
function criticalTests(relative){const dir=path.join(testsRoot,relative);if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?criticalTests(path.join(relative,e.name)):e.isFile()&&e.name.endsWith('.test.cjs')?[path.join(relative,e.name)]:[]);}
const all=[...fs.readdirSync(testsRoot).filter(x=>x.endsWith('.cjs')),...criticalTests('career-critical-repairs'),...criticalTests('career-interview-journey')].sort();
const sqlFiles=all.filter(x=>x.endsWith('-postgres.test.cjs')||x==='privacy-research-composition.test.cjs'||/process\.env\.CAREER_TEST_(?:CONTAINER|DATABASE|PORT)/.test(fs.readFileSync(path.join(root,'tests',x),'utf8')));
const sourceFiles=all.filter(x=>!sqlFiles.includes(x));
const selected=argv.includes('--source-only')?sourceFiles:argv.includes('--postgres-only')?sqlFiles:all;
const summary={token,commit:run('git',['rev-parse','HEAD']),evidenceTier:'MOCK_CONTRACT_AND_LOCAL_POSTGRES',selection:argv.length?argv[0]:'WHOLE_ROOT_NODE_SELECTION',rootFiles:all.length,selectedFiles:selected.length,sqlFiles,started:new Date().toISOString(),runs:[],out,paidCalls:0,browserOutcomes:0};
console.log(JSON.stringify({preflight:'LOCAL_SYNTHETIC_CI_FIXTURE',...summary}));
function test(files,env,label){
 const args=['--experimental-vm-modules','--test','--test-concurrency=1',...files.map(x=>'tests/'+x)];
 const r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout:900000,maxBuffer:64*1024*1024});
 const log=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(out,label+'.log'),log);process.stdout.write(log);
 summary.runs.push({label,files,command:[process.execPath,...args],exitCode:r.status,error:r.error?.message});
}
const image='postgres:16@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d';
const container='upmore-career-integration-pg-ci-'+token,ready=path.join(out,'wire-ready.json');let wire,created=false;
const docker=(args,input)=>run('docker',args,input===undefined?{}:{input});
const ddl=['tests/fixtures/career-persistence-schema.sql','supabase/migrations/20261015020000_career_watch_kv.sql','supabase/migrations/20261015234000_career_task_intents_v1.sql','supabase/sql/proposals/career_public_research_v1.sql','supabase/sql/proposals/career_model_budget_v1.sql','supabase/sql/proposals/career_model_context_v2.sql','tests/fixtures/model-gateway-independent/monthly-schema.sql','supabase/migrations/20261010110000_model_call_budget.sql'];
async function main(){try{
 if(!argv.includes('--postgres-only'))test(sourceFiles,{},'source');
 if(!argv.includes('--source-only')){
  if(spawnSync('docker',['inspect',container],{stdio:'ignore'}).status===0)throw Error('Refusing existing fixture container');
  docker(['run','--detach','--name',container,'--network','none','--label','upmore.ci-fixture='+token,'-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
  // Bootstrap briefly exposes a socket-only server which is then stopped.
  // Waiting for loopback TCP proves readiness of the final owned server.
  let up=false;for(let i=0;i<100;i++){if(spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore'}).status===0){up=true;break;}await new Promise(r=>setTimeout(r,100));}if(!up)throw Error('Owned fixture failed readiness');
  if(docker(['inspect','--format','{{.HostConfig.NetworkMode}}',container])!=='none')throw Error('Fixture network mode mismatch');
  docker(['exec',container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-c','create role anon nologin;create role authenticated nologin;create role service_role nologin;']);
  wire=spawn(process.execPath,[path.join(root,'scripts/career/research-review/local-pg-wire.cjs'),container,ready],{stdio:['ignore',fs.openSync(path.join(out,'wire.log'),'w'),fs.openSync(path.join(out,'wire-errors.log'),'w')]});
  for(let i=0;!fs.existsSync(ready)&&i<100;i++)await new Promise(r=>setTimeout(r,50));
  const info=JSON.parse(fs.readFileSync(ready));if(info.container!==container||info.host!=='127.0.0.1')throw Error('Unexpected fixture wire');
  summary.fixture={container,network:'none',image,databaseVersion:docker(['exec',container,'psql','-X','-qAt','-U','postgres','-c','select version()'])};
  for(const [i,file]of sqlFiles.entries()){
   const db='career_test_ci_'+token+'_'+i;docker(['exec',container,'createdb','-U','postgres',db]);
   docker(['exec',container,'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-c',"comment on database "+db+" is 'upmore-ci-fixture:"+token+"';"]);
   const marker=docker(['exec',container,'psql','-X','-qAt','-U','postgres','-d',db,'-c',"select shobj_description(oid,'pg_database')from pg_database where datname=current_database()"]);if(marker!=='upmore-ci-fixture:'+token)throw Error('Unidentified database refused');
   console.log(JSON.stringify({fixture:'LOCAL_NETWORK_NONE_SYNTHETIC',file,database:db,marker}));
   for(const f of ddl)docker(['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],fs.readFileSync(path.join(root,f),'utf8'));
   test([file],{CAREER_TEST_CONTAINER:container,CAREER_TEST_DATABASE:db,CAREER_TEST_PORT:String(info.port),NODE_PATH:[dependencyDir,process.env.NODE_PATH].filter(Boolean).join(path.delimiter)},'postgres-'+i);
   fs.writeFileSync(path.join(out,'postgres-'+i+'.schema.sql'),docker(['exec',container,'pg_dump','-U','postgres','--schema-only','--no-owner','--no-privileges',db]));
  }
 }
}catch(e){summary.setupError=e.message;console.error(e.stack);}
finally{
 if(wire&&wire.exitCode===null&&wire.signalCode===null){wire.kill('SIGTERM');await new Promise(r=>wire.once('exit',r));}
 if(created){if(docker(['inspect','--format','{{index .Config.Labels "upmore.ci-fixture"}}',container])!==token)throw Error('Owned fixture label changed');docker(['rm','--force',container]);summary.ownedFixtureRemoved=true;}
 summary.finished=new Date().toISOString();summary.pass=!summary.setupError&&summary.runs.length>0&&summary.runs.every(x=>x.exitCode===0);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));process.exitCode=summary.pass?0:1;
}}
main().catch(e=>{console.error(e);process.exitCode=1;});
