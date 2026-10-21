"use strict";
// WO-039: the cloud worker with the real engine (scripts/apply.ts, headless, sandboxed Chromium) against local forms.
// Each job is prepared by the engine's own dry run (approve-first prepare), then run by the cloud worker's runCloudJob
// with its real engine runner and an in-memory queue. Nothing leaves this machine.
//  - two people at once: every first page load arrives with no cookie, and each application carries only its own
//    person's cookie (a fresh browser context per job);
//  - a verification check at Submit: handed back as needs_user / bot_check, and nothing reaches the employer;
//  - an application changed after its approval: not sent;
//  - the facts and resume written for each job are gone afterwards.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-cloud-worker-"));
const requests = [];
let server, base;
const form = (challenge) =>
  `<!doctype html><h1>TEST role</h1><form method="post" action="/submit" enctype="multipart/form-data">` +
  `<label for="first">First name</label><input name="first_name" id="first" required>` +
  `<label for="email">Email</label><input name="email" type="email" id="email" required>` +
  `<label for="resume">Resume</label><input type="file" id="resume" name="resume" required>` +
  `<button type="submit"${challenge ? ` onclick="event.preventDefault();document.body.insertAdjacentHTML('beforeend','<div id=&quot;challenge-form&quot; style=&quot;width:300px;height:80px&quot;>Please complete the check</div>')"` : ""}>Submit application</button></form>`;

