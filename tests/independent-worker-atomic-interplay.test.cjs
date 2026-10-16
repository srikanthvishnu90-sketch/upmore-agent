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
    const db = { options, state: { career: { v: 1, stores: { profile: clone(PROFILE) } } }, messages: [], writes: [], workerCalls: [] };
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
      async fetch(url,init) {if(String(url).startsWith("https://worker.example.test/")){db.workerCalls.push({url:String(url),body:JSON.parse(init.body||"{}")});return new Response(JSON.stringify({task:{id:"a".repeat(32),userId:USER,status:"completed",result:{source:"SYNTHETIC_WORKER_TRANSPORT_ONLY"}}}),{status:200,headers:{"Content-Type":"application/json"}});}networkCalls++;throw Error("External network forbidden");},
      Deno: { env: { get: (name) => ({ SUPABASE_URL: "https://supabase.example.test", SUPABASE_ANON_KEY: "mock-anon", SUPABASE_SERVICE_ROLE_KEY: "mock-service", UPMORE_CAREER_WORKER_URL:"https://worker.example.test" })[name] } },
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
          body: JSON.stringify({ thread_id: THREAD, message, turn_key: turnKey,career_task:db.options.careerTask }),
        }));
        const body = await res.json();
        
        
        assert.equal(networkCalls, 0, "no alert, browser, submission, email or paid API call");
        return { ...body, status:res.status, meta:db.messages.at(-1)?.meta };
      },
    };
  }


  const TASK_ID="a".repeat(32);
  const task=(payload="b".repeat(64))=>({action:"approve",taskId:TASK_ID,eventId:"synthetic-approval",payloadSha256:payload,resumeSha256:"c".repeat(64),destination:"http://localhost:8123/submit"});
  test("pause must gate a career_task before worker dispatch",async()=>{const a=await stagedEntry({careerTask:task()});a.db.state.career.stores.globalPause={set:true,source:"account_control"};await a.request("Approve browser task "+TASK_ID);assert.equal(a.db.workerCalls.length,0,"paused account must not call approve worker");});
  test("failed durable commit must not follow a new worker side effect",async()=>{const a=await stagedEntry({careerTask:task(),failSave:true});const res=await a.request("Approve browser task "+TASK_ID);assert.equal(res.status,503);assert.equal(a.db.workerCalls.length,0,"worker effect happened before unconfirmed chat commit");});
  test("changed career_task binding under same turn key must conflict",async()=>{const a=await stagedEntry({careerTask:task()});assert.equal((await a.request("Approve browser task "+TASK_ID,"same-key")).status,200);a.db.options.careerTask=task("d".repeat(64));assert.equal((await a.request("Approve browser task "+TASK_ID,"same-key")).status,409,"effect-bearing task payload must be in turn fingerprint");});
  test("committed browser reply must retain structured task evidence",async()=>{const a=await stagedEntry({careerTask:task()});const r=await a.request("Approve browser task "+TASK_ID);assert.equal(r.status,200);assert.equal(r.task?.id,TASK_ID,"review/result must survive commit and replay");});
}
