#!/usr/bin/env node
"use strict";
// P0: ONE proven apply loop with a receipt, on the cloud worker's path, everything up to the submit click.
//
//   node scripts/career/prove-loop.cjs [--form <captured form id>] [--repeat 3] [--fixture-submit]
//        [--fixture-variant tamper|extra] [--apply-despite-screen] [--out <dir>] [--live <greenhouse|lever|ashby url>]
//
// Match found, form filled, approval given through the chat card, receipt stored and shown:
//  1. the synthetic TEST persona (packages/career-data/fixtures/test-persona.json) becomes confirmed facts, each with the
//     persona field it came from as its fact id; the posting is a captured real application form (tests/fixtures/forms-ci)
//     served on loopback with its scripts removed, exactly as tests/career-apply-real-forms.test.cjs serves it;
//  2. the match and screen (packages/domain/121-career-jobs.js scoreFit on the persona's own profile) decide whether the
//     posting goes on; then scripts/career/prove-loop-driver.ts prepares it (the engine's dry run through the cloud
//     worker's engine runner: every field filled and read back), asks once what the persona's facts do not cover and
//     answers it from the persona, and builds the card;
//  3. the card is shown through cardTurn, the code the chat runs, and approved by the person's tap, and only the payload whose hash the card
//     carries is queued;
//  4. the approved payload must equal the filled page: the cloud worker's before-effects check, then a fresh page filled
//     from the approved payload alone must give the same engine approval hash. Then it stops at the submit click. With
//     --fixture-submit (local captured forms only) the approved job runs through runCloudJob to the LOCAL fixture server;
//  5. the receipt (posting, employer, time, every field: id, label, value, read back, source fact, payload sha256, approval
//     reference, outcome) is written under --out (default tmp/prove-loop/, gitignored) and printed with the coverage line;
//  6. --repeat N runs it N times and fails unless every run has 0 wrong answers and the same payload and answers.
//
// Nothing goes to a real employer: no --submit is ever passed for a non-loopback URL; the engine aborts every non-GET
// request before an approved submit; --live opens the real page read-only. LinkedIn and Indeed are never opened.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "../..");
const FORMS = path.join(ROOT, "tests/fixtures/forms-ci");
const PERSONA_FILE = path.join(ROOT, "packages/career-data/fixtures/test-persona.json");
const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const flag = (k) => process.argv.includes("--" + k);

// ---------- 1. the persona's confirmed facts ----------
// Each fact is the persona's own statement, with the persona field it came from as its fact id. "(TEST)" markers are
// the fixture's labels, not part of the value. Nothing is invented: a field the persona does not state is not a fact.
const untag = (s) => String(s ?? "").replace(/\s*\(TEST\)\s*$/, "").trim();
function personaFacts(persona) {
  const out = { user_id: "TEST-" + persona.persona_id, synthetic: true, answers: {}, saved: {} };
  const put = (key, value, from) => {
    if (value === undefined || value === null || value === "") return;
    // One fact id per fact (the contract binds an answer to its fact id; two facts from one persona field, first and last
    // name, are two facts): <persona field>#<fact>.
    const id = `TEST-persona:${from}#${key}`;
    out.answers[key] = { value: String(value), factId: id, confirmed: true,
      provenance: `owner stated (TEST persona fixture ${persona.persona_id}, ${from})`, confirmation_event_id: "evt-" + id };
  };
  const b = persona.basics, c = persona.constraints;
  const name = untag(b.name).split(/\s+/);
  put("full_name", untag(b.name), "basics.name");
  put("first_name", name[0], "basics.name");
  put("last_name", name.slice(1).join(" "), "basics.name");
  put("email", b.email, "basics.email");
  put("phone", untag(b.phone), "basics.phone");
  put("location", untag(b.location), "basics.location");
  const [city, state] = untag(b.location).split(/\s*,\s*/);
  put("city", city, "basics.location");
  put("state", state, "basics.location");
  put("linkedin", untag(b.links?.linkedin), "basics.links.linkedin");
  put("github", untag(b.links?.github), "basics.links.github");
  put("website", untag(b.links?.portfolio), "basics.links.portfolio");
  if (typeof c.needsSponsorship === "boolean") put("sponsorship", c.needsSponsorship ? "Yes" : "No", "constraints.needsSponsorship");
  if (typeof c.relocation === "boolean") put("relocation", c.relocation ? "Yes" : "No", "constraints.relocation");
  if (/^us citizen$/i.test(untag(c.workAuthorization))) {
    put("citizenship", "United States", "constraints.workAuthorization");
    put("work_authorization", "Yes", "constraints.workAuthorization");
  }
  put("gpa", persona.defaults?.gpa, "defaults.gpa");
  put("pronouns", untag(persona.defaults?.pronouns), "defaults.pronouns");
  return out;
}
// The persona's answers to questions its facts file does not map (asked once, answered by text). Each names the persona
// fields it stands on; a question none of these covers stays unanswered and the run stops (never guessed).
function personaAnswers(persona) {
  const loc = untag(persona.basics.location), auth = untag(persona.constraints.workAuthorization);
  const list = [];
  if (/, (IL|NY|CA|TX|WA|MA)$/.test(loc) && /^us citizen$/i.test(auth)) {
    list.push({ match: "based in and can verify right to work from one of the following countries", answer: "United States",
      from: ["basics.location", "constraints.workAuthorization"] });
  }
  return list;
}

