"use strict";
// WO-031 test world: everything the extension talks to, on one local HTTPS server. Chromium is started with
// --host-resolver-rules that send the real hosts here and every other host nowhere (MAP * ~NOTFOUND), so nothing reaches
// a real employer, a real Upmore or a real Supabase. It serves:
//   - the captured application forms (tests/fixtures/forms-ci, scripts and styles removed) at their real URLs, with a
//     TEST stand-in for the employer's own submit script: it posts what the page holds to /__employer/submit, which is
//     recorded here, and shows a thank-you (in place for Greenhouse and Ashby, a new page for Lever);
//   - a TEST Workday-shaped page (no captured Workday HTML exists in the repo);
//   - the Upmore app origin, whose page holds a TEST session in localStorage, the way supabase-js keeps it;
//   - a fake Supabase: the person's own RPCs, with the same hash check the SQL makes (career_apply_canonical).
// Every token here is minted at run time, unsigned and labelled TEST; nothing is committed.
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..", "..");
const FORMS = path.join(ROOT, "tests/fixtures/forms-ci");
const SUPABASE_HOST = "mrwngntwmnaqrqhupvlt.supabase.co";
const APP_HOST = "upmore-topaz.vercel.app";
const WORKDAY_HOST = "acme.wd1.myworkdayjobs.com";
const HOSTS = ["job-boards.greenhouse.io", "boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com", WORKDAY_HOST, APP_HOST, SUPABASE_HOST];

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const testJwt = (claims) => `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims)}.VEVTVC1zaWduYXR1cmU`;

