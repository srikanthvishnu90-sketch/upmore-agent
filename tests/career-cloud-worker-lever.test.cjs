"use strict";
// WO-102 on the cloud worker path, against a captured real Lever form (tests/fixtures/forms-ci, Veeva), not a generic
// page. Each job is prepared by the engine's own dry run (approve-first prepare), then run by the cloud worker's
// cloudLoop with its real engine runner (scripts/apply.ts --submit --approved, headless Chromium) and an in-memory
// queue. The captured page is served on 127.0.0.1 with its scripts removed; one line stands in for Lever's own submit
// script (its Submit button posts the form; the hCaptcha step it runs first is not reproduced). Synthetic TEST facts
// only; nothing leaves this machine.
//  1. clean owner-stated facts: submitted once, and the employer receives exactly the approved answers;
//  2. a quarantined fact (D-007): stopped, nothing sent, the required question comes back as a question;
//  3. an answer edited after approval: stopped, nothing sent;
//  4. another person's fact: stopped, nothing sent;
//  5. a required question with no supported answer: asked, never guessed, nothing sent.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const dir = path.join(__dirname, "fixtures/forms-ci");
const FORM = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).forms
  .find((f) => f.id === "lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027");
const strip = (h) =>
  h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "")
    .replace(/\s(src|srcset)="https?:[^"]*"/gi, "");
// The stand-in for Lever's submit script: the button posts its form (to the page's own URL, as Lever's does).
const SUBMIT = `<script>document.getElementById("btn-submit").addEventListener("click",()=>document.getElementById("application-form").requestSubmit())</script>`;
const PAGE = strip(fs.readFileSync(path.join(dir, FORM.html), "utf8")).replace(/<\/body>/i, SUBMIT + "</body>");

// The captured form's questions, by the names Lever gives them.
const SPONS = "cards[651d37ec-0ef2-40dc-9bf5-6f5973ab81c0][field0]"; // Do you now, or in the future require sponsorship?
const AUTH = "cards[651d37ec-0ef2-40dc-9bf5-6f5973ab81c0][field1]"; // ... the unrestricted right to work in the United States?
const ACK = "cards[f7ecb5fe-3e81-46f9-9b63-f1a6b71d53c3][field0]"; // I understand that next steps will be sent via email ...
const ACK_VALUE = "I understand that next steps will be sent via email and I have marked the sender address above as safe.";

const OWNER = "TEST-lever-owner";
const own = (factId, value, extra = {}) =>
  ({ value, factId, confirmed: true, provenance: "owner stated in chat (TEST)", confirmation_event_id: "evt-" + factId, ...extra });
