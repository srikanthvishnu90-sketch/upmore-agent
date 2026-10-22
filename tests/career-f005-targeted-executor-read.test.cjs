"use strict";
// F-005: actual production source + PostgREST transport + executor assembly, invented data only.
// No board, live read, RPC mutation, provider, approval or submission is exercised.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createProductionSources } = require("../workers/career-browser/production-sources.cjs");
const { createSupabaseTransport } = require("../workers/career-browser/supabase-transport.cjs");
const { createBatchExecutor } = require("../workers/career-browser/batch-executor.cjs");
const Batch = require("../packages/domain/155-career-batch-apply.js");
const OWNER = "TEST-F005-OWNER", FOREIGN = "TEST-F005-FOREIGN";
const NOW = Date.parse("2026-10-22T12:00:00Z");
const recent = (day) => new Date(NOW - day * 864e5).toISOString();
function row(id, title, days, text = "Build and test software with a mentor.") {
  return { posting_key: id, source: "greenhouse", board: "synthetic", company: "Synthetic " + id,
    title, location: "Chicago, IL", url: "https://boards.greenhouse.io/synthetic/jobs/" + id,
    posted_at: recent(days), fetched_on: "2026-10-22", corpus_vintage: "TEST", text_excerpt: text };
}
function shelf() {
  return [
    ...Array.from({ length: 600 }, (_, i) => row("recent-" + i, "Senior Software Engineer " + i, 1 + i / 1000)),
    ...Array.from({ length: 4 }, (_, i) => row("target-" + i, "Software Engineering Intern " + i, 40 + i)),
    row("wrong-family", "Operations Intern", 44), row("data-family", "Data Engineer Intern", 45),
    row("false-substring", "Internal Controls Engineer", 46),
    row("senior-text-hit", "Senior Software Engineer", 47, "Mentor our internship participants."),
  ];
}
function fixture({ failKeyed = false } = {}) {
  const rows = shelf(), requests = [];
  const profile = (who) => ({ basics: {}, facts: [], fixture_owner: who });
  const transport = createSupabaseTransport({ baseUrl: "https://synthetic-f005.invalid", serviceRoleKey: "TEST-ONLY-KEY",
    fetchImpl: async (input, opts) => {
      const url = new URL(input);
      requests.push({ url, method: opts.method });
      assert.equal(opts.method, "GET", "discovery never calls an RPC mutation");
      let out;
      if (url.pathname === "/rest/v1/career_kb_postings") {
        out = rows;
        for (const [key, value] of url.searchParams) {
          if (["select", "order", "limit"].includes(key)) continue;
          if (failKeyed) return new Response(JSON.stringify({ message: "synthetic keyed read failure" }), { status: 503 });
          if (value.startsWith("ilike.")) {
            const pattern = value.slice(6).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
            out = out.filter((r) => new RegExp("^" + pattern + "$", "i").test(String(r[key] || "")));
          } else if (value.startsWith("eq.")) out = out.filter((r) => String(r[key]) === value.slice(3));
          else assert.fail("unsupported fixture filter: " + key);
        }
        out = [...out].sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at));
      } else if (url.pathname === "/rest/v1/agent_flow_state") {
        const user = url.searchParams.get("user_id");
        assert.ok(["eq." + OWNER, "eq." + FOREIGN].includes(user), "profile reads must be owner-scoped");
        out = [{ state: { career: { stores: { profile: profile(user.slice(3)) } } }, updated_at: recent(0) }];
      } else assert.fail("unexpected endpoint " + url.pathname);
      return new Response(JSON.stringify(out.slice(0, Number(url.searchParams.get("limit") || out.length))), { status: 200 });
    } });
  return { transport, requests, sources: createProductionSources({ transport, now: () => NOW }) };
}
async function assembled(f, { skeletonOwner = OWNER, count = 3, family = "software engineering intern" } = {}) {
  const run = Batch.createRun({ userId: skeletonOwner, familyText: family, count, now: NOW });
  const intent = { userId: OWNER, intentId: "TEST-INTENT", binding: { action: "prepare", run_id: run.id, family_text: family }, request: { run } };
  let saved, finish;
  const store = { pending: async () => [intent], claim: async () => true,
    finish: async (v) => { finish = v; }, saveRun: async (v) => { saved = v; },
    readRun: async () => null, ledgerFor: async () => ({ records: [] }), saveLedger: async () => {} };
  let boardBindings = 0;
  const executor = createBatchExecutor({ store, ...f.sources, now: () => NOW,
    boardForFor: (owner) => { assert.equal(owner, OWNER); boardBindings++; return () => null; } });
  const results = await executor.runBatchPending();
  return { saved, finish, results, boardBindings };
}