// The SQL's canonical JSON (career_apply_canonical) and the extension's (hashApplyPayload): sorted keys, compact.
function canonical(v) {
  if (v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

const strip = (h) =>
  h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "").replace(/\s(src|srcset)="https?:[^"]*"/gi, "");

// The TEST stand-in for the employer's submit script, removed from every capture.
// Behaviours (?trainee_test=): "silent" posts and never answers (a slow employer); "slowthanks" answers after 1.5 s.
function employerScript(form, behaviour = "") {
  const thanks = form.family === "lever" ? JSON.stringify(new URL(form.source_url).pathname.replace(/\/apply$/, "/thanks")) : "null";
  return `<script>/* TEST stand-in for ${form.company}'s own submit script (stripped from the capture). */
(function () {
  var sent = false;
  function collect() {
    var fd = new FormData();
    document.querySelectorAll("input,select,textarea").forEach(function (el) {
      var entry = el.closest && el.closest("[data-field-path]");
      var n = el.name || el.id || (entry && entry.getAttribute("data-field-path"));
      if (!n || el.type === "submit" || el.type === "button") return;
      if ((el.type === "radio" || el.type === "checkbox") && !el.checked) return;
      if (el.type === "file") { for (var i = 0; i < el.files.length; i++) fd.append(n, el.files[i], el.files[i].name); return; }
      fd.append(n, el.value);
    });
    return fd;
  }
  function go(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (sent) return; sent = true;
    fetch("/__employer/submit?form=${form.id}&path=" + encodeURIComponent(location.pathname), { method: "POST", body: collect() }).then(function () {
      if (${JSON.stringify(behaviour)}.indexOf("silent") >= 0) return;
      if (${JSON.stringify(behaviour)}.indexOf("rejects") >= 0) {
        // TEST: the employer got the application and answered with an error; the form stays.
        var err = document.createElement("div");
        err.setAttribute("role", "alert");
        err.textContent = "TEST: There was a problem submitting your application. Please try again.";
        (document.querySelector("form, .ashby-application-form-container") || document.body).prepend(err);
        return;
      }
      setTimeout(function () {
        var thanks = ${thanks};
        if (thanks) { location.href = thanks; return; }
        document.body.innerHTML = "<h1>Thank you for applying!</h1><p>Your application has been submitted. Application ID: TEST-12345</p>";
      }, ${JSON.stringify(behaviour)}.indexOf("slowthanks") >= 0 ? 1500 : 0);
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button,input[type=submit]");
    if (b && /submit/i.test(b.innerText || b.value || "")) go(e);
  }, true);
  document.addEventListener("submit", go, true);
})();</script>`;
}

// The TEST stand-in for Lever's and Ashby's place search (their scripts are stripped from the captures). WO-042 live run
// 4 showed both pages keep no typed text: a place counts only when picked from the employer's own list. This stand-in
// lists places for what is typed and keeps only a picked one; the live CI run (evals/apply/live-fill.cjs) checks the
// real pages.
function placeScript(form) {
  if (form.family !== "lever" && form.family !== "ashby") return "";
  return `<script>/* TEST stand-in for ${form.company}'s place search (stripped from the capture). */
(function () {
  var PLACES = ["Chicago, Illinois, United States", "Chicago Heights, Illinois, United States", "North Chicago, Illinois, United States", "East Chicago, Indiana, United States", "Chicago Ridge, Illinois, United States", "Illinois, United States", "Illinois City, Illinois, United States"];
  // Lever: the same rules as its retrieveLocations.js (read live in run 10). Only a keydown, other than an arrow or
  // Enter, starts a lookup, 500 ms later, of the value then; input only shows the dropdown; a mousedown on a place picks
  // it and writes selectedLocation; a blur while the dropdown shows clears the text and the pick.
  function wireLever(input) {
    var field = input.closest(".application-field") || input.parentElement;
    var hidden = field.querySelector("input[name=selectedLocation]");
    var box = field.querySelector(".dropdown-container"), list = field.querySelector(".dropdown-results");
    var found = null, timer = null;
    box.style.display = "none";
    // Not measured live; kept so the driver never depends on the list being visible.
    list.style.visibility = "hidden";
    function empty() { list.innerHTML = ""; found = null; }
    input.addEventListener("input", function () { box.style.display = "flex"; });
    input.addEventListener("keydown", function (e) {
      if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Enter)$/.test(e.key)) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        empty();
        var q = input.value;
        if (!q) return;
        found = PLACES.filter(function (p) { return p.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
        found.forEach(function (p, i) {
          var item = document.createElement("div");
          item.className = "dropdown-location"; item.id = "location-" + i; item.textContent = p;
          list.appendChild(item);
        });
      }, 500);
    });
    input.addEventListener("blur", function () {
      if (box.style.display !== "none") { box.style.display = "none"; empty(); input.value = ""; hidden.value = ""; }
    });
    document.addEventListener("mousedown", function (e) {
      var item = e.target.closest && e.target.closest(".dropdown-location");
      if (!item || !field.contains(item)) return;
      box.style.display = "none";
      input.value = item.textContent;
      hidden.value = JSON.stringify({ name: found[Number(item.id.split("-")[1])] });
      empty();
    });
  }
  function wire(input) {
    if (input.classList.contains("location-input")) return wireLever(input);
    var picked = null, timer = null;
    var list = document.createElement("ul");
    list.setAttribute("role", "listbox");
    list.id = "trainee-test-places-" + Math.random().toString(36).slice(2);
    input.setAttribute("aria-controls", list.id);
    input.parentElement.appendChild(list);
    function render(q) {
      list.innerHTML = "";
      if (!q) return;
      PLACES.filter(function (p) { return p.toLowerCase().indexOf(q.toLowerCase()) >= 0; }).forEach(function (p) {
        var item = document.createElement("li");
        item.setAttribute("role", "option");
        item.textContent = p;
        item.addEventListener("mousedown", function (e) { e.preventDefault(); });
        item.addEventListener("click", function () { picked = p; input.value = p; list.innerHTML = ""; });
        list.appendChild(item);
      });
    }
    input.addEventListener("input", function () {
      picked = null;
      clearTimeout(timer); var q = input.value; timer = setTimeout(function () { render(q); }, 150);
    });
    input.addEventListener("blur", function () {
      setTimeout(function () { if (!picked || input.value !== picked) { input.value = ""; list.innerHTML = ""; } }, 200);
    });
  }
  document.querySelectorAll("input.location-input, input[role=combobox][aria-autocomplete=list]").forEach(function (el) {
    var entry = el.closest("[data-field-path]");
    if (el.classList.contains("location-input") || (entry && /location/i.test(entry.getAttribute("data-field-path")))) wire(el);
  });
})();</script>`;
}

// TEST variants, by ?trainee_test=: a verification challenge, values the page sets itself, an identity number field.
function variant(names) {
  return String(names || "").split(",").map(variantOne).join("");
}
const insertField = (html) => `window.addEventListener("DOMContentLoaded", function () {
      var host = document.querySelector("#application-form, form, .ashby-application-form-container") || document.body;
      var d = document.createElement("div");
      d.innerHTML = ${JSON.stringify(html)};
      host.insertBefore(d, host.firstChild);
    });`;
function variantOne(name) {
  if (name === "banner") return `<div role="alert" style="display:block;padding:4px">TEST: we use cookies on this site.</div>`;
  if (name === "sin") return `<script>/* TEST: a Canadian identity number */ ${insertField('<label for="sin_test">SIN (Social Insurance Number) *</label><input id="sin_test" name="sin_test" type="text" required>')}</script>`;
  if (name === "freefield") return `<script>/* TEST: a free field */ ${insertField('<label for="ref_free">Anything else we should know?</label><input id="ref_free" name="ref_free" type="text">')}</script>`;
  // WO-049: a required written question (an essay, by the question map) with the field's own limit, and an employer's
  // statement that answers must be written without AI.
  if (name === "essay") return `<script>/* TEST: a written question */ ${insertField('<label for="why_test">Why do you want to work here? *</label><textarea id="why_test" name="why_test" rows="4" maxlength="1500" required></textarea>')}</script>`;
  if (name === "aiban") return `<script>/* TEST: an employer that asks for answers without AI */ ${insertField('<label><input type="checkbox" name="own_words_test" value="yes">During this application process I agree to use only my own words. I understand that the use of AI or other generated content will disqualify my application.</label>')}</script>`;
  // WO-054: anything done to the page (a value set, a click, a submit) is reported to the world, so a test can prove
  // Prepare only reads.
  if (name === "watch") {
    return `<script>/* TEST: report what is done to this page */ ["input", "change", "click", "submit"].forEach(function (t) {
      document.addEventListener(t, function () { navigator.sendBeacon("/__employer/touched?type=" + t + "&path=" + encodeURIComponent(location.pathname)); }, true);
    });</script>`;
  }
  if (name === "readonly") return `<script>/* TEST: a read-only field the page sets */ ${insertField('<label for="ref_test">Posting reference</label><input id="ref_test" name="ref_test" readonly value="TEST-REF-42">')}</script>`;
  if (name === "race") {
    // TEST attacker: when the screenshot's covers come off, wait and rewrite the email (WO-031 review, item 1).
    return `<script>new MutationObserver(function (ms) { ms.forEach(function (m) { m.removedNodes.forEach(function (n) {
      if (n.getAttribute && n.getAttribute("data-trainee-mask")) setTimeout(function () {
        var el = document.querySelector("[name='_systemfield_email'], [name='email'], input[type=email]");
        if (el) { el.value = "planted@attacker.example.test"; }
      }, 150);
    }); }); }).observe(document.documentElement, { childList: true });</script>`;
  }
  if (name === "hydrate") {
    // TEST: a page still hydrating (React) resets the first name field once, just after a value is set (live run 12,
    // Anduril's First Name).
    return `<script>window.addEventListener("DOMContentLoaded", function () {
      var el = document.querySelector("[name='first_name'], [name='name']");
      if (!el) return;
      el.addEventListener("input", function reset() {
        el.removeEventListener("input", reset);
        setTimeout(function () { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ""); }, 5);
      });
    });</script>`;
  }
  if (name === "captcha") {
    return `<iframe title="TEST challenge" src="https://www.google.com/recaptcha/api2/bframe?k=TEST" style="display:block;width:320px;height:200px;border:1px solid #888"></iframe>`;
  }
  if (name === "prefill") {
    return `<script>/* TEST: the page sets a value nobody gave */ window.addEventListener("load", function () {
      var el = document.querySelector("[name='urls[Twitter]']") || document.querySelector("[name='urls[Other]']");
      if (el) el.value = "https://twitter.example.test/page-default";
    });</script>`;
  }
  if (name === "ssn") {
    return `<script>/* TEST: an identity number question */ window.addEventListener("DOMContentLoaded", function () {
      var host = document.querySelector("#application-form, form, .ashby-application-form-container") || document.body;
      var d = document.createElement("div");
      d.innerHTML = '<label for="ssn_test">Social Security Number *</label><input id="ssn_test" name="ssn_test" type="text" required>';
      host.insertBefore(d, host.firstChild);
    });</script>`;
  }
  return "";
}

// TEST page with the label traps of the WO-031 review, item 3 (not a captured form): a referrer's phone beside the
// person's, authorization radios after a sponsorship label in one fieldset, two fields under one label.
const LABELS_PATH = "/trainee-test/11111111-1111-4111-8111-111111111111/apply";
const LABELS_PAGE = `<!doctype html><html><head><title>TEST label traps</title></head><body><form id="application-form">
<div><label for="tp">Phone</label><input id="tp" name="phone" type="tel"><input name="ref_phone" type="tel" aria-label="Referrer phone number"></div>
<fieldset><label for="sp">Will you now or in the future require visa sponsorship?</label>
<select id="sp" name="spons"><option value="">Select</option><option>Yes</option><option>No</option></select>
<div class="q">Are you legally authorized to work in the United States?</div>
<label><input type="radio" name="auth" value="yes">Yes</label><label><input type="radio" name="auth" value="no">No</label></fieldset>
<div><label>Email</label><input name="email1" type="text"></div><div><label>Email</label><input name="email2" type="text"></div>
<button type="submit">Submit application</button></form></body></html>`;

const WORKDAY_PAGE = `<!doctype html><html><head><title>Analyst - Acme (TEST Workday-shaped page)</title></head><body>
<h1>TEST Workday-shaped page (no captured Workday HTML exists in the repo)</h1>
<form id="wd">
<label for="wd-first">First Name*</label><input id="wd-first" name="legalName--firstName" required>
<label for="wd-last">Last Name*</label><input id="wd-last" name="legalName--lastName" required>
<label for="wd-email">Email Address*</label><input id="wd-email" name="email" type="email" required>
<label for="wd-phone">Phone Number*</label><input id="wd-phone" name="phoneNumber" type="tel" required>
<label for="wd-auth">Are you legally authorized to work in the United States?*</label>
<select id="wd-auth" name="workAuth" required><option value="">Select One</option><option value="1">Yes</option><option value="0">No</option></select>
<label for="wd-spons">Will you now or in the future require sponsorship?*</label>
<select id="wd-spons" name="sponsorship" required><option value="">Select One</option><option value="1">Yes</option><option value="0">No</option></select>
<button type="submit">Submit</button></form></body></html>`;

// WO-048: TEST Workday-shaped tenants (tests/fixtures/workday/<tenant>: one file per step, key.json) served as a signed-in
// Workday application, every step under one posting: https://<tenant host>/en-US/External/job/<place>/<job>/apply/<step>.
// Pages are served as written, plus TEST variants by ?trainee_test= (none touches what the page asks):
//   parsed   the step's first work row arrives filled the way a resume parse leaves it (Workday's own values)
function workdayVariant(html, names) {
  const add = [];
  for (const n of String(names || "").split(",")) {
    if (n === "parsed") {
      add.push(`window.WD_CFG && (window.WD_CFG.initialRows = [{ section: "workExperience", values: { "--jobTitle": "Data Analyst II", "--companyName": "Example Analytics" } }]);`);
    }
  }
  if (!add.length) return html;
  const at = html.indexOf("window.WD_CFG");
  const end = at >= 0 ? html.indexOf("</script>", at) : -1;
  if (end < 0) return html;
  return html.slice(0, end + 9) + `<script>/* TEST variant: ${names} */ ${add.join("\n")}</script>` + html.slice(end + 9);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function startWorld(o = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trainee-world-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem"),
    "-days", "1", "-subj", "/CN=trainee-test.invalid"], { stdio: "ignore" });
  const manifest = JSON.parse(fs.readFileSync(path.join(FORMS, "manifest.json"), "utf8"));
  const forms = manifest.forms.filter((f) => f.status === "application" && f.html);
  const userId = "00000000-0000-4000-8000-0000000000aa";
  const now = () => Math.floor(Date.now() / 1000);
  const state = {
    userId,
    email: "test.person@example.test",
    access: testJwt({ role: "authenticated", sub: userId, email: "test.person@example.test", exp: now() + 3600, test: true }),
    refresh: "TEST-refresh-" + crypto.randomUUID(),
    account: { epoch: 0, version: 1, paused: false },
    dailyLimit: 25,
    answers: [], // career_apply_questions answered rows: {id, key, kind, answer, answered_at}
    questions: new Map(), // key -> row
    putCalls: [],
    jobs: [], // career_apply_jobs rows
    begins: [],
    finishes: [],
    submits: [], // what reached the stand-in employer
    otp: [],
    outbox: [],
    wanted: [], // WO-066: career_apply_wanted rows {posting_key, url, company, title, state}
    rpcCalls: [],
    essayCalls: [], // WO-049: what reached the career-essay-draft stand-in
    essayReply: null,
    touched: [], // WO-054: what the "watch" variant saw done to a page
    serviceKeySession: false,
  };
  // WO-042: one captured form served as many distinct postings (another tenant and job id on the same host), so a session
  // of 60 is 60 postings at 60 companies, as the queue's rules (one posting once, one company per 30 days) see it.
  const clones = new Map(); // host + lower-case path -> form
  const findForm = (u) => clones.get(u.host + u.pathname.toLowerCase()) || forms.find((f) => {
    const s = new URL(f.source_url);
    return s.host === u.host && s.pathname.toLowerCase() === u.pathname.toLowerCase();
  });
  function cloneUrl(id, k) {
    const f = forms.find((x) => x.id === id);
    const u = new URL(f.source_url), seg = u.pathname.split("/");
    seg[1] = `${seg[1]}-b${k}`; // the tenant: another company
    const i = seg.findIndex((x, j) => j > 1 && (/^\d+$/.test(x) || /^[0-9a-f-]{8,}$/i.test(x)));
    seg[i] = /^\d+$/.test(seg[i]) ? seg[i] + String(k).padStart(3, "0") : seg[i].slice(0, -3) + (0xfff - k).toString(16).padStart(3, "0");
    u.pathname = seg.join("/");
    clones.set(u.host + u.pathname.toLowerCase(), f);
    return u.href;
  }

  const json = (res, code, body) => res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(body));
  // WO-048: host -> { dir, base, files, served }
  const workdayTenants = new Map();

  async function supabase(req, res, u) {
    if (req.method === "OPTIONS") {
      return res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST" }).end();
    }
    const body = req.method === "POST" ? await readBody(req) : Buffer.alloc(0);
    let args = {};
    try {
      args = body.length ? JSON.parse(body.toString()) : {};
    } catch { /* not json */ }
    if (u.pathname === "/auth/v1/otp") {
      state.otp.push({ email: args.email, redirect_to: u.searchParams.get("redirect_to"), create_user: args.create_user });
      return json(res, 200, {});
    }
    if (u.pathname === "/auth/v1/token") {
      if (args.refresh_token !== state.refresh) return json(res, 400, { message: "invalid refresh token" });
      state.access = testJwt({ role: "authenticated", sub: userId, email: state.email, exp: now() + 3600, test: true, n: Math.random() });
      return json(res, 200, { access_token: state.access, refresh_token: state.refresh, expires_at: now() + 3600, user: { email: state.email } });
    }
    if (req.headers.authorization !== "Bearer " + state.access) return json(res, 401, { message: "JWT expired" });
    if (u.pathname === "/rest/v1/career_outbox") return json(res, 200, state.outbox);
    // WO-066: the person's own apply queue, as RLS serves it (their rows; the panel asks for state=eq.waiting).
    if (u.pathname === "/rest/v1/career_apply_wanted") {
      const st = (u.searchParams.get("state") || "").replace(/^eq\./, "");
      return json(res, 200, state.wanted.filter((w) => !st || w.state === st).map(({ posting_key, url }) => ({ posting_key, url })));
    }
    // WO-049: the TEST stand-in for supabase/functions/career-essay-draft (its real logic is tested with a stub model in
    // tests/architect/wo-049-essay-card.test.ts). Each call is recorded; the reply is state.essayReply(body, n) when a test
    // sets one, else a TEST draft, or the employer's AI-policy refusal when the form's own words ask for answers without AI.
    if (u.pathname === "/functions/v1/career-essay-draft" && req.method === "POST") {
      state.essayCalls.push(args);
      const n = state.essayCalls.length;
      if (state.essayReply) return json(res, 200, state.essayReply(args, n));
      const words = [args.label, ...(Array.isArray(args.siblings) ? args.siblings : [])].join("\n");
      if (/only my own words|use of AI|without AI/i.test(words)) {
        return json(res, 200, { ok: false, why: "policy", message: `${args.company} asks for answers written without AI, so Trainee won't draft this one: it needs your own words.`, used: null, cap: 60 });
      }
      const facts = [{ id: "TEST-F1", label: "experience: Data Analyst at Example Analytics" }, { id: "TEST-F2", label: "education: Statistics, Example State University" }];
      return json(res, 200, {
        ok: true, text: `TEST draft ${n}: as a Data Analyst at Example Analytics for 3 years I built the weekly reporting, and I studied Statistics at Example State University.`,
        facts, fact_ids: facts.map((f) => f.id), message: "Drafted by Trainee only from your confirmed facts. TEST: this is a stand-in draft.", used: n, cap: 60,
      });
    }
    const m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u.pathname);
    if (!m) return json(res, 404, { message: "not found" });
    state.rpcCalls.push(m[1]);
    switch (m[1]) {
      case "career_apply_account_own":
        return json(res, 200, state.account);
      case "career_apply_want_take_own": {
        let n = 0;
        for (const w of state.wanted) if (w.state === "waiting" && (args.p_keys || []).includes(w.posting_key)) { w.state = "taken"; n++; }
        return json(res, 200, n);
      }
      case "career_apply_answers_own":
        return json(res, 200, state.answers);
      case "career_apply_questions_put_own": {
        state.putCalls.push(args);
        for (const q of args.p_questions || []) {
          const prior = state.questions.get(q.key);
          state.questions.set(q.key, { ...(prior || { id: crypto.randomUUID(), state: "open", answer: null }), ...q, job_ids: [...new Set([...(prior?.job_ids || []), args.p_job_id])] });
        }
        return json(res, 200, (args.p_questions || []).length);
      }
      // As 20261021120000: only a question still open and raised by this posting is answered (a missing one is created
      // answered); an answer already given is never replaced. The answer reads back through career_apply_answers_own.
      case "career_apply_questions_answer_from_form_own": {
        state.formAnswerCalls = state.formAnswerCalls || [];
        state.formAnswerCalls.push(args);
        let n = 0;
        for (const a of args.p_answers || []) {
          const prior = state.questions.get(a.key);
          if (prior && (prior.state !== "open" || !(prior.job_ids || []).includes(args.p_job_id))) continue;
          const row = { ...(prior || { id: crypto.randomUUID(), job_ids: [args.p_job_id], kind: a.kind, label: a.label }), state: "answered", answer: String(a.answer).trim() };
          state.questions.set(a.key, row);
          state.answers.push({ id: row.id, key: a.key, kind: row.kind, answer: row.answer, answered_at: new Date().toISOString() });
          n++;
        }
        return json(res, 200, n);
      }
      case "career_apply_extension_begin_own": {
        const p = args.p_payload || {};
        state.begins.push(args);
        const h = sha(canonical(p));
        if (p.user_id !== userId) return json(res, 400, { message: "not your application" });
        if (p.source !== "extension" || args.p_approval !== h) return json(res, 400, { message: "invalid or stale application approval" });
        if (p.privacy_epoch !== state.account.epoch || p.account_version !== state.account.version || Date.parse(p.expires_at) < Date.now()) {
          return json(res, 400, { message: "invalid or stale application approval" });
        }
        // The SQL's rule: only a row stopped before the click may be replaced; any other row for the posting is final.
        const retriable = (j) => j.state === "not_submitted" && j.evidence?.reason === "stopped before the click";
        if (state.jobs.some((j) => j.job_id === p.job_id && !retriable(j))) return json(res, 400, { message: "duplicate_job" });
        const live = state.jobs.filter((j) => !["not_submitted", "failed"].includes(j.state));
        if (state.beginDelayMs) await new Promise((r) => setTimeout(r, state.beginDelayMs));
        if (live.some((j) => j.job_id === p.job_id)) return json(res, 400, { message: "duplicate_job" });
        if (live.some((j) => j.company === p.company && Date.now() - j.at < 30 * 86400000)) return json(res, 400, { message: "company_cooldown" });
        if (live.filter((j) => Date.now() - j.at < 86400000).length >= state.dailyLimit) return json(res, 400, { message: "daily_cap" });
        state.jobs = state.jobs.filter((j) => j.job_id !== p.job_id);
        const row = { id: crypto.randomUUID(), lease: crypto.randomUUID(), job_id: p.job_id, company: p.company, payload: p, payload_hash: h, state: "driving", at: Date.now() };
        state.jobs.push(row);
        return json(res, 200, { id: row.id, lease: row.lease, payload_hash: h });
      }
      case "career_apply_finish_own": {
        const j = state.jobs.find((x) => x.id === args.p_id && x.lease === args.p_lease);
        if (!j || j.state !== "driving") return json(res, 400, { message: "invalid apply claim" });
        if (JSON.stringify(args.p_evidence || {}).length > 65536) return json(res, 400, { message: "invalid apply evidence" });
        j.state = args.p_state;
        j.evidence = args.p_evidence;
        state.finishes.push(args);
        return json(res, 200, j);
      }
      default:
        return json(res, 404, { message: "no such function" });
    }
  }

  const server = https.createServer({ key: fs.readFileSync(path.join(dir, "key.pem")), cert: fs.readFileSync(path.join(dir, "cert.pem")) }, async (req, res) => {
    try {
      const host = String(req.headers.host || "").replace(/:\d+$/, "");
      const u = new URL(req.url, "https://" + host);
      if (host === SUPABASE_HOST) return await supabase(req, res, u);
      if (host === APP_HOST) {
        const session = state.serviceKeySession
          ? { access_token: testJwt({ role: "service_role", iss: "TEST" }), refresh_token: "TEST-service", expires_at: now() + 3600 }
          : { access_token: state.access, refresh_token: state.refresh, expires_at: now() + 3600, user: { email: state.email } };
        return res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>Upmore (TEST)</title><h1>Upmore TEST app</h1>
<script>localStorage.setItem("sb-mrwngntwmnaqrqhupvlt-auth-token", ${JSON.stringify(JSON.stringify(session))});</script>`);
      }
      const tenant = workdayTenants.get(host);
      if (tenant) {
        if (!u.pathname.startsWith(tenant.base) || req.method !== "GET") return res.writeHead(404, { "content-type": "text/plain" }).end("TEST world: not found");
        const file = decodeURIComponent(u.pathname.slice(tenant.base.length));
        const src = tenant.files[file] || (/^[\w.-]+\.html$/.test(file) ? path.join(tenant.dir, file) : null);
        if (!src || !fs.existsSync(src)) return res.writeHead(404, { "content-type": "text/plain" }).end("TEST world: no such step");
        tenant.served.push(file);
        const page = workdayVariant(fs.readFileSync(src, "utf8"), u.searchParams.get("trainee_test"));
        return res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(page);
      }
      if (host === WORKDAY_HOST) {
        if (req.method === "POST") {
          state.submits.push({ form: "workday-test", fields: {} });
          return res.writeHead(200, { "content-type": "text/html" }).end("<h1>Thank you for applying</h1>");
        }
        return res.writeHead(200, { "content-type": "text/html" }).end(WORKDAY_PAGE);
      }
      if (u.pathname === "/__employer/submit" && req.method === "POST") {
        const raw = await readBody(req);
        const fd = await new Response(raw, { headers: { "content-type": req.headers["content-type"] } }).formData();
        const fields = {}, files = {};
        for (const [k, v] of fd.entries()) {
          if (typeof v === "string") fields[k] = fields[k] === undefined ? v : [].concat(fields[k], v);
          else files[k] = { name: v.name, size: v.size, sha256: sha(Buffer.from(await v.arrayBuffer())) };
        }
        state.submits.push({ form: u.searchParams.get("form"), path: u.searchParams.get("path"), host, fields, files, at: Date.now() });
        return json(res, 200, { ok: true });
      }
      if (u.pathname === "/__employer/touched" && req.method === "POST") {
        state.touched.push({ host, type: u.searchParams.get("type"), path: u.searchParams.get("path"), at: Date.now() });
        return res.writeHead(204).end();
      }
      if (host === "jobs.lever.co" && u.pathname === LABELS_PATH) {
        return res.writeHead(200, { "content-type": "text/html" }).end(LABELS_PAGE);
      }
      if (/\/thanks$/.test(u.pathname)) {
        return res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><h3>Application submitted!</h3><p>Thank you for applying. We've received your application.</p>");
      }
      const form = findForm(u);
      if (form && req.method === "GET") {
        const html = strip(fs.readFileSync(path.join(FORMS, form.html), "utf8"));
        const extra = variant(u.searchParams.get("trainee_test")) + employerScript(form, u.searchParams.get("trainee_test") || "") + placeScript(form);
        const page = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, extra + "</body>") : html + extra;
        return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page);
      }
      if (form && req.method !== "GET") {
        state.submits.push({ form: form.id, host, fields: {}, via: "form-post" });
        return res.writeHead(200, { "content-type": "text/html" }).end("<h1>Thank you for applying!</h1>");
      }
      res.writeHead(404, { "content-type": "text/plain" }).end("TEST world: not found");
    } catch (e) {
      res.writeHead(500).end(String(e && e.message));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  // Every Workday tenant host comes here too (WO-048: a TEST tenant on its own host); nothing reaches a real one.
  const hostRules = HOSTS.map((h) => `MAP ${h} 127.0.0.1:${port}`).join(", ") + `, MAP *.myworkdayjobs.com 127.0.0.1:${port}, MAP * ~NOTFOUND`;
  return {
    port, hostRules, state, forms, userId,
    cloneUrl,
    // WO-048: serve a TEST Workday-shaped tenant directory; returns the URL of a step file. `files` adds steps from
    // elsewhere (a TEST sign-in page) by file name.
    workdayTenant(o) {
      const host = o.host, base = o.base || "/en-US/External/job/Chicago-IL/Data-Analyst_R-10001/apply/";
      if (!/\.myworkdayjobs\.com$/.test(host)) throw Error("a TEST tenant lives under myworkdayjobs.com");
      const t = { dir: o.dir, base, files: o.files || {}, served: [] };
      workdayTenants.set(host, t);
      return { url: (file, variant) => `https://${host}${base}${file}${variant ? "?trainee_test=" + variant : ""}`, served: t.served };
    },
    urlOf: (id, v) => {
      const f = forms.find((x) => x.id === id);
      return f.source_url + (v ? "?trainee_test=" + v : "");
    },
    answer(key, kind, answer) {
      state.answers.push({ id: crypto.randomUUID(), key, kind, answer, answered_at: new Date().toISOString() });
    },
    close: () => new Promise((r) => server.close(() => (fs.rmSync(dir, { recursive: true, force: true }), r()))),
  };
}

module.exports = { startWorld, canonical, WORKDAY_HOST, APP_HOST, SUPABASE_HOST, LABELS_URL: "https://jobs.lever.co" + LABELS_PATH };
