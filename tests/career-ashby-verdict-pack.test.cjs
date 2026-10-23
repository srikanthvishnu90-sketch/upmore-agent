"use strict";
// ASHBY VERDICT PACK — harness-tier replay of the six captured Ashby application forms
// (tests/fixtures/forms-ci, captured 2026-10-19). What this suite proves, and only this:
// against the captured markup, served locally, the product's own browser executor
// (scripts/career/portal-browser-helper.cjs, the same daemon the board service spawns)
// maps each form through the shared binder (bindFields, extension/lib/trainee-core.js —
// the same code scripts/apply.ts binds with), fills every mapped question with synthetic
// values, and reads back exactly what was filled.
//
// FAIL-CLOSED BY CONSTRUCTION: the runner below can only send open / discover / fill /
// readback / close / shutdown to the helper. There is no code path that sends review or
// submit_and_capture, and the final test asserts the command log proves it. The pages
// are the captured files on 127.0.0.1 with every script/link/external src stripped
// (the same serving the 2026-10-19 captures were exercised with); the suite asserts the
// local server only ever received GETs. No live Ashby call exists anywhere in this pack:
// the family's live tier was measured separately (403 FAMILY_NOT_DRIVEABLE, 2026-10-23)
// and is classified in docs/engine/ASHBY-VERDICT-PACK-2026-10-23.md — not re-measured here.
//
// Synthetic data only: one fixed TEST persona, one synthetic PDF. Expected counts are
// pinned in tests/fixtures/ashby-verdict-pack-expected.json; regenerate after an
// intentional capture/binder change with ASHBY_PACK_EMIT=<path> and review the diff.
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
const ASHBY = MANIFEST.forms.filter((f) => f.id.startsWith("ashby-") && f.html);
const EXPECTED = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "ashby-verdict-pack-expected.json"), "utf8"));
require(path.join(ROOT, "extension", "lib", "trainee-core.js"));
const bindFields = globalThis.TraineeCore.bindFields;

// Same strip the captured forms were exercised with in tests/career-apply-real-forms.test.cjs:
// the capture already removed script/style bodies and iframes; this removes the tags and any
// external resource reference so a replayed page can only talk to the local server.
function strip(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s(src|href)\s*=\s*"(https?:)?\/\/[^"]*"/gi, ' $1="/__blocked"')
    .replace(/\s(src|href)\s*=\s*'(https?:)?\/\/[^']*'/gi, " $1='/__blocked'");
}

const requests = [];
const server = http.createServer((req, res) => {
  requests.push(req.method + " " + req.url);
  const id = decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "");
  const file = path.join(FORMS, id + ".html");
  if (!id.startsWith("ashby-") || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
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
  fs.writeFileSync(path.join(sessionDir, `cmd-${id}.json`), JSON.stringify({ boardId: "ashby-pack", ...cmd }));
  const respFile = path.join(sessionDir, `resp-${id}.json`);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = JSON.parse(fs.readFileSync(respFile, "utf8")); fs.rmSync(respFile, { force: true }); return r; }
    catch { await new Promise((r) => setTimeout(r, 60)); }
  }
  throw new Error("helper response timeout for " + cmd.type);
}

// One synthetic value per mapped question, chosen by the binding the binder produced —
// the same shape of choice the planner makes (identity keys by profile_key, an option
// field by its first option, the resume by its artifact), with screening/essay text a
// fixed synthetic string. This measures the driver's hands, not answer policy.
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

const results = {};
test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "ashby-pack-"));
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
  if (process.env.ASHBY_PACK_EMIT) {
    fs.writeFileSync(process.env.ASHBY_PACK_EMIT, JSON.stringify({ posture: ready, results }, null, 1));
  }
});

for (const form of ASHBY) {
  test(`ashby verdict pack: ${form.id}`, { timeout: 300000 }, async () => {
    const rec = { company: form.company || null, manifestFields: form.fields.length, botCheck: form.bot_check || [] };
    results[form.id] = rec;
    const open = await send({ type: "open", url: `${base}/${form.id}` });
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
        const r = await send({ type: "fill", binding: b, value: v, ...(b.inputType === "file" ? { filePath: resumeFile } : {}), observationVersion: version });
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
    if (!process.env.ASHBY_PACK_EMIT) {
      const exp = EXPECTED[form.id];
      assert.ok(exp, "no pinned expectation for " + form.id);
      assert.deepEqual(
        { rawFields: rec.rawFields, mapped: rec.mapped ?? null, bindError: rec.bindError ?? null, filledCount: rec.filledCount ?? null, readbackMatched: rec.readbackMatched ?? null, submitControl: rec.submitControl },
        { rawFields: exp.rawFields, mapped: exp.mapped, bindError: exp.bindError, filledCount: exp.filledCount, readbackMatched: exp.readbackMatched, submitControl: exp.submitControl },
        "verdict pack outcome drifted from the pinned expectation — re-measure and update the fixture in the same commit");
      assert.deepEqual((rec.fills || []).map((f) => [f.name, f.outcome]), exp.fills, "per-field fill outcomes drifted from the pinned expectation");
    }
  });
}

test("ashby verdict pack: the replay stayed read-only and never reached a submit path", () => {
  assert.ok(requests.length >= ASHBY.length, "server saw the form loads");
  assert.ok(requests.every((r) => r.startsWith("GET ")), "non-GET request reached the local server: " + requests.join(","));
  const used = [...new Set(cmdTypesSent)];
  assert.ok(!used.includes("review") && !used.includes("submit_and_capture"),
    "the runner reached a state-changing command: " + cmdTypesSent.join(","));
  assert.deepEqual(used.sort(), ["close", "discover", "fill", "open", "readback"],
    "the runner sent a command type outside the read/fill set: " + cmdTypesSent.join(","));
});
