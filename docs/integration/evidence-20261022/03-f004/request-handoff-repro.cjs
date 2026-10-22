'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { webcrypto } = require('node:crypto');
const assert = require('node:assert/strict');
let networkCalls = 0;
const root = path.resolve(process.argv[2] || process.cwd());
const output = process.argv[3] || null;
const { CareerHost } = require(path.join(root, 'supabase/functions/_shared/career_host.js'));
const profileData = JSON.parse(fs.readFileSync(path.join(root, 'packages/career-data/fixtures/gauntlet/profiles/p1-early-career-swe/profile.json'), 'utf8'));
const pool = [{ id: 'synthetic-request-1', title: 'Software Engineering Intern', company: 'Synthetic Handoff Company',
  location: 'Chicago, IL', remote_terms: 'hybrid', requirements: ['Python', 'SQL'],
  url: 'https://boards.greenhouse.io/synthetichandoff/jobs/1' }];
const inputs = [
  'I want to find software engineering internships.',
  'I want you to find software engineering internships.',
  'I want to search software engineering roles.',
  'Find me software engineering internships.',
];
async function run(sha) {
  const source = execFileSync('git', ['show', sha + ':supabase/functions/_shared/router_core.career.js'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const context = vm.createContext({ console, crypto: webcrypto, TextEncoder, TextDecoder, URL, URLSearchParams,
    AbortController, setTimeout, clearTimeout, structuredClone, Buffer,
    fetch() { networkCalls++; throw new Error('External network forbidden in this synthetic control'); } });
  const mod = new vm.SourceTextModule(source, { context, identifier: 'synthetic-bundle-' + sha });
  await mod.link((specifier) => { throw new Error('Unexpected external import: ' + specifier); });
  await mod.evaluate();
  const core = mod.namespace;
  const names = ['CareerAccess', 'CareerOnboarding', 'CareerRouter', 'CareerDoorstep', 'CareerReply', 'CareerContainment'];
  const host = CareerHost.createCareerHost(Object.fromEntries(names.map((n) => [n, core[n]])));
  return inputs.map((message) => {
    const profile = core.CareerProfile.profileFromData(structuredClone(profileData));
    const ctx = host.createTurnCtx({ userId: 'synthetic-f004-request', threadId: 'synthetic-f004-thread',
      now: Date.parse('2026-10-22T15:00:00Z'), profile, postings: structuredClone(pool) });
    const out = host.runTurn(message, ctx);
    return { message, intent: out.intent, status: out.resultStatus, shortlist: (out.result?.shortlist || []).length, reply: out.reply };
  });
}
(async () => {
  const result = { synthetic_only: true, before_sha: '75600f5ebaac591505b89607e112e9eb75d350d8',
    after_sha: '7f04c59968a6ea60bdc5db92a2de43298e594bbc' };
  result.before = await run(result.before_sha);
  result.after = await run(result.after_sha);
  for (let i = 0; i < inputs.length; i++) {
    assert.equal(result.before[i].intent, 'career_internship_discovery');
    assert.equal(result.before[i].shortlist, 1);
    assert.deepEqual(result.after[i], result.before[i], inputs[i]);
  }
  assert.equal(networkCalls, 0);
  result.network_calls = networkCalls;
  result.controls_passed = inputs.length;
  if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => { console.error(e); process.exitCode = 1; });
