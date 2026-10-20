"use strict";
// WO-096: the code an employer emails after the approved submit, read by the engine (scripts/apply.ts --email-code) from
// the person's own Gmail and typed into the page. A local fixture server stands for the employer (Greenhouse's two shapes:
// a separate code page, and the code box on the same form where the whole application goes again) and for Gmail's API
// (users.messages list and get, SYNTHETIC mail only). Nothing here reaches a real employer or a real mailbox.
//   - the approved submit, then the code from the mail sent after it, typed into the page: the employer confirms
//   - the code is in no record: evidence files, the engine's output, its state folder
//   - mail is never read before the person's yes, nor on a dry run
//   - an old code in the inbox is ignored; another sender's code is ignored; two different codes are never guessed
//   - no Google connection: the stop names what to do, and nothing more is sent
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const CODE = "Gh7kQ2mB", OLD = "Ol4dC0de", OTHER = "Zz9yX8wV";
const THANKS = "<h1>Thank you for applying</h1><p>Application received. Confirmation number: TEST-096.</p>";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-email-code-test-"));
let server, base;
const receipts = [], events = [];
// The fake mailbox and how the fake Gmail answers this run: ok, unauthorized (no grant), two (two different codes),
// stranger (the code comes from another sender).
let inbox = [], gmailMode = "ok", gmailCalls = 0;

const authFor = (domain) =>
  `mx.google.com; dkim=pass header.i=@${domain} header.s=s1 header.b=TEST; spf=pass smtp.mailfrom=${domain}; dmarc=pass (p=NONE) header.from=${domain}`;
function emailCode(code, at = Date.now(), from = "Greenhouse <no-reply@us.greenhouse-mail.io>") {
  const domain = from.split("@").pop().replace(/>$/, "");
  inbox.push({
    id: "TEST-MSG-" + inbox.length,
    internalDate: String(at),
    from,
    subject: "Security code for your application to TEST Employer",
    body: `Copy and paste this code into the security code field on your application: ${code}`,
    auth: authFor(domain),
  });
}
// The employer sending its code at the moment its page asks for it.
function employerSendsCode() {
  if (gmailMode === "two") {
    emailCode(CODE);
    emailCode(OTHER);
  } else if (gmailMode === "stranger") emailCode(CODE, Date.now(), "TEST Employer <jobs@employer.example>");
  else emailCode(CODE);
}

function form(action, extra = "", script = "") {
  return `<!doctype html><h1>TEST role</h1><form method="post" action="${action}" enctype="multipart/form-data">` +
    `<label for="first">First name</label><input name="first_name" id="first" required>` +
    `<label for="last">Last name</label><input name="last_name" id="last" required>` +
    `<label for="email">Email</label><input name="email" type="email" id="email" required>` +
    `<label for="resume">Resume</label><input type="file" id="resume" name="resume" required>` +
    `${extra}<button type="submit">Submit application</button></form>${script}`;
}
// /code-after: a separate code page. /code-inline: Greenhouse's shape, the code box on the same form, the whole
// application sent again with it.
const codePage = () =>
  `<!doctype html><h1>Check your email</h1><p>Enter the verification code we emailed you to finish your application.</p>` +
  `<form method="post" action="/verify-code" enctype="multipart/form-data">` +
  `<label for="code">Verification code</label><input id="code" name="security_code"><button type="submit">Verify</button></form>`;
const codeInline = () =>
  form(
    "/submit-inline",
    `<div id="code-box"></div>`,
    `<script>const f = document.querySelector("form");
  f.addEventListener("submit", async (e) => {
    if (document.getElementById("code")) return;
    e.preventDefault();
    const r = await fetch("/submit-inline", { method: "POST", body: new FormData(f) });
    if (!(await r.json()).code_required) return;
    document.getElementById("code-box").innerHTML = '<p>Enter the security code we emailed you.</p>' +
      '<label for="code">Security code</label><input id="code" name="security_code">';
  });</script>`,
  );

