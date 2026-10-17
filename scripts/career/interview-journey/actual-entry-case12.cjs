'use strict';
// Own exactly one positively marked, network-none PostgreSQL fixture. Executes
// the pinned A snapshot unchanged and B-owned review probes in separate Node PIDs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync,spawnSync}=require('node:child_process');
const value=k=>{const i=process.argv.indexOf(k);assert.ok(i>=0&&process.argv[i+1],k+' required');return process.argv[i+1];};
const target=path.resolve(value('--target')),out=path.resolve(value('--output')),EXPECTED='5c8c83263e19970e9c7a1485c0249769d453b5d7',B_SOURCE='b414b042254ad9764ff546906a32d4aec8bbfe4e';
const git=args=>execFileSync('git',args,{cwd:target,encoding:'utf8'}).trim(),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(git(['rev-parse','HEAD']),EXPECTED);assert.equal(git(['status','--porcelain']),'');assert.equal(git(['diff',B_SOURCE,'--','packages/domain/interview-journey','packages/career-interview-journey']),'');
for(const key of ['CAREER_TEST_CONTAINER','CAREER_TEST_DATABASE','CAREER_TEST_PORT','CAREER_TEST_FIXTURE_TOKEN'])assert.ok(!process.env[key],'refuse inherited database target');
fs.mkdirSync(out,{recursive:false});const token=crypto.randomBytes(8).toString('hex'),container='upmore-career-integration-pg-bcase12-'+token,database='career_test_case12_'+token;
const image='postgres:16@sha256:ca0bd484cb98bf4b24eb1010e73fb3fcbd6714d240fbc1a10eea5b7dbecb641d';
const driver=fs.readFileSync(path.join(target,'scripts/career/critical-repairs/ci-node.cjs'),'utf8'),ddl=JSON.parse(driver.match(/const ddl=(\[.*?\]);/s)[1].replaceAll("'",'"'));
const report={target_commit:EXPECTED,B_source:B_SOURCE,driver_sha256:sha(fs.readFileSync(__filename)),controlled_probe_sha256:sha(fs.readFileSync(path.resolve(__dirname,'../../../evals/career-interview-journey/actual-entry-case12-phase.cjs'))),fixture:{container,database,token,image,network:'none'},ddl_sha256:Object.fromEntries(ddl.map(f=>[f,sha(fs.readFileSync(path.join(target,f)))])),runs:[],outcome:'blocked',real_provider_requests:0,quality:'NOT_RUN'};
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();let created=false;
async function main(){try{
 assert.notEqual(spawnSync('docker',['inspect',container],{stdio:'ignore'}).status,0);docker(['run','--detach','--name',container,'--network','none','--label','upmore.ci-fixture='+token,'-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
 let ready=false;for(let i=0;i<100;i++){if(spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore'}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'owned PostgreSQL readiness');assert.equal(docker(['inspect','--format','{{.HostConfig.NetworkMode}}',container]),'none');
 docker(['exec',container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-c','create role anon nologin;create role authenticated nologin;create role service_role nologin;']);docker(['exec',container,'createdb','-U','postgres',database]);docker(['exec',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-c',"comment on database "+database+" is 'upmore-ci-fixture:"+token+"';"]);
 for(const file of ddl)docker(['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],fs.readFileSync(path.join(target,file),'utf8'));
 for(const phase of ['before','after','reopen']){
  const cmd=['--experimental-vm-modules',path.resolve(__dirname,'../../../evals/career-interview-journey/actual-entry-case12-phase.cjs'),phase],r=spawnSync(process.execPath,cmd,{env:{...process.env,UPMORE_CASE12_TARGET:target,UPMORE_CASE12_OUTPUT:out,CAREER_TEST_CONTAINER:container,CAREER_TEST_DATABASE:database,CAREER_TEST_FIXTURE_TOKEN:token},encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});const log=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(out,phase+'.log'),log);report.runs.push({phase,command:[process.execPath,...cmd],exit_code:r.status,error:r.error?.message,log:phase+'.log',sha256:sha(log)});if(r.status!==0){report.outcome='failed';break;}
 }
 if(report.runs.length===3&&report.runs.every(r=>r.exit_code===0))report.outcome='completed';
 report.A_worktree_after=git(['status','--porcelain']);assert.equal(report.A_worktree_after,'');
 }catch(e){report.setup_error={name:e.name,message:e.message};process.exitCode=1;}finally{
  if(created){assert.equal(docker(['inspect','--format','{{index .Config.Labels "upmore.ci-fixture"}}',container]),token);docker(['rm','--force',container]);report.owned_fixture_removed=true;}
  report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({outcome:report.outcome,runs:report.runs.map(r=>[r.phase,r.exit_code]),setup_error:report.setup_error,out}));if(report.outcome!=='completed')process.exitCode=1;
 }}main().catch(e=>{console.error(e);process.exitCode=1;});
