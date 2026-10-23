"use strict";
// SMARTRECRUITERS VERDICT PACK — classification + captured-form coverage for the
// SmartRecruiters family, to the Ashby pack's standard (tests/career-ashby-verdict-pack.test.cjs).
//
// What this suite proves, and only this:
//  1. The classification record is pinned and internally honest: every capture attempt
//     (2026-10-23, executed under the owner's direction: read-only page loads only) is
//     recorded with its evidence in tests/fixtures/smartrecruiters-verdict-pack-expected.json,
//     and the recorded coverage claim is exactly what the coverage gate computes from the
//     captured-form set — a claim the gate does not support cannot be pinned here.
//  2. Captured-form coverage — WHEN captured forms exist in tests/fixtures/forms-ci — is
//     measured exactly like Ashby's: each capture is served locally and driven through the
//     product's own browser executor (scripts/career/portal-browser-helper.cjs, the daemon
//     the board service spawns) and the shared binder (bindFields,
//     extension/lib/trainee-core.js); every mapped question is filled with synthetic values
//     and read back exactly, against pinned expectations.
//  3. The drive machinery itself works TODAY, proven by a machinery dry-run: one captured
//     Ashby form (a real captured application form, borrowed as a seed — it is NOT a
//     SmartRecruiters form and counts toward NO SmartRecruiters number) is driven through
//     the identical runner and must map, fill, and read back completely.
//
// TODAY'S MEASURED STATE (2026-10-23): zero usable SmartRecruiters captures exist. The six
// 2026-10-19 attempts and eight 2026-10-23 attempts (six re-attempts + two fresh postings
// released the same day) were all refused at load: HTTP 403, the DataDome interstitial
// ("DataDome Device Check", geo.captcha-delivery.com). Captured-form coverage is therefore
// 0 forms / 0 questions and is NOT CLAIMABLE — the gate below pins that as an explicit
// passing state, never as coverage. This is captured-form coverage machinery and a
// classification record; it is not live driveability and not production quality. The
// family's live tier was measured separately (403 FAMILY_NOT_DRIVEABLE, 2026-10-23) and is
// classified in docs/engine/SMARTRECRUITERS-VERDICT-PACK-2026-10-23.md — not re-measured here.
//
// FAIL-CLOSED BY CONSTRUCTION: the runner can only send open / discover / fill / readback /
// close / shutdown to the helper. There is no code path that sends review or
// submit_and_capture, and the final test asserts the command logs prove it, per phase.
// The local server only ever receives GETs (asserted). Synthetic data only: one fixed TEST
// persona, one synthetic PDF. Regenerate/re-pin the fixture only alongside a real capture
// or binder change, and review the diff — the gate fails on an unsupported claim either way.
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
const EXPECTED_PATH = process.env.SR_PACK_EXPECTED || path.join(__dirname, "fixtures", "smartrecruiters-verdict-pack-expected.json");
const EXPECTED = JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf8"));
// Captured SmartRecruiters application forms: manifest entries of this family that hold
// rendered HTML. Today: none (every entry is blocked_403 with html: null).
const SR_CAPTURED = MANIFEST.forms.filter((f) => f.family === "smartrecruiters" && f.html);
require(path.join(ROOT, "extension", "lib", "trainee-core.js"));
const bindFields = globalThis.TraineeCore.bindFields;

// ---------------------------------------------------------------------------
// THE COVERAGE GATE (new in this pack). A captured-form coverage claim is
// supported only when at least one form was genuinely captured AND every
// captured form carries full provenance (source URL, capture timestamp,
// capture method) AND a pinned drive expectation. Anything else — zero forms,
// a form without provenance, a form without pinned expectations — is NOT
// claimable, whatever the fixture's recorded claim says. The suite asserts the
// recorded claim equals this verdict, so an inflated claim fails here.
// ---------------------------------------------------------------------------
function coverageClaim(exp) {
  const forms = Array.isArray(exp.capturedForms) ? exp.capturedForms : [];
  if (!forms.length) return { claimable: false, reason: "no captured forms — coverage not claimable" };
  for (const f of forms) {
    if (!f.sourceUrl || !f.capturedAt || !f.captureMethod) {
      return { claimable: false, reason: `captured form ${f.id || "?"} lacks provenance (sourceUrl/capturedAt/captureMethod)` };
    }
    if (!f.expectation || typeof f.expectation.mapped !== "number") {
      return { claimable: false, reason: `captured form ${f.id || "?"} has no pinned drive expectation` };
    }
  }
  return { claimable: true, reason: `${forms.length} captured form(s) with provenance and pinned expectations` };
}
function recordedClaimConsistent(exp) {
  return !!exp.coverage && exp.coverage.claimable === coverageClaim(exp).claimable;
}