// ---------- 2. match and screen ----------
function screen(persona, posting) {
  const Jobs = require(path.join(ROOT, "packages/domain/121-career-jobs.js"));
  const profile = Jobs.profileFromPersona(persona);
  const r = Jobs.scoreFit(posting, profile);
  return { excluded: !!r.excluded, score: r.score, bucket: r.bucket, reasons: (r.reasons || []).slice(0, 8), hard_fails: r.hard_fails || [] };
}

// ---------- the local employer: one captured form, scripts removed ----------
const strip = (h) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "").replace(/\s(src|srcset)="https?:[^"]*"/gi, "");
// FIXTURE STAND-IN, labeled as such: with the employer's scripts removed, a Greenhouse react-select is an inert text box.
// This stand-in gives each one the employer's OWN option list, as captured from the live board (greenhouse-options.json),
// and behaves as react-select does for the engine: options on focus or typing, a pick shows the single value and sets
// the hidden required input. It answers nothing itself; the engine types and picks. (The Veeva Lever test injects a
// stand-in for Lever's submit script the same way.)
function selectStandIn(formId) {
  let selects = {};
  try { selects = JSON.parse(fs.readFileSync(path.join(FORMS, "greenhouse-options.json"), "utf8")).forms[formId]?.selects || {}; } catch { /* none */ }
  const lists = Object.fromEntries(Object.entries(selects).filter(([, s]) => !s.multi).map(([k, s]) => [k, s.options]));
  if (!Object.keys(lists).length) return "";
  return `<script data-fixture-stand-in="greenhouse react-select, employer's captured options">
(() => { const LISTS = ${JSON.stringify(lists)};
  for (const [id, opts] of Object.entries(LISTS)) {
    const input = document.getElementById(id); if (!input) continue;
    const control = input.closest(".select__control"), shell = control.parentElement;
    const hidden = shell.parentElement.querySelector('input[required][tabindex="-1"]');
    const placeholder = control.querySelector(".select__placeholder");
    const menu = document.createElement("div"); menu.className = "select__menu"; shell.appendChild(menu);
    const render = () => { const q = input.value.toLowerCase(); menu.innerHTML = "";
      for (const o of opts) { if (q && !o.toLowerCase().includes(q)) continue;
        const d = document.createElement("div"); d.className = "select__option"; d.setAttribute("role", "option"); d.textContent = o;
        d.addEventListener("mousedown", (e) => { e.preventDefault(); let sv = control.querySelector(".select__single-value");
          if (!sv) { sv = document.createElement("div"); sv.className = "select__single-value"; control.querySelector(".select__value-container").prepend(sv); }
          sv.textContent = o; if (placeholder) placeholder.style.display = "none"; input.value = ""; if (hidden) hidden.value = o;
          input.setAttribute("aria-expanded", "false"); menu.innerHTML = ""; });
        menu.appendChild(d); }
      input.setAttribute("aria-expanded", "true"); };
    input.addEventListener("focus", render); input.addEventListener("input", render); input.addEventListener("click", render);
  } })();
</script>`;
}
// FIXTURE STAND-IN, labeled as such: Greenhouse's job-boards form is method="get" and its application leaves from the
// employer's script, which the capture removes. This stand-in does what that script does at the person's Submit: it
// reads the form's own values (a react-select by the option it shows) and the chosen resume, and sends them as one JSON
// POST to the job's own route on this loopback server. The real script's exact body is not captured; the engine never
// relies on its shape, only on every approved answer being in it unchanged (scripts/career/request-verifier.ts).
// --fixture-variant tamper: the page changes the email before it sends (must be stopped before it leaves);
// --fixture-variant extra: the page sends the application twice (the second must be stopped).
function submitStandIn(variant) {
  return `<script data-fixture-stand-in="greenhouse submit script, the form's own values as one JSON POST">
(() => { const VARIANT = ${JSON.stringify(variant || "")};
  const form = document.getElementById("application-form"); if (!form) return;
  form.addEventListener("submit", async (e) => { e.preventDefault();
    const body = {};
    for (const el of form.querySelectorAll("input, textarea, select")) {
      const id = el.id; if (!id || ["search", "submit", "button"].includes(el.type)) continue;
      if (el.type === "file") { const f = el.files[0]; if (!f) continue; const b = new Uint8Array(await f.arrayBuffer());
        let s = ""; for (const x of b) s += String.fromCharCode(x); body[id] = { filename: f.name, content: btoa(s) }; continue; }
      if (el.classList.contains("select__input")) { const sv = el.closest(".select__control")?.querySelector(".select__single-value");
        if (sv) body[id] = sv.textContent; continue; }
      if (el.type === "checkbox" || el.type === "radio") { if (el.checked) body[id] = el.value; continue; }
      if (el.value) body[id] = el.value;
    }
    if (VARIANT === "tamper") body.email = "changed-by-page@example.test";
    const send = () => fetch(location.pathname, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.ok ? r.json() : null).catch(() => null);
    const r = await send();
    if (VARIANT === "extra") await send();
    if (r && r.status === "success") document.body.innerHTML = "<h1>Thank you for applying</h1><p>Application received (LOCAL FIXTURE). Confirmation number: " + r.confirmation + ".</p>";
  });
})();
</script>`;
}
function fixtureServer(form, variant) {
  let html = strip(fs.readFileSync(path.join(FORMS, form.html), "utf8"));
  if (form.family === "greenhouse") html = html.replace(/<\/body>/i, selectStandIn(form.id) + submitStandIn(variant) + "</body>");
  const posts = [], gets = [];
  const server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const c of req) parts.push(c);
    if (req.method !== "GET") {
      // The LOCAL fixture employer: what a --fixture-submit run posts here is recorded, never forwarded.
      let fields = null;
      const json = /json/.test(req.headers["content-type"] || "");
      try {
        if (json) {
          fields = Object.entries(JSON.parse(Buffer.concat(parts).toString("utf8"))).map(([k, v]) => [k, v && typeof v === "object" ? { file: v.filename, size: Buffer.from(String(v.content || ""), "base64").length } : v]);
        } else {
          const data = await new Response(Buffer.concat(parts), { headers: { "content-type": req.headers["content-type"] || "" } }).formData();
          fields = [...data.entries()].map(([k, v]) => [k, typeof v === "string" ? v : { file: v.name, size: v.size }]);
        }
      } catch { /* not a form body */ }
      posts.push({ method: req.method, path: req.url, fields });
      const confirmation = "FIXTURE-" + posts.length;
      if (json) return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "success", confirmation }));
      return res.writeHead(200, { "Content-Type": "text/html" }).end(`<h1>Thank you for applying</h1><p>Application received (LOCAL FIXTURE). Confirmation ${confirmation}.</p>`);
    }
    gets.push(req.url);
    if (req.url.split("?")[0] !== "/" + form.id) return res.writeHead(404).end("not found");
    res.writeHead(200, { "Content-Type": "text/html" }).end(html);
  });
  // One fixed loopback port (--port, default 47419) so every repeat prepares the same posting key and so the same engine
  // approval; a busy port falls back to any free one (the run still proves itself, the repeat comparison then fails).
  const listen = (port) => new Promise((ok, no) => { server.once("error", no); server.listen(port, "127.0.0.1", () => ok()); });
  return listen(Number(arg("port", "47419"))).catch(() => listen(0))
    .then(() => ({ server, posts, gets, url: `http://127.0.0.1:${server.address().port}/${form.id}` }));
}

