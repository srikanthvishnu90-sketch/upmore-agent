'use strict';
// =====================================================================
// FIXTURE GUARDS (2026-10-27) — the contamination root cause: gauntlet /
// channel tests ran AS the owner's real account, so a self-declared
// synthetic fixture resume became the account's profile and fictional
// probe statements became account stated facts (live 2026-10-20/21;
// evidence: ~/workspace/trainee-p2-deploy/profile-contamination-evidence/).
//
// Three guards, each fail-first against the unguarded code:
//   G1  122.ingestResume marks a profile isTestFixture when the document
//       declares itself a synthetic fixture (the flag previously died at
//       ingest: a fresh profile defaults it false and nothing set it),
//       and the host's account merge (career_host memoryOf) never
//       promotes a fixture-flagged profile to the account record.
//   G2  142's stated-fact recorders (recordKeyedFact / recordThreadFact,
//       the single store choke point) refuse to record from a session
//       whose profile carries a fixture marker — a test session's
//       statements can never become account facts. A normal session
//       records exactly as before.
//   G3  The deploy smoke's live "hi" turn (trainee-smoke.cjs, run by
//       trainee-go-live.sh step 6 on every production deploy) carries a
//       pre/post stated-facts count assertion for the account it runs
//       as: growth FAILS the launch. (No read-only turn type exists in
//       the product, so the assertion is the guard.)
// =====================================================================
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const D = (n) => require(path.join(ROOT, 'packages/domain', n));
const Profile = D('122-career-profile.js');
const { CareerHost } = require(path.join(ROOT, 'supabase/functions/_shared/career_host.js'));
const smoke = require(path.join(ROOT, 'scripts/launch/trainee-smoke.cjs'));

const FIXTURE_TEXT = fs.readFileSync(path.join(ROOT, 'packages/career-data/fixtures/test-resume.txt'), 'utf8');
// The same document with its fixture declaration line removed — a plain
// synthetic resume. The parser already skips that line, so the parsed
// drafts are identical; only the self-declaration differs.
const PLAIN_TEXT = FIXTURE_TEXT.split('\n').filter((l) => !/synthetic fixture/i.test(l)).join('\n');
const PERSONA = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/career-data/fixtures/test-persona.json'), 'utf8'));
const TURN3 = 'Quick note — my target firm is Northwind Ledger and my recruiter contact there is Dana. Please remember that.';
const NOW = Date.parse('2026-10-27T07:00:00.000Z');
const clone = (v) => JSON.parse(JSON.stringify(v));

// ------------------------------------------------------------- worlds
function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D('120-career-access.js'), CareerOnboarding: D('130-career-onboarding.js'),
    CareerRouter: D('142-career-router.js'), CareerDoorstep: D('141-career-doorstep.js'),
    CareerReply: D('140-career-reply.js'), CareerContainment: D('143-career-containment.js'),
  });
}
// T3-style world, with account memory on and the `memory` patch key allowed.
function makeWorld() {
  const host = makeHost();
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  const WHITELIST = ['paused', 'preferred_locations', 'erase', 'stated_facts', 'memory'];
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, accountMemory: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: o.postings || [], profile: o.profile });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist`);
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return { out, ctx, snap, patch: clone(ctx._hostPatch || {}) };
  };
  return { host, store, say };
}
const factsOf = (r) => ((r.ctx.statedFacts || {}).facts) || [];

// ------------------------------------------------------------- G1a: ingest marks the flag
test('G1a: ingesting the self-declared fixture marks the profile isTestFixture', () => {
  const p = Profile.createProfile({});
  assert.equal(p.isTestFixture, false, 'a fresh profile starts unflagged');
  const res = Profile.ingestResume(p, FIXTURE_TEXT);
  assert.equal(res.ok, true);
  assert.ok(res.drafts.length >= 8, 'the fixture still ingests as drafts in-thread');
  assert.equal(p.isTestFixture, true, 'the document declares itself a synthetic fixture — the flag must survive ingest');
  assert.ok((res.audit || []).some((a) => a.action === 'marked_test_fixture'), 'the marking is audited');
});

test('G1a: a resume that does not declare itself a fixture is NOT flagged', () => {
  const p = Profile.createProfile({});
  const res = Profile.ingestResume(p, PLAIN_TEXT);
  assert.equal(res.ok, true);
  assert.equal(p.isTestFixture, false, 'no behaviour change for an ordinary resume');
});

test('G1a: ingest never clears a flag the profile already carries', () => {
  const p = Profile.createProfile({ isTestFixture: true });
  const res = Profile.ingestResume(p, PLAIN_TEXT);
  assert.equal(res.ok, true);
  assert.equal(p.isTestFixture, true);
});

// ------------------------------------------------------------- G1b: no account promotion
test('G1b: a confirmed fixture profile is held in its thread and never promoted to the account', () => {
  const { say, store } = makeWorld();
  const user = 'u-g1b';
  const first = say(user, 't', `here is my resume:\n${FIXTURE_TEXT}`);
  assert.equal(first.ctx.profile.isTestFixture, true, 'the ingested profile carries the fixture flag');
  assert.ok((first.ctx.profile.facts || []).length > 0, 'the fixture still works inside its own thread');
  say(user, 't', "yes, that's my resume");
  const account = store.accounts.get(user) || {};
  const promoted = (account.memory && account.memory.profile && account.memory.profile.facts) || [];
  assert.equal(promoted.length, 0, `fixture facts reached the account record: ${JSON.stringify(promoted.map((f) => f.id))}`);
});

test('G1b: an ordinary resume still promotes to the account on confirmation (no behaviour change)', () => {
  const { say, store } = makeWorld();
  const user = 'u-g1b-plain';
  say(user, 't', `here is my resume:\n${PLAIN_TEXT}`);
  say(user, 't', "yes, that's my resume");
  const account = store.accounts.get(user) || {};
  const promoted = (account.memory && account.memory.profile && account.memory.profile.facts) || [];
  assert.ok(promoted.length > 0 && promoted.every((f) => f.status === 'confirmed'), 'a normal confirmed profile is on the account, as before');
});

// ------------------------------------------------------------- G2: stated-fact quarantine
test('G2: the exact gauntlet probe on a fixture-flagged session records NO stated facts', () => {
  const { say, store } = makeWorld();
  const user = 'u-g2-fixture';
  const profile = Profile.profileFromData(clone(PERSONA));
  assert.equal(profile.isTestFixture, true, 'precondition: the persona profile is fixture-flagged');
  const r = say(user, 't', TURN3, { profile });
  assert.deepEqual(factsOf(r), [], `a test session's statements became facts: ${JSON.stringify(factsOf(r))}`);
  const account = store.accounts.get(user) || {};
  assert.equal(account.stated_facts, undefined, 'nothing was committed toward the account stated_facts');
});

