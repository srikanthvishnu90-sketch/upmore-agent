// Batch-apply loop (module 155-career-batch-apply.js; LOOP ACCEPTANCE
// build, Crew B 2026-10-15). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this
// test fail. Graded on END STATES — the run object's stages, the
// summary's counts, the submission log, the tracker records and the
// employer-shaped confirmations — never on stage claims. TEST persona
// and 149 sandbox boards only; no real portal is opened, ever.
// The pre-existing suite is tests/career-loop-acceptance.test.cjs.
// Check: node --test tests/depth-CAREER-BATCH.test.cjs && node evals/depth/run.cjs CAREER-BATCH
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const Batch = require(path.join(dir, "155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "user-alex-test";
const NOW = Date.UTC(2026, 9, 15, 17, 0, 0);
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
  },
};
const MASTER = {
  basics: { name: "Alex Testcase (TEST)", email: "alex.testcase@example.test" },
  facts: [
    { id: "F-T-001", kind: "skill", text: "JavaScript and Node.js development", confirmed: true },
    { id: "F-T-002", kind: "experience", text: "Built web applications as a student developer", confirmed: true },
    { id: "F-T-003", kind: "education", text: "Computer Science student", confirmed: true },
  ],
};
const ATTEST = { certify_true: { value: true, explicit: true } };
const FAMS = ["greenhouse", "lever", "ashby"];
function posting(n, over = {}) {
  const fam = FAMS[n % 3];
  const co = `testco${n}`;
  return Object.assign({
    id: `JOB-T-${String(n).padStart(2, "0")}`,
    job_id: `JOB-T-${String(n).padStart(2, "0")}`,
    canonicalKey: `${fam}:${co}:software-engineering-intern`,
    company: `TestCo ${n}`,
    role: "Software Engineering Intern",
    title: "Software Engineering Intern",
    url: fam === "lever" ? `https://jobs.lever.co/${co}/${n}` : fam === "ashby" ? `https://jobs.ashbyhq.com/${co}/${n}` : `https://boards.greenhouse.io/${co}/jobs/${n}`,
    status: "open",
    atsFamily: fam,
    location: "Chicago, IL",
    posted_at: "2026-10-10",
    jd_text: "Software engineering intern role at a test company. JavaScript, testing, code review, agile team.",
  }, over);
}
function boardFor(p) {
  const fam = { atsFamily: p.atsFamily };
  if (p.id === "JOB-T-11") return Object.assign({}, Portal.createSandboxBoard({ captchaAt: "open" }), fam);
  if (p.id === "JOB-T-07") {
    const base = Portal.createSandboxBoard({});
    return Object.assign({}, base, fam, {
      form() {
        const f = base.form();
        f.fields = f.fields.concat([{ field_id: "start_date", label: "Earliest start date", kind: "screening", question_key: "start_date", required: true }]);
        return f;
      },
    });
  }
  return Object.assign({}, Portal.createSandboxBoard({}), fam);
}
function makeDeps(postings, log, extra = {}) {
  const tracked = [];
  const deps = Object.assign({ postings, profile: PROFILE, profileMaster: MASTER, log, now: NOW, attestations: ATTEST, boardFor, track: (r) => tracked.push(r) }, extra);
  return { deps, tracked };
}
const newRun = (count) => Batch.createRun({ userId: USER, familyText: "software engineering intern", count, now: NOW });
const cleanMarket = (ns) => ns.map((n) => posting(n));
function prepared(count, postings) {
  const log = { records: [] };
  const { deps, tracked } = makeDeps(postings, log);
  const run = newRun(count);
  Batch.prepareRun(run, deps);
  return { run, log, deps, tracked };
}

test("[S01] parse: a digit-count apply ask resolves to count, family text and unit", () => {
  assert.deepEqual(Batch.parseApplyAsk("apply to 15 investment banking intern roles"), { count: 15, familyText: "investment banking intern", unit: "roles" });
  assert.deepEqual(Batch.parseApplyAsk("apply for 3 data analyst jobs"), { count: 3, familyText: "data analyst", unit: "jobs" });
});

