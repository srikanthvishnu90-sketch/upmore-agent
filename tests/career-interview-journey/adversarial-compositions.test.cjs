'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {cases,runCase}=require('./adversarial-compositions.cjs');
for(const spec of cases)test('bounded composition: '+spec.id,()=>{const r=runCase(spec);assert.equal(r.outcome,'completed',r.expected+'\n'+JSON.stringify(r.failure,null,2));});
