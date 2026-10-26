"use strict";
// Script submit binding (FEATURE 2, 2026-10-25): a form whose application leaves from the employer's own script
// (Greenhouse job-boards, Ashby, a scripted Lever) is submitted by Trainee's click on the employer's own Submit, with the
// one request bound at the network layer (scripts/apply.ts --script-submit, scripts/career/request-verifier.ts):
//   - the verifier's own rules (unit, through Deno): every approved answer in the body, a key named for an approved
//     field carries only its approved value, the employer's own endpoint per family (Greenhouse's job route, Ashby's
//     GraphQL application mutation for this posting, Lever's apply POST), and nothing else;
//   - an Ashby-shaped page served locally: the agent's click sends exactly one application mutation with the approved
//     answers (confirmed, its keys kept, never its values); a changed answer is stopped before it leaves; a second
//     application request is stopped; answers sent anywhere but the application endpoint stop the run with nothing sent;
//     a page that does not name the posting in its mutation is not the application and is stopped.
// The captured Greenhouse forms are proven end to end in tests/career-prove-loop.test.cjs (fixture_submitted 3/3).
// Synthetic facts and a loopback server only; nothing reaches a real employer.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");

const DENO = process.env.DENO_BIN || "deno";
const VERIFIER = path.join(__dirname, "../scripts/career/request-verifier.ts");
const POSTING = "11111111-2222-4333-8444-555555555555";
const THANKS = "<h1>Thank you for applying</h1><p>Application received. Confirmation number: ASHBY-7731.</p>";
let server, base;
const applications = [], elsewhere = [];
const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-script-submit-"));

function deno(code) {
  const r = spawnSync(DENO, ["eval", "--no-check", `import * as V from ${JSON.stringify("file://" + VERIFIER)};\n${code}`], { encoding: "utf8" });
  if (r.status !== 0) throw Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim().split("\n").at(-1));
}

// An Ashby-shaped page: no <form>; the fields come from a GraphQL query; "Submit application" sends the application as
// one GraphQL mutation (resume as base64) by script. ?mode= changes what the page's script does.
const page = (mode) => `<!doctype html><h1>TEST role</h1><div id="app">loading</div><script>
const MODE = ${JSON.stringify(mode || "")};
const gql = (body) => fetch("/api/non-user-graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
gql({ operationName: "ApiJobPosting", query: "query ApiJobPosting { form { fields } }" }).then((r) => r.json()).then((d) => {
  document.getElementById("app").innerHTML = d.fields.map((f) => f.type === "file"
    ? '<label for="' + f.id + '">' + f.label + '</label><input type="file" id="' + f.id + '" required>'
    : '<label for="' + f.id + '">' + f.label + '</label><input id="' + f.id + '" type="' + f.type + '" required>').join("") +
    '<button type="button" id="go">Submit application</button>';
  document.getElementById("go").onclick = async () => {
    const file = document.getElementById("_systemfield_resume").files[0];
    const b64 = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
    const v = (id) => document.getElementById(id).value;
    const entries = [["first_name", v("first_name")], ["last_name", v("last_name")],
      ["email", MODE === "tamper" ? "changed-by-page@example.test" : v("email")]];
    const body = { operationName: "ApiSubmitSingleApplicationFormAction",
      query: "mutation ApiSubmitSingleApplicationFormAction { submit }",
      variables: { organizationHostedJobsPageName: "ashby-test", jobPostingId: MODE === "other-posting" ? "99999999-2222-4333-8444-555555555555" : ${JSON.stringify(POSTING)},
        applicationForm: { fieldEntries: entries.map(([field, value]) => ({ field, value })) }, resume: { name: file.name, content: b64 } } };
    gql({ operationName: "TrackSubmitClick", query: "mutation TrackSubmitClick { track }" }).catch(() => {});
    const send = () => MODE === "elsewhere"
      ? fetch("/api/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
      : gql(body).catch(() => null);
    const r = await send();
    if (MODE === "extra") await send();
    if (r && r.ok) document.body.innerHTML = ${JSON.stringify(THANKS)};
  };
});
</script>`;

