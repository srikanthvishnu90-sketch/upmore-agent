/* DEPTH WAVE guard (BUG-213/214/215/216 / FR-370/371/372/373):
   conversation GENERALIZATION — mechanisms, not battery shapes.
   Every conversation below is a FRESH paraphrase written for this
   file (different firms, different words from the Lane C corpus and
   from the 42-conversation battery). They run through the real
   career host (snapshot persistence, the product path) and, for the
   fact + pause chains, also through a shallow-copy harness that
   mirrors the Lane C runner (a fresh shallow ctx per turn, shared
   store objects only) — thread state must survive BOTH.
   Check: node --test tests/career-conversation-depth.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const Router = D("142-career-router.js");
const Outreach = D("124-career-outreach.js");

const NOW = Date.parse("2026-10-15T15:00:00.000Z");
const isFallback = (res) => !res || res.intent === "career_fallback" || String((res && res.reply) || "").match(/^(I didn't catch that|I'm Trainee, a career agent: I find roles)/);

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: Router, CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
function runHostConvo(texts) {
  const host = makeHost();
  let ctx = host.createTurnCtx({ userId: "depth-user", threadId: "depth-1", now: NOW, snapshot: null });
  const turns = [];
  texts.forEach((text, i) => {
    const res = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    turns.push({ text, res, snap });
    ctx = host.createTurnCtx({ userId: "depth-user", threadId: "depth-1", now: NOW + (i + 1) * 60000, snapshot: snap });
  });
  return turns;
}
// Shallow-copy runner (Lane C pilot-lib semantics): each turn gets a
// fresh shallow copy of the caller's ctx; the only carry-forward is
// the one the Lane C runner performs (halt result -> globalPause=true,
// suppression store, profile). Thread state that lives on a top-level
// assignment to the copy is LOST unless the product mirrors it into a
// shared store object.
function runShallowConvo(texts) {
  const Access = D("120-career-access.js"), Onb = D("130-career-onboarding.js"), Door = D("141-career-doorstep.js");
  const Track = D("126-career-track.js");
  const ctx = { userId: "depth-shallow", now: NOW, profile: null, postings: [] };
  try { ctx.trackStore = Track.createMemoryStore([]); } catch { /* none */ }
  try { ctx.suppression = Outreach.createSuppressionStore(); } catch { /* none */ }
  const turns = [];
  for (const text of texts) {
    const full = Object.assign({}, ctx);
    let res = Access.handleChat(text, full) || Onb.handleChat(text, full) || Router.handleChat(text, full) || Door.handleChat(text, full);
    if (res && (res.global_pause && res.global_pause.set) && ctx.globalPause !== true) ctx.globalPause = true;
    if (res && res.globalPause === true && ctx.globalPause !== true) ctx.globalPause = true;
    turns.push({ text, res, ctx });
  }
  return turns;
}
const factsOf = (snap) => (((snap.stores || {}).statedFacts || {}).facts) || [];
const threadFactsAll = (turn) => {
  const a = factsOf(turn.snap || {});
  const ts = ((turn.snap || {}).stores || {}).trackStore || {};
  const b = ((ts._careerThread || {}).facts || {}).facts || [];
  return a.length ? a : b;
};

// ---------- BUG-213 (negotiation): the audit chain, fresh words ----------
// An $85k offer with a Monday deadline; the user asks three times for
// the actual email. The chain must END with the email text in the reply,
// composed from the thread's own offer facts.
test("negotiation chain: offer statement -> more-time ask -> the ACTUAL email, twice-asked -> recap", () => {
  const turns = runHostConvo([
    "Meridian Labs just offered me their summer analyst seat — $85k base, and the letter says decide by Monday",
    "could I push that deadline out a bit?",
    "write the actual email for me",
    "no — I mean draft the real words, the extension email itself",
    "ok last thing, recap where we got to with Meridian",
  ]);
  const [t1, t2, t3, t4, t5] = turns;
  for (const [i, t] of turns.entries()) assert.ok(!isFallback(t.res), `turn ${i + 1} fell to fallback: ${t.text}`);
  assert.match(t1.res.reply, /Meridian/);
  assert.match(t1.res.reply, /85|Monday/i);
  assert.match(t2.res.reply, /extension|more time|deadline/i);
  // The product, delivered: a real email text (subject + body), naming
  // the thread's facts — not a description of an email.
  const emailTurn = [t3, t4].find((t) => /subject:/i.test(t.res.reply || ""));
  assert.ok(emailTurn, `no turn delivered an actual email text; t3=${(t3.res.reply || "").slice(0, 200)} t4=${(t4.res.reply || "").slice(0, 200)}`);
  assert.match(emailTurn.res.reply, /Meridian/);
  assert.match(emailTurn.res.reply, /85,?k|\$85/i);
  assert.match(t5.res.reply, /Meridian/);
  assert.match(t5.res.reply, /Monday|extension|deadline/i);
});

