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
//   - the page's own verification check (2026-10-19; every captured Greenhouse and Ashby form loads invisible reCAPTCHA
//     Enterprise and every Lever form an empty hCaptcha container, tests/fixtures/forms-ci/manifest.json): an empty
//     container or the invisible badge is not a challenge, the check talks to its provider, its token goes with the
//     approved form, and a challenge at the click waits for the person with --handoff. The provider here is a stand-in
//     on http://127.0.0.2:<port>/captcha-provider/ (a second origin; Chromium refuses localhost from 127.0.0.1 as a
//     private-network request), using the real token field names.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

let server, server2, base;
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
let providerChecks = 0;
const provider = () => "http://127.0.0.2:" + server2.address().port + "/captcha-provider";
// The Lever shape (captured): a hidden h-captcha-response input, a hidden submit button, an empty .h-captcha div and a
// visible type=button "Submit application" whose click runs the check and then presses the hidden submit.
const leverLike = (mode) =>
  `<!doctype html><h1>TEST role</h1><form id="application-form" enctype="multipart/form-data" method="POST">` +
  `<label for="first">First name</label><input name="first_name" id="first" required>` +
  `<label for="last">Last name</label><input name="last_name" id="last" required>` +
  `<label for="email">Email</label><input name="email" type="email" id="email" required>` +
  `<label for="resume">Resume</label><input type="file" id="resume" name="resume" required>` +
  `<input id="hcaptchaResponseInput" type="hidden" name="h-captcha-response" value="">` +
  `<button id="hcaptchaSubmitBtn" type="submit" style="display:none"></button>` +
  `<div id="h-captcha" class="h-captcha" data-sitekey="test-sitekey"></div>` +
  `<button id="btn-submit" type="button">Submit application</button></form>` +
  `<script src="${provider()}/hcaptcha.js"></script><script>
  document.getElementById("btn-submit").addEventListener("click", () => hcaptchaTest.execute(${JSON.stringify(mode)}, (t) => {
    document.getElementById("hcaptchaResponseInput").value = t; document.getElementById("hcaptchaSubmitBtn").click(); }));
  </script>`;
// The Greenhouse and Ashby shape: the invisible reCAPTCHA Enterprise badge (anchor frame, size=invisible) and a hidden
// g-recaptcha-response textarea the check fills at submit.
const enterpriseLike = () =>
  form(
    "/submit",
    `<textarea name="g-recaptcha-response" style="display:none"></textarea>`,
    `<div class="grecaptcha-badge" style="width:256px;height:60px;position:fixed;bottom:14px;right:-186px">` +
      `<iframe src="${provider()}/recaptcha/enterprise/anchor?k=test&size=invisible" width="256" height="60"></iframe></div>` +
      `<script src="${provider()}/recaptcha/enterprise.js"></script><script>
  const f = document.querySelector("form"), ta = document.querySelector("[name='g-recaptcha-response']");
  f.addEventListener("submit", (e) => { if (ta.value) return; e.preventDefault();
    grecaptchaTest.execute().then((t) => { ta.value = t; f.submit(); }); });
  </script>`,
  );
