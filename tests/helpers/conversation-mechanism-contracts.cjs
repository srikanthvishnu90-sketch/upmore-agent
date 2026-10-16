'use strict';
const assert=require('node:assert/strict');
const ctx=()=>({now:Date.parse('2026-10-16T12:00:00Z'),userId:'synthetic',threadId:'synthetic',profile:{facts:[],preferences:{},constraints:{}},statedFacts:{facts:[{kind:'target_firm',value:'Synthetic Firm'},{kind:'geography',value:'Old City'}]},plan:{kind:'campaign_plan',geography:'Old City',target:{geography:'Old City'}},trackStore:{_careerThread:{facts:{facts:[{kind:'geography',value:'Old City'}]},plan:{kind:'campaign_plan',geography:'Old City',target:{geography:'Old City'}}}}});
const contracts={
 D01(C){const c=ctx();c.now=()=>Date.parse('2026-10-16T12:00:00Z');C.reconcileLocation(c,'New City');assert.equal(c.plan.target.geography,'New City');assert.equal(c.plan.needsReview,true);},
 D02(C){const c=ctx();C.reconcileLocation(c,'New City');assert.deepEqual(c.trackStore._careerThread.facts.facts.filter(f=>f.kind==='geography').map(f=>f.value),['New City']);},
 D03(C){const c=ctx();C.handle('Forget only my target city.',c);assert.ok(!c.statedFacts.facts.some(f=>f.kind==='geography'));assert.equal(c.plan.geography,null);},
 D04(C){const r=C.handle('Delete my interview recordings everywhere, including backups.',ctx());assert.doesNotMatch(r.reply,/I (?:have )?deleted|successfully erased/i);assert.match(r.reply,/not |cannot|unsupported/i);},
 D05(C){const c=ctx(),r=C.handle('Imagine I have a paid internship at a national laboratory.',c);assert.equal(r.intent,'conversation_nonactual');assert.equal(c.conversationState.facts.background,undefined);},
 D06(C){const c=ctx(),r=C.handle('My cousin said "I led ten engineers at Synthetic Corp."',c);assert.equal(r.intent,'conversation_nonactual');assert.equal(c.conversationState.facts.background,undefined);},
 D07(C){const c=ctx();C.handle('My only experience is a class SQL survey project.',c);const r=C.handle('Draft a truthful resume bullet.',c);assert.match(r.reply,/SQL|survey/);assert.doesNotMatch(r.reply,/Led a team|earned \$|revenue increased/i);},
 D08(C){const c=ctx();C.handle('Run a mock interview.',c);C.handle('In my class project I repaired a CSV import.',c);C.handle('We processed 70 rows and saved two hours.',c);const r=C.handle('Rewrite my answer.',c);assert.match(r.reply,/70/);assert.match(r.reply,/two hours/);},
 D09(C){const r=C.handle('Run a mock interview.',ctx());assert.equal((r.reply.match(/\?/g)||[]).length,1);},
 D10(C){const c=ctx();C.handle('Run a mock interview.',c);C.handle('In my class project I checked a delimiter.',c);const r=C.handle('What feedback would you give?',c);assert.match(r.reply,/delimiter/);},
 D11(C){const r=C.deliverDraft(ctx(),'Subject: Synthetic request\n\nFirst sentence. Second sentence requests the deadline.\n\nThank you,\n[Your name]');assert.match(r.reply,/Second sentence requests/);assert.match(r.reply,/Your name/);},
 D12(C){const r=C.handle('Did any email actually leave my account?',ctx());assert.doesNotMatch(r.reply,/I sent|successfully submitted/);assert.match(r.reply,/No |not /);},
 D13(C){const c=ctx();C.handle('I need a role, remote only.',c);assert.equal(C.matchesPosting({title:'Analyst',location:'Unknown'},C.box(c)),false);assert.equal(C.matchesPosting({title:'Analyst',remote_terms:'Remote status unknown'},C.box(c)),false);},
 D14(C,N){const c=ctx();c.offer={company:'Synthetic Firm',base_salary:60000};C.handle('Could I ask for until next Friday?',c,{Negotiation:N});const r=C.handle('Draft the extension email.',c,{Negotiation:N});assert.match(r.reply,/next Friday/);assert.match(r.reply,/Your name/);},
 D15(C,N,Host,deps){const host=Host.createCareerHost(deps),c=host.createTurnCtx({userId:'synthetic',threadId:'synthetic'});c.conversationState={v:1,facts:{availability:{value:'12 minutes daily',status:'user_reported'}}};const next=host.createTurnCtx({userId:'synthetic',threadId:'synthetic',snapshot:host.extractSnapshot(c)});assert.equal(next.conversationState.facts.availability.value,'12 minutes daily');},
};
module.exports={contracts};
