#!/usr/bin/env node
// WO-041: are the sources behind the firm guide and the interview patterns still there?
//
// For every URL in packages/career-data/firm-guide.json and packages/career-data/interview-patterns.json this opens the
// page once, politely, and records what came back: the HTTP status, the final URL after redirects and when it was
// fetched. Each URL is then live, redirected, gone (404 or 410), blocked (401, 403, 429 or a bot-check page) or error
// (anything else, a timeout included). For the firm guide it also lists every date a timeline or requirement states
// (read by 134 statedDates, the same reader the chat answer uses) and whether that date is past on the run date.
//
// Politeness, and what it never does:
//   - one request per host at a time, and at least 1 second between the end of one request to a host and the next;
//   - an honest User-Agent naming this repository, a timeout, GET only, no cookies, no login, no proxy, no stealth;
//   - LinkedIn and Indeed are never fetched, not even through a redirect: they are reported as skipped;
//   - a bot check (captcha) is reported as blocked and never solved.
// It never edits the data files. The report is for a person to read; source-checks.json is written only when a person
// asks for it with --write-checks (CI does not).
//
// Usage:
//   node scripts/career/check-sources.cjs --out report.json [--checks-out checks.json] [--summary summary.md]
//                                         [--now 2026-10-20] [--timeout-ms 20000] [--hosts-at-once 4]
//   node scripts/career/check-sources.cjs --from-report report.json --write-checks packages/career-data/source-checks.json
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const REPO = "srikanthvishnu90-sketch/upmore-agent";
const USER_AGENT = `UpmoreTrainee-source-check/1.0 (+https://github.com/${process.env.GITHUB_REPOSITORY || REPO})`;
const MIN_GAP_MS = 1000;
const TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 5;
const BODY_LIMIT = 256 * 1024; // enough to see a bot-check page; the rest is never read
const FILES = { guide: "packages/career-data/firm-guide.json", patterns: "packages/career-data/interview-patterns.json" };

// LinkedIn and Indeed are never automated (owner rule), so their pages are never fetched.
const NEVER = [/(^|\.)linkedin\.com$/i, /(^|\.)lnkd\.in$/i, /(^|\.)indeed\.com$/i, /(^|\.)indeed\.[a-z]{2,3}(\.[a-z]{2})?$/i];
function neverFetch(host) { return NEVER.some((re) => re.test(String(host || ""))); }
function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }

// A bot-check page: Cloudflare's challenge, PerimeterX, Incapsula, DataDome, Akamai and the generic "verify you are
// human". A form's reCAPTCHA script on an ordinary 200 page is not one.
const BOT_CHECK = /cf-chl-|challenge-platform|<title>\s*(?:just a moment|attention required)|px-captcha|_incapsula_resource|captcha-delivery\.com|geo\.captcha|verify (?:that )?you are (?:a )?human|are you a robot|access denied[^<]{0,80}reference #/i;

// Every URL in the two files, each with where it is used.
function collectUrls(guide, patterns) {
  const map = new Map();
  const add = (url, file, where) => {
    const u = String(url || "").trim();
    if (!/^https?:\/\//i.test(u)) return;
    if (!map.has(u)) map.set(u, { url: u, used_by: [] });
    map.get(u).used_by.push({ file, where });
  };
  for (const f of (guide && guide.firms) || []) {
    for (const p of f.programs || []) add(p.source_url, FILES.guide, `${f.firm_id} program: ${p.name}`);
    for (const r of f.requirements || []) add(r.source_url, FILES.guide, `${f.firm_id} requirement ${r.id}`);
    for (const b of f.base_rates || []) add(b.source_url, FILES.guide, `${f.firm_id} base rate ${b.id}`);
    for (const n of f.not_required || []) add(n.source_url, FILES.guide, `${f.firm_id} not required`);
  }
  for (const f of (patterns && patterns.firms) || []) {
    (f.patterns || []).forEach((p, i) => add(p.source_url, FILES.patterns, `${f.id} patterns[${i}]`));
    (f.questions || []).forEach((q, i) => add(q.source_url, FILES.patterns, `${f.id} questions[${i}]`));
  }
  return [...map.values()];
}

// One request at a time per host, and at least MIN_GAP_MS from the end of one to the start of the next.
function hostGate({ minGapMs = MIN_GAP_MS, sleep, clock }) {
  const last = new Map(), tail = new Map();
  return (host, fn) => {
    const run = (tail.get(host) || Promise.resolve()).then(async () => {
      const wait = (last.has(host) ? last.get(host) + minGapMs : -Infinity) - clock();
      if (wait > 0) await sleep(wait);
      try { return await fn(); } finally { last.set(host, clock()); }
    });
    tail.set(host, run.catch(() => undefined));
    return run;
  };
}

async function readSome(res) {
  if (!res.body || typeof res.body.getReader !== "function") { try { return (await res.text()).slice(0, BODY_LIMIT); } catch { return ""; } }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  try {
    while (text.length < BODY_LIMIT) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); }
  } catch { /* a cut-off body is still read as far as it came */ }
  try { await reader.cancel(); } catch { /* already closed */ }
  return text;
}

