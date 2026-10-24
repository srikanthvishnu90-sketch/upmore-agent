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
// when the form's last drive never completed (no drive_end in its
// sequence) and produced no verdict — the no-verdict (test-timeout)
// signature with the last step in flight and its elapsed offset.
//
// The no-verdict rule keys on the drive never completing, NOT on a
// missing assertions_passed event. Root cause of the false positives at
// ef267711 (lever-tsmg, lever-lyrahealth printed as timeout signatures
// although their drives completed in ~10-17 s and their tests passed):
// assertions_passed is emitted ONLY by the per-form test; the widget-gap
// guard tests re-drive WPP/TSMG/LyraHealth through driveForm directly,
// and those re-drives complete (drive_end) with no assertion-verdict
// event by design — the guard's verdict lives in its own assertions,
// not in diag events. Reading a completed re-drive's missing verdict
// event as a timeout was the bug; a completed drive is never a timeout
// signature.

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
      // The failing drive's own drive_end is the one just before the
      // assertion event — a later guard re-drive of the same form must
      // not re-attribute the elapsed time.
      let endIdx = -1;
      for (let i = failIdx - 1; i >= 0; i--) if (evs[i].step === "drive_end") { endIdx = i; break; }
      const end = endIdx >= 0 ? evs[endIdx] : null;
      const ms = end && typeof end.totalMs === "number" ? end.totalMs : lastAtMs(failIdx);
      const drive = end && end.driveError ? ` driveError: ${String(end.driveError).slice(0, 300)}` : "";
      // The drift record (2026-10-24): the suite stores, on the
      // assertion_failed event, the measured-vs-pinned outcome as counts,
      // field ids and outcome names only. Render exactly those structured
      // fields — no free text beyond the already-redacted error above.
      let driftTxt = "";
      try {
        const d = evs[failIdx].drift;
        if (d && d.measured && d.pinned) {
          const s = (x) => `raw=${x.rawFields} mapped=${x.mapped} filled=${x.filledCount} readback=${x.readbackMatched} driveError=${x.driveError} bindError=${x.bindError}`;
          driftTxt = ` drift measured[${s(d.measured)}] pinned[${s(d.pinned)}]`;
          if (typeof d.fillsDiffering === "number") {
            driftTxt += ` fillsDiffering=${d.fillsDiffering}`;
            const list = Array.isArray(d.fills) ? d.fills.slice(0, 20).map((f) => `${f.field}:${f.measured}!=${f.pinned}`).join("; ") : "";
            if (list) driftTxt += ` fills[${list}]`;
          }
          if (typeof d.classesDiffering === "number") driftTxt += ` classesDiffering=${d.classesDiffering}`;
          if (d.fileQuestions) driftTxt += ` fileQuestions=${d.fileQuestions.measured}!=${d.fileQuestions.pinned}`;
          if (d.attestation) driftTxt += ` attestation=${d.attestation.measured}!=${d.attestation.pinned}`;
        }
      } catch {}
      console.log(`::error title=forms-ci ${form}::step=assertion_failed elapsedMs=${ms != null ? ms : "?"} assertion: ${esc(String(evs[failIdx].error || "").slice(0, 800))}${esc(drive)}${esc(driftTxt)}`);
    } else if (threwIdx >= 0 && threwIdx > passedIdx) {
      const ms = lastAtMs(threwIdx);
      console.log(`::error title=forms-ci ${form}::step=drive_threw elapsedMs=${ms != null ? ms : "?"} error: ${esc(String(evs[threwIdx].error || "").slice(0, 800))}`);
    } else if (startIdx >= 0 && passedIdx < startIdx && !evs.slice(startIdx).some((e) => e.step === "drive_end")) {
      const last = evs[evs.length - 1];
      const ms = lastAtMs(evs.length - 1);
      const field = typeof last.field === "string" ? ` field=${last.field}` : "";
      console.log(`::error title=forms-ci ${form}::step=${last.step}${field} elapsedMs=${ms != null ? ms : "?"} no assertion verdict recorded (test-timeout signature)`);
    }
  }
}

main();
