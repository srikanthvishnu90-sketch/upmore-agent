"use strict";
// 50-in-30 throughput (agent submits, WO-101): how long the extension takes to prepare, approve in ONE batch and send N
// postings, measured step by step, and what changes when docs/apply/fifty-in-thirty.patch is applied.
//
// The real extension in a real Chromium against the captured forms served by the local TEST world
// (tests/fixtures/extension/world.cjs): nothing reaches a real employer, Upmore or Supabase, the person is the TEST
// persona, and nothing here costs money. A COPY of extension/ is loaded with agentSubmits switched on (extension/config.js
// is never edited); with --patch, the patch is applied to that copy only.
//
//   UPMORE_CHROMIUM_SANDBOX=off node evals/apply/fifty-in-thirty.cjs --n 10
//   UPMORE_CHROMIUM_SANDBOX=off node evals/apply/fifty-in-thirty.cjs --n 50 --mode rounds          # today: 20 a batch
//   UPMORE_CHROMIUM_SANDBOX=off node evals/apply/fifty-in-thirty.cjs --n 50 --patch docs/apply/fifty-in-thirty.patch
//
// Options:
//   --n N              postings in the session (default 10), each a distinct clone (its own company) of a capture the
//                      TEST person's facts and panel answers make batch-ready (found first, in a separate browser, or
//                      given with --ready id,id)
//   --mode onebatch    (default) all N queued, ONE Prepare, ONE approval tap, ONE Start; if Prepare reads fewer than N
//                      (PREPARE_MAX), the queue stalls at the first posting nobody approved and the run says so
//   --mode rounds      the way a person works around the cap today: queue --chunk postings, Prepare, approve, Start,
//                      wait for the queue, repeat
//   --chunk K          postings per round (default 20 = PREPARE_MAX today)
//   --patch FILE       apply FILE (a diff of extension/) to the copy before loading it
//   --silent K         every K-th posting is a slow employer that never answers (the world's ?trainee_test=silent), to
//                      measure the 30 s outcome wait
//   --begin-delay MS   the TEST world's begin RPC takes this long (world.state.beginDelayMs), a stand-in for live latency
//   --seed-evidence K  start with K earlier proofs on this computer (chrome.storage.local "evidence"; the extension keeps
//                      300), each with two pictures of --seed-shot-kb KB (default 300), to measure the proof list's cost
//   --label NAME / --out FILE
// Output: JSON (report + one row per posting) and a summary line.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ROOT = path.join(__dirname, "../..");
const { startWorld } = require(path.join(ROOT, "tests/fixtures/extension/world.cjs"));

const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const N = Number(arg("n", 10));
const MODE = arg("mode", "onebatch");
const CHUNK = Number(arg("chunk", 20));
const PATCH = arg("patch", "");
const SILENT = Number(arg("silent", 0));
const BEGIN_DELAY = Number(arg("begin-delay", 0));
const SEED = Number(arg("seed-evidence", 0));
const SEED_KB = Number(arg("seed-shot-kb", 300));
const LABEL = arg("label", `n${N}-${MODE}${PATCH ? "-patched" : ""}`);
const OUT = arg("out", path.join(ROOT, `evals/apply/results/fifty-${LABEL}.json`));
const READY_GIVEN = arg("ready", "");
const EXT = path.join(ROOT, "extension");
const RESUME = { name: "test-person-resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% TEST resume, not a real person\n") };
const STALL_MS = 6000; // a card ready and unapproved this long, with the queue running, is waiting for a person

