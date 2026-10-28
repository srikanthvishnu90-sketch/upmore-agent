"use strict";
// The deterministic browser apply worker (workers/career-browser/parallel-apply.cjs) against the LOCAL mock Greenhouse and
// Lever forms (tests/fixtures/mock-ats-server.cjs). Nothing leaves 127.0.0.1; no model calls.
//   node --test tests/career-parallel-apply.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startMockAts } = require("./fixtures/mock-ats-server.cjs");
const { applyOne, runPool, payloadHash, sha256 } = require("../workers/career-browser/parallel-apply.cjs");

let pw = null;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try { pw = require(id); break; } catch { /* next */ }
}
const skip = pw ? false : "PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH";
let mock, browser, resume, rsha;
const facts = { first_name: "Test", last_name: "Person", email: "test.person@example.invalid", phone: "555-0100" };
const answers = { "Are you legally authorized to work in the United States?": "Yes", "Will you now or in the future require sponsorship for employment visa status?": "No" };
const mk = (ats, job, over = {}) => {
  const p = { id: `${ats}-${job}`, ats, url: `${mock.base}/${ats}/${job}`, facts, answers, resume: { path: resume, sha256: rsha, preparedWithSha256: rsha }, ...over };
  p.approval = { payloadHash: payloadHash(p) };
  return p;
};

before(async () => {
  if (skip) return;
  resume = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pa-")), "test-person-resume.pdf");
  fs.writeFileSync(resume, "%PDF-1.4\n% TEST resume\n");
  rsha = sha256(fs.readFileSync(resume));
  mock = await startMockAts();
  browser = await pw.chromium.launch({ headless: true, chromiumSandbox: process.env.UPMORE_CHROMIUM_SANDBOX !== "off",
    ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}) });
});
after(async () => { if (browser) await browser.close(); if (mock) await mock.close(); });

test("fills and submits a Greenhouse-style and a Lever-style form with only the approved facts and the one resume", { skip }, async () => {
  const gh = await applyOne(browser, mk("greenhouse", "t1"));
  const lv = await applyOne(browser, mk("lever", "t1"));
  assert.equal(gh.status, "submitted_page_confirmed");
  assert.equal(lv.status, "submitted_page_confirmed");
  const [g, l] = [mock.submissions.find((s) => s.ats === "greenhouse" && s.job === "t1"), mock.submissions.find((s) => s.ats === "lever" && s.job === "t1")];
  assert.equal(g.fields.first_name, "Test");
  assert.equal(g.fields.question_auth, "Yes");
  assert.equal(g.fields.question_linkedin, "", "a fact the person never gave is left blank, not invented");
  assert.equal(l.fields.name, "Test Person");
  assert.equal(g.files.resume.sha256, rsha);
  assert.equal(l.files.resume.sha256, rsha);
});

test("a required question with no confirmed answer stops the run, names the field and submits nothing", { skip }, async () => {
  const p = mk("greenhouse", "t2", { answers: {} });
  p.approval = { payloadHash: payloadHash(p) };
  const r = await applyOne(browser, p);
  assert.equal(r.status, "not_submitted");
  assert.equal(r.reason, "missing_required_answer");
  assert.match(r.field, /authorized to work/);
  assert.equal(mock.submissions.some((s) => s.job === "t2"), false);
});

test("a changed payload, a different resume, an unapproved host and a bot check are all refused or handed back", { skip }, async () => {
  const tampered = mk("lever", "t3");
  tampered.facts = { ...facts, email: "someone.else@example.invalid" };
  assert.equal((await applyOne(browser, tampered)).reason, "not_approved");
  const other = path.join(path.dirname(resume), "other.pdf");
  fs.writeFileSync(other, "%PDF-1.4\n% a different resume\n");
  const wrongResume = mk("lever", "t4", { resume: { path: other, sha256: rsha, preparedWithSha256: rsha } });
  assert.equal((await applyOne(browser, wrongResume)).reason, "resume_mismatch");
  const real = mk("lever", "t5", { url: "https://jobs.lever.co/example/abc/apply" });
  assert.equal((await applyOne(browser, real)).reason, "host_not_allowed");
  const bot = await applyOne(browser, mk("greenhouse", "bot1"));
  assert.equal(bot.status, "needs_user");
  assert.equal(bot.reason, "bot_check");
  assert.equal(mock.submissions.some((s) => ["t3", "t4", "t5", "bot1"].includes(s.job)), false);
});

test("a transient page failure before submit is retried; a dead page is not_submitted after the retries", { skip }, async () => {
  const r = await applyOne(browser, mk("greenhouse", "flaky-t6"), { backoffMs: 10 });
  assert.equal(r.status, "submitted_page_confirmed");
  assert.equal(r.attempts, 2);
  const dead = await applyOne(browser, mk("greenhouse", "t7", { url: `${mock.base}/nowhere/t7` }), { retries: 1, backoffMs: 10 });
  assert.equal(dead.status, "not_submitted");
  assert.equal(dead.attempts, 2);
  assert.equal(dead.reason, "retries_exhausted");
});

test("five at once: all confirmed, each posting submitted exactly once, concurrency capped", { skip }, async () => {
  const payloads = ["greenhouse", "lever", "greenhouse", "lever", "greenhouse", "lever", "greenhouse"].map((a, i) => mk(a, `p${i}`));
  const { results } = await runPool(browser, payloads, { concurrency: 5 });
  assert.deepEqual(results.map((r) => r.status), payloads.map(() => "submitted_page_confirmed"));
  for (const p of payloads) assert.equal(mock.submissions.filter((s) => s.ats === p.ats && s.job === p.id.split("-")[1]).length, 1);
});

test("a second run of an already-submitted posting is never counted as success", { skip }, async () => {
  const r = await applyOne(browser, mk("greenhouse", "t1"));
  assert.notEqual(r.status, "submitted_page_confirmed");
  assert.equal(mock.submissions.filter((s) => s.job === "t1" && s.ats === "greenhouse").length, 1);
});