function runDriver(input) {
  const file = path.join(input.workDir, "input.json");
  fs.writeFileSync(file, JSON.stringify(input));
  return new Promise((resolve) => {
    const p = spawn(process.env.DENO_BIN || "deno", ["run", "-A", "--no-check", path.join(__dirname, "prove-loop-driver.ts"), file],
      { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", (b) => (err += b));
    const timer = setTimeout(() => p.kill("SIGKILL"), 600000);
    p.once("exit", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("PROVE_LOOP "));
      resolve(line ? JSON.parse(line.slice(11)) : { outcome: "DRIVER_ERROR", stderr: err.slice(-2000), stdout: out.slice(-1000) });
    });
  });
}

// ---------- 5. the receipt ----------
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
function receiptOf(o) {
  const { form, url, persona, facts, answers, screened, d } = o;
  const ev = d.prepared?.evidence || {};
  const schema = Array.isArray(ev.schema) ? ev.schema : [];
  const fields = Array.isArray(d.payload?.fields) ? d.payload.fields : [];
  const byName = new Map(fields.map((f) => [f.name, f]));
  const readback = ev.readback || {}, replay = d.replay?.readback || {};
  // Every source the persona supplied, by fact id: the value it stated (the expected answer for that field).
  const stated = {};
  for (const a of Object.values(facts.answers)) stated[a.factId] = a.value;
  for (const r of d.text_answers || []) stated[`text-answer:${r.id}`] = r.answer;
  const resumeSha = d.payload?.resume_sha256;
  // The independent answer key (tests/fixtures/extension/answer-key.json, graded by grade.cjs as the extension suites
  // grade): which persona fact each field of this form takes, or null where it must stay empty.
  const { same } = require(path.join(ROOT, "tests/fixtures/extension/grade.cjs"));
  const KEY = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/extension/answer-key.json"), "utf8")).forms[form?.id] || null; } catch { return null; } })();
  const keyed = (name) => {
    if (!KEY || !Object.hasOwn(KEY, name)) return { spec: undefined };
    const spec = KEY[name];
    if (spec === null || spec === "any") return { spec };
    const fact = typeof spec === "string" ? spec : spec.fact;
    if (fact === "resume") return { spec, fact, want: o.resumeName };
    const own = facts.answers[fact]?.value ?? (d.text_answers || []).find((r) => r.key === "fact:" + fact)?.answer;
    return { spec, fact, want: typeof spec === "object" && "expect" in spec ? spec.expect : own };
  };
  const rows = schema.map((s) => {
    const f = byName.get(s.name), k = keyed(s.name);
    if (!f) {
      const reason = k.spec === null ? "the answer key says this field stays empty (it is not a question for the person), and it was left empty"
        : k.fact && k.want === undefined ? `the persona states no ${k.fact}; never guessed, so it is left empty${s.required ? "" : " (optional)"}`
        : s.required ? "required but not filled (the run would have stopped: needs_answers)"
        : "optional; no confirmed persona fact maps to it, so it is left empty (never guessed)";
      const missed = k.want !== undefined && k.spec !== null;
      return { id: s.name, label: s.label, required: !!s.required, filled: false, reason, answer_key: k.spec === undefined ? "unkeyed" : missed ? "missed" : k.spec === null ? "empty_ok" : "no_persona_fact_for_key" };
    }
    const isResume = f.value === resumeSha;
    const shown = isResume ? (readback[f.name]?.filename ?? readback[f.name]) : readback[f.name];
    const shownAgain = isResume ? (replay[f.name]?.filename ?? replay[f.name]) : replay[f.name];
    const expected = isResume ? resumeSha : stated[f.factId];
    // Wrong: the value sent is not what the persona stated for that source, or what the page read back is not what was
    // filled (a select reads back as its option label, which the engine already matched before it returned).
    const sourceOk = expected !== undefined && norm(f.value) === norm(expected);
    const readOk = shown !== undefined && shown !== null && shown !== "" && JSON.stringify(shown) === JSON.stringify(shownAgain);
    // The answer key's verdict: filled where it must stay empty, or a value other than the persona's for the key's fact.
    const answerKey = k.spec === undefined ? "unkeyed" : k.spec === null ? "wrong_filled" : k.spec === "any" ? "any" : k.want === undefined ? "no_persona_fact_for_key" : same(String(shown), k.want) ? "correct" : "wrong_value";
    const keyOk = !["wrong_filled", "wrong_value"].includes(answerKey);
    const correct = sourceOk && readOk && keyOk;
    return { id: f.name, label: f.label, required: !!s.required, filled: true, value: isResume ? `${o.resumeName} (sha256 ${resumeSha})` : f.value,
      read_back: shown, read_back_on_replay: shownAgain, source_fact_id: f.factId, source_provenance: f.provenance || null,
      source_value: isResume ? resumeSha : expected ?? null, answer_key: answerKey, ...(k.want !== undefined ? { answer_key_expects: k.want } : {}), correct,
      ...(correct ? {} : { wrong_because: !sourceOk ? "value is not the persona's stated value for its source fact" : !readOk ? "read back differs from what was filled" : `answer key: ${answerKey}` }) };
  });
  const filled = rows.filter((r) => r.filled), wrong = filled.filter((r) => !r.correct);
  const required = rows.filter((r) => r.required);
  return {
    receipt_version: 1,
    label: url.startsWith("http://127.0.0.1") ? "LOCAL CAPTURED REAL FORM (served on loopback, scripts removed); TEST persona; nothing sent to any employer" : "LIVE PAGE READ-ONLY; TEST persona",
    posting: { url, captured_from: form?.final_url || null, form_id: form?.id || null, family: form?.family || null, html_sha256: form?.html_sha256 || null },
    employer: form?.company || null,
    persona: persona.persona_id,
    at: new Date().toISOString(),
    screen: screened,
    asked_once: (d.steps || []).find((s) => s.step === "asked_once")?.questions || [],
    fields: rows,
    coverage: { fields_on_form: rows.length, filled: filled.length, read_back: filled.filter((r) => r.read_back !== undefined && r.read_back !== null && r.read_back !== "").length,
      wrong: wrong.length, missed: rows.filter((r) => r.answer_key === "missed").length,
      answer_key: rows.reduce((a, r) => ((a[r.answer_key] = (a[r.answer_key] || 0) + 1), a), {}), required: required.length, required_filled: required.filter((r) => r.filled).length, unfilled: rows.filter((r) => !r.filled).map((r) => ({ id: r.id, label: r.label, reason: r.reason })) },
    page_fields_sent_unchanged: d.payload?.page_field_names || [],
    destination: d.payload?.destination || null,
    payload_sha256: d.payload_sha256 || null,
    payload_sha256_without_expiry: d.payload ? sha256(JSON.stringify(Object.fromEntries(Object.entries(d.payload).filter(([k]) => k !== "expires_at" && k !== "approved_snapshot")))) : null,
    expires_at: d.payload?.expires_at || null,
    approval: d.approval || null,
    card: d.card ? { id: d.card.id, reply: d.card.reply } : null,
    outcome: d.outcome,
    fixture: d.cloud ? { worker_state: d.cloud.state, worker_outcome: d.cloud.outcome, reason: d.cloud.reason, posts: o.posts,
      confirmation_id: d.submit_run?.result?.confirmation_id ?? null,
      // The engine's own record of the submit: the one request (where, its keys), what it stopped, the employer's answer.
      submit: d.submit_run || null } : null,
    steps: d.steps,
  };
}
const coverageLine = (r) => {
  const c = r.coverage;
  return `fields ${c.filled}/${c.fields_on_form} filled and read back (${c.read_back}/${c.filled} read back), ${c.wrong} wrong, ${c.missed} missed (answer key ${JSON.stringify(c.answer_key)}); required ${c.required_filled}/${c.required}; ` +
    (c.unfilled.length ? `unfilled ${c.unfilled.length}/${c.fields_on_form}: ${c.unfilled.map((u) => `${u.label || u.id} (${u.reason})`).join("; ")}; ` : "") + `outcome ${r.outcome}`;
};

