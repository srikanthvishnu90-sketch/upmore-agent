"use strict";
// Job Radar scheduler repair — stale worker fence (2026-10-21).
// Production signature: ~10% of scheduler cycles crashed with only
// "Reminder storage could not be confirmed" in the cycle log. Mechanism
// (verified line-by-line): the fenced RPCs (career_watch_write,
// career_watch_cycle_commit, career_reminder_enqueue) raise
// 'stale or paused career worker' when the live career:account
// (version, epoch) differs from the caller's fence; the host captured
// its fence once at first read and never refreshed it, so ANY product
// turn landing during a minutes-long cycle killed the commit; and the
// rpc() wrapper erased the underlying error, leaving the crash
// undiagnosable (no code anywhere in the log).
// This fake mirrors the migration's semantics faithfully: PostgREST
// error shape {code:"P0001", message:"stale or paused career worker"},
// read returns {value, version, epoch, paused}, write bumps version,
// commit applies writes then enqueues, enqueue dedupes by reminder_id.
// Check: node --test tests/career-alerts-fence-repair.test.cjs
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const hostP = import(pathToFileURL(path.join(root, "scripts/career/alerts-host.mjs")).href);
let H;
before(async () => { H = await hostP; });

const USER = "user-fence-repair";
const FENCE_ERR = { code: "P0001", message: "stale or paused career worker" };

function makeFenceFake(opts = {}) {
  const account = { version: 0, epoch: 0, paused: false };
  const rows = new Map();   // key -> value
  const outbox = new Map(); // reminder_id -> reminder
  const calls = { career_watch_write: 0, career_watch_cycle_commit: 0, career_reminder_enqueue: 0, career_watch_read: 0 };
  const fenceFails = (v, e) => account.paused || v !== account.version || e !== account.epoch;
  const client = {
    async rpc(name, a) {
      if (name === "career_watch_read") {
        calls.career_watch_read++;
        return { data: { value: rows.has(a.p_key) ? structuredClone(rows.get(a.p_key)) : null, version: account.version, epoch: account.epoch, paused: account.paused }, error: null };
      }
      if (opts.failWith && (name === "career_watch_write" || name === "career_watch_cycle_commit" || name === "career_reminder_enqueue")) {
        calls[name]++;
        return { data: null, error: opts.failWith };
      }
      if (opts.forceFenceRaise && name === "career_watch_cycle_commit") {
        calls[name]++;
        return { data: null, error: { ...FENCE_ERR } };
      }
      if (name === "career_watch_write") {
        calls.career_watch_write++;
        if (fenceFails(a.p_version, a.p_epoch)) return { data: null, error: { ...FENCE_ERR } };
        rows.set(a.p_key, structuredClone(a.p_value));
        account.version = a.p_version + 1;
        return { data: { version: account.version, epoch: account.epoch }, error: null };
      }
      if (name === "career_watch_cycle_commit") {
        calls.career_watch_cycle_commit++;
        if (fenceFails(a.p_version, a.p_epoch)) return { data: null, error: { ...FENCE_ERR } };
        let v = a.p_version;
        for (const [k, val] of Object.entries(a.p_writes)) { rows.set(k, structuredClone(val)); v += 1; }
        account.version = v;
        for (const r of a.p_reminders) if (!outbox.has(r.reminder_id)) outbox.set(r.reminder_id, structuredClone(r));
        return { data: { version: account.version, epoch: account.epoch }, error: null };
      }
      if (name === "career_reminder_enqueue") {
        calls.career_reminder_enqueue++;
        if (fenceFails(a.p_version, a.p_epoch)) return { data: null, error: { ...FENCE_ERR } };
        if (!outbox.has(a.p_reminder.reminder_id)) outbox.set(a.p_reminder.reminder_id, structuredClone(a.p_reminder));
        return { data: { stored: true }, error: null };
      }
      if (name === "career_reminder_list") {
        return { data: { reminders: [...outbox.values()].map((r) => structuredClone(r)) }, error: null };
      }
      throw new Error("unexpected RPC " + name);
    },
  };
  return {
    client, rows, outbox, calls,
    bumpExternally() { account.version += 1; },        // a product turn's commit landing mid-cycle
    setPaused(p) { account.paused = p; },
    account: () => ({ ...account }),
  };
}

