'use strict';
// =====================================================================
// LIVE-FIX LANE 2 — v241 re-gauntlet failures (probes i + j).
// Deploy + re-gauntlet record: docs/gauntlet/566d622d-live-fix.md §2
// (agent-chat v241 = 49b7ae36). Lane record:
// docs/gauntlet/49b7ae36-live-fix-2.md.
//
// ITEM 1 (probe i): "My recruiter contact at Northwind Ledger is
// Dana." — with fix lane 1's capture succeeding in-router, the turn
// died live as HTTP 503 storage_unavailable on three attempts: no
// thread, no stored message, no captured fact (SQL-verified), while
// other writes committed fine in the same minutes. MECHANISM: the
// succeeding capture emits a KEYED fact (kind recruiter_contact);
// career_host.js's account write-back placed the whole working set
// into the patch's stated_facts.facts, and the DEPLOYED validator
// (migration 20261016120000, career_host_commit) accepts into
// facts[] only 9 kinds — the raise rolled the atomic commit back and
// the persistence layer mapped it to storage_unavailable → 503. The
// node harness never saw it: its worlds never ran the SQL validator.
// The fix is at the host's account boundary: the write-back splits
// the record — SQL-shaped facts ride `facts`, every other fact rides
// the sibling `keyed` list (uninspected by the validator, stored by
// the commit merge) — and the seed folds `keyed` back into the one
// working set, so no fact is dropped or altered, only its carriage.
//
// ITEM 1(b) — REFERRED, not fixed in this lane (see the lane record
// §3): a storage-confirmation failure still answers the bare 503.
// Degrading it to a spoken HTTP-200 turn was attempted here and
// reverted: the failure surface is owned by the host-durability
// contract (tests/career-durability.test.cjs — "malformed storage
// response cannot become a false HTTP success", "failed state commit
// cannot acknowledge saved watch", and siblings;
// tests/independent-worker-atomic-interplay.test.cjs; the
// task-intent test in tests/career-bundle-reachability.test.cjs),
// which pins storage failure = unavailable (503) deliberately.
// Amending that contract is the durability owner's call, not a
// live-fix lane's side effect. The control test below pins the
// standing surface so any future amendment moves it deliberately.
//
// ITEM 2 (probe j): paste → ingest receipt (15 drafts) → "Yes,
// that's my resume." → career_fallback, channel_artifacts 0. Live
// thread state (read read-only) showed the end state exactly:
// profile = the 5 stated-facts-shaped entries, mirror WITHOUT
// resumeIngest, tailorTarget standing. MECHANISM: the account holds
// stated facts, so profileFromStatedFacts builds its bridge profile
// and dispatch installed it over ctx.profile EVERY turn — including
// the confirmation turn, where the standing profile (carrying the
// 15 ingest drafts) was replaced by a fresh 5-fact bridge BEFORE
// handleResumeIngestConfirm read it: 0 confirmable drafts → the
// claim consumed the mirror marker and returned null → fallback →
// the turn's snapshot persisted the draft-less bridge. Fix lane 1's
// staged world never saw it: its fixture account carried NO stated
// facts, so the bridge never fired. The fix honors the bridge's own
// contract (a real profile is never touched by the bridge): the
// bridge installs only when no real profile stands, and ingest
// never lands on a bridge profile — it founds a real one.
//
// THE WORLD: the REAL staged handler (scripts/career/stage-career.cjs)
// with remote services faked — plus the two faithfulness deltas the
// lane-1 fake lacked: (1) career_host_commit validates
// p_patch.stated_facts by a transcription of the deployed SQL
// (migration 20261016120000) and surfaces the raise the way
// PostgREST does; (2) the patch is APPLIED to the account record
// (SQL: account := account || patch) on an account object SHARED
// across thread-worlds, as career_watch_kv is account-scoped in
// production. Account fixtures are the LIVE test account's stored
// shapes (gauntlet-test@upmore.test, read read-only 2026-10-20).
// A drift pin below ties the transcription, the host's kind list,
// and the migration text together.
// =====================================================================

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const nodeCrypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");
const { stripTypeScriptTypes } = require("node:module");