test("[S02] parse: spelled-out counts resolve through the word-count table", () => {
  assert.equal(Batch.parseApplyAsk("apply to fifteen nursing roles").count, 15);
  assert.equal(Batch.parseApplyAsk("apply to twenty five nursing roles").count, 25);
  assert.equal(Batch.parseApplyAsk("apply to thirty nursing roles").count, 30);
});

test("[S03] parse: count-less, family-less and non-apply asks are not claimed", () => {
  assert.equal(Batch.parseApplyAsk("apply to nursing roles"), null);
  assert.equal(Batch.parseApplyAsk("find me 15 nursing roles"), null);
  assert.equal(Batch.parseApplyAsk("apply to 15 roles"), null);
  assert.equal(Batch.parseApplyAsk("show me software engineering roles"), null);
});

test("[S04] run object: a new run is pure JSON in the new state, with no approvals and no ref", () => {
  const run = newRun(15);
  assert.match(run.id, /^batch-/);
  assert.equal(run.status, "new");
  assert.equal(run.requested, 15);
  assert.equal(run.familyText, "software engineering intern");
  assert.deepEqual(run.approvals, {});
  assert.equal(run.approvalRef, null);
  assert.equal(JSON.parse(JSON.stringify(run)).id, run.id);
});

test("[S05] prepare: a cross-board duplicate is removed and counted, never double-selected", () => {
  const market = [posting(1), posting(2), posting(3, { id: "JOB-T-03D", job_id: "JOB-T-03D", canonicalKey: "lever:testco1:software-engineering-intern", company: "TestCo 1", url: "https://jobs.lever.co/testco1/3d", atsFamily: "lever" })];
  const { run } = prepared(3, market);
  assert.equal(run.found, 3);
  assert.equal(run.duplicatesRemoved, 1);
  assert.equal(run.eligible, 2);
  assert.equal(run.selected.length, 2);
});

test("[S06] prepare: a closed posting is screened out as JOB_CLOSED and never selected", () => {
  const { run } = prepared(3, [posting(1), posting(18, { status: "closed" })]);
  assert.deepEqual(run.screenedOut.map((x) => x.code), ["JOB_CLOSED"]);
  assert.equal(run.screenedOut[0].company, "TestCo 18");
  assert.equal(run.eligible, 1);
  assert.equal(run.selected.length, 1);
});

test("[S07] prepare: an unmet license knockout screens the posting out as KNOCKOUT_UNMET", () => {
  const { run } = prepared(3, [posting(1), posting(17, { knockouts: [{ type: "license", requirement: "an active CPA license", tokens: ["cpa"] }] })]);
  assert.deepEqual(run.screenedOut.map((x) => x.code), ["KNOCKOUT_UNMET"]);
  assert.equal(run.eligible, 1);
});

test("[S08] prepare: a posting at the user's own current employer is screened out as CURRENT_EMPLOYER", () => {
  const master = Object.assign({}, MASTER, { facts: MASTER.facts.concat([{ id: "F-T-EMP", kind: "experience", org: "TestCo 2", title: "Intern", text: "Intern at TestCo 2", confirmed: true }]) });
  const log = { records: [] };
  const { deps } = makeDeps([posting(1), posting(2)], log, { profileMaster: master });
  const run = newRun(3);
  Batch.prepareRun(run, deps);
  assert.deepEqual(run.screenedOut.map((x) => x.code), ["CURRENT_EMPLOYER"]);
  assert.equal(run.screenedOut[0].company, "TestCo 2");
  assert.equal(run.eligible, 1);
});

test("[S09] prepare: eligible postings beyond the named count are deferred by count, named and kept", () => {
  const { run } = prepared(2, cleanMarket([1, 2, 3, 4]));
  assert.equal(run.eligible, 4);
  assert.equal(run.selected.length, 2);
  assert.deepEqual(run.deferred.map((x) => x.code), ["COUNT_DEFERRED", "COUNT_DEFERRED"]);
  assert.equal(run.apps[run.deferred[0].postingKey].stage, "deferred_count");
});

