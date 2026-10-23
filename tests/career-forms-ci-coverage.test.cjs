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
// extension/lib/trainee-core.js), fills every mapped question with synthetic values,
// and reads back exactly what was filled — measured per form and pinned in
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
async function send(cmd, ms = 120000) {
  const id = String(++seq).padStart(4, "0");
  cmdTypesSent.push(cmd.type);
  fs.writeFileSync(path.join(sessionDir, `cmd-${id}.json`), JSON.stringify({ boardId: "forms-ci-coverage", ...cmd }));
  const respFile = path.join(sessionDir, `resp-${id}.json`);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = JSON.parse(fs.readFileSync(respFile, "utf8")); fs.rmSync(respFile, { force: true }); return r; }
    catch { await new Promise((r) => setTimeout(r, 60)); }
  }
  throw new Error("helper response timeout for " + cmd.type);
}

// One synthetic value per mapped question — identical policy to the Ashby pack
// (identity keys by profile_key, an option field by its first option, the resume by
// its artifact; screening/essay text a fixed synthetic string). This measures the
// driver's hands, not answer policy.
function valueFor(b, s) {
  if (b.inputType === "file") return ARTIFACT;
  if (b.inputType === "checkbox") return true;
  if (["radio_group", "checkbox_group", "select"].includes(b.inputType) || b.widget) {
    const o = (b.options || [])[0];
    return o ? o.label : "Synthetic";
  }
  if (b.inputType === "date" || s.type === "date") return "2027-06-01";
  if (b.inputType === "number") return "100000";
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
    return opt ? opt.label : v;
  }
  return v;
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
async function driveForm(form) {
  const rec = { company: form.company || null, family: form.family, manifestFieldCount: form.fields, botCheck: form.bot_check || [] };
  const open = await send({ type: "open", url: `${base}/${form.id}` });
  assert.equal(open.ok, true, JSON.stringify(open));
  opensCompleted += 1;
  rec.captchaOnReplay = open.data.captcha;
  rec.captchaTechOnReplay = open.data.captchaTech;
  const disc = await send({ type: "discover" });
  assert.equal(disc.ok, true, JSON.stringify(disc));
  const fields = disc.data.fields;
  rec.rawFields = fields.length;
  const controls = disc.data.observation.controls || [];
  rec.submitControl = controls.some((c) => c.kind === "submit");
  let bindings = null, schema = null;
  try {
    ({ bindings, schema } = bindFields(fields));
  } catch (e) {
    rec.bindError = String((e && e.message) || e);
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
    for (const s of schema) {
      const b = bindings[s.name];
      const v = valueFor(b, s);
      let r;
      try {
        r = await send({ type: "fill", binding: b, value: v, ...(b.inputType === "file" ? { filePath: resumeFile } : {}), observationVersion: version }, 300000);
      } catch (e) {
        // A fill that never answers leaves the daemon's state unknown for this
        // session: record the abort as this form's measured outcome and stop the
        // drive here rather than queueing further commands behind a stuck fill.
        fills.push({ name: s.name, type: b.inputType, cls: widgetClassOf(s, b), outcome: "fill_timeout" });
        rec.driveError = `fill timed out on ${s.name}: ${String((e && e.message) || e)}`;
        break;
      }
      const reasonOf = (x) => typeof x === "string" ? x : (x && typeof x === "object" && x.code) ? String(x.code) : JSON.stringify(x ?? "not_filled");
      const entry = { name: s.name, type: b.inputType, cls: widgetClassOf(s, b), outcome: r.ok && r.data.filled ? "filled" : (r.ok ? reasonOf(r.data.reason) : reasonOf(r.error)) };
      fills.push(entry);
      if (entry.outcome === "filled") filledBindings.push({ b, v });
    }
    rec.fills = fills;
    rec.filledCount = filledBindings.length;
    if (!rec.driveError) {
      const read = await send({ type: "readback", bindings: filledBindings.map((x) => x.b), observationVersion: version });
      assert.equal(read.ok, true, JSON.stringify(read));
      let matched = 0;
      rec.readback = filledBindings.map(({ b, v }) => {
        const ok = JSON.stringify(read.data.answers[b.field_id]) === JSON.stringify(expectedFor(b, v));
        if (ok) matched++;
        return { name: b.field_id, match: ok };
      });
      rec.readbackMatched = matched;
    }
  }
  await send({ type: "close" });
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
    try {
      rec = await driveForm(form);
    } catch (e) {
      // A drive that dies before it can measure (open/discover/helper failure) is a
      // measured outcome too — pinned with its reason, never forced into a pass.
      rec = { company: form.company || null, family: form.family, driveError: String((e && e.message) || e) };
      try { await send({ type: "close" }, 10000); } catch {}
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
    }
  });
}

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

module.exports = { coverageClaim, coverageSums, recordedClaimConsistent };
