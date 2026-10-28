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
