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
let providerChecks = 0, personGo = false, graphqlWrites = 0;
const uploads = [];
// The Lever shape (captured): the resume is parsed as soon as it is chosen, and the page sets a hidden resumeStorageId
// from the employer's answer. ?extra=1: the page also puts an answer into the upload.
const leverUpload = (extra) =>
  form(
    "/submit",
    `<input type="hidden" name="resumeStorageId" value="">`,
    `<script>document.getElementById("resume").addEventListener("change", async (e) => {
      const fd = new FormData(); fd.append("resume", e.target.files[0]);
      ${extra ? 'fd.append("email", document.getElementById("email").value);' : ""}
      const r = await fetch("/parseResume", { method: "POST", body: fd });
      if (r.ok) document.querySelector("[name=resumeStorageId]").value = (await r.json()).storageId;
    });</script>`,
  );
const jsonReceipts = [];
// After the submit the employer emails a code and the page asks for it. The stand-in for the person types it when the
// test says the engine asked. /code-after: a separate code page (the code alone goes). /code-inline: Greenhouse's shape,
// where the code box appears on the same form and the whole application goes again with it; ?tamper=1 changes the
// email before it goes.
const CODE = "TEST-CODE-482913";
const PERSON_TYPES = (then) => `const poll = setInterval(async () => {
    if ((await (await fetch("/__person")).text()) !== "go") return;
    clearInterval(poll); document.getElementById("code").value = ${JSON.stringify(CODE)}; ${then} }, 300);`;
const codePage = () =>
  `<!doctype html><h1>Check your email</h1><p>Enter the verification code we emailed you to finish your application.</p>` +
  `<form method="post" action="/verify-code" enctype="multipart/form-data">` +
  `<label for="code">Verification code</label><input id="code" name="security_code"><button type="submit">Verify</button>` +
  `</form><script>${PERSON_TYPES('document.querySelector("form").submit();')}</script>`;
const codeInline = (tamper) =>
  form(
    "/submit-inline",
    `<div id="code-box"></div>`,
    `<script>const f = document.querySelector("form");
  f.addEventListener("submit", async (e) => {
    if (document.getElementById("code")) return;
    e.preventDefault();
    const r = await fetch("/submit-inline", { method: "POST", body: new FormData(f) });
    if (!(await r.json()).code_required) return;
    document.getElementById("code-box").innerHTML = '<p>Enter the verification code we emailed you.</p>' +
      '<label for="code">Security code</label><input id="code" name="security_code">';
    ${PERSON_TYPES((tamper ? 'document.getElementById("email").value = "attacker@example.test"; ' : "") + "f.submit();")}
  });</script>`,
  );