test("[S10] prepare: doorstep-ready applications get the batch approval card, hash-bound", () => {
  const { run } = prepared(3, cleanMarket([1, 2, 3]));
  assert.equal(run.status, "awaiting_approval");
  assert.equal(run.summary.doorstep, 3);
  assert.ok(run.card, "the card exists");
  assert.equal(run.card.type, "batch_approval");
  assert.equal(run.card.items.length, 3);
  assert.ok(run.cardSha256, "the card set is hash-bound");
});

test("[S11] approve: the one yes mints per-application approvals and an approvalRef bound to the card set hash", () => {
  const { run } = prepared(3, cleanMarket([1, 2, 3]));
  const ap = Batch.approveRun(run, { approvedByUser: true });
  assert.equal(ap.ok, true);
  assert.equal(ap.approved, 3);
  assert.equal(Object.keys(run.approvals).length, 3);
  assert.equal(run.status, "approved");
  assert.ok(run.approvalRef.includes(run.id), "the ref names the run");
  assert.ok(run.approvalRef.includes(run.cardSha256), "the ref is bound to the card set hash");
  assert.equal(ap.approvalRef, run.approvalRef);
});

test("[S12] approve: a payload changed after the card refuses the approval — the set is never silently re-pointed", () => {
  const { run } = prepared(3, cleanMarket([1, 2, 3]));
  const key = run.selected.find((k) => run.apps[k].stage === "doorstep");
  run.apps[key].payloadSha256 = "0".repeat(64);
  const ap = Batch.approveRun(run, { approvedByUser: true });
  assert.equal(ap.ok, false);
  assert.equal(ap.code, "APPROVAL_SET_CHANGED");
  assert.equal(run.status, "awaiting_approval");
  assert.equal(run.approvalRef, null);
});

test("[S13] approve: without the user's explicit yes, no approval is minted", () => {
  const { run } = prepared(3, cleanMarket([1, 2, 3]));
  const ap = Batch.approveRun(run, { approvedByUser: false });
  assert.equal(ap.ok, false);
  assert.equal(ap.code, "APPROVAL_REQUIRED");
  assert.deepEqual(run.approvals, {});
  assert.equal(run.status, "awaiting_approval");
});

test("[S14] execute: an unapproved run executes nothing — no submissions reach the log", () => {
  const { run, log, deps } = prepared(3, cleanMarket([1, 2, 3]));
  const ex = Batch.executeRun(run, deps);
  assert.equal(ex.ok, false);
  assert.equal(ex.code, "RUN_NOT_APPROVED");
  assert.equal(log.records.filter((r) => r.status === "submitted").length, 0);
});

test("[S15] execute: an approved clean batch submits every doorstep application with confirmations and tracker writes", () => {
  const { run, log, deps, tracked } = prepared(3, cleanMarket([1, 2, 3]));
  assert.equal(Batch.approveRun(run, { approvedByUser: true }).ok, true);
  const ex = Batch.executeRun(run, deps);
  assert.equal(ex.ok, true);
  assert.equal(run.status, "completed");
  assert.equal(run.summary.submitted, 3);
  assert.equal(run.summary.confirmations.length, 3);
  for (const c of run.summary.confirmations) assert.match(c.confirmationId, /^SBX-\d{4}$/);
  assert.equal(tracked.length, 3);
  assert.equal(log.records.filter((r) => r.status === "submitted").length, 3);
});

test("[S16] prepare: a required question with no confirmed fact stops that application as UNCOVERED_QUESTION, the field named", () => {
  const { run } = prepared(3, [posting(1), posting(7)]);
  const app = run.apps[Batch.postingKeyOf(posting(7))];
  assert.equal(app.stage, "stopped");
  assert.equal(app.stop.code, "UNCOVERED_QUESTION");
  assert.ok((app.stop.asks || []).some((a) => a.field_id === "start_date"), "the uncovered field is named on the stop");
  assert.equal(run.summary.doorstep, 1);
});