test('G2: the same probe on a normal session records exactly as before', () => {
  const { say } = makeWorld();
  const r = say('u-g2-normal', 't', TURN3, { profile: Profile.createProfile({}) });
  const contacts = factsOf(r).filter((f) => f.kind === 'recruiter_contact');
  assert.equal(contacts.length, 1, `expected the usual capture, got: ${JSON.stringify(factsOf(r))}`);
  assert.equal(contacts[0].key, 'northwind ledger');
  assert.equal(contacts[0].value, 'Dana');
  assert.equal(factsOf(r).filter((f) => f.kind === 'target_firm').length, 1);
});

// ------------------------------------------------------------- G3: smoke no-trace assertion
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT_FOR = (sub) => `hdr.${b64url({ sub, role: 'authenticated' })}.sig`;
const SUB = '2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3';
const BASE = 'https://example.supabase.co';
const hiFetch = async () => ({ status: 200, text: async () => JSON.stringify({ reply: 'hello' }) });
const countSql = (counts) => {
  let i = 0;
  return async (q) => {
    assert.match(q, /career_watch_kv/, 'the count reads the account record');
    assert.ok(q.includes(SUB), 'the count is scoped to the account the JWT names');
    return String(counts[Math.min(i++, counts.length - 1)]) + '\n';
  };
};

test('G3: jwtSubject reads the subject claim and rejects non-JWTs', () => {
  assert.equal(smoke.jwtSubject(JWT_FOR(SUB)), SUB);
  assert.equal(smoke.jwtSubject('fake-jwt-should-never-print'), null);
  assert.equal(smoke.jwtSubject(JWT_FOR('not-a-uuid')), null);
});

test('G3: a smoke turn that writes a stated fact FAILS the no-trace assertion', async () => {
  const out = await smoke.checkChatHiNoTrace({ base: BASE, jwt: JWT_FOR(SUB), fetchFn: hiFetch, sql: countSql([3, 4]) });
  assert.equal(out.results.length, 2, 'the hi result plus the assertion result');
  assert.equal(out.results[0].status, 'PASS', 'the hi turn itself answered');
  assert.equal(out.results[1].status, 'FAIL', `growth must fail: ${JSON.stringify(out.results)}`);
  assert.match(out.results[1].detail, /3 → 4|3 -> 4/);
});

test('G3: an unchanged count passes; without a database the assertion is NOT RUN, never a pass', async () => {
  const ok = await smoke.checkChatHiNoTrace({ base: BASE, jwt: JWT_FOR(SUB), fetchFn: hiFetch, sql: countSql([3, 3]) });
  assert.equal(ok.results[1].status, 'PASS');
  const noDb = await smoke.checkChatHiNoTrace({ base: BASE, jwt: JWT_FOR(SUB), fetchFn: hiFetch, sql: null });
  assert.equal(noDb.results.length, 1, 'only the hi result');
  assert.ok(noDb.traceNote, 'the caller is told the assertion did not run');
});
