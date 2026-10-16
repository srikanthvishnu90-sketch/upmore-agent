'use strict';
// Opt-in REAL local PostgreSQL. Exact staged HTTP graph, two synthetic owners
// in ONE module realm, real career_host_load/commit, SQL-triggered rollback.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const F = require('./helpers/correction-privacy-fixture.cjs');
const port = Number(process.env.CAREER_TEST_PORT), database = process.env.CAREER_TEST_DATABASE;
if (!port && !database) {
  test('correction privacy against real PostgreSQL', { skip: 'explicit local CAREER_TEST_PORT and career_test_* database required' }, () => {});
} else {
  assert.ok(Number.isInteger(port) && port > 0 && /^career_test_[a-z0-9_]+$/.test(database || ''));
  const { Client } = require('pg');
  const config = { host: '127.0.0.1', port, database, user: 'postgres', password: '', ssl: false };
  let admin, service;
  const rpc = async (name, args) => (await service.query(`select public.${name}(${Object.keys(args).map((k, i) => `${k}=>$${i + 1}`).join(',')}) result`,
    Object.values(args).map(v => v !== null && typeof v === 'object' ? JSON.stringify(v) : v))).rows[0].result;
  const state = async i => (await admin.query('select state from agent_flow_state where thread_id=$1', [F.THREADS[i]])).rows[0].state.career;
  const seed = async (i, collision = 'default-id', year = i ? '2031' : '2027') => admin.query(
    'insert into agent_flow_state(thread_id,user_id,state)values($1,$2,$3) on conflict(thread_id)do update set state=excluded.state',
    [F.THREADS[i], F.OWNERS[i], { career: F.snapshot(F.OWNERS[i], F.profile(year, collision)) }]);
  const count = async table => Number((await admin.query('select count(*) n from ' + table)).rows[0].n);
  before(async () => {
    admin = new Client(config); await admin.connect(); service = new Client(config); await service.connect(); await service.query('set role service_role');
    await admin.query(`create or replace function public.career_privacy_reject() returns trigger language plpgsql as $$
      begin if current_setting('career_privacy.reject',true)=TG_TABLE_NAME||':'||coalesce(to_jsonb(NEW)->>'role','state') then raise exception 'synthetic privacy rollback'; end if; return NEW; end $$;
      create trigger career_privacy_messages before insert on agent_messages for each row execute function career_privacy_reject();
      create trigger career_privacy_state before insert or update on agent_flow_state for each row execute function career_privacy_reject();`);
  });
  beforeEach(async () => {
    await service.query("select set_config('career_privacy.reject','',false)");
    await admin.query('truncate auth.users cascade');
    for (let i = 0; i < 2; i++) {
      await admin.query('insert into auth.users values($1)', [F.OWNERS[i]]);
      await admin.query('insert into agent_threads values($1,$2)', [F.THREADS[i], F.OWNERS[i]]); await seed(i);
    }
  });
  after(async () => {
    await admin?.query('drop trigger if exists career_privacy_messages on agent_messages; drop trigger if exists career_privacy_state on agent_flow_state; drop function if exists career_privacy_reject()');
    await service?.end(); await admin?.end();
  });
  async function app() {
    let active = 0;
    const hooks = {}, trace = [];
    const transport = {
      auth: { getUser: async () => ({ data: { user: { id: F.OWNERS[active] } } }) },
      async rpc(name, args) {
        if (name === 'agent_rl_bump') return { data: true, error: null };
        assert.equal(args.p_user, F.OWNERS[active], 'verified auth owner reaches persistence');
        try {
          if (name === 'career_host_commit' && hooks.beforeCommit) { const once = hooks.beforeCommit; delete hooks.beforeCommit; await once(args); }
          const data = await rpc(name, args); trace.push({ name, args: F.copy(args), data: F.copy(data) }); return { data, error: null };
        } catch (e) { return { data: null, error: { message: e.message } }; }
      },
      from(table) {
        const filters = {};
        const q = { select() { return q; }, eq(k, v) { filters[k] = v; return q; },
          async upsert(row) { assert.equal(table, 'profiles'); assert.equal(row.id, F.OWNERS[active]); await service.query('insert into profiles(id)values($1)on conflict(id)do nothing', [row.id]); return { error: null }; },
          async maybeSingle() { assert.equal(table, 'agent_threads'); assert.equal(filters.user_id, F.OWNERS[active]); const r = await service.query('select id,user_id from agent_threads where id=$1 and user_id=$2', [filters.id, filters.user_id]); return { data: r.rows[0] || null, error: null }; } }; return q;
      },
    };
    const staged = await require('./helpers/career-staged-entry.cjs')(path.resolve(__dirname, '..'), transport);
    return { hooks, trace, close: staged.close, request(i, text, key, thread = F.THREADS[i]) { active = i; return staged.request(thread, text, key); } };
  }
  for (const fault of ['agent_messages:user', 'agent_messages:assistant', 'agent_flow_state:state']) {
    test(`real SQL rollback at ${fault}: failed A correction cannot reach B or A's next turn`, async () => {
      const a = await app();
      try {
        const old = await state(0), b = await state(1);
        await service.query("select set_config('career_privacy.reject',$1,false)", [fault]);
        assert.equal((await a.request(0, F.CORRECT, 'failed')).status, 503);
        assert.deepEqual(await state(0), old); assert.equal(await count('agent_messages'), 0); assert.equal(await count('career_watch_kv'), 0);
        await service.query("select set_config('career_privacy.reject','',false)");
        const recallB = await a.request(1, F.RECALL, 'recall-b'); assert.equal(recallB.status, 200); assert.match(recallB.body.reply, /2031/);
        assert.deepEqual((await state(1)).stores, b.stores);
        assert.match((await a.request(0, F.RECALL, 'recall-a')).body.reply, /2027/);
        assert.deepEqual((await state(0)).stores, old.stores);
      } finally { a.close(); }
    });
  }
  test('real SQL committed correction, owner boundary, restart and exact reply replay', async () => {
    await seed(0, 'name'); await seed(1, 'name'); const a = await app();
    try {
      const first = await a.request(0, F.CORRECT, 'saved'); assert.equal(first.status, 200);
      const committed = await state(0); assert.equal(committed.stores.profile.constraints.graduationDate, '2028');
      assert.equal(committed.stores.profile.fact_version, 1); assert.equal(committed.stores.profile.profile_corrections.length, 1);
      assert.deepEqual(await a.request(0, F.CORRECT, 'saved'), first); assert.deepEqual(await state(0), committed); assert.equal(await count('agent_messages'), 2);
      assert.equal((await a.request(1, F.RECALL, 'foreign', F.THREADS[0])).status, 404);
      assert.match((await a.request(1, F.RECALL, 'b')).body.reply, /2031/);
      const restarted = await app();
      try { assert.match((await restarted.request(0, F.RECALL, 'restart')).body.reply, /2028/); assert.deepEqual((await state(0)).stores, committed.stores); }
      finally { restarted.close(); }
    } finally { a.close(); }
  });
  test('real SQL stale correction loses revision race and cannot leak its uncommitted facts', async () => {
    const a = await app();
    try {
      const before = await state(0);
      a.hooks.beforeCommit = args => rpc('career_host_commit', { ...args, p_key: 'winner', p_snapshot: before, p_input: 'Synthetic competing turn', p_response: { ...args.p_response, turn_key: 'winner', reply: 'Synthetic winner' } });
      const rejected = await a.request(0, F.CORRECT, 'stale'); assert.equal(rejected.status, 409); assert.equal(rejected.body.error, 'revision_conflict');
      assert.deepEqual((await state(0)).stores, before.stores);
      assert.match((await a.request(1, F.RECALL, 'b')).body.reply, /2031/);
      assert.match((await a.request(0, F.RECALL, 'a')).body.reply, /2027/);
    } finally { a.close(); }
  });
  test('real SQL failed correction can retry the same key and commit exactly once', async () => {
    const a = await app();
    try {
      await service.query("select set_config('career_privacy.reject','agent_messages:assistant',false)");
      assert.equal((await a.request(0, F.CORRECT, 'retry')).status, 503);
      assert.equal(await count('agent_messages'), 0);
      await service.query("select set_config('career_privacy.reject','',false)");
      const saved = await a.request(0, F.CORRECT, 'retry'); assert.equal(saved.status, 200);
      const committed = await state(0); assert.equal(committed.stores.profile.constraints.graduationDate, '2028');
      assert.equal(committed.stores.profile.fact_version, 1); assert.equal(committed.stores.profile.profile_corrections.length, 1);
      assert.deepEqual(await a.request(0, F.CORRECT, 'retry'), saved); assert.equal(await count('agent_messages'), 2);
      assert.deepEqual(await state(0), committed);
    } finally { a.close(); }
  });
  test('real SQL erase epoch rejects old receipts and stale commits; reused profile identity cannot revive corrections', async () => {
    const a = await app();
    try {
      const saved = await a.request(0, F.CORRECT, 'saved'); assert.equal(saved.status, 200);
      const stale = await rpc('career_host_load', { p_user: F.OWNERS[0], p_thread: F.THREADS[0], p_key: 'stale', p_hash: 'a'.repeat(64) });
      assert.equal((await a.request(0, 'Forget my career profile', 'erase')).status, 200);
      assert.equal((await state(0)).stores.profile, undefined);
      const replay = await a.request(0, F.CORRECT, 'saved'); assert.equal(replay.status, 409); assert.equal(replay.body.error, 'privacy_epoch_changed'); assert.doesNotMatch(replay.body.reply, /2028/);
      const rejected = await rpc('career_host_commit', { p_user: F.OWNERS[0], p_thread: F.THREADS[0], p_key: 'stale', p_hash: 'a'.repeat(64), p_revision: stale.revision, p_account_version: stale.accountVersion,
        p_snapshot: stale.snapshot, p_patch: {}, p_input: 'Synthetic stale write', p_response: { thread_id: F.THREADS[0], reply: 'old', turn_key: 'stale', reminders: [] } });
      assert.equal(rejected.error, 'revision_conflict'); assert.equal((await state(0)).stores.profile, undefined);
      assert.equal((await a.request(0, 'resume career work', 'resume')).status, 200);
      // Simulate a newly imported source in the new epoch, reusing the default ID.
      const fresh = await state(0); fresh.stores.profile = F.profile('2035');
      await admin.query("update agent_flow_state set state=jsonb_set(state,'{career}',$2) where thread_id=$1", [F.THREADS[0], fresh]);
      assert.match((await a.request(0, F.RECALL, 'fresh-profile')).body.reply, /2035/);
      assert.deepEqual((await state(0)).stores.profile, F.profile('2035'));
      assert.match((await a.request(1, F.RECALL, 'b')).body.reply, /2031/);
    } finally { a.close(); }
  });
}
