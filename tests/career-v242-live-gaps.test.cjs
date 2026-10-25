// =====================================================================
// V242 LIVE-FIX LANE (fix/v242-live-gaps) — probe (j)'s last leg.
//
// THE LIVE FAILURE (v242 gauntlet, thread f0a12430-744f-4741-819f-
// 73a3a8e89dad): CB-0495 → needs-facts; the fixture-resume paste →
// 15 draft facts; "Yes, that's my resume." → HTTP 200 CONTAINED
// ("Something went wrong on my end — nothing changed on your
// side.…", intent null) — while SQL proved the confirmation had
// COMMITTED in the same turn: the standing profile is a real
// profile, all 15 facts confirmed (needs_confirmation = 0), the
// resumeIngest marker consumed, the tailor target standing. The
// throw sat AFTER the confirm handler's mutations, inside its
// chained tailor leg (handleTailor / rankedShortlist): the profile
// store carries no _careerRouterArtifacts (the leg never reached
// the artifact push), and channel_artifacts stayed 0.
//
// THE DEFECT THIS LANE FIXES: the confirm handler's tailor leg was
// UNGUARDED. Its designed degradation already existed — a chained
// tailor that returns no artifact falls through to the plain
// "Confirmed — your resume facts are on your record." reply — but
// a tailor leg that THROWS escaped the handler entirely, took the
// whole turn down into containment, and the contained copy then
// falsely denied the commit the turn had just made. The fix holds
// the leg to its own contract: a throw degrades exactly like an
// artifact-less result — the confirmation's reply ships, the
// facts stand confirmed, the marker stays consumed. (The live
// trigger itself did not reproduce from the stored post-confirm
// state in any staged world — node VM, the deployed stage, or
// Deno, cold or gauntlet-warmed, with the real 600-row pool — see
// docs/gauntlet/4b4e7981-live-fix-3.md; the fault-injection test
// below pins the failure MODE with a tailor leg that provably
// throws after the flip.)
//
// THE WORLD: the REAL staged handler (scripts/career/stage-career.cjs)
// with remote services faked, the deployed SQL stated-facts
// validator transcribed onto career_host_commit, and the account
// object shared across threads — the lane-2 harness, reused.
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
        _limit: null,
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        order() { return query; },
        limit(n) { query._limit = n; return query; },
        then(resolve) {
          // A LIST read awaited directly on the builder — the
          // handler's history window and its SUBMIT-STEER evidence
          // read (handler-career.ts: agent_messages, newest first,
          // limited). Serve the recorded messages for the filtered
          // thread in that order; before the evidence step existed
          // nothing awaited this builder as a list, so the fake
          // never grew the shape and the read threw -> HTTP 503
          // (REGRESSION-1255). Rows carry the handler's own inserted
          // fields; ids are positional (the store assigns real ones).
          if (table !== "agent_messages") return resolve({ data: [], error: null });
          const rows = db.messages.filter((m) => m.thread_id === filters.thread_id).slice().reverse()
            .map((m, i) => ({ id: m.id ?? (db.messages.length - i), role: m.role, content: m.content }));
          return resolve({ data: clone(query._limit ? rows.slice(0, query._limit) : rows), error: null });
        },
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
    fetch() { networkCalls++; throw new Error("external network forbidden in staged handler"); },
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
// The (j) chain on the live-shaped post-confirmation state: confirm
// → career_tailor with artifacts[0] → channel_artifacts row whose
// sha256 is the bytes' own hash, bytes starting %PDF → the delivery
// ask re-serves the same sha. Green before and after the fix (the
// healthy path is the regression control).
// =====================================================================
// Like v241's guard: the staged-handler suites need node's VM modules, so a run without the flag (the gate's) respawns
// this file with it rather than failing (WO-070, porting the lane's fix onto trunk).
if (!vm.SourceTextModule) {
  test("v242 live-gaps staged-handler suites (respawned with VM modules)", () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ["--experimental-vm-modules", "--test", __filename], { encoding: "utf8", env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
} else {
test("probe j chain (live-shaped): confirm runs the standing tailor target; the artifact row's sha is its bytes'; delivery re-serves it", async () => {
  const account = liveShapedAccount();
  const db = freshDb(account);
  const app = await stagedApp(db, USER, THREAD_A);
  try {
    const t1 = await app.chat(CB0495, "j3-1");
    assert.equal(t1.status, 200);
    assert.equal(t1.body.meta.intent, "career_tailor", `intent=${t1.body.meta.intent}`);
    assert.match(t1.body.reply, /Paste your resume/);
    const t2 = await app.chat(RESUME_TEXT, "j3-2");
    assert.equal(t2.status, 200);
    assert.equal(t2.body.meta.intent, "career_resume_ingest", `intent=${t2.body.meta.intent}`);
    const prof2 = db.state.career.stores.profile;
    assert.ok(prof2 && Array.isArray(prof2.facts), "a profile stands after the paste");
    assert.notEqual(prof2._fromStatedFacts, true, "the drafts stand on a REAL profile");
    assert.equal(prof2.facts.filter((f) => f && f.source === "resume-ingest" && f.needs_confirmation).length, 15, "15 drafts stand");
    const mir2 = db.state.career.stores.trackStore && db.state.career.stores.trackStore._careerThread;
    assert.ok(mir2 && mir2.resumeIngest && mir2.tailorTarget, "marker + tailor target stand");
    const t3 = await app.chat("Yes, that's my resume.", "j3-3");
    assert.equal(t3.status, 200);
    assert.notEqual(t3.body.meta.contained, true, "the confirmation turn is never contained");
    assert.equal(t3.body.meta.intent, "career_tailor", `intent=${t3.body.meta.intent}`);
    assert.match(t3.body.reply, /Confirmed — 15 facts/);
    assert.ok(Array.isArray(t3.body.artifacts) && t3.body.artifacts.length >= 1, "artifacts[0] rides the reply");
    assert.ok(db.artifactRows.length >= 1, "a channel_artifacts row was materialized");
    const row = db.artifactRows[db.artifactRows.length - 1];
    const bytes = Buffer.from(row.bytes_b64, "base64");
    assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-", "stored bytes are a real PDF");
    assert.equal(nodeCrypto.createHash("sha256").update(bytes).digest("hex"), row.sha256, "sha256 == sha256(bytes)");
    const prof3 = db.state.career.stores.profile;
    assert.equal(prof3.facts.filter((f) => f && f.source === "resume-ingest" && !f.needs_confirmation).length, 15, "15 facts stand confirmed");
    const t4 = await app.chat("Send me the PDF as a file in this chat.", "j3-4");
    assert.equal(t4.body.meta.intent, "career_document_delivery", `intent=${t4.body.meta.intent}`);
    const delivered = db.artifactRows[db.artifactRows.length - 1];
    assert.equal(delivered.sha256, row.sha256, "delivery re-serves the same sha");
  } finally { app.close(); }
});

// =====================================================================
// FAIL-FIRST: a tailor leg that THROWS after the confirmation flip
// must degrade to the handler's own Confirmed fallthrough — never
// containment, never a reply that denies the commit. The poison is
// a profile whose basics are null: module 123's tailorResume reads
// basics.name in assemble and throws TypeError AFTER the confirm
// handler has flipped the 15 drafts and consumed the marker — the
// production failure mode, injected deterministically. Red on
// ab94e44e (contained, intent null); green on the fix.
// =====================================================================
test("throwing tailor leg (fault-injected): the confirmation still ships its Confirmed reply; facts stand confirmed; no containment", async () => {
  const account = liveShapedAccount();
  const db = freshDb(account);
  const app = await stagedApp(db, USER, THREAD_A);
  try {
    const t1 = await app.chat(CB0495, "jx-1");
    assert.equal(t1.body.meta.intent, "career_tailor", `intent=${t1.body.meta.intent}`);
    const t2 = await app.chat(RESUME_TEXT, "jx-2");
    assert.equal(t2.body.meta.intent, "career_resume_ingest", `intent=${t2.body.meta.intent}`);
    // Poison: the standing profile's basics become unreadable, so the
    // chained tailor throws inside tailorResume — after the flip.
    db.state.career.stores.profile.basics = null;
    const t3 = await app.chat("Yes, that's my resume.", "jx-3");
    assert.equal(t3.status, 200, `status=${t3.status}`);
    assert.notEqual(t3.body.meta.contained, true, `the turn must not be contained (reply: ${String(t3.body.reply || "").slice(0, 140)})`);
    assert.equal(t3.body.meta.intent, "career_resume_ingest", `the designed fallthrough answers (intent=${t3.body.meta.intent})`);
    assert.match(t3.body.reply, /Confirmed — your resume facts are on your record\./, `the confirmation speaks: ${String(t3.body.reply || "").slice(0, 140)}`);
    assert.doesNotMatch(t3.body.reply, /nothing changed on your side/, "the reply never denies the commit it just made");
    const prof3 = db.state.career.stores.profile;
    assert.equal(prof3.facts.filter((f) => f && f.source === "resume-ingest" && !f.needs_confirmation).length, 15, "the 15 facts stand confirmed — the commit is real and the reply says so");
    const mir3 = db.state.career.stores.trackStore && db.state.career.stores.trackStore._careerThread;
    assert.ok(!mir3 || !mir3.resumeIngest, "the ingest marker stays consumed");
    assert.equal(db.artifactRows.length, 0, "no artifact was materialized from a failed tailor");
  } finally { app.close(); }
});

// =====================================================================
// Control: a confirmation with NO standing tailor target takes the
// same Confirmed fallthrough on both trees — the degradation the
// fix reuses is the handler's long-standing designed path.
// =====================================================================
test("control: confirm with no tailor target — the plain Confirmed reply (the designed fallthrough)", async () => {
  const account = liveShapedAccount();
  const db = freshDb(account);
  const app = await stagedApp(db, USER, THREAD_A);
  try {
    const t1 = await app.chat(RESUME_TEXT, "jc-1");
    assert.equal(t1.body.meta.intent, "career_resume_ingest", `intent=${t1.body.meta.intent}`);
    const t2 = await app.chat("Yes, that's my resume.", "jc-2");
    assert.equal(t2.status, 200);
    assert.notEqual(t2.body.meta.contained, true);
    assert.equal(t2.body.meta.intent, "career_resume_ingest", `intent=${t2.body.meta.intent}`);
    assert.match(t2.body.reply, /Confirmed — your resume facts are on your record\./);
    const prof = db.state.career.stores.profile;
    assert.equal(prof.facts.filter((f) => f && f.source === "resume-ingest" && !f.needs_confirmation).length, 15, "15 facts confirmed");
  } finally { app.close(); }
});
}
