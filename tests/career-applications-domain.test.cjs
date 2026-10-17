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
