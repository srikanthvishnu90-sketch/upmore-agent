"use strict";
/* ASK-WINS (read-only sweep follow-up, 2026-10-27) — fail-first.

   A sweep over plain-language asks on a live-shaped synthetic
   record found no catch-alls, but a family of wrong routes where
   staged / discovery state silently overrides what the ask itself
   says. This file pins the top two:

   FIX 1 — "show me jobs in Chicago": the generic discovery route
   recorded the ask's place (lastParams.whereText) but never
   FILTERED by it, so the ranked list was padded with an out-of-
   place Denver posting, caveat and all. A place named in the ask
   is a hard filter: only matching postings are served, the count
   is spoken plainly when it is under the usual list size, and a
   place with no postings gets an honest zero plus an offer of
   outside matches LABELLED as outside — never a silent inclusion.

   FIX 2 — "tailor my resume for a product analyst role": the
   tailor gate's staged-posting shortcut ran before any named-
   target resolution, so a staged Data Analyst posting (BrightPath)
   silently became the target of an ask that named a different
   role. The role named in the ask controls: a pool posting whose
   title carries the named role is tailored; when none does, the
   turn ASKS which posting — candidates listed, the staged one
   labelled as staged — and no artifact for a different role is
   produced.

   Fixture: the sweep's record shape — Maya Rivera, Chicago
   profile, stated target Product Analyst / Harbor Lane Health, a
   staged BrightPath Logistics Data Analyst posting, and a pool of
   7: four in Chicago (incl. a Harbor Lane Product Analyst), the
   Denver posting, one remote, one San Francisco.
   Check: node --test tests/career-ask-wins-20261027.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-27T16:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));

const P = (job_id, company, title, location, jd_text, extra) => Object.assign({
  job_id, company, title, location,
  url: `https://jobs.example.test/${job_id.split(":")[1] || "x"}/${job_id.split(":")[2] || "1"}`,
  posted_at: "2026-10-18T14:00:00Z", jd_text,
}, extra || {});
const NORTHWIND_DA = P("greenhouse:northwind:101", "Northwind Health", "Data Analyst", "Chicago, IL",
  "Data Analyst at Northwind Health. Location: Chicago, IL. Requirements: 2+ years of SQL, Tableau dashboards, a bachelor's degree. Salary: $72,000-$88,000.");
const BRIGHTPATH_DA = P("lever:brightpath:201", "BrightPath Logistics", "Data Analyst", "Chicago, IL",
  "Data Analyst at BrightPath Logistics. Location: Chicago, IL. Requirements: 1+ year of Python, strong Excel, SQL for shipping-volume forecasting. Salary: $70,000-$85,000.");
const COPPERLEAF_BA = P("ashby:copperleaf:301", "Copperleaf Bank", "Business Analyst", "Chicago, IL",
  "Business Analyst at Copperleaf Bank. Location: Chicago, IL. Requirements: 2+ years in banking or finance, SQL a plus. Salary: $80,000-$95,000.");
const HARBORLANE_PA = P("greenhouse:harborlane:801", "Harbor Lane Health", "Product Analyst", "Chicago, IL",
  "Product Analyst at Harbor Lane Health. Location: Chicago, IL. Requirements: SQL, product analytics, funnel dashboards, A/B test readouts, 1+ year of analytics work. Salary: $78,000-$92,000.");
const DENVER_DA = P("greenhouse:northwind:103", "Northwind Health", "Data Analyst", "Denver, CO",
  "Data Analyst at Northwind Health. Location: Denver, CO. Requirements: 2+ years of SQL, Tableau or Power BI, dashboards for clinic operations. Salary: $74,000-$90,000.");
const REMOTE_SR_DA = P("greenhouse:northwind:102", "Northwind Health", "Senior Data Analyst", "Remote - US",
  "Senior Data Analyst at Northwind Health. Location: Remote - US. Requirements: 5+ years of SQL and Python, mentoring analysts.", { remote: "remote" });
const LUMEN_PM = P("lever:lumen:401", "Lumen Education", "Product Manager", "San Francisco, CA",
  "Product Manager at Lumen Education. Location: San Francisco, CA. Requirements: 3+ years of product management, shipped consumer products. Salary: $120,000-$140,000.");

const POOL = [NORTHWIND_DA, BRIGHTPATH_DA, COPPERLEAF_BA, HARBORLANE_PA, DENVER_DA, REMOTE_SR_DA, LUMEN_PM];
const POOL_NO_PA = POOL.filter((p) => p !== HARBORLANE_PA);

const PROFILE = {
  id: "profile-maya",
  isTestFixture: true,
  basics: { name: "Maya Rivera", location: "Chicago, IL" },
  facts: [
    { id: "m1", kind: "education", title: "DePaul University - B.S. Business Analytics", text: "DePaul University - B.S. Business Analytics, graduating May 2026", status: "confirmed" },
    { id: "m2", kind: "experience", title: "Data Analyst, Brightline Studio", text: "Data Analyst, Brightline Studio, June 2024 - May 2026", start: "2024-06", end: "2026-05", action: "Built SQL and Tableau dashboards for client funnels", result: "Cut weekly reporting from 6 hours to 40 minutes", status: "confirmed" },
    { id: "m3", kind: "experience", title: "Product Analytics Intern, Loop Grocer", text: "Product Analytics Intern, Loop Grocer, June 2025 - August 2025", start: "2025-06", end: "2025-08", action: "Ran funnel analysis and A/B test readouts in SQL", result: "Found the checkout drop-off step the team then fixed", status: "confirmed" },
    { id: "m4", kind: "skill", name: "SQL", title: "SQL", text: "SQL", status: "confirmed" },
    { id: "m5", kind: "skill", name: "Tableau", title: "Tableau", text: "Tableau", status: "confirmed" },
    { id: "m6", kind: "skill", name: "Python", title: "Python", text: "Python", status: "confirmed" },
    { id: "m7", kind: "skill", name: "Excel", title: "Excel", text: "Excel", status: "confirmed" },
  ],
};
const STATED = {
  facts: [
    { kind: "target_role", value: "Product Analyst", evidence: "I want a product analyst role" },
    { kind: "target_firm", value: "Harbor Lane Health", evidence: "my target firm is Harbor Lane Health" },
  ],
};

function sayOnce(text, stores, postings) {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const snapshot = stores ? { scope: { userId: "u" }, stores: clone(stores) } : null;
  const ctx = host.createTurnCtx({ userId: "u", threadId: "t-u", now: NOW, accountPersistence: true, snapshot, account: {}, watchState: {}, postings: postings || POOL });
  const out = host.runTurn(text, ctx);
  // The host wraps the router result: the served shortlist and any
  // artifact ride on out.result.
  const res = (out && out.result) || {};
  return Object.assign({}, out, { shortlist: res.shortlist || [], artifact: res.artifact || null });
}
const FULL = { profile: PROFILE, statedFacts: STATED, posting: BRIGHTPATH_DA };
const replyOf = (out) => String(out.reply || "");

/* ---------------- FIX 1: the ask's place is a hard filter -------- */

