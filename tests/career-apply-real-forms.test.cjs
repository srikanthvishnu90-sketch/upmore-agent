"use strict";
// The regression floor for the apply engine (owner's build standard, section 9): every captured real application form
// (tests/fixtures/forms-ci, rendered from live employer pages) is served locally with its scripts removed and run
// through scripts/apply.ts in its default dry run, with synthetic confirmed facts only. Nothing is sent anywhere.
//
// What it proves: the engine can read and bind every captured form and gets as far as the form allows today. Each
// form's outcome is pinned in EXPECTED; a change to any outcome fails until EXPECTED is updated in the same commit,
// so an improvement is recorded and a regression is caught. Outcomes that mean the engine could not read the form at
// all (an unnamed or ambiguous field, a crash) are never allowed.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const dir = path.join(__dirname, "fixtures/forms-ci");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const forms = manifest.forms.filter((f) => f.status === "application" && f.html);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-real-forms-"));
let server, base;

// Pinned outcome per captured form: the result's reason. Update in the same commit as the engine change that moves it.
const EXPECTED = require("./fixtures/real-forms-expected.json");
const NEVER = /^(UNNAMED_REQUIRED_FIELD|AMBIGUOUS_FIELD_NAME|DRIVER_ERROR|FIELD_DID_NOT_PERSIST|READBACK_MISMATCH)/;

// Scripts, stylesheets and outside images are removed: the captured DOM is the rendered form, and the run stays local.
const strip = (h) =>
  h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "")
    .replace(/\s(src|srcset)="https?:[^"]*"/gi, "");

before(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== "GET") return res.writeHead(405).end();
    const f = forms.find((x) => "/" + x.id === req.url.split("?")[0]);
    if (!f) return res.writeHead(404).end("not found");
    res.writeHead(200, { "Content-Type": "text/html" }).end(strip(fs.readFileSync(path.join(dir, f.html), "utf8")));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
  const facts = {
    user_id: "TEST-REAL-FORMS",
    answers: Object.fromEntries(
      Object.entries({
        first_name: "Synthetic",
        last_name: "Tester",
        full_name: "Synthetic Tester",
        email: "synthetic@example.test",
      }).map(([k, value], i) => [k, { value, factId: "TEST-FACT-" + i, confirmed: true }]),
    ),
    saved: {},
  };
  fs.writeFileSync(path.join(root, "facts.json"), JSON.stringify(facts));
  fs.writeFileSync(path.join(root, "synthetic.pdf"), "%PDF-1.4 SYNTHETIC TEST RESUME\n");
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});

function dryRun(id) {
  const caseDir = fs.mkdtempSync(path.join(root, "case-"));
  const args = [
    "run",
    "-A",
    path.join(__dirname, "../scripts/apply.ts"),
    "--url",
    base + "/" + id,
    "--facts",
    path.join(root, "facts.json"),
    "--resume",
    path.join(root, "synthetic.pdf"),
    "--state-dir",
    path.join(caseDir, "state"),
    "--evidence-dir",
    path.join(caseDir, "evidence"),
  ];
  return new Promise((resolve) => {
    const p = spawn(process.env.DENO_BIN || "deno", args, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timer = setTimeout(() => p.kill("SIGTERM"), 120000);
    p.once("exit", () => {
      clearTimeout(timer);
      const line = out.split("\n").filter((l) => l.startsWith("RESULT ")).at(-1);
      resolve({ result: line ? JSON.parse(line.slice(7)) : null, out, err });
    });
  });
}

test("every captured application form has a pinned outcome", () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), forms.map((f) => f.id).sort());
});

for (const f of forms) {
  test(`${f.family} ${f.company}: the dry run ends where the form allows today`, async () => {
    const r = await dryRun(f.id);
    assert.ok(r.result, "the run printed a result: " + r.err.slice(-600));
    const reason = String(r.result.reason || r.result.state);
    assert.ok(!NEVER.test(reason), `the engine could not read the form: ${reason}`);
    assert.equal(reason.split(":")[0], EXPECTED[f.id], JSON.stringify(r.result));
  });
}
