"use strict";
// B-05 STRUCTURAL TEST (Crew A, 2026-10-15; protocol
// docs/career/prod-verification-protocol.md §9; master issue MI-047):
// the HTTP 413 class fails HERE, in the sweep, instead of at the
// platform. The career entry's static import graph is staged with
// scripts/career/stage-career.cjs and the staged total must stay under
// the 4,200,000 B ceiling (the practical platform ceiling sits between
// 3,950,107 B accepted and 4,822,785 B rejected — the full bundle was
// the rejected one). The career artifact must also never contain the
// finance-carrying full bundle.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const CEILING = 4200000;
const REMEDIATION = "Remediation: the career artifact is staged from agent-chat/index-career.ts only (protocol §9 / MI-047). If the total grew, a module pulled the full bundle or a heavy dependency into the career graph — prune the import, or split the data file; never raise the ceiling without the owner's word and a platform probe.";

test("B-05: the staged career artifact stays under the platform ceiling", () => {
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "career-stage-"));
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, "..", "scripts", "career", "stage-career.cjs"), stageDir, "--json"], { encoding: "utf8" });
    const report = JSON.parse(out.trim().split("\n").pop());
    const paths = report.fileList.map((f) => f.path);
    assert.ok(paths.includes("_shared/router_core.career.js"), `the career bundle must be staged; got: ${paths.join(", ")}. ${REMEDIATION}`);
    assert.ok(!paths.includes("_shared/router_core.js"), `the FULL bundle (finance surface, 4.9 MB raw) must never enter the career artifact. ${REMEDIATION}`);
    assert.ok(report.totalBytes <= CEILING, `staged career artifact is ${report.totalBytes} B, over the ${CEILING} B ceiling (mode: ${report.mode}). ${REMEDIATION}`);
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
});
