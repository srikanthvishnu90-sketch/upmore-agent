"use strict";
// The career bundle has to run on the Supabase edge runtime, which is not the Deno the gate runs (CI 2.9.x; the edge
// runtime reported Deno 2.1.4 when F-011 was diagnosed). Node and newer Deno expose a Buffer global; the edge runtime
// did not, so module 148 threw "Buffer is not defined" on every tailor turn while every test, including the "edge
// realm" one that hands the renderer a Buffer, stayed green.
//
// This test evaluates the deployed bundle (router_core.career.js) in a realm with only standard JavaScript globals:
// no Buffer, require, module, process, global or setImmediate. A module that reaches for a Node global fails here
// instead of in production.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const Profile = require("../packages/domain/122-career-profile.js");
const Tailor = require("../packages/domain/123-career-tailor.js");
const RenderNode = require("../packages/domain/148-career-render.js");

const NODE_ONLY = ["Buffer", "require", "module", "exports", "process", "global", "setImmediate", "__dirname", "__filename"];

function loadBundleWithoutNodeGlobals() {
  let src = fs.readFileSync(path.join(root, "supabase", "functions", "_shared", "router_core.career.js"), "utf8");
  // The bundle is one flat script ending in an ES export list; a classic script cannot parse `export`, so the list
  // is read off and its names collected from the realm instead.
  const m = /\nexport\s*\{([^}]*)\};?\s*$/.exec(src);
  assert.ok(m, "the career bundle ends in one export list");
  src = src.slice(0, m.index);
  const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
  // Standard JS only: what V8 itself provides plus the web globals the edge runtime documents.
  const context = vm.createContext({ console, TextEncoder, TextDecoder, URL, URLSearchParams, setTimeout, clearTimeout, atob, btoa, structuredClone, crypto: globalThis.crypto });
  for (const g of NODE_ONLY) assert.equal(vm.runInContext(`typeof ${g}`, context), "undefined", `${g} is not in the edge realm`);
  vm.runInContext(`${src}\n;globalThis.__bundle = { ${names.join(", ")} };`, context, { filename: "router_core.career.js" });
  return vm.runInContext("__bundle", context);
}

function tailoredResume() {
  const persona = Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(root, "packages", "career-data", "fixtures", "test-persona.json"), "utf8")));
  const r = Tailor.tailorResume(persona, "Software Engineer, New Grad (TEST posting)\nRequired: Python, JavaScript, React, SQL, Git.", { jobId: "TEST-JOB-1", date: "2026-10-12" });
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  return r.resume;
}

const bytesOf = (out) => (out && out.ok !== false && out.buffer) || null;

test("the career bundle loads with no Node globals", () => {
  const B = loadBundleWithoutNodeGlobals();
  for (const name of ["CareerRouter", "CareerRender", "CareerBatchApply", "CareerAssign"]) assert.equal(typeof B[name], "object", name);
});

// Compression differs (the edge uses the vendored pure-JS deflate, Node its native zlib), so equality is judged on what
// the document says: the same lines read back from both files.
test("edge realm without Buffer: the tailored resume renders a PDF that reads back the same as Node's", () => {
  const B = loadBundleWithoutNodeGlobals();
  const resume = tailoredResume();
  const edge = B.CareerRender.renderPdf(resume), node = RenderNode.renderPdf(resume);
  const eb = bytesOf(edge), nb = bytesOf(node);
  assert.ok(eb && eb.length > 500, "a real PDF, not a refusal: " + JSON.stringify(edge && edge.error || null));
  assert.equal(String.fromCharCode(...Array.from(eb).slice(0, 5)), "%PDF-");
  assert.deepEqual(RenderNode.extractPdfLines(Buffer.from(eb)), RenderNode.extractPdfLines(Buffer.from(nb)), "same text on the edge as on Node");
});

test("edge realm without Buffer: the tailored resume renders a DOCX that reads back the same as Node's", () => {
  const B = loadBundleWithoutNodeGlobals();
  const resume = tailoredResume();
  const eb = bytesOf(B.CareerRender.renderDocx(resume)), nb = bytesOf(RenderNode.renderDocx(resume));
  assert.ok(eb && eb.length > 500, "a real DOCX");
  assert.deepEqual(RenderNode.extractDocxLines(Buffer.from(eb)), RenderNode.extractDocxLines(Buffer.from(nb)), "same text on the edge as on Node");
});
