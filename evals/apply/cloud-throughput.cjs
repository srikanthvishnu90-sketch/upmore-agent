"use strict";
// WO-039 step 5: how long one headless application takes, measured offline on the captured CI forms
// (tests/fixtures/forms-ci: 17 real Greenhouse, Lever and Ashby application pages, scripts removed), with the engine
// exactly as the cloud runs it (scripts/apply.ts, headless, sandboxed Chromium, masked screenshots).
//
// For each form: dry runs with synthetic confirmed facts, answering every required question the form asks with a
// synthetic answer (the first of the employer's own options, or "Synthetic answer"), until the engine reaches the final
// review; then, where the form posts to its own page, the real submit with --approved, the form's action rewritten to a
// local server that answers like an employer. Nothing leaves this machine. Run as a user that is not root (Chromium
// will not start its sandbox as root):
//   node evals/apply/cloud-throughput.cjs [--parallel 3] [--out evals/apply/cloud-throughput.json]
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const PARALLEL = Math.max(1, Math.min(6, Number(opt("--parallel", 1))));
// --control N: also N runs of a synthetic form that posts to its own page (the shape a Lever form has), so the engine's
// own time per application is measured end to end, the Submit answered by this server.
const CONTROL = Math.max(0, Math.min(60, Number(opt("--control", 0))));
const control = () => `<!doctype html><h1>TEST role</h1><form method="post" enctype="multipart/form-data">` +
  `<label for="f">First name</label><input name="first_name" id="f" required><label for="l">Last name</label><input name="last_name" id="l" required>` +
  `<label for="e">Email</label><input name="email" type="email" id="e" required><label for="p">Phone</label><input name="phone" id="p" required>` +
  `<label for="r">Resume</label><input type="file" id="r" name="resume" required>` +
  `<label for="a">Are you legally authorized to work in the United States?</label><select id="a" name="auth" required><option value="">Select</option><option value="1">Yes</option><option value="0">No</option></select>` +
  `<button type="submit">Submit application</button></form>`;
