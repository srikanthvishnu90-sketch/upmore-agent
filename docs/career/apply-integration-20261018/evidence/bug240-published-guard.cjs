// FR-398 GUARD (BUG-240 — the loop unreachable on the deployed
// product, found by the v224 live gauntlet on b45c06b): the owner's
// acceptance message "apply to 15 software engineering intern roles"
// in a fresh LIVE thread returned career_fallback — no batch run, no
// named stop, no batchApplyState (DB-verified live). The same commit
// ran the full loop in tier 2 because every tier-2 composition seeds
// what the live composition does not: a profile store, batchDeps, a
// postings pool. The seam's `if (!c.profile) return null` declined
// silently in the live shape and nothing downstream claimed the text.
//
// This suite is the permanent guard, staged through the REAL handler
// (index-career.ts -> handler-career.ts -> the career bundle, ESM
// realm, only the two remote services replaced) in the LIVE shape:
//   * EMPTY stores (a fresh thread's snapshot carries no profile),
//   * worker env ABSENT (delegation off, no boardFor installed),
//   * no batchDeps / postings injected (the handler passes none).
// Bar: the batch ask is CLAIMED by the batch route with its outcome
// named — a run, a delegation, or the exact missing prerequisite as
// the stop — never the generic fallback. Fail-first: cases 1 and 3
// are red against the b45c06b composition (career_fallback in both).
//
// The gauntlet's pause prelude is not replayed here: the account
// pause in that run had already been lifted by the resume turn
// (DB-verified), so at the ask the live shape is exactly "unpaused,
// empty stores"; the pause gate itself is graded by the loop suite
// and the host suites.
// Check: node --test tests/career-batch-live-shape.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync, execFileSync } = require("node:child_process");
const { stripTypeScriptTypes } = require("node:module");

const root = path.resolve(__dirname, "..");
const persistenceFake = require(path.join(root, "tests/helpers/career-persistence-fake.cjs"));

const USER = "00000000-0000-4000-8000-000000000001";
const THREAD = "00000000-0000-4000-8000-000000000002";
const SECRET = "live-shape-board-secret";
const WORKER_URL = "http://127.0.0.1:8124";
const MESSAGE = "apply to 15 software engineering intern roles";
const clone = (v) => JSON.parse(JSON.stringify(v));

// A thread WITH an onboarded profile (the control composition — the
// tier-2 suites' shape), synthetic like the reachability suite's.
const SNAPSHOT_PROFILE = {
  basics: { name: "Bundle Test", location: "Chicago, IL" },
  facts: [
    { kind: "education", text: "B.S. Computer Science at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Python", text: "Skill: Python", fact_id: "TEST-F1", evidence: ["synthetic resume lists Python"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago"], starredCompanies: [] },
};

// The staged-entry cases need VM modules (the reachability pattern):
// under a plain `node --test` invocation this file respawns itself
// once with the flag and asserts the inner run, so the sweep grades
// the same proof either way.
if (!vm.SourceTextModule) {
  test("batch live-shape staged-entry suites (respawned with VM modules)", () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // the nested runner must report its own exit status
    const run = spawnSync(process.execPath, ["--experimental-vm-modules", "--test", __filename], { encoding: "utf8", env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
} else {
// ---------------- the staged real handler (reachability pattern) ----
async function stagedApp(db, user, workerEnv) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "career-batch-live-shape-"));
  execFileSync(process.execPath, [path.join(root, "scripts/career/stage-career.cjs"), stage, "--json"]);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: user } } }) },
    rpc: (name, args) => persistenceFake(db, user, THREAD, name, args),
    from(table) {
      assert.ok(["profiles", "agent_threads", "agent_flow_state", "agent_messages"].includes(table), `unexpected table: ${table}`);
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          assert.equal(filters.user_id, user);
          if (table === "agent_threads") { assert.equal(filters.id, THREAD); return { data: { id: THREAD, user_id: user }, error: null }; }
          assert.equal(table, "agent_flow_state");
          assert.equal(filters.thread_id, THREAD);
          return { data: { state: clone(db.state) }, error: null };
        },
        async upsert(row) {
          db.writes.push(table);
          if (table === "agent_flow_state") { assert.equal(row.user_id, user); assert.equal(row.thread_id, THREAD); db.state = clone(row.state); }
          else assert.equal(table, "profiles");
          return { error: null };
        },
        async insert(row) { assert.equal(table, "agent_messages"); assert.equal(row.thread_id, THREAD); db.messages.push(clone(row)); return { error: null }; },
      };
      return query;
    },
  };
  let handle;
  let networkCalls = 0;
  const context = vm.createContext({
    Request, Response, Headers, URL, TextEncoder, TextDecoder, AbortController, crypto: require("node:crypto").webcrypto,
    setTimeout, clearTimeout,
    console: { log() {}, error() {}, warn() {} },
    fetch() { networkCalls++; throw new Error("external network forbidden in staged handler"); },
    Deno: { env: { get: (name) => ({ SUPABASE_URL: "https://supabase.example.test", SUPABASE_ANON_KEY: "mock-anon", SUPABASE_SERVICE_ROLE_KEY: "mock-service", UPMORE_CAREER_WORKER_URL: workerEnv ? WORKER_URL : undefined, UPMORE_CAREER_WORKER_SECRET: workerEnv ? SECRET : undefined })[name] } },
  });
  assert.equal(vm.runInContext("typeof require", context), "undefined");
  const modules = new Map();
  function load(id) {
    if (modules.has(id)) return modules.get(id);
    let mod;
    if (id === "https://deno.land/std@0.208.0/http/server.ts") {
      mod = new vm.SyntheticModule(["serve"], function () { this.setExport("serve", (fn) => { handle = fn; }); }, { context, identifier: id });
    } else if (id === "https://esm.sh/@supabase/supabase-js@2.117.1") {
      mod = new vm.SyntheticModule(["createClient"], function () { this.setExport("createClient", () => client); }, { context, identifier: id });
    } else {
      assert.ok(id.startsWith(stage + path.sep), `import escaped staged tree: ${id}`);
      let code = fs.readFileSync(id, "utf8");
      if (id.endsWith(".ts")) code = stripTypeScriptTypes(code, { mode: "transform" });
      mod = new vm.SourceTextModule(code, { context, identifier: id });
    }
    modules.set(id, mod);
    return mod;
  }
  const entry = load(path.join(stage, "agent-chat/index.ts"));
  await entry.link((specifier, referencing) => load(specifier.startsWith("https:") ? specifier : path.resolve(path.dirname(referencing.identifier), specifier)));
  await entry.evaluate();
  assert.equal(typeof handle, "function", "the staged entry registered the real handler");
  return {
    async chat(message, key) {
      const res = await handle(new Request("https://upmore.example.test/chat", {
        method: "POST", headers: { Authorization: "Bearer mock-user-token", "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: THREAD, message, turn_key: key }),
      }));
      const body = await res.json();
      assert.equal(networkCalls, 0, "the handler attempted no external network call");
      return { status: res.status, body };
    },
    close() { fs.rmSync(stage, { recursive: true, force: true }); },
  };
}
// The LIVE shape: a fresh thread — the snapshot's stores are EMPTY
// (no profile store, no batchApplyState, nothing), account unpaused.
function liveDb() {
  return { state: { career: { v: 1, stores: {} } }, messages: [], writes: [] };
}