const ROOT = path.resolve(__dirname, "..");
const clone = (x) => JSON.parse(JSON.stringify(x));
const persistenceFake = require(path.join(ROOT, "tests/helpers/career-persistence-fake.cjs"));
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

// ---- the deployed SQL contract, transcribed from
// supabase/migrations/20261016120000_career_account_stated_facts.sql
const SQL_KINDS = ["year", "majors", "geography", "target_firm", "level", "excluded_level", "school", "experience", "tone"];
function sqlValidatePatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  for (const k of Object.keys(patch)) if (!["paused", "preferred_locations", "erase", "stated_facts"].includes(k)) return "invalid account patch";
  if (!("stated_facts" in patch) || patch.erase === true) return null;
  const sf = patch.stated_facts;
  if (!sf || typeof sf !== "object" || Array.isArray(sf)) return "invalid stated facts";
  if (!Array.isArray(sf.facts)) return "invalid stated facts";
  if (sf.facts.length > 40) return "invalid stated facts";
  if (Buffer.byteLength(JSON.stringify(sf), "utf8") > 32768) return "invalid stated facts";
  for (const f of sf.facts) {
    if (!f || typeof f !== "object" || Array.isArray(f)) return "invalid stated facts";
    if (typeof f.kind !== "string" || !SQL_KINDS.includes(f.kind)) return "invalid stated facts";
    if (typeof f.value !== "string" || f.value.length < 1 || f.value.length > 200) return "invalid stated facts";
    if (!(f.evidence == null || (typeof f.evidence === "string" && f.evidence.length <= 200))) return "invalid stated facts";
  }
  if (sf.offer != null) {
    const o = sf.offer;
    if (typeof o !== "object" || Array.isArray(o)) return "invalid stated facts";
    if (!(o.firm == null || (typeof o.firm === "string" && o.firm.length <= 120))) return "invalid stated facts";
    if (!(o.role == null || (typeof o.role === "string" && o.role.length <= 120))) return "invalid stated facts";
    if (!(o.deadline == null || (typeof o.deadline === "string" && o.deadline.length <= 80))) return "invalid stated facts";
    if (!(o.amount == null || (typeof o.amount === "number" && o.amount > 0 && o.amount <= 1e8))) return "invalid stated facts";
  }
  return null;
}

test("drift pin: the guard's SQL transcription, the host's kind list, and the migration text agree", () => {
  const migration = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261016120000_career_account_stated_facts.sql"), "utf8");
  const m = migration.match(/f->>'kind' not in \(([^)]*)\)/);
  assert.ok(m, "the migration's stated-facts kind list is findable");
  const migrationKinds = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual(migrationKinds, SQL_KINDS, "the guard's transcription matches the deployed migration");
  const host = fs.readFileSync(path.join(ROOT, "supabase/functions/_shared/career_host.js"), "utf8");
  const h = host.match(/STATED_FACT_SQL_KINDS = \[([^\]]*)\]/);
  assert.ok(h, "the host carries its stated-facts SQL kind list at the account boundary");
  const hostKinds = [...h[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(hostKinds, SQL_KINDS, "the host's split list matches the deployed migration");
});