let pw = null;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try {
    pw = require(id);
    break;
  } catch { /* next */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = (a) => {
  const v = a.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((x, y) => x - y);
  const p = (q) => (v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : null);
  return { n: v.length, p50: p(0.5), p90: p(0.9), max: v.length ? v[v.length - 1] : null, mean: v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null,
    sum: v.reduce((x, y) => x + y, 0) };
};
const t = (x) => (typeof x === "number" ? x : typeof x === "string" ? Date.parse(x) : null);
const d = (a, b) => (t(a) && t(b) ? t(b) - t(a) : null);

// A copy of extension/ with agentSubmits on, and the patch applied when given.
function extensionCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trainee-fifty-ext-"));
  fs.cpSync(EXT, dir, { recursive: true });
  const cfg = path.join(dir, "config.js");
  const src = fs.readFileSync(cfg, "utf8");
  const on = src.replace(/agentSubmits:\s*false/, "agentSubmits: true");
  if (on === src) throw Error("config.js has no agentSubmits: false to switch");
  fs.writeFileSync(cfg, on);
  if (PATCH) execFileSync("patch", ["-p2", "-d", dir, "-i", path.resolve(PATCH), "--no-backup-if-mismatch"], { stdio: "pipe" });
  return dir;
}

// One browser on one TEST world, signed in, resume chosen.
async function launch(world) {
  const CHROME = [process.env.UPMORE_EXTENSION_CHROMIUM_PATH, (() => {
    try {
      return pw.chromium.executablePath();
    } catch {
      return null;
    }
  })(), "/opt/pw-browsers/chromium", process.env.UPMORE_CHROMIUM_PATH].find((p) => p && fs.existsSync(p));
  const off = process.env.UPMORE_CHROMIUM_SANDBOX === "off";
  const ext = extensionCopy();
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "trainee-fifty-profile-"));
  const ctx = await pw.chromium.launchPersistentContext(ud, {
    headless: true, ...(CHROME ? { executablePath: CHROME } : {}), ...(off ? {} : { chromiumSandbox: true }), viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--host-resolver-rules=${world.hostRules}`, "--ignore-certificate-errors", "--no-proxy-server",
      ...(off ? ["--no-sandbox"] : [])],
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const b = { ctx, sw, ext, extHost: new URL(sw.url()).host };
  b.store = (area, key) => sw.evaluate(async ([a, k]) => (await chrome.storage[a].get(k))[k] ?? null, [area, key]);
  b.tabIdOf = (url) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((x) => x.url === u || x.pendingUrl === u)?.id ?? null, url);
  b.openPanel = async (tabId) => {
    const url = `chrome-extension://${b.extHost}/panel.html` + (tabId === null ? "" : `?tab=${tabId}`);
    const waiting = ctx.waitForEvent("page", { predicate: (p) => p.url() === url, timeout: 10000 });
    await sw.evaluate((u) => chrome.windows.create({ url: u, type: "popup", focused: false, width: 440, height: 900 }), url);
    const p = await waiting;
    await p.waitForLoadState("domcontentloaded");
    return p;
  };
  b.close = async () => {
    await ctx.close().catch(() => {});
    fs.rmSync(ext, { recursive: true, force: true });
  };
  const app = await ctx.newPage();
  await app.goto("https://upmore-topaz.vercel.app/");
  const panel = await b.openPanel(null);
  await panel.click("#use-app");
  await panel.waitForSelector("#page:not([hidden])", { timeout: 10000 });
  await panel.setInputFiles("#resume", RESUME);
  await panel.waitForFunction(() => document.getElementById("resume-name").textContent.includes(".pdf"));
  await panel.close();
  await app.close();
  return b;
}

async function newWorld(persona) {
  const world = await startWorld();
  world.state.dailyLimit = Math.max(50, N + 20); // the TEST person's own limit (D-011: at most 50 a day for a real person)
  if (BEGIN_DELAY) world.state.beginDelayMs = BEGIN_DELAY;
  for (const [k, v] of Object.entries(persona)) world.answer("fact:" + k, "fact", v);
  return world;
}

async function waitFor(f, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await f();
    if (v) return v;
    await sleep(100);
  }
  throw Error(`${what} not reached in ${ms} ms`);
}

