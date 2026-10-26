"use strict";
// SERIAL-1511: an outreach approval covers only the exact messages the person reviewed, within the scope they approved,
// until the 7-day lapse. It is never general campaign permission and never covers messages they have not seen. The
// safety-plan card (124) and the router's card reply (142) say so, and no text says "approve once, then it runs alone".
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Outreach = require("../packages/domain/124-career-outreach.js");
const ROOT = path.resolve(__dirname, "..");

test("the safety plan's words: exact messages reviewed, approved scope, 7-day lapse; never general permission or unseen messages", () => {
  const p = Outreach.safetyPlan({}, { days: 3, scheduled: 20, deferred: [] }, { startDateIso: "2026-10-14T15:00:00Z" });
  assert.match(p.approval, /an approval covers only the exact messages you reviewed, within the scope you approved, until it lapses after 7 days; never general permission for the campaign, never messages you have not seen/);
  const t = Outreach.safetyPlanText(p);
  assert.match(t, /^Safety plan — your approval covers only the exact messages you reviewed, within the scope you approved, until it lapses after 7 days; it is never general permission for the campaign or for messages you have not seen:/);
  assert.doesNotMatch(t, /approve once|runs alone|one approval covers/i);
});

test("the router's safety card asks for that approval and no other; the old wording is gone from both modules", () => {
  const r142 = fs.readFileSync(path.join(ROOT, "packages/domain/142-career-router.js"), "utf8");
  const r124 = fs.readFileSync(path.join(ROOT, "packages/domain/124-career-outreach.js"), "utf8");
  assert.ok(r142.includes("Your approval will cover only the exact messages you review, within the scope you approve, until it lapses after 7 days — never the campaign in general or messages you have not seen; nothing outside what you approved goes out."));
  for (const src of [r142, r124]) {
    assert.doesNotMatch(src, /Approve this plan once|approve once, then it runs alone|one approval covers this whole plan|every send stays inside it/);
  }
});
