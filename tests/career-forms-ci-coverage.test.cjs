"use strict";
// FORMS-CI COVERAGE — captured-form coverage for every captured application form in
// tests/fixtures/forms-ci that did not already carry a pinned coverage record.
// The six Ashby forms are pinned by the Ashby verdict pack (branch
// muse/2026-10-23-ashby-verdict-pack, tests/fixtures/ashby-verdict-pack-expected.json:
// 87/87 questions mapped, filled and read back) and are NOT re-driven here. This pack
// covers the remaining captured forms: 5 Greenhouse + 6 Lever.
//
// What this suite proves, and only this: against the captured markup (CI capture of
// 2026-10-19, .github/workflows/form-capture.yml, commit 5d1e51da), served locally, the
// product's own browser executor (scripts/career/portal-browser-helper.cjs, the daemon
// the board service spawns) maps each form through the shared binder (bindFields,
// extension/lib/trainee-core.js), fills the mapped questions with the TEST
// persona's values (option fields take the profile's values — see valueFor;
// attestation-class fields stop for the person and conditional follow-ups are
// gated on the persona's parent answer), and reads back exactly what was
// filled — measured per form and pinned in
// tests/fixtures/forms-ci-coverage-expected.json.
//
// This is CAPTURED-FORM COVERAGE. It is not live driveability and not production
// quality: no live site was contacted by this pack — every form driven here was
// already in the repo, no new capture was made, and the pages are served from
// 127.0.0.1 with every script/link/external src stripped. No Palantir capture exists
// in forms-ci (asserted below); if one ever appears it is excluded under the owner's
// standing Palantir hold, never driven.
//
// FAIL-CLOSED BY CONSTRUCTION: the runner can only send open / discover / fill /
// readback / close / shutdown to the helper. There is no code path that sends review
// or submit_and_capture, and the final test asserts the command log proves it; the
// local server only ever receives GETs (asserted).
//
// THE COVERAGE GATE (pattern from the SmartRecruiters verdict pack, scoped by the
// 2026-10-23 corrections): there is NO aggregate coverage claim — claims are
// scoped. A form's coverage record is claimable only when it carries full
// provenance AND a pinned drive expectation AND a per-field reconciliation of
// every mapped-not-filled field (status from the captured schema, widget class,
// the executor's outcome, its own reason) AND a widget class for every mapped
// field; custom-select reconciliation entries must carry the
// unverified-against-live label. The recorded per-form claims and the recorded
// per-widget-class claim tallies must equal what the gate computes from the pins,
// and the recorded coverage numbers must equal the sums of the per-form pins — a
// headline no pin supports cannot stand. Fail-first evidence for the gate is
// recorded in docs/engine/FORMS-CI-COVERAGE-2026-10-23.md (the suite run against
// a deliberately tampered pin went red before the true pin was finalized).
//
// Synthetic data only: one fixed TEST persona, one synthetic PDF. Regenerate the
// measured results after an intentional capture/binder change with
// FORMS_CI_COVERAGE_EMIT=<path> and review the diff before re-pinning.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const FORMS = path.join(ROOT, "tests", "fixtures", "forms-ci");
const HELPER = path.join(ROOT, "scripts", "career", "portal-browser-helper.cjs");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(FORMS, "manifest.json"), "utf8"));
const EXPECTED_PATH = process.env.FORMS_CI_COVERAGE_EXPECTED || path.join(__dirname, "fixtures", "forms-ci-coverage-expected.json");
const EXPECTED = JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf8"));

// In scope: captured application forms (manifest status "application", rendered HTML
// stored) in the families no earlier pack pinned — Greenhouse and Lever.
const IN_SCOPE_FAMILIES = ["greenhouse", "lever"];
const CAPTURED = MANIFEST.forms.filter((f) => IN_SCOPE_FAMILIES.includes(f.family) && f.status === "application" && f.html);
const ASHBY_CAPTURED = MANIFEST.forms.filter((f) => f.family === "ashby" && f.status === "application" && f.html);
require(path.join(ROOT, "extension", "lib", "trainee-core.js"));
const bindFields = globalThis.TraineeCore.bindFields;

// ---------------------------------------------------------------------------
// THE COVERAGE GATE (scoped — the 2026-10-23 corrections dropped the blanket
// claim). A form's coverage record is claimable only when the form carries full
// provenance AND a pinned drive expectation AND a per-field reconciliation
// covering exactly its mapped-not-filled fields (each with a status, a widget
// class, and its own reason; custom-select entries must be labeled
// unverified-against-live) AND a widget class for every mapped field. The
// recorded coverage block carries sums only — no claimable flag — and the
// recorded per-form claims and per-widget-class tallies must equal the gate's
// computation from the pins.
// ---------------------------------------------------------------------------
function formClaim(exp, form) {
  const id = (form && form.id) || "?";
  if (!form.sourceUrl || !form.capturedAt || !form.captureMethod) {
    return { claimable: false, reason: `captured form ${id} lacks provenance (sourceUrl/capturedAt/captureMethod)` };
  }
  const e = form.expectation;
  if (!e || typeof e.mapped !== "number" || !Array.isArray(e.fills)) {
    return { claimable: false, reason: `captured form ${id} has no pinned drive expectation` };
  }
  if (!e.fieldClasses || Object.keys(e.fieldClasses).length !== e.mapped) {
    return { claimable: false, reason: `captured form ${id} does not pin a widget class for every mapped field` };
  }
  if (!Array.isArray(e.reconciliation)) {
    return { claimable: false, reason: `captured form ${id} has no per-field reconciliation of its mapped-not-filled fields` };
  }
  const nonFilled = e.fills.filter(([, o]) => o !== "filled").map(([n]) => n).sort();
  const recNames = e.reconciliation.map((r) => r.name).sort();
  if (JSON.stringify(recNames) !== JSON.stringify(nonFilled)) {
    return { claimable: false, reason: `captured form ${id} reconciliation does not cover exactly its mapped-not-filled fields` };
  }
  for (const r of e.reconciliation) {
    if (!r.status || !r.widgetClass || !r.reason) {
      return { claimable: false, reason: `captured form ${id} reconciliation entry for ${r.name || "?"} lacks status/widgetClass/reason` };
    }
    if (r.widgetClass.startsWith("custom select") && r.unverifiedAgainstLive !== true) {
      return { claimable: false, reason: `captured form ${id} custom-select entry ${r.name} is not labeled unverified-against-live` };
    }
  }
  return { claimable: true, reason: `captured form ${id}: provenance, pinned drive expectation, complete per-field reconciliation and field classes` };
}
function coverageClaim(exp) {
  const forms = Array.isArray(exp.capturedForms) ? exp.capturedForms : [];
  if (!forms.length) return { claimable: false, perForm: [], reason: "no captured forms — coverage not claimable" };
  const perForm = forms.map((f) => ({ id: f.id || "?", ...formClaim(exp, f) }));
  return { claimable: perForm.every((p) => p.claimable), perForm };
}
function coverageSums(exp) {
  const forms = Array.isArray(exp.capturedForms) ? exp.capturedForms : [];
  const sum = (k) => forms.reduce((a, f) => a + (((f.expectation || {})[k]) || 0), 0);
  return {
    formsCaptured: forms.length,
    questionsMapped: sum("mapped"),
    questionsFilled: sum("filledCount"),
    questionsReadBackExactly: sum("readbackMatched"),
  };
}
function widgetClassTallies(exp) {
  const out = {};
  for (const f of Array.isArray(exp.capturedForms) ? exp.capturedForms : []) {
    const e = f.expectation || {};
    const fam = out[f.family] || (out[f.family] = {});
    for (const [name, outcome] of Array.isArray(e.fills) ? e.fills : []) {
      const cls = (e.fieldClasses || {})[name];
      if (!cls) continue;
      const t = fam[cls] || (fam[cls] = { mapped: 0, filled: 0 });
      t.mapped += 1;
      if (outcome === "filled") t.filled += 1;
    }
  }
  return out;
}
function recordedClaimConsistent(exp) {
  if (!exp.coverage || exp.coverage.claimable !== undefined) return false; // the blanket claim must not exist
  const s = coverageSums(exp);
  if (exp.coverage.formsCaptured !== s.formsCaptured
    || exp.coverage.questionsMapped !== s.questionsMapped
    || exp.coverage.questionsFilled !== s.questionsFilled
    || exp.coverage.questionsReadBackExactly !== s.questionsReadBackExactly) return false;
  const verdict = coverageClaim(exp);
  for (const f of Array.isArray(exp.capturedForms) ? exp.capturedForms : []) {
    const v = verdict.perForm.find((p) => p.id === f.id);
    if (!v || !f.claim || (f.claim.status === "claimable") !== v.claimable) return false;
  }
  const tallies = widgetClassTallies(exp);
  const recorded = Array.isArray(exp.widgetClassClaims) ? exp.widgetClassClaims : [];
  let want = 0;
  for (const classes of Object.values(tallies)) want += Object.keys(classes).length;
  if (recorded.length !== want) return false;
  for (const w of recorded) {
    const t = (tallies[w.family] || {})[w.widgetClass];
    if (!t || t.mapped !== w.mapped || t.filled !== w.filled) return false;
    if (!["covered", "partial", "unverified-against-live"].includes(w.verdict)) return false;
  }
  return true;
}