const PROVIDER_JS = `
async function check() { const r = await fetch(PROVIDER + "/check", { method: "POST" });
  return (await r.json()).token; }
`;
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
  "/broken-image": form("/submit", "", `<img src="http://127.0.0.1:9/logo.png" alt="logo">`),
  "/ssn": form("/submit", `<label for="ssn">Social Security Number</label><input id="ssn" name="ssn" required>`),
  "/agree": form(
    "/submit",
    `<label for="agree">I agree to the privacy policy</label><input type="checkbox" id="agree" name="agree" required>`,
  ),
};

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/captcha-provider/check") {
      providerChecks++;
      return res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
        .end(JSON.stringify({ token: "P1_TEST-TOKEN-" + "x".repeat(1800) }));
    }
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
    if (req.url.startsWith("/captcha-provider/")) {
      const P = provider();
      const js = (body) =>
        res.writeHead(200, { "Content-Type": "text/javascript", "Access-Control-Allow-Origin": "*" })
          .end(`const PROVIDER = ${JSON.stringify(P)};` + PROVIDER_JS + body);
      if (req.url === "/captcha-provider/hcaptcha.js") {
        return js(`window.hcaptchaTest = { execute(mode, cb) {
          if (mode !== "challenge") { check().then(cb); return; }
          const fr = document.createElement("iframe");
          fr.src = PROVIDER + "/frame?k=test#frame=challenge"; fr.width = 400; fr.height = 400;
          document.body.appendChild(fr);
          addEventListener("message", (m) => { if (m.data === "solved") { fr.remove(); check().then(cb); } });
        } };`);
      }
      if (req.url === "/captcha-provider/recaptcha/enterprise.js") {
        return js(`window.grecaptchaTest = { execute() { return check(); } };`);
      }
      if (req.url.startsWith("/captcha-provider/frame")) {
        // The person completing the challenge, six seconds after it shows.
        return res.writeHead(200, { "Content-Type": "text/html" })
          .end(`<p>challenge</p><script>setTimeout(() => parent.postMessage("solved", "*"), 6000)</script>`);
      }
      return res.writeHead(200, { "Content-Type": "text/html" }).end("<p>badge</p>");
    }
    const route = req.url.split("?")[0];
    if (route === "/lever-invisible") {
      return res.writeHead(200, { "Content-Type": "text/html" }).end(leverLike(new URL(req.url, base).searchParams.get("mode")));
    }
    if (route === "/enterprise-invisible") return res.writeHead(200, { "Content-Type": "text/html" }).end(enterpriseLike());
    const html = pages[req.url];
    res.writeHead(html ? 200 : 404, { "Content-Type": "text/html" }).end(html || "not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  server2 = http.createServer((req, res) => server.emit("request", req, res));
  await new Promise((r) => server2.listen(0, "127.0.0.2", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => server2.close(r));
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

test("an empty hCaptcha container is not a challenge; the invisible check runs at submit and its token goes with the form", async () => {
  const n = receipts.length, checks = providerChecks;
  const r = await run({ route: "/lever-invisible?mode=pass", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err);
  assert.match(r.out, /The page runs a verification check \(hcaptcha\)/);
  assert.equal(receipts.length, n + 1, "exactly one POST reached the employer");
  assert.equal(receipts[n].fields.first_name, "Mary Jane");
  assert.match(receipts[n].fields["h-captcha-response"], /^P1_TEST-TOKEN-/);
  assert.ok(providerChecks > checks, "the check reached its provider");
  const ev = fs.readFileSync(path.join(r.result.evidence_path, "evidence.json"), "utf8");
  assert.ok(!ev.includes("P1_TEST-TOKEN"), "the token itself is never recorded");
  assert.equal(JSON.parse(ev).verification_token.field, "h-captcha-response");
});

test("the invisible reCAPTCHA Enterprise badge is not a challenge, and its token goes with the approved form", async () => {
  const n = receipts.length;
  const r = await run({ route: "/enterprise-invisible", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err);
  assert.equal(receipts.length, n + 1);
  assert.match(receipts[n].fields["g-recaptcha-response"], /^P1_TEST-TOKEN-/);
});

test("a challenge at the click waits for the person with --handoff, then the one approved POST goes", async () => {
  const n = receipts.length;
  const without = await run({ route: "/lever-invisible?mode=challenge", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(without.result.state, "not_submitted", JSON.stringify(without.result));
  assert.equal(without.result.reason, "CAPTCHA_AT_SUBMIT");
  assert.equal(receipts.length, n, "nothing reached the employer");
  const r = await run({
    route: "/lever-invisible?mode=challenge",
    flags: ["--submit", "--handoff"],
    prompts: [[SUBMIT, "yes"], ["Complete it yourself", "", 8000]],
  });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err);
  assert.equal(receipts.length, n + 1, "exactly one POST");
  assert.match(receipts[n].fields["h-captcha-response"], /^P1_TEST-TOKEN-/);
});

test("an image host that refuses the connection fails that image, not the run", async () => {
  const r = await run({ route: "/broken-image" });
  assert.equal(r.result?.reason, "dry_run", JSON.stringify(r.result) + r.err.slice(-400));
});

test("--handoff without --headed is refused for a real employer (there is no window to complete a check in)", async () => {
  const r = await run({ url: "https://job-boards.greenhouse.io/acme/jobs/4000000001", flags: ["--handoff"], stateDir: false });
  assert.equal(r.result.reason, "HANDOFF_NEEDS_HEADED", JSON.stringify(r.result));
});