before(async () => {
  server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const c of req) parts.push(c);
    const u = new URL(req.url, "http://x");
    if (req.method === "GET" && u.pathname === `/ashby-test/${POSTING}/application`) {
      return res.writeHead(200, { "Content-Type": "text/html" }).end(page(u.searchParams.get("mode")));
    }
    if (req.method === "POST" && u.pathname === "/api/non-user-graphql") {
      const body = JSON.parse(Buffer.concat(parts).toString() || "{}");
      if (body.operationName === "ApiJobPosting") {
        return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ fields: [
          { id: "first_name", label: "First name", type: "text" }, { id: "last_name", label: "Last name", type: "text" },
          { id: "email", label: "Email", type: "email" }, { id: "_systemfield_resume", label: "Resume", type: "file" }] }));
      }
      if (/^ApiSubmit/.test(body.operationName)) applications.push(body);
      else elsewhere.push({ path: u.pathname, op: body.operationName });
      return res.writeHead(200, { "Content-Type": "application/json" }).end('{"data":{"ok":true}}');
    }
    if (req.method === "POST") {
      elsewhere.push({ path: u.pathname });
      return res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

function packet(dir) {
  fs.writeFileSync(path.join(dir, "synthetic.pdf"), "%PDF-1.4\n% TEST resume for the script submit binding, not a real person\n");
  const fact = (key, value) => ({ value, factId: "TEST-" + key, confirmed: true, provenance: "owner stated (TEST synthetic)", confirmation_event_id: "evt-TEST-" + key });
  fs.writeFileSync(path.join(dir, "facts.json"), JSON.stringify({ user_id: "TEST-script-submit", synthetic: true,
    answers: { first_name: fact("first_name", "Mary Jane"), last_name: fact("last_name", "Testcase"), email: fact("email", "synthetic@example.test") } }));
}
async function run(mode, flags) {
  const dir = fs.mkdtempSync(path.join(root, "case-"));
  packet(dir);
  const args = ["run", "-A", path.join(__dirname, "../scripts/apply.ts"), "--url", `${base}/ashby-test/${POSTING}/application${mode ? "?mode=" + mode : ""}`,
    "--facts", path.join(dir, "facts.json"), "--resume", path.join(dir, "synthetic.pdf"), "--state-dir", path.join(dir, "state"),
    "--evidence-dir", path.join(dir, "evidence"), ...flags];
  const p = spawn(DENO, args, { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "", asked = false;
  p.stdout.on("data", (b) => {
    out += b;
    if (!asked && out.includes("Submit this application to ")) { asked = true; p.stdin.write("yes\n"); }
  });
  p.stderr.on("data", (b) => (err += b));
  const timer = setTimeout(() => p.kill("SIGTERM"), 120000);
  await new Promise((r) => p.once("exit", r));
  clearTimeout(timer);
  const line = out.split("\n").filter((l) => l.startsWith("RESULT ")).at(-1);
  const result = line ? JSON.parse(line.slice(7)) : null;
  let evidence = null;
  try { evidence = JSON.parse(fs.readFileSync(path.join(dir, "evidence", "evidence.json"), "utf8")); } catch { /* none */ }
  return { result, evidence, out, err };
}

test("verifier: every approved answer, and under its own name only its approved value", () => {
  const r = deno(`
const wire = { email: "synthetic@example.test", first_name: "Mary Jane", resume: { filename: "r.pdf", sha256: "x" } };
const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
const check = async (o) => { try { V.carriesApproved(await V.bodyContents("application/json", enc(o), null), { email: wire.email, first_name: wire.first_name }); return "ok"; } catch (e) { return "stopped:" + e.message; } };
console.log(JSON.stringify({
  ok: await check({ fields: { email: "synthetic@example.test", first_name: "Mary Jane" } }),
  missing: await check({ fields: { first_name: "Mary Jane" } }),
  // The approved value is in the body, but the field under its own name carries another: stopped.
  hidden_change: await check({ fields: { email: "attacker@example.test", first_name: "Mary Jane" }, note: "synthetic@example.test" }),
  shape: V.bodyShape("application/json", enc({ a: { b: 1 }, list: [{ c: 2 }] }), null),
}));`);
  assert.equal(r.ok, "ok");
  assert.equal(r.missing, "stopped:email");
  assert.equal(r.hidden_change, "stopped:email");
  assert.deepEqual(r.shape, ["a.b", "list[].c"]);
});

test("verifier: the employer's own application endpoint per family, and nothing else", () => {
  const r = deno(`
const req = (method, url, body, type = "application/json") => ({ method, url, type, body: new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body)), form: null });
const gh = V.scriptSubmitEndpoint("greenhouse", new URL("https://job-boards.greenhouse.io/acme/jobs/4000000001"), false);
const lv = V.scriptSubmitEndpoint("lever", new URL("https://jobs.lever.co/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5"), false);
const ab = V.scriptSubmitEndpoint("ashby", new URL("https://jobs.ashbyhq.com/acme/8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3/application"), false);
const sub = (id) => ({ operationName: "ApiSubmitSingleApplicationFormAction", variables: { jobPostingId: id } });
let refused = null; try { V.scriptSubmitEndpoint("greenhouse", new URL("https://job-boards.greenhouse.io/acme"), false); } catch (e) { refused = e.message; }
console.log(JSON.stringify({
  gh: [gh.path, V.isSubmitEndpoint(gh, req("POST", "https://job-boards.greenhouse.io/acme/jobs/4000000001", {})),
    V.isSubmitEndpoint(gh, req("POST", "https://job-boards.greenhouse.io/acme/jobs/4000000002", {})),
    V.isSubmitEndpoint(gh, req("GET", "https://job-boards.greenhouse.io/acme/jobs/4000000001", "")),
    V.isSubmitEndpoint(gh, req("POST", "https://evil.example/acme/jobs/4000000001", {}))],
  lv: [lv.path, V.isSubmitEndpoint(lv, req("POST", "https://jobs.lever.co/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5/apply", "", "multipart/form-data"))],
  ab: [ab.path, V.isSubmitEndpoint(ab, req("POST", "https://jobs.ashbyhq.com/api/non-user-graphql?op=x", sub("8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3"))),
    V.isSubmitEndpoint(ab, req("POST", "https://jobs.ashbyhq.com/api/non-user-graphql", sub("99999999-34bf-47c4-a1d1-b7b2f836bbd3"))),
    V.isSubmitEndpoint(ab, req("POST", "https://jobs.ashbyhq.com/api/non-user-graphql", { operationName: "TrackView" })),
    V.isSubmitEndpoint(ab, req("POST", "https://jobs.ashbyhq.com/api/non-user-graphql", [sub("8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3"), sub("8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3")]))],
  refused,
}));`);
  assert.deepEqual(r.gh, ["/acme/jobs/4000000001", true, false, false, false]);
  assert.deepEqual(r.lv, ["/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5/apply", true]);
  assert.deepEqual(r.ab, ["/api/non-user-graphql", true, false, false, false]);
  assert.equal(r.refused, "POSTING_ID_REQUIRED");
});

test("without the binding a script-submitted form still stops at SUBMIT_DESTINATION_NOT_BOUND", async () => {
  const r = await run("", ["--submit"]);
  assert.equal(r.result?.reason, "SUBMIT_DESTINATION_NOT_BOUND", JSON.stringify(r.result) + r.err.slice(-400));
});

test("--script-submit ashby: Trainee's click sends exactly one application mutation with the approved answers; confirmed", async () => {
  const n = applications.length;
  const r = await run("", ["--submit", "--script-submit", "ashby"]);
  assert.equal(r.result?.state, "confirmed", JSON.stringify(r.result) + r.err.slice(-600));
  assert.equal(r.result.confirmation_id, "ASHBY-7731");
  assert.equal(applications.length, n + 1, "exactly one application reached the employer");
  const sent = applications[n].variables.applicationForm.fieldEntries;
  assert.deepEqual(sent.map((e) => e.value), ["Mary Jane", "Testcase", "synthetic@example.test"]);
  assert.equal(r.evidence.post.mutations, 1);
  assert.equal(r.evidence.post.bound_by, "script_submit_route");
  assert.match(r.evidence.payload.destination, /\/api\/non-user-graphql \(one request, the application mutation, sent by the page's own Submit\)$/);
  assert.ok(r.evidence.request_shape.keys.includes("variables.applicationForm.fieldEntries[].value"));
  assert.ok(!/Mary Jane|synthetic@example/.test(JSON.stringify(r.evidence.request_shape)), "keys only, never values");
  // The click's tracking mutation is not the application: stopped, recorded.
  assert.ok(r.evidence.stopped_requests.some((s) => s.why === "not_the_application_endpoint"), JSON.stringify(r.evidence.stopped_requests));
});

test("--script-submit ashby: an answer the page changed is stopped before it leaves; nothing is sent", async () => {
  const n = applications.length;
  const r = await run("tamper", ["--submit", "--script-submit", "ashby"]);
  assert.equal(applications.length, n, "the employer received nothing");
  assert.equal(r.result?.state, "not_submitted", JSON.stringify(r.result));
  assert.equal(r.result.reason, "APPROVED_BODY_MISMATCH");
});

test("--script-submit ashby: a second application request is stopped; the one approved request stands", async () => {
  const n = applications.length;
  const r = await run("extra", ["--submit", "--script-submit", "ashby"]);
  assert.equal(r.result?.state, "confirmed", JSON.stringify(r.result) + r.err.slice(-600));
  assert.equal(applications.length, n + 1, "exactly one application reached the employer");
  assert.ok(r.evidence.stopped_requests.some((s) => s.why === "second_application_request"), JSON.stringify(r.evidence.stopped_requests));
});

test("--script-submit ashby: answers sent anywhere but the application endpoint stop the run; nothing is sent", async () => {
  const n = applications.length, m = elsewhere.filter((e) => e.path === "/api/collect").length;
  const r = await run("elsewhere", ["--submit", "--script-submit", "ashby"]);
  assert.equal(applications.length, n);
  assert.equal(elsewhere.filter((e) => e.path === "/api/collect").length, m, "nothing reached the other endpoint");
  assert.equal(r.result?.state, "not_submitted", JSON.stringify(r.result));
  assert.equal(r.result.reason, "SUBMIT_DESTINATION_UNEXPECTED");
});

test("--script-submit ashby: a mutation for another posting is not this application; stopped, nothing sent", async () => {
  const n = applications.length;
  const r = await run("other-posting", ["--submit", "--script-submit", "ashby"]);
  assert.equal(applications.length, n);
  assert.equal(r.result?.state, "not_submitted", JSON.stringify(r.result));
  assert.equal(r.result.reason, "SUBMIT_DESTINATION_UNEXPECTED");
});

test("--script-submit is refused with --person-submits, and for a real employer of another family", async () => {
  const both = await run("", ["--script-submit", "ashby", "--person-submits"]);
  assert.equal(both.result?.reason, "INVALID_ARGUMENTS", JSON.stringify(both.result));
  const dir = fs.mkdtempSync(path.join(root, "real-"));
  packet(dir);
  const p = spawnSync(DENO, ["run", "-A", path.join(__dirname, "../scripts/apply.ts"), "--url", "https://job-boards.greenhouse.io/acme/jobs/4000000001",
    "--facts", path.join(dir, "facts.json"), "--resume", path.join(dir, "synthetic.pdf"), "--script-submit", "lever"], { encoding: "utf8", timeout: 60000 });
  const line = p.stdout.split("\n").filter((l) => l.startsWith("RESULT ")).at(-1);
  assert.equal(JSON.parse(line.slice(7)).reason, "SCRIPT_SUBMIT_FAMILY_MISMATCH", p.stdout + p.stderr);
});
