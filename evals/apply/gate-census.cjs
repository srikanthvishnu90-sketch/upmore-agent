"use strict";
// Gate census (CI only): of live job postings today, which application forms put up a human gate before or at submit,
// and of what kind (a captcha, a bot-challenge page, a sign-in wall, an emailed code). It decides whether a cloud worker
// can submit unattended or whether the person's own browser has to.
//
// Read-only by construction:
// - nothing is clicked, typed, focused or uploaded; each page is loaded by URL and read;
// - every request the browser makes that is not a GET or a HEAD is aborted before it leaves (no exception: a form post,
//   a GraphQL read, a captcha's token request and an analytics beacon are all aborted, and counted);
// - LinkedIn and Indeed are never opened; no captcha is solved; no stealth plugin, proxy or user agent other than
//   Playwright's default; a fresh browser context (no cookies) per posting;
// - polite: at most 2 pages at once, at least 1.5 s between page loads on one host.
// Discovery (a separate step) reads the ATSes' public posting lists: GET for Greenhouse, Lever, Ashby and SmartRecruiters
// (scripts/career/pick-form-sources.cjs), and Workday's public job search (a POST of an empty search, the same read the
// board directory is verified with in scripts/career/verify-board-candidates.cjs). Nothing is submitted anywhere.
//
//   node evals/apply/gate-census.cjs discover <out postings.json> [--seed N]
//   UPMORE_PLAYWRIGHT_PATH=... node evals/apply/gate-census.cjs census <postings.json> <out results.json>
//   node evals/apply/gate-census.cjs summary <results.json> <out summary.md> [label]
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "../..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NEVER = /(^|\.)(linkedin\.com|lnkd\.in|indeed\.com)$/i;
const UA = { "user-agent": "Trainee gate census (read-only; github.com/srikanthvishnu90-sketch/upmore-agent)", accept: "application/json" };
const WANT = { greenhouse: 40, lever: 30, ashby: 30, smartrecruiters: 10, workday: 10 };

// ---------- discovery ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(xs, rand) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Every employer of the sealed samples A-H, so the census spends none of them.
function sealedCompanies() {
  const dir = path.join(ROOT, "evals/apply");
  return fs.readdirSync(dir).filter((f) => /^questions-ci(-[a-z])?\.json$/.test(f))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).postings.map((p) => p.company));
}
// Workday boards: the directory's discovered tenants, seeded order, one public job search each (limit 20).
async function pickWorkday(directory, want, seed, exclude, gapMs = 2000) {
  const rand = rng(seed + 1000);
  const seen = new Set(exclude.map((c) => String(c).toLowerCase()));
  const boards = shuffle(directory.boards.filter((b) => b.provider === "workday" && b.wd && Array.isArray(b.sites) && b.sites.length), rand);
  const out = [];
  for (const b of boards) {
    if (out.length >= want) break;
    if (seen.has(String(b.company).toLowerCase())) continue;
    const site = b.sites[0];
    const host = `${b.board_token}.${b.wd}.myworkdayjobs.com`;
    await sleep(gapMs);
    try {
      const res = await fetch(`https://${host}/wday/cxs/${b.board_token}/${site}/jobs`, {
        method: "POST", headers: { ...UA, "content-type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "" }),
      });
      if (res.status !== 200) continue;
      const jobs = ((await res.json()).jobPostings || []).filter((j) => j && j.externalPath);
      if (!jobs.length) continue;
      const p = jobs[Math.floor(rand() * jobs.length)];
      out.push({ id: `workday-${b.board_token}-${String(p.externalPath).split("/").pop()}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 160),
        family: "workday", company: b.company, url: `https://${host}/en-US/${site}${p.externalPath}` });
      seen.add(String(b.company).toLowerCase());
    } catch { /* a tenant that does not answer is skipped */ }
  }
  return out;
}
async function discover(outFile, seed) {
  const { pick } = require(path.join(ROOT, "scripts/career/pick-form-sources.cjs"));
  const directory = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/board-directory.json"), "utf8"));
  const exclude = sealedCompanies();
  const { workday, ...rest } = WANT;
  const four = await pick(directory, rest, fetch, 1500, { seed, exclude });
  const wd = await pickWorkday(directory, workday, seed, exclude);
  const all = [...four, ...wd].map((s) => ({ id: s.id, family: s.family, company: s.company, url: s.url }));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ seed, excluded_sealed_employers: new Set(exclude.map((c) => c.toLowerCase())).size, postings: all }, null, 2) + "\n");
  const by = all.reduce((m, s) => ((m[s.family] = (m[s.family] || 0) + 1), m), {});
  console.log(`DISCOVERED ${JSON.stringify(by)}`);
}

