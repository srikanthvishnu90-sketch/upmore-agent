// DePaulConnect lane (wedge build, 2026-10-13): DRAFTING HELP ONLY. The user
// supplies a profile they pasted/viewed themselves; the lane returns an
// in-platform message draft under the F1 draft rules. It must contain NO
// extraction, NO scraping, NO sending path — the user sends it themselves.
// Fail-first: written before packages/domain/147-career-platform-drafts.js.
// Check: node --test tests/career-platform-drafts.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const Platform = require(path.join(root, "packages/domain/147-career-platform-drafts.js"));

const USER = { name: "Vishnu Srikanth", school: "DePaul University", year: "sophomore", year_label: "'28" };
const PROFILE = { full_name: "Jamie Alvarez", title: "Analyst", current_firm: "Evercore", school: "DePaul University" };

test("platform draft: with a user-provided fact, the draft opens on it, follows F1 shape, and echoes the fact verbatim", () => {
  const fact = { fact: "spoke on the DePaul alumni banking panel in September 2025", source_note: "user saw it on the profile they pasted" };
  const r = Platform.draftMessage({ profile: PROFILE, userFact: fact, user: USER, platform: "DePaulConnect" });
  assert.equal(r.ok, true);
  assert.equal(r.draft.sent, false);
  assert.equal(r.draft.sendable_by, "user_only");
  assert.match(r.draft.body, /alumni banking panel/);
  assert.equal(r.draft.fact_used.fact, fact.fact);
  assert.equal(r.draft.tier, "A");
  assert.ok(r.draft.word_count <= 120, `word_count ${r.draft.word_count} over the 120 cap`);
  assert.match(r.draft.body, /15[-\s]minute/);
});

test("platform draft: with NO user fact, the draft claims no personalization and the output says so (Tier C shape)", () => {
  const r = Platform.draftMessage({ profile: PROFILE, userFact: null, user: USER, platform: "DePaulConnect" });
  assert.equal(r.ok, true);
  assert.equal(r.draft.tier, "C");
  assert.equal(r.draft.fact_used, null);
  assert.doesNotMatch(r.draft.body, /I saw that you|I noticed that you/);
  assert.ok(r.notes.some((n) => /no personalization fact/i.test(n)));
});

test("platform draft: no code path fetches anything — the module source has no network primitives and exports no send path", () => {
  const src = fs.readFileSync(path.join(root, "packages/domain/147-career-platform-drafts.js"), "utf8");
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|https?\.get|https?\.request|axios|undici|WebSocket/);
  const keys = Object.keys(Platform);
  assert.ok(!keys.some((k) => /send|submit|transport|deliver/i.test(k)), `send-like export found: ${keys.join(",")}`);
  const r = Platform.draftMessage({ profile: PROFILE, userFact: null, user: USER, platform: "DePaulConnect" });
  assert.ok(!("transport" in r.draft) && !("send" in r.draft));
});

test("platform draft: a profile with no firm produces a draft that names no firm (nothing invented)", () => {
  const r = Platform.draftMessage({ profile: { full_name: "Jamie Alvarez", title: "Analyst" }, userFact: null, user: USER, platform: "DePaulConnect" });
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.draft.body, /undefined|at Evercore/);
  assert.ok(r.notes.some((n) => /firm/i.test(n)));
});