// An Ashby-shaped page: no <form>; the fields come from a GraphQL query posted to the page's own origin, a tracking
// mutation fires at load, and "Submit application" sends JSON by script (resume as base64). The stand-in for the
// person polls /__person and presses Submit only when the test says the engine asked for it.
const spa = (tamper) => `<!doctype html><h1>TEST role</h1><div id="app">loading</div><script>
const gql = (body) => fetch("/api/non-user-graphql", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body) });
gql({ operationName: "Track", query: "mutation Track { track }" }).catch(() => {});
gql({ operationName: "ApiJobPosting", query: "query ApiJobPosting { form { fields } }" }).then((r) => r.json()).then((d) => {
  document.getElementById("app").innerHTML = d.fields.map((f) => f.type === "file"
    ? '<label for="' + f.id + '">' + f.label + '</label><input type="file" id="' + f.id + '" required>'
    : '<label for="' + f.id + '">' + f.label + '</label><input id="' + f.id + '" type="' + f.type + '" required>').join("") +
    '<button type="button" id="go">Submit application</button>';
  document.getElementById("go").onclick = async () => {
    const file = document.getElementById("_systemfield_resume").files[0];
    const b64 = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
    const v = (id) => document.getElementById(id).value;
    const r = await fetch("/api/apply", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { first_name: v("first_name"), last_name: v("last_name"),
        email: ${tamper ? '"attacker@example.test"' : 'v("email")'} }, resume: { name: file.name, content: b64 } }) });
    if (r.ok) document.body.innerHTML = ${JSON.stringify(THANKS)};
  };
  const poll = setInterval(async () => {
    if ((await (await fetch("/__person")).text()) === "go") { clearInterval(poll); document.getElementById("go").click(); }
  }, 300);
});
</script>`;
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
    if (req.url === "/__person") return res.writeHead(200).end(personGo ? "go" : "wait");
    if (req.method === "POST" && req.url === "/parseResume") {
      const parts = [];
      for await (const c of req) parts.push(c);
      const data = await new Response(Buffer.concat(parts), { headers: { "content-type": req.headers["content-type"] } })
        .formData();
      uploads.push([...data.keys()]);
      return res.writeHead(200, { "Content-Type": "application/json" }).end('{"storageId":"TEST-STORE-7f3a"}');
    }
    if (req.method === "POST" && (req.url === "/api/non-user-graphql" || req.url === "/api/apply")) {
      const parts = [];
      for await (const c of req) parts.push(c);
      const body = JSON.parse(Buffer.concat(parts).toString());
      if (req.url === "/api/apply") {
        jsonReceipts.push(body);
        return res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
      }
      if (/\bmutation\b/.test(body.query)) graphqlWrites++;
      return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        fields: [
          { id: "first_name", label: "First name", type: "text" },
          { id: "last_name", label: "Last name", type: "text" },
          { id: "email", label: "Email", type: "email" },
          { id: "_systemfield_resume", label: "Resume", type: "file" },
        ],
      }));
    }
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
      if (req.url === "/submit-code") return res.writeHead(200, { "Content-Type": "text/html" }).end(codePage());
      if (req.url === "/verify-code") {
        return res.writeHead(200, { "Content-Type": "text/html" }).end(fields.security_code === CODE ? THANKS : codePage());
      }
      if (req.url === "/submit-inline" && fields.security_code !== CODE) {
        return res.writeHead(200, { "Content-Type": "application/json" }).end('{"code_required":true}');
      }
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
    if (route === "/lever-upload") {
      return res.writeHead(200, { "Content-Type": "text/html" })
        .end(leverUpload(new URL(req.url, base).searchParams.get("extra")));
    }
    if (route === "/code-after") return res.writeHead(200, { "Content-Type": "text/html" }).end(form("/submit-code"));
    if (route === "/code-inline") {
      return res.writeHead(200, { "Content-Type": "text/html" })
        .end(codeInline(new URL(req.url, base).searchParams.get("tamper")));
    }
    if (route === "/spa") {
      return res.writeHead(200, { "Content-Type": "text/html" }).end(spa(new URL(req.url, base).searchParams.get("tamper")));
    }
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
      Object.entries(answers).map(([k, value], i) => [k, { value, factId: "TEST-FACT-" + i, confirmed: true, provenance: "owner stated (TEST)", confirmation_event_id: "evt-TEST-FACT-" + i }]),
    ),
    saved: Object.fromEntries(
      Object.entries(saved).map(([k, value], i) => [k, { value, factId: "TEST-SAVED-" + i, confirmed: true, provenance: "owner stated (TEST)", confirmation_event_id: "evt-TEST-SAVED-" + i, authorizes: true }]),
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
      setTimeout(() => (typeof line === "function" ? line() : p.stdin.write(line + "\n")), delay || 0);
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

test("an Ashby-style form built by a GraphQL query renders; a GraphQL mutation never leaves before the yes", async () => {
  const writes = graphqlWrites;
  const r = await run({ route: "/spa", flags: ["--person-submits"] });
  assert.equal(r.result.reason, "dry_run", JSON.stringify(r.result) + r.err.slice(-400));
  assert.equal(graphqlWrites, writes, "the tracking mutation was stopped");
  const ev = JSON.parse(fs.readFileSync(path.join(r.result.evidence_path, "evidence.json"), "utf8"));
  assert.ok(ev.reads.includes("ApiJobPosting"), JSON.stringify(ev.reads));
});

test("a script-submitted form without --person-submits stops at SUBMIT_DESTINATION_NOT_BOUND", async () => {
  const r = await run({ route: "/spa" });
  assert.equal(r.result.reason, "SUBMIT_DESTINATION_NOT_BOUND", JSON.stringify(r.result));
});

test("--person-submits: the person's Submit sends one JSON request with the approved answers; its shape is kept, not its values", async () => {
  const n = jsonReceipts.length;
  personGo = false;
  const r = await run({
    route: "/spa",
    flags: ["--submit", "--person-submits"],
    prompts: [[SUBMIT, "yes"], ["Press Submit in the browser window", () => (personGo = true)]],
  });
  personGo = false;
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err.slice(-400));
  assert.equal(jsonReceipts.length, n + 1, "exactly one application reached the employer");
  assert.equal(jsonReceipts[n].fields.first_name, "Mary Jane");
  const ev = JSON.parse(fs.readFileSync(path.join(r.result.evidence_path, "evidence.json"), "utf8"));
  assert.deepEqual(ev.request_shape.keys, ["fields.email", "fields.first_name", "fields.last_name", "resume.content", "resume.name"]);
  assert.equal(ev.request_shape.content_type, "application/json");
  assert.ok(!/Mary Jane|synthetic@example/.test(JSON.stringify(ev.request_shape)), "no values in the recorded shape");
});