// What one final answer means.
function classify(httpStatus, body, redirected) {
  if (httpStatus === 404 || httpStatus === 410) return "gone";
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return "blocked";
  if (BOT_CHECK.test(body || "")) return "blocked";
  if (httpStatus >= 200 && httpStatus < 300) return redirected ? "redirected" : "live";
  return "error";
}
const same = (a, b) => String(a).replace(/\/+$/, "") === String(b).replace(/\/+$/, "");

async function checkUrl(url, { fetchImpl, gate, timeoutMs = TIMEOUT_MS, now = () => new Date() }) {
  const hops = [];
  let cur = url;
  const done = (o) => ({ url, status: o.status, http_status: o.http_status ?? null, final_url: o.final_url ?? cur, redirects: hops, fetched_at: now().toISOString(), ...(o.note ? { note: o.note } : {}) });
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const host = hostOf(cur);
    if (!host || !/^https?:$/.test(new URL(cur).protocol)) return done({ status: "error", note: "not an http(s) URL" });
    if (neverFetch(host)) return done({ status: "skipped", note: `${host} is never fetched (LinkedIn and Indeed are not automated)` });
    let res, body = "";
    try {
      res = await gate(host, async () => {
        const r = await fetchImpl(cur, {
          method: "GET", redirect: "manual", credentials: "omit",
          headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5", "accept-language": "en" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        body = r.status >= 300 && r.status < 400 ? "" : await readSome(r);
        return r;
      });
    } catch (e) {
      const why = e && (e.name === "TimeoutError" || e.name === "AbortError") ? `timed out after ${timeoutMs} ms` : String((e && e.cause && e.cause.code) || (e && e.message) || e);
      return done({ status: "error", note: why });
    }
    const loc = res.headers && typeof res.headers.get === "function" ? res.headers.get("location") : null;
    if (res.status >= 300 && res.status < 400 && loc) {
      let next;
      try { next = new URL(loc, cur).href; } catch { return done({ status: "error", http_status: res.status, note: "a redirect to an unreadable location" }); }
      hops.push({ from: cur, http_status: res.status, to: next });
      cur = next;
      continue;
    }
    const redirected = hops.length > 0 && !same(cur, url);
    return done({ status: classify(res.status, body, redirected), http_status: res.status, final_url: cur });
  }
  return done({ status: "error", note: `more than ${MAX_REDIRECTS} redirects` });
}

// Every date the firm guide states, and whether it is past on the run date (134 statedDates, as the chat answer reads).
function firmDates(guide, runDate, paths) {
  const P = paths || require(path.join(ROOT, "packages/domain/134-career-paths.js"));
  const today = runDate.toISOString().slice(0, 10);
  const out = [];
  for (const f of (guide && guide.firms) || []) {
    const rows = [
      ...(f.programs || []).map((p) => ({ where: `program: ${p.name}`, text: p.timeline, url: p.source_url })),
      ...(f.requirements || []).map((r) => ({ where: `requirement ${r.id}`, text: r.text, url: r.source_url })),
    ];
    for (const r of rows) for (const d of P.statedDates(r.text || "")) out.push({ firm_id: f.firm_id, where: r.where, source_url: r.url, said: d.said, date: d.date, kind: d.kind, past: d.date < today });
  }
  return out;
}

const STATUSES = ["live", "redirected", "gone", "blocked", "error", "skipped"];
async function runChecks({ guide, patterns, fetchImpl, now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), clock = () => Date.now(), timeoutMs = TIMEOUT_MS, hostsAtOnce = 4, minGapMs = MIN_GAP_MS, paths } = {}) {
  const runDate = now();
  const urls = collectUrls(guide, patterns);
  const gate = hostGate({ minGapMs, sleep, clock });
  // Hosts are worked through a few at a time; each host's URLs go one after another through the gate.
  const byHost = new Map();
  for (const u of urls) { const h = hostOf(u.url); if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push(u); }
  const queue = [...byHost.values()];
  const results = new Map();
  const worker = async () => {
    for (let list = queue.shift(); list; list = queue.shift()) {
      for (const u of list) results.set(u.url, { ...(await checkUrl(u.url, { fetchImpl, gate, timeoutMs, now })), used_by: u.used_by });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, hostsAtOnce) }, worker));
  const rows = urls.map((u) => results.get(u.url));
  const summary = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const dates = firmDates(guide, runDate, paths);
  return {
    report: "source-check", version: 1, run_at: runDate.toISOString(), user_agent: USER_AGENT,
    files: Object.values(FILES), total: rows.length, summary,
    dates_past: dates.filter((d) => d.past).length, firm_dates: dates, urls: rows,
  };
}