test("[S17] prepare: a captcha at open is a handoff stop — never solved, the handoff URL carried", () => {
  const { run } = prepared(3, [posting(1), posting(11)]);
  const app = run.apps[Batch.postingKeyOf(posting(11))];
  assert.equal(app.stage, "captcha_handoff");
  assert.equal(app.stop.code, "CAPTCHA_HANDOFF");
  assert.ok(app.stop.handoffUrl, "the handoff URL is carried on the stop");
  assert.equal(run.summary.doorstep, 1);
});

test("[S18] execute: at the daily cap, the overflow defers by cap at click time with its resume day named", () => {
  const log = { records: [] };
  for (let i = 0; i < 14; i++) log.records.push({ userId: USER, status: "submitted", timestamp: NOW, canonicalKey: `seed:other:${i}`, company: `Seed Co ${i}` });
  const { deps } = makeDeps(cleanMarket([1, 2, 3]), log);
  const run = newRun(3);
  Batch.prepareRun(run, deps);
  assert.equal(Batch.approveRun(run, { approvedByUser: true }).ok, true);
  const ex = Batch.executeRun(run, deps);
  assert.equal(ex.ok, true);
  assert.equal(run.summary.submitted, 1, "14 already down today: exactly 1 more fits the 15 cap");
  const capDef = run.deferred.filter((x) => x.code === "CAP_REACHED");
  assert.equal(capDef.length, 2);
  assert.ok(capDef.every((x) => x.resumeOn === "2026-10-16"), `resume day named: ${JSON.stringify(capDef.map((x) => x.resumeOn))}`);
  assert.equal(log.records.filter((r) => r.status === "submitted").length, 15);
});

test("[S19] execute: a drive that throws stops that application as EXECUTION_ERROR — nothing is submitted or retried", () => {
  const throwingBoardFor = (p) => {
    const base = boardFor(p);
    return Object.assign({}, base, { submit() { throw Object.assign(new Error("board exploded mid-submit"), { code: "BOOM" }); } });
  };
  const log = { records: [] };
  const { deps } = makeDeps(cleanMarket([1, 2]), log, { boardFor: throwingBoardFor });
  const run = newRun(2);
  Batch.prepareRun(run, deps);
  assert.equal(run.summary.doorstep, 2);
  assert.equal(Batch.approveRun(run, { approvedByUser: true }).ok, true);
  const ex = Batch.executeRun(run, deps);
  assert.equal(ex.ok, true);
  assert.equal(run.summary.submitted, 0);
  const stops = run.summary.stops.filter((x) => x.code === "EXECUTION_ERROR");
  assert.equal(stops.length, 2);
  assert.equal(run.status, "completed_with_stops");
  assert.equal(log.records.filter((r) => r.status === "submitted").length, 0);
});

test("[S20] snapshot: a prepared run survives the serialize/restore round-trip and can be approved restored", () => {
  const { run } = prepared(3, cleanMarket([1, 2, 3]));
  const restored = Batch.restoreRun(JSON.parse(JSON.stringify(Batch.serializeRun(run))));
  assert.ok(restored, "the run restores");
  assert.equal(restored.id, run.id);
  assert.equal(restored.status, "awaiting_approval");
  assert.equal(restored.cardSha256, run.cardSha256);
  assert.equal(Batch.approveRun(restored, { approvedByUser: true }).ok, true);
});

test("[S21] report: the spoken summary names the found count, the submissions with confirmations, and every stop", () => {
  const { run, deps } = prepared(3, [posting(1), posting(2), posting(11)]);
  assert.equal(Batch.approveRun(run, { approvedByUser: true }).ok, true);
  Batch.executeRun(run, deps);
  const spoken = Batch.speakSummary(run).join("\n");
  assert.match(spoken, /Found 3/);
  assert.match(spoken, /Submitted 2 with employer confirmations/);
  assert.match(spoken, /captcha/i);
});
