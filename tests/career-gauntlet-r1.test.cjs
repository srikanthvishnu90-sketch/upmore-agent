// REPAIR LANE R1 (career chat routing) — regression tests.
// Drive the gauntlet pilot cases' ACTUAL user turns through the staging chat
// path (scripts/career/gauntlet/pilot-lib.cjs chatTurn: 120 -> 130 -> router)
// exactly as the frozen pilot runner does, including the case-context /
// case-setup tool records the runner seeds into the session. On the
// pre-repair build (ba708c1) every routed case returns null (silence), so
// these tests FAIL there; the R1 router (142-career-router.js) makes them pass.
// Check: node --test tests/career-gauntlet-r1.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-r1-test-harness";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const H = L.H;
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const corpus = L.loadJson(path.join(L.GAUNTLET, "jobs/scored-corpus.json"));
const joined = (turn) => (turn.delivered || []).join("\n");

// ---------------------------------------------------------------- C01
test("R1 C01: sloppy internship ask routes to discovery using the on-file profile", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session("C01", "r1-c01");
  const turn = L.chatTurn(s, "yo need a swe internship next summer chicago or remote can u help", { profile });
  assert.ok(turn.handler, "a handler must answer (pre-repair: both returned null)");
  assert.ok(turn.delivered.length >= 1, "a reply bubble must be delivered");
  const text = joined(turn);
  assert.match(text, /Summer 2027/, "'next summer' resolves against the Oct 2026 clock as Summer 2027");
  assert.doesNotMatch(text, /what is your graduation|when do you graduate|work authorization/i, "known profile facts are not re-asked");
  assert.ok(turn.result && Array.isArray(turn.result.shortlist) && turn.result.shortlist.length >= 1, "discovery produces a shortlist");
  for (const item of turn.result.shortlist) {
    assert.ok(["GJ-S01", "GJ-S02", "GJ-S03", "GJ-T03"].includes(item.id), `C01 shortlist item ${item.id} is a Chicago/remote intern-or-new-grad SWE role`);
  }
});

// ---------------------------------------------------------------- C05
test("R1 C05: 'find 5 roles' returns a fit-ranked shortlist of 5 with reasons + caveats, deduped, no closed role", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session("C05", "r1-c05");
  const turn = L.chatTurn(s, "find 5 roles worth applying to, not random stuff", { profile });
  assert.ok(turn.handler, "a handler must answer");
  assert.ok(turn.delivered.length >= 1, "a reply bubble must be delivered");
  const r = turn.result;
  assert.ok(r && Array.isArray(r.shortlist), "result carries a shortlist");
  assert.equal(r.shortlist.length, 5, "exactly 5 roles delivered");
  const eligible = new Set(["GJ-S01", "GJ-S02", "GJ-S03", "GJ-T01", "GJ-T02", "GJ-T03"]);
  for (const item of r.shortlist) {
    assert.ok(eligible.has(item.id), `precision: ${item.id} is suitable/tradeoff ground truth, not an exclusion or trap`);
    assert.ok(item.reason && item.reason.length > 3, `${item.id} carries a reason`);
    assert.ok(item.caveat != null && String(item.caveat).length > 0, `${item.id} carries its caveat/tradeoff`);
  }
  const rankedIds = (r.ranked || []).map((x) => x.id || x);
  assert.ok(!rankedIds.includes("GJ-X01"), "closed role GJ-X01 (deadline passed) is never presented");
  const mirror = rankedIds.filter((id) => id === "GJ-X02" || id === "GJ-X03");
  assert.ok(mirror.length <= 1, "mirror pair GJ-X02/GJ-X03 deduped to a single entry");
});

