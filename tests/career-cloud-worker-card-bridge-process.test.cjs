"use strict";
// Transport proof only: the real cloudEngineRunner launches a scripted scripts/apply.ts over real stdio.
// The child writes an independent effect file only after its protocol conditions receive an exact allow response.
// This does not prove where the real browser engine requests permission relative to an employer POST.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const sourceRoot = path.resolve(process.env.CLOUD_BRIDGE_SOURCE_ROOT || path.join(__dirname, ".."));
const deno = process.env.DENO_BIN || "deno";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-card-process-"));
const measured = [];
const secretNames = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "SUPABASE_URL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "HQ_API_KEY"];
const sourceSha = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

after(() => {
  if (process.env.CLOUD_BRIDGE_MEASUREMENTS) fs.writeFileSync(process.env.CLOUD_BRIDGE_MEASUREMENTS,
    JSON.stringify({ sourceRoot, sourceSha, proof: "scripted-child stdio transport only", cases: measured }, null, 2) + "\n");
  fs.rmSync(root, { recursive: true, force: true });
});

const scriptedChild = String.raw`
const get = (name: string) => Deno.args[Deno.args.indexOf(name) + 1];
const dir = get("--record-dir"), mode = get("--test-mode");
const nonce = Deno.args.includes("--cloud-authorize-nonce") ? get("--cloud-authorize-nonce") : "0".repeat(64);
const prefix = "CLOUD_AUTH ";
const record = (name: string, value: unknown) => Deno.writeTextFile(dir + "/" + name + ".json", JSON.stringify(value));
await record("child", { mode, nonce, stdio: Deno.args.includes("--cloud-authorize-stdio"),
  secretsPresent: ${JSON.stringify(secretNames)}.filter((k) => Deno.env.get(k) !== undefined) });
const reader = Deno.stdin.readable.pipeThrough(new TextDecoderStream()).getReader();
let pending = "";
async function line(): Promise<string | null> {
  while (!pending.includes("\n")) {
    const next = await reader.read();
    if (next.done) return pending ? pending : null;
    pending += next.value;
    if (pending.length > 1024) throw Error("response too large");
  }
  const at = pending.indexOf("\n"), out = pending.slice(0, at);
  pending = pending.slice(at + 1);
  return out;
}
const request = { v: 1, nonce, phase: "before_effect" };
async function send(value: unknown) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  await record("request", { body });
  console.log(prefix + body);
}
async function response() {
  const raw = await line();
  if (raw === null) { await record("response", { outcome: "EOF" }); return false; }
  let r;
  try { r = JSON.parse(raw.slice(prefix.length)); } catch { await record("response", { outcome: "malformed" }); return false; }
  const exact = raw.startsWith(prefix) && r && Object.keys(r).sort().join(",") === "allow,nonce,v" &&
    r.v === 1 && r.nonce === nonce && typeof r.allow === "boolean";
  await record("response", { outcome: exact ? (r.allow ? "allow" : "deny") : "malformed", value: r });
  return exact && r.allow;
}
if (mode === "eof") {
  // Child EOF without a request is already blocked on the baseline; this is a control, not a regression red.
  console.log('RESULT {"state":"not_submitted","reason":"TEST_EOF"}');
  Deno.exit(0);
}
if (mode === "silent") await new Promise(() => { setInterval(() => {}, 100); });
if (mode === "wrong_nonce") await send({ ...request, nonce: "f".repeat(64) });
else if (mode === "extra_identity") await send({ ...request, job_id: "child-chosen-job", lease_token: "child-chosen-lease", rpc: "child-chosen-rpc" });
else if (mode === "malformed") await send("{");
else if (mode === "oversized") await send({ ...request, padding: "x".repeat(1100) });
else await send(request);
if (mode === "duplicate") console.log(prefix + JSON.stringify(request));
let allowed = await response();
if (mode === "duplicate") allowed = (await response()) && allowed;
if (allowed) await record("effect", { kind: "synthetic-local-effect", nonce });
console.log("RESULT " + JSON.stringify({ state: allowed ? "confirmed" : "not_submitted", reason: allowed ? "TEST_ALLOWED" : "TEST_REFUSED" }));
Deno.exit(mode === "exit_failure" ? 1 : 0);
`;

