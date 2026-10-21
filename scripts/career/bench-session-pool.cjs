"use strict";
/* bench-session-pool.cjs — Package C micro-benchmarks (2026-10-21).
   Local test pages ONLY (127.0.0.1, served by this script). No external
   navigation, no submissions. Short by design; host load is recorded with
   every phase so contention from other lanes stays visible.

   Phases (argv[2], default "all"):
     micro  cold launch -> usable page (n=10); warm-browser new-context
            cost (n=20); warm-context new-page cost (n=20)
     conc   RSS/CPU at 1/2/4/8 concurrent contexts on one warm browser
     fifty  simulated 50-drive run, three modes:
              launch  = launch-per-drive (module 150's serial semantics:
                        last board close shuts the browser down)
              pool1   = session pool, serial drives, fresh context each
              pool4   = session pool, 4 concurrent leases
   Env: BENCH_DRIVES (default 50), BENCH_REPS overrides for micro counts.
   Output: one JSON object on stdout; also written to argv[3] if given. */
const http = require("node:http");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

process.env.UPMORE_CHROMIUM_SANDBOX = process.env.UPMORE_CHROMIUM_SANDBOX || "off";

function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  tries.push(path.join(__dirname, "..", "..", "..", "sporve-agent-clone", "node_modules", "playwright"));
  tries.push("/home/hatch/workspace/sporve-agent-clone/node_modules/playwright");
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error("playwright unresolvable");
}
const pw = resolvePlaywright();
const { createSessionPool } = require(path.join(__dirname, "..", "..", "workers", "career-browser", "session-pool-prototype.cjs"));