test("FR-398 live shape: the batch ask is claimed and names its missing prerequisite — never the fallback", async () => {
  const db = liveDb();
  const app = await stagedApp(db, USER, false);
  try {
    const out = await app.chat(MESSAGE, "fr398-live-1");
    assert.equal(out.status, 200);
    assert.notEqual(out.body.meta.intent, "career_fallback", "the batch ask must never land on the generic fallback");
    assert.equal(out.body.meta.intent, "career_batch_apply", "the batch route claims the ask");
    assert.equal(out.body.meta.result_status, "awaiting_user");
    assert.match(out.body.reply, /apply to 15 software engineering intern roles/, "the reply names the batch it is answering");
    assert.match(out.body.reply, /no career profile in this conversation/i, "the reply names the exact missing prerequisite");
    assert.match(out.body.reply, /resume/i, "the reply gives the one next step that unblocks it");
    assert.ok(!out.body.batch, "no batch intent is attached — nothing was delegated or started");
    assert.ok(!db.batchIntents || db.batchIntents.size === 0, "no intent was committed");
    assert.equal((db.state.career.stores || {}).batchApplyState, undefined, "no hollow run record is manufactured from no facts");
  } finally { app.close(); }
});

test("FR-398 live shape: the claim is scoped — a count-less apply ask is not grabbed by the batch route", async () => {
  const db = liveDb();
  const app = await stagedApp(db, USER, false);
  try {
    const out = await app.chat("apply to software engineering roles", "fr398-scope-1");
    assert.equal(out.status, 200);
    assert.notEqual(out.body.meta.intent, "career_batch_apply", "count-less asks keep their existing routes (J7: a count is required)");
    assert.equal((db.state.career.stores || {}).batchApplyState, undefined);
  } finally { app.close(); }
});

test("FR-398 live shape, delegate mode: no thread profile is required — the ask delegates to the worker", async () => {
  const db = liveDb();
  const app = await stagedApp(db, USER, true);
  try {
    const out = await app.chat(MESSAGE, "fr398-delegate-1");
    assert.equal(out.status, 200);
    assert.notEqual(out.body.meta.intent, "career_fallback", "delegate mode must not fall back either");
    assert.equal(out.body.meta.intent, "career_batch_apply");
    assert.ok(out.body.batch && out.body.batch.kind === "pending_batch_intent" && out.body.batch.status === "queued", "the committed prepare intent rides the reply");
    assert.equal((db.batchIntents || new Map()).size, 1, "exactly one prepare intent committed with the turn");
    assert.match(out.body.reply, /browser worker/i);
    assert.match(out.body.reply, /Nothing has been filled or submitted yet/i, "the reply claims nothing the worker has not written");
    const skeleton = (db.state.career.stores || {}).batchApplyState;
    assert.ok(skeleton && skeleton.status === "queued_prepare", "the run skeleton rides the snapshot for the handler's planning");
  } finally { app.close(); }
});

test("FR-398 control: with a profile in the thread, the in-turn path still runs through the real handler", async () => {
  const db = { state: { career: { v: 1, stores: { profile: clone(SNAPSHOT_PROFILE) } } }, messages: [], writes: [] };
  const app = await stagedApp(db, USER, false);
  try {
    const out = await app.chat(MESSAGE, "fr398-control-1");
    assert.equal(out.status, 200);
    assert.equal(out.body.meta.intent, "career_batch_apply");
    assert.equal(out.body.meta.result_status, "completed");
    const run = (db.state.career.stores || {}).batchApplyState;
    assert.ok(run && run.status === "completed", "the run record is written by the in-turn path, as before the fix");
  } finally { app.close(); }
});
}
