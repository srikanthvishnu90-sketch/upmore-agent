"use strict";
// Resume upload on the captured forms (docs/apply/RESUME-UPLOAD.md). Every captured Greenhouse, Lever and Ashby
// application form (tests/fixtures/forms-ci) is served on localhost with its scripts removed, plus a TEST stand-in for
// what the employer's own upload widget does when a file is attached (tests/fixtures/resume-upload-server.cjs: modeled
// only on what the live run recorded). Each stand-in records which input's file it uploaded, so a test sees where the
// resume went.
//
// The resume is filled the way the desktop engine (scripts/apply.ts) and the worker fill it: module 150's board over
// the helper (scripts/career/portal-browser-helper.cjs). Nothing leaves localhost; the resume is a TEST file.
//   node --test tests/career-resume-upload.test.cjs        (as root: UPMORE_CHROMIUM_SANDBOX=off)
// RESUME_UPLOAD_OUT=<file> writes the per-family counts.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/forms-ci/manifest.json"), "utf8"));
const forms = manifest.forms.filter((f) => f.status === "application" && f.html && ["greenhouse", "lever", "ashby"].includes(f.family));

let PW = null;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try {
    require.resolve(id);
    PW = id;
    break;
  } catch { /* next */ }
}
if (PW && !process.env.UPMORE_PLAYWRIGHT_PATH) process.env.UPMORE_PLAYWRIGHT_PATH = PW;
const SKIP = PW ? false : "playwright is not resolvable here (set UPMORE_PLAYWRIGHT_PATH); nothing was downloaded";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-resume-upload-"));
const RESUME_PATH = path.join(tmp, "test-person-resume.pdf");
fs.writeFileSync(RESUME_PATH, "%PDF-1.4\n% TEST resume for the resume-upload measurement, not a real person\n");
const RESUME = { filename: "test-person-resume.pdf", sha256: crypto.createHash("sha256").update(fs.readFileSync(RESUME_PATH)).digest("hex") };
// The resume's own input on each family's form (tests/fixtures/extension/answer-key.json names it).
const OWN = { greenhouse: "resume", lever: "resume", ashby: "_systemfield_resume" };

let server, base;
const UPLOADS = path.join(tmp, "uploads.jsonl");
const uploadsNow = () => (fs.existsSync(UPLOADS) ? fs.readFileSync(UPLOADS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
// The server runs in its own process: module 150's board calls block this one while the browser works.
before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, "fixtures/resume-upload-server.cjs"), UPLOADS], { stdio: ["ignore", "pipe", "inherit"] });
  base = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("the TEST server did not report a port in 15 s")), 15000);
    server.stdout.on("data", (d) => {
      buf += d;
      const m = buf.match(/FIXTURE_PORT (\d+)/);
      if (m) (clearTimeout(timer), resolve("http://localhost:" + m[1]));
    });
    server.on("exit", () => (clearTimeout(timer), reject(new Error("the TEST server exited early"))));
  });
});
after(() => {
  if (BrowserBoard.shutdownAll) BrowserBoard.shutdownAll();
  if (server) server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
});

// One resume fill on one form through module 150's board: what the board reported, what it reads back, and every
// upload the employer's stand-in received.
function attach(f, variant = "") {
  const url = `${base}/${f.id}${variant ? "/" + variant : ""}`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "TEST-resume-upload", resumePath: RESUME_PATH, evidenceDir: tmp });
  const n = uploadsNow().length;
  try {
    board.open();
    const { fields } = board.form();
    const resume = fields.filter((x) => x.profile_key === "resume");
    assert.equal(resume.length, 1, `${f.id}: one field is the resume: ${JSON.stringify(resume.map((x) => x.label))}`);
    if (variant === "remount") {
      // A text field first, so the stand-in remounts the resume input after discovery (the live shape).
      const text = fields.find((x) => x.profile_key === "email");
      board.fill(text.field_id, "test.person@example.test");
    }
    const filled = board.fill(resume[0].field_id, RESUME);
    const read = board.answers();
    // The page's own upload is asynchronous: give the stand-in a moment to report it.
    const until = Date.now() + 1500;
    while (Date.now() < until && uploadsNow().length === n) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    return { filled, read: read[resume[0].field_id], failures: board.fillFailures.filter((x) => x.field_id === resume[0].field_id), uploads: uploadsNow().slice(n) };
  } finally {
    board.close();
  }
}

const results = [];
function judge(f, r) {
  const own = r.uploads.filter((x) => x.input === OWN[f.family] && x.sha256 === RESUME.sha256);
  const elsewhere = r.uploads.filter((x) => x.input !== OWN[f.family]);
  const ok = !!r.filled && !r.failures.length && own.length === 1 && !elsewhere.length && !!r.read && r.read.sha256 === RESUME.sha256;
  results.push({ form: f.id, family: f.family, ok, own: own.length, elsewhere: elsewhere.map((x) => x.input), failures: r.failures.map((x) => x.reason), read: !!r.read });
  return { own, elsewhere };
}

for (const f of forms) {
  test(`${f.family} ${f.company}: the resume goes once, into the resume's own upload, and the board says so truthfully`, { skip: SKIP, timeout: 180000 }, () => {
    const r = attach(f);
    const { own, elsewhere } = judge(f, r);
    assert.deepEqual(elsewhere.map((x) => x.input), [], "the resume never goes into another upload (a cover letter, another question, Ashby's autofill)");
    assert.equal(own.length, 1, "the employer's own upload of the resume happened exactly once");
    assert.deepEqual(r.failures, [], "the board does not report a resume the employer took as failed");
    assert.deepEqual(r.filled, RESUME, "the fill returns the approved resume");
    assert.equal(r.read?.sha256, RESUME.sha256, "the readback finds the resume the employer took");
  });
}

// A resume input remounted under a new id after discovery: re-found in the resume's own place, never "the first file
// input on the page" (Ashby's autofill comes first on every Ashby form).
for (const id of ["ashby-crusoe-b1b99030-d393-4329-80fe-5bc2e4c93b03", "ashby-snowflake-479e06f1-273d-4a1b-af56-6543761ebd75"]) {
  test(`remount: ${id.split("-")[1]}: a resume input remounted under a new id is re-found in its own question`, { skip: SKIP, timeout: 180000 }, () => {
    const f = forms.find((x) => x.id === id);
    const r = attach(f, "remount");
    const elsewhere = r.uploads.filter((x) => x.input !== OWN[f.family]);
    assert.deepEqual(elsewhere.map((x) => x.input), [], "never Ashby's autofill parser or another upload question");
    assert.equal(r.uploads.filter((x) => x.input === OWN[f.family] && x.sha256 === RESUME.sha256).length, 1);
    assert.deepEqual(r.failures, []);
  });
}

test("report: per family, in how many captured forms the resume attaches", { skip: SKIP }, () => {
  const fam = {};
  for (const r of results) {
    fam[r.family] ??= { forms: 0, attached: 0, wrong_input: 0, reported_failed: 0, no_readback: 0 };
    fam[r.family].forms++;
    if (r.ok) fam[r.family].attached++;
    if (r.elsewhere.length) fam[r.family].wrong_input++;
    if (r.failures.length) fam[r.family].reported_failed++;
    if (!r.read) fam[r.family].no_readback++;
  }
  console.log("RESUME_UPLOAD " + JSON.stringify({ families: fam, results }));
  if (process.env.RESUME_UPLOAD_OUT) fs.writeFileSync(process.env.RESUME_UPLOAD_OUT, JSON.stringify({ families: fam, results }, null, 1) + "\n");
  assert.equal(results.length, forms.length, "every captured form was run");
});
