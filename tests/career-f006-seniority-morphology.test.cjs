'use strict';
// F-006: original DISCO-QUALITY 30-cell matrix (23b566b9), then bounded morphology/precedence controls.
// Invented titles/asks only. No source fetch, model call, generated bundle, or submit path.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Jobs = require('../packages/domain/121-career-jobs.js');
const { CareerPool: Pool } = require('../supabase/functions/_shared/career_pool.js');
const phrases = [['intern','intern'],['internship','intern'],['internships','intern'],['entry level','new_grad'],['entry-level','new_grad'],['early career','new_grad'],['early careers','new_grad']];
for (const family of ['software engineering','data analyst','financial analyst']) for (const [phrase,want] of phrases) {
  const ask = `${family} ${phrase} roles`;
  test(`F006 original matrix ask: ${ask}`, () => assert.equal(Jobs.seniorityBand(ask,''), want));
}
for (const [title,want] of [['Software Engineering Intern','intern'],['Software Engineering Internship','intern'],['Software Engineering Internships','intern'],['Data Analyst Internships','intern'],['Finance Internships, Summer 2027','intern'],['Entry-Level Software Engineer','new_grad'],['Early Careers — Data Analyst','new_grad']]) {
  test(`F006 original matrix title: ${title}`, () => assert.equal(Jobs.seniorityBand(title,''), want));
}
for (const phrase of ['an intern','internships']) test(`F006 original matrix JD: ${phrase}`, () => assert.equal(Jobs.seniorityBand('Analyst',`We are hiring ${phrase} for the team. Responsibilities follow.`),'intern'));

for (const [title,jd,want] of [
  ['Data Analyst Interns','','intern'],
  ['Data Analyst — Co-ops','','intern'],
  ['Data Analyst — Co / op','','intern'],
  ['Analyst','A co-op with our research team.','intern'],
  ['Analyst','Co-ops with our research team.','intern'],
  ['Entry–Level Data Analyst','','new_grad'],
  ['Entry/Level Data Analyst','','new_grad'],
  ['Early-Careers Data Analyst','','new_grad'],
  ['New Graduates — Data Analyst','','new_grad'],
  ['Graduate Programs — Analyst','','new_grad'],
  ['Universities Recruiting — Data Analyst','','new_grad'],
  ['Senior Data Analyst','Internships are available on a different team.','senior'],
  ['Data Analyst Manager','Early careers program supports other teams.','manager'],
  ['Summer Analyst Program Manager','','manager'],
  ['Winter Business Analyst','','intern'],
  ['Seasonal Customer Service Representative','','mid'],
  ['International Data Analyst','','mid'],
  ['Internal Controls Analyst','','mid'],
  ['Internist','','mid'],
  ['Data Analyst Internshipper','','mid'],
  ['Engineering Cooperative','','mid'],
  ['Staff Data Analyst','','staff'],
  ['VP, Finance','','director'],
  ['Jr. Data Analyst','','junior'],
]) test(`F006 bounded morphology/control: ${title} | ${jd}`, () => assert.equal(Jobs.seniorityBand(title,jd),want));

test('F006 normalized feed and hosted shelf use the same corrected band authority', () => {
  const title='Data Analyst Internships';
  const [feed]=Jobs.normalizeAshby({name:'Invented Analytics',jobs:[{id:'f006',title,location:'Chicago, IL',jobUrl:'https://example.test/f006',descriptionPlain:'Analyze data with SQL.'}]},'invented');
  const shelf=Pool.mapKbPosting({posting_key:'synthetic:f006',source:'ashby',company:'Invented Analytics',title,location:'Chicago, IL',url:'https://example.test/f006',text_excerpt:'Analyze data with SQL.'},Jobs);
  assert.equal(feed.role_family,'Data/ML'); assert.equal(shelf.role_family,'Data/ML');
  assert.equal(feed.seniority_band,'intern'); assert.equal(shelf.seniority_band,'intern');
  assert.equal(Jobs.seniorityBand('find data analyst internships in Chicago',''),'intern');
  assert.deepEqual(Jobs.askRoleFamilies('find data analyst internships in Chicago'),['Data/ML']);
});