async function drive(mode, authorization = "allow", options = {}) {
  const dir = fs.mkdtempSync(path.join(root, mode + "-"));
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.writeFileSync(path.join(dir, "scripts", "apply.ts"), scriptedChild);
  const worker = pathToFileURL(path.join(sourceRoot, "workers/career-cloud/worker.ts")).href;
  const driver = path.join(dir, "driver.ts");
  fs.writeFileSync(driver, `
import { cloudEngineRunner } from ${JSON.stringify(worker)};
let calls = 0, argumentCounts: number[] = [], error = null, result = null;
const run = cloudEngineRunner({ root: ${JSON.stringify(dir)}, evidenceRoot: ${JSON.stringify(dir + "/evidence")},
  timeoutMs: ${options.timeoutMs || 1600}, authorizeTimeoutMs: ${options.authorizeTimeoutMs || 150} });
const beforeEffect = async (...args: unknown[]) => {
  calls++; argumentCounts.push(args.length);
  if (${JSON.stringify(authorization)} === "deny") throw Error("SYNTHETIC_AUTHORITY_DENIAL");
  if (${JSON.stringify(authorization)} === "timeout") await new Promise(() => {});
};
try { result = await run(["--submit", "--record-dir", ${JSON.stringify(dir)}, "--test-mode", ${JSON.stringify(mode)}],
  { OPENAI_API_KEY: "SYNTHETIC_ARG_ENV_KEY", SUPABASE_SERVICE_ROLE_KEY: "SYNTHETIC_ARG_ENV_SERVICE" }, { beforeEffect }); }
catch (e) { error = String(e?.message || e); }
console.log("DRIVER " + JSON.stringify({ calls, argumentCounts, result, error }));
`);
  const started = Date.now();
  const raw = await new Promise((resolve, reject) => {
    const env = { ...process.env, DENO_NO_UPDATE_CHECK: "1" };
    for (const key of secretNames) env[key] = "SYNTHETIC_PARENT_ONLY_" + key;
    const child = spawn(deno, ["run", "-A", "--deny-net", "--cached-only", "--no-check", driver], {
      env, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (b) => { stdout += b; });
    child.stderr.on("data", (b) => { stderr += b; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    child.once("error", (e) => { clearTimeout(timer); reject(e); });
    child.once("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
  const jsonFile = (name) => fs.existsSync(path.join(dir, name + ".json"))
    ? JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8")) : null;
  const output = raw.stdout.split("\n").find((l) => l.startsWith("DRIVER "));
  const r = { ...raw, parent: output ? JSON.parse(output.slice(7)) : null,
    child: jsonFile("child"), request: jsonFile("request"), response: jsonFile("response"),
    effect: jsonFile("effect"), elapsedMs: Date.now() - started };
  measured.push({ mode, authorization, elapsedMs: r.elapsedMs, code: r.code, signal: r.signal,
    childStarted: !!r.child, child: r.child, request: r.request, response: r.response, effect: r.effect, parent: r.parent });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.ok(r.parent, "actual worker driver finished: " + r.stdout + r.stderr);
  assert.ok(r.child, "scripted child reached its independent record: " + r.stdout + r.stderr);
  return r;
}

test("positive transport: one exact request invokes the captured closure once before the child effect", async () => {
  const r = await drive("valid");
  assert.ok(r.request, "child emitted its request");
  assert.ok(r.effect, "no independent child effect; response=" + JSON.stringify(r.response));
  assert.equal(r.child.stdio, true);
  assert.match(r.child.nonce, /^[a-f0-9]{64}$/);
  assert.equal(r.response?.outcome, "allow");
  assert.deepEqual(r.response.value, { v: 1, nonce: r.child.nonce, allow: true });
  assert.equal(r.parent.calls, 1);
  assert.deepEqual(r.parent.argumentCounts, [0], "child supplies no job, lease, RPC or authority arguments");
  assert.equal(r.effect.nonce, r.child.nonce);
});

test("denial control: a throwing authority produces no child effect", async () => {
  const r = await drive("valid", "deny");
  assert.equal(r.effect, null);
  assert.ok(r.response && ["deny", "EOF"].includes(r.response.outcome), JSON.stringify(r.response));
  // EOF is the baseline behavior; only a protocol deny proves this bridge called the authority.
  if (r.child.stdio) {
    assert.equal(r.response.outcome, "deny");
    assert.equal(r.parent.calls, 1);
  } else assert.equal(r.parent.calls, 0);
});

for (const mode of ["wrong_nonce", "extra_identity", "malformed", "oversized"]) {
  test("malformed-request control blocks independently recorded effect: " + mode, async () => {
    const r = await drive(mode);
    assert.ok(r.request);
    assert.equal(r.parent.calls, 0, "invalid request cannot select or call the authority");
    assert.equal(r.effect, null);
  });
}

test("duplicate-request control invokes authority at most once and grants no second effect", async () => {
  const r = await drive("duplicate");
  assert.equal(r.effect, null);
  assert.ok(r.parent.calls <= 1, JSON.stringify(r.parent));
  if (r.child.stdio) {
    assert.equal(r.parent.calls, 1);
    assert.equal(r.parent.result, null, "duplicate request invalidates the run result");
  }
});

test("EOF control: a child that exits without authorization creates no effect", async () => {
  const r = await drive("eof");
  assert.equal(r.parent.calls, 0);
  assert.equal(r.request, null);
  assert.equal(r.effect, null);
});

test("authorization-timeout control leaves the child without permission or an effect", async () => {
  const r = await drive("valid", "timeout", { authorizeTimeoutMs: 120 });
  assert.equal(r.effect, null);
  assert.ok(r.response && ["deny", "EOF"].includes(r.response.outcome), JSON.stringify(r.response));
  if (r.child.stdio) {
    assert.equal(r.response.outcome, "deny");
    assert.equal(r.parent.calls, 1);
    assert.ok(r.elapsedMs >= 100 && r.elapsedMs < 3000, "bounded authority timeout: " + r.elapsedMs);
  } else assert.equal(r.parent.calls, 0);
});

test("silent-child timeout control bounds a process that never requests authorization", async () => {
  const r = await drive("silent", "allow", { timeoutMs: 200 });
  assert.equal(r.effect, null);
  assert.equal(r.parent.calls, 0);
  assert.equal(r.parent.result, null);
  assert.ok(r.elapsedMs < 3000, "bounded child lifetime: " + r.elapsedMs);
});

test("environment control: parent service and API keys are absent from the real child", async () => {
  const r = await drive("valid", "deny");
  assert.deepEqual(r.child.secretsPresent, [], "both parent env and the runEngine env argument stay outside child");
  assert.equal(r.effect, null);
});

test("nonzero-child control: an authorized effect does not make a failed child's RESULT successful", async () => {
  const r = await drive("exit_failure");
  if (r.child.stdio) {
    assert.ok(r.effect, "one synthetic effect was independently recorded after allow");
    assert.equal(r.parent.calls, 1);
    assert.equal(r.parent.result, null, "a failed child gives no trusted completed result");
  } else {
    assert.equal(r.effect, null, "baseline EOF grants no effect");
    assert.equal(r.parent.calls, 0);
  }
});
