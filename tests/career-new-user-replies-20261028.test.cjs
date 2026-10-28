'use strict';
// PRODUCT AUDIT 2026-10-28 (docs/architect/PRODUCT-AUDIT-2026-10-28.md, items 1-3): what a brand-new person texts first.
// Through the production career bundle and host (router_core.career.js + career_host.js), as agent-chat runs it.
// (1) no catch-all reply opens with "I did not catch", dumps the capability list, or asks "what date does it turn on";
//     each is short (one text) with exactly one question, and it reads the person's record (resume or not)
// (2) the greeting is one text and its next step fits the record
// (3) texting shorthand is not "corrected" ("thx" was read as "the"); a lowercase "<role> jobs in <city>" is a search
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const ROOT = path.resolve(__dirname, "..");

let host;
async function setup() {
  if (host) return;
  const B = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/router_core.career.js")));
  const { CareerHost } = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/career_host.js")));
  host = CareerHost.createCareerHost(B);
}
const copy = (x) => JSON.parse(JSON.stringify(x ?? null));
function convo() {
  let snap = null;
  return (text, extra = {}) => {
    const ctx = host.createTurnCtx({ userId: "u-audit", threadId: "t-audit", now: Date.parse("2026-10-28T15:00:00Z"), snapshot: copy(snap), postings: [], ...extra });
    const out = host.runTurn(text, ctx);
    snap = copy(host.extractSnapshot(ctx));
    return out;
  };
}
const questions = (r) => (String(r).match(/\?/g) || []).length;
const BAD = /did not catch|didn't catch|Here is what I can do|what date does it turn on/i;

test("(1) catch-all replies: no 'did not catch', no capability dump, one short text, one question", async () => {
  await setup();
  const say = convo();
  say("jobs"); // a career frame stands, so the catch-all owns the bare replies below
  for (const m of ["thx", "lol ok", "yes", "no", "idk", "nvm", "how much does this cost", "is this free", "upload resume", "i dont have a resume",
    "cancel", "that was wrong", "whats my status", "did i get any replies", "networking", "apply"]) {
    const o = say(m);
    if (o.intent !== "career_catchall") continue; // another handler owning it is fine; the catch-all's shape is what is tested
    const r = String(o.reply);
    assert.ok(!BAD.test(r), `${m}: ${r}`);
    assert.ok(r.length <= 160, `${m}: one text (${r.length} chars): ${r}`);
    assert.equal(questions(r), 1, `${m}: exactly one question: ${r}`);
  }
});

test("(1) the catch-all reads the record: no resume -> asks for it; never claims one", async () => {
  await setup();
  const say = convo();
  say("jobs");
  const r = String(say("idk").reply);
  assert.match(r, /resume/i, r);
  assert.ok(!/fit your resume/i.test(r), `no resume on record, so none is claimed: ${r}`);
});

test("(1) 'thx' is thanked, not misread", async () => {
  await setup();
  const say = convo();
  say("jobs");
  const o = say("thx");
  assert.match(String(o.reply), /^Anytime\./, String(o.reply));
});

test("(2) greeting and 'what can you do' are one text with a next step for a new person", async () => {
  await setup();
  for (const m of ["hi", "yo", "wat can u do", "what can you do", "hey whats up"]) {
    const o = convo()(m);
    assert.equal(o.intent, "career_greeting", `${m}: ${o.intent} ${o.reply}`);
    assert.ok(String(o.reply).length <= 240, `${m}: ${String(o.reply).length} chars`);
    assert.match(String(o.reply), /resume/i, `${m}: a new person is pointed at their resume: ${o.reply}`);
  }
});

test("(3) a lowercase '<role> jobs in <city>' is a role search", async () => {
  await setup();
  const o = convo()("data analyst jobs in chicago");
  assert.equal(o.intent, "career_discovery", String(o.reply).slice(0, 200));
});

