"use strict";
/* SPLIT-1146 (2026-10-25): the four APPLICATION SUBMISSION chat
   families that remain in the router lane after the scope split.

   HOST SEAMS — STUBBED HERE ONLY. The real host signatures do not
   exist in this tree yet (Claude owns them on arch/submit-path). The
   assumed ctx seams, handed to the coordinator verbatim, are:

     ctx.writeSubmitRecord(request) -> receipt
       request = {
         userId, threadId, now,
         kind: "resume_approval" | "contact_capture" | "work_authorization",
         sourceText,                         // the person's exact words
         record: { ... },                    // family payload below
         binding?: { contentSha256, factIds } // resume_approval only
       }
       receipt = {
         ok, written, confirmed,
         writeId: string | null,
         confirmedFactIds?: string[],
         code?: string, reason?: string
       }

     ctx.readApplicationStatus(request) -> readback
       request = { userId, threadId, now, company: string | null }
       readback = {
         ok,
         rows: [{
           company, role,
           state: "prepared" | "queued" | "waiting" |
                  "submitted_confirmed" | "sent_unconfirmed" | "stopped",
           confirmation: { id, recordedAt } | null
         }],
         code?: string, reason?: string
       }

   No stub code lives in product files. Tests that assert a seam call
   are EXPECTED RED at 2d3b7977: the router does not call either seam
   yet. Tests marked ROUTER-SIDE pin the parts that can be completed
   in 142/155 today: presented-content binding for (a), no-false-
   "saved" wording for (c), and confirmation discipline against an
   existing batch row for (d).

   Fixtures are synthetic. Nothing submits; CAREER_AGENT_SUBMIT
   stays OFF; the approve-first.ts certification carrier stays HELD.
   Check: node --test tests/career-submit-split-1146.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const Portal = D("149-career-portal-apply.js");
const Batch = D("155-career-batch-apply.js");

const NOW = Date.parse("2026-10-25T16:46:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const RESUME_TEXT = fs.readFileSync(path.join(root, "packages/career-data/fixtures/test-resume.txt"), "utf8");
const RESUME_SHA256 = crypto.createHash("sha256").update(RESUME_TEXT).digest("hex");

const MASTER_BASE = {
  basics: {
    name: "Alex Testcase", location: "Chicago, IL",
    email: "alex.testcase@example.test", phone: "+1 000 555 0100",
    resumeFile: "alex-testcase-resume.pdf", resumeSha256: "a".repeat(64),
  },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago"], starredCompanies: [] },
};
const FULL_ANSWERS = {
  work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
  sponsorship: { value: "No", confirmed: true },
  cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
};
const ATTEST = { certify_true: { value: true, explicit: true } };

function writerStub(receipt) {
  const calls = [];
  const fn = (req) => {
    calls.push(clone(req));
    return typeof receipt === "function" ? receipt(clone(req), calls.length) : clone(receipt);
  };
  return { calls, fn };
}
function readerStub(readback) {
  const calls = [];
  const fn = (req) => {
    calls.push(clone(req));
    return typeof readback === "function" ? readback(clone(req), calls.length) : clone(readback);
  };
  return { calls, fn };
}

function makeWorld(opts) {
  const o = opts || {};
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const master = clone(MASTER_BASE);
  if (o.master) Object.assign(master, clone(o.master));
  const store = { threads: new Map() };
  const log = { records: [] };
  let n = 0;
  const say = (userId, text, extra) => {
    const ex = extra || {};
    n += 1;
    const threadId = `t-${userId}`;
    const snap = ex.snapshot !== undefined ? ex.snapshot : (store.threads.get(threadId) || null);
    const input = { userId, threadId, now: NOW + (ex.nowOffset != null ? ex.nowOffset : n * 60000), accountPersistence: true, snapshot: snap, account: {}, watchState: {}, postings: ex.postings || [] };
    if (!ex.omitProfile) input.profile = master;
    const ctx = host.createTurnCtx(input);
    if (o.writeSubmitRecord) ctx.writeSubmitRecord = o.writeSubmitRecord;
    if (o.readApplicationStatus) ctx.readApplicationStatus = o.readApplicationStatus;
    ctx.batchDeps = { log, boardFor: (p) => Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: p.atsFamily }), attestations: ATTEST };
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    return { out, ctx };
  };
  const snapshotOf = (userId) => store.threads.get(`t-${userId}`);
  const profileOf = (userId) => { const s = snapshotOf(userId); return s && s.stores ? s.stores.profile : null; };
  return { say, snapshotOf, profileOf, master, log };
}

function pasteResume(w, U) {
  const { out } = w.say(U, RESUME_TEXT, { nowOffset: 0 });
  assert.equal(out.intent, "career_resume_ingest", `setup: the paste is ingested (got ${out.intent}: ${String(out.reply || "").slice(0, 160)})`);
  const drafts = (w.profileOf(U).facts || []).filter((f) => f && f.source === "resume-ingest" && f.needs_confirmation);
  assert.ok(drafts.length >= 3, "setup: resume drafts stand awaiting the person's word");
  return drafts;
}

// ---------- (a) 'yes that's my resume' ----------

test("(a) the approval calls the host writer with the ACTUAL presented content binding", () => {
  const writer = writerStub((req) => ({ ok: true, written: true, confirmed: true, writeId: "write-resume-1", confirmedFactIds: req.binding.factIds.slice() }));
  const w = makeWorld({ writeSubmitRecord: writer.fn });
  const U = "split-a-writer";
  const drafts = pasteResume(w, U);
  const { out } = w.say(U, "Yes, that's my resume.", { nowOffset: 60000 });
  assert.equal(writer.calls.length, 1, "the router calls ctx.writeSubmitRecord exactly once for the approval");
  const req = writer.calls[0];
  assert.equal(req.kind, "resume_approval");
  assert.equal(req.sourceText, "Yes, that's my resume.", "the approval phrase itself rides the request verbatim");
  assert.equal(req.binding.contentSha256, RESUME_SHA256, "the binding is the hash of the resume content actually presented");
  assert.deepEqual(new Set(req.binding.factIds), new Set(drafts.map((f) => f.id)), "the binding names exactly the presented draft facts");
  assert.deepEqual(new Set(req.record.factIds), new Set(drafts.map((f) => f.id)));
  assert.match(out.reply, /Confirmed/, `a confirmed receipt may be spoken as confirmed: ${out.reply}`);
});

test("(a) when the host write is not confirmed, the approval claims nothing and the drafts stay drafts", () => {
  const writer = writerStub({ ok: false, written: false, confirmed: false, writeId: null, code: "HOST_WRITE_NOT_CONFIRMED", reason: "the host did not confirm the write" });
  const w = makeWorld({ writeSubmitRecord: writer.fn });
  const U = "split-a-failure";
  pasteResume(w, U);
  const { out } = w.say(U, "Yes, that's my resume.", { nowOffset: 60000 });
  assert.equal(writer.calls.length, 1, "the router calls ctx.writeSubmitRecord before claiming anything");
  assert.doesNotMatch(out.reply, /Confirmed —|facts are on your record|I saved/i, `no success wording rides an unconfirmed write: ${out.reply}`);
  assert.match(out.reply, /not confirmed|did not (go through|confirm)|could not confirm/i, `the reply says the write is unconfirmed: ${out.reply}`);
  const stillDrafts = (w.profileOf(U).facts || []).filter((f) => f && f.source === "resume-ingest" && f.needs_confirmation);
  assert.ok(stillDrafts.length >= 3, "the presented drafts remain drafts when the write is not confirmed");
});

test("(a) ROUTER-SIDE binding: the yes confirms only the presented drafts — a draft that was never presented stays a draft", () => {
  const writer = writerStub((req) => ({ ok: true, written: true, confirmed: true, writeId: "write-resume-2", confirmedFactIds: req.binding.factIds.slice() }));
  const w = makeWorld({ writeSubmitRecord: writer.fn });
  const U = "split-a-binding";
  const drafts = pasteResume(w, U);
  const snap = clone(w.snapshotOf(U));
  snap.stores.profile.facts.push({ id: "F-UNPRESENTED", kind: "skill", name: "Unpresented Skill", title: "Unpresented Skill", text: "Skill: Unpresented Skill", source: "resume-ingest", needs_confirmation: true, status: "draft" });
  w.say(U, "Yes, that's my resume.", { snapshot: snap, omitProfile: true, nowOffset: 60000 });
  const facts = w.profileOf(U).facts || [];
  for (const d of drafts) {
    const now = facts.find((f) => f.id === d.id);
    assert.ok(now && !now.needs_confirmation, `presented draft ${d.id} is confirmed`);
  }
  const unpresented = facts.find((f) => f.id === "F-UNPRESENTED");
  assert.ok(unpresented && unpresented.needs_confirmation === true,
    "a generic yes must not approve content that was not in the presented resume");
});

// ---------- (b) name / email / phone from the person's own words ----------

const CONTACT_TEXT = "My name is Rowan Ellery. My email is rowan.ellery@example.test. My phone is +1 555 010 0199.";

test("(b) name/email/phone are captured verbatim from the person's words through the host write path", () => {
  const writer = writerStub({ ok: true, written: true, confirmed: true, writeId: "write-contact-1" });
  const w = makeWorld({ writeSubmitRecord: writer.fn, master: { basics: { name: null, location: "Chicago, IL", email: null, phone: null } } });
  const U = "split-b-writer";
  const { out } = w.say(U, CONTACT_TEXT, { nowOffset: 0 });
  assert.equal(writer.calls.length, 1, "the router calls ctx.writeSubmitRecord exactly once for the capture");
  const req = writer.calls[0];
  assert.equal(req.kind, "contact_capture");
  assert.equal(req.sourceText, CONTACT_TEXT, "the person's exact turn rides the request");
  assert.deepEqual(req.record.basics, { name: "Rowan Ellery", email: "rowan.ellery@example.test", phone: "+1 555 010 0199" },
    "each field is the person's verbatim value — no normalization, no paraphrase");
  assert.match(out.reply, /Rowan Ellery/, `the reply reads the captured name back: ${out.reply}`);
});

test("(b) when the host write is not confirmed, contact capture claims nothing as recorded", () => {
  const writer = writerStub({ ok: false, written: false, confirmed: false, writeId: null, code: "HOST_WRITE_NOT_CONFIRMED", reason: "the host did not confirm the write" });
  const w = makeWorld({ writeSubmitRecord: writer.fn, master: { basics: { name: null, location: "Chicago, IL", email: null, phone: null } } });
  const U = "split-b-failure";
  const { out } = w.say(U, CONTACT_TEXT, { nowOffset: 0 });
  assert.equal(writer.calls.length, 1, "the router calls ctx.writeSubmitRecord before claiming anything");
  assert.doesNotMatch(out.reply, /saved|recorded|on your record|on file/i, `no record claim rides an unconfirmed write: ${out.reply}`);
  assert.match(out.reply, /not confirmed|did not (go through|confirm)|could not confirm/i, out.reply);
});

// ---------- (c) work-authorization replies ----------

const WA_TEXT = "Update my work authorization — I no longer need sponsorship.";
const WA_MASTER = { constraints: { workAuthorization: "F-1 OPT (TEST) — will need sponsorship", needsSponsorship: true } };

test("(c) a work-authorization statement goes through the host writer with the person's verbatim clause", () => {
  const writer = writerStub({ ok: true, written: true, confirmed: true, writeId: "write-wa-1" });
  const w = makeWorld({ writeSubmitRecord: writer.fn, master: WA_MASTER });
  const U = "split-c-writer";
  w.say(U, WA_TEXT, { nowOffset: 0 });
  assert.equal(writer.calls.length, 1, "the router calls ctx.writeSubmitRecord exactly once for the work-authorization reply");
  const req = writer.calls[0];
  assert.equal(req.kind, "work_authorization");
  assert.equal(req.sourceText, WA_TEXT);
  assert.equal(req.record.workAuthorization, "I no longer need sponsorship", "the stored statement is the person's own clause, verbatim");
  assert.equal(req.record.needsSponsorship, false);
});

test("(c) when the host write is not confirmed, the work-authorization reply claims no save", () => {
  const writer = writerStub({ ok: false, written: false, confirmed: false, writeId: null, code: "HOST_WRITE_NOT_CONFIRMED", reason: "the host did not confirm the write" });
  const w = makeWorld({ writeSubmitRecord: writer.fn, master: WA_MASTER });
  const U = "split-c-failure";
  const { out } = w.say(U, WA_TEXT, { nowOffset: 0 });
  assert.equal(writer.calls.length, 1, "the router calls ctx.writeSubmitRecord before claiming anything");
  assert.doesNotMatch(out.reply, /I saved|is saved|packet is ready/i, out.reply);
  assert.match(out.reply, /not confirmed|did not (go through|confirm)|could not confirm/i, out.reply);
});

test("(c) ROUTER-SIDE wording: with no host writer installed, the reply never claims 'saved' or a ready packet", () => {
  const w = makeWorld({ master: WA_MASTER }); // no writer seam installed at all
  const U = "split-c-wording";
  const { out } = w.say(U, WA_TEXT, { nowOffset: 0 });
  assert.doesNotMatch(out.reply, /I saved|saved your|packet is ready/i,
    `no success wording without a confirmed host write: ${out.reply}`);
  assert.match(out.reply, /not confirmed|not calling it saved|no confirmed .* write/i,
    `the reply says plainly the write is not confirmed: ${out.reply}`);
  assert.match(out.reply, /invalid|stale|will not be submitted/i,
    "the stale-packet protection is still spoken: a packet built on the old answer does not go out");
});

// ---------- (d) application status readback ----------

const STATUS_ROWS = [
  { company: "TestCo 1", role: "Software Engineering Intern", state: "prepared", confirmation: null },
  { company: "TestCo 2", role: "Data Analyst Intern", state: "queued", confirmation: null },
  { company: "TestCo 3", role: "Finance Intern", state: "submitted_confirmed", confirmation: { id: "SBX-0001", recordedAt: "2026-10-25T15:00:00.000Z" } },
];

test("(d) 'where are my applications' is answered from the host status readback, states named as they are", () => {
  const reader = readerStub({ ok: true, rows: STATUS_ROWS });
  const w = makeWorld({ readApplicationStatus: reader.fn });
  const U = "split-d-list";
  const { out } = w.say(U, "where are my applications?", { nowOffset: 0 });
  assert.equal(reader.calls.length, 1, "the router calls ctx.readApplicationStatus exactly once");
  assert.equal(reader.calls[0].company, null, "a list ask reads back every row");
  assert.match(out.reply, /TestCo 1/, out.reply);
  assert.match(out.reply, /prepared/i, `the prepared row reads as prepared: ${out.reply}`);
  assert.match(out.reply, /TestCo 2/, out.reply);
  assert.match(out.reply, /queued/i, `the queued row reads as queued: ${out.reply}`);
  assert.match(out.reply, /TestCo 3/, out.reply);
  assert.match(out.reply, /submitted/i, `only the confirmed row reads as submitted: ${out.reply}`);
  assert.ok(out.reply.includes("SBX-0001"), "the recorded confirmation id is named");
});

test("(d) 'did X go through' never says submitted for a row with no recorded confirmation", () => {
  const reader = readerStub((req) => ({ ok: true, rows: STATUS_ROWS.filter((r) => r.company === req.company) }));
  const w = makeWorld({ readApplicationStatus: reader.fn });
  const U = "split-d-named";
  const { out } = w.say(U, "did TestCo 1 go through?", { nowOffset: 0 });
  assert.equal(reader.calls.length, 1, "the router calls ctx.readApplicationStatus exactly once");
  assert.equal(reader.calls[0].company, "TestCo 1", "the named company scopes the readback");
  assert.doesNotMatch(out.reply, /\bsubmitted\b/i, `no 'submitted' without a recorded confirmation: ${out.reply}`);
  assert.match(out.reply, /prepared|not (yet )?(sent|submitted)|no .*confirmation/i,
    `the row's real state is spoken: ${out.reply}`);
});

test("(d) when the host readback fails, the status reply says it cannot confirm — it does not invent an empty record", () => {
  const reader = readerStub({ ok: false, rows: [], code: "HOST_READBACK_UNAVAILABLE", reason: "the host status readback is unavailable" });
  const w = makeWorld({ readApplicationStatus: reader.fn });
  const U = "split-d-failure";
  const { out } = w.say(U, "where are my applications?", { nowOffset: 0 });
  assert.equal(reader.calls.length, 1, "the router calls ctx.readApplicationStatus before answering");
  assert.match(out.reply, /can'?t confirm|cannot confirm|unable to confirm|not confirmed/i, out.reply);
  assert.doesNotMatch(out.reply, /holds no applications|no applications on record/i,
    "a failed readback is never spoken as an empty record");
});

test("(d) ROUTER-SIDE wording on an existing batch row: a submission with no recorded confirmation is never spoken as submitted", () => {
  const log = { records: [] };
  const boardFor = (p) => Object.assign({}, Portal.createSandboxBoard({}), {
    atsFamily: p.atsFamily,
    submit() { return { outcome: "accepted" }; },
    submissionState() { return { submitted: true, confirmationId: null }; },
  });
  const profile = { name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 000 555 0100", location: "Chicago, IL", resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) }, answers: clone(FULL_ANSWERS) };
  const posting = {
    id: "JOB-S-1", job_id: "JOB-S-1", canonicalKey: "greenhouse:testco1:software-engineering-intern",
    company: "TestCo 1", role: "Software Engineering Intern", title: "Software Engineering Intern",
    url: "https://boards.greenhouse.io/testco1/jobs/1", status: "open", atsFamily: "greenhouse",
    location: "Chicago, IL", posted_at: "2026-10-10",
    jd_text: "Software engineering intern role. JavaScript, testing, code review, agile team.",
  };
  const run = Batch.createRun({ userId: "split-d-row", familyKey: "software-engineering", familyText: "software engineering", count: 1, now: NOW });
  Batch.prepareRun(run, { postings: [posting], profile, log, boardFor, attestations: ATTEST });
  assert.equal(Batch.approveRun(run, { approvedByUser: true, now: NOW, userId: run.userId, profileSha256: run.profileSha256 }).ok, true);
  Batch.executeRun(run, { now: NOW, profile, log, boardFor });
  const app = Object.values(run.apps)[0];
  assert.equal(app.stage, "submitted", "setup: the drive landed");
  assert.ok(!app.confirmationId, "setup: no employer confirmation is recorded on the row");
  const lines = Batch.speakSummary(run);
  assert.notEqual(lines[0], "1/1 applications submitted.", "the headline must not claim submitted without a recorded confirmation");
  assert.ok(lines.some((l) => /not counted as submitted/i.test(l)), `the readback says so plainly: ${lines.join(" | ")}`);
  assert.ok(!lines.some((l) => l.includes("(null)")), "no fabricated '(null)' confirmation is printed");
  assert.equal(Batch.summarizeRun(run).confirmations.length, 0, "the confirmations list holds only recorded employer confirmations");
});