async function liveProbe(liveUrl) {
  // Read-only reachability of the real page: one GET, nothing else. The engine itself refuses a TEST persona on a real
  // employer's page (SYNTHETIC_FACTS_REQUIRE_LOCAL_FIXTURE), so a live run is a read-only check, never a fill to send.
  const u = new URL(liveUrl);
  if (!/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com)$/.test(u.hostname) || /linkedin|indeed/i.test(u.hostname)) throw Error("LIVE_URL_REFUSED: greenhouse, lever or ashby only");
  try {
    const r = await fetch(liveUrl, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(20000) });
    return { url: liveUrl, reachable: true, status: r.status };
  } catch (e) {
    return { url: liveUrl, reachable: false, error: String(e?.cause?.code || e?.message || e).slice(0, 200) };
  }
}

async function once(o, i) {
  const workDir = fs.mkdtempSync(path.join(o.tmp, `run${i}-`));
  fs.chmodSync(workDir, 0o700);
  const resume = path.join(workDir, "test-persona-resume.pdf");
  fs.writeFileSync(resume, "%PDF-1.4\n% TEST resume for the P0 proven loop, not a real person\n");
  fs.writeFileSync(path.join(workDir, "base-facts.json"), JSON.stringify(o.facts));
  const fx = await fixtureServer(o.form, o.variant);
  try {
    const d = await runDriver({ url: fx.url, factsPath: path.join(workDir, "base-facts.json"), resumePath: resume, workDir,
      answers: o.answers, fixtureSubmit: o.fixtureSubmit, extraArgs: o.extraArgs });
    if (!d.payload) return { ok: false, outcome: d.outcome, detail: d };
    const r = receiptOf({ form: o.form, url: fx.url, persona: o.persona, facts: o.facts, screened: o.screened, d, resumeName: path.basename(resume), posts: fx.posts });
    // The local employer received nothing unless this was a fixture submit, and then exactly one POST (none when the page
    // changed an approved answer: that request is stopped before it leaves).
    const expectPosts = o.fixtureSubmit && o.variant !== "tamper" ? 1 : 0;
    r.local_employer_posts = fx.posts.length;
    if (fx.posts.length !== expectPosts) r.outcome = `UNEXPECTED_POSTS:${fx.posts.length}`;
    return { ok: true, receipt: r };
  } finally {
    await new Promise((res) => fx.server.close(res));
  }
}