// ---------- signals ----------
// Third-party gate vendors, by the URLs a page requests.
const VENDOR = [
  ["recaptcha", /(google\.com|recaptcha\.net)\/recaptcha\/|gstatic\.com\/recaptcha\//i],
  ["hcaptcha", /(^|\.)hcaptcha\.com\//i],
  ["turnstile", /challenges\.cloudflare\.com\/(turnstile|cdn-cgi\/challenge-platform)/i],
  ["arkose", /arkoselabs\.com|funcaptcha\.com/i],
  ["datadome", /datadome\.co|captcha-delivery\.com/i],
  ["perimeterx", /px-cdn\.net|px-cloud\.net|perimeterx\.net|pxchk\.net|\/_px\d?\//i],
  ["akamai_bot", /\/akam\/\d+\/|\/_bm\/|akamaihd\.net\/.*sensor/i],
  ["cloudflare_bot", /\/cdn-cgi\/challenge-platform\//i],
  ["imperva", /_Incapsula_Resource|incapsula\.com/i],
];
const CAPTCHA = ["recaptcha", "hcaptcha", "turnstile", "arkose"];
const EMAIL_CODE = [
  ["verification_code", /verification code/i],
  ["security_code", /security code/i],
  ["code_sent", /(we('ve| have)? sent (you )?(a|an|the) ([\w-]+ )?code|code (was |has been )?sent to)/i],
  ["verify_email", /verify your email/i],
  ["one_time_code", /one[- ]time (pass)?code/i],
  ["enter_code", /enter the ([\w-]+ ){0,2}code/i],
];
const BUNDLE_CAPTCHA = [["recaptcha", /recaptcha/i], ["hcaptcha", /hcaptcha/i], ["turnstile", /turnstile/i], ["arkose", /arkoselabs|funcaptcha/i]];
const ATS_HOSTS = {
  greenhouse: ["greenhouse.io"], lever: ["lever.co"], ashby: ["ashbyhq.com", "ashbyprd.com"],
  smartrecruiters: ["smartrecruiters.com"], workday: ["myworkdayjobs.com", "myworkday.com", "myworkdaysite.com", "workday.com", "myworkdaycdn.com"],
};
const ownHost = (family, host) => (ATS_HOSTS[family] || []).some((h) => host === h || host.endsWith("." + h));
const snippet = (s, re) => {
  const m = re.exec(s);
  return m ? s.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50).replace(/\s+/g, " ") : null;
};

// Read in every frame: inputs, file inputs (and whether the resume one is required), captcha widgets, globals.
function frameProbe() {
  const doc = globalThis.document, w = globalThis;
  const text = (e) => (e ? (e.innerText || e.textContent || "") : "").replace(/\s+/g, " ").trim().slice(0, 200);
  const controls = Array.from(doc.querySelectorAll("input,select,textarea")).filter((e) => !["hidden", "submit", "button", "image", "reset"].includes((e.type || "").toLowerCase()));
  const files = controls.filter((e) => (e.type || "").toLowerCase() === "file");
  // A file input is required when it says so, or its question (nearest label-like text, 6 ancestors up) ends in * / ✱.
  const fileInfo = files.map((e) => {
    let label = "";
    for (let a = e.parentElement, i = 0; a && i < 6 && !label; a = a.parentElement, i++) {
      const l = Array.from(a.querySelectorAll('label, legend, [class*="label" i], [class*="question" i], [class*="title" i]')).find((x) => !x.querySelector("input,select,textarea") && text(x));
      if (l) label = text(l);
    }
    const lab = e.id && doc.querySelector(`label[for="${CSS.escape(e.id)}"]`);
    if (lab && text(lab)) label = text(lab);
    return { name: e.name || e.id || "", label: label.slice(0, 120), required: !!(e.required || e.getAttribute("aria-required") === "true" || /[*✱]|\(required\)/i.test(label)) };
  });
  const attrs = (sel) => Array.from(doc.querySelectorAll(sel)).slice(0, 5).map((e) => ({ tag: e.tagName.toLowerCase(), cls: String(e.className || "").slice(0, 60),
    size: e.getAttribute("data-size") || null, sitekey: !!e.getAttribute("data-sitekey"), src: (e.getAttribute("src") || "").slice(0, 200) }));
  const anchors = Array.from(doc.querySelectorAll("a[href], button")).map((a) => ({ text: text(a).slice(0, 60), href: a.getAttribute("href") || "", auto: a.getAttribute("data-automation-id") || "" }));
  const bodyText = text(doc.body ? { innerText: (doc.body.innerText || "").slice(0, 20000) } : null);
  return {
    url: doc.location.href, title: doc.title.slice(0, 120),
    forms: doc.querySelectorAll("form").length, inputs: controls.length, files: fileInfo,
    passwords: controls.filter((e) => (e.type || "").toLowerCase() === "password").length,
    widgets: {
      recaptcha: attrs('.g-recaptcha, [class*="g-recaptcha"], iframe[src*="/recaptcha/"], .grecaptcha-badge'),
      sitekey: attrs("[data-sitekey]"),
      hcaptcha: attrs('.h-captcha, iframe[src*="hcaptcha"]'),
      turnstile: attrs('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]'),
      arkose: attrs('iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], #FunCaptcha'),
      datadome: attrs('iframe[src*="captcha-delivery.com"]'),
      perimeterx: attrs('#px-captcha, [id^="px-captcha"]'),
    },
    globals: {
      grecaptcha: typeof w.grecaptcha !== "undefined", grecaptcha_enterprise: !!(w.grecaptcha && w.grecaptcha.enterprise),
      hcaptcha: typeof w.hcaptcha !== "undefined", turnstile: typeof w.turnstile !== "undefined",
      arkose: typeof w.ArkoseEnforcement !== "undefined" || typeof w.arkoseLabsClientApi !== "undefined",
      datadome: typeof w.ddjskey !== "undefined" || typeof w.dataDomeOptions !== "undefined", perimeterx: typeof w._pxAppId !== "undefined",
    },
    apply_links: anchors.filter((a) => /apply/i.test(a.text + " " + a.href + " " + a.auto)).slice(0, 8),
    signin_text: /sign in to (apply|continue)|create (an |your )?account to apply|log ?in to apply|already have an account/i.test(bodyText),
    body_head: bodyText.slice(0, 400),
  };
}

// The block/challenge page a bot manager serves instead of the form.
function blockKind(status, title, html) {
  if (/<title>\s*Just a moment\.\.\.|cf-chl-|cf_chl_opt|Attention Required! \| Cloudflare/i.test(html) || /^Just a moment/i.test(title)) return "cloudflare_challenge";
  if (/captcha-delivery\.com|geo\.captcha-delivery/i.test(html) && status >= 400) return "datadome";
  if (/px-captcha|Press &amp; Hold|Press & Hold/i.test(html) && status >= 400) return "perimeterx";
  if (/Access Denied/i.test(title) && /Reference #|errors\.edgesuite\.net/i.test(html)) return "akamai";
  if (/Incapsula incident|_Incapsula_Resource/i.test(html) && status >= 400) return "imperva";
  if (status === 403 || status === 429) return `http_${status}`;
  return null;
}

// ---------- census ----------
function playwright() {
  for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
    if (!id) continue;
    try {
      return require(id);
    } catch { /* next */ }
  }
  throw Error("PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH");
}
const nextAt = new Map();
async function hostTurn(host, gapMs) {
  const now = Date.now(), at = Math.max(now, nextAt.get(host) || 0);
  nextAt.set(host, at + gapMs);
  if (at > now) await sleep(at - now);
}

async function probeOne(browser, s, opts) {
  const r = { id: s.id, ats: s.family, company: s.company, url: s.url, checked_at: new Date().toISOString() };
  const u0 = new URL(s.url);
  if ((u0.protocol !== "https:" && u0.hostname !== "127.0.0.1") || NEVER.test(u0.hostname)) return { ...r, error: "refused_url" };
  const context = await browser.newContext();
  const page = await context.newPage();
  const aborted = [], vendorHits = {}, bundle = { captcha: {}, email_code: {} };
  let bundleBytes = 0;
  await context.route("**/*", (route) => {
    const req = route.request();
    let host = "";
    try { host = new URL(req.url()).hostname; } catch { /* data: etc. */ }
    if (NEVER.test(host) || !["GET", "HEAD"].includes(req.method())) {
      if (aborted.length < 40) aborted.push({ method: req.method(), host, path: (() => { try { return new URL(req.url()).pathname.slice(0, 80); } catch { return ""; } })() });
      else aborted.push(null);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  page.on("request", (req) => {
    const url = req.url();
    for (const [k, re] of VENDOR) if (re.test(url)) (vendorHits[k] ||= []).length < 8 && vendorHits[k].push(url.slice(0, 300));
  });
  // The ATS's own HTML and scripts, read for captcha code paths and emailed-code wording (cheap: 25 MB a page at most).
  const reads = [];
  page.on("response", (res) => {
    const req = res.request(), type = req.resourceType();
    if (!["document", "script"].includes(type)) return;
    let host = "";
    try { host = new URL(res.url()).hostname; } catch { return; }
    if (!ownHost(s.family, host) && host !== new URL(page.url() || s.url).hostname) return;
    reads.push(res.text().then((t) => {
      if (bundleBytes > 25e6 || t.length > 8e6) return;
      bundleBytes += t.length;
      for (const [k, re] of BUNDLE_CAPTCHA) if (!bundle.captcha[k] && re.test(t)) bundle.captcha[k] = { in: type, url: res.url().slice(0, 200), at: snippet(t, re) };
      for (const [k, re] of EMAIL_CODE) if (!bundle.email_code[k] && re.test(t)) bundle.email_code[k] = { in: type, url: res.url().slice(0, 200), at: snippet(t, re) };
    }).catch(() => {}));
  });
  await hostTurn(u0.hostname, opts.gapMs);
  const t0 = Date.now();
  try {
    const res = await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    r.http_status = res ? res.status() : null;
    r.load_ms = Date.now() - t0;
    const sel = s.family === "workday" ? '[data-automation-id="adventureButton"], a[href*="/apply"], input[type="file"]' : 'input[type="file"], form, input[type="email"]';
    await page.waitForSelector(sel, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await sleep(3000); // a captcha script loaded lazily after the form renders
    r.form_ready_ms = Date.now() - t0;
    r.final_url = page.url();
    const frames = [];
    for (const f of page.frames()) {
      try { frames.push(await f.evaluate(frameProbe)); } catch { /* a detached or cross-origin frame that refused */ }
    }
    const html = await page.content();
    const main = frames[0] || {};
    const best = frames.reduce((a, b) => (b.inputs > (a ? a.inputs : -1) ? b : a), null) || {};
    r.title = main.title;
    r.inputs = best.inputs || 0;
    r.forms = best.forms || 0;
    r.form_frame = best.url && best.url !== main.url ? best.url.slice(0, 200) : null;
    r.file_inputs = (best.files || []).length;
    r.resume_required = (best.files || []).some((f) => f.required && /resume|cv|curriculum/i.test(f.label + " " + f.name));
    r.files = best.files || [];
    r.form_found = r.file_inputs > 0 || r.inputs >= 3;
    // Gates.
    const widgets = {}, globals = {};
    for (const f of frames) {
      for (const [k, v] of Object.entries(f.widgets || {})) if (v.length) (widgets[k] ||= []).push(...v);
      for (const [k, v] of Object.entries(f.globals || {})) globals[k] = globals[k] || v;
    }
    const rc = vendorHits.recaptcha || [];
    const anchorSizes = rc.filter((x) => /\/anchor\?/.test(x)).map((x) => (new URL(x).searchParams.get("size") || "").toLowerCase());
    const renderParam = rc.map((x) => { try { return new URL(x).searchParams.get("render"); } catch { return null; } }).find((x) => x && !/^(explicit|onload)$/i.test(x));
    const rcWidgets = (widgets.recaptcha || []).concat(widgets.sitekey || []).filter((w) => /recaptcha/i.test(w.cls + w.src) || w.sitekey);
    const recaptcha = rc.length > 0 || globals.grecaptcha || rcWidgets.length > 0;
    const rcMode = !recaptcha ? null
      : anchorSizes.some((z) => z === "normal" || z === "compact") || rcWidgets.some((w) => /g-recaptcha/.test(w.cls) && w.size && w.size !== "invisible") ? "v2_visible"
      : renderParam ? "v3_score"
      : anchorSizes.includes("invisible") || rcWidgets.some((w) => w.size === "invisible") || (widgets.recaptcha || []).some((w) => /grecaptcha-badge/.test(w.cls)) ? "invisible"
      : "loaded_mode_unknown";
    const hc = (vendorHits.hcaptcha || []).length > 0 || globals.hcaptcha || (widgets.hcaptcha || []).length > 0;
    const hcFrames = (widgets.hcaptcha || []).map((w) => w.src + " " + (w.size || ""));
    r.gates = {
      recaptcha: recaptcha ? { mode: rcMode, enterprise: rc.some((x) => /enterprise/.test(x)) || globals.grecaptcha_enterprise, render: renderParam ? "sitekey" : null, anchor_sizes: anchorSizes, urls: rc.slice(0, 3) } : null,
      hcaptcha: hc ? { mode: (widgets.hcaptcha || []).some((w) => w.size === "invisible") || hcFrames.some((x) => /size=invisible|invisible/.test(x)) ? "invisible" : hcFrames.some((x) => /frame=checkbox/.test(x)) ? "checkbox_frame" : "loaded_mode_unknown", urls: (vendorHits.hcaptcha || []).slice(0, 3), widgets: widgets.hcaptcha || [] } : null,
      turnstile: (vendorHits.turnstile || []).length || globals.turnstile || (widgets.turnstile || []).length ? { urls: (vendorHits.turnstile || []).slice(0, 3) } : null,
      arkose: (vendorHits.arkose || []).length || globals.arkose || (widgets.arkose || []).length ? { urls: (vendorHits.arkose || []).slice(0, 3) } : null,
    };
    r.any_captcha = CAPTCHA.some((k) => r.gates[k]);
    r.captcha_visible = (r.gates.recaptcha && r.gates.recaptcha.mode === "v2_visible") || !!(r.gates.hcaptcha && r.gates.hcaptcha.mode === "checkbox_frame") || false;
    r.bot_management = Object.fromEntries(["datadome", "perimeterx", "akamai_bot", "cloudflare_bot", "imperva"].filter((k) => (vendorHits[k] || []).length || globals[k] || (widgets[k] || []).length).map((k) => [k, (vendorHits[k] || []).slice(0, 2)]));
    r.block = blockKind(r.http_status || 0, main.title || "", html.slice(0, 200000));
    if (r.block && r.form_found && /^http_/.test(r.block)) r.block = null; // a 403/429 status that still served the form
    // Sign-in wall: the page itself asks for an account (a password field, or wording that applying needs a sign-in).
    r.signin_wall = frames.some((f) => f.passwords > 0 || f.signin_text);
    if (s.family === "workday") r.apply_links = main.apply_links || [];
    await Promise.race([Promise.allSettled(reads), sleep(5000)]);
    const pageText = html.slice(0, 3e6);
    r.email_code_hint = {
      page: Object.fromEntries(EMAIL_CODE.filter(([, re]) => re.test(pageText)).map(([k, re]) => [k, snippet(pageText, re)])),
      bundle: bundle.email_code,
    };
    r.bundle_captcha_mentions = bundle.captcha;
    r.body_head = r.form_found ? undefined : main.body_head;
  } catch (e) {
    r.load_ms = r.load_ms || Date.now() - t0;
    r.error = String(e && e.message || e).split("\n")[0].slice(0, 200);
  }
  r.non_get_aborted = aborted.length;
  r.aborted_sample = aborted.filter(Boolean).slice(0, 12);
  await context.close().catch(() => {});
  return r;
}

async function census(inFile, outFile, opts = {}) {
  const pw = playwright();
  const doc = JSON.parse(fs.readFileSync(inFile, "utf8"));
  const list = Array.isArray(doc) ? doc : doc.postings;
  // Interleave the ATSes, so the two pages open at once are mostly on different hosts.
  const byFam = {};
  for (const s of list) (byFam[s.family] ||= []).push(s);
  const queue = [];
  for (let i = 0; queue.length < list.length; i++) for (const f of Object.keys(byFam)) if (byFam[f][i]) queue.push(byFam[f][i]);
  const browser = await pw.chromium.launch({ headless: true });
  const results = new Array(queue.length);
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const i = next++;
      const r = await probeOne(browser, queue[i], { gapMs: opts.gapMs ?? 1500 });
      results[i] = r;
      console.log("CENSUS " + JSON.stringify({ i, ats: r.ats, company: r.company, http: r.http_status ?? null, ms: r.load_ms, inputs: r.inputs ?? null, form: !!r.form_found,
        captcha: r.any_captcha ? CAPTCHA.filter((k) => r.gates[k]).map((k) => k + (r.gates[k].mode ? ":" + r.gates[k].mode : "")).join(",") : null,
        block: r.block || null, aborted: r.non_get_aborted, err: r.error || null }));
    }
  };
  try {
    await Promise.all([worker(), worker()]);
  } finally {
    await browser.close();
  }
  const out = { generated_at: new Date().toISOString(), source: opts.label || null, method: "read-only page loads; every non-GET/HEAD request aborted; nothing clicked or typed", seed: doc.seed ?? null, results };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
  return out;
}

// ---------- summary ----------
function summarize(doc, label) {
  const rows = doc.results;
  const pct = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : "0/0");
  const fams = ["greenhouse", "lever", "ashby", "smartrecruiters", "workday"].filter((f) => rows.some((r) => r.ats === f));
  const L = [`# Gate census ${label || ""}`.trim(), "", `Generated ${doc.generated_at}. ${doc.method}. Seed ${doc.seed}.`, "",
    "Captcha = a captcha vendor's script, widget or global present on the loaded application page (before anything is typed or submitted).",
    "Bundle mention = the ATS's own HTML/JS names the vendor (a code path exists; it may never run for this employer).", "",
    "| ATS | postings | loaded 2xx | forms found | any captcha (of forms) | reCAPTCHA v2 visible | reCAPTCHA invisible/v3 | reCAPTCHA mode unknown | hCaptcha | Turnstile | Arkose | bundle names a captcha | challenge/blocked | sign-in wall | resume required (of forms) | emailed-code wording | errors |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"];
  const line = (name, rs) => {
    const forms = rs.filter((r) => r.form_found);
    const rc = (m) => forms.filter((r) => r.gates && r.gates.recaptcha && m.includes(r.gates.recaptcha.mode)).length;
    const v = (k) => forms.filter((r) => r.gates && r.gates[k]).length;
    return `| ${name} | ${rs.length} | ${rs.filter((r) => r.http_status >= 200 && r.http_status < 300).length} | ${pct(forms.length, rs.length)} | ${pct(forms.filter((r) => r.any_captcha).length, forms.length)} | ${rc(["v2_visible"])} | ${rc(["invisible", "v3_score"])} | ${rc(["loaded_mode_unknown"])} | ${v("hcaptcha")} | ${v("turnstile")} | ${v("arkose")} | ${pct(rs.filter((r) => r.bundle_captcha_mentions && Object.keys(r.bundle_captcha_mentions).length).length, rs.length)} | ${pct(rs.filter((r) => r.block).length, rs.length)} | ${pct(rs.filter((r) => r.signin_wall).length, rs.length)} | ${pct(forms.filter((r) => r.resume_required).length, forms.length)} | ${pct(rs.filter((r) => r.email_code_hint && (Object.keys(r.email_code_hint.page).length || Object.keys(r.email_code_hint.bundle).length)).length, rs.length)} | ${rs.filter((r) => r.error).length} |`;
  };
  for (const f of fams) L.push(line(f, rows.filter((r) => r.ats === f)));
  L.push(line("**all**", rows));
  L.push("", "## Detail", "");
  for (const f of fams) {
    const rs = rows.filter((r) => r.ats === f);
    const tally = (xs) => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
    L.push(`### ${f}`, "",
      `- captcha kinds on forms: ${tally(rs.filter((r) => r.form_found && r.any_captcha).flatMap((r) => CAPTCHA.filter((k) => r.gates[k]).map((k) => k + (r.gates[k].mode ? ":" + r.gates[k].mode : "") + (r.gates[k].enterprise ? ":enterprise" : ""))))}`,
      `- bundle captcha mentions: ${tally(rs.flatMap((r) => Object.keys(r.bundle_captcha_mentions || {})))}`,
      `- passive bot management loaded: ${tally(rs.flatMap((r) => Object.keys(r.bot_management || {})))}`,
      `- block kinds: ${tally(rs.filter((r) => r.block).map((r) => r.block))}`,
      `- emailed-code wording (page / bundle): ${tally(rs.flatMap((r) => Object.keys((r.email_code_hint || {}).page || {}).map((k) => "page:" + k).concat(Object.keys((r.email_code_hint || {}).bundle || {}).map((k) => "bundle:" + k))))}`,
      `- non-GET requests aborted (pages with any): ${rs.filter((r) => r.non_get_aborted > 0).length}; top: ${tally(rs.flatMap((r) => (r.aborted_sample || []).map((a) => a.method + " " + a.host)).slice(0, 400))}`,
      `- errors: ${tally(rs.filter((r) => r.error).map((r) => r.error.slice(0, 60)))}`,
      ...(f === "workday" ? [`- apply link targets: ${tally(rs.flatMap((r) => (r.apply_links || []).map((a) => (a.href || "(button)").replace(/^https?:\/\/[^/]+/, "").replace(/\/job\/.*?(\/apply.*)?$/, "/job/…$1"))))}`] : []),
      "");
  }
  return L.join("\n") + "\n";
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
    const seed = Number(flag("--seed") ?? 21), label = flag("--label");
    const [cmd, a, b, c] = args;
    if (cmd === "discover") return discover(a, seed);
    if (cmd === "census") {
      const out = await census(a, b, { label });
      const forms = out.results.filter((r) => r.form_found);
      console.log(`CENSUS_DONE postings=${out.results.length} forms=${forms.length} captcha_on_forms=${forms.filter((r) => r.any_captcha).length} blocked=${out.results.filter((r) => r.block).length}`);
      return;
    }
    if (cmd === "summary") {
      const md = summarize(JSON.parse(fs.readFileSync(a, "utf8")), c || label);
      fs.writeFileSync(b, md);
      console.log(md);
      return;
    }
    throw Error("usage: gate-census.cjs discover|census|summary ...");
  })().catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });
}
module.exports = { blockKind, summarize, frameProbe, VENDOR };
