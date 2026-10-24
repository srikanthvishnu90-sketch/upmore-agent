// forms-ci coverage diagnostics read-back (2026-10-24).
//
// The coverage suite's diagnostics JSONL (FORMS_CI_COVERAGE_DIAG) is
// appended event-by-event DURING the drives, so it exists even when a test
// timeout kills the suite file before its test.after summary can run —
// and the suite's own ::error prints never reach GitHub's workflow-command
// parser anyway (they are emitted inside `node --test`, whose TAP output
// prefixes test-process stdout). This reader is run by the gate-coverage
// job's "Gate result as annotations" step, from a plain shell step whose
// stdout IS parsed for workflow commands, and turns the JSONL's failure
// records into public check-run annotations.
//
// It emits ONLY fields that already passed through the suite's redaction
// allowlist (diag() redacts error/driveError before they are stored):
// the fixture id, the failing step name, elapsed ms, and the stored error
// text (capped, workflow-command-escaped). Nothing else in the JSONL is
// printed. Best-effort and deterministic: a missing/unreadable file or a
// malformed line never fails the step (exit 0 always).
//
// Per form, the LAST failure record wins (a form can be re-driven inside
// the suite): an assertion_failed event, else a drive_threw event, else —
// when the form has drive events but no assertions_passed after its last
// drive_start — the no-verdict (test-timeout) signature with the last step
// in flight and its elapsed offset.

"use strict";
const fs = require("fs");

function esc(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function main() {
  const file = process.argv[2];
  if (!file) return;
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); } catch { return; }
  const byForm = new Map();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || typeof ev.form !== "string" || typeof ev.step !== "string") continue;
    if (!byForm.has(ev.form)) byForm.set(ev.form, []);
    byForm.get(ev.form).push(ev);
  }
  for (const [form, evs] of byForm) {
    const lastIdx = (step) => {
      for (let i = evs.length - 1; i >= 0; i--) if (evs[i].step === step) return i;
      return -1;
    };
    const lastAtMs = (upto) => {
      for (let i = Math.min(upto, evs.length - 1); i >= 0; i--) if (typeof evs[i].atMs === "number") return evs[i].atMs;
      return null;
    };
    const failIdx = lastIdx("assertion_failed");
    const threwIdx = lastIdx("drive_threw");
    const passedIdx = lastIdx("assertions_passed");
    const startIdx = lastIdx("drive_start");
    if (failIdx >= 0 && failIdx > passedIdx) {
      const endIdx = lastIdx("drive_end");
      const end = endIdx >= 0 ? evs[endIdx] : null;
      const ms = end && typeof end.totalMs === "number" ? end.totalMs : lastAtMs(failIdx);
      const drive = end && end.driveError ? ` driveError: ${String(end.driveError).slice(0, 300)}` : "";
      console.log(`::error title=forms-ci ${form}::step=assertion_failed elapsedMs=${ms != null ? ms : "?"} assertion: ${esc(String(evs[failIdx].error || "").slice(0, 800))}${esc(drive)}`);
    } else if (threwIdx >= 0 && threwIdx > passedIdx) {
      const ms = lastAtMs(threwIdx);
      console.log(`::error title=forms-ci ${form}::step=drive_threw elapsedMs=${ms != null ? ms : "?"} error: ${esc(String(evs[threwIdx].error || "").slice(0, 800))}`);
    } else if (startIdx >= 0 && passedIdx < startIdx) {
      const last = evs[evs.length - 1];
      const ms = lastAtMs(evs.length - 1);
      const field = typeof last.field === "string" ? ` field=${last.field}` : "";
      console.log(`::error title=forms-ci ${form}::step=${last.step}${field} elapsedMs=${ms != null ? ms : "?"} no assertion verdict recorded (test-timeout signature)`);
    }
  }
}

main();
