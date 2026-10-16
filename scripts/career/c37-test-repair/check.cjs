'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),[label]=process.argv.slice(2);if(!/^[-a-z0-9]+$/.test(label||''))throw Error('New evidence label required');
const out=path.join(root,'docs/testing/runs/career-c37-test-repair-20261016',label);fs.mkdirSync(out);
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'upmore-c37-negative-')),target=path.join(temp,'repo');
const args=['--test','--test-name-pattern=R2A guard: C37 persists','tests/career-gauntlet-r2a.test.cjs'];
function run(name){const r=spawnSync(process.execPath,args,{cwd:target,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});const log=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(out,name+'.log'),log);return {exitCode:r.status,log};}
execFileSync('git',['worktree','add','--quiet','--detach',target,commit],{cwd:root});const results=[];
try{
 const baseline=run('repaired-guard');if(baseline.exitCode!==0)throw Error('Repaired guard must pass before applying defects');
 for(const s of require(path.join(root,'evals/career-c37-test-repair.mutations.cjs'))){const file=path.join(target,s.file),source=fs.readFileSync(file,'utf8');if(source.split(s.from).length!==2)throw Error('Nonunique mutation anchor '+s.id);try{fs.writeFileSync(file,source.replace(s.from,s.to));const r=run(s.id),killed=r.exitCode===1&&/ERR_ASSERTION/.test(r.log)&&!/(SyntaxError|Unexpected token)/.test(r.log);results.push({id:s.id,sourceFile:s.file,exitCode:r.exitCode,killed});process.stdout.write(s.id+' '+(killed?'KILLED':'NOT_KILLED')+'\n');}finally{fs.writeFileSync(file,source);}}
}finally{execFileSync('git',['worktree','remove','--force',target],{cwd:root});fs.rmSync(temp,{recursive:true,force:true});}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({commit,command:[process.execPath,...args],baseline:'PASS',verification:'DISPOSABLE_LOCAL_INTENTIONAL_DEFECTS_NO_EXTERNAL_TRANSPORT',paidCalls:0,results},null,2)+'\n');process.exitCode=results.length===4&&results.every(x=>x.killed)?0:1;
