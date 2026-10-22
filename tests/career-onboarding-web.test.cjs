// F3 web onboarding — pure flow truth tests (Trainee builder plan 2026-10-22, item F3).
// The flow (src/career-onboarding.js) runs over the REAL product models: the 122
// master profile (facts, ingest, preferences), the 121 matcher (profileFromPersona
// + scoreFit), the 142 stated-facts goal shape, and the WO-102 prepare contract
// (extension/lib/trainee-core.js trustedManifest, loaded by vm like the repo's
// own fact-import tests). Nothing here is a parallel vocabulary: a store the
// flow writes must be a store a product read path actually consumes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CareerProfile = require(path.join(ROOT, 'packages/domain/122-career-profile.js'));
const CareerJobs = require(path.join(ROOT, 'packages/domain/121-career-jobs.js'));
const Flow = require(path.join(ROOT, 'src/career-onboarding.js'));

const NOW = Date.parse('2026-10-22T17:00:00.000Z');
const OWNER = 'user-test-f3';
const ctx = () => ({ now: NOW, owner: OWNER });

function core() {
  const c = { console, TextEncoder, TextDecoder, URL, Uint8Array, setTimeout, clearTimeout };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'extension/lib/trainee-core.js'), 'utf8'), c);
  return c.TraineeCore;
}

function testProfile() {
  return CareerProfile.createProfile({ id: 'profile-f3', user_id: OWNER, isTestFixture: true, label: 'TEST — F3 onboarding' });
}

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
  { job_id: 'test-job-2', company: 'Acme Analytics (TEST)', title: 'Data Analyst', role_family: 'Data/ML', seniority_band: 'entry', location: 'Chicago, IL', remote: 'hybrid', url: 'https://example.test/jobs/2', posted_at: '2026-10-19', jd_text: 'Data Analyst working in Excel on monthly spreadsheets and charts.', source: 'TEST' },
  { job_id: 'test-job-3', company: 'Legal Co (TEST)', title: 'Paralegal', role_family: 'Law', seniority_band: 'entry', location: 'Chicago, IL', remote: 'onsite', url: 'https://example.test/jobs/3', posted_at: '2026-10-19', jd_text: 'Paralegal supporting litigation attorneys with filings and research.', source: 'TEST' },
];

function onboarded() {
  const p = testProfile();
  assert.equal(Flow.answerName(p, 'TEST Person', ctx()).ok, true);
  assert.equal(Flow.answerResume(p, { text: RESUME_TEXT, fileName: 'test-resume.txt' }, ctx()).ok, true);
  assert.equal(Flow.answerRoles(p, { roles: 'Data Analyst', goal: 'a data analyst internship for summer 2027' }, ctx()).ok, true);
  return p;
}

test('the flow is exactly the four F3 steps, inside one shared budget', () => {
  assert.deepEqual(Flow.STEPS.map((s) => s.key), ['name', 'resume', 'roles', 'match']);
  assert.equal(Flow.BUDGET_MS, 120000, 'the under-2-minutes budget lives in one place');
});

test('(b) name lands in the 122 basics and as a confirmed fact with owner-stated provenance', () => {
  const p = testProfile();
  const r = Flow.answerName(p, 'TEST Person', ctx());
  assert.equal(r.ok, true);
  assert.equal(p.basics.name, 'TEST Person');
  const fact = p.facts.find((f) => f.kind === 'profile');
  assert.ok(fact, 'a profile fact was stored');
  assert.equal(fact.value, 'TEST Person');
  assert.equal(fact.status, 'confirmed');
  assert.equal(fact.needs_confirmation, false);
  assert.match(fact.provenance, /^owner stated \(web onboarding, 2026-10-22\)$/);
  assert.ok(typeof fact.confirmation_event_id === 'string' && fact.confirmation_event_id.length > 0);
  assert.equal(Flow.currentStep(p), 'resume');
});

test('(b) an empty name is a typed refusal and the step does not move', () => {
  const p = testProfile();
  const r = Flow.answerName(p, '   ', ctx());
  assert.equal(r.ok, false);
  assert.equal(r.reason_class, 'empty');
  assert.equal(p.basics.name, null);
  assert.equal(Flow.currentStep(p), 'name');
});

test('(b) resume lands through the real 122 ingest: drafts stay drafts, the source record is set', () => {
  const p = testProfile();
  const r = Flow.answerResume(p, { text: RESUME_TEXT, fileName: 'test-resume.txt' }, ctx());
  assert.equal(r.ok, true);
  assert.ok(r.added_fact_ids.length >= 3, 'resume produced profile facts');
  const drafts = p.facts.filter((f) => r.added_fact_ids.includes(f.id));
  assert.ok(drafts.every((f) => f.needs_confirmation === true && f.status === 'draft'),
    'resume facts arrive as drafts — ingestion never canonises');
  assert.ok(p.profile_ingest_audit && p.profile_ingest_audit.length === 1, 'the 122 ingest audit recorded it');
  assert.equal(p.resume_sources.active, 'test-resume.txt');
  assert.equal(p.resume_sources.status, 'active');
});

test('(b) a bad resume is a typed failure with a next step — never a dead end, nothing stored', () => {
  const p = testProfile();
  const pdf = Flow.answerResume(p, { text: RESUME_TEXT, fileName: 'resume.pdf', mimeType: 'application/pdf' }, ctx());
  assert.equal(pdf.ok, false);
  assert.equal(pdf.reason_class, 'unsupported');
  assert.ok(pdf.next_step && pdf.next_step.length > 0, 'the failure names the way forward (paste instead)');
  const empty = Flow.answerResume(p, { text: '   ' }, ctx());
  assert.equal(empty.ok, false);
  assert.equal(empty.reason_class, 'empty');
  assert.equal(p.facts.length, 0, 'a failed ingest adds nothing');
  assert.equal(Flow.currentStep(p), 'name', 'the flow did not advance past a failed step');
});

