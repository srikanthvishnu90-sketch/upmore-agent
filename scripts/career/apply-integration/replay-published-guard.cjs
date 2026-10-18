"use strict";
// Replay the immutable published BUG-240 guard against this checkout,
// without writing another lane's tests or runtime. No browser/network IO.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'../../..');
if(!require('node:vm').SourceTextModule)throw Error('Use --experimental-vm-modules; no respawn into an unwritten file');
const source=path.join(root,'docs/career/apply-integration-20261018/evidence/bug240-published-guard.cjs');
const filename=path.join(root,'tests/career-batch-live-shape.test.cjs');
const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
m._compile(fs.readFileSync(source,'utf8'),filename);
