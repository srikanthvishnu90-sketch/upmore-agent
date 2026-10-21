"use strict";
// Verify the exact reviewed bytes; this never rebuilds or minifies a release.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { spawnSync } = require("node:child_process");

const DEFAULT_ROOT = path.resolve(__dirname, "../../supabase/releases/career-case2-isolation-v1");
const MANIFEST_SHA256 = "94246f7358967f77fc453a440857ab327314b6cad813f52ffb55a656b43b9fb8";
const PROVENANCE_SHA256 = "b88310239d6bc1cf04f76639790e8fb23f6f229823427501dcf14a885d2353c7";
const ROUTER_PLAN_SHA256 = "40db18ab52c031a56384154728fb8b4c4adfdef07418dfec9da334b3f15ee6b1";
const ROUTER_SHA256 = "7339f0c04f1d85ad3242c2a4466605baeab9ca35dc12bbe22e791fac78603033";
const TYPE_PLAN_SHA256 = "2d26f201bb6425ff166da477f2407419cae263ffd8ac0bdd58173773162718e2";
const HOST_PLAN_SHA256 = "413c3e124c013d38faf0d544e48d65ba617f9ec5b94b35835349b939c470321f";
const REMOTE_IMPORTS = new Set([
  "https://deno.land/std@0.208.0/http/server.ts",
  "https://esm.sh/@supabase/supabase-js@2.117.1",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm",
]);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const deny = (message) => { throw Error("live release: " + message); };