// ---------------------------------------------------------------- C11
test("R1 C11: 'tailor my resume to this' produces a saved artifact, no added skills, gap named", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const posting = corpus.postings.find((p) => p.id === "GJ-T03");
  const s = H.session("C11", "r1-c11");
  s.tool("case-context", { posting_id: "GJ-T03", title: posting.title, company: posting.company, requirements: posting.requirements });
  const turn = L.chatTurn(s, "tailor my resume to this", { profile });
  assert.ok(turn.handler, "a handler must answer");
  assert.ok(turn.delivered.length >= 1, "a reply bubble must be delivered");
  const art = turn.result && turn.result.artifact;
  assert.ok(art && typeof art.text === "string" && art.text.length > 50, "a tailored artifact is produced");
  assert.equal(art.sha256, sha256(Buffer.from(art.text)), "artifact sha256 is the hash of the artifact bytes");
  assert.ok(art.pdf && typeof art.pdf === "object" && art.pdf.base64, "CA-02: a real document artifact rides the chat artifact (148-career-render) — a claimed PDF must be bytes, not a label");
  const pdfBytes = Buffer.from(art.pdf.base64, "base64");
  assert.equal(pdfBytes.subarray(0, 5).toString("latin1"), "%PDF-", "the claimed PDF decodes to a real PDF file");
  assert.equal(art.pdf.sha256, sha256(pdfBytes), "artifact pdf sha256 is the hash of the PDF bytes");
  assert.doesNotMatch(art.text, /\bJava\b/, "Java is NOT added (no Java fact on the profile)");
  assert.doesNotMatch(art.text.split("\n").filter((l) => /^(Python|SQL|Go|Java)/.test(l)).join("\n"), /\bGo\b/, "Go is not claimed in the skills line");
  assert.match(art.text, /Python/, "evidenced skills are present");
  assert.match(joined(turn), /\bGo\b/, "the preferred-not-required skill gap (Go) is named to the user");
});

// ---------------------------------------------------------------- C15
test("R1 C15: packet prep binds the BACKEND resume.pdf record by sha256 and shows a review surface", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const backendText = "Maya Rivera (TEST) — tailored for Backend Engineer, TEST Company\nPython, SQL, Flask, SQLite. StudyBoard scheduler. SWE Intern, TEST Systems Inc, Jun-Aug 2026.\nVERSION: BACKEND\n";
  const dataText = "Maya Rivera (TEST) — tailored for Data Engineer, TEST Company\nPython, SQL, ETL fundamentals. StudyBoard scheduler. SWE Intern, TEST Systems Inc, Jun-Aug 2026.\nVERSION: DATA\n";
  const backendSha = sha256(Buffer.from(backendText)), dataSha = sha256(Buffer.from(dataText));
  const s = H.session("C15", "r1-c15");
  s.tool("case-setup", { records: [{ record: "backend application materials", file: "resume.pdf", sha256: backendSha }, { record: "data application materials", file: "resume.pdf", sha256: dataSha }] });
  const turn = L.chatTurn(s, "prep the backend application using the backend version", { profile });
  assert.ok(turn.handler, "a handler must answer");
  assert.ok(turn.delivered.length >= 1, "a reply bubble must be delivered");
  const pkt = turn.result && turn.result.packet;
  assert.ok(pkt && pkt.ok, "a packet is assembled through 133");
  assert.ok(pkt.artifactBinding, "packet carries an artifact binding");
  assert.equal(pkt.artifactBinding.sha256, backendSha, "the packet binds the BACKEND artifact (sha256 match)");
  assert.notEqual(pkt.artifactBinding.sha256, dataSha, "the data version is not bound");
  const text = joined(turn);
  assert.match(text, /backend/i, "review surface names the backend job/version");
  assert.match(text, /resume\.pdf/, "review surface shows the document identity");
  assert.match(text, /not submitted|nothing is submitted/i, "review surface states it is not submitted");
});

// ---------------------------------------------------------------- C23
test("R1 C23: 'send Alex my resume' with two Alexes = ONE batched clarification, zero sends", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const contacts = L.loadJson(path.join(ROOT, "scripts/career/gauntlet/cases/fixtures/c23-contacts.json"));
  const s = H.session("C23", "r1-c23");
  s.tool("case-setup", contacts);
  const turn = L.chatTurn(s, "send Alex my resume", { profile });
  assert.ok(turn.handler, "a handler must answer");
  assert.ok(turn.delivered.length >= 1, "a clarification bubble must be delivered");
  const r = turn.result;
  assert.equal(r.intent, "outreach_clarification", "the turn resolves to a clarification, not a send");
  assert.equal(r.clarifications, 1, "exactly one batched clarification");
  assert.deepEqual([...(r.missing || [])].sort(), ["account", "attachment", "purpose", "recipient"], "the clarification covers recipient + account + purpose + attachment");
  assert.equal(r.sends, 0, "zero outbound messages");
  assert.ok(!r.draft, "no draft is composed for an unresolved recipient");
  const text = joined(turn);
  assert.match(text, /Alex/, "the clarification names the ambiguous recipient");
  assert.doesNotMatch(text, /sent|submitted/i, "nothing claims a send happened");
});