const OUT = opt("--out", null);
const repo = path.resolve(__dirname, "../..");
const dir = path.join(repo, "tests/fixtures/forms-ci");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const forms = manifest.forms.filter((f) => f.status === "application" && f.html);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-cloud-throughput-"));
const normLabel = (l) => String(l || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const posts = [];

// Scripts, stylesheets and outside images removed, and the form's own action pointed at this server: the Submit is
// intercepted here, never sent to the employer.
const strip = (h, id) =>
  h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "")
    .replace(/\s(src|srcset)="https?:[^"]*"/gi, "")
    .replace(/(<form\b[^>]*\saction=")[^"]*(")/gi, `$1/submit/${id}$2`);

function engine(args, home) {
  const started = Date.now();
  return new Promise((resolve) => {
    const p = spawn(process.env.DENO_BIN || "deno", ["run", "-A", path.join(repo, "scripts/apply.ts"), ...args], {
      env: { ...process.env, HOME: home, UPMORE_MASK_SCREENSHOTS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", () => {});
    const timer = setTimeout(() => p.kill("SIGKILL"), 180000);
    p.once("exit", () => {
      clearTimeout(timer);
      const line = out.split("\n").filter((l) => l.startsWith("RESULT ")).at(-1);
      const hash = (out.match(/^Approval hash: ([0-9a-f]{64})$/m) || [])[1] || null;
      resolve({ result: line ? JSON.parse(line.slice(7)) : null, hash, ms: Date.now() - started });
    });
  });
}

async function one(f, base) {
  const work = fs.mkdtempSync(path.join(root, f.id.slice(0, 20).replace(/\//g, "-") + "-"));
  const home = path.join(work, "home");
  fs.mkdirSync(home, { mode: 0o700 });
  const resume = path.join(work, "synthetic.pdf");
  fs.writeFileSync(resume, "%PDF-1.4 SYNTHETIC TEST RESUME\n");
  const facts = {
    user_id: "TEST-THROUGHPUT",
    answers: Object.fromEntries(Object.entries({
      first_name: "Synthetic", last_name: "Tester", full_name: "Synthetic Tester", email: "synthetic@example.test",
      phone: "+1 555 0100", location: "New York, NY", linkedin: "https://www.linkedin.com/in/synthetic-tester",
    }).map(([k, value], i) => [k, { value, factId: "TEST-FACT-" + i, confirmed: true }])),
    saved: {},
  };
  const factsPath = path.join(work, "facts.json");
  const url = base + "/" + f.id;
  const row = { id: f.id, family: f.family, bot_check: f.bot_check, passes: [], dry_ms: null, submit: null };
  let ev = 0;
  for (let pass = 0; pass < 4; pass++) {
    fs.writeFileSync(factsPath, JSON.stringify(facts));
    const r = await engine(["--url", url, "--facts", factsPath, "--resume", resume, "--evidence-dir", path.join(work, "ev" + ev++)], home);
    const reason = String(r.result?.reason || r.result?.state || "NO_RESULT").split(":")[0];
    row.passes.push({ reason, ms: r.ms });
    if (reason === "dry_run") {
      row.dry_ms = r.ms;
      row.hash = r.hash;
      break;
    }
    if (reason !== "needs_answers") break;
    let added = 0;
    for (const q of r.result.questions || []) {
      const key = normLabel(q.label);
      if (facts.saved[key]) continue;
      const value = q.options && q.options.length ? q.options.find((o) => /^(yes|no)$/i.test(o)) || q.options[0] : "Synthetic answer";
      facts.saved[key] = { value, factId: "TEST-SAVED-" + added, confirmed: true };
      added++;
    }
    if (!added) break;
  }
  if (row.hash) {
    const before = posts.length;
    const r = await engine(["--url", url, "--facts", factsPath, "--resume", resume, "--evidence-dir", path.join(work, "ev" + ev++), "--submit", "--approved", row.hash], home);
    row.submit = { state: r.result?.state ?? null, reason: r.result?.reason ?? null, ms: r.ms, posts: posts.length - before };
  }
  return row;
}

(async () => {
  const server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const c of req) parts.push(c);
    if (req.method === "POST" && (req.url.startsWith("/submit/") || req.url.startsWith("/control/"))) {
      posts.push(req.url);
      return res.writeHead(200, { "Content-Type": "text/html" }).end("<h1>Thank you for applying</h1><p>Application received.</p>");
    }
    if (req.method !== "GET") return res.writeHead(405).end();
    if (req.url.startsWith("/control/")) return res.writeHead(200, { "Content-Type": "text/html" }).end(control());
    const f = forms.find((x) => "/" + x.id === req.url.split("?")[0]);
    if (!f) return res.writeHead(404).end("not found");
    res.writeHead(200, { "Content-Type": "text/html" }).end(strip(fs.readFileSync(path.join(dir, f.html), "utf8"), f.id));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const started = Date.now();
  const rows = [];
  const queue = [...(argv.includes("--control-only") ? [] : forms), ...Array.from({ length: CONTROL }, (_, i) => ({ id: "control/" + i, family: "control", bot_check: [] }))];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length) rows.push(await one(queue.shift(), base));
  }));
  const wall = Date.now() - started;
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  rows.sort((a, b) => a.id.localeCompare(b.id));
  const done = rows.filter((r) => r.submit && ["confirmed", "submitted_unconfirmed"].includes(r.submit.state));
  const median = (xs) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  const summary = {
    measured_at: new Date().toISOString(),
    parallel: PARALLEL,
    forms: rows.length,
    wall_ms: wall,
    reached_final_review: rows.filter((r) => r.dry_ms !== null).length,
    submitted_to_local_server: done.length,
    median_dry_run_ms: median(rows.filter((r) => r.dry_ms !== null).map((r) => r.dry_ms)),
    median_submit_ms: median(done.map((r) => r.submit.ms)),
    control_runs: rows.filter((r) => r.family === "control").length,
    control_median_dry_run_ms: median(rows.filter((r) => r.family === "control" && r.dry_ms !== null).map((r) => r.dry_ms)),
    control_median_submit_ms: median(rows.filter((r) => r.family === "control" && r.submit).map((r) => r.submit.ms)),
    control_submitted: rows.filter((r) => r.family === "control" && r.submit && ["confirmed", "submitted_unconfirmed"].includes(r.submit.state)).length,
    real_median_open_and_plan_ms: median(rows.filter((r) => r.family !== "control").map((r) => r.passes[0].ms)),
    bot_check_loaded: rows.filter((r) => r.family !== "control" && (r.bot_check || []).length).length,
    stops: rows.reduce((m, r) => {
      const k = r.submit ? `submit:${r.submit.reason || r.submit.state}` : `review:${r.passes.at(-1).reason}`;
      m[`${r.family} ${k}`] = (m[`${r.family} ${k}`] || 0) + 1;
      return m;
    }, {}),
  };
  const report = { summary, rows };
  if (OUT) fs.writeFileSync(path.resolve(repo, OUT), JSON.stringify(report, null, 1) + "\n");
  console.log(JSON.stringify(summary, null, 1));
  for (const r of rows) {
    console.log([r.family.padEnd(10), r.id.slice(0, 44).padEnd(44), r.passes.map((p) => `${p.reason}(${p.ms}ms)`).join(" > "),
      r.submit ? `submit:${r.submit.state}/${r.submit.reason}(${r.submit.ms}ms, posts ${r.submit.posts})` : ""].join(" "));
  }
})();