before(async () => {
  server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const c of req) parts.push(c);
    const u = new URL(req.url, "http://x");
    requests.push({ method: req.method, path: u.pathname, cookie: req.headers.cookie || "" });
    if (u.pathname.startsWith("/captcha-provider/")) return res.writeHead(200, { "Content-Type": "text/html" }).end("<p>Verify you are human</p>");
    if (req.method === "POST") {
      const data = await new Response(Buffer.concat(parts), { headers: { "content-type": req.headers["content-type"] } }).formData();
      requests.at(-1).first = data.get("first_name");
      return res.writeHead(200, { "Content-Type": "text/html" }).end("<h1>Thank you for applying</h1><p>Application received. Confirmation number: TEST-777.</p>");
    }
    const who = u.pathname.split("/")[2] || "x";
    res.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": `who=${who}; Path=/; HttpOnly` }).end(form(u.pathname.startsWith("/challenge")));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});

// The driver: prepare each job with the engine's dry run, then run them all through cloudLoop (2 contexts).
function drive(specs) {
  const dir = fs.mkdtempSync(path.join(root, "run-"));
  const repo = path.resolve(__dirname, "..");
  const driver = path.join(dir, "driver.ts");
  fs.writeFileSync(driver, `
import { prepare } from ${JSON.stringify("file://" + repo + "/workers/career-browser/approve-first.ts")};
import { cloudEngineRunner, cloudLoop } from ${JSON.stringify("file://" + repo + "/workers/career-cloud/worker.ts")};
const specs = JSON.parse(Deno.env.get("SPECS")!);
const dir = ${JSON.stringify(dir)};
const resume = dir + "/resume.pdf";
await Deno.writeTextFile(resume, "%PDF-1.4 SYNTHETIC TEST RESUME");
const bytes = await Deno.readFile(resume);
const engine = cloudEngineRunner({ root: ${JSON.stringify(repo)}, evidenceRoot: dir + "/evidence" });
await Deno.mkdir(dir + "/evidence", { mode: 0o700 });
const jobs = [];
for (const s of specs) {
  const facts = dir + "/facts-" + s.user + ".json";
  await Deno.writeTextFile(facts, JSON.stringify({ user_id: "TEST-" + s.user, answers: {
    first_name: { value: "TEST " + s.user, factId: "TEST-" + s.user + "-1", confirmed: true, provenance: "owner stated (TEST)", confirmation_event_id: "evt-TEST-" + s.user + "-1" },
    email: { value: s.user.toLowerCase() + "@example.test", factId: "TEST-" + s.user + "-2", confirmed: true, provenance: "owner stated (TEST)", confirmation_event_id: "evt-TEST-" + s.user + "-2" } }, saved: {} }));
  const p = await prepare({ url: s.url, factsPath: facts, resumePath: resume, account: { epoch: 1, version: 1 }, now: Date.now(), runEngine: engine });
  if (!p.ready) throw Error("not prepared: " + JSON.stringify(p.result));
  if (s.tamper) p.payload.fields[0].value = "TEST changed after approval";
  jobs.push({ id: "job-" + s.user, lease_token: "lease-" + s.user, user_id: "TEST-" + s.user, company: p.payload.company, url: s.url, payload: p.payload });
}
console.log("PREPARED");
const finished = [], tmpRoot = dir + "/tmp";
await Deno.mkdir(tmpRoot);
let pending = [...jobs];
const queue = {
  claim: async (n) => { const out = pending.slice(0, n); pending = pending.slice(n); return out; },
  resume: async () => ({ filename: "resume.pdf", sha256: jobs[0].payload.resume_sha256, b64: btoa(String.fromCharCode(...bytes)) }),
  finish: async (j, state, evidence, outcome, errorKind) => { finished.push({ id: j.id, state, outcome, errorKind, reason: evidence.reason }); },
  gatePresent: async () => true,
};
await cloudLoop({ queue, runEngine: engine, contexts: 2, idleMs: 50, tmpRoot, stop: () => finished.length === jobs.length, log: () => {} });
console.log("FINISHED " + JSON.stringify({ finished, left: [...Deno.readDirSync(tmpRoot)].length }));
`);
  return new Promise((resolve) => {
    const p = spawn(process.env.DENO_BIN || "deno", ["run", "-A", "--no-check", driver], {
      env: { ...process.env, SPECS: JSON.stringify(specs), HOME: dir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timer = setTimeout(() => p.kill("SIGKILL"), 240000);
    p.on("exit", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("FINISHED "));
      resolve({ out, err, done: line ? JSON.parse(line.slice(9)) : null });
    });
  });
}

test("WO-039 two people in parallel: fresh context per job, each application carries only its own person's cookie", async () => {
  const before = requests.length;
  const r = await drive([{ user: "A", url: base + "/form/A" }, { user: "B", url: base + "/form/B" }]);
  assert.ok(r.done, r.out + r.err);
  assert.deepEqual(r.done.finished.map((f) => [f.id, f.state, f.outcome]).sort(), [["job-A", "confirmed", "submitted"], ["job-B", "confirmed", "submitted"]]);
  assert.equal(r.done.left, 0, "the facts and resume of every job are removed");
  const mine = requests.slice(before);
  // The dry runs of prepare come first and use their own browsers too; every first load of a page has no cookie.
  const loads = mine.filter((q) => q.method === "GET" && q.path.startsWith("/form/"));
  assert.ok(loads.length >= 4 && loads.every((q) => q.cookie === ""), JSON.stringify(loads));
  const posts = mine.filter((q) => q.method === "POST");
  assert.equal(posts.length, 2, "one POST per application");
  for (const p of posts) {
    const who = p.first.replace("TEST ", "");
    assert.equal(p.cookie, `who=${who}`, `the application for ${who} carries only ${who}'s cookie`);
  }
});

test("WO-039 a verification check at Submit is handed back, and nothing reaches the employer", async () => {
  const before = requests.length;
  const r = await drive([{ user: "C", url: base + "/challenge/C" }]);
  assert.ok(r.done, r.out + r.err);
  assert.deepEqual(r.done.finished.map((f) => [f.state, f.outcome, f.reason]), [["needs_user", "bot_check", "bot_check"]]);
  assert.equal(requests.slice(before).filter((q) => q.method === "POST").length, 0, "never submitted");
  assert.equal(r.done.left, 0);
});

test("WO-039 an application changed after its approval is not sent", async () => {
  const before = requests.length;
  const r = await drive([{ user: "D", url: base + "/form/D", tamper: true }]);
  assert.ok(r.done, r.out + r.err);
  assert.deepEqual(r.done.finished.map((f) => [f.state, f.outcome, f.reason]), [["not_submitted", "not_sent", "APPROVED_APPLICATION_CHANGED"]]);
  assert.equal(requests.slice(before).filter((q) => q.method === "POST").length, 0);
});