// ---- fixtures: the LIVE test account's stored shapes (read-only
// read 2026-10-20; career_watch_kv 'career:account', version 8455).
const LIVE_STATED_FACTS = [
  { at: "2026-10-20T12:26:55.689Z", kind: "year", value: "sophomore", evidence: "I am a sophomore" },
  { at: "2026-10-20T06:00:25.470Z", kind: "geography", value: "SF", evidence: "Find 75 data scientists at fintechs in SF who share my major" },
  { at: "2026-10-20T06:00:25.470Z", kind: "majors", value: "at fintechs in SF who share my", evidence: "at fintechs in SF who share my major" },
  { at: "2026-10-20T05:39:31.810Z", kind: "target_firm", value: "Google", evidence: "Find 55 people at Google who interned at startups first" },
  { at: "2026-10-20T05:30:40.075Z", kind: "level", value: "analysts", evidence: "analysts and first" },
];
const liveAccount = (statedFacts) => ({ epoch: 0, paused: false, version: 8455, stated_facts: statedFacts });
const liveShapedAccount = () => liveAccount({ facts: clone(LIVE_STATED_FACTS), offer: null, updated_at: "2026-10-20T13:26:55.917Z" });
// The record as the fixed write-back stores it after the Dana turn.
const postFixAccount = () => liveAccount({
  facts: clone(LIVE_STATED_FACTS),
  keyed: [{ kind: "recruiter_contact", key: "northwind ledger", value: "Dana", evidence: "recruiter contact at Northwind Ledger is Dana", at: "2026-10-20T14:52:28.601Z" }],
  offer: null, updated_at: "2026-10-20T14:52:28.601Z",
});
// A legacy record: a keyed kind still sitting inside facts[] (the
// shape any older or direct write could have left behind).
const legacyAccount = () => liveAccount({
  facts: [...clone(LIVE_STATED_FACTS), { kind: "recruiter_contact", key: "northwind ledger", value: "Dana", evidence: "recruiter contact at Northwind Ledger is Dana", at: "2026-10-20T14:52:28.601Z" }],
  offer: null, updated_at: "2026-10-20T14:52:28.601Z",
});

const USER = "00000000-0000-4000-8000-000000000001";
const THREAD_A = "00000000-0000-4000-8000-0000000000a1";
const THREAD_B = "00000000-0000-4000-8000-0000000000b2";
const recent = (days) => new Date(Date.now() - days * 864e5).toISOString();
function kbRow(over = {}) {
  return Object.assign({
    posting_key: "greenhouse:https://boards.greenhouse.io/natera/jobs/501",
    source: "greenhouse", board: "natera",
    company: "Natera", title: "Senior Product Manager, Provider and RWD Health Systems Applications",
    location: "Remote, United States", url: "https://boards.greenhouse.io/natera/jobs/501",
    posted_at: recent(2), fetched_on: "2026-10-14",
    text_excerpt: "Senior product manager for provider and real-world-data health systems applications. Requirements: product management experience, SQL, Python, stakeholder management, roadmap ownership.",
  }, over);
}
function freshDb(sharedAccount, over = {}) {
  return Object.assign({
    state: { career: { v: 1, stores: {} } },
    messages: [], writes: [], account: sharedAccount, version: 8455,
    kbMode: "ok", kbCalls: 0, kbTargetedCalls: 0, artifactRows: [],
    kbRows: [kbRow()], kbShelf: null, patches: [], patchErrors: [],
  }, over);
}

// rpc wrapper: the SQL-faithful commit gate + the patch applied to
// the (shared) account record, exactly as career_host_commit does.
function rpcFor(db, user, thread) {
  return async (name, args) => {
    const patch = name === "career_host_commit" ? args.p_patch : (args && args.p_base ? args.p_base.p_patch : undefined);
    if (patch !== undefined && ["career_host_commit", "career_task_turn_commit_v1", "career_batch_turn_commit_v1"].includes(name)) {
      db.patches.push(clone(patch));
      const err = sqlValidatePatch(patch);
      if (err) { db.patchErrors.push(err); return { data: null, error: { message: err } }; }
    }
    const out = await persistenceFake(db, user, thread, name, args);
    if (!out.error && !(out.data && out.data.error) && patch && typeof patch === "object") {
      if (patch.erase === true) { const v = (db.account.version || 0) + 1, e = (db.account.epoch || 0) + 1; for (const k of Object.keys(db.account)) delete db.account[k]; Object.assign(db.account, { version: v, epoch: e, paused: false }); }
      else for (const k of Object.keys(patch)) db.account[k] = clone(patch[k]);
    }
    return out;
  };
}