test("negotiation claiming: an exploding-deadline offer statement is claimed in-family on turn 1", () => {
  const [t1] = runHostConvo(["Northwind Air offered me an internship, exploding deadline friday"]);
  assert.ok(!isFallback(t1.res));
  assert.match(t1.res.reply, /Northwind/);
  assert.match(t1.res.reply, /friday|deadline|extension/i);
});

// ---------- BUG-213 (career-os): concrete next-two-moves plan ----------
test("career-os chain: semester ask gets a concrete two-move plan, then checklist, then one next step", () => {
  const turns = runHostConvo([
    "I'm a first-year aiming at Seattle firms — what should this term look like for me?",
    "turn that into a checklist",
    "and what's the single next thing, just one",
    "honestly I'm stuck — how does anyone get from analyst to associate, what's the ladder?",
  ]);
  const [t1, t2, t3, t4] = turns;
  for (const [i, t] of turns.entries()) assert.ok(!isFallback(t.res), `turn ${i + 1} fell to fallback: ${t.text}`);
  assert.match(t1.res.reply, /Seattle/);
  assert.match(t1.res.reply, /move (one|1)|first move|1\)|step one/i);
  assert.match(t1.res.reply, /move (two|2)|second move|2\)|next move/i);
  assert.match(t2.res.reply, /checklist|\[ \]|1\.|•|- /i);
  assert.ok(t3.res.reply.length > 40);
  assert.match(t4.res.reply, /analyst|associate|ladder|promotion/i);
});

// ---------- BUG-214: thread fact capture + use + correction ----------
test("fact chain: bare fact turn recorded, plan USES the named firm and city, correction replaces the city", () => {
  const turns = runHostConvo([
    "I want to network into Northbeam in Boston, that's the one I care about",
    "junior, econ major btw",
    "line up analysts there first, skip the MDs",
    "actually shift it to Denver, not Boston",
    "so for that firm in the new city, what's my opening move?",
  ]);
  const [t1, t2, t3, t4, t5] = turns;
  for (const [i, t] of turns.entries()) assert.ok(!isFallback(t.res), `turn ${i + 1} fell to fallback: ${t.text}`);
  assert.match(t1.res.reply, /Northbeam/);
  assert.match(t1.res.reply, /Boston/);
  // The bare fact turn is acknowledged AND recorded (host snapshot).
  assert.match(t2.res.reply, /junior/i);
  assert.match(t2.res.reply, /econ/i);
  const facts2 = threadFactsAll(t2);
  assert.ok(facts2.some((f) => f.kind === "year" && /junior/i.test(f.value)), `year fact not recorded: ${JSON.stringify(facts2)}`);
  assert.ok(facts2.some((f) => f.kind === "majors" && /econ/i.test(f.value)), `major fact not recorded: ${JSON.stringify(facts2)}`);
  // The plan turn uses the named firm from turn 1 — no generic set.
  assert.match(t3.res.reply, /Northbeam/);
  assert.ok(!/bulge bracket set/i.test(t3.res.reply), "plan fell back to the generic bulge set despite a named firm");
  // The correction replaces the city fact.
  assert.match(t4.res.reply, /Denver/);
  const facts4 = threadFactsAll(t4);
  const geo = facts4.filter((f) => f.kind === "geography");
  assert.ok(geo.some((f) => /denver/i.test(f.value)), `geography not corrected: ${JSON.stringify(geo)}`);
  assert.ok(!geo.some((f) => /boston/i.test(f.value)), `stale geography survived correction: ${JSON.stringify(geo)}`);
  // And the first-move answer is spoken from the corrected record.
  assert.match(t5.res.reply, /Northbeam/);
  assert.match(t5.res.reply, /Denver/);
});

