"use strict";
// P0: the proven apply loop (scripts/career/prove-loop.cjs) on a captured real Greenhouse form, offline: the synthetic
// TEST persona's confirmed facts, the screen, the engine's dry run through the cloud worker's engine runner, one question
// asked once and answered from the persona, the card shown through cardTurn and approved by the person's tap, the approved payload proven equal
// to a freshly filled page, stopped before the submit click, and a receipt stored with every field. Three runs, all
// identical, 0 wrong and 0 missed against the independent answer key. Nothing is sent: the local employer receives no
// POST. A posting the screen excludes stops there unless overridden, and a form asking what the persona never stated
// stops at needs_answers with nothing sent (never guessed).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SCRIPT = path.join(__dirname, "../scripts/career/prove-loop.cjs");
const GH = "greenhouse-prolificacademicltd-4979452101";
const { personaFacts } = require(SCRIPT);

function run(args) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "prove-loop-test-"));
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, ...args, "--out", out], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.on("data", (b) => (stdout += b));
    p.stderr.on("data", (b) => (stderr += b));
    const timer = setTimeout(() => p.kill("SIGKILL"), 900000);
    p.once("exit", (code) => {
      clearTimeout(timer);
      const receipts = fs.readdirSync(out).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(out, f), "utf8")));
      fs.rmSync(out, { recursive: true, force: true });
      resolve({ code, stdout, stderr, receipts });
    });
  });
}

