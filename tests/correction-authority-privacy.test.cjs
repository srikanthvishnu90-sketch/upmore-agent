'use strict';
// Exact staged index.ts -> handler-career.ts -> generated career bundle.
// One ESM realm serves both synthetic authenticated owners, without resets.
// The transport fixture is not a proof of SQL rollback; the companion real-PG
// suite injects failures into the actual commit function.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const F = require('./helpers/correction-privacy-fixture.cjs');
const Onboarding = require('../packages/domain/130-career-onboarding.js');
if (!vm.SourceTextModule) {
  test('correction authority privacy regressions', () => {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', __filename], { encoding: 'utf8', env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
} else {
  async function app(collision, failSave) {
    assert.equal(F.profile().id, require('../packages/domain/122-career-profile.js').createProfile().id);
    let active = 0;
    const dbs = F.OWNERS.map((owner, i) => ({ options: { failSave: i === 0 && failSave },
      state: { career: F.snapshot(owner, F.profile(i ? '2031' : '2027', collision)) }, messages: [] }));
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: F.OWNERS[active] } } }) },
      rpc(name, args) {
        return require('./helpers/career-persistence-fake.cjs')(dbs[active], F.OWNERS[active], F.THREADS[active], name, args);
      },
      from(table) {
        const filters = {};
        const query = { select() { return query; }, eq(k, v) { filters[k] = v; return query; },
          async upsert(row) { assert.equal(table, 'profiles'); assert.equal(row.id, F.OWNERS[active]); return { error: null }; },
          async maybeSingle() {
            assert.equal(table, 'agent_threads'); assert.equal(filters.user_id, F.OWNERS[active]);
            return { data: filters.id === F.THREADS[active] ? { id: filters.id, user_id: filters.user_id } : null, error: null };
          } };
        return query;
      },
    };
    const staged = await require('./helpers/career-staged-entry.cjs')(path.resolve(__dirname, '..'), client);
    return { dbs, close: staged.close, request(owner, text, key) { active = owner; return staged.request(F.THREADS[owner], text, key); } };
  }
  for (const collision of ['default-id', 'name', 'email']) {
    for (const failSave of [true, false]) {
      test(`staged two-owner ${collision}: ${failSave ? 'failed' : 'committed'} A correction never contaminates B`, async () => {
        const a = await app(collision, failSave);
        try {
          const beforeB = F.copy(a.dbs[1].state.career.stores.profile);
          const first = await a.request(0, F.CORRECT, 'correction');
          assert.equal(first.status, failSave ? 503 : 200);
          if (failSave) { assert.equal(a.dbs[0].messages.length, 0); assert.equal(a.dbs[0].state.career.stores.profile.constraints.graduationDate, '2027'); }
          else assert.equal(a.dbs[0].state.career.stores.profile.constraints.graduationDate, '2028');
          const second = await a.request(1, F.RECALL, 'recall');
          assert.equal(second.status, 200);
          assert.match(second.body.reply, /2031/, 'B must recall B2031, never A2028');
          assert.doesNotMatch(second.body.reply, /2028/);
          assert.deepEqual(a.dbs[1].state.career.stores.profile, beforeB, 'recall must not import audit, facts, source, version or dependents');
        } finally { a.close(); }
      });
    }
  }
  test('committed same-user correction survives fresh handler process and exact atomic replay', async () => {
    const a = await app('default-id', false);
    try {
      const first = await a.request(0, F.CORRECT, 'correction'); assert.equal(first.status, 200);
      const committed = F.copy(a.dbs[0].state.career.stores.profile);
      assert.equal(committed.fact_version, 1); assert.equal(committed.profile_corrections.length, 1);
      assert.equal(committed.facts[0].needs_confirmation, false); assert.equal(committed.dependent_state.rebuilt, true);
      assert.deepEqual(await a.request(0, F.CORRECT, 'correction'), first);
      assert.equal(a.dbs[0].messages.length, 2); assert.deepEqual(a.dbs[0].state.career.stores.profile, committed);
      const b = await app('default-id', false);
      try {
        b.dbs[0].state = F.copy(a.dbs[0].state); // only committed JSON crosses the process boundary
        assert.match((await b.request(0, F.RECALL, 'fresh')).body.reply, /2028/);
        assert.deepEqual(b.dbs[0].state.career.stores.profile, committed);
      } finally { b.close(); }
    } finally { a.close(); }
  });
  test('legacy export never exposes profile correction data', () => {
    const p = F.profile(); assert.equal(Onboarding.applyProfileCorrection(p, F.CORRECT).ok, true);
    assert.deepEqual(Onboarding.exportCorrectionStore(), []);
  });
  test('legacy restore cannot import an ownerless correction snapshot', () => {
    const poison = [{ key: F.profile().id, graduationDate: '2099', changes: [], audit: [{ instruction: 'synthetic foreign correction' }], resume_sources: { active: 'foreign' } }];
    assert.equal(Onboarding.restoreCorrectionStore(poison), 0);
    assert.deepEqual(Onboarding.exportCorrectionStore(), []);
    const p = F.profile('2031'), before = F.copy(p);
    assert.equal(Onboarding.applyPersistedCorrections(p), false);
    assert.deepEqual(p, before);
  });
  test('stale and erased profile loads cannot receive process-local correction replay', () => {
    Onboarding._resetCorrectionStore();
    const old = F.profile(), stale = F.copy(old);
    Onboarding.applyProfileCorrection(old, F.CORRECT);
    assert.equal(Onboarding.applyPersistedCorrections(stale), false); assert.deepEqual(stale, F.profile());
    const erased = { id: old.id, basics: F.copy(old.basics), constraints: {}, facts: [] }, before = F.copy(erased);
    Onboarding.handleChat(F.RECALL, { profile: erased }); assert.deepEqual(erased, before);
    Onboarding._resetCorrectionStore(); assert.equal(old.constraints.graduationDate, '2028', 'legacy reset must not erase committed profile facts');
  });
}
