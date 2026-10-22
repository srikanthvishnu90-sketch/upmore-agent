// F3 web onboarding — timed end-to-end DOM proof under jsdom (Trainee builder
// plan 2026-10-22, item F3 check (a)). A synthetic TEST person completes name ->
// resume (paste) -> target roles -> first reviewed match in ONE session, driven
// through the real component (src/career-onboarding.js) over the real 122/121
// domain modules. The 2-minute bar is the plan's: the measured wall time of the
// whole drive is asserted against Flow.BUDGET_MS and printed. Also proven here:
// leave-and-return resumes mid-flow (d), skipping (d), a failed resume is not a
// dead end (b), and the design tokens carry the plum as one token on active
// states only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let JSDOM;
try { ({ JSDOM } = require(path.join(ROOT, 'packages/extension/tools/node_modules/jsdom'))); }
catch (e) { ({ JSDOM } = require('jsdom')); }
const CareerProfile = require(path.join(ROOT, 'packages/domain/122-career-profile.js'));
const Flow = require(path.join(ROOT, 'src/career-onboarding.js'));
const CSS = fs.readFileSync(path.join(ROOT, 'src/career-onboarding.css'), 'utf8');

const NOW = Date.parse('2026-10-22T17:00:00.000Z');
const OWNER = 'user-test-f3';

const RESUME_TEXT = [
  'TEST PERSON — synthetic resume for the F3 onboarding tests',
  'Experience',
  'Data Intern, TEST Analytics Co',
  '- Built SQL dashboards in Python for weekly reporting',
  'Skills',
  'SQL, Python, Excel',
  'Education',
  'DePaul University, Computer Science',
].join('\n');

const POSTINGS = [
  { job_id: 'test-job-1', company: 'Acme Analytics (TEST)', title: 'Data Analyst Intern', role_family: 'Data/ML', seniority_band: 'intern', location: 'Chicago, IL', remote: 'hybrid', url: 'https://example.test/jobs/1', posted_at: '2026-10-20', jd_text: 'Data Analyst Intern using SQL and Python to build dashboards and weekly reporting for the analytics team.', source: 'TEST' },
  { job_id: 'test-job-3', company: 'Legal Co (TEST)', title: 'Paralegal', role_family: 'Law', seniority_band: 'entry', location: 'Chicago, IL', remote: 'onsite', url: 'https://example.test/jobs/3', posted_at: '2026-10-19', jd_text: 'Paralegal supporting litigation attorneys with filings and research.', source: 'TEST' },
];

function mountSession(savedProfile) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="host"></div></body></html>');
  const el = dom.window.document.getElementById('host');
  const store = { profile: savedProfile || CareerProfile.createProfile({ id: 'profile-f3', user_id: OWNER, isTestFixture: true, label: 'TEST — F3 onboarding' }), saves: 0 };
  const session = Flow.mount(el, {
    profile: store.profile,
    postings: POSTINGS,
    now: () => NOW,
    owner: OWNER,
    save: () => { store.saves += 1; },
  });
  return { dom, el, store, session };
}
const step = (el) => el.querySelector('[data-f3-step]').getAttribute('data-f3-step');
const click = (el, sel) => el.querySelector(sel).dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));

