'use strict';
// Reuse published BUG-240/FR-398 proof, not a competing implementation.
// Critical cases: actual staged handler, empty stores, no injected profile,
// posting pool or board provider. Only auth/database services are local fakes.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {spawnSync}=require('node:child_process');
test('published BUG-240 guard: live-shaped empty stores must reach a named batch outcome',()=>{
 const root=path.resolve(__dirname,'..');
 const r=spawnSync(process.execPath,['--experimental-vm-modules','scripts/career/apply-integration/replay-published-guard.cjs'],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 assert.equal(r.status,0,(r.stdout||'')+(r.stderr||''));
});
