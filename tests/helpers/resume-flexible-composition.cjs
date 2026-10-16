'use strict';
// Synthetic source hydration only; no upload API or real applicant document.
const R=require('./resume-supersession-fixture.cjs'),F=require('./career-flexible-fixture.cjs');
function profile(year='2027',owner='A'){
 const p=R.profile(year);p._careerTrackStore={rows:[]};
 if(owner==='B'){p.facts[0].needs_confirmation=false;p.facts[0].text='Graduation year '+year;p.facts[0].title='Education';}
 p.facts.push({id:'JOINT-PROJECT',kind:'project',text:owner==='A'?'Organized spreadsheet rows for a class assignment.':'Built a synthetic calculator.',unproven:false});
 return p;
}
function seed(f){for(const [u,year,owner]of[[F.U,'2027','A'],[F.V,'2031','B']]){const s=f.dbs.get(u).state.career.stores;s.profile=profile(year,owner);s.statedFacts={facts:[{kind:'year',value:owner==='A'?'2028':'2031'}]};s.profile._careerTrackStore._careerThread={facts:F.copy(s.statedFacts)};}}
function assertYear(assert,view,year,excluded=[]){assert.ok(view.facts.some(f=>f.kind==='graduation_date'&&f.text===year));assert.ok(view.facts.some(f=>f.status==='corrected'&&f.text===year));for(const old of excluded)assert.ok(!JSON.stringify(view.facts).includes(old),'old year leaked into active facts: '+old);}
module.exports={...F,NEW:R.NEW,CORRECT:R.CORRECT,RECALL:R.RECALL,profile,seed,assertYear};
