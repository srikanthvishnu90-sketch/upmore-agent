'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
module.exports=async name=>{
 const root=path.resolve(__dirname,'../../packages/career-contracts'),context=vm.createContext({TextEncoder,TextDecoder,URL,crypto:require('node:crypto').webcrypto}),cache=new Map();
 function load(file){file=path.resolve(file);if(!file.startsWith(root+path.sep))throw Error('contract import escaped package');if(cache.has(file))return cache.get(file);const m=new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{mode:'transform'}),{context,identifier:file});cache.set(file,m);return m;}
 const m=load(path.join(root,name));await m.link((id,parent)=>{if(!id.startsWith('./'))throw Error('non-local contract import');return load(path.resolve(path.dirname(parent.identifier),id));});await m.evaluate();return m.namespace;
};