// ---------- PRODUCT AUDIT 2026-10-28 items 5, 6, 8, 10 ----------
const fs = require("node:fs");
const POSTINGS = [
  { id: "gh:1", job_id: "gh:1", company: "Acme", title: "Data Analyst", location: "Chicago, IL", url: "https://boards.greenhouse.io/acme/jobs/1", description: "SQL Python dashboards", first_seen_at: "2026-10-25T00:00:00Z" },
  { id: "gh:2", job_id: "gh:2", company: "Globex", title: "Junior Data Analyst", location: "Remote", url: "https://jobs.lever.co/globex/2", description: "SQL Excel", first_seen_at: "2026-10-26T00:00:00Z" },
];

test("(5) a new person's job list is not 'ranked by your profile', says no 'caveat: no tradeoff', and Remote is never 'relocating'", async () => {
  await setup();
  const o = convo()("find me jobs", { postings: POSTINGS });
  const r = String(o.reply);
  assert.equal(o.intent, "career_discovery", r);
  assert.ok(!/ranked by fit with your profile|closest fit on your profile|no tradeoff stated|gaps named in the caveat/.test(r), r);
  assert.ok(!/Remote, outside the places|in Remote/.test(r), r);
  assert.match(r, /resume/i, "the next step asks for the resume");
});

test("(6) 'can u help me get a job' is a job search, not a Summer internship search", async () => {
  await setup();
  for (const m of ["can u help me get a job", "i need a job asap"]) {
    const o = convo()(m, { postings: POSTINGS });
    assert.notEqual(o.intent, "career_internship_discovery", `${m}: ${o.reply}`);
    assert.ok(!/Summer 20\d\d|internship/i.test(String(o.reply)), `${m}: ${o.reply}`);
  }
  assert.equal(convo()("i need a summer internship", { postings: POSTINGS }).intent, "career_internship_discovery", "an internship ask keeps its band");
});

test("(8) 'what do you know about me' after a confirmed resume reads the resume, never 'Nothing is on your record'", async () => {
  await setup();
  const RESUME = fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-resume.txt"), "utf8");
  // the account record carries the confirmed profile across turns, as agent-chat's host commit does
  let snap = null, account = { version: 0, epoch: 0 };
  const say = (text) => {
    const ctx = host.createTurnCtx({ userId: "u-recall", threadId: "t-recall", now: Date.parse("2026-10-28T15:00:00Z"), accountPersistence: true, accountMemory: true, snapshot: copy(snap), account: copy(account), watchState: {}, postings: [] });
    const out = host.runTurn(text, ctx);
    snap = copy(host.extractSnapshot(ctx)); account = { ...account, ...copy(ctx._hostPatch || {}), version: account.version + 1 };
    return out;
  };
  say(`here is my resume:\n${RESUME}`);
  assert.equal(say("yes thats my resume").resultStatus, "completed");
  const r = String(say("what do you know about me").reply);
  assert.ok(!/Nothing is on your record/.test(r), r);
  assert.match(r, /resume you confirmed: \d+ entries/, r);
});

test("(8) 'remind me tomorrow to follow up' is not a read-back of the record", async () => {
  await setup();
  const say = convo();
  say("i want a job in marketing");
  const o = say("remind me tomorrow to follow up");
  assert.notEqual(o.intent, "conversation_recall", String(o.reply));
});

test("(7) 'how do i upload my resume' is about the resume, not the networking contact list", async () => {
  await setup();
  const o = convo()("how do i upload my resume");
  assert.equal(o.intent, "career_resume_guidance", String(o.reply));
  assert.ok(!/enrich|deduped|every name/i.test(String(o.reply)), String(o.reply));
  assert.equal(convo()("upload my contacts list").intent, "outreach_clarification", "a contact list keeps its intake");
});

test("(10) pause replies are plain words", async () => {
  await setup();
  const say = convo();
  const r1 = String(say("stop").reply), r2 = String(say("help").reply);
  for (const r of [r1, r2]) {
    assert.ok(!/uncertain/i.test(r), r);
    assert.match(r, /resume career work/, r);
  }
});
