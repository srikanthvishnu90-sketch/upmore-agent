'use strict';
// =====================================================================
// FIX LANE T1 — channel conversation completeness (agent-chat).
// Evidence: the first LIVE Telegram battery, graded —
// The 2026-10-20 Telegram channel battery (graded record kept outside the repo; summary in docs/gauntlet/).
// (PASS 0 · PARTIAL 4 · FAIL 5; defects TG-START-FALLBACK,
// TG-LONGPLAN-FALLBACK, TG-RECALL-ABSENT, TG-GUSTO-LINK-NOT-SERVED).
//
// The channel bridge (supabase/functions/_shared/channel_bridge.ts)
// passes the user's text VERBATIM into the same agent-chat call the
// web surface makes — there is no surface fork in the chain. The
// battery's failures are therefore dispatch failures on natural
// channel phrasings, and this guard drives the REAL hosted chain
// (career_host: 120 access → 130 onboarding → 142 router → 141
// doorstep, inside 143 containment — the v241 lane's Part-1 world
// pattern) with the battery's EXACT words, in the battery's order,
// against the battery account's recorded state.
//
// THE WORLD mirrors the battery account (gauntlet test user) as the
// cross-check read it back from the product's own tables:
//   * stated facts BEFORE turn 3 (account record): the five morning
//     facts (target firm still Google) + Dana keyed to
//     "northwind ledger" from the morning gauntlet sentence.
//   * the pool composition mirrors handler-career.ts verbatim: the
//     recency window PLUS, when the router's own namedRoleTargetOf
//     parses a company from the message, the targeted shelf read
//     (career_pool.loadTargeted, company ilike) merged by job_id —
//     a drift pin below keeps that transcription honest.
//   * the pool holds the exact KB row the cross-check found:
//     company stored LOWERCASE as `gusto`, title Finance Intern
//     (Summer 2027), url https://job-boards.greenhouse.io/gusto/
//     jobs/8257115. Proof it rode the live pool: turn 5's absence
//     answer names the firm lowercase "gusto" — a string only the
//     pool's stored company (via companyFromText's known-names loop)
//     can produce; every capitalized text frame yields "Gusto".
//
// Every battery turn below FAILS on the base (47e5f6b0) and must pass
// after the fix; the two controls pin standing honest behavior and
// are green before and after. Tier: harness proof (tier 2) until the
// post-deploy live re-drive passes.
// =====================================================================

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const clone = (x) => JSON.parse(JSON.stringify(x));
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const CareerRouter = D("142-career-router.js");

const FALLBACK = /I didn't catch that|I'm Trainee, a career agent: I find roles/;

// ---- the battery's exact words -------------------------------------
const T_START = "/start";
const T_GREET_A = "Hello!";
const T_GREET_B = "hey there";
const T_OPENER = "Hi! I'm looking for a summer internship in finance. What can you do for me?";
const T_PLANT = "Quick note — my target firm is Northwind Ledger and my recruiter contact there is Dana. Please remember that.";
const T_PLAN = "Give me a complete plan for preparing for a finance internship interview over the next two weeks, day by day.";
const T_PLAN_PARA = "Can you give me a day-by-day plan to prepare for my finance interview over the next two weeks?";
const T_LINK = "Where can I apply to Gusto's finance internship? Give me the link.";
const T_RECALL = "What firm did I say I'm targeting, and who is my contact there?";
const GUSTO_URL = "https://job-boards.greenhouse.io/gusto/jobs/8257115";

// ---- fixtures: the battery account's recorded state ----------------
const MORNING_FACTS = [
  { at: "2026-10-20T12:26:55.689Z", kind: "year", value: "sophomore", evidence: "I am a sophomore" },
  { at: "2026-10-20T06:00:25.470Z", kind: "geography", value: "SF", evidence: "Find 75 data scientists at fintechs in SF who share my major" },
  { at: "2026-10-20T06:00:25.470Z", kind: "majors", value: "at fintechs in SF who share my", evidence: "at fintechs in SF who share my major" },
  { at: "2026-10-20T05:39:31.810Z", kind: "target_firm", value: "Google", evidence: "Find 55 people at Google who interned at startups first" },
  { at: "2026-10-20T05:30:40.075Z", kind: "level", value: "analysts", evidence: "analysts and first" },
];
const MORNING_KEYED = [
  { at: "2026-10-20T15:31:24.000Z", kind: "recruiter_contact", key: "northwind ledger", value: "Dana", evidence: "recruiter contact at Northwind Ledger is Dana" },
];
const batteryAccount = () => ({ stated_facts: { facts: clone(MORNING_FACTS), keyed: clone(MORNING_KEYED), offer: null, updated_at: "2026-10-20T13:26:55.917Z" } });

