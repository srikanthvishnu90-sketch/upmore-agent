'use strict';
// MOCK_CONTRACT only. Targeted synthetic packages; no private writing fixtures,
// credentials, provider, database or browser are copied or invoked.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),label=process.argv[2];if(!/^[-a-z0-9]+$/.test(label||'')||process.argv.length!==3)throw Error('unique label required');
const out=path.join(root,'docs/career/critical-repairs/b-composition',label);fs.mkdirSync(out);
const file='packages/career-contracts/interview-context-compat-v1.ts';
const cases=[
 ['version_zero','canonical version zero survives','x.item_version>=0','x.item_version>0'],
 ['owner','changed context bytes and foreign evidence',"if(!validateJourneyContractV1('CareerContextSnapshotV1',input).ok)",'if(false)'],
 ['context_digest','changed context bytes and foreign evidence','if(await interviewContextDigestV1(s)!==s.binding.context_sha256)','if(false)'],
 ['source_digest','actual source bytes must match','if(await digest(source.content,true)!==source.source_sha256)','if(false)'],
 ['source_to_person','public-source provenance',"&&['user_report','user_pasted'].includes(f.provenance.kind)&&f.provenance.trust==='user_reported'",''],
 ['role_inference','software-looking title alone',"role_family:classification('target_role_family')","role_family:classification('target_role_family')||'software_engineering'"],
 ['classification_dependency','explicit classification versions',"kind:helpers.has(f.kind)&&related(f)?'interview_guidance':f.kind",'kind:f.kind'],
 ['ambiguous_target','multiple targets require',"if(rows.length>1)throw Error(kind+'_selection_required');",''],
 ['unrelated_goal','unrelated goal changes',"reason==='goal_changed'&&targetIds.has(id)?'target_changed':null","reason==='goal_changed'?'target_changed':null"],
 ['source_classification','source supersession is resume replacement',"resumeIds.has(id)?'resume_replaced':'correction'","true?'resume_replaced':'correction'"],
 ['resume_version','new resume source version',"if(!source||f.provenance.record_id!==source.id||f.provenance.revision!==source.item_version)continue;",'if(!source)continue;'],
 ['missing_proof','available canonical capability',"status:unwired?'not_wired':c.availability",'status:c.availability']
];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-context-controls-')),results=[];
const command=pattern=>['--experimental-vm-modules','--test',...(pattern?['--test-name-pattern',pattern]:[]),'tests/career-critical-repairs/interview-context-compat.test.cjs'];
const run=pattern=>spawnSync(process.execPath,command(pattern),{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH}});
let baseline=false;
try{
 for(const dir of ['packages/career-contracts','packages/domain/interview-journey','packages/career-interview-journey','tests/career-critical-repairs','tests/fixtures/career-critical-repairs/interview-context-v1'])fs.cpSync(path.join(root,dir),path.join(temp,dir),{recursive:true});
 const base=run();fs.writeFileSync(path.join(out,'baseline.log'),(base.stdout||'')+(base.stderr||''));if(base.status!==0)throw Error('Unmutated compatibility baseline is red');baseline=true;
 const target=path.join(temp,file),source=fs.readFileSync(target,'utf8');
 for(const [id,pattern,find,replace]of cases){
  if(source.split(find).length!==2)throw Error(id+' anchor must match exactly once');
  fs.writeFileSync(target,source.replace(find,replace));let result;
  try{result=run(pattern);}finally{fs.writeFileSync(target,source);}
  const log=(result.stdout||'')+(result.stderr||''),killed=result.status===1&&/ERR_ASSERTION|AssertionError/.test(log)&&!/SyntaxError|MODULE_NOT_FOUND/.test(log);
  fs.writeFileSync(path.join(out,id+'.log'),log);results.push({id,pattern,killed,exit_code:result.status,log_sha256:crypto.createHash('sha256').update(log).digest('hex')});console.log(id+' '+(killed?'KILLED':'NOT_KILLED'));
 }
}finally{
 fs.rmSync(temp,{recursive:true,force:true});
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtime_sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),tier:'MOCK_CONTRACT',baseline_all_green:baseline,results,provider_quality:'NOT_RUN',provider_calls:0,browser_outcomes:0},null,2)+'\n');
}
if(!baseline||results.length!==cases.length||results.some(x=>!x.killed))process.exitCode=1;
