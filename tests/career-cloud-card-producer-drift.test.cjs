"use strict";
// Development regression QA: mutable owned-source RPC, unchanged engine input, real producer and planner.
// Synthetic dry evidence only. Both source versions have valid independent digests; no browser or network.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn, execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const sourceRoot = path.resolve(process.env.CLOUD_CARD_PRODUCER_SOURCE_ROOT || path.join(__dirname, ".."));
const sourceSha = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (process.env.CLOUD_CARD_PRODUCER_EXPECT_SHA) assert.equal(sourceSha, process.env.CLOUD_CARD_PRODUCER_EXPECT_SHA);
const available = fs.existsSync(path.join(sourceRoot, "workers/career-cloud/prepare.ts"));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-producer-drift-")), measured = [];
after(() => {
  if (process.env.CLOUD_CARD_PRODUCER_DRIFT_MEASUREMENTS) fs.writeFileSync(process.env.CLOUD_CARD_PRODUCER_DRIFT_MEASUREMENTS,
    JSON.stringify({ sourceRoot, sourceSha, available, proof: "mutable-source producer regression; synthetic dry evidence", cases: measured }, null, 2) + "\n");
  fs.rmSync(root, { recursive: true, force: true });
});
const mod = p => JSON.stringify(pathToFileURL(path.join(sourceRoot, p)).href);
async function drive(mode) {
  const dir = fs.mkdtempSync(path.join(root, mode + "-")), driver = path.join(dir, "driver.ts");
  fs.writeFileSync(driver, `
import { prepareCloudCard } from ${mod("workers/career-cloud/prepare.ts")};
import { trustedManifest, planForm, contractFill } from ${mod("extension/src/apply_core.ts")};
import { applicationApprovalHash } from ${mod("scripts/apply.ts")};
import { hashApplyPayload } from ${mod("supabase/functions/_shared/career_apply_store.ts")};
const dir = ${JSON.stringify(dir)}, mode = ${JSON.stringify(mode)}, tmpRoot = dir + "/tmp";
await Deno.mkdir(tmpRoot);
const owner = "00000000-0000-4000-8000-0000000000a1", thread = "00000000-0000-4000-8000-0000000000b1";
const url = "https://jobs.example.test/qa-drift", posting = "QA-SOURCE-DRIFT";
const bytes = new TextEncoder().encode("%PDF-1.4 SYNTHETIC DRIFT QA RESUME");
const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(n => n.toString(16).padStart(2, "0")).join("");
const resume = { filename: "QA Drift Resume.pdf", sha256: sha, b64: btoa(String.fromCharCode(...bytes)) };
const row = (n: number, key: string, answer: string) => ({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"),
  user_id: owner, key, kind: "fact", state: "answered", answer });
const live = { profile: { user_id: owner, facts: [] }, rows: [row(1, "fact:full_name", "Original QA Name"),
  row(2, "fact:email", "original.qa@example.test")] };
const original = structuredClone(live), events: string[] = [], calls: any[] = [], reads: any[] = [];
const dryFields: any[] = [], inputChecks: boolean[] = [], paths: string[] = [];
let engineCalls = 0, mutationOccurred = false, result: any = null, error = null;
const mutate = (when: string) => {
  if (mode === "withdraw_during_dry") live.rows = live.rows.filter(r => r.key !== "fact:email");
  else if (mode === "edit_before_show") live.rows.find(r => r.key === "fact:email")!.answer = "changed.qa@example.test";
  else return;
  mutationOccurred = true; events.push("mutation:" + when);
};
const rpc = async (name: string, body: any) => {
  calls.push({ name, body: structuredClone(body) });
  if (name === "career_apply_message_cloud_prepare_context") return { resume, account: { epoch: 2, version: 3 } };
  if (name === "career_apply_message_cloud_sources") {
    events.push("source_read:" + (reads.length + 1));
    const snapshot = { user_id: owner, ...structuredClone(live) };
    const digest = await hashApplyPayload(snapshot); reads.push({ ...snapshot, digest });
    return { ...snapshot, digest };
  }
  if (name === "career_apply_message_cloud_card_show_as") {
    events.push("card_show");
    const payload = { version: 2, user_id: owner, thread_id: thread, execution_mode: "cloud", items: body.p_items };
    return { id: "SYNTHETIC-DRIFT-CARD", payload, hash: await hashApplyPayload(payload) };
  }
  throw Error("UNEXPECTED_RPC:" + name);
};
const runEngine = async (args: string[]) => {
  engineCalls++; events.push("dry_enter");
  if (args.includes("--submit")) throw Error("QA_DRY_RUN_ONLY");
  const get = (flag: string) => args[args.indexOf(flag) + 1];
  const factsPath = get("--facts"), resumePath = get("--resume"); paths.push(factsPath, resumePath);
  const originalInput = await Deno.readTextFile(factsPath), facts = JSON.parse(originalInput);
  if (mode === "withdraw_during_dry") mutate("during_dry");
  const m = trustedManifest({ owner, file: facts, rows: facts.text_answers, resume: { sha256: sha } });
  const schema = [{ name: "name", label: "Full name", type: "input_text", required: true, options: [] },
    { name: "email", label: "Email", type: "input_text", required: true, options: [] },
    { name: "resume", label: "Resume", type: "input_file", required: true, options: [] }];
  const plan = planForm({ userId: owner, jobId: posting, company: "QA Employer", family: "lever", schema,
    answers: m.answers, saved: m.saved, now: 0 });
  const contract = contractFill({ schema, plan, manifest: m, resume, jobId: posting });
  if (plan.needs.length || contract.asks.length) throw Error("QA_FIXTURE_NOT_READY");
  const fields = contract.fill; dryFields.push(...structuredClone(fields));
  const destination = url + "/submit", schemaHash = await hashApplyPayload(schema);
  const approval = await applicationApprovalHash({ userId: owner, posting, destination, fields,
    resumeSha256: sha, schemaHash, pageFieldNames: [], manifest: m });
  const evidence = { fields, schema, readback: Object.fromEntries(fields.map(f => [f.name, f.value])),
    approval_hash: approval, sources: m.byFactId, replay_sources: Object.values(m.byFactId),
    trust: { quarantine_version: m.version, manifest_hash: m.hash },
    payload: { user_id: owner, posting, company: "QA Employer", destination, resume, schema_hash: schemaHash, page_fields: {} } };
  events.push("evidence_built");
  if (mode === "edit_before_show") mutate("before_dry_return");
  inputChecks.push(await Deno.readTextFile(factsPath) === originalInput);
  events.push("dry_return");
  return { result: { state: "not_submitted", reason: "dry_run" }, evidence };
};
try { result = await prepareCloudCard({ owner, thread, urls: [url], resumeSha256: sha }, { rpc, runEngine, tmpRoot, now: () => 1800000000000 }); }
catch (e) { error = String(e?.code || e?.message || e); events.push("refused:" + error); }
const pathsLeft = [];
for (const p of paths) try { await Deno.stat(p); pathsLeft.push(p); } catch { /* cleaned */ }
console.log("QA " + JSON.stringify({ mode, owner, result, error, events, calls, reads, dryFields, original, live,
  engineCalls, mutationOccurred, inputChecks, tempLeft: [...Deno.readDirSync(tmpRoot)].map(e => e.name), pathsLeft }));
`);
  const r = await new Promise((resolve, reject) => {
    const p = spawn(process.env.DENO_BIN || "deno", ["run", "-A", "--deny-net", "--cached-only", "--no-check", driver], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", b => { out += b; }); p.stderr.on("data", b => { err += b; });
    const timer = setTimeout(() => p.kill("SIGKILL"), 15000);
    p.once("error", e => { clearTimeout(timer); reject(e); });
    p.once("close", code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
  assert.equal(r.code, 0, r.out + r.err);
  const line = r.out.split("\n").find(l => l.startsWith("QA ")); assert.ok(line, r.out + r.err);
  const done = JSON.parse(line.slice(3)); measured.push(done); return done;
}
const qa = (name, fn) => test(name, { skip: available ? false : "NOT_AVAILABLE_BASELINE: missing producer; no behavioral red claimed" }, fn);
const clean = r => { assert.deepEqual(r.tempLeft, []); assert.deepEqual(r.pathsLeft, []); };
const cards = r => r.calls.filter(c => c.name === "career_apply_message_cloud_card_show_as");

qa("unchanged-source control prepares one card from the exact original owned answer", async () => {
  const r = await drive("unchanged");
  assert.equal(r.error, null); assert.equal(r.result.ready, true); assert.equal(cards(r).length, 1);
  assert.equal(r.engineCalls, 1); assert.deepEqual(r.inputChecks, [true]); assert.equal(r.mutationOccurred, false);
  assert.equal(r.dryFields.find(f => f.name === "email").value, "original.qa@example.test"); clean(r);
});

for (const mode of ["withdraw_during_dry", "edit_before_show"]) qa("source change refuses before card show with unchanged original input: " + mode, async () => {
  const r = await drive(mode);
  assert.equal(r.mutationOccurred, true); assert.equal(r.engineCalls, 1); assert.deepEqual(r.inputChecks, [true]);
  assert.equal(r.dryFields.find(f => f.name === "email").value, "original.qa@example.test", "dry evidence uses the unchanged original input");
  assert.ok(!r.dryFields.some(f => f.value === "changed.qa@example.test"), "no replacement answer is invented or replanned");
  assert.equal(cards(r).length, 0, "changed live sources must block card creation");
  assert.equal(r.result, null); assert.equal(r.error, "APPROVED_SOURCE_WITHDRAWN");
  assert.equal(r.reads.length, 2); assert.notEqual(r.reads[0].digest, r.reads[1].digest);
  assert.ok(r.calls.filter(c => c.name === "career_apply_message_cloud_sources").every(c => c.body.p_user === r.owner));
  assert.ok(r.events.indexOf("source_read:2") > r.events.indexOf("dry_return"));
  if (mode === "withdraw_during_dry") assert.ok(r.events.indexOf("mutation:during_dry") < r.events.indexOf("evidence_built"));
  else assert.ok(r.events.indexOf("mutation:before_dry_return") > r.events.indexOf("evidence_built"));
  assert.ok(!r.calls.some(c => c.name === "career_apply_message_cloud_prepare_questions_as")); clean(r);
});