function gmail(req, res) {
  gmailCalls++;
  const u = new URL(req.url, base);
  events.push("gmail");
  if (req.headers.authorization !== "Bearer TEST-LOCAL-ONLY") return res.writeHead(401).end("{}");
  if (gmailMode === "unauthorized") return res.writeHead(401, { "Content-Type": "application/json" }).end('{"error":{"code":401}}');
  const id = u.pathname.split("/messages/")[1];
  if (!id) {
    const q = u.searchParams.get("q") || "";
    const after = Number(/after:(\d+)/.exec(q)?.[1] || 0) * 1000;
    const domains = (/from:\(([^)]*)\)/.exec(q)?.[1] || "").split(" OR ").filter(Boolean);
    const hits = inbox.filter((m) => Number(m.internalDate) >= after && domains.some((d) => m.from.includes(d)))
      .sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
    return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ messages: hits.map((m) => ({ id: m.id })) }));
  }
  const m = inbox.find((x) => x.id === decodeURIComponent(id));
  if (!m) return res.writeHead(404).end("{}");
  const b64 = Buffer.from(m.body).toString("base64url");
  return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
    id: m.id,
    internalDate: m.internalDate,
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "From", value: m.from }, { name: "Subject", value: m.subject }, { name: "Authentication-Results", value: m.auth }],
      body: { data: b64 },
    },
  }));
}

