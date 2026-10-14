// IB-AP INTEGRATION TESTS (Apply family integrator briefs IB-AP-1..10,
// docs/career/gauntlet-ledger.md @ 5b4c0c3) — FAIL-FIRST, written against
// HEAD ce2529b + tree by the ready-to-land lane. The integrator (sole
// editor of 140/142) lands the patches specified in
// ~/workspace/your_files/integrator-packs/ib-apply-pack.md; each test
// below names its brief and flips green when that patch lands. Per the
// owner's bug law, these tests stay in the suite forever as the replay
// guards for the defects they name.
//
// Drives the staging chat path (pilot-lib chatTurn: 143 -> 120 -> 130 ->
// 142 -> 141, replies composed by 140) exactly as the graders do.
//
// RED STATE AT WRITE TIME (recorded in the lane report): 5 red / 1 green.
//  - IB-AP-1, IB-AP-4, IB-AP-2/SC-116, IB-AP-8/SC-081: red — the seams do
//    not exist in 142 yet (doorstep null, packet.document dropped, the
//    34-row log never read, the portal ask captured by the campaign
//    matcher). All reproduced live before this file was written.
//  - IB-AP-3 / SC-087 (Stripe): red BY DESIGN — verified against the
//    retrieved board data, Stripe holds NO SWE posting (3 operations
//    roles only; snapshot greenhouse-stripe-7584016 is "Campaign
//    Strategy & Operations Manager"). The test goes green only when a
//    real retrieved Stripe SWE posting enters the fixture board. It
//    must NEVER be made green by tailoring against another kind of
//    role or an invented JD (the SC-111 disease).
//  - IB-AP-3 anchor (Ramp): GREEN at write time — the named-fixture
//    seam landed in ce2529b; this test is the harness-validity anchor
//    and the regression guard for that half of IB-AP-3.
//
// Check: node --test tests/career-ibap-integration.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-ibap-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-ibap-evidence";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const H = L.H;
const Apply3 = require(path.join(ROOT, "packages/domain/132-career-apply3.js"));

function drive(id, ask, ctxExtra) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "ibap-integration");
  const ctx = Object.assign({ profile }, ctxExtra || {});
  const turn = L.chatTurn(s, ask, ctx);
  return { turn, result: turn.result || {}, text: (turn.delivered || []).join("\n") };
}

// IB-AP-1: an auto-apply ask must DRIVE the chain to a doorstep — the
// typed result carries 141's doorstep record (driven_by "agent",
// gap null, state AWAITING_COMMIT) and its payload. Today SC-061 gets
// discovery prose with doorstep === null (STATE_doorstep_gap on all
// 49 Apply fails).
test("IB-AP-1: auto-apply ask reaches a doorstep payload (SC-061)", () => {
  const { result, text } = drive("SC-061", "Adjust my resume and auto apply (tailor per role; apply under my rule)");
  assert.ok(result.doorstep, `expected a 141 doorstep record on the typed result; got intent=${result.intent}, reply: ${text.slice(0, 160)}`);
  assert.equal(result.doorstep.driven_by, "agent", "the agent drove the seam — driven_by must not be \"gap\"");
  assert.equal(result.doorstep.gap, null, "a completed doorstep record carries gap: null");
  assert.notEqual(result.doorstep.committed, true, "the doorstep never commits on the ask turn");
  assert.ok(result.payload || result.doorstep.payload, "the doorstep payload rides the typed result, not only the prose");
  assert.equal(result.resultStatus, "prepared");
});

// IB-AP-3: a named-company tailor ask resolves that company's posting
// from the retrieved board fixtures and produces the tailored artifact.
// Stripe's retrieved board currently holds no SWE posting (see header)
// — red until the data lands; never to be forced.
test("IB-AP-3: 'tailor for Stripe SWE' produces a tailored artifact (SC-087)", () => {
  const { result, text } = drive("SC-087", "Tailor for Stripe SWE — lead with writing, craft, product-minded proof");
  assert.ok(result.artifact, `expected a tailored artifact; got intent=${result.intent}, reply: ${text.slice(0, 160)}`);
  assert.equal(result.artifact.kind, "tailored_resume");
  assert.equal(result.artifact.company, "Stripe");
});