test("FIX 1: 'show me jobs in Chicago' serves only Chicago postings — the Denver posting is not padding", () => {
  const out = sayOnce("show me jobs in Chicago", FULL);
  assert.equal(out.intent, "career_discovery", `intent: ${out.intent} — ${replyOf(out)}`);
  const list = out.shortlist || [];
  assert.equal(list.length, 4, `exactly the 4 Chicago postings are served: ${JSON.stringify(list.map((r) => `${r.title}@${r.company}:${r.location}`))}`);
  assert.ok(list.every((r) => /Chicago/.test(r.location || "")), `every served role is in Chicago: ${JSON.stringify(list.map((r) => r.location))}`);
  assert.ok(!/Denver/.test(replyOf(out)), `the Denver posting is not in the reply: ${replyOf(out)}`);
  assert.match(replyOf(out), /only 4/i, `the reply says plainly that only 4 are in Chicago: ${replyOf(out)}`);
});

test("FIX 1 control: a find with no place named is unchanged — 5 ranked, Denver allowed with its relocation caveat", () => {
  const out = sayOnce("find roles for me", FULL);
  assert.equal(out.intent, "career_discovery", `intent: ${out.intent} — ${replyOf(out)}`);
  const list = out.shortlist || [];
  assert.equal(list.length, 5, `the usual 5 are served: ${JSON.stringify(list.map((r) => `${r.title}@${r.company}:${r.location}`))}`);
  assert.ok(list.some((r) => /Denver/.test(r.location || "")), `Denver is in the unfiltered list: ${JSON.stringify(list.map((r) => r.location))}`);
  assert.match(replyOf(out), /Denver/, `the reply names Denver: ${replyOf(out)}`);
  assert.match(replyOf(out), /relocat/i, `Denver carries its relocation caveat: ${replyOf(out)}`);
});

