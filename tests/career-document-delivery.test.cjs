/* CHANNEL-DOC-1 guard (BUG / FR — PENDING-ALLOCATION per MI-093) —
   DOCUMENT DELIVERY IN CHAT. Measured on the 1,000-execution channel
   battery (2026-10-19, commit 75ccf5f5 = live v238), executions
   CB-0495 / CB-0496 / CB-0497 (both surfaces):

     "tailor my resume for the New Grad Software Engineer role at
      Northwind Ledger (fictional) and send me the PDF as a file in
      this chat"

   was answered by the OUTREACH clarification route — "Nothing was
   sent — here is exactly where it stands. Nothing is built in this
   conversation to send: no list, no draft, no approved plan — so
   there is no wave that could go out…" — and no file could ever
   arrive, because (a) handleSendAttempt's gate (`send` … `this`)
   claims any ask whose delivery phrase ends in "this chat", and
   (b) the reply contract carried no document at all.

   The fix (142, three parts):
   1. A document-delivery predicate: an ask that names a document
      (resume / cv / cover letter / packet / brief / pdf / docx /
      file) AND asks for it delivered to the user in this conversation
      ("send me", "give me", "in this chat", "here") is a document
      ask, never a campaign send. A send to a THIRD PARTY ("send my
      resume to the recruiter") is not claimed.
   2. handleSendAttempt stands down for document-delivery asks, so
      the tailor+deliver shape reaches the tailor branch and the
      produced document rides the turn result.
   3. handleDocumentDelivery owns the pure-delivery ask: the latest
      byte-carrying tailored artifact on the thread is returned as
      the result's `documents` (the agent-chat handler materializes
      them into the reply's artifacts[] — see
      supabase/functions/_shared/channel_artifacts.ts); when no
      document exists on the thread, the answer says exactly that,
      in product voice, and offers to tailor one — it never claims
      an attachment and never speaks outreach-wave language.

   This guard runs the DEPLOYED path — the real CareerHost with the
   real chain modules — with the thread snapshot seeded exactly the
   way the committed record stands (profile + a staged posting on
   the snapshot stores), and asserts on the turn results.
   Check: node --test tests/career-document-delivery.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const Profile = D("122-career-profile.js");

const NOW = Date.parse("2026-10-20T14:00:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const JD = "New Grad Software Engineer at Northwind Ledger (TEST posting)\nRequired: Python, JavaScript, React, SQL, PostgreSQL, Git.\nNice to have: Kubernetes, Docker, AWS.\nYou will build APIs and deploy services.";
const POSTING = { id: "nw-ledger-1", corpus_id: "nw-ledger-1", title: "New Grad Software Engineer", company: "Northwind Ledger", jd_text: JD, source: "fixture" };

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
function makeWorld() {
  const host = makeHost();
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: o.postings || [] });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist`);
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return { out, ctx, snap };
  };
  const persona = () => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(ROOT, "packages", "career-data", "fixtures", "test-persona.json"), "utf8")));
  const seedThread = (userId, threadId, withPosting) => {
    const stores = { profile: clone(persona()) };
    if (withPosting) stores.posting = clone(POSTING);
    store.threads.set(threadId, { v: 1, scope: { userId }, stores });
  };
  return { host, store, say, seedThread };
}

// The byte-carrying document a turn result offers for delivery: the
// delivery handler's own `documents`, or the tailor artifact's PDF
// (the shape the agent-chat handler materializes into artifacts[]).
function turnDocuments(out) {
  const r = (out && out.result) || {};
  if (Array.isArray(r.documents) && r.documents.length) return r.documents;
  if (r.artifact && r.artifact.pdf && r.artifact.pdf.base64) return [r.artifact.pdf];
  return [];
}

test("CHANNEL-DOC-1: CB-0495 verbatim — tailor + 'send me the PDF in this chat' is NOT an outreach send; the document rides the turn", () => {
  const w = makeWorld();
  const u = "u-doc-cb0495";
  w.seedThread(u, "t1", true);
  const r = w.say(u, "t1", "tailor my resume for the New Grad Software Engineer role at Northwind Ledger (fictional) and send me the PDF as a file in this chat");
  assert.notEqual(r.out.intent, "outreach_clarification", `the ask must not land on the outreach route (reply: ${r.out.reply})`);
  assert.ok(!/Nothing was sent/.test(r.out.reply), `no outreach wave language in the reply (reply: ${r.out.reply})`);
  assert.ok(!/no wave/.test(r.out.reply), `no wave framing in the reply (reply: ${r.out.reply})`);
  const docs = turnDocuments(r.out);
  assert.equal(docs.length, 1, `exactly one document rides the turn (result: ${JSON.stringify(Object.keys(r.out.result || {}))})`);
  const buf = Buffer.from(docs[0].base64, "base64");
  assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-", "the document is a real PDF, bytes verified");
  assert.equal(docs[0].filename, "Alex_Testcase_Resume.pdf", "R8 filename from the persona's name");
  assert.equal(docs[0].sha256, sha256(buf), "the carried hash is the bytes' own hash");
});

test("CHANNEL-DOC-1: pure delivery ask after tailoring serves the SAME document again", () => {
  const w = makeWorld();
  const u = "u-doc-resend";
  w.seedThread(u, "t1", true);
  const r1 = w.say(u, "t1", "tailor my resume for this role");
  const first = turnDocuments(r1.out);
  assert.equal(first.length, 1, "precondition: the tailor turn produced a document");
  const r2 = w.say(u, "t1", "send me the PDF as a file in this chat");
  assert.equal(r2.out.intent, "career_document_delivery", `the delivery ask is owned by the document route (intent: ${r2.out.intent})`);
  assert.ok(!/Nothing was sent|no wave/.test(r2.out.reply), `no outreach language (reply: ${r2.out.reply})`);
  const docs = turnDocuments(r2.out);
  assert.equal(docs.length, 1, "the stored document rides the delivery turn");
  assert.equal(docs[0].sha256, first[0].sha256, "the SAME document — identical bytes, not a re-tailor");
  assert.match(r2.out.reply, /Alex_Testcase_Resume\.pdf/, "the reply names the file that rides with it");
});

test("CHANNEL-DOC-1: a delivery ask with NO document on the thread says so — no attachment claimed, no wave language", () => {
  const w = makeWorld();
  const u = "u-doc-none";
  w.seedThread(u, "t1", false);
  const r = w.say(u, "t1", "send me the PDF in this chat");
  assert.equal(r.out.intent, "career_document_delivery", `owned by the document route (intent: ${r.out.intent})`);
  assert.equal(turnDocuments(r.out).length, 0, "no document is offered — none exists");
  assert.ok(!/attached/.test(r.out.reply), `no attachment is claimed (reply: ${r.out.reply})`);
  assert.ok(!/Nothing was sent|no wave/.test(r.out.reply), `no outreach language (reply: ${r.out.reply})`);
  assert.match(r.out.reply, /no (document|file|resume)/i, "the reply names the missing document plainly");
  assert.match(r.out.reply, /tailor/i, "and offers the step that creates one");
});

test("CHANNEL-DOC-1: a send to a THIRD PARTY is not a document-delivery ask", () => {
  const w = makeWorld();
  const u = "u-doc-third";
  w.seedThread(u, "t1", true);
  const t1 = w.say(u, "t1", "tailor my resume for this role");
  assert.equal(turnDocuments(t1.out).length, 1, "precondition: document exists");
  const r = w.say(u, "t1", "send my resume to the recruiter at Northwind Ledger");
  assert.notEqual(r.out.intent, "career_document_delivery", `a third-party send is never claimed by the delivery route (intent: ${r.out.intent})`);
});

test("CHANNEL-DOC-1: a NAMED recipient is a third party — 'send Alex my resume' stays the outreach draft path (gauntlet C23 shape)", () => {
  const w = makeWorld();
  const u = "u-doc-named";
  w.seedThread(u, "t1", true);
  const t1 = w.say(u, "t1", "tailor my resume for this role");
  assert.equal(turnDocuments(t1.out).length, 1, "precondition: document exists on the thread — the worst case for a false claim");
  const r = w.say(u, "t1", "send Alex my resume");
  assert.notEqual(r.out.intent, "career_document_delivery", `a named-recipient send is never claimed by the delivery route (intent: ${r.out.intent})`);
  const r2 = w.say(u, "t1", "send my resume to Alex");
  assert.notEqual(r2.out.intent, "career_document_delivery", `a to-a-name send is never claimed either (intent: ${r2.out.intent})`);
});

test("CHANNEL-DOC-1: the campaign send path is untouched — a wave send attempt still gets the approval-gate answer", () => {
  const w = makeWorld();
  const u = "u-doc-wave";
  w.seedThread(u, "t1", false);
  w.say(u, "t1", "Help me network into healthcare consulting");
  const r = w.say(u, "t1", "send the first wave");
  assert.equal(r.out.intent, "outreach_clarification", `the wave ask still belongs to the send gate (intent: ${r.out.intent})`);
  assert.match(r.out.reply, /Nothing was sent/, "the gate's answer is unchanged");
});
