"use strict";
// The apply engine's review fixes (architect, 2026-10-19), each from the safety review of scripts/apply.ts, against a
// local fixture server with synthetic facts only. Nothing here reaches a real employer.
//   - a normal redirect after the submit (303 to a thank-you page) is the employer's acknowledgement, not "unknown"
//   - a submit the engine refused before anything left the browser is "not sent", and the posting can be tried again
//   - the employer's own hidden fields are shown in the review and sent unchanged; a hidden field that consents on the
//     person's behalf still stops
//   - a verification on the page is handed to the person (--handoff) and the run continues on the same page
//   - a form asking for an identity number stops before anything is filled
//   - a confirmed "Yes" checks a required consent box
//   - --state-dir (another once-only record) is refused for a real employer
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

let server, base;
const receipts = [];
const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-apply-engine-test-"));
const THANKS = "<h1>Thank you for applying</h1><p>Application received. Confirmation number: TEST-303.</p>";

function form(action, extra = "", script = "") {
  return `<!doctype html><h1>TEST role</h1><form method="post" action="${action}" enctype="multipart/form-data">` +
    `<label for="first">First name</label><input name="first_name" id="first" required>` +
    `<label for="last">Last name</label><input name="last_name" id="last" required>` +
    `<label for="email">Email</label><input name="email" type="email" id="email" required>` +
    `<label for="resume">Resume</label><input type="file" id="resume" name="resume" required>` +
    `${extra}<button type="submit">Submit application</button></form>${script}`;
}
const pages = {
  "/redirect-ack": form("/submit-303"),
  "/tracker": form(
    "/submit",
    "",
    `<script>document.querySelector("form").addEventListener("submit", (e) => {
    const i = document.createElement("input"); i.type = "hidden"; i.name = "tracker"; i.value = "added-on-submit";
    e.target.appendChild(i); });</script>`,
  ),
  "/employer-hidden": form(
    "/submit",
    `<input type="hidden" name="cards[abc][baseTemplate]" value='{"k":1}'>` +
      `<input type="hidden" name="accountId" value="acct-1"><input type="hidden" name="consent[marketing]" value="0">`,
  ),
  "/hidden-consent": form("/submit", `<input type="hidden" name="consent" value="yes">`),
  "/challenge": form(
    "/submit",
    `<div id="challenge-form">Verify you are human</div>`,
    `<script>setTimeout(() => document.getElementById("challenge-form").remove(), 4000);</script>`,
  ),
  "/ssn": form("/submit", `<label for="ssn">Social Security Number</label><input id="ssn" name="ssn" required>`),
  "/agree": form(
    "/submit",
    `<label for="agree">I agree to the privacy policy</label><input type="checkbox" id="agree" name="agree" required>`,
  ),
};

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === "POST") {
      const parts = [];
      for await (const c of req) parts.push(c);
      const data = await new Response(Buffer.concat(parts), {
        headers: { "content-type": req.headers["content-type"] },
      }).formData();
      const fields = {};
      for (const [k, v] of data.entries()) if (typeof v === "string") fields[k] = v;
      receipts.push({ url: req.url, fields });
      if (req.url === "/submit-303") {
        res.writeHead(303, { Location: "/thanks" }).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" }).end(THANKS);
      return;
    }
    if (req.url === "/thanks") {
      res.writeHead(200, { "Content-Type": "text/html" }).end(THANKS);
      return;
    }
    const html = pages[req.url];
    res.writeHead(html ? 200 : 404, { "Content-Type": "text/html" }).end(html || "not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});

function packet(dir, saved = {}) {
  const answers = { first_name: "Mary Jane", last_name: "Doe", email: "synthetic@example.test" };
  const facts = {
    user_id: "TEST-OWNER",
    answers: Object.fromEntries(
      Object.entries(answers).map(([k, value], i) => [k, { value, factId: "TEST-FACT-" + i, confirmed: true }]),
    ),
    saved: Object.fromEntries(
      Object.entries(saved).map(([k, value], i) => [k, { value, factId: "TEST-SAVED-" + i, confirmed: true }]),
    ),
  };
  fs.writeFileSync(path.join(dir, "facts.json"), JSON.stringify(facts));
  fs.writeFileSync(path.join(dir, "synthetic.pdf"), "%PDF-1.4 SYNTHETIC TEST RESUME\n");
}

// prompts: [text the CLI prints, line the test answers, delay in ms]
async function run({ route, url, flags = [], prompts = [], dir, saved, stateDir = true }) {
  dir = dir || fs.mkdtempSync(path.join(root, "case-"));
  if (!fs.existsSync(path.join(dir, "facts.json"))) packet(dir, saved);
  const args = [
    "run",
    "-A",
    path.join(__dirname, "../scripts/apply.ts"),
    "--url",
    url || base + route,
    "--facts",
    path.join(dir, "facts.json"),
    "--resume",
    path.join(dir, "synthetic.pdf"),
    ...(stateDir ? ["--state-dir", path.join(dir, "state")] : []),
    "--evidence-dir",
    path.join(dir, "evidence-" + Date.now()),
    ...flags,
  ];
  const p = spawn(process.env.DENO_BIN || "deno", args, { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "";
  const pending = prompts.slice();
  p.stdout.on("data", (b) => {
    out += b;
    while (pending.length && out.includes(pending[0][0])) {
      const [, line, delay] = pending.shift();
      setTimeout(() => p.stdin.write(line + "\n"), delay || 0);
    }
  });
  p.stderr.on("data", (b) => (err += b));
  const timer = setTimeout(() => p.kill("SIGTERM"), 90000);
  const code = await new Promise((resolve, reject) => {
    p.once("error", reject);
    p.once("exit", resolve);
  });
  clearTimeout(timer);
  const line = out.split("\n").filter((l) => l.startsWith("RESULT ")).at(-1);
  return { code, out, err, dir, result: line ? JSON.parse(line.slice(7)) : null };
}
const SUBMIT = "Submit this application to ";

test("a 303 to the employer's thank-you page after the submit is an acknowledgement, not unknown", async () => {
  const n = receipts.length;
  const r = await run({ route: "/redirect-ack", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(receipts.length, n + 1, r.err);
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result));
  assert.equal(r.result.confirmation_id, "TEST-303");
});

test("a submit refused before anything left the browser is 'not sent', and the posting can be tried again", async () => {
  const n = receipts.length;
  const r = await run({ route: "/tracker", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(receipts.length, n, "the employer received nothing");
  assert.equal(r.result.state, "not_submitted", JSON.stringify(r.result));
  assert.equal(r.result.reason, "APPROVED_BODY_MISMATCH");
  const again = await run({ route: "/tracker", dir: r.dir, flags: ["--submit"], prompts: [[SUBMIT, "no"]] });
  assert.equal(
    again.result.reason,
    "user_declined",
    "the second try reaches the person's yes/no: " + JSON.stringify(again.result),
  );
});

test("the employer's own hidden fields are shown in the review and sent unchanged", async () => {
  const dry = await run({ route: "/employer-hidden" });
  assert.equal(dry.result.reason, "dry_run", JSON.stringify(dry.result) + dry.err);
  assert.match(dry.out, /Set by the employer's page/);
  assert.match(dry.out, /accountId = acct-1/);
  const n = receipts.length;
  const r = await run({ route: "/employer-hidden", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result));
  const got = receipts[n].fields;
  assert.equal(got.accountId, "acct-1");
  assert.equal(got["cards[abc][baseTemplate]"], '{"k":1}');
  assert.equal(got["consent[marketing]"], "0", "the employer's default declines marketing; it is sent as is");
});

test("a hidden field that consents on the person's behalf still stops before review", async () => {
  const n = receipts.length;
  const r = await run({ route: "/hidden-consent", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(receipts.length, n);
  assert.match(r.result.reason, /^UNCONFIRMED_HIDDEN_FIELD/);
});

test("a verification is handed to the person with --handoff and the run continues on the same page", async () => {
  const without = await run({ route: "/challenge" });
  assert.equal(without.result.state, "needs_user");
  assert.equal(without.result.reason, "captcha");
  const r = await run({ route: "/challenge", flags: ["--handoff"], prompts: [["Complete it yourself", "", 5000]] });
  assert.match(r.out, /A verification is showing in the browser window/);
  assert.equal(r.result.reason, "dry_run", JSON.stringify(r.result) + r.err);
});

test("a form asking for an identity number stops before anything is filled", async () => {
  const r = await run({ route: "/ssn" });
  assert.equal(r.result.state, "not_submitted");
  assert.equal(r.result.reason, "IDENTITY_NUMBER_REQUESTED", JSON.stringify(r.result));
  assert.ok(!/Mary Jane/.test(r.out), "nothing was filled or printed");
});

test("a confirmed Yes checks a required consent box", async () => {
  const n = receipts.length;
  const r = await run({
    route: "/agree",
    saved: { "i agree to the privacy policy": "Yes" },
    flags: ["--submit"],
    prompts: [[SUBMIT, "yes"]],
  });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err);
  assert.equal(receipts[n].fields.agree, "on");
});

test("--state-dir is refused for a real employer (one once-only record per person)", async () => {
  const r = await run({ url: "https://job-boards.greenhouse.io/acme/jobs/4000000001" });
  assert.equal(r.result.reason, "STATE_DIR_LOCAL_ONLY", JSON.stringify(r.result));
});