// Same strip the captured forms were exercised with in the Ashby pack: the capture already
// removed script/style bodies and iframes; this removes the tags and any external resource
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

// What the local server may serve: the captured SmartRecruiters forms (none today) plus
// the machinery dry-run seed — a captured Ashby form, borrowed to prove the runner works.
// The seed is served under its own id and is never counted as a SmartRecruiters form.
const SEED = MANIFEST.forms.find((f) => f.id.startsWith("ashby-openai") && f.html);
const SERVE = new Map();
for (const f of SR_CAPTURED) SERVE.set(f.id, path.join(FORMS, f.html));
if (SEED) SERVE.set(SEED.id, path.join(FORMS, SEED.html));

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
// Command log per phase: "pack" (SmartRecruiters captured forms) and "dryrun" (the seed).
// The fail-closed assertion reads them separately so a zero-form pack phase is proven
// empty rather than hidden inside the seed's traffic.
const cmdTypesByPhase = { pack: [], dryrun: [] };
let phase = "pack";
let seq = 0;
async function send(cmd, ms = 120000) {
  const id = String(++seq).padStart(4, "0");
  cmdTypesByPhase[phase].push(cmd.type);
  fs.writeFileSync(path.join(sessionDir, `cmd-${id}.json`), JSON.stringify({ boardId: "smartrecruiters-pack", ...cmd }));
  const respFile = path.join(sessionDir, `resp-${id}.json`);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = JSON.parse(fs.readFileSync(respFile, "utf8")); fs.rmSync(respFile, { force: true }); return r; }
    catch { await new Promise((r) => setTimeout(r, 60)); }
  }
  throw new Error("helper response timeout for " + cmd.type);
}

// One synthetic value per mapped question — identical policy to the Ashby pack (identity
// keys by profile_key, an option field by its first option, the resume by its artifact;
// screening/essay text a fixed synthetic string). This measures the driver's hands, not
// answer policy.
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

const EEO_RE = /gender|race|ethnic|veteran|disabilit|sexual orientation|pronoun|hispanic|latinx/i;
const ATTEST_RE = /certify|attest|truthful|accurate to the best|acknowledge|i confirm i have read|read and agree/i;

// Drive one locally served captured form through the helper + binder and return its
// record. Identical drive to the Ashby pack's per-form test body.
async function driveForm(id) {
  const rec = {};
  const open = await send({ type: "open", url: `${base}/${id}` });
  assert.equal(open.ok, true, JSON.stringify(open));
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
    rec.eeo = schema.filter((s) => EEO_RE.test(s.label || "")).map((s) => s.label);
    rec.attestation = schema.filter((s) => ATTEST_RE.test(s.label || "")).map((s) => s.label);
    const version = disc.data.observation.version;
    const fills = [];
    const filledBindings = [];
    for (const s of schema) {
      const b = bindings[s.name];
      const v = valueFor(b, s);
      const r = await send({ type: "fill", binding: b, value: v, ...(b.inputType === "file" ? { filePath: resumeFile } : {}), observationVersion: version }, 300000);
      const entry = { name: s.name, type: b.inputType, outcome: r.ok && r.data.filled ? "filled" : (r.ok ? (r.data.reason || "not_filled") : String(r.error || "protocol_error")) };
      fills.push(entry);
      if (entry.outcome === "filled") filledBindings.push({ b, v });
    }
    rec.fills = fills;
    rec.filledCount = filledBindings.length;
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
  await send({ type: "close" });
  return rec;
}

const results = {};
test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "smartrecruiters-pack-"));
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
  try { phase = "dryrun"; await send({ type: "shutdown" }, 5000); } catch {}
  if (helper) helper.kill("SIGKILL");
  server.close();
  if (process.env.SR_PACK_EMIT) {
    fs.writeFileSync(process.env.SR_PACK_EMIT, JSON.stringify({ posture: ready, results }, null, 1));
  }
});