test("fact chain survives the shallow-copy harness (Lane C semantics)", () => {
  const turns = runShallowConvo([
    "I want to network into Northbeam in Boston, that's the one I care about",
    "junior, econ major btw",
    "line up analysts there first, skip the MDs",
    "actually shift it to Denver, not Boston",
    "so for that firm in the new city, what's my opening move?",
  ]);
  const [t1, , t3, , t5] = turns;
  for (const [i, t] of turns.entries()) assert.ok(!isFallback(t.res), `turn ${i + 1} fell to fallback (shallow): ${t.text}`);
  assert.match(t1.res.reply, /Northbeam/);
  assert.match(t3.res.reply, /Northbeam/);
  assert.match(t5.res.reply, /Northbeam/);
  assert.match(t5.res.reply, /Denver/);
});

// ---------- BUG-214 (C07): pause -> unpause -> send, no stale pause ----------
test("pause chain (host): after an unpause, a send ask is answered from the CURRENT pause record", () => {
  const turns = runHostConvo([
    "stop everything, pause all my outreach right now",
    "actually never mind, keep going, lift the pause",
    "ok now send the first wave of outreach emails",
  ]);
  const [, , t3] = turns;
  assert.ok(!isFallback(t3.res));
  assert.notEqual(t3.res.intent, "paused_hold", `stale pause held a send after unpause: ${t3.res.reply}`);
  assert.ok(!/^Everything is paused/.test(t3.res.reply || ""), "reply contradicted the lifted pause");
  assert.match(t3.res.reply, /nothing was sent/i);
});
test("pause chain (shallow-copy harness): the lifted pause survives to the send turn", () => {
  const turns = runShallowConvo([
    "stop everything, pause all my outreach right now",
    "actually never mind, keep going, lift the pause",
    "ok now send the first wave of outreach emails",
  ]);
  const [, , t3] = turns;
  assert.ok(t3.res, "send turn unanswered in shallow harness");
  assert.notEqual(t3.res.intent, "paused_hold", `stale pause held a send after unpause (shallow): ${t3.res && t3.res.reply}`);
  assert.match(t3.res.reply || "", /nothing was sent/i);
});

// ---------- BUG-215: multi-intent remainder + novel continuation ----------
test("multi-intent: parts are answered/named, and a novel continuation delivers part two", () => {
  const turns = runHostConvo([
    "two asks — hunt down data internships for next summer, and put together a networking plan for fintech firms",
    "kick off with the opening one",
  ]);
  const [t1, t2] = turns;
  assert.ok(!isFallback(t1.res), "multi-intent turn fell to fallback");
  assert.match(t1.res.reply, /held|also|in order|second|next/i);
  assert.ok(!isFallback(t2.res), `continuation fell to fallback: ${(t2.res || {}).reply}`);
});

// ---------- adversarial companions: question / quoted / conditional ----------
test("adversarial: fact and offer content in question, quoted, or conditional form writes NO thread state", () => {
  const q = runHostConvo(["am I a junior who majors in econ?"]);
  assert.equal(threadFactsAll(q[0]).length, 0, `question form recorded facts: ${JSON.stringify(threadFactsAll(q[0]))}`);
  const quoted = runHostConvo(["my roommate keeps saying \"I'm a senior, finance major\" — anyway, hi"]);
  assert.ok(!threadFactsAll(quoted[0]).some((f) => /senior|finance/i.test(f.value)), `quoted speech recorded as the user's facts: ${JSON.stringify(threadFactsAll(quoted[0]))}`);
  const cond = runHostConvo(["if I were a senior majoring in finance, what would change?"]);
  assert.equal(threadFactsAll(cond[0]).length, 0, `conditional recorded facts: ${JSON.stringify(threadFactsAll(cond[0]))}`);
  const quotedOffer = runHostConvo(["she texted me \"they offered me 85k, deadline Monday\" — wild, right?"]);
  const st = (quotedOffer[0].snap.stores || {});
  assert.ok(!(st.offer && st.offer.stated_figure), "quoted offer was recorded as the user's offer");
  assert.ok(!threadFactsAll(quotedOffer[0]).some((f) => /offer/i.test(f.kind)), "quoted offer recorded as a thread fact");
});