test('(a) one session, four screens, first reviewed match — measured against the 2-minute budget', () => {
  const { el, store } = mountSession();
  const t0 = Date.now();
  const seen = [];
  seen.push(step(el));
  el.querySelector('[data-f3-name-input]').value = 'TEST Person';
  click(el, '[data-f3-continue]');
  seen.push(step(el));
  el.querySelector('[data-f3-resume-input]').value = RESUME_TEXT;
  click(el, '[data-f3-continue]');
  seen.push(step(el));
  el.querySelector('[data-f3-roles-input]').value = 'Data Analyst';
  el.querySelector('[data-f3-goal-input]').value = 'a data analyst internship for summer 2027';
  click(el, '[data-f3-continue]');
  seen.push(step(el));
  const elapsed = Date.now() - t0;
  assert.deepEqual(seen, ['name', 'resume', 'roles', 'match'], 'exactly the four F3 screens, in order');
  const match = el.querySelector('[data-f3-match]');
  assert.ok(match, 'the first reviewed match is rendered');
  assert.ok(match.textContent.includes('Acme Analytics (TEST)'));
  assert.ok(match.textContent.includes('Data Analyst Intern'));
  assert.ok(/role family/.test(match.textContent), 'the match carries the matcher’s own reason');
  assert.ok(el.querySelector('[data-f3-card-slot]'), 'the F2 approval-card slot is marked on the match');
  assert.ok(elapsed < Flow.BUDGET_MS, `the whole drive took ${elapsed}ms of the ${Flow.BUDGET_MS}ms budget`);
  console.log(`F3 timed drive: ${elapsed}ms wall (budget ${Flow.BUDGET_MS}ms), 4 screens, saves=${store.saves}`);
  assert.equal(store.profile.basics.name, 'TEST Person');
  assert.deepEqual(store.profile.preferences.roles, ['Data Analyst']);
});

test('(d) leaving after the resume step and returning resumes at roles, answers intact', () => {
  const first = mountSession();
  first.el.querySelector('[data-f3-name-input]').value = 'TEST Person';
  click(first.el, '[data-f3-continue]');
  first.el.querySelector('[data-f3-resume-input]').value = RESUME_TEXT;
  click(first.el, '[data-f3-continue]');
  const revived = JSON.parse(JSON.stringify(first.store.profile)); // persisted, then reloaded
  const second = mountSession(revived);
  assert.equal(step(second.el), 'roles');
  assert.ok(second.el.textContent.includes('2/3'), 'saved coverage rides along, unreduced');
  assert.equal(second.store.profile.basics.name, 'TEST Person');
});

test('(b)+(d) an empty resume paste is a typed in-place error, and skip moves on with the reason kept', () => {
  const { el, store } = mountSession();
  el.querySelector('[data-f3-name-input]').value = 'TEST Person';
  click(el, '[data-f3-continue]');
  el.querySelector('[data-f3-resume-input]').value = '   ';
  click(el, '[data-f3-continue]');
  assert.equal(step(el), 'resume', 'a failed step does not advance');
  const alert = el.querySelector('[role="alert"]');
  assert.ok(alert && /no text/.test(alert.textContent), 'the 122 typed failure is shown, with its next step');
  click(el, '[data-f3-skip]');
  assert.equal(step(el), 'roles');
  el.querySelector('[data-f3-roles-input]').value = 'Data Analyst';
  el.querySelector('[data-f3-goal-input]').value = 'a data analyst internship for summer 2027';
  click(el, '[data-f3-continue]');
  assert.equal(step(el), 'match');
  assert.ok(el.textContent.includes('resume') && el.textContent.includes('skipped by the person'),
    'the match screen names the skipped resume as part of its basis');
  assert.equal(store.profile.facts.filter((f) => f.source === 'resume-ingest').length, 0, 'the failed paste stored nothing');
});

test('design tokens: the plum is one token, painted on active states only', () => {
  assert.match(CSS, /--accent-plum:\s*#4A2F5E\s*;/);
  assert.equal((CSS.match(/#4A2F5E/g) || []).length, 1, 'the plum hex appears once — the token');
  assert.ok(!/#6B4F7E/.test(CSS), 'the superseded plum is absent');
  assert.match(CSS, /--accent-plum-light:\s*#A58FB8\s*;/);
  assert.match(CSS, /--graphite:\s*#1E1F24\s*;/);
  const plumUses = CSS.split('\n').filter((l) => l.includes('var(--accent-plum)'));
  assert.ok(plumUses.length > 0 && plumUses.every((l) => /aria-selected|is-active|data-f3-step\]\[data-active/.test(l) || l.includes('.f3-progress-fill')),
    'plum is painted only through active-state selectors');
});