// ---- fixtures: the pool, in career_pool's mapped shape -------------
const GUSTO_POSTING = {
  id: "greenhouse:https://job-boards.greenhouse.io/gusto/jobs/8257115", job_id: "greenhouse:https://job-boards.greenhouse.io/gusto/jobs/8257115", corpus_id: "greenhouse:https://job-boards.greenhouse.io/gusto/jobs/8257115",
  company: "gusto", title: "Finance Intern (Summer 2027)", location: "New York, New York, United States",
  url: GUSTO_URL, source: "greenhouse", sources: ["greenhouse"], source_urls: [GUSTO_URL],
};
const WINDOW = [
  { id: "greenhouse:https://boards.greenhouse.io/natera/jobs/501", job_id: "greenhouse:https://boards.greenhouse.io/natera/jobs/501", company: "Natera", title: "Senior Product Manager, Provider and RWD Health Systems Applications", location: "Remote, United States", url: "https://boards.greenhouse.io/natera/jobs/501", source: "greenhouse" },
  { id: "greenhouse:https://boards.greenhouse.io/acme/jobs/77", job_id: "greenhouse:https://boards.greenhouse.io/acme/jobs/77", company: "Acme", title: "Data Analyst", location: "Chicago, Illinois, United States", url: "https://boards.greenhouse.io/acme/jobs/77", source: "greenhouse" },
  // The live row rode the served pool (see the header note).
  GUSTO_POSTING,
];

// The handler's pool composition, transcribed from
// agent-chat/handler-career.ts (window + targeted supplement).
function postingsFor(text, shelf) {
  const pool = clone(WINDOW);
  const target = typeof CareerRouter.namedRoleTargetOf === "function" ? CareerRouter.namedRoleTargetOf(text, null) : null;
  if (target && target.company) {
    const needle = String(target.company).toLowerCase();
    const hits = (shelf || []).filter((r) => String(r.company || "").toLowerCase().includes(needle));
    const seen = new Set(pool.map((p) => p.job_id));
    for (const h of hits) if (!seen.has(h.job_id)) pool.push(clone(h));
  }
  return pool;
}

test("drift pin: the handler still composes the pool as window + namedRoleTargetOf-driven targeted supplement", () => {
  const handler = fs.readFileSync(path.join(ROOT, "supabase/functions/agent-chat/handler-career.ts"), "utf8");
  assert.match(handler, /namedRoleTargetOf\(message, null\)/, "the supplement still keys off the router's own parser");
  assert.match(handler, /loadTargeted\(target\)/, "the supplement still reads through the pool loader's targeted path");
});

// ---- the world ------------------------------------------------------
const NOW = Date.parse("2026-10-20T20:27:00.000Z");
function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const postings = o.postings !== undefined ? o.postings : postingsFor(text, o.shelf !== undefined ? o.shelf : [GUSTO_POSTING]);
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch && ctx._hostPatch.stated_facts) {
      const a = store.accounts.get(userId) || {};
      a.stated_facts = clone(ctx._hostPatch.stated_facts);
      store.accounts.set(userId, a);
    }
    return { out, ctx, snap };
  };
  return { host, store, say };
}

// =====================================================================
// TG-START-FALLBACK — "/start" and bare greetings get the generic
// fallback; no channel greeting/onboarding path exists.
// =====================================================================
test("TG-START-FALLBACK: /start gets a real greeting + orientation, not the fallback", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t1", batteryAccount());
  const r = w.say("u-t1", "t-t1", T_START);
  assert.equal(r.out.intent, "career_greeting", `intent=${r.out.intent}; reply: ${String(r.out.reply).slice(0, 160)}`);
  assert.ok(!FALLBACK.test(String(r.out.reply)), "the greeting is not the generic fallback");
  assert.match(r.out.reply, /Trainee/, "the greeting names the product");
  assert.match(r.out.reply, /find (jobs|roles)|tailor|prep|track/i, "the greeting orients: what I do");
});

