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

  async function stagedEntry() {
    const db = { state: { career: { v: 1, stores: { profile: clone(PROFILE) } } }, messages: [], writes: [] };
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
      rpc: async (name) => {
        assert.equal(name, "agent_rl_bump");
        return { data: true, error: null };
      },
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
            assert.equal(filters.thread_id, THREAD);
            return { data: { state: clone(db.state) }, error: null };
          },
          async upsert(row) {
            db.writes.push(table);
            if (table === "agent_flow_state") {
              assert.equal(row.user_id, USER);
              assert.equal(row.thread_id, THREAD);
              db.state = clone(row.state);
            } else assert.equal(table, "profiles");
            return { error: null };
          },
          async insert(row) {
            assert.equal(table, "agent_messages");
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
      Request, Response, Headers, URL, TextEncoder, TextDecoder, AbortController,
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
      async chat(message) {
        const res = await handle(new Request("https://upmore.example.test/chat", {
          method: "POST", headers: { Authorization: "Bearer mock-user-token", "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id: THREAD, message }),
        }));
        const body = await res.json();
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body.action, null, "chat never invents an external action");
        assert.equal(networkCalls, 0, "no alert, browser, submission, email or paid API call");
        return { ...body, meta: db.messages.at(-1).meta };
      },
    };
  }

  test("staging reaches the safe modules, with Node browser code excluded", async () => {
    const { bundle } = await stagedEntry();
    for (const name of ["CareerGuidance", "CareerAlertWatch", "CareerAssign"]) assert.equal(typeof bundle[name], "object", name);
    assert.equal(bundle.CareerPortalBrowser, undefined);
    const source = fs.readFileSync(path.join(stage, "_shared/router_core.career.js"), "utf8");
    assert.ok(!source.includes("const CareerPortalBrowser"));
    assert.ok(!source.includes("portal-browser-helper.cjs"), "Node driver implementation never enters the artifact");
  });

  test("actual staged chat gives guidance from 144, never the fallback or a template substitute", async () => {
    const app = await stagedEntry();
    for (const ask of ["I want to break into investment banking — where do I start?", "how do i get into investment banking?"]) {
      const out = await app.chat(ask);
      assert.equal(out.meta.contained, false);
      assert.match(out.reply, /Two plausible paths/);
      assert.match(out.reply, /Source:/);
      assert.doesNotMatch(out.reply, /I didn't catch that/);
    }
    assert.equal(app.db.state.career.stores.alertWatchState, undefined);
  });

  test("actual staged chat saves, restores and manages a watch without claiming delivery", async () => {
    const app = await stagedEntry();
    const out = await app.chat("Watch for investment banking analyst intern roles in Chicago");
    assert.equal(out.meta.intent, "career_watch_create");
    assert.equal(out.meta.contained, false);
    assert.equal(out.capabilities.job_alert_delivery.status, "NOT_WIRED");
    assert.match(out.reply, /not wired/i);
    assert.doesNotMatch(out.reply, /watch is live|next tick|polls the boards on the standing cadence/i);
    const box = app.db.state.career.stores.alertWatchState;
    const wp = box[app.bundle.CareerAssign.PROFILE_KEY(USER)];
    assert.equal(wp.user_id, USER);
    assert.equal(wp.interests[0].role.title, "Investment Banking Analyst");
    assert.deepEqual(wp.interests[0].filters.locations, ["Chicago"]);
    assert.deepEqual(Object.keys(box), [app.bundle.CareerAssign.PROFILE_KEY(USER)], "no phantom reminder, queue or delivery history");
    // Each HTTP request reloads the persisted snapshot into a new ctx.
    assert.match((await app.chat("What am I watching?")).reply, /Investment Banking Analyst/);
    await app.chat("Pause my job alerts");
    assert.equal(app.db.state.career.stores.alertWatchState[app.bundle.CareerAssign.PROFILE_KEY(USER)].opt_out.global, true);
    const resumed = await app.chat("Resume my job alerts");
    assert.match(resumed.reply, /not wired/i);
    assert.doesNotMatch(resumed.reply, /next tick|matches and reminds on them as before/);
    assert.equal(app.db.state.career.stores.alertWatchState[app.bundle.CareerAssign.PROFILE_KEY(USER)].opt_out.global, false);
    await app.chat("Stop watching investment banking");
    assert.equal(app.db.state.career.stores.alertWatchState[app.bundle.CareerAssign.PROFILE_KEY(USER)].interests.length, 0);
    assert.equal(app.db.state.career.stores.workerCapabilities, undefined, "runtime worker availability is not user snapshot state");
  });

  test("actual staged watch ask without a profile requests facts and saves no watch", async () => {
    const app = await stagedEntry();
    app.db.state.career.stores = {};
    const out = await app.chat("Watch for investment banking analyst intern roles in Chicago");
    assert.equal(out.meta.intent, "career_watch_create");
    assert.equal(out.meta.result_status, "awaiting_user");
    assert.equal(out.meta.contained, false);
    assert.equal(app.db.state.career.stores.alertWatchState, undefined);
  });

  test("actual staged apply ask names the missing browser worker and submits nothing", async () => {
    const app = await stagedEntry();
    const before = clone(app.db.state.career.stores);
    const out = await app.chat("Apply on my behalf");
    assert.equal(out.meta.contained, false);
    assert.equal(out.capabilities.portal_browser.status, "NOT_WIRED");
    assert.match(out.reply, /browser.*not wired/i);
    assert.doesNotMatch(out.reply, /successfully (submitted|applied)|application (was |has been )?submitted/i);
    const approved = await app.chat("Approve and submit");
    assert.notEqual(approved.meta.result_status, "completed", "a yes cannot create a missing worker or a submission");
    assert.equal(approved.capabilities.portal_browser.status, "NOT_WIRED");
    for (const key of ["applyLog", "applicationLog", "portalRecords"]) assert.deepEqual(app.db.state.career.stores[key], before[key], `no phantom ${key}`);
  });

  test("bundled 151 -> 152 executes with no require: seed suppresses, new job queues once without delivery", async () => {
    const app = await stagedEntry();
    await app.chat("Watch for software engineering intern roles in Chicago");
    const { CareerJobs: J, CareerAlertWatch: W, CareerAssign: A } = app.bundle;
    const wp = app.db.state.career.stores.alertWatchState[A.PROFILE_KEY(USER)];
    const store = W.createMemoryStore();
    let jobs = [];
    const detections = [];
    const opts = {
      feeds: [J.feeds.greenhouse("bundle-test")], store, profile: wp.scoring_profile,
      watchedFamilies: ["SWE"], // the processing caller supplies its watch gate
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ name: "TEST Company", jobs }) }),
      sink: (rec) => detections.push(rec), now: Date.parse("2026-10-15T12:00:00Z"),
    };
    const seed = await W.runWatchCycle(opts);
    assert.equal(seed.alerts.length, 0);
    jobs = [{ id: 1, title: "Software Engineer Intern", location: { name: "Chicago, IL" },
      absolute_url: "https://boards.greenhouse.io/bundle-test/jobs/1", requisition_id: "TEST-REQ-1",
      content: "Build Python services. Apply by November 2, 2026." }];
    const cycle = await W.runWatchCycle({ ...opts, now: opts.now + 60000 });
    assert.equal(cycle.alerts.length, 1, JSON.stringify(cycle));
    assert.equal(detections.length, 1, "typed detections, not delivered notifications");
    const assigned = await A.runAssignCycle({ alerts: cycle.alerts, watchProfile: wp, store, now: opts.now + 60000 });
    assert.equal(assigned.reminders.length, 1);
    assert.equal(assigned.reminders[0].deadline.text, "Apply by November 2, 2026");
    const repeat = await A.runAssignCycle({ alerts: cycle.alerts, watchProfile: wp, store, now: opts.now + 120000 });
    assert.equal(repeat.reminders.length, 0, "no duplicate reminders");
    assert.equal(app.db.messages.filter((m) => m.role === "assistant").length, 1, "only the requested chat reply, no phantom alert delivery");
  });
}
