'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../packages/domain/156-career-applications.js'),J=require('../packages/domain/121-career-jobs.js');
test('ordinary investment-internship commands and exact confirmations reuse the application workflow only',()=>{
 assert.deepEqual(A.command('Find 10 investment internships'),{action:'discover',limit:10,ask:'Find 10 investment internships'});assert.equal(A.command('Recommend ten private equity internships').limit,10);assert.equal(A.command('Find 101 investment internships').action,'invalid');assert.equal(A.command('yes'),null);assert.equal(A.command('Approve batch yes').action,'invalid');assert.equal(A.command('What skills should I develop?'),null);
});
test('unknown sponsorship/experience and a residence country never become authorization facts',()=>{
 const p={basics:{country:'GB'},constraints:{},facts:[]},s=A.scoringProfile(p);assert.equal(s.constraints.needs_sponsorship,undefined);assert.equal(s.experience_years,undefined);assert.equal(A.workCountry(p),null);assert.equal(A.postingCountry({location:'London'}),null);assert.equal(A.postingCountry({location:'New York, NY'}),'US');assert.ok(A.missingFacts(p).length>=3);
});
test('explicit fact confirmation preserves stable existing fact IDs and unknown fields',()=>{
 const input={workCountry:'US',workAuthorization:'US citizen',needsSponsorship:false,graduationDate:'2028-05',level:'student',education:'SYNTHETIC student',skills:[{name:'Excel',evidence:'SYNTHETIC explicit evidence'}]},first=A.confirmedProfile(null,input,'SYNTHETIC confirmation'),second=A.confirmedProfile(first,input,'SYNTHETIC renewed confirmation');assert.equal(second.facts.length,first.facts.length);assert.deepEqual(second.facts.map(f=>f.id),first.facts.map(f=>f.id));assert.equal(A.scoringProfile(second).constraints.needs_sponsorship,false);assert.equal(A.scoringProfile(second).experience_years,undefined);assert.equal(A.factDefaults(second).skills[0].evidence,input.skills[0].evidence);
});
test('Greenhouse edits cannot masquerade as publication or make an old opening newly fresh',()=>{
 const base={id:1,title:'Private Equity Analyst Intern',absolute_url:'https://job-boards.greenhouse.io/synthetic/jobs/1',location:{name:'New York, NY'},content:'SYNTHETIC company investment team. Excel valuation financial modeling.'};
 const missing=J.normalizeGreenhouse({name:'SYNTHETIC',jobs:[{...base,updated_at:'2026-10-17T10:00:00Z',created_at:'2026-01-01T10:00:00Z'}]})[0];assert.equal(missing.posted_at,null);
 const old=J.normalizeGreenhouse({name:'SYNTHETIC',jobs:[{...base,first_published:'2026-01-01T10:00:00Z',updated_at:'2026-10-17T10:00:00Z'}]})[0];assert.equal(old.posted_at,'2026-01-01T10:00:00.000Z');assert.equal(J.qualityFlags(old,{now:Date.parse('2026-10-17T12:00:00Z')}).lower_odds,true);
});

test('ordinary word order and common counts preserve search intent; natural status stays read-only',()=>{
 for(const [message,limit]of [["Could you recommend five internships in investment banking?",5],["I am looking for ten summer analyst roles in private equity",10],["Find 10 investment internships for graduation in 2028",10]])assert.equal(A.command(message).limit,limit,message);
 assert.equal(A.command('Find 1000 investment internships').action,'invalid');for(const message of ["How are my applications doing?","What's the status of my applications?",'Show my applications'])assert.deepEqual(A.command(message),{action:'status'});assert.equal(A.command('Should I buy investment funds?'),null);
});
test('expressed city, remote and publication constraints are bound without inventing start dates',()=>{
 const now=Date.parse('2026-10-17T12:00:00Z'),ask='Find five internships in investment banking in Chicago, remote only, posted in the last 7 days',c=A.searchConstraints(ask,now);assert.deepEqual(c.locations,['Chicago']);assert.equal(c.remote,'only');assert.equal(c.publishedSince,'2026-10-10T12:00:00.000Z');assert.equal(c.clarification,null);
 const p={location:'Chicago, IL',remote:'remote',posted_at:'2026-10-16T12:00:00Z'};assert.equal(A.constraintsMatch(p,c),true);for(const patch of [{location:'New York, NY'},{remote:'onsite'},{posted_at:null},{posted_at:'2026-09-01T12:00:00Z'}])assert.equal(A.constraintsMatch({...p,...patch},c),false);assert.match(A.searchConstraints('Find investment internships for summer 2027',now).clarification,/start period/);assert.match(A.searchConstraints('Find recently posted investment internships',now).clarification,/cutoff/);
});

test('modifiers preserve explicit counts, negated locations require clarification, writing advice stays native',()=>{
 assert.equal(A.command('Find 5 suitable investment internships').limit,5);assert.equal(A.command('Recommend five suitable summer analyst roles in private equity').limit,5);for(const n of ['0','zero','-5','2.5','1000'])assert.equal(A.command('Find '+n+' suitable investment internships').action,'invalid');assert.ok(A.searchConstraints('Find investment internships not in Chicago').clarification);assert.ok(A.searchConstraints('Find 2027 investment internships').clarification);assert.equal(A.command('I need help writing a cover letter for investment internships'),null);assert.equal(A.command("Don't find investment internships"),null);
});
test('held-out onsite-only and multi-city constraints never admit hybrid/unknown or drop a city',()=>{
 const c=A.searchConstraints('Find 10 investment internships onsite only');assert.equal(c.clarification,null);assert.deepEqual(A.searchConstraints('Find investment internships in Chicago onsite only').locations,['Chicago']);
 for(const p of [{remote:'hybrid',location:'Chicago, IL (hybrid)'},{remote:null,location:'Chicago, IL'},{remote:'unknown',location:'Chicago, IL'},{remote:'onsite',location:'Chicago, IL'}])assert.equal(A.constraintsMatch(p,c),false,JSON.stringify(p));
 assert.equal(A.constraintsMatch({remote:'onsite',location:'Chicago, IL (on-site)'},c),true);
 for(const cities of ['in Chicago and Boston','in Chicago or Boston','in Chicago, Boston','in Chicago/Boston','in Chicago and in Boston']){const q=A.searchConstraints('Find investment internships '+cities);assert.match(q.clarification||'',/single city|multiple|locations/i,cities);assert.equal(A.constraintsMatch({remote:'onsite',location:'Chicago, IL (on-site)'},q),false,cities);}
});
