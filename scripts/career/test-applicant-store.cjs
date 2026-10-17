'use strict';
// Ephemeral local-only PostgreSQL: pinned free image, no network/ports/volume,
// no credentials/prod URL. Actual source migrations/proposals, synthetic rows.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),suffix=crypto.randomBytes(6).toString('hex'),container='upmore-career-integration-pg-applicant-'+suffix,database='career_test_applicant_'+suffix;
const image='postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';let created=false;
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});
function sql(text,db='postgres'){return execFileSync('docker',['exec','-i',container,'psql','-X','-q','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']});}
try{
 // Never pull implicitly; the operator can supply this public image separately.
 docker(['image','inspect',image]);
 docker(['run','-d','--name',container,'--network','none','--memory=384m','--cpus=1','--pids-limit=128','--tmpfs','/var/lib/postgresql/data:rw,size=256m','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
 const deadline=Date.now()+20000;while(true){try{if(!docker(['logs',container]).includes('PostgreSQL init process complete; ready for start up.'))throw Error('initialization still running');docker(['exec',container,'pg_isready','-U','postgres']);break;}catch(error){if(Date.now()>deadline)throw Error('Isolated PostgreSQL did not become ready');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);}}
 sql('create role service_role nologin bypassrls;create role anon nologin;create role authenticated nologin;create database '+database+';');
 const files=['tests/fixtures/career-persistence-schema.sql','supabase/migrations/20261015020000_career_watch_kv.sql','supabase/migrations/20261015234000_career_task_intents_v1.sql','supabase/sql/proposals/career_public_research_v1.sql','supabase/sql/proposals/career_owned_claim_recovery_v1.sql','supabase/sql/proposals/career_applicant_resume_store_v1.sql'];
 if(process.argv.includes('--ingress'))files.push('supabase/sql/proposals/career_applicant_ingress_v1.sql');
 for(const f of files)sql(fs.readFileSync(path.join(root,f),'utf8'),database);
 console.log(JSON.stringify({verification:'ISOLATED_POSTGRES_SYNTHETIC_APPLICANT_DATA',image,network:'none',persistentVolumes:0,sourceFiles:files,productionMutations:0}));
 const extra=process.argv.filter(x=>x.startsWith('--test-name-pattern='));
 const suites=['tests/career-applicant-store-postgres.test.cjs','tests/career-public-research-postgres.test.cjs','tests/career-claim-recovery-postgres.test.cjs'];if(process.argv.includes('--ingress'))suites.unshift('tests/career-applicant-ingress-postgres.test.cjs');
 const result=spawnSync(process.execPath,[...extra,'--experimental-vm-modules','--test','--test-concurrency=1',...suites],{cwd:root,env:{...process.env,CAREER_TEST_CONTAINER:container,CAREER_TEST_DATABASE:database},stdio:'inherit'});process.exitCode=result.status??1;
}catch(error){console.error('Applicant-store local verification failed: '+String(error.stderr||error.message));process.exitCode=1;}
finally{if(created){try{docker(['rm','-f',container]);}catch(_){console.error('LOCAL_CONTAINER_CLEANUP_FAILED '+container);process.exitCode=1;}}}