// The small file the chat bundle reads (packages/career-data/source-checks.json): each URL's status, HTTP status, final
// URL and when it was fetched. Nothing else.
function checksFile(report) {
  return {
    dataset_id: "source-checks",
    about: "WO-041: the last page check of every source URL in firm-guide.json and interview-patterns.json, made by scripts/career/check-sources.cjs (weekly in CI, .github/workflows/source-freshness.yml) and copied here by a person from the report. A URL missing here, or a file with ran false, has not been opened by any check: the chat calls it unverified.",
    ran: true, run_at: report.run_at, files: report.files, summary: report.summary,
    urls: Object.fromEntries(report.urls.map((r) => [r.url, { status: r.status, http_status: r.http_status, final_url: r.final_url, fetched_at: r.fetched_at }])),
  };
}

// The report in a few lines for a person (the CI job summary).
function summaryText(report) {
  const s = report.summary;
  const lines = [
    `Source check, ${report.run_at.slice(0, 10)}: ${report.total} URLs. live ${s.live}, redirected ${s.redirected}, gone ${s.gone}, blocked ${s.blocked}, error ${s.error}, skipped (LinkedIn/Indeed) ${s.skipped}.`,
    `Firm-guide dates already past on the run date: ${report.dates_past} of ${report.firm_dates.length}.`,
  ];
  for (const r of report.urls.filter((x) => x.status !== "live")) lines.push(`- ${r.status}${r.http_status ? ` (${r.http_status})` : ""}: ${r.url}${r.status === "redirected" ? ` -> ${r.final_url}` : ""}${r.note ? ` (${r.note})` : ""}`);
  for (const d of report.firm_dates.filter((x) => x.past)) lines.push(`- past ${d.kind}: ${d.firm_id}, ${d.where}: ${d.said}`);
  lines.push("Nothing was edited. To use this check in the chat, a person copies it into packages/career-data/source-checks.json (--from-report ... --write-checks ...) and rebuilds the bundles.");
  return lines.join("\n");
}

function arg(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }
async function main(argv) {
  const write = (file, obj) => fs.writeFileSync(file, typeof obj === "string" ? obj + "\n" : JSON.stringify(obj, null, 1) + "\n");
  const fromReport = arg(argv, "--from-report");
  if (fromReport) {
    const target = arg(argv, "--write-checks");
    if (!target) throw new Error("--from-report needs --write-checks <file>");
    write(target, checksFile(JSON.parse(fs.readFileSync(fromReport, "utf8"))));
    console.log(`wrote ${target}`);
    return;
  }
  const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
  const at = arg(argv, "--now");
  const report = await runChecks({
    guide: readJson(FILES.guide), patterns: readJson(FILES.patterns), fetchImpl: globalThis.fetch,
    now: () => (at ? new Date(`${at}T00:00:00Z`) : new Date()),
    timeoutMs: Number(arg(argv, "--timeout-ms")) || TIMEOUT_MS, hostsAtOnce: Number(arg(argv, "--hosts-at-once")) || 4,
  });
  const out = arg(argv, "--out") || "source-check-report.json";
  write(out, report);
  if (arg(argv, "--checks-out")) write(arg(argv, "--checks-out"), checksFile(report));
  if (arg(argv, "--write-checks")) write(arg(argv, "--write-checks"), checksFile(report));
  const text = summaryText(report);
  if (arg(argv, "--summary")) fs.appendFileSync(arg(argv, "--summary"), text + "\n");
  console.log(text);
  console.log(`report: ${out}`);
}

module.exports = { USER_AGENT, MIN_GAP_MS, NEVER, neverFetch, collectUrls, hostGate, classify, checkUrl, firmDates, runChecks, checksFile, summaryText, FILES };
if (require.main === module) main(process.argv.slice(2)).catch((e) => { console.error(e && e.stack || e); process.exit(1); });