async function seededStore(fake) {
  const store = H.createSupabaseStore({ client: fake.client, userId: USER });
  await store.set("career:watch-profile:" + USER, { user_id: USER, interests: [] }); // first read captures the fence
  return store;
}

test("fence: a cycle commit survives a product turn landing mid-cycle (fence refreshed, retried once)", async () => {
  const fake = makeFenceFake();
  const store = await seededStore(fake);
  const tx = store.beginCycle();
  await tx.store.set("career:jobs:snapshot:board:gh:test:" + USER, { job_ids: ["j1"] });
  fake.bumpExternally(); // the turn that used to kill this cycle
  await tx.commit([]);    // pre-fix: rejects reminder_storage_unavailable
  assert.deepEqual(fake.rows.get("career:jobs:snapshot:board:gh:test:" + USER), { job_ids: ["j1"] }, "the buffered write landed");
  assert.equal(fake.calls.career_watch_cycle_commit, 2, "exactly one retry");
});

test("fence: reminder enqueue (delivery path) also recovers from a stale fence", async () => {
  const fake = makeFenceFake();
  const store = await seededStore(fake);
  fake.bumpExternally();
  const r = await store.delivery.enqueue({ user_id: USER, reminder_id: "rem-1", interest_id: "i1" });
  assert.deepEqual(r, { stored: true });
  assert.equal(fake.calls.career_reminder_enqueue, 2, "exactly one retry");
  assert.ok(fake.outbox.has("rem-1"));
});

test("fence: store.set recovers after an external bump (delivery-state path)", async () => {
  const fake = makeFenceFake();
  const store = await seededStore(fake);
  fake.bumpExternally();
  await store.set("career:delivery-state:" + USER, { sent: 1 });
  assert.deepEqual(fake.rows.get("career:delivery-state:" + USER), { sent: 1 });
  assert.equal(fake.calls.career_watch_write, 3, "seed write + failed attempt + one retry");
});

test("fence: a PAUSED account is never retried — the stop is named career_paused and nothing is written", async () => {
  const fake = makeFenceFake();
  const store = await seededStore(fake);
  const tx = store.beginCycle();
  await tx.store.set("career:jobs:snapshot:board:gh:test:" + USER, { job_ids: ["j1"] });
  fake.setPaused(true);
  await assert.rejects(() => tx.commit([]), (e) => e.code === "career_paused");
  assert.equal(fake.calls.career_watch_cycle_commit, 1, "no retry against a paused account");
  assert.equal(fake.rows.has("career:jobs:snapshot:board:gh:test:" + USER), false, "no write landed");
});

test("fence: a fence raise with an UNMOVED fence is not retried (the raise was not staleness we can repair)", async () => {
  const fake = makeFenceFake({ forceFenceRaise: true });
  const store = await seededStore(fake);
  const tx = store.beginCycle();
  await tx.store.set("career:jobs:snapshot:board:gh:test:" + USER, { job_ids: ["j1"] });
  await assert.rejects(() => tx.commit([]), (e) => e.code === "reminder_storage_unavailable" && e.fenceStale === true);
  assert.equal(fake.calls.career_watch_cycle_commit, 1, "no blind retry");
});

test("fence: a non-fence storage failure is NOT retried and the thrown error carries the underlying cause", async () => {
  const fake = makeFenceFake({ failWith: { code: "XX000", message: "internal boom" } });
  const store = H.createSupabaseStore({ client: fake.client, userId: USER });
  const tx = store.beginCycle();
  await tx.store.set("career:jobs:snapshot:board:gh:test:" + USER, { job_ids: ["j1"] });
  await assert.rejects(() => tx.commit([]), (e) =>
    e.code === "reminder_storage_unavailable"
    && e.rpcCause && e.rpcCause.code === "XX000" && /internal boom/.test(e.rpcCause.message));
  assert.equal(fake.calls.career_watch_cycle_commit, 1, "no retry on a non-fence failure");
});