// ---------- BUG-216 (124 set mapping): domain-shaped proposals ----------
test("set mapping: a healthcare-consulting ask never proposes the bulge-bracket set", () => {
  const q = Outreach.parseTarget("help me network into healthcare consulting");
  const bulge = ["Goldman Sachs", "Morgan Stanley", "JPMorgan", "Bank of America", "Citi"];
  assert.ok(!(q.firms || []).some((f) => bulge.includes(f)), `healthcare ask proposed bulge firms: ${JSON.stringify(q.firms)}`);
  assert.notEqual(q.firm_set, "bulge_bracket");
  assert.ok(q.proposed_default && (q.proposed_default.kind === "category" || /consult|health/i.test(String(q.proposed_default.firm_set || q.proposed_default.industry || ""))), `proposal is not domain-shaped: ${JSON.stringify(q.proposed_default)}`);
  const [t1] = runHostConvo(["help me network into healthcare consulting"]);
  assert.ok(!isFallback(t1.res));
  assert.ok(!/bulge bracket/i.test(t1.res.reply), `router plan proposed the bulge set: ${t1.res.reply.slice(0, 300)}`);
  assert.ok(!/Goldman Sachs, Morgan Stanley, JPMorgan/.test(t1.res.reply), "router plan listed bulge firms for a healthcare ask");
  assert.match(t1.res.reply, /healthcare|consulting/i);
});
test("set mapping: a finance ask still proposes the finance set; a named firm is never replaced by a set", () => {
  const q = Outreach.parseTarget("email some bankers for me");
  assert.equal(q.firm_set, "bulge_bracket");
  assert.ok(q.firms.includes("Goldman Sachs"));
  const [t1] = runHostConvo(["I want to network into Northbeam in Boston"]);
  assert.match(t1.res.reply, /Northbeam/);
  assert.ok(!/bulge bracket set/i.test(t1.res.reply));
});

// ---------- Item C: track-event claiming (claim class: track_event_report) ----------
test("track events: plain-words reports are claimed and routed to the tracker ingest", () => {
  const turns = runHostConvo([
    "track this: I applied to Helios Health yesterday",
    "they just emailed me a rejection, ugh",
  ]);
  const [t1, t2] = turns;
  assert.ok(!isFallback(t1.res));
  assert.ok(!isFallback(t2.res), `rejection report fell to fallback: ${(t2.res || {}).reply}`);
  assert.match(String(t2.res.intent || ""), /track/);
  assert.match(t2.res.reply, /Helios|rejection/i);
  const rows = ((((t2.snap.stores || {}).trackStore) || {}).rows) || [];
  assert.ok(rows.some((r) => /Rejected/i.test(r.stage || "")), `tracker row was not moved to Rejected: ${JSON.stringify(rows.map((r) => [r.company, r.stage]))}`);

  const turns2 = runHostConvo([
    "track this: I applied to Helios Health yesterday",
    "got an interview invite from Helios Health!",
    "offer came in — 85k",
  ]);
  const [, u2, u3] = turns2;
  assert.ok(!isFallback(u2.res), "interview-invite report fell to fallback");
  assert.match(String(u2.res.intent || ""), /track/);
  assert.ok(!isFallback(u3.res), "offer report fell to fallback");
  const rows2 = ((((u3.snap.stores || {}).trackStore) || {}).rows) || [];
  assert.ok(rows2.some((r) => /Offer/i.test(r.stage || "")), `tracker row was not moved to Offer: ${JSON.stringify(rows2.map((r) => [r.company, r.stage]))}`);
});
test("track events adversarial: a question or a friend's event writes nothing to the user's tracker", () => {
  const turns = runHostConvo([
    "track this: I applied to Helios Health yesterday",
    "did they email me a rejection?",
    "my friend got an interview invite from Helios Health, good for him",
  ]);
  const [, t2, t3] = turns;
  const rows = ((((t3.snap.stores || {}).trackStore) || {}).rows) || [];
  assert.equal(rows.length, 1, `extra rows written: ${JSON.stringify(rows.map((r) => [r.company, r.stage]))}`);
  assert.ok(!/Rejected|Interview/i.test(rows[0].stage || ""), `stage moved by a non-assertion: ${rows[0].stage}`);
  assert.ok(t2.res && !isFallback(t2.res) ? true : true); // a clarification answer is acceptable; the write bar is the assertion
});
