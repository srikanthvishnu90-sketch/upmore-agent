'use strict';
// Test-only preload: preserve staged-entry behavior and record its synthetic
// request/response arguments. Never inspect headers, credentials or env values.
const fs=require('node:fs'),Module=require('node:module');
const load=Module._load,wrapped=new WeakMap();
Module._load=function(request,parent,isMain){const original=load.apply(this,arguments);let file;try{file=Module._resolveFilename(request,parent,isMain);}catch(_){return original;}
 if(typeof original!=='function'||!file.endsWith('/tests/helpers/career-staged-entry.cjs')||!process.env.RESEARCH_REVIEW_TRANSCRIPTS)return original;
 if(!wrapped.has(original))wrapped.set(original,async function(...args){const app=await original(...args),turn=app.request;return{...app,async request(...input){const response=await turn.apply(app,input);fs.appendFileSync(process.env.RESEARCH_REVIEW_TRANSCRIPTS,JSON.stringify({at:new Date().toISOString(),level:'ACTUAL_STAGED_ENTRY_SYNTHETIC_TEST_AUTH',sourceRoot:args[0],input,response})+'\n');return response;}};});
 return wrapped.get(original);
};
