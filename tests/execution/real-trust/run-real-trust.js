// Execution-trust fixtures — real production logic, no mirrors.
//
// Each fixture imports the SHARED module
// supabase/functions/agent-exec/execution-guards.ts — the same functions the
// deployed agent-exec edge function calls. The fakes (FakePage, FakeRunStore,
// ExecutorPipeline, FakeDb) model the boundaries (page/DB/session) and record
// side effects; they make NO guard decisions.
//
// The wiring checks below prove index.ts actually CALLS the shared guards
// (and keeps no local duplicate implementation): delete a guard call — or
// re-implement a guard locally — and this runner fails.
//
// Run: node tests/execution/real-trust/run-real-trust.js
// (from the upmore-agent repo root)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { check, section, totals } from "./assert.js";
import { run as stop } from "./guards-stop.js";
import { run as otp } from "./guards-otp.js";
import { run as exclusion } from "./guards-exclusion.js";
import { run as approvalE2E } from "./guards-approval-e2e.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function wiring() {
  section("wiring: deployed index.ts calls the shared guards (no local duplicates)");
  const src = readFileSync(join(root, "supabase/functions/agent-exec/index.ts"), "utf8");

  const mustCall = [
    'from "./execution-guards.ts"',
    "decideExecuteGate(",
    "decideOtpSubmit(",
    "otpIsExpired(",
    "OTP_TTL_MS",
    "runDeclarative(",
    "pushShot(",
  ];
  for (const token of mustCall) {
    check(`index.ts calls shared \`${token}\``, src.includes(token));
  }

  const mustNotDuplicate = [
    "const TRIPWIRES",
    "function checkExcludedCategory",
    "async function runDeclarative(",
    "type BrowserOutcome =",
    "function pushShot(",
    "30 * 60 * 1000",
  ];
  for (const token of mustNotDuplicate) {
    check(`index.ts has no local duplicate \`${token}\``, !src.includes(token), "local mirror found");
  }
}

await stop();
await otp();
await exclusion();
await approvalE2E();
wiring();

const t = totals();
console.log(`\n==============================`);
console.log(`real-trust fixtures: ${t.passed} passed, ${t.failed} failed`);
if (t.failed) {
  console.log(`failed checks: ${t.failures.join("; ")}`);
  process.exit(1);
}
