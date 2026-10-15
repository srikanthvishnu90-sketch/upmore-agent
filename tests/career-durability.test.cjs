"use strict";
// Execute the staged index.ts -> handler-career.ts -> generated bundle in
// an ESM-only realm. Only the two remote services (serve + Supabase) are
// replaced. No domain require(), network, real database, or browser exists.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { spawnSync, execFileSync } = require("node:child_process");

if (!vm.SourceTextModule) {
  test("staged career entry regressions in an ESM-only realm", () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // the nested runner must report its own exit status
    const run = spawnSync(process.execPath, ["--experimental-vm-modules", "--test", __filename], { encoding: "utf8", env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
} else {
  const ROOT = path.resolve(__dirname, "..");
  const USER = "00000000-0000-4000-8000-000000000001";
  const THREAD = "00000000-0000-4000-8000-000000000002";
  // Entirely synthetic record, deliberately independent of applicant fixtures.
  const PROFILE = {
    basics: { name: "Bundle Test", location: "Chicago, IL" },
    facts: [
      { kind: "education", text: "B.S. Computer Science at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
      { kind: "skill", name: "Python", text: "Skill: Python", fact_id: "TEST-F1", evidence: ["synthetic resume lists Python"], unproven: false },
    ],
    constraints: { workAuthorization: "US citizen", needsSponsorship: false },
    preferences: { locations: ["Chicago"], starredCompanies: [] },
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  let stage;
  before(() => {
    stage = fs.mkdtempSync(path.join(os.tmpdir(), "career-entry-regression-"));
    execFileSync(process.execPath, [path.join(ROOT, "scripts/career/stage-career.cjs"), stage, "--json"]);
  });
  after(() => { if (stage) fs.rmSync(stage, { recursive: true, force: true }); });

  async function stagedEntry(options = {}) {
    const db = { options, state: { career: { v: 1, stores: { profile: clone(PROFILE) } } }, messages: [], writes: [] };
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
      rpc: (name,args) => require("./helpers/career-persistence-fake.cjs")(db,USER,THREAD,name,args),
      from(table) {
        assert.ok(["profiles", "agent_threads", "agent_flow_state", "agent_messages"].includes(table), `unexpected table: ${table}`);
        const filters = {};
        const query = {
          select() { return query; },
          eq(key, value) { filters[key] = value; return query; },
          async maybeSingle() {
            assert.equal(filters.user_id, USER);
            if (table === "agent_threads") {
              assert.equal(filters.id, THREAD);
              return { data: { id: THREAD, user_id: USER }, error: null };
            }
            assert.equal(table, "agent_flow_state");
            if(db.options.failLoad)return {data:null,error:{message:"TEST LOAD FAILED"}};
            assert.equal(filters.thread_id, THREAD);
            return { data: { state: clone(db.state) }, error: null };
          },
          async upsert(row) {
            db.writes.push(table);
            if (table === "agent_flow_state") {
              if(db.options.failSave)return {error:{message:"TEST SAVE FAILED"}};
              assert.equal(row.user_id, USER);
              assert.equal(row.thread_id, THREAD);
              db.state = clone(row.state);
            } else assert.equal(table, "profiles");
            return { error: null };
          },
          async insert(row) {
            assert.equal(table, "agent_messages");
            if(db.options.failAssistant && row.role === "assistant")return {error:{message:"TEST ASSISTANT WRITE FAILED"}};
            assert.equal(row.thread_id, THREAD);
            db.messages.push(clone(row));
            return { error: null };
          },
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
      fetch() { networkCalls++; throw new Error("External network forbidden in bundle regressions"); },
      Deno: { env: { get: (name) => ({ SUPABASE_URL: "https://supabase.example.test", SUPABASE_ANON_KEY: "mock-anon", SUPABASE_SERVICE_ROLE_KEY: "mock-service" })[name] } },
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
    assert.equal(typeof handle, "function", "actual index registered actual handler");
    const bundle = modules.get(path.join(stage, "_shared/router_core.career.js")).namespace;
    return {
      bundle, db,
      async request(message,turnKey="test-turn") {
        const res = await handle(new Request("https://upmore.example.test/chat", {
          method: "POST", headers: { Authorization: "Bearer mock-user-token", "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id: THREAD, message, turn_key: turnKey }),
        }));
        const body = await res.json();
        
        
        assert.equal(networkCalls, 0, "no alert, browser, submission, email or paid API call");
        return { ...body, status:res.status, meta:db.messages.at(-1)?.meta };
      },
    };
  }

  test("failed state load is unavailable with no messages", async()=>{const a=await stagedEntry({failLoad:true});const r=await a.request("What am I watching?");assert.equal(r.status,503);assert.equal(a.db.messages.length,0);});
  test("failed state commit cannot acknowledge saved watch", async()=>{const a=await stagedEntry({failSave:true});const r=await a.request("Watch for software engineering intern roles in Chicago");assert.equal(r.status,503);assert.equal(a.db.messages.length,0);});
  test("failed assistant write cannot return success or partial turn", async()=>{const a=await stagedEntry({failAssistant:true});const r=await a.request("Watch for software engineering intern roles in Chicago");assert.equal(r.status,503);assert.equal(a.db.messages.length,0);});
  test("same turn key replays exactly one saved message pair",async()=>{const a=await stagedEntry();const first=await a.request("What am I watching?","stable-turn");const second=await a.request("What am I watching?","stable-turn");assert.equal(first.status,200);assert.deepEqual(second,first);assert.equal(a.db.messages.length,2);});
  test("changed payload under same key is rejected",async()=>{const a=await stagedEntry();await a.request("What am I watching?","stable-turn");assert.equal((await a.request("Watch for software engineering intern roles in Chicago","stable-turn")).status,409);});
  test("malformed storage response cannot become a false HTTP success",async()=>{const a=await stagedEntry({malformedLoad:true});assert.equal((await a.request("What am I watching?")).status,503);assert.equal(a.db.messages.length,0);});
  test("lost commit receipt returns unavailable and a stable-key retry reads the committed pair",async()=>{const a=await stagedEntry({malformedCommit:true});assert.equal((await a.request("What am I watching?","lost-receipt")).status,503);assert.equal(a.db.messages.length,2);a.db.options.malformedCommit=false;assert.equal((await a.request("What am I watching?","lost-receipt")).status,200);assert.equal(a.db.messages.length,2);});
}