// Prepare once: press it, wait for the batch. Returns the batch and how long it took.
async function prepareOnce(b, panel, expect) {
  await b.sw.evaluate(() => chrome.storage.session.remove("agent_batch"));
  const t0 = Date.now();
  await panel.click("#q-prepare");
  const batch = await waitFor(async () => {
    const x = await b.store("session", "agent_batch");
    return x && x.status === "ready" && x.ready.length + x.out.length >= expect ? x : null;
  }, 600000, "the batch");
  return { batch, ms: Date.now() - t0, ao: await b.store("session", "answer_once") };
}
// The TEST person answers every question the panel asks ("No" where offered), as the agent-submits test does.
async function answerOnce(b, panel) {
  const asked = (await panel.evaluate(() => chrome.runtime.sendMessage({ type: "status" }))).answerOnce;
  const qs = asked?.questions || [];
  if (!qs.length) return { n: 0, ms: 0, labels: [] };
  const t0 = Date.now();
  await panel.waitForFunction((n) => document.querySelectorAll("#ao-list li").length >= n, qs.length, { timeout: 10000 });
  for (const q of qs) {
    const el = panel.locator(`#ao-list li[data-key="${q.key}"] .ao-answer`);
    if (q.options.length) await el.selectOption(q.options.find((o) => /^no\b/i.test(o)) ?? q.options.at(-1));
    else await el.fill("TEST answer given in the panel");
  }
  await panel.click("#ao-save");
  await panel.waitForFunction(() => document.querySelectorAll("#ao-list li").length === 0, null, { timeout: 30000 });
  return { n: qs.length, ms: Date.now() - t0, labels: qs.map((q) => q.label.slice(0, 60)) };
}

// Start pressed: wait until the queue ends. A card that is ready but nobody approved (no batch approval for it) waits
// for a person forever: that is a stall. skip: press the panel's Skip and go on (discovery); otherwise stop and report.
async function runQueue(b, panel, isOurs, skip) {
  const skipped = [];
  for (;;) {
    const end = await waitFor(async () => {
      const q = await b.store("session", "queue");
      if (!q) return null;
      if (!q.running && !q.items.some((i) => i.state === "open")) return { q, how: "finished" };
      if (!q.running) return { q, how: "finished" };
      const all = (await b.store("session", "cards")) || {};
      const ap = (await b.store("session", "agent_approved")) || {};
      for (const c of Object.values(all)) {
        if (!c?.url || !isOurs(c.url) || skipped.includes(c.url)) continue;
        const open = q.items.some((i) => i.state === "open" && i.url === c.url);
        if (open && ["ready", "blocked", "stopped"].includes(c.status) && !c.approved && !ap[c.jobId] && Date.now() - c.updated_at > STALL_MS) {
          return { q, how: "stalled", at: c.url, since: c.updated_at };
        }
      }
      return null;
    }, 3600000, "the queue to end");
    if (end.how !== "stalled" || !skip) return { ...end, skipped };
    skipped.push(end.at);
    await panel.click("#q-skip");
  }
}

// Which captures become batch-ready for the TEST person (Prepare + the panel's answers + Prepare again): one clone each.
async function discover(persona) {
  const world = await newWorld(persona);
  const b = await launch(world);
  try {
    const ids = world.forms.map((f) => f.id).filter((id) => /^(greenhouse|lever|ashby)-/.test(id));
    const urls = ids.map((id, k) => world.cloneUrl(id, 900 + k));
    const page = await b.ctx.newPage();
    await page.goto("https://upmore-topaz.vercel.app/?discover=1");
    const panel = await b.openPanel(await b.tabIdOf(page.url()));
    await panel.fill("#links", urls.join("\n"));
    await panel.click("#q-add");
    await panel.waitForFunction(() => /added\./.test(document.getElementById("q-msg")?.textContent || ""), null, { timeout: 5000 });
    await prepareOnce(b, panel, Math.min(urls.length, 20));
    await answerOnce(b, panel);
    const { batch } = await prepareOnce(b, panel, Math.min(urls.length, 20));
    const out = batch.out.map((o) => ({ id: ids[urls.indexOf(o.url)], why: o.why.slice(0, 2).join(" ").slice(0, 200) }));
    // Batch-ready is not enough: the TEST world's stand-ins must also take the send (the captures keep no employer script,
    // so a Greenhouse dropdown widget never opens here, and that posting stops at the send as "differs"). One send each.
    await panel.waitForSelector("#agent-approve:not([hidden])", { timeout: 10000 });
    await panel.click("#agent-approve");
    await waitFor(async () => world.state.batchApprovals.length >= batch.ready.length, 30000, "the approval recorded");
    world.state.agentSubmit = "on";
    await panel.click("#q-start");
    const ours = new Set(urls);
    const { q } = await runQueue(b, panel, (u) => ours.has(u), true);
    const ready = [];
    for (const e of batch.ready) {
      const id = ids[urls.indexOf(e.url)];
      const item = q.items.find((x) => x.url === e.url);
      if (item?.state === "confirmed") ready.push(id);
      else {
        const c = Object.values((await b.store("session", "cards")) || {}).find((x) => x.url === e.url);
        out.push({ id, why: `batch-ready, but not sent in the TEST world (${item?.state}): ${String(c?.message || "").slice(0, 160)}` });
      }
    }
    return { ready, out };
  } finally {
    await b.close();
    await world.close();
  }
}

