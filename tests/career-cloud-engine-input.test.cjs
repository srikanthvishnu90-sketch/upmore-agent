"use strict";
// The cloud-only producer end to end (bridge review 1, A1), against the captured Veeva Lever form: a person's chat facts
// and texted answers -> engineInput -> the engine's dry run -> the one question it cannot answer is asked
// (questionsToStore) -> the person's answer comes back as their row -> engineInput again -> ready payload -> cloudLoop
// submits, and the employer receives exactly those answers. Below: the original harness notes, unchanged.
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

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const chat = (id, text) => ({ id, kind: "other", text, title: "", source: "user", status: "confirmed", needs_confirmation: false,
  provenance: "owner confirmed in chat (2026-10-21T17:10:00.000Z)", confirmation_event_id: "evt-" + id });
const rid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PROFILE = { facts: [chat("F-001", "I am authorized to work in the United States"), chat("F-002", "My phone number is (555) 010-0199")] };
const ROWS = [
  { id: rid(1), user_id: OWNER, key: "fact:full_name", kind: "fact", answer: "Sam Synthetic", state: "answered" },
  { id: rid(2), user_id: OWNER, key: "fact:email", kind: "fact", answer: "sam.synthetic@example.test", state: "answered" },
  { id: rid(3), user_id: OWNER, key: "fact:sponsorship", kind: "fact", answer: "No", state: "answered" },
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-cloud-input-"));
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

function run(answerAck) {
  const dir = fs.mkdtempSync(path.join(root, "run-"));
  const repo = path.resolve(__dirname, "..");
  const driver = path.join(dir, "driver.ts");
  const url = `${base}/veeva-input/9ac55b31-df46-4acb-b305-2c0b7ed56027/apply`;
  fs.writeFileSync(driver, `
import { prepare } from ${JSON.stringify("file://" + repo + "/workers/career-browser/approve-first.ts")};
import { questionsToStore } from ${JSON.stringify("file://" + repo + "/workers/career-browser/ask-once.ts")};
import { cloudEngineRunner, cloudLoop } from ${JSON.stringify("file://" + repo + "/workers/career-cloud/worker.ts")};
import { hashApplyPayload } from ${JSON.stringify("file://" + repo + "/supabase/functions/_shared/career_apply_store.ts")};
import { engineInput } from ${JSON.stringify("file://" + repo + "/workers/career-cloud/engine_input.ts")};
const dir = ${JSON.stringify(dir)}, url = ${JSON.stringify(url)}, owner = ${JSON.stringify(OWNER)};
const rows = ${JSON.stringify(ROWS)}, profile = ${JSON.stringify(PROFILE)};
const resume = dir + "/resume.pdf";
await Deno.writeTextFile(resume, "%PDF-1.4 SYNTHETIC TEST RESUME");
const bytes = await Deno.readFile(resume);
const engine = cloudEngineRunner({ root: ${JSON.stringify(repo)}, evidenceRoot: dir + "/evidence" });
await Deno.mkdir(dir + "/evidence", { mode: 0o700 });
const once = async (n) => {
  const input = engineInput({ owner, profile, rows });
  const facts = dir + "/facts-" + n + ".json";
  await Deno.writeTextFile(facts, JSON.stringify(input.facts), { mode: 0o600 });
  return { input, p: await prepare({ url, factsPath: facts, resumePath: resume, account: { epoch: 1, version: 1 }, now: Date.now(), runEngine: engine }) };
};
const first = await once(1);
const out = { first: first.p.ready ? { ready: true } : { ready: false, result: first.p.result } };
if (!first.p.ready) {
  const ask = questionsToStore(first.p.result, { facts: first.input.facts.answers, answered: new Set(rows.map((r) => r.key)) });
  out.asked = ask.questions.map((q) => ({ key: q.key, kind: q.kind, label: q.label }));
  // The person's own answer to each asked question, as the texting path stores it (career_apply_question_answer_as).
  if (${answerAck ? "true" : "false"}) ask.questions.forEach((q, i) => rows.push({ id: "00000000-0000-4000-8000-00000000009" + i, user_id: owner, key: q.key, kind: q.kind, answer: "Yes", state: "answered" }));
}
const second = await once(2);
out.second = second.p.ready ? { ready: true, fields: second.p.payload.fields.map((f) => [f.name, f.value, f.factId]), approval: second.p.payload.engine_approval } : { ready: false, result: second.p.result };
if (second.p.ready) {
  const job = { id: "job-1", lease_token: "lease-1", user_id: owner, company: second.p.payload.company, url, payload: second.p.payload, payload_hash: await hashApplyPayload(second.p.payload), approval_hash: await hashApplyPayload(second.p.payload) };
  const finished = [], tmpRoot = dir + "/tmp";
  await Deno.mkdir(tmpRoot);
  let pending = [job];
  const queue = {
    claim: async (n) => { const o = pending.slice(0, n); pending = pending.slice(n); return o; },
    resume: async () => ({ filename: "resume.pdf", sha256: job.payload.resume_sha256, b64: btoa(String.fromCharCode(...bytes)) }),
    finish: async (j, state, evidence, outcome) => { finished.push({ state, outcome, reason: evidence.reason }); },
    ask: async () => 0,
    gatePresent: async () => true,
  // 20261024130000: the card-bound worker authorizes with the queue before the engine and before the effect.
  authorize: async () => {},
  };
  await cloudLoop({ queue, runEngine: engine, contexts: 1, idleMs: 50, tmpRoot, stop: () => finished.length === 1, log: () => {} });
  out.finished = finished;
}
console.log("DONE " + JSON.stringify(out));
`);
  return new Promise((resolve) => {
    const p = spawn(process.env.DENO_BIN || "deno", ["run", "-A", "--no-check", driver], { env: { ...process.env, HOME: dir }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timer = setTimeout(() => p.kill("SIGKILL"), 280000);
    p.on("exit", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("DONE "));
      resolve({ out, err, done: line ? JSON.parse(line.slice(5)) : null });
    });
  });
}

test("a cloud-only person: the one question the facts cannot answer is asked; nothing is prepared or sent without it", async () => {
  const before = requests.filter((r) => r.method === "POST").length;
  const r = await run(false);
  assert.ok(r.done, r.err.slice(-1500));
  assert.equal(r.done.first.ready, false);
  assert.equal(r.done.first.result.reason, "needs_answers");
  assert.deepEqual(r.done.asked.map((q) => q.label), [ACK_VALUE], "only the acknowledgement: every other required field came from the input");
  assert.equal(r.done.second.ready, false, "unanswered, it stays asked");
  assert.equal(requests.filter((x) => x.method === "POST").length, before, "nothing sent");
});

test("a cloud-only person: their answer comes back as their row, the application is prepared from the input alone and the employer receives exactly it", async () => {
  const before = requests.filter((r) => r.method === "POST").length;
  const r = await run(true);
  assert.ok(r.done, r.err.slice(-1500));
  assert.equal(r.done.second.ready, true, JSON.stringify(r.done.second));
  assert.match(r.done.second.approval, /^[0-9a-f]{64}$/);
  const byName = Object.fromEntries(r.done.second.fields.map(([n, v, id]) => [n, { v, id }]));
  assert.equal(byName.name?.v, "Sam Synthetic"); assert.equal(byName.name?.id, "text-answer:" + rid(1));
  assert.equal(byName.email?.v, "sam.synthetic@example.test"); assert.equal(byName.email?.id, "text-answer:" + rid(2));
  assert.equal(byName[AUTH]?.id, "F-001", "the chat-confirmed authorization, by its fact id");
  assert.equal(byName[SPONS]?.id, "text-answer:" + rid(3));
  assert.match(String(byName[ACK]?.id), /^text-answer:/, "the acknowledgement only on his own answer");
  assert.deepEqual(r.done.finished.map((f) => [f.state, f.outcome]), [["confirmed", "submitted"]], JSON.stringify(r.done.finished));
  const posts = requests.filter((x) => x.method === "POST").slice(before);
  assert.equal(posts.length, 1, "submitted once");
  const sent = Object.fromEntries(posts[0].entries.filter(([, v]) => typeof v === "string"));
  assert.equal(sent.name, "Sam Synthetic"); assert.equal(sent.email, "sam.synthetic@example.test");
  assert.ok(posts[0].entries.some(([k, v]) => k === "resume" && v.file), "the resume went");
});
