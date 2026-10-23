// Walk agent-chat's static import graph from index-career.ts; print files, tables (.from), rpcs (.rpc), env names.
const fs=require("fs"),path=require("path");
const root=path.join(process.argv[2],"supabase/functions"), entry=path.join(root,process.argv[3]||"agent-chat/index-career.ts");
const RE=/(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const seen=new Set(),q=[entry],tables=new Set(),rpcs=new Set(),env=new Set();
while(q.length){const f=q.pop(); if(seen.has(f))continue; if(!fs.existsSync(f)){console.error("MISSING",f);continue;} seen.add(f);
 const s=fs.readFileSync(f,"utf8"); let m; RE.lastIndex=0;
 while((m=RE.exec(s))){const sp=m[1]||m[2]||m[3]; if(sp.startsWith(".")) q.push(path.resolve(path.dirname(f),sp));}
 for(const x of s.matchAll(/\.from\(\s*["'`]([a-z_0-9]+)["'`]/g)) tables.add(x[1]);
 for(const x of s.matchAll(/\.rpc\(\s*["'`]([a-z_0-9]+)["'`]/g)) rpcs.add(x[1]);
 for(const x of s.matchAll(/(?:Deno\.env\.get|env)\(\s*["'`]([A-Z_0-9]+)["'`]/g)) env.add(x[1]);
}
const out={files:[...seen].map(f=>path.relative(root,f)).sort(),tables:[...tables].sort(),rpcs:[...rpcs].sort(),env:[...env].sort()};
console.log(JSON.stringify(out));
