"use strict";
// WO-021 end to end against a local employer page, real engine and real Chromium, synthetic facts only:
// prepare (the engine's dry run) -> the card and the payload -> run that approved payload -> the employer receives exactly
// the approved answers once, with no second question. A payload whose answer was changed after the approval is stopped
// by the engine with nothing sent.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

let server, base;
const receipts = [];
const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-approve-first-"));
const PAGE = `<!doctype html><h1>TEST role</h1><form method="post" action="/submit" enctype="multipart/form-data">` +
  `<label for="first">First name</label><input name="first_name" id="first" required>` +
  `<label for="email">Email</label><input name="email" type="email" id="email" required>` +
  `<label for="auth">Are you authorized to work in the United States?</label>` +
  `<select name="auth" id="auth" required><option value="">Select</option><option value="1">Yes</option><option value="0">No</option></select>` +
  `<label for="resume">Resume</label><input type="file" id="resume" name="resume" required>` +
  `<button type="submit">Submit application</button></form>`;
const THANKS = "<h1>Thank you for applying</h1><p>Application received. Confirmation number: TEST-21.</p>";

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === "POST") {
      const parts = [];
      for await (const c of req) parts.push(c);
      const data = await new Response(Buffer.concat(parts), { headers: { "content-type": req.headers["content-type"] } })
        .formData();
      const fields = {};
      for (const [k, v] of data.entries()) if (typeof v === "string") fields[k] = v;
      receipts.push(fields);
      return res.writeHead(200, { "Content-Type": "text/html" }).end(THANKS);
    }
    res.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/job";
  const facts = {
    user_id: "TEST-OWNER",
    answers: {
      first_name: { value: "Mary Jane", factId: "TEST-1", confirmed: true },
      email: { value: "synthetic@example.test", factId: "TEST-2", confirmed: true },
    },
    saved: { "are you authorized to work in the united states": { value: "Yes", factId: "TEST-3", confirmed: true } },
  };
  fs.writeFileSync(path.join(root, "facts.json"), JSON.stringify(facts));
  fs.writeFileSync(path.join(root, "synthetic.pdf"), "%PDF-1.4 SYNTHETIC TEST RESUME\n");
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});

function cli(args) {
  return new Promise((resolve) => {
    const p = spawn(process.env.DENO_BIN || "deno", ["run", "-A", path.join(__dirname, "../workers/career-browser/approve-first.ts"), ...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timer = setTimeout(() => p.kill("SIGTERM"), 120000);
    p.once("exit", () => {
      clearTimeout(timer);
      resolve({ out, err });
    });
  });
}
const tagged = (out, tag) => JSON.parse(out.split("\n").find((l) => l.startsWith(tag + " ")).slice(tag.length + 1));

async function prepared() {
  const state = fs.mkdtempSync(path.join(root, "state-"));
  const r = await cli([
    "prepare",
    base,
    path.join(root, "facts.json"),
    path.join(root, "synthetic.pdf"),
    "1",
    "1",
    "--state-dir",
    state,
  ]);
  return { prep: tagged(r.out, "PREPARED"), state, err: r.err };
}

test("prepare, approve, run: the employer receives exactly the approved answers, once, with no second question", async () => {
  const { prep, state, err } = await prepared();
  assert.equal(prep.ready, true, JSON.stringify(prep) + err.slice(-300));
  assert.ok(prep.card.includes("Are you authorized to work in the United States?: Yes"), prep.card.join(" | "));
  assert.ok(!prep.card.some((l) => /: 1$/.test(l)), "a select reads as the person chose it, never its internal value");
  assert.equal(prep.card.filter((l) => l.startsWith("Resume")).length, 1, "the resume once, by name");
  const file = path.join(root, "payload-ok.json");
  fs.writeFileSync(file, JSON.stringify(prep.payload));
  const n = receipts.length;
  const r = await cli(["run-one", file, path.join(root, "synthetic.pdf"), "--state-dir", state]);
  const ran = tagged(r.out, "RAN");
  assert.equal(ran[0].state, "confirmed", JSON.stringify(ran) + r.err.slice(-300));
  assert.equal(receipts.length, n + 1, "one application reached the employer");
  assert.deepEqual(
    { first_name: receipts[n].first_name, email: receipts[n].email, auth: receipts[n].auth },
    { first_name: "Mary Jane", email: "synthetic@example.test", auth: "1" },
  );
});

test("an approved payload whose answer changed after the approval is stopped by the engine, nothing sent", async () => {
  const { prep, state } = await prepared();
  assert.equal(prep.ready, true);
  prep.payload.fields.find((f) => f.name === "email").value = "someone-else@example.test";
  const file = path.join(root, "payload-changed.json");
  fs.writeFileSync(file, JSON.stringify(prep.payload));
  const n = receipts.length;
  const r = await cli(["run-one", file, path.join(root, "synthetic.pdf"), "--state-dir", state]);
  const ran = tagged(r.out, "RAN");
  assert.equal(ran[0].state, "not_submitted", JSON.stringify(ran));
  assert.equal(ran[0].reason, "APPROVED_APPLICATION_CHANGED");
  assert.equal(receipts.length, n, "the employer received nothing");
});
