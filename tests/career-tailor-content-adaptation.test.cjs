// Original synthetic content cases: no real person's data, providers, or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const Profile = require('../packages/domain/122-career-profile.js');
const Tailor = require('../packages/domain/123-career-tailor.js');

function profile(bullets) {
  return Profile.createProfile({ basics: { name: 'Synthetic Applicant', email: 'applicant@example.test' }, facts: [
    { id: 'SYN-JOB', kind: 'experience', title: 'Analyst, Synthetic Company', text: 'Built reporting and operational tools for internal teams.', bullets, skills: ['Python', 'SQL'], status: 'confirmed', needs_confirmation: false },
    { id: 'SYN-EDU', kind: 'education', title: 'Synthetic University', text: 'Bachelor degree in Computer Science', status: 'confirmed', needs_confirmation: false },
  ] });
}
const bullets = ['Automated report preparation in Python for 12 teams.', 'Built SQL dashboards to reconcile 40 reports.'];
function tailored(p, jd) {
  const r = Tailor.tailorResume(p, jd, {});
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  return r;
}
const jobBullets = r => r.resume.lines.filter(l => l.type === 'bullet' && l.factIds.includes('SYN-JOB'));

test('content tailoring: two postings emphasize different evidence inside the same job', () => {
  const p = profile(bullets), before = JSON.stringify(p);
  const python = tailored(p, 'Data Analyst\nRequirements: Python');
  const sql = tailored(p, 'Data Analyst\nRequirements: SQL');
  assert.equal(jobBullets(python)[0].text, bullets[0]);
  assert.equal(jobBullets(sql)[0].text, bullets[1], 'posting-relevant evidence must lead within the role');
  assert.deepEqual(jobBullets(sql).map(l => l.text).sort(), [...bullets].sort(), 'reordering retains the person\'s evidence verbatim');
  assert.equal(JSON.stringify(p), before, 'tailoring never rewrites stored facts');
});

test('content tailoring: task evidence adapts even when the posting names no skill-lexicon term', () => {
  const evidence = ['Resolved support requests for 20 internal teams.', 'Prepared onboarding documentation for 12 new colleagues.'];
  const p = profile(evidence);
  const r = tailored(p, 'Operations Coordinator\nResponsibilities:\n- Prepare onboarding documentation.');
  assert.equal(jobBullets(r)[0].text, evidence[1], 'the actual task should drive content emphasis');
});

test('content tailoring control: no relevant evidence keeps the source order and citations', () => {
  const r = tailored(profile(bullets), 'General Associate\nResponsibilities:\n- Coordinate scheduling.');
  assert.deepEqual(jobBullets(r).map(l => l.text), bullets);
  assert.ok(jobBullets(r).every(l => JSON.stringify(l.factIds) === JSON.stringify(['SYN-JOB'])));
});

test('content tailoring control: posting words cannot introduce absent candidate evidence', () => {
  const r = tailored(profile(bullets), 'Data Analyst\nRequirements: Tableau');
  assert.ok(!r.resume.lines.some(l => /Tableau/i.test(l.text)), 'a posting requirement never becomes a resume claim');
  assert.ok(r.requiredGaps.some(g => g.requirement === 'Tableau'), 'the absent requirement remains an explicit gap');
});

test('content tailoring: required evidence leads preferred evidence and company boilerplate', () => {
  const r = tailored(profile(bullets), 'Data Analyst\nRequirements: SQL\nNice to have: Python\nAbout us: Python automation for internal teams is our story.');
  assert.equal(jobBullets(r)[0].text, bullets[1]);
});