async function stagedApp(db, user, thread) {
  if (!vm.SourceTextModule) throw new Error("run with --experimental-vm-modules");
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "career-v241-gaps-"));
  execFileSync(process.execPath, [path.join(ROOT, "scripts/career/stage-career.cjs"), stage, "--json"]);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: user } } }) },
    rpc: rpcFor(db, user, thread),
    from(table) {
      if (table === "career_kb_postings") {
        const query = {
          _ilike: null, _limit: null,
          select() { return query; },
          order() { return query; },
          limit(n) { query._limit = n; return query; },
          ilike(col, pattern) { query._ilike = { col, pattern }; return query; },
          then(resolve) {
            db.kbCalls++;
            if (db.kbMode === "error") return resolve({ data: null, error: { message: "kb read failed (fixture)" } });
            if (query._ilike) {
              db.kbTargetedCalls++;
              if (db.kbMode === "targeted-error") return resolve({ data: null, error: { message: "kb targeted read failed (fixture)" } });
              const shelf = db.kbShelf || db.kbRows;
              const needle = String(query._ilike.pattern || "").replace(/%/g, "").toLowerCase();
              const hits = shelf.filter((r) => String(r[query._ilike.col] || "").toLowerCase().includes(needle));
              return resolve({ data: clone(query._limit ? hits.slice(0, query._limit) : hits), error: null });
            }
            return resolve({ data: clone(db.kbRows), error: null });
          },
        };
        return query;
      }
      if (table === "channel_artifacts") {
        return {
          async insert(row) { db.artifactRows.push(clone(row)); return { error: null }; },
          select() { const q = { eq() { return q; }, async maybeSingle() { return { data: null, error: null }; }, then(r) { return r({ data: [], error: null }); } }; return q; },
        };
      }
      assert.ok(["profiles", "agent_threads", "agent_flow_state", "agent_messages"].includes(table), `unexpected table: ${table}`);
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          assert.equal(filters.user_id, user);
          if (table === "agent_threads") { assert.equal(filters.id, thread); return { data: { id: thread, user_id: user }, error: null }; }
          assert.equal(table, "agent_flow_state");
          assert.equal(filters.thread_id, thread);
          return { data: { state: clone(db.state) }, error: null };
        },
        async upsert(row) {
          db.writes.push(table);
          if (table === "agent_flow_state") { assert.equal(row.user_id, user); assert.equal(row.thread_id, thread); db.state = clone(row.state); }
          else assert.equal(table, "profiles");
          return { error: null };
        },
        async insert(row) { assert.equal(table, "agent_messages"); assert.equal(row.thread_id, thread); db.messages.push(clone(row)); return { error: null }; },
      };
      return query;
    },
  };
  let handle; let networkCalls = 0;
  const context = vm.createContext({
    Request, Response, Headers, URL, TextEncoder, TextDecoder, AbortController, crypto: nodeCrypto.webcrypto,
    Buffer: require("node:buffer").Buffer, atob, btoa, structuredClone, queueMicrotask,
    setTimeout, clearTimeout,
    console: { log() {}, error() {}, warn() {} },
    fetch(url, init) { if (init && init.method === "HEAD") return Promise.resolve(new Response(null, { status: 200 })); networkCalls++; throw new Error("external network forbidden in staged handler"); },
    Deno: { env: { get: (name) => ({ SUPABASE_URL: "https://supabase.example.test", SUPABASE_ANON_KEY: "mock-anon", SUPABASE_SERVICE_ROLE_KEY: "mock-service" })[name] } },
  });
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
        method: "POST", headers: { Authorization: "Bearer <redacted>", "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: thread, message, turn_key: key }),
      }));
      const body = await res.json();
      assert.equal(networkCalls, 0, "the handler attempted no external network call");
      return { status: res.status, body };
    },
    close() { fs.rmSync(stage, { recursive: true, force: true }); },
  };
}