test("FIX 1 control: the profile's own city named behaves the same as any named place", () => {
  const out = sayOnce("find me jobs in Chicago", FULL);
  assert.equal(out.intent, "career_discovery", `intent: ${out.intent} — ${replyOf(out)}`);
  const list = out.shortlist || [];
  assert.equal(list.length, 4, `the 4 Chicago postings: ${JSON.stringify(list.map((r) => `${r.title}@${r.company}:${r.location}`))}`);
  assert.ok(!/Denver/.test(replyOf(out)), `no Denver padding: ${replyOf(out)}`);
});

test("FIX 1: a named place with no postings gets an honest zero and a LABELLED outside offer — nothing served silently", () => {
  const out = sayOnce("show me jobs in Austin", FULL);
  assert.equal(out.intent, "career_discovery", `intent: ${out.intent} — ${replyOf(out)}`);
  assert.deepEqual(out.shortlist || [], [], `no roles are served for Austin: ${JSON.stringify((out.shortlist || []).map((r) => r.location))}`);
  assert.match(replyOf(out), /no roles in Austin/i, `the reply says there are none in Austin: ${replyOf(out)}`);
  assert.match(replyOf(out), /outside Austin/i, `the alternative is offered, labelled as outside Austin: ${replyOf(out)}`);
});

/* ---------------- FIX 2: the role named in the ask controls ----- */

test("FIX 2: 'tailor my resume for a product analyst role' tailors the Product Analyst posting, not the staged Data Analyst one", () => {
  const out = sayOnce("tailor my resume for a product analyst role", FULL);
  assert.equal(out.intent, "career_tailor", `intent: ${out.intent} — ${replyOf(out)}`);
  assert.ok(out.artifact, `a tailored artifact is produced: ${replyOf(out)}`);
  assert.equal(out.artifact.company, "Harbor Lane Health", `the artifact is for the named role's posting: ${JSON.stringify(out.artifact.company)}`);
  assert.match(replyOf(out), /tailored for Product Analyst at Harbor Lane Health/i, `the reply names the asked target: ${replyOf(out)}`);
  assert.ok(!/tailored for Data Analyst at BrightPath/i.test(replyOf(out)), `the staged posting is not silently substituted: ${replyOf(out)}`);
});

test("FIX 2: with no posting matching the named role, the turn ASKS — candidates listed, the staged one labelled, no artifact", () => {
  const out = sayOnce("tailor my resume for a product analyst role", FULL, POOL_NO_PA);
  assert.equal(out.intent, "tailor_needs_posting", `intent: ${out.intent} — ${replyOf(out)}`);
  assert.equal(out.resultStatus, "awaiting_user", `the turn waits for the user's choice: ${out.resultStatus}`);
  assert.ok(!out.artifact, `no tailored artifact for a different role is produced: ${replyOf(out)}`);
  assert.match(replyOf(out), /BrightPath Logistics/, `the staged posting is among the candidates: ${replyOf(out)}`);
  assert.match(replyOf(out), /staged/i, `the staged posting is labelled as staged: ${replyOf(out)}`);
  assert.ok(!/tailored for/i.test(replyOf(out)), `nothing claims to be tailored: ${replyOf(out)}`);
});

test("FIX 2 control: a named company+role matching the staged posting still tailors it directly", () => {
  const out = sayOnce("tailor my resume for the Data Analyst role at BrightPath Logistics", FULL);
  assert.equal(out.intent, "career_tailor", `intent: ${out.intent} — ${replyOf(out)}`);
  assert.ok(out.artifact, `a tailored artifact is produced: ${replyOf(out)}`);
  assert.equal(out.artifact.company, "BrightPath Logistics", `the named target is tailored: ${JSON.stringify(out.artifact.company)}`);
});

test("FIX 2 control: no role named — the staged posting remains the legitimate default", () => {
  const out = sayOnce("tailor my resume", FULL);
  assert.equal(out.intent, "career_tailor", `intent: ${out.intent} — ${replyOf(out)}`);
  assert.ok(out.artifact, `a tailored artifact is produced: ${replyOf(out)}`);
  assert.equal(out.artifact.company, "BrightPath Logistics", `the staged default stands when the ask names nothing: ${JSON.stringify(out.artifact.company)}`);
});
