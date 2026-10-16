"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const vm = require("node:vm"), path = require("node:path"), { spawnSync } = require("node:child_process");
const manifest = require("./fixtures/capability2-independent/INDEPENDENT_CAPABILITY2_HOLDOUTS_v1.json");
const now = Date.parse(manifest.now), root = path.resolve(__dirname, "..");
if (!vm.SourceTextModule) {
  test("followup staged HTTP and ESM source boundaries", () => {
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ["--experimental-vm-modules", "--test", __filename], { env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
} else {
  test("actual staged HTTP retains named SQL skill, weekly budget and canonical profile", async () => {
    const load = require("./helpers/capability2-staged-entry.cjs");
    const user = "00000000-0000-4000-8000-000000000001", thread = "00000000-0000-4000-8000-000000000002";
    const profile = structuredClone(manifest.cases.find((c) => c.id === "H16").profile);
    let stores = { profile }; const messages = [];
    const client = { auth: { getUser: async () => ({ data: { user: { id: user } } }) }, rpc: async (name) => { assert.equal(name, "agent_rl_bump"); return { data: true, error: null }; }, from(table) {
      assert.ok(["profiles", "agent_threads", "agent_flow_state", "agent_messages"].includes(table));
      const filters = {};
      const q = { select() { return q; }, eq(k, v) { filters[k] = v; return q; }, async maybeSingle() { assert.equal(filters.user_id, user); return { data: table === "agent_threads" ? { id: thread, user_id: user } : { state: { career: { v: 1, stores } } }, error: null }; }, async upsert(row) { if (table === "agent_flow_state") stores = structuredClone(row.state.career.stores); return { error: null }; }, async insert(row) { assert.equal(table, "agent_messages"); messages.push(row); return { error: null }; } };
      return q;
    } };
    const app = await load(root, client);
    try {
      const out = await app.request(thread, "What SQL skill gaps should I close? I can spend one hour per week.", "followup-1");
      assert.equal(out.status, 200); assert.match(out.body.reply, /SQL: not_evidenced/); assert.match(out.body.reply, /inside 1 hours per week/);
      assert.equal(out.body.action, null); assert.equal(messages.at(-1).meta.contained, false);
      assert.deepEqual(stores.profile.facts, profile.facts, "recommendations do not canonize or renumber profile facts");
      const ambiguous = await app.request(thread, "What SQL and Excel skill gaps should I close?", "followup-2");
      assert.match(ambiguous.body.reply, /Which single skill/);
      assert.ok(!stores.alertWatchState && !stores.applyLog && !stores.applicationLog);
    } finally { app.close(); }
  });
  test("generated ESM bundle repeats frozen evidence/source/ID boundaries", async () => {
    const m = await import(path.join(root, "supabase/functions/_shared/router_core.career.js")), R = m.CareerRecommendations;
    for (const c of manifest.cases.filter((c) => ["evidence_not_present", "evidence_present", "no_openings", "one_opening", "freshness_false", "legacy_ingest_id"].includes(c.kind))) {
      const profile = structuredClone(c.profile || {});
      if (c.kind.startsWith("evidence_")) assert.equal(R.evidence(profile, c.skill).status === "evidence_present", c.kind === "evidence_present", c.id);
      else if (["no_openings", "one_opening"].includes(c.kind)) assert.equal(R.planPaths({ profile, postings: c.postings, now }).currentOpenings.openings.length, c.kind === "one_opening" ? 1 : 0, c.id);
      else if (c.kind === "freshness_false") assert.equal(R.freshness(c.posting, now).current, false, c.id);
      else assert.ok(R.planPaths({ profile: R.ingestResume({ profile }, c.resume).profile }).factIds.includes("LEGACY-STABLE-901"));
    }
  });
}