// Same strip the Ashby pack exercised the captures with: the capture already removed
// script/style bodies and iframes; this removes the tags and any external resource
// reference so a replayed page can only talk to the local server.
function strip(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s(src|href)\s*=\s*"(https?:)?\/\/[^"]*"/gi, ' $1="/__blocked"')
    .replace(/\s(src|href)\s*=\s*'(https?:)?\/\/[^']*'/gi, " $1='/__blocked'");
}

// ---------------------------------------------------------------------------
// CI DIAGNOSTICS (2026-10-24) — observation only. The two Greenhouse failures
// in CI (82cb014a and 6d24e437: andurilindustries, wppmedia) were never
// classifiable because the failing tests' error text, the per-drive elapsed
// time and the step in flight at failure never left the runner — the gate
// annotation carries test names only. This block records, per drive, an
// append-only JSONL event log: step boundaries with ms offsets from drive
// start, each fill's ms + outcome, drive totals, a drive's thrown error, and
// a failed form test's assertion text (captured and rethrown unchanged). The
// log goes to FORMS_CI_COVERAGE_DIAG (the gate-coverage CI job points it at
// an uploaded artifact); test.after also prints a compact per-drive summary
// to the gate log, appends it to the GitHub step summary when present, and
// emits the failures as ::error annotations. Every write is best-effort and
// wrapped: diagnostics can never change a test outcome — no assertion, pin,
// timeout or drive step reads any of this.
// ---------------------------------------------------------------------------
const DIAG_PATH = process.env.FORMS_CI_COVERAGE_DIAG || path.join(os.tmpdir(), "forms-ci-coverage-diag.jsonl");
const diagEvents = [];
// Per-form drive state (start epoch + last step in flight), kept outside the
// event log so a drive that THROWS between steps can have its last step and
// the throw's own offset attached to its drive_threw record by the catcher.
const driveState = new Map();
try { fs.writeFileSync(DIAG_PATH, ""); } catch {}
// Redaction (2026-10-24): today's diagnostic inputs are synthetic by
// construction (TEST persona, synthetic PDF, public captured fixtures, no
// secrets in the job), but that was true by circumstance, not enforced.
// Free-text diagnostic strings (error / driveError) pass through this
// redactor before they are stored or printed: absolute filesystem paths
// and home dirs become <path>, non-local URLs become <url> (the local
// 127.0.0.1 origin is kept — it is the replay server, not data), and
// ENV=value-style assignments lose their values. Allowlisted by design:
// error codes (DRIVER_ERROR), fixture ids, step names, field names, ms
// and outcomes pass through untouched — they are what the diagnostics
// exist to carry. Best-effort like everything here: it cannot throw.
function redactDiagText(s) {
  try {
    let out = String(s);
    out = out.replace(/(?:https?|file):\/\/[^\s"'\\)]+/g, (u) => {
      try { const p = new URL(u); return (p.hostname === "127.0.0.1" || p.hostname === "localhost") ? p.origin : "<url>"; }
      catch { return "<url>"; }
    });
    out = out.replace(/(^|[\s"'(=])((?:\/[\w.@%+-]+){2,}\/?)/g, "$1<path>");
    out = out.replace(/(^|[\s"'(])~\/[^\s"']*/g, "$1<path>");
    out = out.replace(/\b([A-Z][A-Z0-9_]{2,})=([^\s"']+)/g, "$1=<redacted>");
    return out;
  } catch { return "<redaction-error>"; }
}
function diag(ev) {
  try {
    const rec = { t: new Date().toISOString(), ...ev };
    for (const k of ["error", "driveError", "stackTop"]) if (typeof rec[k] === "string") rec[k] = redactDiagText(rec[k]);
    diagEvents.push(rec);
    try { fs.appendFileSync(DIAG_PATH, JSON.stringify(rec) + "\n"); } catch {}
  } catch {}
}

const SERVE = new Map();
for (const f of CAPTURED) SERVE.set(f.id, path.join(FORMS, f.html));

const requests = [];
const server = http.createServer((req, res) => {
  requests.push(req.method + " " + req.url);
  const id = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "");
  const file = SERVE.get(id);
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(strip(fs.readFileSync(file, "utf8")));
});

const RESUME_BYTES = Buffer.from("%PDF-1.4 SYNTHETIC TEST RESUME\n");
const ARTIFACT = { filename: "synthetic.pdf", sha256: crypto.createHash("sha256").update(RESUME_BYTES).digest("hex") };

let base = null, sessionDir = null, helper = null, ready = null, resumeFile = null;
const cmdTypesSent = [];
let seq = 0;
// ---------------------------------------------------------------------------
// PER-DRIVE BOARDS (2026-10-24) — the fix for the contamination the
// board-isolation test above pins. Every drive carries a context with its
// OWN boardId; send() addresses the drive's commands to that board and to
// no other. The helper keys all board state (page, observation version) by
// boardId, so two drives — including a timed-out test's abandoned zombie
// drive running next to the following test's drive — share nothing: a
// zombie's discover replaces only its own observation, its fills and
// readback are gated only against its own version, and its error-path
// close deletes only its own board. Drives that pass no context (the
// suite's own shutdown) keep the historical shared label, which no drive
// uses any more.
// ---------------------------------------------------------------------------
let driveSeq = 0;
function newDrive(tag) {
  return { boardId: `forms-ci-coverage-${tag}-${++driveSeq}`, aborted: false };
}
async function send(cmd, ms = 120000, drive = null) {
  const id = String(++seq).padStart(4, "0");
  cmdTypesSent.push(cmd.type);
  fs.writeFileSync(path.join(sessionDir, `cmd-${id}.json`), JSON.stringify({ boardId: drive ? drive.boardId : "forms-ci-coverage", ...cmd }));
  const respFile = path.join(sessionDir, `resp-${id}.json`);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = JSON.parse(fs.readFileSync(respFile, "utf8")); fs.rmSync(respFile, { force: true }); return r; }
    catch { await new Promise((r) => setTimeout(r, 60)); }
  }
  throw new Error("helper response timeout for " + cmd.type);
}

// One synthetic value per mapped question. Text identity/screening values are
// the pack's fixed TEST persona values, as in the Ashby pack. Option and
// number fields are answered with the PROFILE's values, not the first option
// (widget-gap lane, 2026-10-23): the base policy returned the first option's
// label, which for native selects is the placeholder, and sent a date string
// to number inputs, which crashed as DRIVER_ERROR. The planner's value
// vocabulary is reused, not reinvented: EEO self-identification takes module
// 149 §6.1's decline text (the F-084 default), work authorization and
// sponsorship take the fact floor's Yes/No, and a field whose captured options
// hold no match for the profile value is left to the executor's truthful
// option_not_found — the drive never invents an answer or an option list.
const { EEO_DECLINE_SOURCE } = require(path.join(ROOT, "packages", "domain", "149-career-portal-apply.js"));
const DECLINE_RE = new RegExp(EEO_DECLINE_SOURCE);
const EEO_DECLINE = "Decline to self-identify";
// Captured option evidence for Greenhouse custom selects: the boards-API
// artifact captured 2026-10-20 alongside the forms. It is the ONLY option
// evidence the captures carry for those fields — the stripped pages have no
// menu DOM — and it never makes a field filled by itself (see widgetValueFor).
const GH_OPTIONS = JSON.parse(fs.readFileSync(path.join(FORMS, "greenhouse-options.json"), "utf8"));
function evidenceOptions(form, s) {
  if (!form || form.family !== "greenhouse") return null;
  const rec = GH_OPTIONS.forms && GH_OPTIONS.forms[form.id];
  const q = rec && rec.selects && rec.selects[String(s.name).replace(/\[\]$/, "")];
  return q && Array.isArray(q.options) && q.options.length ? q.options : null;
}
function selectValueFor(b, s) {
  const label = s.label || "";
  // EEO self-identification: the decline option (module 149 §6.1 / F-084).
  if (b.profile_key === "eeo" || EEO_RE.test(label)) return EEO_DECLINE;
  // Country of residence: the persona's country fact.
  if (s.name === "country" || /in what country|country do you/i.test(label)) return "United States";
  // A location-choice select takes the persona's location fact. When no
  // captured option matches it, the executor reports option_not_found and the
  // field stays unfilled — never an invented location preference.
  if (b.profile_key === "location" || /which location are you applying/i.test(label)) return "Synthetic City";
  // A marketing/information opt-in: the profile carries no consent fact, so
  // the answer is the decline choice.
  if (/receive information|opt.?in|marketing/i.test(label)) return "No";
  // Any other select: the first REAL option — the placeholder is not an answer.
  const o = (b.options || []).find((x) => x.value !== "");
  return o ? o.label : "Synthetic";
}
function widgetValueFor(b, s, form) {
  const label = s.label || "";
  const ev = evidenceOptions(form, s);
  const firstEvidence = () => (ev ? ev[0] : null);
  if (b.profile_key === "work_authorization" || /proof of authorization/i.test(label)) {
    // The fact floor: authorized to work in the US for any employer — the
    // unrestricted authorization option when the evidence phrases it so.
    const full = ev && ev.find((o) => /^i am authorized to work in the united states for any employer$/i.test(o));
    return full || "Yes";
  }
  if (b.profile_key === "sponsorship") return "No";
  if (b.profile_key === "eeo" || EEO_RE.test(label) || /religion/i.test(label)) return EEO_DECLINE;
  if (s.name === "country") return "United States";
  if (b.profile_key === "location") return "Synthetic City";
  if (/gpa \(undergraduate\)/i.test(label)) return (ev && ev.find((o) => o === "3.9 out of 4.0")) || firstEvidence() || "Synthetic";
  if (/currently based in/i.test(label)) return (ev && ev.find((o) => o === "United States")) || "United States";
  // Employment-history questions: the persona's history holds none of these
  // employers, so the answer is the negative the evidence offers.
  if (/have you (ever|previously)|previously worked|employment history/i.test(label)) {
    if (ev && ev.includes("No")) return "No";
    const never = ev && ev.find((o) => /^(never|not applicable|n\/a)/i.test(o));
    return never || firstEvidence() || "No";
  }
  // Clearance questions: the persona carries no clearance fact, so the answer
  // never asserts a credential — the negative when the evidence offers one.
  if (/clearance/i.test(label)) {
    if (ev && ev.includes("No")) return "No";
    return firstEvidence() || "No";
  }
  // Any other custom question with captured evidence: the persona's synthetic
  // choice is deterministic — the first option the capture carries.
  if (firstEvidence()) return firstEvidence();
  // No option evidence anywhere in the captured material for this field: the
  // attempted value is the persona's synthetic answer for its class. The field
  // stays unverified-against-live and is never counted filled on this evidence.
  if (/^school/i.test(label)) return "Synthetic University";
  if (/^degree/i.test(label)) return "Synthetic Degree";
  if (/^discipline/i.test(label)) return "Synthetic Discipline";
  if (/month/i.test(label)) return "June";
  return "Synthetic";
}
function valueFor(b, s, form) {
  if (b.inputType === "file") return ARTIFACT;
  if (b.inputType === "checkbox") return true;
  // Number inputs take the profile's numeric value: an education year is the
  // persona's year (from its 2027-06-01 date fact), never a date string.
  if (b.inputType === "number" || s.type === "number") {
    return /year/i.test(s.label || "") || /year/i.test(s.name || "") ? "2027" : "100000";
  }
  if (b.inputType === "select") return selectValueFor(b, s);
  if (b.widget) return widgetValueFor(b, s, form);
  if (["radio_group", "checkbox_group"].includes(b.inputType)) {
    const o = (b.options || [])[0];
    return o ? o.label : "Synthetic";
  }
  if (b.inputType === "date" || s.type === "date") return "2027-06-01";
  switch (b.profile_key) {
    case "full_name": return "Synthetic Tester";
    case "first_name": return "Synthetic";
    case "last_name": return "Tester";
    case "email": return "synthetic@example.test";
    case "phone": return "+15550100100";
    case "linkedin": return "https://example.test/in/synthetic-tester";
    case "website": case "portfolio": case "github": return "https://example.test/";
    case "current_employer": case "employer": case "company": return "Synthetic Employer";
    case "location": case "city": return "Synthetic City";
    case "salary": case "compensation": return "100000";
    case "years_experience": return "3";
    default: break;
  }
  if (/date/i.test(s.label || "")) return "06/01/2027";
  return "Synthetic answer";
}
// What a correct read-back must return for a filled value — mirrors expected() in scripts/apply.ts.
function expectedFor(b, v) {
  if (b.inputType === "file") return ARTIFACT;
  if (b.inputType === "checkbox") return true;
  if (["select", "radio_group"].includes(b.inputType)) {
    const opt = (b.options || []).find((x) => x.value === v || x.label === v);
    if (opt) return opt.label;
    // Decline-class equivalence: module 149's EEO_DECLINE_MEANING is the one
    // home of what counts as a decline, and boards phrase it differently
    // ("I do not want to answer", "I decline to self-identify for protected
    // veteran status"). The rendered decline option's label is the correct
    // read-back for the canonical decline value. The matcher runs on
    // normalized text, exactly as the helper's own matcher does (its
    // normOpt): the source phrases are lowercase, so testing the raw
    // capitalized value would miss the class entirely.
    const normOpt = (s) => String(s || "").toLowerCase().replace(/[’‘]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    if (DECLINE_RE.test(normOpt(v))) {
      const d = (b.options || []).find((x) => DECLINE_RE.test(normOpt(x.label)) || DECLINE_RE.test(normOpt(x.value)));
      if (d) return d.label;
    }
    return v;
  }
  return v;
}

// Required-conditional gating: a follow-up field is attempted only when the
// persona's answer to its parent question makes the follow-up applicable. The
// decision is taken from the persona's policy answers (computed before the
// drive), never from what a stripped capture happened to persist. Education
// blocks are not gated off here: the persona provides education, so the blocks
// are attempted on every board; the captured board mode (education_required on
// SpaceX/Anduril, education_optional on EOS, in greenhouse-options.json) is
// what makes those fields required-conditional in the reconciliation.
const CONDITIONAL_GATES = [
  { formId: "greenhouse-wppmedia-5437567008", field: "4017898008", parent: "4017733008",
    holds: (a) => /^yes\b/i.test(String(a || "")),
    condition: "the parent disability question (4017733008) is answered with an affirmative Yes" },
  { formId: "greenhouse-eosfitness-4336050009", field: "question_6872430009", parent: "question_6872428009",
    holds: (a) => /^no\b/i.test(String(a || "")),
    condition: "the parent CPR-current question (question_6872428009) is answered No" },
];
function conditionalDecision(form, s, persona) {
  const g = CONDITIONAL_GATES.find((x) => x.formId === form.id && x.field === s.name);
  if (!g) return null;
  return g.holds(persona[g.parent]) ? null : "conditional_not_triggered";
}

// The widget class of a mapped question, from the binding the shared binder
// produced (and the schema type for the number case) — pinned per field in the
// fixture (expectation.fieldClasses) and recomputed by the gate from the pins.
function widgetClassOf(s, b) {
  if (b.inputType === "file") return "file input";
  if (b.widget) return `custom select (${b.widget})`;
  if (b.inputType === "select") return "native select";
  if (b.inputType === "checkbox") return "checkbox";
  if (b.inputType === "checkbox_group") return "checkbox group";
  if (b.inputType === "radio_group") return "radio group";
  if (s && s.type === "number") return "number input";
  return "text input";
}

const EEO_RE = /gender|race|ethnic|veteran|disabilit|sexual orientation|pronoun|hispanic|latinx/i;
const ATTEST_RE = /certify|attest|truthful|accurate to the best|acknowledge|i confirm i have read|read and agree/i;

// Drive one locally served captured form through the helper + binder and return its
// record. Identical drive to the Ashby pack's per-form test body, plus the file-
// question and attestation inventories this pack pins.
async function driveForm(form, drive) {
  drive = drive || newDrive(form.id);
  const sendD = (cmd, ms) => send(cmd, ms, drive);
  const d0 = Date.now();
  const dstep = (name, extra) => {
    const atMs = Date.now() - d0;
    driveState.set(form.id, { d0, step: name, atMs, field: extra && typeof extra.field === "string" ? extra.field : null });
    diag({ form: form.id, step: name, atMs, ...(extra || {}) });
  };
  dstep("drive_start");
  const rec = { company: form.company || null, family: form.family, manifestFieldCount: form.fields, botCheck: form.bot_check || [] };
  const open = await sendD({ type: "open", url: `${base}/${form.id}` });
  assert.equal(open.ok, true, JSON.stringify(open));
  opensCompleted += 1;
  dstep("open_done");
  rec.captchaOnReplay = open.data.captcha;
  rec.captchaTechOnReplay = open.data.captchaTech;
  const disc = await sendD({ type: "discover" });
  assert.equal(disc.ok, true, JSON.stringify(disc));
  dstep("discover_done", { rawFields: disc.data.fields.length });
  const fields = disc.data.fields;
  rec.rawFields = fields.length;
  const controls = disc.data.observation.controls || [];
  rec.submitControl = controls.some((c) => c.kind === "submit");
  let bindings = null, schema = null;
  try {
    ({ bindings, schema } = bindFields(fields));
    dstep("bind_done", { mapped: schema.length });
  } catch (e) {
    rec.bindError = String((e && e.message) || e);
    dstep("bind_error", { error: rec.bindError });
  }
  if (schema) {
    rec.mapped = schema.length;
    rec.requiredMapped = schema.filter((s) => s.required).length;
    rec.fileQuestions = schema.filter((s) => bindings[s.name] && bindings[s.name].inputType === "file").map((s) => s.name);
    rec.eeo = schema.filter((s) => EEO_RE.test(s.label || "")).map((s) => s.label);
    rec.attestation = schema.filter((s) => ATTEST_RE.test(s.label || "")).map((s) => s.label);
    const version = disc.data.observation.version;
    const fills = [];
    const filledBindings = [];
    // The persona's policy answers are computed before the drive: conditional
    // gating is decided from them, not from what a stripped capture persists.
    const persona = {};
    for (const s of schema) persona[s.name] = valueFor(bindings[s.name], s, form);
    for (const s of schema) {
      const b = bindings[s.name];
      // Attestation-class fields stop for the person — never attempted, never
      // counted filled, whatever the widget class (a Lyra attestation radio
      // was counted filled by the base drive).
      if (ATTEST_RE.test(s.label || "")) {
        fills.push({ name: s.name, type: b.inputType, cls: widgetClassOf(s, b), outcome: "attestation_stop" });
        continue;
      }
      // A conditional follow-up whose condition the persona's parent answer
      // does not trigger is not attempted; it is recorded as gated, not as a
      // widget failure.
      const gate = conditionalDecision(form, s, persona);
      if (gate) {
        fills.push({ name: s.name, type: b.inputType, cls: widgetClassOf(s, b), outcome: gate });
        continue;
      }
      const v = persona[s.name];
      let r;
      const f0 = Date.now();
      dstep("fill_start", { field: s.name });
      try {
        r = await sendD({ type: "fill", binding: b, value: v, ...(b.inputType === "file" ? { filePath: resumeFile } : {}), observationVersion: version }, 300000);
      } catch (e) {
        // A fill that never answers leaves the daemon's state unknown for this
        // session: record the abort as this form's measured outcome and stop the
        // drive here rather than queueing further commands behind a stuck fill.
        fills.push({ name: s.name, type: b.inputType, cls: widgetClassOf(s, b), outcome: "fill_timeout" });
        rec.driveError = `fill timed out on ${s.name}: ${String((e && e.message) || e)}`;
        dstep("fill_timeout", { field: s.name, ms: Date.now() - f0, error: String((e && e.message) || e) });
        break;
      }
      const reasonOf = (x) => typeof x === "string" ? x : (x && typeof x === "object" && x.code) ? String(x.code) : JSON.stringify(x ?? "not_filled");
      const entry = { name: s.name, type: b.inputType, cls: widgetClassOf(s, b), outcome: r.ok && r.data.filled ? "filled" : (r.ok ? reasonOf(r.data.reason) : reasonOf(r.error)) };
      dstep("fill_done", { field: s.name, ms: Date.now() - f0, outcome: entry.outcome });
      fills.push(entry);
      if (entry.outcome === "filled") filledBindings.push({ b, v });
    }
    rec.fills = fills;
    rec.filledCount = filledBindings.length;
    if (!rec.driveError) {
      dstep("readback_start", { count: filledBindings.length });
      const read = await sendD({ type: "readback", bindings: filledBindings.map((x) => x.b), observationVersion: version });
      assert.equal(read.ok, true, JSON.stringify(read));
      let matched = 0;
      rec.readback = filledBindings.map(({ b, v }) => {
        const ok = JSON.stringify(read.data.answers[b.field_id]) === JSON.stringify(expectedFor(b, v));
        if (ok) matched++;
        return { name: b.field_id, match: ok };
      });
      rec.readbackMatched = matched;
      dstep("readback_done", { matched });
    }
  }
  await sendD({ type: "close" });
  dstep("drive_end", { totalMs: Date.now() - d0, filledCount: rec.filledCount ?? null, readbackMatched: rec.readbackMatched ?? null, driveError: rec.driveError || null });
  return rec;
}

const results = {};
let opensCompleted = 0;
test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "forms-ci-coverage-"));
  resumeFile = path.join(sessionDir, "synthetic.pdf");
  fs.writeFileSync(resumeFile, RESUME_BYTES);
  helper = spawn(process.execPath, [HELPER, sessionDir], { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
  helper.stderr.on("data", (b) => process.stderr.write("[helper] " + b));
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    try { ready = JSON.parse(fs.readFileSync(path.join(sessionDir, "ready.json"), "utf8")); break; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert.ok(ready, "helper daemon did not become ready");
});

test.after(async () => {
  try { await send({ type: "shutdown" }, 5000); } catch {}
  if (helper) helper.kill("SIGKILL");
  server.close();
  if (process.env.FORMS_CI_COVERAGE_EMIT) {
    let prior = {};
    try { prior = JSON.parse(fs.readFileSync(process.env.FORMS_CI_COVERAGE_EMIT, "utf8")).results || {}; } catch {}
    fs.writeFileSync(process.env.FORMS_CI_COVERAGE_EMIT, JSON.stringify({ posture: ready, results: { ...prior, ...results } }, null, 1));
  }
  // CI diagnostics summary (observation only — see the diagnostics block
  // above): per form, the drive's total ms and outcome, the last step in
  // flight for a drive that never ended, and any assertion text. Printed to
  // the gate log, appended to the GitHub step summary when present, and the
  // failures emitted as ::error annotations so the checks API carries them.
  try {
    const byForm = new Map();
    for (const ev of diagEvents) {
      if (!ev.form) continue;
      if (!byForm.has(ev.form)) byForm.set(ev.form, []);
      byForm.get(ev.form).push(ev);
    }
    const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    const rows = [];
    for (const form of CAPTURED) {
      const evs = byForm.get(form.id) || [];
      const end = evs.find((e) => e.step === "drive_end");
      const fail = evs.find((e) => e.step === "assertion_failed");
      const threw = evs.find((e) => e.step === "drive_threw");
      const passed = evs.some((e) => e.step === "assertions_passed");
      let status;
      if (!evs.length) status = "not run in this process";
      else if (fail) status = "ASSERTION FAILED";
      else if (passed) status = "assertions passed";
      else status = "NO assertion verdict recorded (test-timeout signature)";
      let detail = "no events recorded";
      if (end) detail = `drive_end at +${end.totalMs}ms (filled ${end.filledCount}, readback ${end.readbackMatched}${end.driveError ? ", driveError: " + end.driveError : ""})`;
      else if (threw) detail = `drive threw: ${String(threw.error).slice(0, 300)}`;
      else if (evs.length) { const l = evs[evs.length - 1]; detail = `last step ${l.step}${l.field ? " field " + l.field : ""}${l.atMs != null ? " at +" + l.atMs + "ms" : ""}, no drive_end`; }
      rows.push({ id: form.id, status, detail, fail, threw });
      console.log(`FORMS-CI-DIAG ${form.id}: ${status} — ${detail}`);
      if (fail) console.log(`FORMS-CI-DIAG ${form.id} assertion: ${String(fail.error).slice(0, 1200)}`);
      if (threw) console.log(`FORMS-CI-DIAG ${form.id} drive threw: ${String(threw.error).slice(0, 600)}`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      const md = ["## forms-ci coverage diagnostics", "", "| form | verdict | drive record |", "|---|---|---|",
        ...rows.map((r) => `| ${r.id} | ${r.status} | ${r.detail.replace(/\|/g, "\\|")} |`), ""];
      for (const r of rows) if (r.fail) md.push(`### ${r.id} — assertion failure`, "", "```", String(r.fail.error).slice(0, 3000), "```", "");
      for (const r of rows) if (r.threw) md.push(`### ${r.id} — drive threw`, "", "```", String(r.threw.error).slice(0, 1500), "```", "");
      md.push(`Full per-step event log: the forms-ci-coverage-diag artifact (JSONL, ${diagEvents.length} events).`, "");
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join("\n"));
    }
    if (process.env.GITHUB_ACTIONS) {
      for (const r of rows) {
        if (r.fail) console.log(`::error title=forms-ci ${r.id}::${esc(String(r.fail.error).slice(0, 800))}`);
        else if (r.status.startsWith("NO assertion verdict")) console.log(`::error title=forms-ci ${r.id}::${esc(r.status + " — " + r.detail)}`);
      }
    }
  } catch {}
});

test("forms-ci coverage: inventory — the drive set is exactly the captured Greenhouse + Lever application forms", () => {
  assert.deepEqual(EXPECTED.families.slice().sort(), IN_SCOPE_FAMILIES.slice().sort());
  assert.deepEqual(
    EXPECTED.capturedForms.map((f) => f.id).sort(),
    CAPTURED.map((f) => f.id).sort(),
    "the fixture's captured-form set and the manifest's in-scope captured forms disagree — a capture was added or removed without re-pinning");
  assert.equal(CAPTURED.length, 11, "expected 5 Greenhouse + 6 Lever captured application forms");
  assert.equal(CAPTURED.filter((f) => f.family === "greenhouse").length, 5);
  assert.equal(CAPTURED.filter((f) => f.family === "lever").length, 6);
  // Provenance in the pin must be the manifest's own record — not rewritten history.
  for (const f of CAPTURED) {
    const pin = EXPECTED.capturedForms.find((x) => x.id === f.id);
    assert.ok(pin, "no pin for " + f.id);
    assert.equal(pin.sourceUrl, f.source_url, f.id);
    assert.equal(pin.capturedAt, f.rendered_at, f.id);
    assert.deepEqual(pin.captureBotCheck, f.bot_check || [], f.id);
  }
});

test("forms-ci coverage: the Ashby forms are already pinned elsewhere and are not re-driven here", () => {
  assert.equal(ASHBY_CAPTURED.length, 6, "the manifest's captured Ashby application forms changed");
  assert.deepEqual(
    EXPECTED.alreadyPinnedElsewhere.map((f) => f.id).sort(),
    ASHBY_CAPTURED.map((f) => f.id).sort(),
    "the already-pinned list must be exactly the manifest's captured Ashby forms");
  for (const f of EXPECTED.alreadyPinnedElsewhere) {
    assert.match(f.pinnedBy, /ashby-verdict-pack/, f.id);
    assert.ok(!SERVE.has(f.id), f.id + " must not be served or driven by this pack");
    assert.ok(!EXPECTED.capturedForms.some((x) => x.id === f.id), f.id + " counted twice");
  }
});

test("forms-ci coverage: no Palantir capture is driven or counted (standing owner hold)", () => {
  const palantir = MANIFEST.forms.filter((f) => /palantir/i.test(f.id + " " + (f.company || "") + " " + (f.source_url || "")));
  assert.equal(palantir.length, 0, "a Palantir entry appeared in the forms-ci manifest — it is EXCLUDED from coverage under the standing hold; record it in the doc, never drive it");
  assert.equal(EXPECTED.palantirCapturesInFormsCi, 0);
});

test("forms-ci coverage: not-captured manifest entries are recorded, not silently dropped", () => {
  const notCaptured = MANIFEST.forms.filter((f) => !(f.status === "application" && f.html));
  assert.deepEqual(
    EXPECTED.notCaptured.map((f) => f.id).sort(),
    notCaptured.map((f) => f.id).sort(),
    "every manifest entry without a captured application form must be listed with its status");
  for (const f of notCaptured) {
    const rec = EXPECTED.notCaptured.find((x) => x.id === f.id);
    assert.equal(rec.manifestStatus, f.status, f.id);
  }
});

test("forms-ci coverage: the coverage gate — recorded scoped claims equal the computed verdicts and the pin sums", () => {
  assert.equal(EXPECTED.coverage.claimable, undefined, "the blanket claimable flag must not exist — claims are scoped per form and per widget class");
  const verdict = coverageClaim(EXPECTED);
  assert.equal(verdict.perForm.length, EXPECTED.capturedForms.length);
  for (const p of verdict.perForm) assert.equal(p.claimable, true, p.reason);
  assert.ok(recordedClaimConsistent(EXPECTED), "the recorded scoped claims are not the gate's verdict over the per-form pins");
  assert.deepEqual(
    { formsCaptured: EXPECTED.coverage.formsCaptured, questionsMapped: EXPECTED.coverage.questionsMapped, questionsFilled: EXPECTED.coverage.questionsFilled, questionsReadBackExactly: EXPECTED.coverage.questionsReadBackExactly },
    coverageSums(EXPECTED),
    "the recorded coverage numbers are not the sums of the per-form pins");
});

test("forms-ci coverage: the coverage gate rejects unsupported claims (gate unit behavior)", () => {
  // An inflated recorded claim against the same pins: inconsistent, caught.
  const inflated = JSON.parse(JSON.stringify(EXPECTED));
  inflated.coverage.questionsMapped += 1;
  assert.equal(recordedClaimConsistent(inflated), false);
  // The blanket claim must not reappear.
  const blanket = JSON.parse(JSON.stringify(EXPECTED));
  blanket.coverage.claimable = true;
  assert.equal(recordedClaimConsistent(blanket), false);
  // A captured form without provenance cannot support its scoped claim.
  const noProv = { capturedForms: [{ id: "x", expectation: { mapped: 3, fills: [], fieldClasses: {}, reconciliation: [] } }], coverage: { formsCaptured: 1, questionsMapped: 3, questionsFilled: 0, questionsReadBackExactly: 0 } };
  assert.equal(coverageClaim(noProv).perForm[0].claimable, false);
  assert.match(coverageClaim(noProv).perForm[0].reason, /provenance/);
  // A captured form without a pinned expectation cannot support its scoped claim.
  const noPin = { capturedForms: [{ id: "x", sourceUrl: "https://example.test/x", capturedAt: "2026-10-19T00:00:00Z", captureMethod: "render-form.cjs" }], coverage: { claimable: true } };
  assert.equal(coverageClaim(noPin).perForm[0].claimable, false);
  assert.match(coverageClaim(noPin).perForm[0].reason, /pinned drive expectation/);
  // A mapped-not-filled field without a reconciliation entry breaks the claim.
  const noRec = JSON.parse(JSON.stringify(EXPECTED));
  noRec.capturedForms[0].expectation.reconciliation.pop();
  assert.equal(coverageClaim(noRec).perForm[0].claimable, false);
  assert.match(coverageClaim(noRec).perForm[0].reason, /reconciliation/);
  // A custom-select entry that drops the unverified-against-live label breaks the claim.
  const unlabeled = JSON.parse(JSON.stringify(EXPECTED));
  const cs = unlabeled.capturedForms[0].expectation.reconciliation.find((r) => r.widgetClass.startsWith("custom select"));
  delete cs.unverifiedAgainstLive;
  assert.equal(coverageClaim(unlabeled).perForm[0].claimable, false);
  assert.match(coverageClaim(unlabeled).perForm[0].reason, /unverified-against-live/);
  // A widget-class tally that drifts from the pins breaks consistency.
  const tallyDrift = JSON.parse(JSON.stringify(EXPECTED));
  tallyDrift.widgetClassClaims[0].mapped += 1;
  assert.equal(recordedClaimConsistent(tallyDrift), false);
  // An empty capture set claims nothing.
  assert.equal(coverageClaim({ capturedForms: [], coverage: {} }).claimable, false);
});

for (const form of CAPTURED) {
  // Timeout headroom as in the Ashby pack: a fill is sub-second uncontended, but a
  // starved executor must fail loudly rather than be mistaken for a driver verdict.
  // The pinned outcomes below are the assertion; the waits are not.
  test(`forms-ci coverage: ${form.id}`, { timeout: 600000 }, async () => {
    let rec;
    const drive = newDrive(form.id);
    try {
      rec = await driveForm(form, drive);
    } catch (e) {
      // A drive that dies before it can measure (open/discover/helper failure) is a
      // measured outcome too — pinned with its reason, never forced into a pass.
      rec = { company: form.company || null, family: form.family, driveError: String((e && e.message) || e) };
      // The throw IS the measurement for an errored drive: carry its text,
      // its stack's top frames (paths stripped when diag() redacts the
      // stackTop field), and the last step in flight with its offset, so the
      // annotations read-back can name the drive failure itself — the
      // assertion_failed that follows is downstream of this record (the pin
      // comparison failing on an empty record), not the failure. Best-effort
      // like all diagnostics: building this can never change the outcome.
      const threwDiag = { form: form.id, step: "drive_threw", error: String((e && e.message) || e).slice(0, 1000) };
      try {
        if (e && e.stack) threwDiag.stackTop = String(e.stack).split("\n").slice(0, 6).join("\n").slice(0, 1500);
        const st = driveState.get(form.id);
        if (st) {
          threwDiag.atMs = Date.now() - st.d0;
          threwDiag.lastStep = st.step;
          threwDiag.lastStepAtMs = st.atMs;
          if (st.field) threwDiag.lastStepField = st.field;
        }
      } catch {}
      diag(threwDiag);
      try { await send({ type: "close" }, 10000, drive); } catch {}
    }
    results[form.id] = rec;
    if (process.env.FORMS_CI_COVERAGE_EMIT) {
      // Incremental emit: a later form's failure must not lose this measurement.
      // Merge with any previous emit file so re-runs can fill in missing forms.
      let prior = {};
      try { prior = JSON.parse(fs.readFileSync(process.env.FORMS_CI_COVERAGE_EMIT, "utf8")).results || {}; } catch {}
      fs.writeFileSync(process.env.FORMS_CI_COVERAGE_EMIT, JSON.stringify({ posture: ready, results: { ...prior, ...results } }, null, 1));
    } else {
      const exp = (EXPECTED.capturedForms.find((x) => x.id === form.id) || {}).expectation;
      try {
        assert.ok(exp, "no pinned expectation for " + form.id);
        assert.deepEqual(
          { rawFields: rec.rawFields ?? null, mapped: rec.mapped ?? null, bindError: rec.bindError ?? null, filledCount: rec.filledCount ?? null, readbackMatched: rec.readbackMatched ?? null, submitControl: rec.submitControl ?? null, driveError: rec.driveError ? "drive_error" : null },
          { rawFields: exp.rawFields, mapped: exp.mapped, bindError: exp.bindError, filledCount: exp.filledCount, readbackMatched: exp.readbackMatched, submitControl: exp.submitControl, driveError: exp.driveError },
          "coverage outcome drifted from the pinned expectation — re-measure and update the fixture in the same commit");
        if (!rec.driveError) {
          assert.deepEqual((rec.fills || []).map((f) => [f.name, f.outcome]), exp.fills, "per-field fill outcomes drifted from the pinned expectation");
          const classes = {};
          for (const f of rec.fills || []) classes[f.name] = f.cls;
          assert.deepEqual(classes, exp.fieldClasses, "per-field widget classes drifted from the pinned expectation");
          assert.deepEqual(rec.fileQuestions || [], exp.fileQuestions, "file-question inventory drifted from the pinned expectation");
          assert.deepEqual(rec.attestation || [], exp.attestation, "attestation-class inventory drifted from the pinned expectation");
        }
      } catch (e) {
        // Diagnostics only: record the assertion text CI never surfaced, then
        // rethrow — the failure itself is byte-for-byte the one above.
        // The drift record (2026-10-24): WHAT drifted, built from the same
        // measured record and pinned expectation the assertions just
        // compared — counts, field ids and outcome (verdict) names ONLY,
        // never a value, never label or answer text. It rides the
        // assertion_failed event so the annotations read-back can print the
        // drift itself, not just the fact of it.
        let drift = null;
        try {
          const mSum = { rawFields: rec.rawFields ?? null, mapped: rec.mapped ?? null, filledCount: rec.filledCount ?? null, readbackMatched: rec.readbackMatched ?? null, driveError: rec.driveError ? "drive_error" : null, bindError: !!rec.bindError };
          const pSum = { rawFields: exp ? exp.rawFields ?? null : null, mapped: exp ? exp.mapped ?? null : null, filledCount: exp ? exp.filledCount ?? null : null, readbackMatched: exp ? exp.readbackMatched ?? null : null, driveError: exp ? exp.driveError ?? null : null, bindError: !!(exp && exp.bindError) };
          const mFills = new Map((rec.fills || []).map((f) => [f.name, f.outcome]));
          const pFills = new Map((exp && exp.fills) || []);
          const fills = [];
          for (const [name, pOut] of pFills) {
            const mOut = mFills.has(name) ? mFills.get(name) : "missing";
            if (mOut !== pOut) fills.push({ field: name, measured: mOut, pinned: pOut });
          }
          for (const [name, mOut] of mFills) if (!pFills.has(name)) fills.push({ field: name, measured: mOut, pinned: "missing" });
          const mCls = new Map((rec.fills || []).map((f) => [f.name, f.cls]));
          const pCls = (exp && exp.fieldClasses) || {};
          let classesDiffering = 0;
          for (const name of Object.keys(pCls)) if (mCls.get(name) !== pCls[name]) classesDiffering++;
          drift = { measured: mSum, pinned: pSum, fillsDiffering: fills.length, fills: fills.slice(0, 40), classesDiffering,
            fileQuestions: { measured: (rec.fileQuestions || []).length, pinned: exp ? (exp.fileQuestions || []).length : null },
            attestation: { measured: (rec.attestation || []).length, pinned: exp ? (exp.attestation || []).length : null } };
        } catch {}
        diag({ form: form.id, step: "assertion_failed", error: String((e && e.message) || e).slice(0, 4000), drift });
        throw e;
      }
      diag({ form: form.id, step: "assertions_passed" });
    }
  });
}

// ---------------------------------------------------------------------------
// BOARD ISOLATION (2026-10-24) — fail-first for the cross-drive contamination
// root cause (coordinator-accepted, builder-reported; the exact CI interleave
// is labeled inference): every drive in this suite used to send its commands
// under ONE constant boardId, "forms-ci-coverage". node:test abandons a
// timed-out test without cancelling it, so a drive that crosses its 600 s
// timeout keeps running as a zombie next to the following test's drive: the
// next drive's discover replaces the shared board's observation version, the
// zombie's readback is refused STALE_OBSERVATION by the version gate, and the
// zombie's error-path close deletes the board mid-drive — the CI failures on
// andurilindustries + wppmedia (check-run 120851290550) were exactly this,
// not outcome drift. This test drives two captured forms CONCURRENTLY
// through the one helper daemon: on the shared board their commands
// interleave on a single page and at least one record cannot match its pin;
// on per-drive boards both records must equal their pins exactly.
// ---------------------------------------------------------------------------
test("forms-ci coverage: board isolation — two concurrent drives cannot contaminate each other", { timeout: 300000 }, async () => {
  const a = CAPTURED.find((f) => f.id === "lever-cgsfederal-0130d854-9bae-48d4-8ef0-e9da1ee778a5");
  const b = CAPTURED.find((f) => f.id === "lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027");
  assert.ok(a && b, "the isolation pair is missing from the captured set");
  const [ra, rb] = await Promise.all([driveForm(a), driveForm(b)]);
  for (const [form, rec] of [[a, ra], [b, rb]]) {
    assert.ok(!rec.driveError, `${form.id}: concurrent drive errored: ${rec.driveError}`);
    if (!process.env.FORMS_CI_COVERAGE_EMIT) {
      const exp = (EXPECTED.capturedForms.find((x) => x.id === form.id) || {}).expectation;
      assert.deepEqual(
        { rawFields: rec.rawFields ?? null, mapped: rec.mapped ?? null, filledCount: rec.filledCount ?? null, readbackMatched: rec.readbackMatched ?? null },
        { rawFields: exp.rawFields, mapped: exp.mapped, filledCount: exp.filledCount, readbackMatched: exp.readbackMatched },
        `${form.id}: concurrent drive outcome differs from its pin — the drives contaminated each other`);
      assert.deepEqual((rec.fills || []).map((f) => [f.name, f.outcome]), exp.fills, `${form.id}: concurrent per-field outcomes differ from the pin`);
    }
  }
});

test("forms-ci coverage: the replay stayed read-only and never reached a submit path", { timeout: 600000 }, async () => {
  if (cmdTypesSent.length === 0) {
    // Standalone (e.g. --test-name-pattern selecting only this test): no drive
    // test ran in this process, so the command/request logs are empty and the
    // assertions below would fail spuriously on an empty log. Establish our own
    // minimal state instead: drive the smallest captured form once through the
    // same runner, then judge the logs that drive produced.
    const rec = await driveForm(CAPTURED[0]);
    assert.ok(!rec.driveError, "the standalone read-only proof could not drive its own form: " + rec.driveError);
  }
  assert.ok(requests.length >= opensCompleted, "server saw every form load the runner opened");
  assert.ok(requests.every((r) => r.startsWith("GET ")), "non-GET request reached the local server: " + requests.join(","));
  const used = [...new Set(cmdTypesSent)];
  assert.ok(!used.includes("review") && !used.includes("submit_and_capture"),
    "the runner reached a state-changing command: " + cmdTypesSent.join(","));
  assert.deepEqual(used.sort(), ["close", "discover", "fill", "open", "readback"],
    "the runner sent a command type outside the read/fill set: " + cmdTypesSent.join(","));
});

// ---------------------------------------------------------------------------
// WIDGET-GAP GUARDS (2026-10-23 widget-gap lane, base 04eb62af) — fail-first.
// These tests were written and run RED against the pre-change machinery before
// any implementation (record in PR-BODY.md):
//  - the drive policy answered every option field with its FIRST option — for
//    native selects that is the placeholder, and one Shield AI card select was
//    counted filled on its placeholder;
//  - a non-numeric string into a number input crashed the fill as DRIVER_ERROR;
//  - conditional follow-ups were attempted unconditionally;
//  - attestation-class fields were attempted, and one (a Lyra radio) was
//    counted filled.
// The guards below pin the corrected behavior by name so none of it regresses.
// ---------------------------------------------------------------------------
const FORM_BY_ID = Object.fromEntries(CAPTURED.map((f) => [f.id, f]));
async function discoverBindings(form, drive) {
  drive = drive || newDrive("guard-" + form.id);
  const open = await send({ type: "open", url: `${base}/${form.id}` }, 120000, drive);
  assert.equal(open.ok, true, JSON.stringify(open));
  const disc = await send({ type: "discover" }, 120000, drive);
  assert.equal(disc.ok, true, JSON.stringify(disc));
  const { bindings, schema } = bindFields(disc.data.fields);
  return { bindings, schema, version: disc.data.observation.version, drive };
}

test("widget-gap guard: the EEO select policy is the decline option, and a wrong-option pick is caught by read-back", { timeout: 300000 }, async () => {
  const form = FORM_BY_ID["lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027"];
  const { bindings, schema, version, drive } = await discoverBindings(form);
  const sendD = (cmd, ms) => send(cmd, ms, drive);
  const s = schema.find((x) => x.name === "eeo[gender]");
  const b = bindings[s.name];
  // The policy value for an EEO select is the planner's decline text (module 149
  // §6.1 default; ruling F-084) — never the placeholder, never a substantive answer.
  assert.equal(valueFor(b, s, form), "Decline to self-identify");
  // A drive that picks a WRONG option persists it — and the suite's profile
  // expectation must reject that read-back, so the field cannot be counted filled.
  const wrong = await sendD({ type: "fill", binding: b, value: "Male", observationVersion: version });
  assert.equal(wrong.ok && wrong.data.filled, true, JSON.stringify(wrong));
  const read = await sendD({ type: "readback", bindings: [b], observationVersion: version });
  assert.equal(read.data.answers[b.field_id], "Male");
  assert.notEqual(
    JSON.stringify(read.data.answers[b.field_id]),
    JSON.stringify(expectedFor(b, valueFor(b, s, form))),
    "a wrong-option pick read back as the profile value — the fill would be counted on a wrong answer");
  await sendD({ type: "close" });
});

test("widget-gap guard: selecting a native select's placeholder is not a fill", { timeout: 300000 }, async () => {
  const form = FORM_BY_ID["lever-shieldai-ba945088-38ec-4e58-8f66-01c0497a3bd3"];
  const { bindings, version, drive } = await discoverBindings(form);
  const sendD = (cmd, ms) => send(cmd, ms, drive);
  const b = bindings["cards[f27077c2-d069-4885-b031-ee14b393fd41][field0]"];
  const placeholder = (b.options || [])[0];
  assert.ok(placeholder && placeholder.value === "", "the Shield card select's first option is no longer an empty-value placeholder — fixture shape changed");
  const r = await sendD({ type: "fill", binding: b, value: placeholder.label, observationVersion: version });
  assert.ok(!(r.ok && r.data.filled), "the placeholder option was counted as a fill: " + JSON.stringify(r));
  assert.equal(r.ok && r.data.reason, "placeholder_option");
  await sendD({ type: "close" });
});

test("widget-gap guard: number inputs take the profile's numeric value and refuse a non-numeric one by name", { timeout: 300000 }, async () => {
  const form = FORM_BY_ID["greenhouse-eosfitness-4336050009"];
  const { bindings, schema, version, drive } = await discoverBindings(form);
  const sendD = (cmd, ms) => send(cmd, ms, drive);
  const s = schema.find((x) => x.name === "start-year--0");
  const b = bindings[s.name];
  // The policy value for an education-year number input is the persona's year —
  // not the "06/01/2027" date string the label fallback used to produce.
  assert.equal(valueFor(b, s, form), "2027");
  // A non-numeric value is refused by name, not crashed as DRIVER_ERROR.
  const bad = await sendD({ type: "fill", binding: b, value: "06/01/2027", observationVersion: version });
  assert.equal(bad.ok, true, JSON.stringify(bad));
  assert.deepEqual([bad.data.filled, bad.data.reason], [false, "value_not_numeric"]);
  // The profile's numeric value goes through the real path and reads back exactly.
  const good = await sendD({ type: "fill", binding: b, value: "2027", observationVersion: version });
  assert.equal(good.ok && good.data.filled, true, JSON.stringify(good));
  const read = await sendD({ type: "readback", bindings: [b], observationVersion: version });
  assert.equal(read.data.answers[b.field_id], "2027");
  await sendD({ type: "close" });
});

test("widget-gap guard: conditional follow-ups are gated on the persona's parent answer", { timeout: 600000 }, async () => {
  assert.equal(typeof conditionalDecision, "function", "the drive has no conditional gate");
  const wpp = FORM_BY_ID["greenhouse-wppmedia-5437567008"];
  // The WPP disability follow-up fills only when the persona's disability answer
  // is an affirmative Yes; the persona's EEO answer is the decline → gated off.
  assert.equal(conditionalDecision(wpp, { name: "4017898008" }, { "4017733008": "Decline to self-identify" }), "conditional_not_triggered");
  assert.equal(conditionalDecision(wpp, { name: "4017898008" }, { "4017733008": "Yes" }), null);
  const eos = FORM_BY_ID["greenhouse-eosfitness-4336050009"];
  // The EOS "If no, are you able to…" follow-up fills only when the persona
  // answered No to the CPR-current question.
  assert.equal(conditionalDecision(eos, { name: "question_6872430009" }, { "question_6872428009": "Yes" }), "conditional_not_triggered");
  assert.equal(conditionalDecision(eos, { name: "question_6872430009" }, { "question_6872428009": "No" }), null);
  // Behavioral: a full drive of WPP records the follow-up as gated — it is not
  // attempted and reported as a widget failure.
  const rec = await driveForm(wpp, newDrive("guard-" + wpp.id));
  const entry = (rec.fills || []).find((f) => f.name === "4017898008");
  assert.ok(entry, "the follow-up is missing from the drive record");
  assert.equal(entry.outcome, "conditional_not_triggered");
});

test("widget-gap guard: attestation-class fields stop for the person on every widget class", { timeout: 600000 }, async () => {
  const tsmg = await driveForm(FORM_BY_ID["lever-tsmg-9e43a7f6-3476-482f-9cdd-ed5b73fb9df7"], newDrive("guard-tsmg"));
  const sel = (tsmg.fills || []).find((f) => f.name === "cards[ded439b4-712a-4cd3-8f14-a8f652c8e2bc][field0]");
  assert.ok(sel, "the attestation select is missing from the drive record");
  assert.equal(sel.outcome, "attestation_stop");
  const lyra = await driveForm(FORM_BY_ID["lever-lyrahealth-35bffe8b-ac9f-4749-ba4c-5f3a4d2bd77d"], newDrive("guard-lyra"));
  const radio = (lyra.fills || []).find((f) => f.name === "cards[d75eb035-dbc0-4bd0-87c6-852017951bd1][field3]");
  assert.ok(radio, "the attestation radio is missing from the drive record");
  assert.equal(radio.outcome, "attestation_stop");
});

test("widget-gap guard: an unfilled required select cannot be counted filled in the pin", () => {
  // The tamper target is a required select the measured drive leaves unfilled.
  // This guard was written (20427bc8) against TSMG's eeo[gender], which the
  // drive then recorded as value_did_not_persist. The Lever re-pin f9e79bdd
  // ("native selects take the profile's values") measured eeo[gender] filled,
  // and the 2026-10-24 reconciliation re-drive at 82cb014a reproduced it filled
  // with exact read-back (docs/engine/FORMS-CI-COVERAGE-RECONCILIATION-2026-10-24.md)
  // — that field no longer names an unfilled select, so the flip target is the
  // same form's remaining unfilled required select: the attestation select,
  // pinned outcome attestation_stop. Claiming it filled in the pin — without
  // the drive changing — must be rejected by the gate (pin sums and the
  // reconciliation exact-set both break). The per-form tests' deepEqual of
  // measured fills against the pin is what binds any fuller rewrite of the
  // pin to a real drive; this guard names the outcome-flip path specifically.
  // The gate assertions below are unchanged from 20427bc8; only the flip
  // target and this comment moved, on the measured record above.
  const tampered = JSON.parse(JSON.stringify(EXPECTED));
  const tsmg = tampered.capturedForms.find((f) => f.id.startsWith("lever-tsmg"));
  const i = tsmg.expectation.fills.findIndex(([n]) => n === "cards[ded439b4-712a-4cd3-8f14-a8f652c8e2bc][field0]");
  assert.ok(i >= 0 && tsmg.expectation.fills[i][1] !== "filled", "pin shape changed");
  tsmg.expectation.fills[i][1] = "filled";
  assert.equal(recordedClaimConsistent(tampered), false);
  assert.equal(coverageClaim(tampered).perForm.find((p) => p.id === tsmg.id).claimable, false);
});

test("forms-ci coverage diagnostics: the redactor strips paths/env-style strings and keeps codes and outcomes", () => {
  const dirty = "DRIVER_ERROR launching /home/runner/work/repo/tools/chrome --user-data-dir=/tmp/prof " +
    "with SOME_TOKEN=abc123secret and https://boards.example.com/postings/123?key=zzz and file:///etc/passwd " +
    "from ~/notes.txt — outcome value_did_not_persist";
  const clean = redactDiagText(dirty);
  assert.ok(clean.includes("DRIVER_ERROR"), "error code must survive: " + clean);
  assert.ok(clean.includes("value_did_not_persist"), "fill outcome must survive: " + clean);
  assert.ok(!clean.includes("/home/runner"), "absolute path leaked: " + clean);
  assert.ok(!clean.includes("abc123secret"), "env-style value leaked: " + clean);
  assert.ok(clean.includes("SOME_TOKEN=<redacted>"), "env-style name kept, value redacted: " + clean);
  assert.ok(!clean.includes("boards.example.com"), "non-local URL leaked: " + clean);
  assert.ok(!clean.includes("/etc/passwd"), "file URL leaked: " + clean);
  assert.ok(!clean.includes("~/notes.txt"), "home-relative path leaked: " + clean);
  // The local replay origin is kept (it names the harness, not data), and
  // plain diagnostic vocabulary is byte-identical after redaction.
  assert.equal(redactDiagText("open http://127.0.0.1:8123/greenhouse-x failed"), "open http://127.0.0.1:8123 failed");
  assert.equal(redactDiagText("filled"), "filled");
  assert.equal(redactDiagText("fill timed out on question_1: helper response timeout for fill"), "fill timed out on question_1: helper response timeout for fill");
  // Stack-shaped text (the drive_threw record's stackTop field passes through
  // the same redactor): absolute paths in frame lines are stripped, while the
  // frame wording and the line:col offsets survive.
  const stack = "Error: helper response timeout for open\n    at driveForm (/home/runner/work/repo/tests/x.test.cjs:452:15)\n    at async TestContext.<anonymous> (/home/runner/work/repo/tests/x.test.cjs:731:19)";
  const cleanStack = redactDiagText(stack);
  assert.ok(!cleanStack.includes("/home/runner"), "stack path leaked: " + cleanStack);
  assert.ok(cleanStack.includes("at driveForm (<path>:452:15)"), "stack frame shape kept: " + cleanStack);
});

module.exports = { coverageClaim, coverageSums, recordedClaimConsistent, valueFor, expectedFor, conditionalDecision, CONDITIONAL_GATES, redactDiagText };