// IB-AP-3 anchor (already landed in ce2529b): the same seam against a
// board that genuinely holds the named kind of role — Ramp, Software
// Engineer, Frontend. Green at write time; guards the landed half.
test("IB-AP-3 anchor: 'tailor for Ramp frontend' produces a tailored artifact (SC-093 shape)", () => {
  const { result } = drive("SC-093", "Tailor for Ramp — software engineer, frontend");
  assert.ok(result.artifact, `expected a tailored artifact; got intent=${result.intent}`);
  assert.equal(result.artifact.kind, "tailored_resume");
  assert.equal(result.artifact.company, "Ramp");
});

// IB-AP-4: a packet ask must reach 133's assemblePacket and the typed
// packet must carry its document (the real PDF/DOCX filenames + the
// parse-check status). Today handlePacket shapes its own packet object
// and drops pkt.document (packet.document === null).
test("IB-AP-4: packet ask produces packet.document (SC-102 shape)", () => {
  const { result, text } = drive("SC-102", "Prepare my application packet for the backend role");
  assert.ok(result.packet, `expected a typed packet; got intent=${result.intent}, reply: ${text.slice(0, 160)}`);
  assert.ok(result.packet.document, "packet.document must ride the typed packet (133 assemblePacket returns it; 142 must not drop it)");
  assert.match(String(result.packet.document.pdf || ""), /\.pdf$/, "document.pdf names the rendered PDF file");
  assert.match(String(result.packet.document.docx || ""), /\.docx$/, "document.docx names the rendered DOCX file");
  assert.ok(result.packet.document.parseCheck != null, "document.parseCheck carries the §2.5 parse-check status");
  assert.equal(result.packet.submitted, false, "a packet is a review copy — never submitted on the ask turn");
});

// IB-AP-2 / IB-AP-8 (SC-116): the autopsy ask must be answered FROM
// the application log + inbox in ctx — 132-apply3.rejectionAutopsy
// over the 34-row TEST fixture — with the typed autopsy on the result
// and the counts in the reply. Today handleFunnel reads the (empty)
// 126 session store and pleads insufficient data.
test("IB-AP-2/SC-116: rejection autopsy answered from the 34-row log", () => {
  const log = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-application-log.json"), "utf8"));
  const inbox = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-inbox.json"), "utf8"));
  assert.equal((log.applications || []).length, 34, "fixture sanity: the TEST log holds 34 rows");
  const expected = Apply3.rejectionAutopsy(log, inbox);
  const { result, text } = drive("SC-116", "Rejection autopsy across 34 applications: the pattern, the plan, no sugarcoating", { applyLog: log, applicationLog: log, inbox });
  assert.ok(result.autopsy, `expected the typed autopsy on the result; got intent=${result.intent}, reply: ${text.slice(0, 160)}`);
  assert.deepEqual(result.autopsy, expected, "the chat answer must be the producer's own computation over the seeded log + inbox");
  assert.match(text, /34/, "the reply states the real total from the log");
  assert.match(text, new RegExp(String(expected.rejected)), "the reply states the real rejected count from the log");
});

// IB-AP-8 (SC-081): a portal-account ask must NOT be captured by the
// outreach campaign matcher (today it returns handleCampaignPlan's
// "plan for 40 people" as outreach_clarification). The governed shape:
// intent portal_account, vault-only password handling named in the
// reply, nothing created on the bare ask, and no raw password value
// anywhere in the typed result.
test("IB-AP-8: portal-account ask gets the governed portal answer, never the outreach plan (SC-081)", () => {
  const { result, text } = drive("SC-081", "Workday portal needs an account — create alias email + vault password, disclose it to me");
  assert.ok(!/plan for 40 people/i.test(text), `the outreach campaign plan must never answer a portal-account ask; reply: ${text.slice(0, 160)}`);
  assert.notEqual(result.intent, "outreach_clarification", "the campaign clarification intent must not own this turn");
  assert.ok(result.intent === "portal_account" || result.portal_account, `expected the portal_account shape; got intent=${result.intent}`);
  assert.match(text, /vault/i, "the reply names the vault-only password handling");
  const walk = (v, key) => {
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (key === "password") assert.ok(/vault/i.test(String(v)), "a password field may only ever carry vault language, never a value");
  };
  walk(result, null);
});
