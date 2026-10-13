// Reply-oracle + harness upgrade tests (career/rq-oracle, 2026-10-13).
// The oracle judges the USER-VISIBLE reply (agent prose + flattened card
// rendering); the harness downgrades a claimed COMPLETE to FAIL when the
// oracle fails, supports SC_SUFFIX evidence files, and applies the SC_VARIANT
// deterministic messifier to user turns.
// Check: node --test tests/career-harness-oracle.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// HARNESS_OUT_DIR must be set before the harness module is loaded.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rq-oracle-"));
process.env.HARNESS_OUT_DIR = TMP;

const O = require(path.join(__dirname, "..", "scripts/career/reply-oracle.cjs"));
const H = require(path.join(__dirname, "..", "scripts/career/scenario-harness.cjs"));

function rulesOf(res) { return [...new Set(res.failures.map((f) => f.rule))].sort(); }
async function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  try { return await fn(); } finally {
    for (const k of Object.keys(env)) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
const CLEAN = [
  { seq: 1, role: "user", text: "Find me data internships in Chicago" },
  { seq: 2, role: "agent", text: "Found 3 matches near Chicago. Two are summer analyst roles. Want me to tailor your resume?" },
  { seq: 3, role: "user", text: "Yes, tailor it for the first one" },
  { seq: 4, role: "agent", text: "Done — your resume now leads with the DeployBoard project. Nothing is sent until you approve it." },
];

// --- oracle: clean pass ----------------------------------------------------

test("oracle passes a clean 2-bubble exchange", () => {
  const r = O.checkMessages(CLEAN);
  assert.equal(r.pass, true, JSON.stringify(r.failures));
  assert.deepEqual(r.failures, []);
});

test("oracle ignores tool/verification records (not user-visible)", () => {
  const msgs = [
    { seq: 1, role: "user", text: "Review my resume diff" },
    { seq: 2, role: "tool", text: "{\"factIds\":[\"F-010\"]}", tool: "123.diffResume" },
    { seq: 3, role: "agent", text: "Here is the diff, with each change explained in plain words. Approve or reject it." },
    { seq: 4, role: "verification", text: "diff computed from rail state", evidence: { id: "3f6b8f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f" } },
  ];
  const r = O.checkMessages(msgs);
  assert.equal(r.pass, true, JSON.stringify(r.failures));
});

// --- oracle: one fixture per rule ------------------------------------------

test("oracle empty-reply: user turn with zero agent text after it", () => {
  const r = O.checkMessages([
    { seq: 1, role: "user", text: "Find me internships" },
    { seq: 2, role: "agent", text: "Found 3 matches." },
    { seq: 3, role: "user", text: "Approved — use that diff" }, // SC-097's actual closing user turn
  ]);
  assert.equal(r.pass, false);
  assert.deepEqual(rulesOf(r), ["empty-reply"]);
  assert.equal(r.failures[0].seq, 3);
});

test("oracle empty-reply: finish with no agent text at all", () => {
  const r = O.checkMessages([{ seq: 1, role: "tool", text: "{}", tool: "100.boot" }]);
  assert.equal(r.pass, false);
  assert.deepEqual(rulesOf(r), ["empty-reply"]);
});

test("oracle too-many-sentences is ADVISORY: a warning, never a failure (repair-brief contract)", () => {
  const four = O.checkText("One. Two. Three. Four.");
  assert.equal(four.pass, true, "length alone never fails");
  assert.deepEqual(four.failures, []);
  assert.deepEqual(four.warnings.map((w) => w.rule), ["too-many-sentences"]);
  const three = O.checkText("One. Two. Three.");
  assert.equal(three.pass, true);
  assert.deepEqual(three.warnings, []);
  // abbreviation is not a sentence end: this is 3 sentences, like SC-097's agent bubble — no warning
  assert.deepEqual(O.checkText("Here is the diff. Added lines carry evidence, e.g. Kubernetes via DeployBoard. Approve or reject it.").warnings, []);
  // SC-222 scale: a 22-sentence wall is warned loudly but still not a hard fail
  const wall = O.checkMessages([{ seq: 1, role: "user", text: "What does IB recruiting require?" }, { seq: 2, role: "agent", text: Array(22).fill("Reported pattern, not a measured share.").join(" ") }]);
  assert.equal(wall.pass, true);
  assert.deepEqual(wall.failures, []);
  assert.deepEqual(wall.warnings.map((w) => w.rule), ["too-many-sentences"]);
});

test("oracle finance-leak: money-movement vocabulary fails a career reply", () => {
  for (const t of [
    "Done — I cancelled your subscription and refunded the charge to your card.",
    "Your bank balance is $2,300 as of today.",
    "I moved money out of your portfolio and sold the shares.",
    "Your credit card payment is due and the billing cycle reset.",
    "The dividend landed, so I placed the trade in your account.",
  ]) {
    const r = O.checkText(t);
    assert.equal(r.pass, false, t);
    assert.ok(rulesOf(r).includes("finance-leak"), t + " -> " + JSON.stringify(r.failures));
  }
});

test("oracle finance-leak: career-legit money words do NOT trip it", () => {
  const t = "The offer is a $120,000 salary with a sign-on bonus. Total compensation beats the band, and the pay start date is in the offer letter.";
  const r = O.checkText(t);
  assert.equal(r.pass, true, JSON.stringify(r.failures));
  assert.deepEqual(r.warnings, []);
});

test("oracle false-completion: prepared record + 'I've submitted' claim is a hard fail", () => {
  // record contradiction via tool state (no context needed)
  const msgs = [
    { seq: 1, role: "user", text: "Apply to the Goldman summer analyst role" },
    { seq: 2, role: "tool", text: "{\"status\":\"prepared\",\"doorstep\":true,\"note\":\"packet prepared, not submitted\"}", tool: "130.prepareApplication" },
    { seq: 3, role: "agent", text: "I've submitted your application to Goldman." },
  ];
  const r = O.checkMessages(msgs);
  assert.equal(r.pass, false);
  assert.deepEqual(rulesOf(r), ["false-completion"]);
  assert.equal(r.failures[0].seq, 3);
  // typed result_status alone is enough contradiction
  const r2 = O.checkMessages([
    { seq: 1, role: "user", text: "Email the recruiter" },
    { seq: 2, role: "agent", text: "Your email was sent to the recruiter." },
  ], { resultStatus: "queued", claimedStatus: "COMPLETE" });
  assert.deepEqual(rulesOf(r2), ["false-completion"]);
  // claimed status other than COMPLETE contradicts a completion claim too
  const r3 = O.checkText("I've sent the email.", { resultStatus: "completed", claimedStatus: "LEARN" });
  assert.deepEqual(rulesOf(r3), ["false-completion"]);
});

test("oracle false-completion: genuinely submitted record + same claim passes (the pair)", () => {
  const msgs = [
    { seq: 1, role: "user", text: "Apply to the Goldman summer analyst role" },
    { seq: 2, role: "tool", text: "{\"status\":\"submitted\",\"confirmation\":\"APP-2027-114\"}", tool: "130.submitApplication" },
    { seq: 3, role: "agent", text: "I've submitted your application to Goldman." },
    { seq: 4, role: "verification", text: "portal record shows the application submitted", evidence: { status: "submitted" } },
  ];
  const r = O.checkMessages(msgs, { resultStatus: "completed", claimedStatus: "COMPLETE" });
  assert.equal(r.pass, true, JSON.stringify(r.failures));
  // honest prepared language against a prepared record: no claim, no fail
  const honest = O.checkMessages([
    { seq: 1, role: "user", text: "Apply for me" },
    { seq: 2, role: "tool", text: "{\"status\":\"prepared\"}", tool: "130.prepareApplication" },
    { seq: 3, role: "agent", text: "Your application is prepared and ready for your review. Nothing has been submitted yet." },
  ], { resultStatus: "prepared", claimedStatus: "COMPLETE" });
  assert.equal(honest.pass, true, JSON.stringify(honest.failures));
});

test("oracle code-fence", () => {
  const r = O.checkText("Here is the record:\n```json\n{\"a\":1}\n```");
  assert.equal(r.pass, false);
  assert.ok(rulesOf(r).includes("code-fence"));
});

test("oracle json-braces: inline object and a raw-JSON line", () => {
  assert.ok(rulesOf(O.checkText("Your record: {\"company\": \"Goldman\", \"claims\": 2}")).includes("json-braces"));
  assert.ok(rulesOf(O.checkText("Result below\n{\"action\":\"proceed\"}")).includes("json-braces"));
  // ordinary prose braces-free text passes this rule
  assert.ok(!rulesOf(O.checkText("Your record is ready (2 claims checked).")).includes("json-braces"));
});

test("oracle uuid", () => {
  const r = O.checkText("Your application 3f6b8f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f was saved.");
  assert.deepEqual(rulesOf(r), ["uuid"]);
});

test("oracle fact-id: SC-097 card reason cites F-010 in the rendered card", () => {
  const msgs = [
    { seq: 1, role: "user", text: "Resume diff review — I approve the diff" },
    { seq: 2, role: "agent", text: "Here is the exact diff before anything is used. Approve or reject it.",
      card: { title: "Resume diff — your approval", summary: "1 added, 1 removed",
        added: [{ text: "Python, Kubernetes", reason: "added Python, Kubernetes — evidenced by fact F-010, F-013" }] } },
    { seq: 3, role: "user", text: "Approved" },
    { seq: 4, role: "agent", text: "Using that diff now." },
  ];
  const r = O.checkMessages(msgs);
  assert.equal(r.pass, false);
  assert.deepEqual(rulesOf(r), ["fact-id"]);
  assert.equal(r.failures[0].seq, 2);
  // the bare word forms fire too
  assert.ok(rulesOf(O.checkText("Backed by fact_ids from your profile.")).includes("fact-id"));
});

test("oracle: raw job_id inside a card payload is NOT judged (renderer strips it)", () => {
  const card = { title: "Jobs for you", jobs: [{ job_id: "JOBSECRET123", role: "Summer Analyst", firm: "Evercore" }] };
  const flat = O.flattenCard(card);
  assert.ok(!flat.includes("JOBSECRET123"), flat);
  assert.ok(!/job id/i.test(flat), flat);
  const r = O.checkMessages([
    { seq: 1, role: "user", text: "Show me jobs" },
    { seq: 2, role: "agent", text: "Here are the matches.", card },
  ]);
  assert.equal(r.pass, true, JSON.stringify(r.failures));
});

test("oracle tool-marker: numbered tool names and *[tool markers", () => {
  assert.deepEqual(rulesOf(O.checkText("Ran 123.diffResume on your resume.")), ["tool-marker"]);
  assert.ok(rulesOf(O.checkText("*[tool 125.respondToRequest gate]")).includes("tool-marker"));
  // an ordinary number with a decimal is not a tool marker
  assert.equal(O.checkText("The stipend is 1200.50 a month.").pass, true);
});

test("oracle internal-jargon", () => {
  assert.deepEqual(rulesOf(O.checkText("Checked the rail state for you.")), ["internal-jargon"]);
  assert.ok(rulesOf(O.checkText("The router_core decided.")).includes("internal-jargon"));
  assert.ok(rulesOf(O.checkText("An edge function handled it.")).includes("internal-jargon"));
});

test("oracle checkText: single bubble, seq is null in failures and warnings", () => {
  const r = O.checkText("All good here. Two sentences only.");
  assert.equal(r.pass, true);
  const bad = O.checkText("One. Two. Three. Four.");
  assert.equal(bad.warnings[0].seq, null);
  const leak = O.checkText("Your id is 3f6b8f2e-1a2b-4c3d-8e4f-5a6b7c8d9e0f.");
  assert.equal(leak.failures[0].seq, null);
});

// --- harness: SC_SUFFIX + oracle downgrade ----------------------------------

test("harness finish(): SC_SUFFIX writes suffixed files and downgrades COMPLETE with a bad bubble to FAIL", async () => {
  // HARNESS_RAW_AGENT=1: the dirty bubble must reach the oracle raw (composer off)
  await withEnv({ SC_SUFFIX: "-t1", SC_VARIANT: null, HARNESS_RAW_AGENT: "1" }, async () => {
    const s = H.session("SC-T01", "bad-bubble");
    s.user("Show me the diff");
    s.agent("Here it is: {\"fact_ids\": [\"F-010\"]} — ran 123.diffResume. Plus this. Plus this. Plus this.");
    const rec = await s.finish({ status: "COMPLETE", outcome: "diff shown", reason: "rail state ok" });
    assert.equal(rec.status, "FAIL");
    assert.equal(rec.claimed_status, "COMPLETE");
    assert.equal(rec.result_status, "completed"); // derived from the CLAIMED status
    assert.equal(rec.variant, null);
    assert.equal(rec.reply_oracle.pass, false);
    assert.ok(rec.reply_oracle.failures.length >= 3, JSON.stringify(rec.reply_oracle.failures));
    // the 4-sentence bubble is only an advisory warning, not one of the failures
    assert.deepEqual(rec.reply_oracle.warnings.map((w) => w.rule), ["too-many-sentences"]);
    assert.ok(rec.reason.startsWith("reply-oracle FAIL:"), rec.reason);
    assert.ok(rec.reason.includes("claimed reason: rail state ok"), rec.reason);
    const base = path.join(TMP, "SC-T01-bad-bubble");
    assert.ok(fs.existsSync(base + "-t1.messages.json"), "suffixed messages.json written");
    assert.ok(fs.existsSync(base + "-t1.md"), "suffixed md written");
    assert.ok(fs.existsSync(base + "-t1.html"), "suffixed html written");
    assert.ok(!fs.existsSync(base + ".messages.json"), "unsuffixed run-1 file NOT written");
    const onDisk = JSON.parse(fs.readFileSync(base + "-t1.messages.json", "utf8"));
    assert.equal(onDisk.status, "FAIL");
    assert.equal(onDisk.claimed_status, "COMPLETE");
    assert.equal(onDisk.reply_oracle.pass, false);
    const md = fs.readFileSync(base + "-t1.md", "utf8");
    assert.ok(md.includes("## Reply oracle: FAIL"), md.slice(0, 600));
    assert.ok(md.includes("**Claimed status:** COMPLETE"));
    assert.ok(md.includes("**Result status:** completed"));
    assert.ok(md.includes("**Variant:** none"));
    assert.ok(md.includes("### Reply warnings (advisory"), "warnings section present in md");
    for (const f of rec.reply_oracle.failures) assert.ok(md.includes(`[${f.rule}]`), `md lists ${f.rule}`);
  });
});

test("harness finish(): LEARN keeps its status even when the oracle fails; result_status derives to partial", async () => {
  await withEnv({ SC_SUFFIX: "-t2", SC_VARIANT: null, HARNESS_RAW_AGENT: "1" }, async () => {
    const s = H.session("SC-T02", "learn-bad-bubble");
    s.user("Show me the diff");
    s.agent("Status came from router_core directly. One. Two. Three.");
    const rec = await s.finish({ status: "LEARN", outcome: "need the diff engine", reason: "not built yet" });
    assert.equal(rec.status, "LEARN");
    assert.equal(rec.claimed_status, "LEARN");
    assert.equal(rec.result_status, "partial");
    assert.equal(rec.reply_oracle.pass, false);
    assert.deepEqual(rec.reply_oracle.failures.map((f) => f.rule), ["internal-jargon"]);
    assert.equal(rec.reason, "not built yet");
    const md = fs.readFileSync(path.join(TMP, "SC-T02-learn-bad-bubble-t2.md"), "utf8");
    assert.ok(md.includes("## Reply oracle: FAIL"));
    assert.ok(md.includes("**Result status:** partial"));
  });
});

test("harness finish(): clean COMPLETE stays COMPLETE and the oracle section says PASS", async () => {
  await withEnv({ SC_SUFFIX: "-t3", SC_VARIANT: null }, async () => {
    const s = H.session("SC-T03", "clean-run");
    s.user("Find me internships");
    s.agent("Found 3 matches near Chicago. Want me to tailor your resume?");
    const rec = await s.finish({ status: "COMPLETE", outcome: "matches shown" });
    assert.equal(rec.status, "COMPLETE");
    assert.equal(rec.result_status, "completed");
    assert.equal(rec.reply_oracle.pass, true);
    assert.deepEqual(rec.reply_oracle.warnings, []);
    const md = fs.readFileSync(path.join(TMP, "SC-T03-clean-run-t3.md"), "utf8");
    assert.ok(md.includes("## Reply oracle: PASS"));
  });
});

test("harness finish(): false-completion downgrades a COMPLETE whose result_status is 'prepared'", async () => {
  await withEnv({ SC_SUFFIX: "-t7", SC_VARIANT: null, HARNESS_RAW_AGENT: "1" }, async () => {
    const s = H.session("SC-T07", "false-completion");
    s.user("Apply to the Goldman summer analyst role");
    await s.tool("130.prepareApplication", { status: "prepared", doorstep: true });
    s.agent("I've submitted your application to Goldman.");
    const rec = await s.finish({ status: "COMPLETE", outcome: "application packet prepared for the doorstep", resultStatus: "prepared" });
    assert.equal(rec.result_status, "prepared"); // the script's typed status wins over derivation
    assert.equal(rec.status, "FAIL");
    assert.equal(rec.claimed_status, "COMPLETE");
    assert.deepEqual(rec.reply_oracle.failures.map((f) => f.rule), ["false-completion"]);
    assert.ok(rec.reason.includes("false-completion"), rec.reason);
  });
});

test("harness finish(): ASK derives result_status awaiting_user; invalid resultStatus falls back to derivation", async () => {
  await withEnv({ SC_SUFFIX: "-t8", SC_VARIANT: null }, async () => {
    const s = H.session("SC-T08", "ask-user");
    s.user("Apply for me");
    s.agent("I need one thing only you can do: sign in to the portal. Then I can finish the rest.");
    const rec = await s.finish({ status: "ASK", outcome: "waiting on the sign-in only the user can do", resultStatus: "bogus-value" });
    assert.equal(rec.status, "ASK");
    assert.equal(rec.result_status, "awaiting_user");
    assert.equal(rec.reply_oracle.pass, true, JSON.stringify(rec.reply_oracle.failures));
  });
});

const HAS_COMPOSER = fs.existsSync(path.join(__dirname, "..", "packages/domain/140-career-reply.js"));
test("harness agent(): raw payload text is composed into clean bubbles (composer glue)", { skip: !HAS_COMPOSER && "140-career-reply.js not on this tree" }, async () => {
  await withEnv({ SC_SUFFIX: "-t9", SC_VARIANT: null, HARNESS_RAW_AGENT: null }, async () => {
    const s = H.session("SC-T09", "composer-glue");
    s.user("Show me the record");
    s.agent("{\"fact_ids\":[\"F-010\",\"F-013\"]}");
    const agentMsgs = s.messages.filter((m) => m.role === "agent");
    assert.ok(agentMsgs.length >= 1);
    for (const m of agentMsgs) {
      assert.ok(!m.text.includes("F-010"), m.text);
      assert.ok(!m.text.includes("{"), m.text);
      assert.ok(m.text.trim().length > 0, "composer never returns an empty bubble");
    }
    // the composed exchange passes the oracle end to end
    const rec = await s.finish({ status: "COMPLETE", outcome: "record shown" });
    assert.equal(rec.reply_oracle.pass, true, JSON.stringify(rec.reply_oracle.failures));
    assert.equal(rec.status, "COMPLETE");
  });
});

// --- harness: SC_VARIANT messifier ------------------------------------------

test("messifier determinism: same input + seed -> same output, every mode", () => {
  const text = "Please find me summer internships in Chicago, and tailor my resume. Thank you!";
  for (const mode of ["typos", "fragment", "slang", "runon", "emoji"]) {
    assert.equal(H.messify(text, mode, "SC-999"), H.messify(text, mode, "SC-999"), mode);
  }
  // and through the harness: two sessions with the same id + mode record identical text
  return withEnv({ SC_VARIANT: "typos" }, async () => {
    const a = H.session("SC-999", "det"); a.user(text);
    const b = H.session("SC-999", "det"); b.user(text);
    assert.equal(a.messages[0].text, b.messages[0].text);
    assert.equal(a.messages[0].text, H.messify(text, "typos", "SC-999"));
  });
});

test("messifier modes produce their documented shapes", () => {
  const text = "Please find me summer internships in Chicago, and tailor my resume. Thank you!";
  assert.equal(H.messify(text, "fragment", "SC-1"), "please find me summer internships in chicago");
  const slang = H.messify("Please tell me what you are doing with your resume, thank you", "slang", "SC-1");
  assert.equal(slang, "pls tell me what u r doing with ur resume, thx");
  const runon = H.messify("Find jobs. Tailor my resume; send nothing yet.", "runon", "SC-1");
  assert.ok(!/[.!?;]/.test(runon), runon);
  assert.ok(runon.includes(" and "), runon);
  const emoji = H.messify(text, "emoji", "SC-1");
  assert.ok(emoji === text.toLowerCase() + " 🙏" || emoji === text.toLowerCase() + " 👀", emoji);
  const typos = H.messify(text, "typos", "SC-1");
  assert.notEqual(typos, text); // seeded run mangles at least one long word for this fixture
  assert.equal(typos.replace(/[^ ]/g, "").length, text.replace(/[^ ]/g, "").length); // word count shape kept
});

test("messifier typos never alters emails, URLs or numbers", () => {
  const text = "Email pat@evercore.com about 2027 roles paying 150000, see https://example.com/jobs?id=42 please";
  const out = H.messify(text, "typos", "SC-777");
  assert.ok(out.includes("pat@evercore.com"), out);
  assert.ok(out.includes("https://example.com/jobs?id=42"), out);
  assert.ok(out.includes("2027"), out);
  assert.ok(out.includes("150000"), out);
  assert.equal(out.replace(/\D/g, ""), text.replace(/\D/g, ""), "digit stream unchanged");
  assert.equal((out.match(/@/g) || []).length, 1, "@ survives");
});

test("messifier double mode: one scripted turn becomes TWO user pushes, second is returned", async () => {
  await withEnv({ SC_VARIANT: "double" }, async () => {
    const s = H.session("SC-T04", "double-turn");
    const ret = s.user("Find me internships in Chicago, and tailor my resume for each one");
    const users = s.messages.filter((m) => m.role === "user");
    assert.equal(users.length, 2);
    assert.equal(ret.text, users[1].text);
    assert.equal(users[0].text, "Find me internships in Chicago");
    assert.equal(users[1].text, "tailor my resume for each one");
  });
});

test("harness finish(): variant mode is recorded in the record and the .md header", async () => {
  await withEnv({ SC_SUFFIX: "-t5", SC_VARIANT: "fragment" }, async () => {
    const s = H.session("SC-T05", "variant-rec");
    s.user("Please find me internships in Chicago, and hurry");
    s.agent("Found 3 matches near Chicago.");
    const rec = await s.finish({ status: "COMPLETE", outcome: "matches shown" });
    assert.equal(rec.variant, "fragment");
    assert.equal(rec.messages[0].text, "please find me internships in chicago");
    const md = fs.readFileSync(path.join(TMP, "SC-T05-variant-rec-t5.md"), "utf8");
    assert.ok(md.includes("**Variant:** fragment"), md.slice(0, 400));
    const onDisk = JSON.parse(fs.readFileSync(path.join(TMP, "SC-T05-variant-rec-t5.messages.json"), "utf8"));
    assert.equal(onDisk.variant, "fragment");
  });
});

test("harness: no env -> user text verbatim, no suffix (run-1 behavior unchanged)", async () => {
  await withEnv({ SC_SUFFIX: null, SC_VARIANT: null }, async () => {
    const s = H.session("SC-T06", "plain");
    s.user("Exact text, with punctuation!");
    assert.equal(s.messages[0].text, "Exact text, with punctuation!");
    s.agent("Done.");
    const rec = await s.finish({ status: "COMPLETE", outcome: "done" });
    assert.equal(rec.variant, null);
    assert.ok(fs.existsSync(path.join(TMP, "SC-T06-plain.messages.json")));
  });
});