test("R1 C23 draft path: a unique recipient with account + purpose + version drafts via 124, still zero sends", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session("C23", "r1-c23-draft");
  const ctx = {
    profile,
    contacts: [{ name: "Alex Morgan", kind: "personal", email: "alex.morgan@example.test", relationship: "friend" }],
    sendingAccounts: [{ kind: "personal", email: "maya.rivera@example.test", connected: true }],
    outreach: { purpose: "ask for a referral to the backend role", attachmentVersion: "backend version" },
  };
  const turn = L.chatTurn(s, "send Alex my resume", ctx);
  assert.ok(turn.handler, "a handler must answer");
  const r = turn.result;
  assert.equal(r.intent, "outreach_draft", "unique recipient + resolved details reaches the draft path");
  assert.ok(r.draft && r.draft.body && r.draft.subject, "124 draftFor composed a draft");
  assert.equal(r.sends, 0, "draft path never sends");
  assert.match(joined(turn), /not sent|nothing.*sent/i, "the reply states the draft was not sent");
});

// ---------------------------------------------------------------- C31
test("R1 C31: mock interview starts, follows up on the actual answers, flags a profile contradiction, invites a retry", () => {
  const profile = L.gauntletProfile("p3-career-switcher");
  const role = corpus.postings.find((p) => p.id === "GJ-S04");
  const s = H.session("C31", "r1-c31");
  s.tool("case-context", { role_id: "GJ-S04", title: role.title, company: role.company, requirements: role.requirements });

  const open = L.chatTurn(s, "mock interview me for this role, one question at a time", { profile });
  assert.ok(open.handler, "opening turn must be answered");
  assert.ok(open.delivered.length >= 1, "a first question must be delivered");
  assert.match(joined(open), /tell me about yourself|why this role/i, "the first mock question is asked");

  const a = L.chatTurn(s, "I did lots of stuff with data and helped the team a bunch, it went pretty well.", { profile });
  assert.ok(a.delivered.length >= 1, "the vague answer gets a follow-up");
  const aText = joined(a);
  assert.match(aText, /structure|evidence|specific/i, "follow-up carries rubric feedback");
  assert.match(aText, /data|team/, "follow-up responds to the answer's actual content (data / team)");

  const b = L.chatTurn(s, "In my last data engineering job I built production Airflow pipelines for two years.", { profile });
  assert.ok(b.delivered.length >= 1, "the contradicting answer gets a follow-up");
  assert.match(joined(b), /not on your profile|does not match|no paid data|never had/i, "the contradiction with the profile is flagged");

  const c = L.chatTurn(s, "i don't know", { profile });
  assert.ok(c.delivered.length >= 1, "'i don't know' gets a response");
  const cText = joined(c);
  assert.match(cText, /try|again|another go|retry/i, "a second attempt is invited");
  assert.doesNotMatch(cText, /you built production|your data engineering job at/i, "no invented personal story is supplied");
});

// ------------------------------------------------------- discovery extras
test("R1 discovery: a dead-registry board (Goldman Sachs) is named as unavailable, never presented as live", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session("U12", "r1-dead-board");
  const turn = L.chatTurn(s, "find me roles at Goldman Sachs", { profile });
  assert.ok(turn.handler, "a handler must answer");
  assert.match(joined(turn), /Goldman/, "the reply names the company");
  assert.match(joined(turn), /no public|not available|can't pull|no live|does not publish/i, "the reply states the board problem plainly");
});

test("R1 router: the 140 sha256 helper matches node crypto", () => {
  const Router = require(path.join(ROOT, "packages/domain/142-career-router.js"));
  assert.equal(typeof Router.handleChat, "function");
  assert.equal(Router.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(Router.sha256(""), crypto.createHash("sha256").update("").digest("hex"));
});