// A clean, owner-stated fact set that answers every required question on this form.
function cleanFacts() {
  return {
    user_id: OWNER,
    answers: {
      full_name: own("TEST-F-1", "Synthetic Tester"),
      email: own("TEST-F-2", "synthetic.tester@example.test"),
      sponsorship: own("TEST-F-3", "No"),
      work_authorization: own("TEST-F-4", "Yes"),
    },
    // The acknowledgement is answered by the owner himself (an attestation goes only on his own answer to it).
    saved: { [ACK_VALUE.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()]: own("TEST-F-5", "Yes", { authorizes: true }) },
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-cloud-lever-"));
const requests = [];
let server, base;
before(async () => {
  assert.ok(FORM && PAGE.includes(ACK_VALUE), "the captured Veeva Lever form and its acknowledgement question");
  server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const c of req) parts.push(c);
    const u = new URL(req.url, "http://x");
    const r = { method: req.method, path: u.pathname };
    requests.push(r);
    if (req.method === "POST") {
      const data = await new Response(Buffer.concat(parts), { headers: { "content-type": req.headers["content-type"] } }).formData();
      r.entries = [...data.entries()].map(([k, v]) => [k, typeof v === "string" ? v : { file: v.name, size: v.size }]);
      return res.writeHead(200, { "Content-Type": "text/html" }).end("<h1>Thank you for applying</h1><p>Application submitted. Confirmation TEST-LEVER-1.</p>");
    }
    if (!/^\/veeva-[a-z0-9-]+\/9ac55b31-df46-4acb-b305-2c0b7ed56027\/apply$/.test(u.pathname)) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});
const urlFor = (tag) => `${base}/veeva-${tag}/9ac55b31-df46-4acb-b305-2c0b7ed56027/apply`;

// The driver: prepare each job with the engine's dry run; a prepared job may then be spoiled (as the queue row could
// be), and every prepared job runs through cloudLoop. A spoil names one payload field and what to set on it.
function drive(specs) {
  const run = fs.mkdtempSync(path.join(root, "run-"));
  const repo = path.resolve(__dirname, "..");
  const driver = path.join(run, "driver.ts");
  fs.writeFileSync(driver, `
import { prepare } from ${JSON.stringify("file://" + repo + "/workers/career-browser/approve-first.ts")};
import { cloudEngineRunner, cloudLoop } from ${JSON.stringify("file://" + repo + "/workers/career-cloud/worker.ts")};
import { hashApplyPayload } from ${JSON.stringify("file://" + repo + "/supabase/functions/_shared/career_apply_store.ts")};
const specs = JSON.parse(Deno.env.get("SPECS")!);
const dir = ${JSON.stringify(run)};
const resume = dir + "/resume.pdf";
await Deno.writeTextFile(resume, "%PDF-1.4 SYNTHETIC TEST RESUME");
const bytes = await Deno.readFile(resume);
const engine = cloudEngineRunner({ root: ${JSON.stringify(repo)}, evidenceRoot: dir + "/evidence" });
await Deno.mkdir(dir + "/evidence", { mode: 0o700 });
const jobs = [], prepared = [];
for (const [i, s] of specs.entries()) {
  const facts = dir + "/facts-" + i + ".json";
  await Deno.writeTextFile(facts, JSON.stringify(s.facts));
  const p = await prepare({ url: s.url, factsPath: facts, resumePath: resume, account: { epoch: 1, version: 1 }, now: Date.now(), runEngine: engine });
  prepared.push(p.ready ? { ready: true, fields: p.payload.fields, page_field_names: p.payload.page_field_names } : { ready: false, result: p.result });
  if (!p.ready) continue;
  if (s.spoil) {
    const f = p.payload.fields.find((x) => x.name === s.spoil.name);
    if (!f) throw Error("no field to spoil: " + s.spoil.name);
    if (s.spoil.remove) p.payload.fields = p.payload.fields.filter((x) => x !== f);
    else Object.assign(f, s.spoil.set);
  }
  jobs.push({ id: "job-" + i, lease_token: "lease-" + i, user_id: s.facts.user_id, company: p.payload.company, url: s.url, payload: p.payload, payload_hash: await hashApplyPayload(p.payload), approval_hash: await hashApplyPayload(p.payload) });
}
const finished = [], tmpRoot = dir + "/tmp";
await Deno.mkdir(tmpRoot);
let pending = [...jobs];
const queue = {
  claim: async (n) => { const out = pending.slice(0, n); pending = pending.slice(n); return out; },
  resume: async () => ({ filename: "resume.pdf", sha256: jobs[0].payload.resume_sha256, b64: btoa(String.fromCharCode(...bytes)) }),
  finish: async (j, state, evidence, outcome, errorKind) => { finished.push({ id: j.id, state, outcome, errorKind, reason: evidence.reason, questions: evidence.questions ?? null }); },
  gatePresent: async () => true,
  // 20261024130000: the card-bound worker authorizes with the queue before the engine and before the effect.
  authorize: async () => {},
};
if (jobs.length) await cloudLoop({ queue, runEngine: engine, contexts: 2, idleMs: 50, tmpRoot, stop: () => finished.length === jobs.length, log: () => {} });
console.log("FINISHED " + JSON.stringify({ prepared, finished, left: [...Deno.readDirSync(tmpRoot)].length }));
`);
  return new Promise((resolve) => {
    const p = spawn(process.env.DENO_BIN || "deno", ["run", "-A", "--no-check", driver], {
      env: { ...process.env, SPECS: JSON.stringify(specs), HOME: run },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timer = setTimeout(() => p.kill("SIGKILL"), 280000);
    p.on("exit", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("FINISHED "));
      resolve({ out, err, done: line ? JSON.parse(line.slice(9)) : null });
    });
  });
}
const posts = (from) => requests.slice(from).filter((q) => q.method === "POST");
const asked = (labels, re) => Array.isArray(labels) && labels.some((l) => re.test(typeof l === "string" ? l : l.label));
// A stopped cloud job: nothing sent, and (when it is a question) the question comes back to be asked.
function stopped(r, from, reason, question) {
  assert.ok(r.done, r.out + r.err);
  assert.equal(r.done.prepared[0].ready, true, "the clean application was prepared: " + JSON.stringify(r.done.prepared[0]));
  const [f] = r.done.finished;
  assert.deepEqual([f.state, f.reason], ["not_submitted", reason], JSON.stringify(f));
  assert.notEqual(f.outcome, "submitted");
  if (question) assert.ok(asked(f.questions, question), "the required question is asked: " + JSON.stringify(f));
  assert.equal(posts(from).length, 0, "nothing reached the employer");
  assert.equal(r.done.left, 0, "the job's facts and resume are removed");
}

test("Lever 1: clean owner-stated facts go once, and the employer receives exactly the approved answers", async () => {
  const from = requests.length;
  const r = await drive([{ url: urlFor("clean"), facts: cleanFacts() }]);
  assert.ok(r.done, r.out + r.err);
  const [p] = r.done.prepared;
  assert.equal(p.ready, true, JSON.stringify(p));
  assert.deepEqual(r.done.finished.map((f) => [f.state, f.outcome]), [["confirmed", "submitted"]], JSON.stringify(r.done.finished));
  const sent = posts(from);
  assert.equal(sent.length, 1, "exactly one application");
  const expected = { name: "Synthetic Tester", email: "synthetic.tester@example.test", [SPONS]: "No", [AUTH]: "Yes", [ACK]: ACK_VALUE };
  // The approved answers are exactly these questions (and the resume), each with its owner's source.
  assert.deepEqual(p.fields.map((f) => f.name).sort(), [...Object.keys(expected), "resume"].sort());
  assert.ok(p.fields.every((f) => f.provenance && f.confirmation_event_id), JSON.stringify(p.fields));
  for (const f of p.fields) if (f.name !== ACK && f.name !== "resume") assert.equal(f.value, expected[f.name], f.name);
  // What arrived: every approved answer as approved, the resume, the page's own hidden fields; nothing else filled.
  const got = sent[0].entries.filter(([, v]) => v !== "");
  const answers = Object.fromEntries(got.filter(([k]) => !p.page_field_names.includes(k) && k !== "resume"));
  assert.deepEqual(answers, expected);
  assert.deepEqual(got.filter(([k]) => k === "resume").map(([, v]) => v.size), [30], "the approved resume, once");
});

test("Lever 2: a quarantined fact stops it; nothing is sent and the required question is asked", async () => {
  const from = requests.length;
  // At preparation: an F-033 answer never makes an application; the question is asked instead.
  const facts = cleanFacts();
  facts.answers.sponsorship = own("F-033", "No");
  const pre = await drive([{ url: urlFor("q-prep"), facts }]);
  assert.ok(pre.done, pre.out + pre.err);
  const r0 = pre.done.prepared[0];
  assert.deepEqual([r0.ready, r0.result.reason], [false, "needs_answers"], JSON.stringify(r0));
  assert.ok(asked(r0.result.questions, /sponsorship/i), JSON.stringify(r0.result));
  assert.equal(posts(from).length, 0);
  // On the cloud: an approved payload whose answer turns out quarantined (an F-0xx id or the answer-all delegation).
  for (const [tag, set] of [["q-id", { factId: "F-047" }], ["q-deleg", { provenance: "owner-delegated 2026-10-17 (answer-all directive)" }]]) {
    const at = requests.length;
    stopped(await drive([{ url: urlFor(tag), facts: cleanFacts(), spoil: { name: SPONS, set } }]), at, "needs_answers", /sponsorship/i);
  }
});

test("Lever 3: an answer edited after approval is not sent", async () => {
  const from = requests.length;
  stopped(await drive([{ url: urlFor("edit"), facts: cleanFacts(), spoil: { name: SPONS, set: { value: "Yes" } } }]), from, "APPROVED_APPLICATION_CHANGED");
});

test("Lever 4: another person's fact stops it; nothing is sent", async () => {
  const from = requests.length;
  const facts = cleanFacts();
  facts.answers.email = own("TEST-F-2", "someone.else@example.test", { user_id: "TEST-someone-else" });
  const pre = await drive([{ url: urlFor("x-prep"), facts }]);
  assert.ok(pre.done, pre.out + pre.err);
  assert.deepEqual([pre.done.prepared[0].ready, pre.done.prepared[0].result.reason], [false, "FACT_OWNER_MISMATCH"]);
  assert.equal(posts(from).length, 0);
  const at = requests.length;
  stopped(await drive([{ url: urlFor("x-cloud"), facts: cleanFacts(), spoil: { name: "email", set: { user_id: "TEST-someone-else" } } }]), at, "FACT_OWNER_MISMATCH");
});

test("Lever 5: a required question with no supported answer is asked, never guessed; nothing is sent", async () => {
  const from = requests.length;
  const facts = cleanFacts();
  delete facts.answers.work_authorization;
  const pre = await drive([{ url: urlFor("n-prep"), facts }]);
  assert.ok(pre.done, pre.out + pre.err);
  const r0 = pre.done.prepared[0];
  assert.deepEqual([r0.ready, r0.result.reason], [false, "needs_answers"], JSON.stringify(r0));
  assert.ok(asked(r0.result.questions, /right to work/i), JSON.stringify(r0.result));
  assert.equal(posts(from).length, 0);
  // On the cloud: the approved payload no longer carries that answer; the engine asks rather than fill anything.
  const at = requests.length;
  stopped(await drive([{ url: urlFor("n-cloud"), facts: cleanFacts(), spoil: { name: AUTH, remove: true } }]), at, "needs_answers", /right to work/i);
});