test("TG-START-FALLBACK: two bare-greeting paraphrases route the same way", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t1b", batteryAccount());
  for (const g of [T_GREET_A, T_GREET_B]) {
    const r = w.say("u-t1b", "t-t1b", g);
    assert.equal(r.out.intent, "career_greeting", `"${g}" → intent=${r.out.intent}; reply: ${String(r.out.reply).slice(0, 120)}`);
    assert.ok(!FALLBACK.test(String(r.out.reply)), `"${g}" is not the generic fallback`);
  }
});

test("TG-START-FALLBACK control: a greeting WITH an ask is not swallowed by the greeting route", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t1c", batteryAccount());
  const r = w.say("u-t1c", "t-t1c", T_OPENER);
  assert.notEqual(r.out.intent, "career_greeting", "the opener keeps its existing owner (discovery)");
  assert.ok(!FALLBACK.test(String(r.out.reply)), "the opener never fell back in the battery either (PARTIAL)");
});

// =====================================================================
// TG-LONGPLAN-FALLBACK — the complete interview-prep plan ask falls
// back; the prep capability never sees it.
// =====================================================================
test("TG-LONGPLAN-FALLBACK: the battery's exact plan ask returns a real day-by-day plan", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t2", batteryAccount());
  const r = w.say("u-t2", "t-t2", T_PLAN);
  assert.equal(r.out.intent, "prep_plan", `intent=${r.out.intent}; reply: ${String(r.out.reply).slice(0, 200)}`);
  assert.ok(!FALLBACK.test(String(r.out.reply)), "the plan ask is not the generic fallback");
  assert.match(r.out.reply, /Day 1\b/, "the plan starts at day 1");
  assert.match(r.out.reply, /Day 14\b/, "two weeks = 14 days, all of them planned");
  assert.match(r.out.reply, /Day 7\b/, "the plan is structured across the horizon, not a stub");
});

test("TG-LONGPLAN-FALLBACK: one paraphrase reaches the same plan", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t2b", batteryAccount());
  const r = w.say("u-t2b", "t-t2b", T_PLAN_PARA);
  assert.equal(r.out.intent, "prep_plan", `intent=${r.out.intent}; reply: ${String(r.out.reply).slice(0, 200)}`);
  assert.match(r.out.reply, /Day 1\b/);
  assert.match(r.out.reply, /Day 14\b/);
});

// =====================================================================
// RE-DRIVE 2026-10-20 16:16–16:17 CDT (post-v7, owner's thread) — two
// fresh live instances of the same two defect families:
//  * a prep-plan ask in "get ready" words was claimed by the A3
//    people-ask gate (verb "get" + noun "analysts") and answered with
//    the NETWORKING list-building plan — no interview-prep content;
//  * "Send me the link to that Gusto data analyst role you found
//    earlier." was claimed by the send-attempt stand-down ("send"
//    read as a send instruction) — and the parser had no frame for
//    "that <Company> <role> role" anyway, so no target resolved.
// =====================================================================
const T_PLAN_REDRIVE = "Give me a plan for this week to get ready for data analyst interviews in two weeks.";
const T_LINK_REDRIVE = "Send me the link to that Gusto data analyst role you found earlier.";
const GUSTO_DA_URL = "https://boards.greenhouse.io/gusto/jobs/9002";
const GUSTO_DA_POSTING = {
  id: "greenhouse:https://boards.greenhouse.io/gusto/jobs/9002", job_id: "greenhouse:https://boards.greenhouse.io/gusto/jobs/9002", corpus_id: "greenhouse:https://boards.greenhouse.io/gusto/jobs/9002",
  company: "gusto", title: "Data Analyst", location: "San Francisco, California, United States",
  url: GUSTO_DA_URL, source: "greenhouse", sources: ["greenhouse"], source_urls: [GUSTO_DA_URL],
};

test("TG-LONGPLAN-FALLBACK (re-drive): the 'get ready' plan ask is a prep plan, not a networking list build", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t2c", batteryAccount());
  const r = w.say("u-t2c", "t-t2c", T_PLAN_REDRIVE);
  assert.equal(r.out.intent, "prep_plan", `intent=${r.out.intent}; reply: ${String(r.out.reply).slice(0, 200)}`);
  assert.ok(!/Building the list/.test(String(r.out.reply)), "a prep ask is never answered with the outreach list build");
  assert.match(r.out.reply, /Day 1\b/);
  assert.match(r.out.reply, /Day 14\b/, "interviews in two weeks = a 14-day horizon");
});