// ------------------------------------------------------------------------------------------------ the measured session
async function main() {
  if (!pw) throw Error("PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH");
  const persona = JSON.parse(execFileSync(process.env.DENO_BIN || "deno", ["run", "--allow-read", path.join(ROOT, "tests/fixtures/extension/persona.ts")], { encoding: "utf8" }));
  const wallStart = Date.now();
  let found = null;
  if (READY_GIVEN) found = { ready: READY_GIVEN.split(","), out: [] };
  else {
    process.stderr.write("discovering which captures the TEST person's facts make batch-ready...\n");
    found = await discover(persona);
    process.stderr.write(`ready: ${found.ready.join(", ")}\n`);
  }
  if (!found.ready.length) throw Error("no capture is batch-ready for the TEST person: " + JSON.stringify(found.out));

  const world = await newWorld(persona);
  const b = await launch(world);
  const { ctx, sw } = b;
  // Every posting: N distinct clones (each its own company) of the ready captures, in turn.
  const postings = Array.from({ length: N }, (_, i) => {
    const id = found.ready[i % found.ready.length];
    const url = world.cloneUrl(id, i + 1) + (SILENT && (i + 1) % SILENT === 0 ? "?trainee_test=silent" : "");
    return { i, id, family: id.split("-")[0], url, silent: /silent/.test(url) };
  });
  const byUrl = new Map(postings.map((p) => [p.url, p]));
  const keyOf = (u) => {
    try {
      const x = new URL(u);
      return (x.host + x.pathname).toLowerCase();
    } catch {
      return String(u);
    }
  };
  const byKey = new Map(postings.map((p) => [keyOf(p.url), p]));

  // Per-posting page loads, from the browser's side: every top-level navigation to a posting, and when its tab closed.
  // During Prepare these are the hidden survey tabs (opened, read, closed); during the send, the queue's tab(s).
  let phase = "setup";
  const navs = []; // {key, at, phase, page}
  const watchPage = (pg) => {
    pg.on("request", (r) => {
      if (!r.isNavigationRequest() || r.frame() !== pg.mainFrame()) return;
      const p = byKey.get(keyOf(r.url()));
      if (p) navs.push({ key: keyOf(r.url()), at: Date.now(), phase, page: pg });
    });
    pg.on("close", () => {
      for (const n of navs) if (n.page === pg && !n.closed) n.closed = Date.now();
    });
  };
  ctx.on("page", watchPage);
  for (const pg of ctx.pages()) watchPage(pg);

  // A person who already applied before: the proof list on this computer (chrome.storage.local "evidence", kept to 300,
  // each with its two pictures) is read and written whole after every application.
  if (SEED) {
    await sw.evaluate(async ([k, kb]) => {
      const shot = "data:image/png;base64," + "A".repeat(kb * 1024);
      const list = Array.from({ length: k }, (_, i) => ({ id: "TEST-seed-" + i, state: "confirmed", proved: true, screenshot: shot, screenshot_after: shot, answers: [] }));
      await chrome.storage.local.set({ evidence: list });
    }, [SEED, SEED_KB]);
  }
  const evidenceBytes = () => sw.evaluate(() => chrome.storage.local.getBytesInUse("evidence"));
  const evidence_bytes_before = await evidenceBytes();
  const page = await ctx.newPage();
  await page.goto("https://upmore-topaz.vercel.app/?fifty=1");
  await sleep(100);
  const tabId = await b.tabIdOf(page.url());
  const panel = await b.openPanel(tabId);

  // The send: poll every card and the queue, keeping the last snapshot of each posting's card (one tab shows one posting
  // at a time; a patched build may run several tabs).
  const snaps = new Map(); // url key -> {first: card when first ready, last: last card seen}
  let polling = true;
  const poller = (async () => {
    while (polling) {
      try {
        const all = await sw.evaluate(async () => (await chrome.storage.session.get("cards")).cards || {});
        for (const c of Object.values(all)) {
          if (!c || !c.url) continue;
          const k = keyOf(c.url);
          if (!byKey.has(k)) continue;
          const s = snaps.get(k) || {};
          if (!s.first && ["ready", "blocked", "submitting"].includes(c.status) && c.timing) s.first = c;
          s.last = c;
          if (c.status === "done") s.done = c;
          snaps.set(k, s);
        }
      } catch { /* the worker restarted: next poll */ }
      await sleep(40);
    }
  })();

  const rounds = [];
  const chunks = MODE === "rounds" ? Array.from({ length: Math.ceil(N / CHUNK) }, (_, k) => postings.slice(k * CHUNK, (k + 1) * CHUNK)) : [postings];
  let stalled = null;
  const t0 = Date.now();
  for (const [k, chunk] of chunks.entries()) {
    const r = { round: k + 1, postings: chunk.length, at: Date.now() };
    phase = "prepare";
    await panel.fill("#links", chunk.map((p) => p.url).join("\n"));
    await panel.click("#q-add");
    await panel.waitForFunction(() => /added\./.test(document.getElementById("q-msg")?.textContent || ""), null, { timeout: 5000 });
    // What Prepare reads at once is capped (PREPARE_MAX): wait for what it says it reads.
    const first = await prepareOnce(b, panel, 1);
    const reads = first.ao?.total ?? chunk.length;
    r.prepare1_ms = first.ms;
    r.prepare_reads = reads;
    r.prepare_notes = first.ao?.notes || [];
    r.ready_before_answers = first.batch.ready.length;
    const ans = await answerOnce(b, panel);
    r.questions = ans.n;
    r.answer_ms = ans.ms;
    r.question_labels = ans.labels;
    if (ans.n) {
      const second = await prepareOnce(b, panel, reads);
      r.prepare2_ms = second.ms;
      r.batch = second.batch;
    } else r.batch = first.batch;
    r.ready = r.batch.ready.length;
    r.out = r.batch.out.map((o) => ({ url: o.url, why: o.why.slice(0, 2).join(" ").slice(0, 200) }));
    r.prepared_at = Date.now();
    // The one tap.
    phase = "approve";
    const before = world.state.batchApprovals.length;
    const ta = Date.now();
    await panel.waitForSelector("#agent-approve:not([hidden])", { timeout: 10000 });
    await panel.click("#agent-approve");
    await waitFor(async () => world.state.batchApprovals.length - before >= r.ready, 30000, "the approval recorded");
    r.approve_ms = Date.now() - ta;
    world.state.agentSubmit = "on"; // the owner's switch, in the TEST world only
    // Start, and wait for the queue to end (or to stall at a posting nobody approved).
    phase = "send";
    const ts = Date.now();
    r.start_at = ts;
    await panel.click("#q-start");
    const end = await runQueue(b, panel, (u) => byKey.has(keyOf(u)), false);
    r.send_ms = (end.how === "stalled" ? end.since : Date.now()) - ts;
    r.end = end.how;
    if (end.how === "stalled") {
      stalled = { url: end.at, after_ms: Date.now() - ts };
      await panel.click("#q-stop");
    }
    r.queue_states = end.q.items.reduce((a, x) => ((a[x.state] = (a[x.state] || 0) + 1), a), {});
    rounds.push(r);
    process.stderr.write(`round ${k + 1}: ${chunk.length} queued, Prepare read ${reads}, ${r.questions} questions, ${r.ready} ready, ` +
      `prepare ${((r.prepare1_ms + (r.prepare2_ms || 0)) / 1000).toFixed(1)}s, send ${(r.send_ms / 1000).toFixed(1)}s, ${end.how}${stalled ? " at " + stalled.url : ""}\n`);
    if (stalled) break;
  }
  const wall_ms = Date.now() - t0;
  await sleep(300);
  polling = false;
  await poller;
  const q = await b.store("session", "queue");
  const receipts = (await b.store("local", "agent_receipts")) || [];
  const evidence_bytes_after = await evidenceBytes();
  const shotBytes = await sw.evaluate(async () => {
    const e = (await chrome.storage.local.get("evidence")).evidence || [];
    const real = e.filter((x) => !String(x.id).startsWith("TEST-seed-"));
    return real.map((x) => String(x.screenshot || "").length + String(x.screenshot_after || "").length);
  });

  // ------------------------------------------------------------------------------------------------ per posting
  const rows = postings.map((p) => {
    const k = keyOf(p.url);
    const s = snaps.get(k) || {};
    const item = (q?.items || []).find((x) => keyOf(x.url) === k) || null;
    const c = s.done || s.last || null;
    const timing = (s.first || c)?.timing || null;
    const steps = c?.times?.steps || null;
    const surveys = navs.filter((n) => n.key === k && n.phase === "prepare");
    const sends = navs.filter((n) => n.key === k && n.phase === "send");
    const got = world.state.submits.filter((x) => (x.path || "").toLowerCase() === new URL(p.url).pathname.toLowerCase());
    const row = {
      i: p.i, form: p.id, family: p.family, url: p.url, silent: p.silent,
      queue_state: item?.state ?? null, card_status: c?.status ?? null, result: c?.result ?? null, employer_received: got.length,
      message: c && c.status !== "done" ? String(c.message || "").slice(0, 200) : undefined,
      // Prepare: each read of this posting in a hidden tab (navigation to tab closed), every Prepare press.
      prepare_reads_ms: surveys.map((n) => (n.closed ? n.closed - n.at : null)),
      // The send.
      opened_at: item?.opened_at ?? null,
      open_to_nav_ms: sends.length && item?.opened_at ? sends[0].at - item.opened_at : null,
      load_ms: d(timing?.nav, timing?.dcl),
      script_to_prepare_ms: d(timing?.script, timing?.prepare),
      context_rpcs_ms: d(timing?.prepare, timing?.context),
      form_read_ms: d(timing?.context, timing?.read),
      plan_ms: d(timing?.read, timing?.plan),
      fill_ms: d(timing?.plan, timing?.fill),
      card_build_ms: d(timing?.fill, timing?.first_card),
      open_to_card_ms: d(item?.opened_at, timing?.first_card),
      card_to_approve_ms: d(c?.times?.card_shown_at ?? timing?.first_card, c?.times?.approved_at ?? c?.approved_at),
      approve_to_submit_ms: d(c?.times?.approved_at, steps?.submit),
      check_ms: d(steps?.submit, steps?.checked),
      screenshot_ms: d(steps?.checked, steps?.screenshot),
      begin_ms: d(steps?.screenshot, steps?.begun),
      click_to_outcome_ms: d(steps?.begun, c?.times?.finished_at),
      total_ms: d(item?.opened_at, c?.times?.finished_at),
      slow_fields: timing?.slow || null,
    };
    return row;
  });
  // The time between one posting's outcome and the next opening in the same tab (the queue's own gap).
  const ordered = rows.filter((r) => r.opened_at).sort((a, b2) => a.opened_at - b2.opened_at);
  for (let j = 1; j < ordered.length; j++) {
    const prev = ordered[j - 1], fin = t(snaps.get(keyOf(prev.url))?.done?.times?.finished_at);
    if (fin) ordered[j].gap_after_previous_ms = ordered[j].opened_at - fin;
  }
  await b.close();
  await world.close();

  // ------------------------------------------------------------------------------------------------ the report
  const sent = rows.filter((r) => r.employer_received > 0);
  const confirmed = rows.filter((r) => r.result === "confirmed");
  const prepare_ms = rounds.reduce((a, r) => a + r.prepare1_ms + (r.prepare2_ms || 0), 0);
  const answer_ms = rounds.reduce((a, r) => a + r.answer_ms, 0);
  const approve_ms = rounds.reduce((a, r) => a + r.approve_ms, 0);
  const send_ms = rounds.reduce((a, r) => a + r.send_ms, 0);
  const readyN = rounds.reduce((a, r) => a + r.ready, 0);
  const keys = ["prepare_reads_ms", "open_to_nav_ms", "load_ms", "script_to_prepare_ms", "context_rpcs_ms", "form_read_ms", "plan_ms", "fill_ms", "card_build_ms", "open_to_card_ms",
    "card_to_approve_ms", "approve_to_submit_ms", "check_ms", "screenshot_ms", "begin_ms", "click_to_outcome_ms", "total_ms", "gap_after_previous_ms"];
  const report = {
    work: "50-in-30 throughput (agent submits)",
    label: LABEL, measured_at: new Date().toISOString(), n: N, mode: MODE, chunk: MODE === "rounds" ? CHUNK : null, patch: PATCH || null, silent_every: SILENT || null,
    begin_delay_ms: BEGIN_DELAY || null,
    labels: { machine: "VERIFIED offline (local TEST world, headless Chromium; employer answers at once unless --silent)", live: "NOT_RUN" },
    batch_ready_captures: found.ready, not_ready_captures: found.out,
    rounds: rounds.map(({ batch, ...r }) => r),
    stalled,
    prepared: readyN, sent: sent.length, confirmed: confirmed.length,
    double_sends: rows.filter((r) => r.employer_received > 1).map((r) => r.i),
    wall_ms, prepare_ms, answer_ms, approve_ms, send_ms,
    harness_setup_ms: t0 - wallStart,
    prepared_per_min: prepare_ms ? +(readyN / (prepare_ms / 60000)).toFixed(1) : null,
    submitted_per_min: send_ms ? +(sent.length / (send_ms / 60000)).toFixed(1) : null,
    end_to_end_per_min: wall_ms ? +(sent.length / (wall_ms / 60000)).toFixed(1) : null,
    projected_50_ms: sent.length ? Math.round((wall_ms / sent.length) * 50) : null,
    steps_ms: Object.fromEntries(keys.map((k) => [k, stats(rows.flatMap((r) => (Array.isArray(r[k]) ? r[k] : [r[k]])))])),
    queue_states: (q?.items || []).reduce((a, x) => ((a[x.state] = (a[x.state] || 0) + 1), a), {}),
    receipts: receipts.length,
    evidence: { seeded: SEED || 0, seeded_shot_kb: SEED ? SEED_KB : null, bytes_before: evidence_bytes_before, bytes_after: evidence_bytes_after,
      pictures_bytes_per_application: stats(shotBytes) },
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ report, rows }, null, 1) + "\n");
  const s = (x) => (x == null ? "-" : (x / 1000).toFixed(2) + "s");
  console.log(`fifty-in-thirty ${LABEL}: ${sent.length}/${N} sent (${confirmed.length} confirmed) in ${s(wall_ms)} end to end; prepare ${s(prepare_ms)} for ${readyN} ready ` +
    `(${report.prepared_per_min}/min), answer ${s(answer_ms)}, approve ${s(approve_ms)}, send ${s(send_ms)} (${report.submitted_per_min}/min); ` +
    `${report.end_to_end_per_min}/min end to end${stalled ? `; STALLED at the first unapproved posting after ${s(stalled.after_ms)}` : ""}`);
  for (const [k, v] of Object.entries(report.steps_ms)) if (v.n) console.log(`  ${k.padEnd(22)} n ${String(v.n).padStart(3)}  p50 ${s(v.p50)}  p90 ${s(v.p90)}  max ${s(v.max)}  sum ${s(v.sum)}`);
  console.log(`  wrote ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
