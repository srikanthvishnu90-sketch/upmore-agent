import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
globalThis.Deno={
 args:process.argv.slice(2),cwd:()=>process.cwd(),
 readTextFileSync:p=>fs.readFileSync(p,'utf8'),readFileSync:p=>new Uint8Array(fs.readFileSync(p)),
 writeTextFileSync:(p,s)=>fs.writeFileSync(p,s),mkdirSync:(p,o)=>fs.mkdirSync(p,o),
 statSync:p=>{const s=fs.statSync(p);return {isDirectory:s.isDirectory(),isFile:s.isFile(),size:s.size};},
 readDirSync:p=>fs.readdirSync(p,{withFileTypes:true}).map(e=>({name:e.name,isDirectory:e.isDirectory(),isFile:e.isFile()})),
 env:{get:()=>undefined},exit:code=>process.exit(code),
 Command:class {constructor(bin,opts){if(bin!=='node'||JSON.stringify(opts.args)!==JSON.stringify(['evals/scenarios/report.cjs','--check']))throw Error('Unsupported evaluator child');this.bin=bin;this.opts=opts;}outputSync(){const r=spawnSync(this.bin,this.opts.args,{cwd:this.opts.cwd,encoding:null});return {code:r.status,success:r.status===0,stdout:new Uint8Array(r.stdout||[]),stderr:new Uint8Array(r.stderr||[])};}}
};
globalThis.fetch=async()=>{throw Error('External HTTP disabled in the offline evaluator compatibility run');};
await import(pathToFileURL(process.cwd()+'/evals/agent/run.ts'));
