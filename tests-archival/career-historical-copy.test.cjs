// Original historical copy-surface gate, preserved as a release prerequisite.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
test('historical review copy retains the original banned-outcome-claims gate',()=>{
 const banned=[/beats?\s+(the\s+)?ATS/i,/gets?\s+you\s+hired/i,/guaranteed\s+(interviews?|jobs?|offers?)/i,/guarantee\s+you\s+(a\s+)?(job|interview|offer)/i];
 const f=path.join(require('../scripts/career/critical-repairs/archive-gate.cjs').archiveRoot(),'review','honest-yield-copy.md');
 const text=fs.readFileSync(f,'utf8');for(const re of banned)assert.ok(!re.test(text),`${path.basename(f)} must not contain the banned claim ${re}`);
});