test("smartrecruiters verdict pack: the classification and capture-attempt record are pinned", () => {
  assert.equal(EXPECTED.family, "smartrecruiters");
  assert.equal(EXPECTED.classification.liveTier, "NOT_LIVE_DRIVEABLE");
  assert.equal(EXPECTED.classification.captureTier, "CAPTURE_REFUSED_AT_LOAD");
  const attempts = EXPECTED.captureAttempts;
  assert.equal(attempts.length, 8, "the 2026-10-23 run attempted eight posting URLs");
  // The six 2026-10-19 sources are all among the attempts, by id and source URL.
  const hist = MANIFEST.forms.filter((f) => f.family === "smartrecruiters");
  assert.equal(hist.length, 6);
  for (const h of hist) {
    const a = attempts.find((x) => x.id === h.id);
    assert.ok(a, "no 2026-10-23 attempt recorded for " + h.id);
    assert.equal(a.sourceUrl, h.source_url);
    // …and the 2026-10-19 record itself still says what it said: refused, no HTML.
    assert.equal(h.status, "blocked_403");
    assert.ok(!h.html);
    assert.ok((h.bot_check || []).includes("datadome"));
  }
  // Every attempt, both methods, refused at load with the DataDome challenge as evidence.
  for (const a of attempts) {
    assert.equal(a.plainFetch.httpStatus, 403, a.id);
    assert.match(a.plainFetch.evidence, /X-DataDome: protected/);
    assert.equal(a.renderedLoad.httpStatus, 403, a.id);
    assert.equal(a.renderedLoad.status, "blocked_403", a.id);
    assert.equal(a.renderedLoad.forms, 0, a.id);
    assert.equal(a.renderedLoad.fields, 0, a.id);
    assert.match(a.renderedLoad.challenge, /DataDome Device Check/);
    assert.ok(a.provenance && a.provenance.length > 0, a.id);
    // The read-only interceptor held during every rendered load.
    assert.ok(a.renderedLoad.nonGetRequestsAbortedByInterceptor > 0, a.id);
  }
});

test("smartrecruiters verdict pack: the coverage gate — recorded claim equals the computed verdict", () => {
  // Today's honest state: no captured forms, coverage zero, not claimable — as a
  // PASSING, explicit state, not as silence.
  assert.deepEqual(
    EXPECTED.capturedForms.map((f) => f.id).sort(),
    SR_CAPTURED.map((f) => f.id).sort(),
    "the fixture's captured-form set and the manifest's captured SmartRecruiters forms disagree");
  assert.deepEqual(EXPECTED.coverage, { formsCaptured: 0, questionsMapped: 0, questionsFilledVerified: 0, questionsReadBackExactly: 0, claimable: false });
  assert.equal(EXPECTED.coverage.formsCaptured, SR_CAPTURED.length, "the recorded coverage must count the manifest's captured forms, no more");
  assert.equal(EXPECTED.coverage.questionsMapped, 0);
  assert.equal(coverageClaim(EXPECTED).claimable, false);
  assert.match(coverageClaim(EXPECTED).reason, /no captured forms/);
  assert.ok(recordedClaimConsistent(EXPECTED), "the recorded claim is not the gate's verdict");
});

test("smartrecruiters verdict pack: the coverage gate rejects unsupported claims (gate unit behavior)", () => {
  // An inflated recorded claim on an empty capture set: inconsistent, caught.
  const inflated = JSON.parse(JSON.stringify(EXPECTED));
  inflated.coverage.claimable = true;
  assert.equal(recordedClaimConsistent(inflated), false);
  // A captured form without provenance cannot support a claim.
  const noProv = { capturedForms: [{ id: "x", expectation: { mapped: 3 } }], coverage: { claimable: true } };
  assert.equal(coverageClaim(noProv).claimable, false);
  assert.match(coverageClaim(noProv).reason, /provenance/);
  // A captured form without a pinned expectation cannot support a claim.
  const noPin = { capturedForms: [{ id: "x", sourceUrl: "https://jobs.smartrecruiters.com/x", capturedAt: "2026-10-23T00:00:00Z", captureMethod: "render-form.cjs" }], coverage: { claimable: true } };
  assert.equal(coverageClaim(noPin).claimable, false);
  assert.match(coverageClaim(noPin).reason, /pinned drive expectation/);
  // A complete record IS claimable — the gate is a check, not a constant false.
  const complete = { capturedForms: [{ id: "x", sourceUrl: "https://jobs.smartrecruiters.com/x", capturedAt: "2026-10-23T00:00:00Z", captureMethod: "render-form.cjs", expectation: { mapped: 3 } }], coverage: { claimable: true } };
  assert.equal(coverageClaim(complete).claimable, true);
  assert.ok(recordedClaimConsistent(complete));
});

