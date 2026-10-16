'use strict';
const assert=require('node:assert/strict');
const last=ts=>ts.at(-1).out.reply,has=(s,re)=>assert.match(s,re),no=(s,re)=>assert.doesNotMatch(s,re);
const active=ts=>ts.at(-1).snapshot;
const predicates={
 H01(ts){has(last(ts),/Raleigh/);no(last(ts),/in Boston|targeting Boston/);},
 H02(ts){has(last(ts),/San Diego/);no(last(ts),/in Chicago|in Salt Lake City/);const f=active(ts).stores.statedFacts.facts.filter(f=>f.kind==='geography');assert.equal(f.length,1);assert.equal(f[0].value,'San Diego');},
 H03(ts){has(ts[2].out.reply,/cannot|not.*eras|not account/i);no(ts[2].out.reply,/deleted everywhere|erased all|backups.*deleted/i);has(ts[3].out.reply,/unknown|not.*city/i);has(ts[4].out.reply,/Finch|chemistry|senior/i);has(last(ts),/Madison/);no(last(ts),/target.*Miami/);},
 H04(ts){has(last(ts),/not|cannot|no /i);no(last(ts),/I (?:have )?deleted|successfully erased/i);},
 H05(ts){has(ts[3].out.reply,/physics|sophomore/i);no(ts[3].out.reply,/I (?:managed|built).*IBM|experience at ESA/i);has(last(ts),/hypothetical|third.party/i);const profile=JSON.stringify(active(ts).stores.profile);no(profile,/ESA|IBM/);},
 H06(ts){has(last(ts),/15|paid/);has(ts[3].out.reply,/\?/);assert.ok((ts[3].out.reply.match(/\?/g)||[]).length<=1);has(ts[5].out.reply,/15/);},
 H07(ts){const s=ts[4].out.reply;for(const re of [/remote/i,/paid/i,/part.time/i,/sponsor/i])has(s,re);has(last(ts),/exclude|mismatch|constraint/i);no(s,/willing to relocate/);},
 H08(ts){has(ts[2].out.reply,/result|impact|evidence/i);has(ts[4].out.reply,/40/);has(ts[4].out.reply,/one hour/);has(ts[5].out.reply,/validation/);has(last(ts),/validat|check|test|ambiguous/i);},
 H09(ts){has(last(ts),/90/);has(last(ts),/three hours/);has(last(ts),/missing.value|import/i);},
 H10(ts){has(ts[1].out.reply,/SQL|survey/i);has(ts[2].out.reply,/won.t|cannot|truth/i);no(ts[3].out.reply,/led a team|managed a team/i);has(ts[3].out.reply,/Coursework|class/i);has(ts[4].out.reply,/source|stated/i);has(last(ts),/no |not |nothing/i);},
 H11(ts){for(const idx of [3,4]){const s=ts[idx].out.reply;has(s,/Subject:/);has(s,/next Tuesday/);has(s,/Thank you/);has(s,/Your name/);assert.ok(s.includes('\n\n'));}has(last(ts),/undecided|no acceptance/i);},
 H12(ts){has(last(ts),/date|confirm|unknown|chosen|placeholder/i);no(ts[1].out.reply,/to \d{4}-\d{2}-\d{2}/);},
 H13(ts){has(ts[3].out.reply,/hypothesis|test|try|tentative|may/i);has(last(ts),/duplicate|survey/i);no(last(ts),/\d+ (?:rows|hours)|increased revenue/);},
 H14(ts){has(ts[0].out.reply,/draft|review|coach/i);has(ts[1].out.reply,/no |not /i);has(ts[2].out.reply,/posting|URL|requirements/i);has(last(ts),/no |not |record/i);},
 H15(ts){has(last(ts),/Tampa/);no(last(ts),/in Austin|targeting Austin/);has(ts[2].out.reply,/review|approval/i);},
 H16(ts){const profile=JSON.stringify(active(ts).stores.profile);no(profile,/national robotics|prize/);has(last(ts),/do not know Python|never.*internship|unknown/i);}
};
module.exports={predicates};