test('(b) roles and goal land where the router and matcher read: preferences + the goal-spine stated fact', () => {
  const p = testProfile();
  const r = Flow.answerRoles(p, { roles: 'Data Analyst, Data Scientist', goal: 'a data analyst internship for summer 2027' }, ctx());
  assert.equal(r.ok, true);
  assert.deepEqual(p.preferences.roles, ['Data Analyst', 'Data Scientist']);
  assert.equal(p.preferences.goals, 'a data analyst internship for summer 2027');
  const goalFact = (p.stated_facts.facts || []).find((f) => f.kind === 'goal');
  assert.ok(goalFact, 'the goal rides the stated-facts carriage (142 goal frame shape)');
  assert.equal(goalFact.key, 'career');
  assert.equal(goalFact.value, 'a data analyst internship for summer 2027');
  // The matcher reads families off preferences.roles via 121's own adapter:
  const scoring = CareerJobs.profileFromPersona(p);
  assert.deepEqual(scoring.preferences.role_families, ['Data/ML']);
});

test('(c) the prepare contract consumes the stored name: trustedManifest keeps it, nothing is excluded for provenance', () => {
  const p = onboarded();
  const TraineeCore = core();
  const file = { user_id: OWNER, answers: Flow.answersForPrepare(p).answers, saved: {}, facts: p.facts };
  const m = TraineeCore.trustedManifest({ owner: OWNER, file });
  assert.ok(m.answers.full_name, 'the name answer survives into the prepare manifest');
  assert.equal(m.answers.full_name.value, 'TEST Person');
  assert.equal(m.byFactId[m.answers.full_name.factId].provenance, 'owner stated (web onboarding, 2026-10-22)');
  for (const e of m.excluded) {
    assert.ok(!/no positive provenance|not confirmed|no confirmation event/.test(e.why),
      `no onboarding store is refused for provenance/confirmation (got: ${e.why})`);
  }
});

test('(c) a completed flow never re-asks: a fresh session on the same profile starts at done', () => {
  const p = onboarded();
  Flow.firstMatch(p, POSTINGS, ctx());
  assert.equal(Flow.currentStep(p), 'done');
  const again = Flow.stepState(p);
  assert.ok(again.every((s) => s.state === 'answered' || s.state === 'presented'),
    'every step reads answered/presented from the stored profile — nothing is re-asked');
});

test('(d) leaving mid-flow and returning resumes at the first unanswered step, answers intact', () => {
  const p = testProfile();
  Flow.answerName(p, 'TEST Person', ctx());
  Flow.answerResume(p, { text: RESUME_TEXT, fileName: 'test-resume.txt' }, ctx());
  const revived = JSON.parse(JSON.stringify(p)); // the host persists the profile as JSON
  assert.equal(Flow.currentStep(revived), 'roles');
  assert.equal(revived.basics.name, 'TEST Person');
  assert.equal(revived.resume_sources.active, 'test-resume.txt');
  const prog = Flow.progress(revived);
  assert.equal(prog.answered, 2);
  assert.equal(prog.total, 3);
  assert.equal(prog.fraction, '2/3', 'coverage is covered/total, never reduced');
});

test('(d) skipping is recorded with its reason and the flow moves on', () => {
  const p = testProfile();
  Flow.answerName(p, 'TEST Person', ctx());
  const r = Flow.skipStep(p, 'resume', ctx());
  assert.equal(r.ok, true);
  assert.equal(Flow.currentStep(p), 'roles');
  const st = Flow.stepState(p).find((s) => s.key === 'resume');
  assert.equal(st.state, 'skipped');
  assert.equal(st.reason, 'skipped by the person');
});

test('(e) the first match is composed by the real matcher from the stored roles and facts', () => {
  const p = onboarded();
  const r = Flow.firstMatch(p, POSTINGS, ctx());
  assert.equal(r.considered, 3);
  assert.equal(r.kept.length + r.dropped.length, r.considered, 'every considered posting returns exactly once');
  assert.ok(r.match, 'a first match is presented');
  assert.equal(r.match.job_id, 'test-job-1');
  assert.equal(r.match.company, 'Acme Analytics (TEST)');
  assert.ok(r.match.reasons.some((x) => /^role family/.test(x)), 'the match reason comes from scoreFit, not prose');
  const dropped = r.dropped.find((d) => d.job_id === 'test-job-3');
  assert.ok(dropped, 'the out-of-family posting is dropped, not silently vanished');
  assert.ok(dropped.reasons.some((x) => /role family/.test(x)), 'the drop carries the rule that dropped it');
});

test('(e) an empty posting pool is an honest no-match, counted 0/0', () => {
  const p = onboarded();
  const r = Flow.firstMatch(p, [], ctx());
  assert.equal(r.considered, 0);
  assert.equal(r.match, null);
  assert.equal(r.fraction, '0/0');
});

test('(e) a skipped resume is named in the match basis — the match never pretends it saw one', () => {
  const p = testProfile();
  Flow.answerName(p, 'TEST Person', ctx());
  Flow.skipStep(p, 'resume', ctx());
  Flow.answerRoles(p, { roles: 'Data Analyst', goal: 'a data analyst internship for summer 2027' }, ctx());
  const r = Flow.firstMatch(p, POSTINGS, ctx());
  assert.ok(r.missing.some((m) => m.step === 'resume' && /skipped/.test(m.reason)));
});
