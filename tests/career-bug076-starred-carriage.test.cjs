"use strict";
// BUG-076 guard (Crew B cycle 2, MI-048 disposition): the
// starred-watch turn carries the genuine shortlist element the A4
// branch reads, for ANY starred-watch phrasing — not only SC-063's
// canonical text — and the watch record's `matched` is the genuine
// starred subset of that pool, never a hard-coded empty list.
// Fail-first: on the pre-fix 142 every test below is red (the turn
// carried no `shortlist` key at all, and `matched` was [] even for
// a profile starring a company present in the pool).
// Check: node --test tests/career-bug076-starred-carriage.test.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const H = L.H;

function drive(id, ask, mutate) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  if (mutate) mutate(profile);
  const s = H.session(id, "bug076");
  const turn = L.chatTurn(s, ask, { profile });
  return turn.result || {};
}

test("BUG-076: a non-canonical starred-watch ask carries the shortlist element too", () => {
  const r = drive("BUG076-A", "Watch my starred companies and queue anything new that fits me");
  assert.equal(r.intent, "career_watch");
  assert.ok(Array.isArray(r.shortlist) && r.shortlist.length >= 1, `shortlist genuinely present: keys=${Object.keys(r)}`);
  for (const row of r.shortlist) assert.ok(row.title && row.company, "shortlist rows are real pool roles (title + company)");
  assert.equal(r.payload.kind, "starred_watch");
  assert.deepEqual(r.payload.companies, [], "P1 stars no companies — the record still says so (BUG-112)");
  assert.deepEqual(r.payload.matched, [], "no starred companies, no matches — stated, not papered over");
});

test("BUG-076: matched is computed from the pool for a profile that stars a pooled company", () => {
  const r = drive("BUG076-B", "Apply to every new-grad SWE role posted in the last 48 hours at my starred companies", (p) => { p.preferences.starredCompanies = ["Northwind Ledger"]; });
  assert.deepEqual(r.payload.companies, ["Northwind Ledger"]);
  assert.ok(Array.isArray(r.payload.matched) && r.payload.matched.length >= 1, "the starred company's pooled role is matched, not hard-coded away");
  assert.ok(r.payload.matched.every((m) => /Northwind Ledger/.test(m.company)), "every matched row sits at a starred company");
  assert.ok(r.shortlist.some((x) => /Northwind Ledger/.test(x.company)), "the matched role rides the carried shortlist pool");
});

test("BUG-076: a starred company outside the pool matches nothing — honestly", () => {
  const r = drive("BUG076-C", "Apply to every new-grad SWE role posted in the last 48 hours at my starred companies", (p) => { p.preferences.starredCompanies = ["Stripe"]; });
  assert.deepEqual(r.payload.matched, []);
  assert.ok(Array.isArray(r.shortlist) && r.shortlist.length >= 1, "the pool element is still carried");
});
