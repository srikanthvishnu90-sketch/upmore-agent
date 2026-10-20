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
function employerScript(form) {
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
      var thanks = ${thanks};
      if (thanks) { location.href = thanks; return; }
      document.body.innerHTML = "<h1>Thank you for applying!</h1><p>Your application has been submitted. Application ID: TEST-12345</p>";
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button,input[type=submit]");
    if (b && /submit/i.test(b.innerText || b.value || "")) go(e);
  }, true);
  document.addEventListener("submit", go, true);
})();</script>`;
}

// TEST variants, by ?trainee_test=: a verification challenge, values the page sets itself, an identity number field.
function variant(name) {
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
    rpcCalls: [],
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
    const m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u.pathname);
    if (!m) return json(res, 404, { message: "not found" });
    state.rpcCalls.push(m[1]);
    switch (m[1]) {
      case "career_apply_account_own":
        return json(res, 200, state.account);
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
      case "career_apply_extension_begin_own": {
        const p = args.p_payload || {};
        state.begins.push(args);
        const h = sha(canonical(p));
        if (p.user_id !== userId) return json(res, 400, { message: "not your application" });
        if (p.source !== "extension" || args.p_approval !== h) return json(res, 400, { message: "invalid or stale application approval" });
        if (p.privacy_epoch !== state.account.epoch || p.account_version !== state.account.version || Date.parse(p.expires_at) < Date.now()) {
          return json(res, 400, { message: "invalid or stale application approval" });
        }
        const live = state.jobs.filter((j) => !["not_submitted", "failed"].includes(j.state));
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
      if (/\/thanks$/.test(u.pathname)) {
        return res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><h3>Application submitted!</h3><p>Thank you for applying. We've received your application.</p>");
      }
      const form = findForm(u);
      if (form && req.method === "GET") {
        const html = strip(fs.readFileSync(path.join(FORMS, form.html), "utf8"));
        const extra = variant(u.searchParams.get("trainee_test")) + employerScript(form);
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
  const hostRules = HOSTS.map((h) => `MAP ${h} 127.0.0.1:${port}`).join(", ") + ", MAP * ~NOTFOUND";
  return {
    port, hostRules, state, forms, userId,
    cloneUrl,
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

module.exports = { startWorld, canonical, WORKDAY_HOST, APP_HOST, SUPABASE_HOST };
