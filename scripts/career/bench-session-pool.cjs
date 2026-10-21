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

/* Memory of the Chromium tree THIS bench launched, measured exactly:
   descendants of this node process only (ppid walk over /proc — the live
   worker's Chromium is a different tree and never counted), summed as
   PSS from smaps_rollup (shared pages counted once per tree share, so
   levels are comparable; plain RSS sums double-count shared pages). */
const fsSync = require("node:fs");
function descendantPids(rootPid) {
  const children = new Map();
  for (const ent of fsSync.readdirSync("/proc")) {
    if (!/^\d+$/.test(ent)) continue;
    try {
      const stat = fsSync.readFileSync(`/proc/${ent}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      if (!children.has(ppid)) children.set(ppid, []);
      children.get(ppid).push(Number(ent));
    } catch (e) { /* process vanished mid-walk */ }
  }
  const out = [];
  const queue = [rootPid];
  while (queue.length) { const p = queue.shift(); for (const c of children.get(p) || []) { out.push(c); queue.push(c); } }
  return out;
}
function treeCpuMs(rootPid) {
  let ticks = 0;
  for (const pid of descendantPids(rootPid)) {
    try {
      const stat = fsSync.readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      ticks += Number(fields[11]) + Number(fields[12]); // utime + stime (fields 14,15 overall)
    } catch (e) { /* vanished */ }
  }
  return ticks * 10; // USER_HZ = 100 on this host -> 10 ms per tick
}
function treeMemoryMB(rootPid) {
  const pids = descendantPids(rootPid);
  let pssKb = 0, rssKb = 0, counted = 0;
  for (const pid of pids) {
    try {
      const roll = fsSync.readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
      const pss = roll.match(/^Pss:\s+(\d+) kB/m); const rss = roll.match(/^Rss:\s+(\d+) kB/m);
      if (pss) { pssKb += Number(pss[1]); counted += 1; }
      if (rss) rssKb += Number(rss[1]);
    } catch (e) { /* not a memory-carrying or readable proc */ }
  }
  return { pssMB: Math.round(pssKb / 1024), rssMB: Math.round(rssKb / 1024), procs: pids.length, pssCounted: counted };
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
  const out = { loadStart: load(), emptyTree: treeMemoryMB(process.pid), levels: {} };
  const b = await pw.chromium.launch(await launchOpts());
  for (const k of [1, 2, 4, 8]) {
    const leases = [];
    for (let i = 0; i < k; i++) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
      const page = await ctx.newPage();
      await driveWorkload(page, url);
      leases.push({ ctx, page });
    }
    await new Promise((r) => setTimeout(r, 500));
    // Three samples, take the median PSS (robust to transient tree churn).
    const samples = [];
    for (let s = 0; s < 3; s++) { samples.push(treeMemoryMB(process.pid)); await new Promise((r) => setTimeout(r, 300)); }
    samples.sort((a, z) => a.pssMB - z.pssMB);
    // CPU: all sessions run a fixed 2 s JS busy loop concurrently; the
    // descendant CPU-time delta over that wall window = cores consumed.
    const cpu0 = treeCpuMs(process.pid);
    const wall0 = Date.now();
    await Promise.all(leases.map(({ page }) => page.evaluate(() => { const end = Date.now() + 2000; let x = 0; while (Date.now() < end) { x += Math.sqrt(x + 1); } return x; })));
    const wallMs = Date.now() - wall0;
    const cpuMs = treeCpuMs(process.pid) - cpu0;
    out.levels[k] = { tree: samples[1], samplesPssMB: samples.map((s) => s.pssMB),
      cpu: { wallMs, cpuMs, coresUsed: Math.round((cpuMs / wallMs) * 100) / 100, perSessionCores: Math.round((cpuMs / wallMs / k) * 100) / 100 },
      load: load() };
    for (const { ctx } of leases) await ctx.close();
    await new Promise((r) => setTimeout(r, 300));
  }
  await b.close();
  out.loadEnd = load();
  return out;
}

async function phaseFifty(url) {
  const drives = Number(process.env.BENCH_DRIVES || 50);
  const modes = (process.env.BENCH_MODES || "launch,pool1,pool4").split(",");
  const out = { drives, modes, loadStart: load() };
  // Mode "launch": launch-per-drive (module 150 serial semantics).
  if (modes.includes("launch")) {
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
  if (modes.includes("pool1")) {
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
  if (modes.includes("pool4")) {
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