async function main() {
  const persona = JSON.parse(fs.readFileSync(arg("persona", PERSONA_FILE), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(FORMS, "manifest.json"), "utf8"));
  const formId = arg("form", "greenhouse-prolificacademicltd-4979452101");
  const form = manifest.forms.find((f) => f.id === formId && f.status === "application" && f.html);
  if (!form) throw Error("no captured application form " + formId);
  const repeat = Math.max(1, Math.min(10, Number(arg("repeat", "1")) || 1));
  const outDir = path.resolve(arg("out", path.join(ROOT, "tmp/prove-loop")));
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prove-loop-"));
  const facts = personaFacts(persona), answers = personaAnswers(persona);
  // The posting as the screen reads it: its captured location (evals/apply/posting-locations.json) and title.
  const locations = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/apply/posting-locations.json"), "utf8")).by_id;
  const options = (() => { try { return JSON.parse(fs.readFileSync(path.join(FORMS, "greenhouse-options.json"), "utf8")).forms[form.id] || {}; } catch { return {}; } })();
  const location = locations[form.id]?.location || "";
  const posting = { job_id: form.id, company: form.company, title: options.title || "", location, remote: /remote/i.test(location) ? "remote" : "onsite", jd_text: options.title || "", status: "open" };
  const screened = { posting: { company: posting.company, title: posting.title, location }, ...screen(persona, posting) };
  const live = arg("live", null) ? await liveProbe(arg("live")) : null;
  if (live) console.log("LIVE " + JSON.stringify(live));
  if (screened.excluded && !flag("apply-despite-screen")) {
    console.log("SCREEN " + JSON.stringify(screened));
    console.log(`STOPPED at the screen: ${screened.hard_fails.join("; ")}. Pass --apply-despite-screen to prove the apply steps on this form anyway (recorded in the receipt).`);
    process.exit(3);
  }
  screened.overridden = screened.excluded ? "--apply-despite-screen: the screen excluded this posting for this persona; the apply steps are proven on it anyway" : false;
  console.log("SCREEN " + JSON.stringify(screened));
  // Greenhouse job-boards forms are method="get" and submit from the employer's script, so no form post can be bound as
  // the destination. The engine binds that script's one request at the network layer instead (--script-submit greenhouse:
  // the employer's own application endpoint, exactly the approved answers, every other write stopped), so the cloud
  // worker can click the employer's own Submit. --person-submits keeps the person's own Submit (never with --submit in
  // the cloud: CARD_CLOUD_AUTH_REQUIRED).
  const personSubmits = flag("person-submits");
  if (personSubmits && flag("fixture-submit")) throw Error("--fixture-submit cannot run --person-submits: the cloud worker refuses it with --submit");
  const variant = arg("fixture-variant", "");
  if (variant && (!["tamper", "extra"].includes(variant) || !flag("fixture-submit") || form.family !== "greenhouse")) {
    throw Error("--fixture-variant tamper|extra goes with --fixture-submit on a Greenhouse capture");
  }
  const extraArgs = personSubmits ? ["--person-submits"] : form.family === "greenhouse" ? ["--script-submit", "greenhouse"] : [];
  const o = { persona, facts, answers, form, screened, tmp, fixtureSubmit: flag("fixture-submit"), variant, extraArgs };
  const receipts = [];
  for (let i = 1; i <= repeat; i++) {
    const r = await once(o, i);
    if (!r.ok) {
      console.log(`RUN ${i}/${repeat}: ${r.outcome}`);
      console.log(JSON.stringify(r.detail, null, 1).slice(0, 6000));
      process.exit(1);
    }
    const file = path.join(outDir, `receipt-${form.id}-${Date.now()}-${i}.json`);
    fs.writeFileSync(file, JSON.stringify(r.receipt, null, 1) + "\n", { mode: 0o600 });
    r.receipt.file = file;
    receipts.push(r.receipt);
    console.log(`RUN ${i}/${repeat}: ${coverageLine(r.receipt)}`);
    console.log(`  receipt ${file}`);
  }
  // 6. Every run: 0 wrong, the expected outcome, and the same answers and payload as the first.
  const expected = !o.fixtureSubmit ? "stopped_before_submit" : variant === "tamper" ? "fixture_not_submitted:APPROVED_BODY_MISMATCH" : "fixture_submitted";
  // The same answers, read back the same, from the same sources, under the same engine approval, and the same payload in
  // everything but its own expiry (expires_at = prepared time + 24 h, so the payload sha256 itself differs per run).
  const sig = (r) => sha256(JSON.stringify([r.fields.map((f) => [f.id, f.value, f.read_back, f.source_fact_id]), r.approval?.engine_approval, r.payload_sha256_without_expiry]));
  const same = receipts.every((r) => sig(r) === sig(receipts[0]));
  const clean = receipts.every((r) => r.coverage.wrong === 0 && r.coverage.missed === 0 && r.outcome === expected && r.coverage.required_filled === r.coverage.required);
  const last = receipts.at(-1);
  console.log("RECEIPT " + JSON.stringify({ posting: last.posting, employer: last.employer, at: last.at, payload_sha256: last.payload_sha256, approval: last.approval, outcome: last.outcome,
    fields: last.fields.filter((f) => f.filled).map((f) => ({ id: f.id, label: f.label, value: f.value, read_back: f.read_back, source_fact_id: f.source_fact_id })) }, null, 1));
  console.log(`REPEAT ${receipts.filter((r) => r.coverage.wrong === 0 && r.outcome === expected).length}/${repeat} clean, ${same ? "identical" : "DIFFERENT"} answers and payload across runs; ${coverageLine(last)}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(clean && same ? 0 : 1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { personaFacts, personaAnswers, screen, receiptOf, coverageLine };
