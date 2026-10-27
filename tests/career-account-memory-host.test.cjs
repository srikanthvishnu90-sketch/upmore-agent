'use strict';
// FEATURE 9: the host seam carries the person's profile and tracker on the account record (patch key `memory`,
// migration 20261026090009), seeds them into every thread, keeps the thread's frames per thread, and never writes the
// record on an erase turn. The SQL side is tests/db/career_account_memory.test.sql; the handler flow is
// tests/architect/flow-account-memory.test.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '..');
const U = 'u-memory-test';
let host, B;
async function setup() {
  if (host) return;
  B = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/router_core.career.js')));
  const { CareerHost } = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/career_host.js')));
  host = CareerHost.createCareerHost(B);
}
const copy = (x) => JSON.parse(JSON.stringify(x));
// A tiny world: one account record merged like career_host_commit merges it, thread snapshots by id.
function world() {
  let account = { version: 0, epoch: 0 };
  const threads = {};
  return {
    get account() { return account; },
    threads,
    turn(t, text) {
      const ctx = host.createTurnCtx({ userId: U, threadId: t, accountPersistence: true, accountMemory: true, snapshot: threads[t] ? copy(threads[t]) : null, account: copy(account), watchState: {} });
      const out = host.runTurn(text, ctx);
      threads[t] = copy(host.extractSnapshot(ctx));
      const patch = copy(ctx._hostPatch || {});
      account = patch.erase ? { version: account.version + 1, epoch: account.epoch + 1, paused: true } : { ...account, ...patch, version: account.version + 1 };
      return { out, patch, ctx };
    },
  };
}

test('a tracker row logged in one thread is in a new thread; the thread frame stays with its thread', async () => {
  await setup();
  const w = world();
  const logged = w.turn('A', 'I applied to Stripe for the software engineering intern role');
  assert.equal(logged.out.intent, 'tracking_log');
  assert.ok(logged.patch.memory, 'the tracker went to the account');
  assert.deepEqual(w.account.memory.tracker.rows.map((r) => r.company), ['Stripe']);
  assert.ok(!('_careerThread' in w.account.memory.tracker), 'no thread frame on the account');
  assert.equal(w.threads.A.account_memory, 1, 'the thread is stamped as account-backed');
  const b = w.turn('B', 'what does my tracker look like');
  assert.match(b.out.reply, /Your tracker holds 1 application/);
  assert.equal(b.patch.memory, undefined, 'an unchanged record is not written again');
});

test('a resume confirmed in one thread is the profile of a new thread; thread frames never reach the account', async () => {
  await setup();
  const fs = require('node:fs');
  // This test stands in for a REAL person's resume. The fixture file's first line declares it a synthetic
  // fixture, and since the 2026-10-27 fixture guards a self-declared fixture is (correctly) never promoted
  // to the account — so the declaration line is stripped here. The parser skips that line anyway, so the
  // parsed drafts are identical; the fixture-guard behaviour itself is asserted in
  // tests/career-fixture-guards-20261027.test.cjs.
  const resume = fs.readFileSync(path.join(ROOT, 'packages/career-data/fixtures/test-resume.txt'), 'utf8').split('\n').filter((l) => !/synthetic fixture/i.test(l)).join('\n');
  const w = world();
  w.turn('A', `here is my resume:\n${resume}`);
  w.turn('A', "yes, that's my resume");
  const facts = w.account.memory.profile.facts;
  assert.ok(facts.length > 0 && facts.every((f) => f.status === 'confirmed'), 'the confirmed profile is on the account');
  assert.ok(Object.keys(w.account.memory.profile).every((k) => !k.startsWith('_')), 'no router frame on the account profile');
  const b = w.turn('B', 'thanks');
  assert.equal(B.CareerProfile.confirmedFacts(b.ctx.profile).length, facts.length, 'thread B starts from the confirmed profile');
});

test('a thread written before the account held a memory adds its tracker rows; an erase turn writes no memory', async () => {
  await setup();
  const w = world();
  w.turn('A', 'I applied to Stripe for the software engineering intern role');
  // A legacy thread: its own tracker row, no account stamp.
  const legacy = copy(w.threads.A);
  delete legacy.account_memory;
  legacy.stores.trackStore.rows = [{ ...legacy.stores.trackStore.rows[0], app_id: 'app-legacy-1', company: 'Figma' }];
  w.threads.L = legacy;
  const l = w.turn('L', 'what does my tracker look like');
  assert.match(l.out.reply, /Your tracker holds 2 applications/);
  assert.deepEqual(w.account.memory.tracker.rows.map((r) => r.company).sort(), ['Figma', 'Stripe']);
  const erased = w.turn('A', 'forget my career profile');
  assert.equal(erased.patch.memory, undefined, 'the erase turn carries no memory');
  assert.equal(w.account.memory, undefined);
});

test('a record over the size bound stays with the thread and is not stamped account-backed', async () => {
  await setup();
  const ctx = host.createTurnCtx({ userId: U, threadId: 'A', accountPersistence: true, accountMemory: true, snapshot: null, account: { version: 0, epoch: 0 }, watchState: {} });
  ctx.profile = { facts: [{ id: 'F-1', kind: 'skill', text: 'x'.repeat(600000), status: 'confirmed' }] };
  const snap = host.extractSnapshot(ctx);
  assert.equal((ctx._hostPatch || {}).memory, undefined);
  assert.equal(snap.account_memory, undefined);
  assert.equal(snap.stores.profile.facts.length, 1, 'the thread keeps it, as before');
});

test('without the composition root turning it on (CAREER_ACCOUNT_MEMORY unset), nothing moves to the account', async () => {
  await setup();
  const ctx = host.createTurnCtx({ userId: U, threadId: 'A', accountPersistence: true, snapshot: null, account: { version: 0, epoch: 0, memory: { v: 1, tracker: { rows: [{ app_id: 'app-x', company: 'TEST Co' }] } } }, watchState: {} });
  assert.equal(ctx.trackStore, undefined, 'the account memory is not seeded');
  host.runTurn('I applied to Stripe for the software engineering intern role', ctx);
  host.extractSnapshot(ctx);
  assert.equal((ctx._hostPatch || {}).memory, undefined);
});