before(async () => {
  server = http.createServer(async (req, res) => {
    if (req.url.startsWith("/gmail/v1/users/me/messages")) return gmail(req, res);
    if (req.method === "POST") {
      const parts = [];
      for await (const c of req) parts.push(c);
      const data = await new Response(Buffer.concat(parts), { headers: { "content-type": req.headers["content-type"] } }).formData();
      const fields = {};
      for (const [k, v] of data.entries()) if (typeof v === "string") fields[k] = v;
      receipts.push({ url: req.url, fields });
      events.push("receipt:" + req.url);
      if (req.url === "/submit-code") {
        employerSendsCode();
        return res.writeHead(200, { "Content-Type": "text/html" }).end(codePage());
      }
      if (req.url === "/verify-code") {
        return res.writeHead(200, { "Content-Type": "text/html" }).end(fields.security_code === CODE ? THANKS : codePage());
      }
      if (req.url === "/submit-inline") {
        if (fields.security_code === CODE) return res.writeHead(200, { "Content-Type": "text/html" }).end(THANKS);
        if (!fields.security_code) employerSendsCode();
        return res.writeHead(200, { "Content-Type": "application/json" }).end('{"code_required":true}');
      }
      return res.writeHead(404).end();
    }
    if (req.url === "/code-after") return res.writeHead(200, { "Content-Type": "text/html" }).end(form("/submit-code"));
    if (req.url === "/code-inline") return res.writeHead(200, { "Content-Type": "text/html" }).end(codeInline());
    res.writeHead(404).end("not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});

function packet(dir) {
  const answers = { first_name: "Mary Jane", last_name: "Doe", email: "synthetic@example.test" };
  const facts = {
    user_id: "TEST-OWNER-096",
    answers: Object.fromEntries(Object.entries(answers).map(([k, value], i) => [k, { value, factId: "TEST-FACT-" + i, confirmed: true }])),
    saved: {},
  };
  fs.writeFileSync(path.join(dir, "facts.json"), JSON.stringify(facts));
  fs.writeFileSync(path.join(dir, "synthetic.pdf"), "%PDF-1.4 SYNTHETIC TEST RESUME\n");
}
async function run({ route, flags = [], prompts = [], wait = "0" }) {
  const dir = fs.mkdtempSync(path.join(root, "case-"));
  packet(dir);
  const args = [
    "run", "-A", path.join(__dirname, "../scripts/apply.ts"),
    "--url", base + route,
    "--facts", path.join(dir, "facts.json"),
    "--resume", path.join(dir, "synthetic.pdf"),
    "--state-dir", path.join(dir, "state"),
    "--evidence-dir", path.join(dir, "evidence"),
    ...flags,
  ];
  const env = { ...process.env, UPMORE_GMAIL_TEST_API: base + "/gmail/v1/users/me/messages", UPMORE_EMAIL_CODE_WAIT_MS: wait };
  const p = spawn(process.env.DENO_BIN || "deno", args, { env, stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "";
  const pending = prompts.slice();
  p.stdout.on("data", (b) => {
    out += b;
    while (pending.length && out.includes(pending[0][0])) {
      const [, line] = pending.shift();
      events.push("person:" + line);
      p.stdin.write(line + "\n");
    }
  });
  p.stderr.on("data", (b) => (err += b));
  const timer = setTimeout(() => p.kill("SIGTERM"), 120000);
  await new Promise((resolve, reject) => {
    p.once("error", reject);
    p.once("exit", resolve);
  });
  clearTimeout(timer);
  const line = out.split("\n").filter((l) => l.startsWith("RESULT ")).at(-1);
  return { out, err, dir, result: line ? JSON.parse(line.slice(7)) : null };
}
// Every file the run wrote (evidence and its once-only state), its output and its errors: none holds a code.
function scan(r, codes = [CODE, OTHER]) {
  const texts = [r.out, r.err];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!/\.png$/.test(e.name)) texts.push(fs.readFileSync(p, "utf8"));
    }
  };
  walk(r.dir);
  for (const t of texts) for (const c of codes) assert.ok(!t.includes(c), "a code is in a record: " + t.slice(0, 200));
  return JSON.parse(fs.readFileSync(path.join(r.dir, "evidence", "evidence.json"), "utf8"));
}
const SUBMIT = "Submit this application to ";
const fresh = (mode = "ok") => {
  inbox = [];
  gmailMode = mode;
  events.length = 0;
  gmailCalls = 0;
};

test("Greenhouse's code box on the form: after the person's yes, the code from their mail is typed and the employer confirms", async () => {
  fresh();
  emailCode(OLD, Date.now() - 10 * 60_000); // an earlier application's code, still in the inbox
  const n = receipts.length;
  const r = await run({ route: "/code-inline", flags: ["--submit", "--email-code", "local-gmail"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err.slice(-400));
  assert.deepEqual(receipts.slice(n).map((x) => x.url), ["/submit-inline", "/submit-inline"], "the application, then once more with its code");
  assert.equal(receipts[n + 1].fields.security_code, CODE, "the new code, not the old one, reached the employer");
  assert.equal(receipts[n + 1].fields.email, "synthetic@example.test", "the second send carries the approved answers unchanged");
  const ev = scan(r, [CODE, OLD, OTHER]);
  assert.equal(ev.code_auto.status, "found");
  assert.equal(ev.code_auto.typed, true);
  assert.deepEqual(ev.code_requests.map((x) => x.keys.includes("security_code")), [true]);
  // The approval law: the mailbox is read only after the person's yes and the approved submit.
  const firstRead = events.indexOf("gmail");
  assert.ok(firstRead > events.indexOf("person:yes") && firstRead > events.indexOf("receipt:/submit-inline"), events.join(" "));
});

test("a separate code page: the code alone goes to the employer's own site, once", async () => {
  fresh();
  const n = receipts.length;
  const r = await run({ route: "/code-after", flags: ["--submit", "--email-code", "local-gmail"], prompts: [[SUBMIT, "yes"]] });
  assert.equal(r.result.state, "confirmed", JSON.stringify(r.result) + r.err.slice(-400));
  assert.deepEqual(receipts.slice(n).map((x) => x.url), ["/submit-code", "/verify-code"]);
  assert.equal(receipts[n + 1].fields.security_code, CODE);
  const ev = scan(r);
  assert.deepEqual(ev.code_requests.map((x) => [x.url.replace(/^.*\/\/[^/]+/, ""), x.keys]), [["/verify-code", ["security_code"]]]);
});

test("a dry run, or a person who says no, never reads the mailbox", async () => {
  fresh();
  const dry = await run({ route: "/code-inline", flags: ["--email-code", "local-gmail"] });
  assert.equal(dry.result.reason, "dry_run", JSON.stringify(dry.result) + dry.err.slice(-300));
  const no = await run({ route: "/code-inline", flags: ["--submit", "--email-code", "local-gmail"], prompts: [[SUBMIT, "no"]] });
  assert.equal(no.result.reason, "user_declined");
  assert.equal(gmailCalls, 0);
});

test("no Google connection: the stop names what to do, and the code page is left for the person", async () => {
  fresh("unauthorized");
  const n = receipts.length;
  const r = await run({ route: "/code-after", flags: ["--submit", "--email-code", "local-gmail"], prompts: [[SUBMIT, "yes"]] });
  assert.deepEqual([r.result.state, r.result.reason], ["needs_user", "email_code"], JSON.stringify(r.result));
  assert.equal(r.result.stop, "Connect Google so I can read the code Greenhouse emails you, or type the code on the page yourself.");
  assert.deepEqual(receipts.slice(n).map((x) => x.url), ["/submit-code"], "nothing went after the application");
  assert.equal(scan(r).code_auto.status, "no_google_connection");
});

test("without --email-code the stop still says how: connect Google, or type the code", async () => {
  fresh();
  const r = await run({ route: "/code-after", flags: ["--submit"], prompts: [[SUBMIT, "yes"]] });
  assert.deepEqual([r.result.state, r.result.reason], ["needs_user", "email_code"], JSON.stringify(r.result));
  assert.match(r.result.stop, /^Connect Google so I can read the code Greenhouse emails you, or type the code/);
  assert.equal(gmailCalls, 0);
});

test("two different codes are never guessed between; another sender's code is never used", async () => {
  fresh("two");
  let n = receipts.length;
  const two = await run({ route: "/code-inline", flags: ["--submit", "--email-code", "local-gmail"], prompts: [[SUBMIT, "yes"]] });
  assert.deepEqual([two.result.state, two.result.reason], ["needs_user", "email_code"], JSON.stringify(two.result));
  assert.match(two.result.stop, /didn't guess/);
  assert.deepEqual(receipts.slice(n).map((x) => x.url), ["/submit-inline"], "no code was sent");
  assert.equal(scan(two).code_auto.status, "ambiguous");
  fresh("stranger");
  n = receipts.length;
  const stranger = await run({ route: "/code-inline", flags: ["--submit", "--email-code", "local-gmail"], prompts: [[SUBMIT, "yes"]] });
  assert.deepEqual([stranger.result.state, stranger.result.reason], ["needs_user", "email_code"], JSON.stringify(stranger.result));
  assert.match(stranger.result.stop, /type the code on the page yourself/i);
  assert.deepEqual(receipts.slice(n).map((x) => x.url), ["/submit-inline"]);
  assert.equal(scan(stranger).code_auto.status, "not_yet");
});

test("the local Gmail stand-in is for local test pages only", async () => {
  fresh();
  const dir = fs.mkdtempSync(path.join(root, "case-"));
  packet(dir);
  const r = await new Promise((resolve) => {
    const p = spawn(process.env.DENO_BIN || "deno", [
      "run", "-A", path.join(__dirname, "../scripts/apply.ts"),
      "--url", "https://job-boards.greenhouse.io/testemployer/jobs/123",
      "--facts", path.join(dir, "facts.json"), "--resume", path.join(dir, "synthetic.pdf"), "--email-code", "local-gmail",
    ], { env: { ...process.env, UPMORE_GMAIL_TEST_API: base + "/gmail/v1/users/me/messages" } });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.once("exit", () => resolve(out));
  });
  assert.match(r, /LOCAL_GMAIL_LOCAL_ONLY/);
  assert.equal(gmailCalls, 0);
});