for (const form of SR_CAPTURED) {
  // Timeout headroom as in the Ashby pack: a starved executor must fail loudly rather
  // than be mistaken for a driver verdict. Today this loop registers zero tests — the
  // honest state — and the machinery dry-run below proves the runner it would use.
  test(`smartrecruiters verdict pack: ${form.id}`, { timeout: 600000 }, async () => {
    phase = "pack";
    const rec = await driveForm(form.id);
    results[form.id] = rec;
    if (!process.env.SR_PACK_EMIT) {
      const exp = (EXPECTED.capturedForms.find((x) => x.id === form.id) || {}).expectation;
      assert.ok(exp, "no pinned expectation for " + form.id);
      assert.deepEqual(
        { rawFields: rec.rawFields, mapped: rec.mapped ?? null, bindError: rec.bindError ?? null, filledCount: rec.filledCount ?? null, readbackMatched: rec.readbackMatched ?? null, submitControl: rec.submitControl },
        { rawFields: exp.rawFields, mapped: exp.mapped, bindError: exp.bindError, filledCount: exp.filledCount, readbackMatched: exp.readbackMatched, submitControl: exp.submitControl },
        "verdict pack outcome drifted from the pinned expectation — re-measure and update the fixture in the same commit");
      assert.deepEqual((rec.fills || []).map((f) => [f.name, f.outcome]), exp.fills, "per-field fill outcomes drifted from the pinned expectation");
    }
  });
}

test("smartrecruiters verdict pack: machinery dry-run — the runner maps, fills and reads back a real captured form (seed, not a SmartRecruiters form)", { timeout: 600000 }, async () => {
  assert.ok(SEED, "the dry-run seed (a captured Ashby form) is missing from forms-ci");
  phase = "dryrun";
  const rec = await driveForm(SEED.id);
  results["dryrun-seed"] = rec;
  assert.ok(rec.mapped > 0, "the seed form mapped no questions");
  assert.equal(rec.bindError, undefined);
  assert.equal(rec.filledCount, rec.mapped, "the runner did not fill every mapped question on the seed");
  assert.equal(rec.readbackMatched, rec.filledCount, "the runner did not read back exactly what it filled on the seed");
  assert.equal(typeof rec.submitControl, "boolean", "submit-control presence was not recorded on the seed");
});

test("smartrecruiters verdict pack: the replay stayed read-only and never reached a submit path", () => {
  assert.ok(requests.every((r) => r.startsWith("GET ")), "non-GET request reached the local server: " + requests.join(","));
  // Pack phase: with zero captured forms the runner sent nothing at all. (When captures
  // exist this becomes the Ashby pack's exact-set assertion over the pack phase.)
  if (SR_CAPTURED.length === 0) {
    assert.deepEqual(cmdTypesByPhase.pack, [], "the pack phase sent helper commands despite holding no captured form");
  } else {
    assert.deepEqual([...new Set(cmdTypesByPhase.pack)].sort(), ["close", "discover", "fill", "open", "readback"]);
  }
  const dry = [...new Set(cmdTypesByPhase.dryrun)];
  assert.ok(!dry.includes("review") && !dry.includes("submit_and_capture"),
    "the dry-run reached a state-changing command: " + cmdTypesByPhase.dryrun.join(","));
  assert.deepEqual(dry.sort(), ["close", "discover", "fill", "open", "readback"],
    "the dry-run sent a command type outside the read/fill set: " + cmdTypesByPhase.dryrun.join(","));
});

module.exports = { coverageClaim, recordedClaimConsistent };