test("every persona fact names the persona field it came from; nothing the persona does not state", () => {
  const persona = JSON.parse(fs.readFileSync(path.join(__dirname, "../packages/career-data/fixtures/test-persona.json"), "utf8"));
  const f = personaFacts(persona);
  assert.match(f.user_id, /^TEST-/);
  const ids = Object.values(f.answers).map((a) => a.factId);
  assert.equal(new Set(ids).size, ids.length, "one fact id per fact");
  for (const [k, a] of Object.entries(f.answers)) {
    assert.match(a.factId, /^TEST-persona:(basics|constraints|defaults)\.[\w.]+#\w+$/, k);
    assert.equal(a.confirmed, true);
    assert.ok(!/\(TEST\)/.test(a.value), "the fixture's (TEST) label is not part of a value: " + k);
  }
  for (const absent of ["country", "salary_expectation", "street_address", "current_employer", "former_employers"]) {
    assert.ok(!f.answers[absent], "the persona states no " + absent);
  }
});

test("a posting the screen excludes stops at the screen, before any browser", async () => {
  const r = await run(["--form", GH]);
  assert.equal(r.code, 3, r.stdout + r.stderr.slice(-500));
  assert.match(r.stdout, /STOPPED at the screen: location: posting is in Germany/);
  assert.equal(r.receipts.length, 0);
});

test("captured Greenhouse form, 3 of 3: filled and read back, 0 wrong, approved through the card, stopped before submit", async () => {
  const r = await run(["--form", GH, "--apply-despite-screen", "--repeat", "3"]);
  assert.equal(r.code, 0, r.stdout.slice(-3000) + r.stderr.slice(-1500));
  assert.match(r.stdout, /REPEAT 3\/3 clean, identical answers and payload across runs/);
  assert.equal(r.receipts.length, 3);
  for (const rc of r.receipts) {
    assert.equal(rc.outcome, "stopped_before_submit");
    assert.equal(rc.local_employer_posts, 0, "nothing was posted to the employer stand-in");
    assert.equal(rc.coverage.wrong, 0);
    assert.equal(rc.coverage.missed, 0);
    assert.equal(rc.coverage.required_filled, rc.coverage.required);
    assert.equal(rc.coverage.read_back, rc.coverage.filled);
    assert.equal(rc.coverage.filled + rc.coverage.unfilled.length, rc.coverage.fields_on_form);
    for (const u of rc.coverage.unfilled) assert.ok(u.reason, "every unfilled field carries its reason: " + u.id);
    assert.match(rc.payload_sha256, /^[0-9a-f]{64}$/);
    assert.equal(rc.approval.by, "tap", "approved by the person's tap on the card, never a text yes (Option A #162; bound text yes #165)");
    assert.equal(rc.approval.payload_hash, rc.payload_sha256, "the card's hash is the approved payload's");
    assert.match(rc.card.reply, /^1 approved exactly as shown\. Nothing has gone to an employer yet\./);
    assert.deepEqual(rc.steps.map((s) => s.step), ["prepare", "asked_once", "prepare_again", "card", "verify_approved_equals_page"]);
    assert.ok(rc.steps.find((s) => s.step === "verify_approved_equals_page").ok);
    const byId = Object.fromEntries(rc.fields.map((f) => [f.id, f]));
    for (const [id, want] of [["first_name", "Alex"], ["last_name", "Testcase"], ["email", "alex.testcase@example.test"], ["question_9668368101", "United States"]]) {
      assert.equal(byId[id].value, want, id);
      assert.equal(byId[id].read_back, want, id);
      assert.ok(byId[id].source_fact_id, id);
    }
    assert.equal(byId.country.filled, false, "the persona states no country: left empty, never guessed");
  }
  assert.equal(new Set(r.receipts.map((x) => x.payload_sha256_without_expiry)).size, 1);
  assert.equal(new Set(r.receipts.map((x) => x.approval.engine_approval)).size, 1);
});

test("a form asking what the persona never stated stops at needs_answers, nothing sent", async () => {
  const r = await run(["--form", "lever-cgsfederal-0130d854-9bae-48d4-8ef0-e9da1ee778a5", "--fixture-submit"]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /RUN 1\/1: stopped_needs_answers/);
  assert.match(r.stdout, /Please provide your physical address/);
  assert.equal(r.receipts.length, 0);
});

// FEATURE 2 (script submit binding): the Greenhouse form submits from the employer's script; the cloud worker clicks the
// employer's own Submit and the engine lets exactly one request go, to the job's own route on the LOCAL fixture server,
// carrying exactly the approved answers.
test("captured Greenhouse form, 3 of 3 to fixture_submitted: the cloud worker's click, one bound request, the employer's confirmation", async () => {
  const r = await run(["--form", GH, "--apply-despite-screen", "--fixture-submit", "--repeat", "3"]);
  assert.equal(r.code, 0, r.stdout.slice(-3000) + r.stderr.slice(-1500));
  assert.match(r.stdout, /REPEAT 3\/3 clean, identical answers and payload across runs/);
  assert.equal(r.receipts.length, 3);
  for (const rc of r.receipts) {
    assert.equal(rc.outcome, "fixture_submitted");
    assert.equal(rc.local_employer_posts, 1, "exactly one request reached the local employer");
    assert.equal(rc.coverage.wrong, 0);
    assert.deepEqual(rc.steps.map((s) => s.step), ["prepare", "asked_once", "prepare_again", "card", "verify_approved_equals_page", "fixture_submit"]);
    assert.match(rc.destination, /^http:\/\/127\.0\.0\.1:\d+\/greenhouse-prolificacademicltd-4979452101 \(one request, sent by the page's own Submit\)$/);
    const f = rc.fixture;
    assert.equal(f.worker_state, "confirmed");
    assert.equal(f.confirmation_id, "FIXTURE-1");
    assert.equal(f.submit.post.mutations, 1);
    assert.equal(f.submit.post.bound_by, "script_submit_route");
    assert.deepEqual(f.submit.stopped_requests, []);
    assert.equal(f.submit.request_shape.content_type, "application/json");
    assert.ok(!/Alex|Testcase|example\.test/.test(JSON.stringify(f.submit.request_shape)), "keys only, never values");
    // What the local employer received is exactly the approved answers.
    const got = Object.fromEntries(f.posts[0].fields);
    for (const field of rc.fields.filter((x) => x.filled && x.id !== "resume")) assert.equal(got[field.id], field.value, field.id);
    assert.equal(got.resume.file, "test-persona-resume.pdf");
  }
});

test("captured Greenhouse form: an answer the page changed is stopped before anything leaves", async () => {
  const r = await run(["--form", GH, "--apply-despite-screen", "--fixture-submit", "--fixture-variant", "tamper"]);
  assert.equal(r.code, 0, r.stdout.slice(-3000) + r.stderr.slice(-1500));
  const [rc] = r.receipts;
  assert.equal(rc.outcome, "fixture_not_submitted:APPROVED_BODY_MISMATCH");
  assert.equal(rc.local_employer_posts, 0, "the local employer received nothing");
  assert.equal(rc.fixture.submit.post.mutations, 0);
  assert.deepEqual(rc.fixture.submit.stopped_requests.map((s) => s.why), ["approved_body_mismatch"]);
});

test("captured Greenhouse form: a second request from the page is stopped; the one approved application stands", async () => {
  const r = await run(["--form", GH, "--apply-despite-screen", "--fixture-submit", "--fixture-variant", "extra"]);
  assert.equal(r.code, 0, r.stdout.slice(-3000) + r.stderr.slice(-1500));
  const [rc] = r.receipts;
  assert.equal(rc.outcome, "fixture_submitted");
  assert.equal(rc.local_employer_posts, 1, "exactly one request reached the local employer");
  assert.equal(rc.fixture.submit.post.mutations, 1);
  assert.deepEqual(rc.fixture.submit.stopped_requests.map((s) => s.why), ["second_application_request"]);
});
