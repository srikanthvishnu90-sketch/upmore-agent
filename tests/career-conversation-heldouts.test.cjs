'use strict';
// Synthetic held-outs frozen before implementation; actual host, fresh JSON
// snapshot each turn. No private corpus, providers or cross-owner cache probe.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(process.env.CONVERSATION_TARGET_ROOT||path.join(__dirname,'..'));
const FIX=path.join(__dirname,'fixtures/conversation-fixes');
const frozen=JSON.parse(fs.readFileSync(path.join(FIX,'freeze.json'))),raw=fs.readFileSync(path.join(FIX,'heldouts.json'));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),frozen.files['heldouts.json']);
const spec=JSON.parse(raw),D=n=>require(path.join(ROOT,'packages/domain',n));
function run(c){const {CareerHost}=require(path.join(ROOT,'supabase/functions/_shared/career_host.js'));const host=CareerHost.createCareerHost({CareerAccess:D('120-career-access.js'),CareerOnboarding:D('130-career-onboarding.js'),CareerRouter:D('142-career-router.js'),CareerDoorstep:D('141-career-doorstep.js'),CareerReply:D('140-career-reply.js'),CareerContainment:D('143-career-containment.js')});let snapshot={v:1,stores:{profile:{basics:{name:'Synthetic Heldout'},facts:[{kind:'education',text:'Undergraduate at Synthetic College',fact_id:'HE1',evidence:['synthetic fixture'],unproven:false}],preferences:{},constraints:{}}}};return c.turns.map(text=>{const ctx=host.createTurnCtx({userId:'heldout-synthetic',threadId:c.id,now:Date.parse('2026-10-16T12:00:00Z'),snapshot});const out=host.runTurn(text,ctx);snapshot=JSON.parse(JSON.stringify(host.extractSnapshot(ctx)));return {input:text,out,snapshot};});}
const {predicates}=require('./helpers/conversation-heldout-predicates.cjs');
for(const c of spec.cases)test(`${c.id}: ${c.invariant}`,()=>{const turns=run(c);for(const t of turns){assert.equal(t.out.contained,false,'no contained crash');assert.ok(t.out.reply?.length>10);assert.notEqual(t.out.intent,'career_fallback',t.input+' -> '+t.out.reply);}predicates[c.id](turns);});
module.exports={predicates};