const RESUME_TEXT = fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-resume.txt"), "utf8");
const CB0495 = "Tailor my resume for the Product Manager role at Natera and send me the PDF as a file in this chat.";
const DANA = "My recruiter contact at Northwind Ledger is Dana.";
const WHO = "Who is my recruiter contact at Northwind Ledger?";

// =====================================================================
// Part 1 — the host seam in the node harness world (lane 1's
// production-semantics store pattern): the split is pinned where it
// is built, against the same live-shaped account fixtures.
// =====================================================================
const NOW = Date.parse("2026-10-20T15:00:00.000Z");
const PATCH_WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: o.postings || [], profile: o.profile });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(PATCH_WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist`);
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return { out, ctx, snap };
  };
  return { host, store, say };
}

test("host seam: the Dana turn's account patch splits — facts[] SQL-clean, Dana rides keyed, the stored record keeps every fact", () => {
  const w = makeWorld();
  w.store.accounts.set("u-i1", liveShapedAccount());
  const r = w.say("u-i1", "t-1", DANA);
  assert.equal(r.out.intent, "profile_correction", `intent=${r.out.intent}`);
  const patch = r.ctx._hostPatch;
  assert.ok(patch && patch.stated_facts, "the turn emits a stated_facts patch");
  assert.equal(sqlValidatePatch(patch), null, "the emitted patch passes the deployed SQL validator (transcription)");
  assert.ok(patch.stated_facts.facts.every((f) => SQL_KINDS.includes(f.kind)), "facts[] carries only validator kinds");
  assert.ok((patch.stated_facts.keyed || []).some((f) => f.kind === "recruiter_contact" && f.key === "northwind ledger" && f.value === "Dana"), "Dana rides the keyed list, unaltered");
  const stored = w.store.accounts.get("u-i1").stated_facts;
  assert.equal(stored.facts.length + (stored.keyed || []).length, 6, "the stored record holds all six facts — none dropped by the split");
});

test("host seam: recall reads the keyed list back — a second thread seeded from the committed account names Dana", () => {
  const w = makeWorld();
  w.store.accounts.set("u-i2", postFixAccount());
  const r = w.say("u-i2", "t-2", WHO);
  assert.equal(r.out.intent, "conversation_recall", `intent=${r.out.intent}; reply: ${String(r.out.reply).slice(0, 160)}`);
  assert.match(r.out.reply, /your recruiter contact at Northwind Ledger is Dana/);
});

test("host seam discipline (control): an unchanged record emits no stated_facts patch — the split never churns the account row", () => {
  const w = makeWorld();
  w.store.accounts.set("u-i3", postFixAccount());
  const r = w.say("u-i3", "t-3", WHO);
  assert.equal(r.out.intent, "conversation_recall", `intent=${r.out.intent}`);
  assert.ok(!r.ctx._hostPatch || !("stated_facts" in r.ctx._hostPatch), "a read-only turn writes no stated_facts patch");
});

test("host seam (item 2): a standing REAL profile is never shadowed by the stated-facts bridge", () => {
  const w = makeWorld();
  w.store.accounts.set("u-j1", liveShapedAccount());
  const ProfileMod = D("122-career-profile.js");
  const real = ProfileMod.createProfile({});
  real.facts.push({ kind: "skill", value: "Python", text: "Skill: Python", source: "resume-ingest", needs_confirmation: false, status: "confirmed" });
  w.store.threads.set("t-j1", { v: 1, scope: { userId: "u-j1" }, stores: { profile: clone(real) } });
  const r = w.say("u-j1", "t-j1", WHO);
  const standing = r.snap.stores.profile;
  assert.ok(standing && standing._fromStatedFacts !== true, "the stored profile after the turn is the real one, not a bridge derivation");
  assert.deepEqual(standing.facts, real.facts, "the real profile's facts are exactly as they stood");
});

if (!vm.SourceTextModule) {
  test("v241 live-gaps staged-handler suites (respawned with VM modules)", () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--experimental-vm-modules", "--test", __filename], { encoding: "utf8", env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
} else {
  // ---------- Item 1: the capture commits against live shapes ----------
  test("probe i verbatim, LIVE-shaped account: the Dana statement commits — recorded acknowledgment, the keyed fact on the account record, no SQL-rejectable element in facts[]", async () => {
    const account = liveShapedAccount();
    const db = freshDb(account);
    const app = await stagedApp(db, USER, THREAD_A);
    try {
      const r = await app.chat(DANA, "i-1");
      assert.equal(r.status, 200, `the statement turn must not 503 (body: ${JSON.stringify(r.body).slice(0, 200)})`);
      assert.equal(r.body.meta.intent, "profile_correction", `intent=${r.body.meta.intent}`);
      assert.match(r.body.reply, /Recorded/, `the recorded acknowledgment: ${String(r.body.reply).slice(0, 120)}`);
      assert.deepEqual(db.patchErrors, [], "the deployed SQL validator accepts every patch this turn emits");
      assert.equal(db.messages.length, 2, "the turn's message pair is stored (the commit landed atomically)");
      const sf = account.stated_facts;
      assert.ok(Array.isArray(sf.keyed), "the stored record carries the keyed list");
      const dana = sf.keyed.find((f) => f && f.kind === "recruiter_contact");
      assert.ok(dana && dana.key === "northwind ledger" && dana.value === "Dana", `Dana is on the account record as the keyed contact: ${JSON.stringify(sf.keyed)}`);
      assert.ok(sf.facts.every((f) => SQL_KINDS.includes(f.kind)), "facts[] holds only validator-shaped kinds");
      assert.equal(sf.facts.length, 5, "the five pre-existing facts are unaltered in carriage and content");
    } finally { app.close(); }
  });

  test("probe i recall half: a fresh thread's who-question recalls Dana from the account record — never company intel", async () => {
    const account = postFixAccount();
    const db = freshDb(account);
    const app = await stagedApp(db, USER, THREAD_B);
    try {
      const r = await app.chat(WHO, "i-2");
      assert.equal(r.status, 200);
      assert.equal(r.body.meta.intent, "conversation_recall", `intent=${r.body.meta.intent}; reply: ${String(r.body.reply).slice(0, 160)}`);
      assert.match(r.body.reply, /your recruiter contact at Northwind Ledger is Dana/, `the recall names the recorded contact: ${String(r.body.reply).slice(0, 200)}`);
    } finally { app.close(); }
  });

  test("probe i legacy heal: a record still holding a keyed kind inside facts[] commits its next changing turn in the split shape", async () => {
    const account = legacyAccount();
    const db = freshDb(account);
    const app = await stagedApp(db, USER, THREAD_A);
    try {
      const r = await app.chat("I am a junior.", "i-3");
      assert.equal(r.status, 200, `a legacy-shaped record must not 503 its next capture (body: ${JSON.stringify(r.body).slice(0, 200)})`);
      assert.deepEqual(db.patchErrors, [], "no patch is SQL-rejectable");
      const sf = account.stated_facts;
      assert.ok(sf.facts.some((f) => f.kind === "year" && f.value === "junior"), "the new statement is recorded");
      assert.ok(!sf.facts.some((f) => f.kind === "recruiter_contact"), "facts[] no longer carries the keyed kind");
      assert.ok((sf.keyed || []).some((f) => f.kind === "recruiter_contact" && f.value === "Dana"), "the keyed fact survived the heal in the keyed list");
    } finally { app.close(); }
  });

  // ---------- Item 1(b): the standing failure surface (control) ----------
  // Green before and after this lane BY DESIGN: the surface is the
  // durability contract's, and this pin exists so a future deliberate
  // amendment (the degradation this lane referred to that owner)
  // moves it in the open, in both suites at once.
  test("item 1(b) control (contract boundary): a storage-confirmation failure keeps the durability contract's unavailable surface — HTTP 503, nothing stored, no router outcome presented as saved", async () => {
    const account = liveShapedAccount();
    const db = freshDb(account, { options: { failSave: true } });
    const app = await stagedApp(db, USER, THREAD_A);
    try {
      const r = await app.chat("Watch data analyst roles for me.", "i-4");
      assert.equal(r.status, 503, `the standing surface is the durability contract's 503 (status=${r.status})`);
      assert.equal(r.body.error, "storage_unavailable");
      assert.equal(db.messages.length, 0, "nothing was stored by the failed turn");
    } finally { app.close(); }
  });

  // ---------- Item 2: the (j) journey on the LIVE-shaped account ----------
  test("probe j, LIVE-shaped account: paste → drafts on a REAL profile → the yes confirms and tailors with the artifact; delivery re-serves byte-identical", async () => {
    const account = liveShapedAccount();
    const db = freshDb(account);
    const app = await stagedApp(db, USER, THREAD_A);
    try {
      const t1 = await app.chat(CB0495, "j-1");
      assert.equal(t1.status, 200);
      assert.equal(t1.body.meta.intent, "career_tailor", `intent=${t1.body.meta.intent}`);
      assert.match(t1.body.reply, /Paste your resume/, "the tailor names the one missing input");
      const t2 = await app.chat(RESUME_TEXT, "j-2");
      assert.equal(t2.status, 200);
      assert.equal(t2.body.meta.intent, "career_resume_ingest", `intent=${t2.body.meta.intent}`);
      const stores2 = db.state.career.stores;
      const prof2 = stores2.profile;
      assert.ok(prof2 && Array.isArray(prof2.facts), "a profile stands after the paste");
      assert.notEqual(prof2._fromStatedFacts, true, "the drafts stand on a REAL profile, never the per-turn bridge");
      assert.equal(prof2.facts.filter((f) => f && f.source === "resume-ingest" && f.needs_confirmation).length, 15, "all 15 drafts stand awaiting confirmation");
      const mir2 = stores2.trackStore && stores2.trackStore._careerThread;
      assert.ok(mir2 && mir2.resumeIngest && mir2.tailorTarget, "the mirror carries the ingest marker and the tailor target");
      const t3 = await app.chat("Yes, that's my resume.", "j-3");
      assert.equal(t3.status, 200);
      assert.equal(t3.body.meta.intent, "career_tailor", `the confirmation runs the standing tailor target (intent=${t3.body.meta.intent}); reply: ${String(t3.body.reply || "").slice(0, 200)}`);
      assert.match(t3.body.reply, /Confirmed — 15 facts/, `the confirmation speaks its count: ${String(t3.body.reply).slice(0, 120)}`);
      assert.ok(Array.isArray(t3.body.artifacts) && t3.body.artifacts.length >= 1, "the tailor turn carries the document artifact");
      assert.ok(db.artifactRows.length >= 1, "a channel_artifacts row was materialized");
      const row = db.artifactRows[db.artifactRows.length - 1];
      const bytes = Buffer.from(row.bytes_b64, "base64");
      assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-", "the stored bytes are a real PDF");
      assert.equal(nodeCrypto.createHash("sha256").update(bytes).digest("hex"), row.sha256, "the stored sha256 is the bytes' own hash");
      const prof3 = db.state.career.stores.profile;
      assert.equal(prof3.facts.filter((f) => f && f.source === "resume-ingest" && !f.needs_confirmation).length, 15, "the drafts stand confirmed on the stored profile");
      const t4 = await app.chat("Send me the PDF as a file in this chat.", "j-4");
      assert.equal(t4.body.meta.intent, "career_document_delivery", `intent=${t4.body.meta.intent}`);
      const delivered = db.artifactRows[db.artifactRows.length - 1];
      assert.equal(delivered.sha256, row.sha256, "re-delivery is byte-identical (same sha)");
    } finally { app.close(); }
  });
}
