"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path"), vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
if (!vm.SourceTextModule) {
  test("F009 actual staged endpoint and planner", () => {
    const r = spawnSync(process.execPath, ["--experimental-vm-modules", "--test", "--test-reporter=tap", __filename], { encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: "" } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
} else {
  const entry = require("./helpers/career-staged-entry.cjs");
  const persistence = require("./helpers/career-persistence-fake.cjs");
  const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", T = "33333333-3333-4333-8333-333333333333";
  const copy = v => JSON.parse(JSON.stringify(v));
  const original = id => ({ user_id: id, tz: "America/Chicago", prefs: { on: true, keywords: ["analyst"], locations: ["Chicago"], remote_ok: true, report_hour: 8, quiet_start: 20, quiet_end: 6, max_instant_per_day: 3, max_per_week: 8 }, last_checked_at: "2026-10-22T13:00:00Z", instant_sent_today: 2, sent_on: "2026-10-22", last_report_on: "2026-10-21", held: ["TEST-HELD"], updated_at: "2026-10-22T13:00:00Z" });
  async function world(options = {}) {
    const db = { state: { career: { v: 1, scope: { userId: A }, stores: {} } }, messages: [], account: options.paused ? { paused: true } : {}, options: {} };
    const rows = new Map([[A, original(A)], [B, original(B)]]); if (options.missing) rows.delete(A);
    if (options.disabled) rows.get(A).prefs.on = false;
    const writes = [];
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: A } } }) },
      rpc: async (name, args) => {
        if (["career_host_load", "career_host_commit", "agent_rl_bump"].includes(name)) return persistence(db, A, T, name, args);
        return { data: null, error: null };
      },
      from(table) {
        const filters = {}; let patch;
        const result = async single => {
          if (table === "career_alert_prefs") {
            assert.equal(filters.user_id, A, "preferences must be bound to authenticated owner");
            const row = rows.get(A);
            if (patch) {
              if (options.failWrite) return { data: null, error: { message: "SYNTHETIC WRITE FAILURE" } };
              if (options.race && row) row.prefs.keywords = ["newer confirmed keyword"];
              if (!row || (filters.prefs && filters.prefs !== JSON.stringify(row.prefs)) || (filters.tz && filters.tz !== row.tz)) return { data: null, error: null };
              writes.push(copy(patch)); Object.assign(row, copy(patch));
              return { data: { user_id: A }, error: null };
            }
            return { data: options.staleReadback && writes.length ? original(A) : row ? copy(row) : null, error: null };
          }
          if (table === "agent_threads") return { data: { id: T, user_id: A }, error: null };
          return { data: single ? null : [], error: null };
        };
        const q = {
          select() { return q; }, eq(k, v) { filters[k] = v; return q; }, order() { return q; }, limit() { return q; }, range() { return q; }, in() { return q; }, is() { return q; }, gte() { return q; },
          update(v) { assert.equal(table, "career_alert_prefs", "no unrelated update in this fixture"); patch = v; return q; },
          upsert() { if (table === "profiles") return Promise.resolve({ data: null, error: null }); throw Error("F009 must not replace whole alert rows or invent a watch"); },
          insert() { return { data: null, error: null }; },
          maybeSingle() { return result(true); }, single() { return result(true); },
          then(resolve, reject) { return result(false).then(resolve, reject); },
        }; return q;
      },
    };
    const app = await entry(ROOT, client); let n = 0;
    return { rows, writes, db, async ask(message, key) { return app.request(T, message, key || "f009_" + (++n)); }, close() { app.close(); } };
  }
  const check = async (opts, fn) => { const w = await world(opts); try { await fn(w); } finally { w.close(); } };
  test("F009 a complete whole-hour request saves and reads back the owner's exact quiet window", () => check({}, async w => {
    const before = copy(w.rows.get(A)), foreign = copy(w.rows.get(B)); const r = await w.ask("Set my quiet hours to 22:00-07:00.");
    assert.equal(r.status, 200); assert.equal(r.body.meta.intent, "career_quiet_hours");
    assert.equal(r.body.meta.result_status, "completed");
    assert.equal(w.rows.get(A).prefs.quiet_start, 22); assert.equal(w.rows.get(A).prefs.quiet_end, 7);
    assert.deepEqual(w.rows.get(B), foreign);
    assert.deepEqual(Object.keys(w.writes[0]).sort(), ["prefs", "tz", "updated_at"]);
    for (const k of ["instant_sent_today", "sent_on", "held", "last_checked_at", "last_report_on"]) assert.deepEqual(w.rows.get(A)[k], before[k]);
    assert.deepEqual(w.rows.get(A).prefs.keywords, before.prefs.keywords);
    assert.match(r.body.reply, /22:00.*07:00/); assert.match(r.body.reply, /America\/Chicago/);
    assert.doesNotMatch(r.body.reply, /text only in|only during|tell me your quiet hours/i);
  }));
  test("F009 a later query answers the stored quiet hours without a write", () => check({}, async w => {
    const r = await w.ask("What are my quiet hours?"); assert.equal(r.status, 200);
    assert.equal(r.body.meta.intent, "career_quiet_hours"); assert.equal(r.body.meta.result_status, "answered");
    assert.match(r.body.reply, /20:00.*06:00/); assert.equal(w.writes.length, 0);
  }));
  test("F009 explicit am/pm is preserved rather than guessed", () => check({}, async w => {
    const r = await w.ask("Set my quiet hours to 10pm-7am."); assert.equal(r.status, 200);
    assert.equal(r.body.meta.result_status, "completed"); assert.equal(w.rows.get(A).prefs.quiet_start, 22); assert.equal(w.rows.get(A).prefs.quiet_end, 7);
  }));
  test("F009 unsupported minute precision asks instead of silently rounding", () => check({}, async w => {
    const before = copy(w.rows.get(A)); const r = await w.ask("Set my quiet hours to 22:30-07:00.");
    assert.equal(r.body.meta.result_status, "awaiting_user"); assert.deepEqual(w.rows.get(A), before); assert.equal(w.writes.length, 0);
  }));
  test("F009 an ambiguous 10-7 request does not guess am/pm", () => check({}, async w => {
    const r = await w.ask("Set my quiet hours to 10-7."); assert.equal(r.body.meta.result_status, "awaiting_user"); assert.equal(w.writes.length, 0);
  }));
  test("F009 an explicit IANA zone is saved with the exact window", () => check({}, async w => {
    const r = await w.ask("Set my quiet hours to 22:00-07:00 Europe/London."); assert.equal(r.body.meta.result_status, "completed"); assert.equal(w.rows.get(A).tz, "Europe/London");
  }));
  test("F009 without an existing watch does not invent watch keywords or timezone", () => check({ missing: true }, async w => {
    const r = await w.ask("Set my quiet hours to 22:00-07:00."); assert.equal(r.body.meta.result_status, "awaiting_user"); assert.equal(w.rows.has(A), false); assert.equal(w.writes.length, 0);
  }));
  test("F009 a failed settings write cannot say it saved the hours", () => check({ failWrite: true }, async w => {
    const before = copy(w.rows.get(A)); const r = await w.ask("Set my quiet hours to 22:00-07:00.");
    assert.equal(r.body.meta.result_status, "blocked"); assert.deepEqual(w.rows.get(A), before); assert.doesNotMatch(r.body.reply, /^Saved/i);
  }));
  test("F009 a concurrent preference edit is preserved and the stale update is refused", () => check({ race: true }, async w => {
    const r = await w.ask("Set my quiet hours to 22:00-07:00."); assert.equal(r.body.meta.result_status, "blocked");
    assert.deepEqual(w.rows.get(A).prefs.keywords, ["newer confirmed keyword"]); assert.equal(w.rows.get(A).prefs.quiet_start, 20);
  }));
  test("F009 a question about a possible window does not write it", () => check({}, async w => {
    await w.ask("Would 22:00-07:00 be good quiet hours?"); assert.equal(w.writes.length, 0);
  }));
  test("F009 updating quiet hours does not enable a paused job watch", () => check({ disabled: true }, async w => {
    const r = await w.ask("Set my quiet hours to 22:00-07:00.");
    assert.equal(r.body.meta.result_status, "completed"); assert.equal(w.rows.get(A).prefs.on, false);
  }));
  test("F009 account pause keeps precedence over an explicit quiet-hours update", () => check({ paused: true }, async w => {
    const before = copy(w.rows.get(A)); const r = await w.ask("Set my quiet hours to 22:00-07:00.");
    assert.equal(r.body.meta.intent, "career_paused"); assert.deepEqual(w.rows.get(A), before); assert.equal(w.writes.length, 0);
  }));
  test("F009 a mismatching readback never yields a saved receipt", () => check({ staleReadback: true }, async w => {
    const r = await w.ask("Set my quiet hours to 22:00-07:00.");
    assert.equal(r.body.meta.result_status, "blocked"); assert.doesNotMatch(r.body.reply, /^Saved/i);
  }));
  test("F009 a replayed turn returns the same receipt without a second settings write", () => check({}, async w => {
    const first = await w.ask("Set my quiet hours to 22:00-07:00.", "f009_fixed_key");
    const second = await w.ask("Set my quiet hours to 22:00-07:00.", "f009_fixed_key");
    assert.equal(first.body.meta.result_status, "completed"); assert.deepEqual(second, first); assert.equal(w.writes.length, 1);
  }));
  for (const [title, message] of [
    ["invalid timezone", "Set my quiet hours to 22:00-07:00 Europe/Not_A_Zone."],
    ["out-of-range time", "Set my quiet hours to 24:00-07:00."],
    ["equal endpoints", "Set my quiet hours to 07:00-07:00."],
    ["extra instructions", "Set my quiet hours to 22:00-07:00 and enable applications."],
  ]) test("F009 asks about " + title + " instead of mutating preferences", () => check({}, async w => {
    const before = copy(w.rows.get(A)); const r = await w.ask(message);
    assert.equal(r.body.meta.result_status, "awaiting_user"); assert.deepEqual(w.rows.get(A), before); assert.equal(w.writes.length, 0);
  }));

}