function verifyRelease(root = DEFAULT_ROOT) {
  if (!vm.SourceTextModule) deny("run verification with --experimental-vm-modules");
  root = path.resolve(root);
  const manifestBytes = fs.readFileSync(path.join(root, "manifest.json"));
  if (sha(manifestBytes) !== MANIFEST_SHA256) deny("reviewed manifest digest changed");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.functions)) deny("invalid manifest");
  const provenanceBytes = fs.readFileSync(path.join(root, "provenance.json"));
  if (sha(provenanceBytes) !== PROVENANCE_SHA256) deny("authoritative provenance digest changed");
  const provenance = JSON.parse(provenanceBytes.toString("utf8"));
  const baseFunctions = new Map(provenance.functions.map(fn => [fn.name, fn]));
  const expectedFunctions = new Map([
    ["agent-chat", { jwt: true, entrypoint: "src/index.ts", paths: ["src/index.ts", "src/handler-career.ts", "src/_shared/chat_cors.ts", "src/_shared/chat_input.ts", "src/_shared/chat_session.ts", "_shared/identity_redact.ts", "_shared/router_core.career.js", "_shared/career_host.js", "_shared/career_task_bridge.js", "_shared/career_pool.js", "_shared/career_persistence.js", "_shared/channel_artifacts.ts"] }],
    ["telegram-inbound", { jwt: false, entrypoint: "telegram-inbound/index.ts", paths: ["telegram-inbound/index.ts", "_shared/telegram.ts", "_shared/channel_bridge.ts", "_shared/channel_present.ts", "_shared/channel_artifacts.ts"] }],
  ]);
  const verified = [];
  const payloads = [];
  for (const fn of manifest.functions) {
    const expected = expectedFunctions.get(fn.name);
    if (!expected) deny("unknown or duplicate function");
    expectedFunctions.delete(fn.name);
    if (fn.directory !== fn.name || fn.verify_jwt !== expected.jwt || fn.entrypoint !== expected.entrypoint || fn.files.length !== expected.paths.length) deny("function boundary changed: " + fn.name);
    const functionRoot = path.join(root, fn.directory);
    const base = baseFunctions.get(fn.name);
    if (!base || base.version !== (fn.name === "agent-chat" ? 246 : 7) || base.files.length !== expected.paths.length) deny("base provenance changed");
    const baseFiles = new Map(base.files.map(file => [file.path, file]));
    if (baseFiles.size !== expected.paths.length || expected.paths.some(name => !baseFiles.has(name))) deny("base file allowlist changed");
    const changed = new Set(fn.name === "agent-chat" ? ["_shared/career_host.js", "_shared/router_core.career.js", "src/handler-career.ts", "_shared/career_persistence.js"] : ["_shared/channel_bridge.ts", "_shared/channel_present.ts", "_shared/telegram.ts"]);
    const actual = [];
    function walk(dir) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.isSymbolicLink()) deny("symlink in function tree");
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.isFile()) actual.push(path.relative(functionRoot, full).split(path.sep).join("/"));
        else deny("unsupported filesystem entry");
      }
    }
    if (fs.lstatSync(functionRoot).isSymbolicLink()) deny("symlink function root");
    walk(functionRoot);
    const allow = new Set();
    const modules = new Map();
    const payloadFiles = [];
    const context = vm.createContext({});
    let bytes = 0;
    for (const file of fn.files) {
      const name = file.path;
      if (typeof name !== "string" || !expected.paths.includes(name) || name.includes("\\") || path.posix.isAbsolute(name) || path.posix.normalize(name) !== name || allow.has(name)) deny("invalid file path");
      allow.add(name);
      const content = fs.readFileSync(path.join(functionRoot, name));
      if (content.length !== file.bytes || sha(content) !== file.sha256) deny("byte/hash mismatch: " + fn.name + "/" + name);
      if (!changed.has(name) && (content.length !== baseFiles.get(name).bytes || sha(content) !== baseFiles.get(name).sha256)) deny("unrelated base file changed: " + fn.name + "/" + name);
      bytes += content.length;
      let code = content.toString("utf8");
      if (!Buffer.from(code, "utf8").equals(content)) deny("source is not byte-preserving UTF-8: " + name);
      payloadFiles.push({ name, content: code });
      if (name.endsWith(".ts")) code = stripTypeScriptTypes(code, { mode: "transform" });
      modules.set(name, new vm.SourceTextModule(code, { context, identifier: name }));
    }
    if (actual.length !== allow.size || actual.some(name => !allow.has(name))) deny("unexpected or missing file: " + fn.name);
    if (!allow.has(fn.entrypoint)) deny("entrypoint missing");
    const reached = new Set();
    function visit(name) {
      if (reached.has(name)) return;
      reached.add(name);
      for (const specifier of modules.get(name).dependencySpecifiers) {
        if (REMOTE_IMPORTS.has(specifier)) continue;
        if (!specifier.startsWith("./") && !specifier.startsWith("../")) deny("unapproved external import: " + specifier);
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier));
        if (!allow.has(target)) deny("import escapes manifest: " + name + " -> " + specifier);
        visit(target);
      }
    }
    visit(fn.entrypoint);
    if (reached.size !== allow.size) deny("manifest includes unreachable files: " + fn.name);
    if (fn.name === "agent-chat") {
      const planBytes = fs.readFileSync(path.join(root, "router-pr90-transform.json"));
      if (sha(planBytes) !== ROUTER_PLAN_SHA256) deny("reviewed PR90 transform digest changed");
      const plan = JSON.parse(planBytes.toString("utf8"));
      if (plan.reference_merge !== "b316efbe24332e2f96fd484b47dcf63fa4d310b1" || plan.base_sha256 !== "1fca1f3969b70646c9c45173079026ed813368eadb8f8ba0aef2eb4396014b1c" || plan.replacements.length !== 4) deny("unreviewed router transform");
      let original = Buffer.from(payloadFiles.find(file => file.name === "_shared/router_core.career.js").content, "utf8");
      if (sha(original) !== ROUTER_SHA256) deny("reviewed PR90 router target changed");
      if (sha(original) !== plan.candidate_sha256 || original.length !== plan.candidate_bytes) deny("router transform target changed");
      for (const change of [...plan.replacements].sort((a, b) => b.new_start - a.new_start)) {
        const before = Buffer.from(change.old_utf8), after = Buffer.from(change.new_utf8), start = change.new_start;
        if (!Number.isSafeInteger(start) || start < 0 || start + after.length > original.length || !original.subarray(start, start + after.length).equals(after)) deny("router inverse site changed");
        original = Buffer.concat([original.subarray(0, start), before, original.subarray(start + after.length)]);
      }
      if (original.length !== 3391858 || sha(original) !== plan.base_sha256 || sha(original) !== baseFiles.get("_shared/router_core.career.js").sha256) deny("router bytes changed outside reviewed PR90 sites");
      const hostPlanBytes = fs.readFileSync(path.join(root, "host-case2-transform.json"));
      if (sha(hostPlanBytes) !== HOST_PLAN_SHA256) deny("reviewed Case2 host transform changed");
      const hostPlan = JSON.parse(hostPlanBytes.toString("utf8"));
      let originalHost = Buffer.from(payloadFiles.find(file => file.name === "_shared/career_host.js").content, "utf8");
      if (hostPlan.replacements.length !== 8 || sha(originalHost) !== hostPlan.candidate_sha256 || originalHost.length !== hostPlan.candidate_bytes) deny("host transform target changed");
      for (const change of [...hostPlan.replacements].sort((a, b) => b.new_start - a.new_start)) {
        const before = Buffer.from(change.old_utf8), after = Buffer.from(change.new_utf8), start = change.new_start;
        if (!Number.isSafeInteger(start) || start < 0 || start + after.length > originalHost.length || !originalHost.subarray(start, start + after.length).equals(after)) deny("host inverse site changed");
        originalHost = Buffer.concat([originalHost.subarray(0, start), before, originalHost.subarray(start + after.length)]);
      }
      if (originalHost.length !== 13318 || sha(originalHost) !== "d8aa11c61f1c3227c7e38d2268384a95b97230c3eec662ed0680ff0694de66cb" || sha(originalHost) !== baseFiles.get("_shared/career_host.js").sha256) deny("host bytes changed outside reviewed Case2 sites");
    }
    verified.push({ name: fn.name, entrypoint: fn.entrypoint, verify_jwt: fn.verify_jwt, files: allow.size, bytes });
    payloads.push({ name: fn.name, entrypoint_path: fn.entrypoint, verify_jwt: fn.verify_jwt, files: payloadFiles });
  }
  if (expectedFunctions.size) deny("required function missing");
  const typePlanBytes = fs.readFileSync(path.join(root, "type-boundary-transform.json"));
  if (sha(typePlanBytes) !== TYPE_PLAN_SHA256) deny("reviewed type boundary transform changed");
  const typePlan = JSON.parse(typePlanBytes.toString("utf8"));
  const typeBases = new Map([
    ["agent-chat/src/handler-career.ts", "a2c270d5aec8a5b07f9693f28054c0cdd575487f8f7140c985c480c137259f04"],
    ["agent-chat/_shared/career_persistence.js", "75507cdcbef14440f6e2d0ff7c237a3d3fb12262cb868d0ab33aae55120b3c07"],
    ["telegram-inbound/_shared/telegram.ts", "b5f8b8e963841f1fb126efa4ce487c5f12933dbf8301c3368283459ecaabe917"],
  ]);
  for (const file of typePlan.files) {
    if (!typeBases.has(file.path) || file.base_sha256 !== typeBases.get(file.path)) deny("type boundary base changed");
    typeBases.delete(file.path);
    const slash = file.path.indexOf("/"), functionName = file.path.slice(0, slash), name = file.path.slice(slash + 1);
    let original = Buffer.from(payloads.find(fn => fn.name === functionName).files.find(source => source.name === name).content, "utf8");
    if (original.length !== file.candidate_bytes || sha(original) !== file.candidate_sha256) deny("type boundary target changed");
    for (const change of [...file.replacements].sort((a, b) => b.new_start - a.new_start)) {
      const before = Buffer.from(change.old_utf8), after = Buffer.from(change.new_utf8), start = change.new_start;
      if (!Number.isSafeInteger(start) || start < 0 || start + after.length > original.length || !original.subarray(start, start + after.length).equals(after)) deny("type boundary inverse site changed");
      original = Buffer.concat([original.subarray(0, start), before, original.subarray(start + after.length)]);
    }
    if (original.length !== file.base_bytes || sha(original) !== file.base_sha256) deny("unreviewed type boundary change");
  }
  if (typeBases.size) deny("type boundary proof missing");
  return { root, manifest, verified, payloads };
}

module.exports = { verifyRelease, DEFAULT_ROOT };
if (require.main === module) {
  if (!vm.SourceTextModule) {
    const r = spawnSync(process.execPath, ["--experimental-vm-modules", __filename, ...process.argv.slice(2)], { stdio: "inherit" });
    process.exit(r.status === null ? 1 : r.status);
  }
  const result = verifyRelease(process.argv.slice(2).find(arg => arg !== "--payload") || DEFAULT_ROOT);
  console.log(JSON.stringify(process.argv.includes("--payload") ? result.payloads : { verified: result.verified }, null, 2));
}