test("TG-LONGPLAN-FALLBACK (re-drive) control: a people-plan ask keeps the campaign route", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t2d", batteryAccount());
  const r = w.say("u-t2d", "t-t2d", "Give me a plan to reach out to data analysts at fintechs in SF this month.");
  assert.notEqual(r.out.intent, "prep_plan", "no interview in the ask → not a prep plan");
});

test("TG-GUSTO-LINK-NOT-SERVED (re-drive): 'Send me the link to that Gusto data analyst role' serves the posting", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t4b", batteryAccount());
  const r = w.say("u-t4b", "t-t4b", T_LINK_REDRIVE, { postings: [...WINDOW, GUSTO_DA_POSTING], shelf: [GUSTO_DA_POSTING] });
  assert.equal(r.out.intent, "named_role_link", `intent=${r.out.intent}; reply: ${String(r.out.reply).slice(0, 240)}`);
  assert.ok(String(r.out.reply).includes(GUSTO_DA_URL), "the reply carries the posting's URL");
  assert.match(r.out.reply, /Data Analyst/, "the reply names the posting it serves");
});

// =====================================================================
// TG-RECALL-ABSENT — plant (turn 3 verbatim), then the who-question
// (turn 7 verbatim) in the SAME thread must answer from the store.
// =====================================================================
test("TG-RECALL-ABSENT: plant then ask, same thread — the record answers", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t3", batteryAccount());
  const plant = w.say("u-t3", "t-t3", T_PLANT);
  assert.equal(plant.out.intent, "profile_correction", `the plant commits as it did live (intent=${plant.out.intent})`);
  const facts = (plant.snap.stores.statedFacts && plant.snap.stores.statedFacts.facts) || [];
  assert.ok(facts.some((f) => f.kind === "target_firm" && f.value === "Northwind Ledger"), "the store holds the corrected firm after the plant");
  const r = w.say("u-t3", "t-t3", T_RECALL);
  assert.equal(r.out.intent, "conversation_recall", `intent=${r.out.intent}; reply: ${String(r.out.reply).slice(0, 200)}`);
  assert.ok(!FALLBACK.test(String(r.out.reply)), "the recall is not the generic fallback");
  assert.match(r.out.reply, /Northwind Ledger/, "the recall names the recorded firm");
  assert.match(r.out.reply, /\bDana\b/, "the recall names the recorded contact");
});

test("TG-RECALL-ABSENT control: the same ask on an empty record invents nothing", () => {
  const w = makeWorld();
  const r = w.say("u-t3e", "t-t3e", T_RECALL);
  assert.ok(!/Northwind Ledger|\bDana\b/.test(String(r.out.reply)), "no recorded fact → no fabricated recall");
  if (r.out.intent === "conversation_recall") assert.match(r.out.reply, /not on your record|haven't|have not/i, "a recall claim on an empty record must be the honest absence");
});

// =====================================================================
// TG-GUSTO-LINK-NOT-SERVED — the link ask must serve the shelf
// posting (with its URL) before any company-file-absence answer.
// =====================================================================
test("TG-GUSTO-LINK-NOT-SERVED: the exact ask serves the posting and its real URL, link first", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t4", batteryAccount());
  const r = w.say("u-t4", "t-t4", T_LINK);
  assert.equal(r.out.intent, "named_role_link", `intent=${r.out.intent}; reply: ${String(r.out.reply).slice(0, 240)}`);
  assert.ok(String(r.out.reply).includes(GUSTO_URL), `the reply carries the real posting URL; reply: ${String(r.out.reply).slice(0, 240)}`);
  assert.match(r.out.reply, /Finance Intern/, "the reply names the posting it serves");
  const noteAt = String(r.out.reply).indexOf("no company file");
  if (noteAt >= 0) assert.ok(String(r.out.reply).indexOf(GUSTO_URL) < noteAt, "the link rides BEFORE the dossier-absence note");
});

test("TG-GUSTO-LINK-NOT-SERVED control: the posting nowhere in the pool → no link is invented", () => {
  const w = makeWorld();
  w.store.accounts.set("u-t4c", batteryAccount());
  const noGusto = WINDOW.filter((p) => p.company !== "gusto");
  const r = w.say("u-t4c", "t-t4c", T_LINK, { postings: noGusto, shelf: [] });
  assert.notEqual(r.out.intent, "named_role_link", "no posting resolves → the link route stands down");
  assert.ok(!String(r.out.reply).includes("8257115"), "no posting → no URL is served");
});