test("--person-submits: a request that changed an approved answer is stopped before it leaves", async () => {
  const n = jsonReceipts.length;
  personGo = false;
  const r = await run({
    route: "/spa?tamper=1",
    flags: ["--submit", "--person-submits"],
    prompts: [[SUBMIT, "yes"], ["Press Submit in the browser window", () => (personGo = true)]],
  });
  personGo = false;
  assert.equal(jsonReceipts.length, n, "the employer received nothing");
  assert.equal(r.result.state, "not_submitted", JSON.stringify(r.result));
  assert.equal(r.result.reason, "APPROVED_BODY_MISMATCH");
});

test("--person-submits without --headed is refused for a real employer", async () => {
  const r = await run({ url: "https://job-boards.greenhouse.io/acme/jobs/4000000001", flags: ["--person-submits"], stateDir: false });
  assert.equal(r.result.reason, "PERSON_SUBMITS_NEEDS_HEADED", JSON.stringify(r.result));
});

test("--approved: a dry run's approval hash lets the same application submit without asking again", async () => {
  const dry = await run({ route: "/employer-hidden" });
  const hash = dry.out.match(/Approval hash: ([0-9a-f]{64})/)[1];
  const n = receipts.length;
  const r = await run({ route: "/employer-hidden", dir: dry.dir, flags: ["--submit", "--approved", hash] });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err.slice(-300));
  assert.ok(!r.out.includes("Submit this application to"), "it did not ask again");
  assert.equal(receipts.length, n + 1);
});

test("--approved: an application that changed since the approval is stopped with nothing sent", async () => {
  const dry = await run({ route: "/employer-hidden" });
  const hash = dry.out.match(/Approval hash: ([0-9a-f]{64})/)[1];
  const facts = JSON.parse(fs.readFileSync(path.join(dry.dir, "facts.json"), "utf8"));
  facts.answers.email.value = "changed@example.test";
  fs.writeFileSync(path.join(dry.dir, "facts.json"), JSON.stringify(facts));
  const n = receipts.length;
  const r = await run({ route: "/employer-hidden", dir: dry.dir, flags: ["--submit", "--approved", hash] });
  assert.equal(r.result.reason, "APPROVED_APPLICATION_CHANGED", JSON.stringify(r.result));
  assert.equal(receipts.length, n, "the employer received nothing");
});

test("a resume upload while filling is stopped without a prior approval; the application still goes with its resume", async () => {
  const n = receipts.length, u = uploads.length;
  const r = await run({ route: "/lever-upload", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err.slice(-300));
  assert.equal(uploads.length, u, "no upload left before the person's yes");
  assert.equal(receipts[n].fields.resumeStorageId, "");
});

test("--approved: one upload carrying only the approved resume goes, and the id the employer answered goes with it", async () => {
  const dry = await run({ route: "/lever-upload" });
  const hash = dry.out.match(/Approval hash: ([0-9a-f]{64})/)[1];
  const n = receipts.length, u = uploads.length;
  const r = await run({ route: "/lever-upload", dir: dry.dir, flags: ["--submit", "--approved", hash] });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err.slice(-300));
  assert.equal(uploads.length, u + 1, "exactly one upload");
  assert.deepEqual(uploads[u], ["resume"]);
  assert.equal(receipts[n].fields.resumeStorageId, "TEST-STORE-7f3a");
  const ev = JSON.parse(fs.readFileSync(path.join(r.result.evidence_path, "evidence.json"), "utf8"));
  assert.deepEqual(ev.uploads.map((x) => x.keys), [["resume"]]);
});