const FORM_HTML = `<!doctype html><html><head><title>Test Application</title></head><body>
<h1>Software Engineering Intern — Test Posting</h1>
<form id="application">
<label>First name <input name="first_name" type="text"></label>
<label>Last name <input name="last_name" type="text"></label>
<label>Email <input name="email" type="email"></label>
<label>Phone <input name="phone" type="tel"></label>
<label>City <input name="city" type="text"></label>
<label>School <input name="school" type="text"></label>
<label>Graduation year <select name="grad"><option value="">Select</option><option>2027</option><option>2028</option><option>2029</option></select></label>
<label>Work authorization <input type="radio" name="auth" value="yes"> Yes <input type="radio" name="auth" value="no"> No</label>
<label>Cover note <textarea name="cover" rows="5"></textarea></label>
<label>LinkedIn <input name="linkedin" type="url"></label>
<label>GitHub <input name="github" type="url"></label>
<label>Consent <input type="checkbox" name="consent"></label>
<button type="button" id="review">Review application</button>
</form>
<script>window.__fills = 0; document.querySelectorAll("input,textarea,select").forEach((el) => el.addEventListener("input", () => { window.__fills += 1; }));</script>
</body></html>`;

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(FORM_HTML); });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/apply` }));
  });
}

const now = () => Number(process.hrtime.bigint()) / 1e6;
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stats = (arr) => ({ n: arr.length, medianMs: Math.round(pct(arr, 50) * 10) / 10, p90Ms: Math.round(pct(arr, 90) * 10) / 10, minMs: Math.round(Math.min(...arr) * 10) / 10, maxMs: Math.round(Math.max(...arr) * 10) / 10 });
const load = () => ({ loadavg: os.loadavg().map((x) => Math.round(x * 100) / 100), freeMemMB: Math.round(os.freemem() / 1048576) });

function chromiumRssMB() {
  try {
    const out = execFileSync("ps", ["-eo", "rss=,args="], { encoding: "utf8", maxBuffer: 1 << 24 });
    let kb = 0, procs = 0;
    for (const line of out.split("\n")) {
      if (line.includes("chrome-linux64/chrome")) { const m = line.trim().match(/^(\d+)\s/); if (m) { kb += Number(m[1]); procs += 1; } }
    }
    return { rssMB: Math.round(kb / 1024), procs };
  } catch (e) { return { rssMB: -1, procs: -1 }; }
}

async function launchOpts() {
  const o = { headless: true };
  if (process.env.UPMORE_CHROMIUM_PATH) o.executablePath = process.env.UPMORE_CHROMIUM_PATH;
  if (process.env.UPMORE_CHROMIUM_SANDBOX === "off") o.args = ["--no-sandbox"]; else o.chromiumSandbox = true;
  return o;
}

/* One simulated drive: open the form page, fill it like module 149/150 do
   (per-field fills + readback), stop at the review button — never submits. */
async function driveWorkload(page, url, gotoFn) {
  if (gotoFn) await gotoFn(url); else await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#application");
  await page.fill("[name=first_name]", "Alex");
  await page.fill("[name=last_name]", "Testcase");
  await page.fill("[name=email]", "alex@example.test");
  await page.fill("[name=phone]", "555-0100");
  await page.fill("[name=city]", "Chicago");
  await page.fill("[name=school]", "TEST University");
  await page.selectOption("[name=grad]", "2028");
  await page.check("[name=auth][value=yes]");
  await page.fill("[name=cover]", "Synthetic cover note for a benchmark drive.");
  await page.fill("[name=linkedin]", "https://linkedin.example/alex");
  await page.check("[name=consent]");
  const readback = await page.inputValue("[name=email]");
  const fills = await page.evaluate(() => window.__fills);
  if (readback !== "alex@example.test" || fills < 8) throw new Error(`drive workload failed readback (email=${readback}, fills=${fills})`);
}

async function phaseMicro(url) {
  const coldReps = Number(process.env.BENCH_REPS || 10);
  const warmReps = 20;
  const out = { loadStart: load() };
  const cold = [];
  for (let i = 0; i < coldReps; i++) {
    const t0 = now();
    const b = await pw.chromium.launch(await launchOpts());
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#application");
    cold.push(now() - t0);
    await b.close();
  }
  out.coldLaunchToUsablePage = stats(cold);
  const b = await pw.chromium.launch(await launchOpts());
  const warmCtx = [];
  for (let i = 0; i < warmReps; i++) {
    const t0 = now();
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#application");
    warmCtx.push(now() - t0);
    await ctx.close();
  }
  out.warmBrowserNewContext = stats(warmCtx);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  const warmPage = [];
  for (let i = 0; i < warmReps; i++) {
    const t0 = now();
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#application");
    warmPage.push(now() - t0);
    await page.close();
  }
  out.warmContextNewPage = stats(warmPage);
  await b.close();
  out.loadEnd = load();
  return out;
}

async function phaseConc(url) {
  const out = { loadStart: load(), baseline: chromiumRssMB(), levels: {} };
  const b = await pw.chromium.launch(await launchOpts());
  for (const k of [1, 2, 4, 8]) {
    const leases = [];
    for (let i = 0; i < k; i++) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      const page = await ctx.newPage();
      await driveWorkload(page, url);
      leases.push({ ctx, page });
    }
    // Hold the sessions open and busy briefly, then sample.
    await Promise.all(leases.map(({ page }) => page.evaluate(() => { const t = Date.now(); while (Date.now() - t < 1500) { /* busy DOM-ish wait */ break; } return window.__fills; })));
    await new Promise((r) => setTimeout(r, 500));
    const sample = chromiumRssMB();
    out.levels[k] = { chromium: sample, deltaVsBaselineMB: sample.rssMB - out.baseline.rssMB, perSessionDeltaMB: Math.round(((sample.rssMB - out.baseline.rssMB) / k) * 10) / 10, load: load() };
    for (const { ctx } of leases) await ctx.close();
    await new Promise((r) => setTimeout(r, 300));
  }
  await b.close();
  out.loadEnd = load();
  return out;
}

async function phaseFifty(url) {
  const drives = Number(process.env.BENCH_DRIVES || 50);
  const out = { drives, loadStart: load() };
  // Mode "launch": launch-per-drive (module 150 serial semantics).
  {
    const times = [];
    const t0 = now();
    for (let i = 0; i < drives; i++) {
      const s = now();
      const b = await pw.chromium.launch(await launchOpts());
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      const page = await ctx.newPage();
      await driveWorkload(page, url);
      await b.close();
      times.push(now() - s);
    }
    out.launchPerDrive = { totalMs: Math.round(now() - t0), perDrive: stats(times), load: load() };
  }
  // Mode "pool1": pool, serial, fresh context per drive.
  {
    const pool = createSessionPool({ maxContexts: 1 });
    const times = [];
    const t0 = now();
    for (let i = 0; i < drives; i++) {
      const s = now();
      const lease = await pool.acquire();
      await driveWorkload(lease.page, url, (u) => lease.goto(u));
      await lease.release();
      times.push(now() - s);
    }
    out.poolSerial = { totalMs: Math.round(now() - t0), perDrive: stats(times), poolStats: pool.stats(), load: load() };
    await pool.close();
  }
  // Mode "pool4": pool, 4 concurrent leases.
  {
    const pool = createSessionPool({ maxContexts: 4 });
    const t0 = now();
    let done = 0;
    const worker = async () => {
      while (done < drives) {
        done += 1;
        const lease = await pool.acquire();
        try { await driveWorkload(lease.page, url, (u) => lease.goto(u)); }
        finally { await lease.release(); }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    out.poolConcurrent4 = { totalMs: Math.round(now() - t0), drives, poolStats: pool.stats(), load: load() };
    await pool.close();
  }
  out.loadEnd = load();
  return out;
}

(async () => {
  const phase = process.argv[2] || "all";
  const { srv, url } = await startServer();
  const result = { at: new Date().toISOString(), host: { cpus: os.cpus().length, totalMemMB: Math.round(os.totalmem() / 1048576) }, phase, url };
  try {
    if (phase === "micro" || phase === "all") result.micro = await phaseMicro(url);
    if (phase === "conc" || phase === "all") result.conc = await phaseConc(url);
    if (phase === "fifty" || phase === "all") result.fifty = await phaseFifty(url);
  } finally { srv.close(); }
  const text = JSON.stringify(result, null, 2);
  if (process.argv[3]) require("node:fs").writeFileSync(process.argv[3], text);
  console.log(text);
})().catch((e) => { console.error("BENCH FAILED:", e); process.exit(1); });
