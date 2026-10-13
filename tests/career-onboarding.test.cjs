// Career onboarding + ask-once memory + honest capability status (130) and the F01 phrase-routing
// regressions in 120 (BUG-002/003/004). Check: node --test tests/career-onboarding.test.cjs
// Fixtures are the synthetic TEST persona only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const O = require(path.join(root, "packages/domain/130-career-onboarding.js"));
const Profile = require(path.join(root, "packages/domain/122-career-profile.js"));
const A = require(path.join(root, "packages/domain/120-career-access.js"));

function fixture() {
  const data = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/fixtures/test-persona.json"), "utf8"));
  return Profile.profileFromData(data);
}

test("onboarding interview: one question at a time, answers stored, known steps never re-asked", () => {
  const p = Profile.createProfile({});
  let r = O.startInterview(p);
  assert.equal(r.done, false); assert.equal(r.pending, "goals");
  const seen = [];
  const answers = { goals: "Land a SWE internship for next summer", roles: "Software Engineer, Data Analyst", locations: "Chicago, Remote", visa: "US citizen, no sponsorship needed", comp_floor: "$30/hour", deal_breakers: "none", timeline: "Start June 2027" };
  for (let i = 0; i < 7; i++) {
    seen.push(r.pending);
    r = O.answerCurrent(p, answers[r.pending]);
    if (!r.done) assert.equal(typeof r.question.prompt, "string");
  }
  assert.equal(r.done, true);
  assert.deepEqual(seen, ["goals", "roles", "locations", "visa", "comp_floor", "deal_breakers", "timeline"]);
  assert.deepEqual(p.preferences.roles, ["Software Engineer", "Data Analyst"]);
  assert.equal(p.preferences.remote, true);
  assert.equal(p.constraints.workAuthorization, "US citizen, no sponsorship needed");
  assert.equal(p.constraints.needsSponsorship, false);
  assert.equal(p.preferences.timeline, "Start June 2027");
  // A second interview on the completed profile asks nothing.
  const again = O.startInterview(p);
  assert.equal(again.done, true); assert.match(again.text, /never|not re-ask/);
  // The fixture persona already knows roles/locations/visa: first question is goals, visa skipped.
  const f = fixture();
  assert.equal(O.startInterview(f).pending, "goals");
  assert.equal(O.stepAnswered(f, "visa"), true);
});

test("ask-once memory: graduation answered from stored profile; missing facts are asked once, not guessed", () => {
  const p = fixture();
  const g = O.answerFromProfile(p, "what's my graduation date?");
  assert.equal(g.found, true); assert.match(g.answer, /2028-05/); assert.equal(g.reasked, false);
  const empty = Profile.createProfile({});
  const m = O.answerFromProfile(empty, "what's my graduation date?");
  assert.equal(m.found, false); assert.equal(m.reasked, true);
});

test("sensitive answer: saved value shown verbatim for confirmation; audit record only after a yes", () => {
  const p = fixture();
  const s = O.sensitiveAnswerPrompt(p, "work_authorization");
  assert.equal(s.ok, true); assert.equal(s.value, "US citizen (TEST)");
  assert.equal(s.text, "US citizen (TEST) — use it?");
  assert.equal(s.guessed, false);
  assert.equal(O.confirmSensitive(p, "work_authorization", { confirmed: false }).ok, false);
  const c = O.confirmSensitive(p, "work_authorization", { confirmed: true });
  assert.equal(c.ok, true);
  assert.match(c.audit.what, /US citizen \(TEST\)/);
  // The audit rail accepts the record and carries the confirmed value.
  const entry = A.auditEntry(c.audit);
  assert.equal(entry.ok, true); assert.match(entry.entry.what, /US citizen \(TEST\)/);
  const none = O.sensitiveAnswerPrompt(Profile.createProfile({}), "work_authorization");
  assert.equal(none.ok, false); assert.equal(none.guessed, false);
});

test("profile export: facts, connections, tokens by name only; delete path offered; no value-shaped field", () => {
  const p = fixture();
  p.connections.push({ name: "Testy One (TEST)", company: "TEST Corp", source: "linkedin-export" });
  const access = A.connectedAccounts([{ provider: "google_career", email: "alex.testcase@example.test", scopes: [...A.CAREER_SCOPES], connected_at: null }]);
  const ex = O.profileExport(p, access);
  assert.equal(ex.fact_count, p.facts.length);
  assert.equal(ex.connection_count, 1);
  assert.deepEqual(ex.tokens_by_name.map((t) => t.source), ["gmail", "calendar"]);
  assert.equal(ex.delete_path_offered, true);
  assert.doesNotMatch(JSON.stringify(ex), /vault:\/\/|refresh_token|access_token/);
});

