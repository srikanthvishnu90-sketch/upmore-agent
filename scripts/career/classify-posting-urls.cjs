'use strict';
// Pure classifier bridge for the Python KB builder; stdin/stdout only, no DB or network.
const fs=require('node:fs');
const Shape=require('../../packages/domain/166-career-url-shape.js');
try {
  const raw=fs.readFileSync(0,'utf8');
  if(Buffer.byteLength(raw)>1024*1024)throw Error('input too large');
  const urls=JSON.parse(raw);
  if(!Array.isArray(urls)||urls.length>1000||urls.some(u=>u!==null&&typeof u!=='string'))throw Error('invalid URL list');
  process.stdout.write(JSON.stringify(urls.map(u=>Shape.classifyPostingUrl(u))));
} catch {process.stderr.write('posting URL classification failed\n');process.exitCode=2;}