test("F-005 actual executor assembly selects intended intern IDs beyond the latest 600, within requested count", async () => {
  const f = fixture(), r = await assembled(f);
  assert.equal(r.finish.state, "completed");
  assert.deepEqual(r.saved.run.selected.map((key) => r.saved.run.postings[key].id), ["target-0", "target-1", "target-2"]);
  assert.equal(r.saved.run.eligible, 4);
  assert.equal(r.saved.run.selected.length, 3);
  assert.equal(r.saved.run.summary.submitted, 0);
  assert.equal(r.saved.run.apps[r.saved.run.selected[0]].stop.code, "BOARD_NOT_WIRED");
  const keyed = f.requests.filter((r) => r.url.searchParams.has("title") || r.url.searchParams.has("text_excerpt"));
  assert.equal(keyed.length, 7, "one bounded read for each reviewed intern key");
  assert.ok(keyed.some((r) => r.url.searchParams.get("text_excerpt") === "ilike.%intern%"));
});

test("F-005 keyed candidates retain the real family/band filters; substring and JD-text overfetch cannot enter", async () => {
  const f = fixture(), postings = await f.sources.postingsFor(OWNER, "software engineering intern", 3);
  assert.deepEqual(postings.map((p) => p.id), ["target-0", "target-1", "target-2", "target-3"]);
  assert.ok(postings.every((p) => p.role_family === "SWE" && p.seniority_band === "intern"));
});

test("F-005 keyed read failure stops the actual executor with a named discovery error, never false zero", async () => {
  const r = await assembled(fixture({ failKeyed: true }));
  assert.equal(r.finish.state, "blocked");
  assert.equal(r.results[0].code, "BATCH_DISCOVERY_READ_FAILED");
  assert.equal(r.saved, undefined);
  assert.equal(r.boardBindings, 0);
});

test("CONTROL: a foreign run skeleton is refused before discovery/profile reads or board binding", async () => {
  const f = fixture(), r = await assembled(f, { skeletonOwner: FOREIGN });
  assert.equal(r.results[0].code, "BATCH_RUN_INVALID");
  assert.equal(f.requests.length, 0);
  assert.equal(r.boardBindings, 0);
});

test("CONTROL: profile input remains isolated to the requested owner alongside shared posting reads", async () => {
  const f = fixture();
  assert.equal((await f.sources.profileFor(OWNER)).profileMaster.fixture_owner, OWNER);
  assert.equal((await f.sources.profileFor(FOREIGN)).profileMaster.fixture_owner, FOREIGN);
  assert.deepEqual(f.requests.map((r) => r.url.searchParams.get("user_id")), ["eq." + OWNER, "eq." + FOREIGN]);
});

test("CONTROL: unknown/no-key ask keeps the original bounded window without raw user wildcard SQL", async () => {
  const f = fixture(), postings = await f.sources.postingsFor(OWNER, "wizardry %' or user_id=*", 3);
  assert.equal(postings.length, 600);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url.searchParams.get("limit"), "600");
  assert.ok(!f.requests[0].url.searchParams.has("title"));
});

test("F-005 a named family without a band reaches the older matching family without assuming mid-only", async () => {
  const f = fixture(), postings = await f.sources.postingsFor(OWNER, "data roles", 3);
  assert.deepEqual(postings.map((p) => p.id), ["data-family"]);
  assert.equal(postings[0].seniority_band, "intern");
  assert.ok(f.requests.some((r) => r.url.searchParams.has("title")));
});

test("F-005 transport binds constrained array ilike/eq filters and refuses unsupported filters before fetch", async () => {
  const f = fixture();
  const got = await f.transport.readRows({ table: "career_kb_postings", filters: [{ column: "title", op: "ilike", value: "%Intern%" }], limit: 1000 });
  assert.equal(got.length, 7);
  assert.equal(f.requests[0].url.searchParams.get("title"), "ilike.%Intern%");
  const exact = await f.transport.readRows({ table: "career_kb_postings", filters: [{ column: "posting_key", op: "eq", value: "target-0" }] });
  assert.deepEqual(exact.map((r) => r.posting_key), ["target-0"]);
  const n = f.requests.length;
  for (const filters of [[{ column: "title", op: "or", value: "*" }], [{ column: "bad,key", op: "ilike", value: "%" }],
    [{ column: "limit", op: "eq", value: "1" }], [{ op: "eq", value: "target-0" }], { user_id: { neq: OWNER } }])
    await assert.rejects(f.transport.readRows({ table: "career_kb_postings", filters }), { code: "SUPABASE_READ_INVALID" });
  assert.equal(f.requests.length, n);
});