test("capability status: buckets counted from the rows passed in — proven-live never invented", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8"));
  const caps = registry.capabilities;
  const expectedTested = caps.filter((c) => c.status === "TESTED").length;
  const expectedGated = caps.filter((c) => c.status === "GATED").length;
  const r = O.capabilityStatus({ registryCaps: caps, careerRows: [{ id: "ACCS-001", status: "built", note: "code built" }, { id: "ACCS-004", status: "blocked", note: "owner-gated browser rail" }] });
  assert.equal(r.built.registry_tested, expectedTested);
  assert.equal(r.proven_live, 0);
  assert.equal(r.blocked_count, expectedGated + 1);
  assert.match(r.text, /Proven live: 0/);
});

test("reauth dedupe: same source + same expiry sends once however often re-planned; a new expiry sends again", () => {
  const log = O.createReauthLog();
  const plan = A.healthPlan({ health: [{ source: "google_career", status: "expired" }], tasks: [{ id: "t", needs: ["gmail"] }], secureLinkFor: (s) => `https://secure.example/${s}` });
  assert.equal(O.planReauthSends(log, plan, "exp-1").to_send.length, 1);
  assert.equal(O.planReauthSends(log, plan, "exp-1").to_send.length, 0);
  assert.equal(O.planReauthSends(log, plan, "exp-1").suppressed.length, 1);
  assert.equal(O.planReauthSends(log, plan, "exp-2").to_send.length, 1);
  assert.equal(log.sent.length, 2);
});

test("BUG-002/003/004 regressions: ledger phrasings route in 120 handleChat", () => {
  const ctx = { statusRecords: [{ provider: "google_career", email: "a@b.co", scopes: [...A.CAREER_SCOPES], connected_at: null }], auditEntries: [{ source: "gmail", at: "2026-10-12T00:00:00.000Z", what: "Connected career Google grant" }] };
  assert.equal(A.handleChat("what accounts do I have connected?", ctx).intent, "connected_accounts");
  assert.equal(A.handleChat("show me everything you've accessed for me", ctx).intent, "access_log");
  const all = A.handleChat("disconnect all my accounts", ctx);
  assert.equal(all.intent, "disconnect"); assert.equal(all.source, "all");
  assert.equal(A.handleChat("disconnect everything", ctx).source, "all");
  // Canonical phrasings still route as before.
  assert.equal(A.handleChat("disconnect my calendar", ctx).source, "calendar");
  assert.equal(A.handleChat("what accounts are connected?", ctx).intent, "connected_accounts");
});

test("BUG-005 regression: gmail + calendar blocked by the SAME dead career grant produce ONE re-auth message", () => {
  const plan = A.healthPlan({
    health: [{ source: "google_career", status: "expired" }, { source: "linkedin", status: "ok" }],
    tasks: [{ id: "send", needs: ["gmail"] }, { id: "book", needs: ["calendar"] }, { id: "view", needs: ["linkedin"] }],
    secureLinkFor: (s) => `https://secure.example/${s}`,
  });
  assert.equal(plan.paused.length, 2);
  assert.equal(plan.running.length, 1);
  assert.equal(plan.messages.length, 1, "one message per dead grant, not per need-name");
  assert.equal(plan.reauth[0].source, "google_career");
  assert.deepEqual(plan.reauth[0].needs.sort(), ["calendar", "gmail"]);
  // The original T8 shape still holds: a single dead source = a single message naming that source.
  const li = A.healthPlan({ health: [{ source: "linkedin", status: "expired" }], tasks: [{ id: "v", needs: ["linkedin"] }] });
  assert.equal(li.messages.length, 1); assert.equal(li.reauth[0].source, "linkedin");
});

test("130 chat glue: onboarding start, capability status, stored-about-me all answer", () => {
  const p = Profile.createProfile({});
  const ctx = { profile: p, capabilitySources: { registryCaps: [], careerRows: [] }, access: { accounts: [] } };
  const start = O.handleChat("help me find a job", ctx);
  assert.equal(start.intent, "onboarding"); assert.equal(start.pending, "goals");
  const cap = O.handleChat("what can you actually do for my job search?", ctx);
  assert.equal(cap.intent, "capability_status"); assert.equal(cap.proven_live, 0);
  const stored = O.handleChat("what do you have stored about me?", { ...ctx, profile: fixture() });
  assert.equal(stored.intent, "profile_export"); assert.ok(stored.fact_count > 0);
});
