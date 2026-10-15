"use strict";
// GC GUARDS (Crew A, B-04 garbage collection, 2026-10-15; protocol
// docs/career/prod-verification-protocol.md §11; master issue MI-045):
// mechanical guards that close UNENFORCED forbidden rules whose
// enforcement is a tree/citation check. Each test names the rule it
// enforces; when one stands green, the rule flips to ENFORCED in the
// register (both copies) in the same commit.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test("FR-031 (BUG-031): exactly one module 126 exists in the tree", () => {
  const hits = walk(ROOT, []).filter((p) => path.basename(p) === "126-career-track.js");
  assert.equal(hits.length, 1, `FR-031: expected exactly one 126-career-track.js, found ${hits.length}: ${hits.map((h) => path.relative(ROOT, h)).join(", ") || "none"}. Remediation: when the upstream branch merges, drop the vendored copy — never carry two (MI-045 / GC guards).`);
});
