/* WO-088 (architect): router residuals from the owner's brutal list (2026-10-20), each re-run on trunk's router and
   still wrong there. The router answers live until CAREER_BRAIN=agent passes D-027, so each is fixed here, and each
   case stays in the suite. Every thread is the brutal list's own words (complexity battery c01–c42, probes P1, TG).
   Check: node --test tests/career-brutal-residuals.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const host = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"), CareerRouter: D("142-career-router.js"),
  CareerDoorstep: D("141-career-doorstep.js"), CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
});
const NOW = Date.parse("2026-10-20T15:00:00Z");
function thread(id, msgs) {
  let snap = null; const out = [];
  for (const m of msgs) {
    const ctx = host.createTurnCtx({ userId: "wo088-" + id, threadId: id, now: NOW, snapshot: snap });
    const res = host.runTurn(m, ctx);
    snap = host.extractSnapshot(ctx);
    out.push({ intent: res.intent || null, reply: String(typeof res.reply === "string" ? res.reply : JSON.stringify(res.reply)), stores: snap.stores || {} });
  }
  return out;
}
const FALLBACK = /didn't catch that/i;
const notFallback = (r, m) => { assert.ok(r.intent && !FALLBACK.test(r.reply), `${m}: fell back (${r.intent}): ${r.reply.slice(0, 160)}`); };

test("BL-641 / P1: an offer is 'an offer', never 'a offer'", () => {
  for (const msg of ["I got an offer! Help me negotiate a higher salary.", "I got an offer, 85k, answer by Monday"]) {
    const [r] = thread("bl641-" + msg.length, [msg]);
    assert.ok(!/\ba offer\b/i.test(r.reply), r.reply.slice(0, 200));
  }
});

test("BL-632 / c16: 'never email her again' after Maya is named suppresses Maya, never a person called 'her again'", () => {
  const rs = thread("c16", ["I am a sophomore who wants to network into investment banking. Help me find people to reach out to and draft my first outreach.",
    "take Maya off my outreach list completely", "never email her again"]);
  assert.ok(!/her again/i.test(rs[2].reply), rs[2].reply.slice(0, 200));
  assert.ok(/Maya/.test(rs[2].reply), rs[2].reply.slice(0, 200));
});

test("BL-673 / BL-669: the contact fact is keyed to Northwind Ledger, and the recall question answers from it", () => {
  const rs = thread("tg", ["Quick note — my target firm is Northwind Ledger and my recruiter contact there is Dana. Please remember that.",
    "What firm did I say I'm targeting, and who is my contact there?"]);
  assert.ok(!/ledger and is/i.test(rs[0].reply), `garbled key: ${rs[0].reply.slice(0, 220)}`);
  notFallback(rs[1], "recall");
  assert.ok(/Northwind Ledger/i.test(rs[1].reply) && /Dana/.test(rs[1].reply), rs[1].reply.slice(0, 220));
});

test("c17 / BL-633: a date correction moves the tracker row's date", () => {
  const rs = thread("c17", ["add my Goldman application to the tracker, I applied yesterday", "actually it was two days ago", "what's its status"]);
  notFallback(rs[1], "date correction");
  assert.ok(/2026-10-18/.test(rs[2].reply), `the row reads the corrected date: ${rs[2].reply.slice(0, 200)}`);
});

test("c41 / BL-627: 'I want investment banking' is a stated goal, recorded", () => {
  const rs = thread("c41", ["let me tell you about me: I'm a sophomore", "I study economics at Ohio State", "I want investment banking"]);
  notFallback(rs[2], "goal fact");
  assert.ok(/investment banking/i.test(rs[2].reply), rs[2].reply.slice(0, 200));
  // A question is never a stated fact: it keeps the guidance answer (career-bundle-reachability's staged chat).
  for (const ask of ["I want to break into investment banking — where do I start?", "I want investment banking, what should I do first"]) {
    const [q] = thread("c41q-" + ask.length, [ask]);
    assert.ok(!/you want investment banking/i.test(q.reply), `a question saved as a fact: ${q.reply.slice(0, 200)}`);
  }
});

test("c12 / c38 / BL-602 / BL-624: a role or place correction in a search thread is a search, not a fallback", () => {
  const a = thread("c12", ["find me data analyst roles", "actually data science"]);
  notFallback(a[1], "role correction");
  const b = thread("c38", ["find me jobs in Chicago only", "ok also New York"]);
  notFallback(b[1], "place widening");
});

test("c04 / BL-594: a side question about pay, then 'back to the internships', both answered", () => {
  const rs = thread("c04", ["Find me internships I can apply to this week.", "actually what's a good salary for a data analyst in Chicago?", "ok back to the internships"]);
  notFallback(rs[1], "pay side question");
  notFallback(rs[2], "back to the internships");
});

test("c09 / BL-599: a pasted posting is a posting, never an outreach list; 'do I fit?' answers about it", () => {
  const rs = thread("c09", ["Help me get ready to apply to internships this season.",
    "here's the posting: Data Analyst Intern, Acme Analytics. Requirements: SQL, Excel, Tableau. Build dashboards.", "do I fit?"]);
  assert.ok(!/Building the list now/i.test(rs[1].reply) && rs[1].intent !== "outreach_clarification", `${rs[1].intent}: ${rs[1].reply.slice(0, 200)}`);
  notFallback(rs[2], "do I fit");
});

test("c21 / BL-610: 'switch to market sizing' in an interview-prep thread stays prep, never a career switch", () => {
  const rs = thread("c21", ["prep me for my interview — hit me with a DCF question", "switch to market sizing"]);
  assert.ok(!/switching careers|transferable/i.test(rs[1].reply), rs[1].reply.slice(0, 200));
  assert.ok(/market[- ]sizing|how many|estimate/i.test(rs[1].reply), rs[1].reply.slice(0, 200));
});

test("c01 / BL-591: three asks in one message: all three acknowledged", () => {
  const [r] = thread("c01", ["ok three things at once: find me software internships for next summer, start a networking plan for investment banking, and set up tracking for my applications"]);
  assert.ok(/internship/i.test(r.reply) && /(network|outreach|investment bank)/i.test(r.reply) && /track/i.test(r.reply), r.reply.slice(0, 300));
});

test("c10 / BL-600: a finance ask next to a career ask is named as not Trainee's, never silently dropped", () => {
  const [r] = thread("c10", ["two things: how much did I spend on food last month, and also find me finance internships for the summer"]);
  assert.ok(/(spend|spending|money|finance tracking)/i.test(r.reply) && /internship/i.test(r.reply), r.reply.slice(0, 300));
});

test("c09 follow-up: 'do I fit?' with the posting in hand and no record says it has the posting and needs the record", () => {
  const rs = thread("c09b", ["here's the posting: Data Analyst Intern, Acme Analytics. Requirements: SQL, Excel, Tableau. Build dashboards.", "do I fit?"]);
  assert.ok(!/without the posting/i.test(rs[1].reply), rs[1].reply.slice(0, 200));
  assert.ok(/Data Analyst Intern at Acme Analytics/.test(rs[1].reply) && /resume|experience/i.test(rs[1].reply), rs[1].reply.slice(0, 220));
});

test("BL-669 read-back keeps the firm's own casing", () => {
  const rs = thread("tgcase", ["Quick note — my target firm is Northwind Ledger and my recruiter contact there is Dana. Please remember that.",
    "What firm did I say I'm targeting, and who is my contact there?"]);
  assert.ok(/recruiter contact at Northwind Ledger is Dana/.test(rs[1].reply), rs[1].reply.slice(0, 220));
});