test("--approved: an upload that carries more than the resume is stopped", async () => {
  const dry = await run({ route: "/lever-upload?extra=1" });
  const hash = dry.out.match(/Approval hash: ([0-9a-f]{64})/)[1];
  const n = receipts.length, u = uploads.length;
  const r = await run({ route: "/lever-upload?extra=1", dir: dry.dir, flags: ["--submit", "--approved", hash] });
  assert.equal(uploads.length, u, "the upload with an answer in it never left");
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result));
  assert.equal(receipts[n].fields.resumeStorageId, "");
});

const CODE_PROMPT = "The employer emailed you a verification code";
const noCode = (r) => {
  const ev = fs.readFileSync(path.join(r.result.evidence_path, "evidence.json"), "utf8");
  assert.ok(!ev.includes(CODE) && !r.out.includes(CODE) && !r.err.includes(CODE), "the code is nowhere in Trainee's records");
  return JSON.parse(ev);
};

test("a code emailed after the submit stops as needs_user without --handoff, and no second write leaves", async () => {
  personGo = false;
  const n = receipts.length;
  const r = await run({ route: "/code-after", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.deepEqual([r.result.state, r.result.reason], ["needs_user", "email_code"], JSON.stringify(r.result));
  assert.deepEqual(receipts.slice(n).map((x) => x.url), ["/submit-code"]);
});

test("--handoff: the person types the code into the page; one write goes, keys only kept, and the employer confirms", async () => {
  personGo = false;
  const n = receipts.length;
  const r = await run({
    route: "/code-after",
    flags: ["--submit", "--handoff"],
    prompts: [[SUBMIT, "yes"], [CODE_PROMPT, () => (personGo = true)], [CODE_PROMPT, "", 5000]],
  });
  personGo = false;
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err.slice(-300));
  assert.deepEqual(receipts.slice(n).map((x) => x.url), ["/submit-code", "/verify-code"], "the application once, the code once");
  assert.equal(receipts[n + 1].fields.security_code, CODE, "the code reached the employer from the person's page");
  const ev = noCode(r);
  assert.deepEqual(ev.code_requests.map((x) => [x.url.replace(/^.*\/\/[^/]+/, ""), x.keys]), [["/verify-code", ["security_code"]]]);
  assert.deepEqual(ev.code_handoff, { tries: 1, requests: 1 });
});

test("--handoff: a code box on the form that re-sends the application goes only with the approved answers", async () => {
  personGo = false;
  const n = receipts.length;
  const ok = await run({
    route: "/code-inline",
    flags: ["--submit", "--handoff"],
    prompts: [[SUBMIT, "yes"], [CODE_PROMPT, () => (personGo = true)], [CODE_PROMPT, "", 5000]],
  });
  personGo = false;
  assert.equal(ok.result.state, "confirmed", JSON.stringify(ok.result) + ok.err.slice(-300));
  assert.deepEqual(receipts.slice(n).map((x) => x.url), ["/submit-inline", "/submit-inline"]);
  assert.equal(receipts[n + 1].fields.email, "synthetic@example.test");
  assert.equal(noCode(ok).code_requests[0].resends, true);
  const m = receipts.length;
  const bad = await run({
    route: "/code-inline?tamper=1",
    flags: ["--submit", "--handoff"],
    prompts: [[SUBMIT, "yes"], [CODE_PROMPT, () => (personGo = true)], [CODE_PROMPT, "", 5000]],
  });
  personGo = false;
  assert.deepEqual([bad.result.state, bad.result.reason], ["needs_user", "email_code"], JSON.stringify(bad.result));
  assert.deepEqual(receipts.slice(m).map((x) => x.url), ["/submit-inline"], "the changed application never left");
  assert.equal(noCode(bad).code_handoff.refused, "CODE_REQUEST_CHANGED_APPLICATION");
});
