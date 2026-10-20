"use strict";
// WO-042: the 60-in-30 benchmark. One session of reviewed applications through the extension (WO-031), the way a person
// runs it: the queue opens each posting, the extension fills it and shows the card, the person reads the card, answers
// what is still needed on the form, and taps Approve; the extension presses the site's own Submit and reads the
// employer's answer. Every posting is one of the 17 captured application forms (tests/fixtures/forms-ci) served as its
// own posting at its own company by the local TEST world (tests/fixtures/extension/world.cjs): nothing reaches a real
// employer, Upmore or Supabase, and the person is a TEST persona.
//
//   node evals/apply/sixty-in-thirty.cjs [--n 60] [--person instant|model] [--label <name>] [--out <file.json>]
//
// --person instant: the person reads nothing and taps at once, so the wall clock is the machine's own critical path
//   (VERIFIED offline).
// --person model: the person reads each card for the time the reading model gives (ASSUMED, below) and types what is
//   still needed; the wall clock is then the session a person of that speed would have (VERIFIED-S: measured, with a
//   simulated person).
// Every card is graded against the answer key (tests/fixtures/extension/answer-key.json) before the tap, so a wrong
// answer that went is counted even when a careless person would not have caught it: "zero wrong-answer submissions"
// means the system put no wrong answer on any card that was sent.
//
// Needs Playwright and Chromium as the WO-031 suite does (UPMORE_CHROMIUM_SANDBOX=off as root).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ROOT = path.join(__dirname, "../..");
const { startWorld } = require(path.join(ROOT, "tests/fixtures/extension/world.cjs"));
const { expectedValue, verdict, norm } = require(path.join(ROOT, "tests/fixtures/extension/grade.cjs"));

const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const N = Number(arg("n", 60));
const PERSON = arg("person", "instant");
const LABEL = arg("label", "run");
const OUT = arg("out", path.join(ROOT, `evals/apply/results/sixty-${LABEL}.json`));
const EXT = path.join(ROOT, "extension");
const KEY = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/extension/answer-key.json"), "utf8"));
const RESUME = { name: "test-person-resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% TEST resume for WO-042, not a real person\n") };

// The person's reading model (ASSUMED; each figure is a stated assumption, not a measurement of anyone):
// - an answer line the person has not seen on an earlier card this session is read word by word at 238 words a minute
//   (Brysbaert 2019, Journal of Memory and Language 109:104047: the mean silent reading rate for English non-fiction);
// - a line whose question and answer they already read on an earlier card is glanced at: 0.4 s;
// - every other line of the card (the company, the resume, the notices) is glanced at: 0.4 s;
// - deciding and tapping: 1.5 s;
// - a field still needed, answered by hand on the form: 6 s for text, 2.5 s for a choice.
const MODEL = { wpm: 238, glance_s: 0.4, decide_s: 1.5, type_text_s: 6, pick_s: 2.5 };

let pw = null;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try {
    pw = require(id);
    break;
  } catch { /* next */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a) => (q) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null;
};
const stats = (a) => {
  const v = a.filter((x) => typeof x === "number" && Number.isFinite(x));
  const p = pct(v);
  return { n: v.length, p50: p(0.5), p90: p(0.9), max: v.length ? Math.max(...v) : null, mean: v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null };
};

async function main() {
  if (!pw) throw Error("PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH");
  const persona = JSON.parse(execFileSync(process.env.DENO_BIN || "deno", ["run", "--allow-read", path.join(ROOT, "tests/fixtures/extension/persona.ts")], { encoding: "utf8" }));
  const world = await startWorld();
  // The TEST world's daily limit is the session size. D-011 caps a real person at 50 a day (25 by default): a session
  // of 60 in one day needs the owner's written amendment, which this benchmark does not assume (see WO-042).
  world.state.dailyLimit = N;
  for (const [k, v] of Object.entries(persona)) world.answer("fact:" + k, "fact", v);
  const CHROME = [process.env.UPMORE_EXTENSION_CHROMIUM_PATH, (() => {
    try {
      return pw.chromium.executablePath();
    } catch {
      return null;
    }
  })(), "/opt/pw-browsers/chromium", process.env.UPMORE_CHROMIUM_PATH].find((p) => p && fs.existsSync(p));
  const off = process.env.UPMORE_CHROMIUM_SANDBOX === "off";
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "trainee-sixty-"));
  const ctx = await pw.chromium.launchPersistentContext(ud, {
    headless: true, ...(CHROME ? { executablePath: CHROME } : {}), ...(off ? {} : { chromiumSandbox: true }), viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--host-resolver-rules=${world.hostRules}`, "--ignore-certificate-errors", "--no-proxy-server", ...(off ? ["--no-sandbox"] : [])],
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extHost = new URL(sw.url()).host;
  const tabIdOf = (url) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u || t.pendingUrl === u)?.id ?? null, url);
  const cardOf = (id) => sw.evaluate(async (t) => ((await chrome.storage.session.get("cards")).cards || {})[t] || null, id);
  const queueOf = () => sw.evaluate(async () => (await chrome.storage.session.get("queue")).queue);
  async function waitCard(id, pred, ms = 30000) {
    const end = Date.now() + ms;
    let c = null;
    while (Date.now() < end) {
      c = await cardOf(id);
      if (c && pred(c)) return c;
      await sleep(25);
    }
    throw Error("card did not reach the state in time: " + JSON.stringify(c && { status: c.status, message: c.message, url: c.url }));
  }
  async function openPanel(q) {
    const url = `chrome-extension://${extHost}/panel.html${q}`;
    const waiting = ctx.waitForEvent("page", { predicate: (p) => p.url() === url, timeout: 10000 });
    await sw.evaluate((u) => chrome.windows.create({ url: u, type: "popup", focused: false, width: 440, height: 900 }), url);
    const p = await waiting;
    await p.waitForLoadState("domcontentloaded");
    return p;
  }

  // Sign in the way the person already is, and choose the resume.
  const app = await ctx.newPage();
  await app.goto("https://upmore-topaz.vercel.app/");
  const setup = await openPanel("");
  await setup.click("#use-app");
  await setup.waitForSelector("#page:not([hidden])", { timeout: 10000 });
  await setup.setInputFiles("#resume", RESUME);
  await setup.waitForFunction(() => document.getElementById("resume-name").textContent.includes(".pdf"));
  await setup.close();

  // The session's postings: the 17 forms in turn, each use another posting at another company.
  const ids = Object.keys(KEY.forms);
  const postings = Array.from({ length: N }, (_, i) => {
    const id = ids[i % ids.length];
    return { id, url: world.cloneUrl(id, i + 1) };
  });
  const formOf = new Map(postings.map((p) => [p.url, p.id]));

  await app.goto("https://upmore-topaz.vercel.app/?queue=1");
  await sleep(100);
  const tabId = await tabIdOf(app.url());
  const panel = await openPanel(`?tab=${tabId}`);
  await panel.fill("#links", postings.map((p) => p.url).join("\n"));
  await panel.click("#q-add");
  const seen = new Set(); // question + answer lines this person already read this session
  const rows = [];
  const wall0 = Date.now();
  await panel.click("#q-start");
  const page = app;
  for (const [i, p] of postings.entries()) {
    const r = { i, form: p.id, family: p.id.split("-")[0], url: p.url };
    try {
      await (async () => {
        const end = Date.now() + 30000;
        while (page.url() !== p.url && Date.now() < end) await sleep(10);
      })();
      let card = await waitCard(tabId, (c) => c.url === p.url && ["ready", "blocked", "stopped"].includes(c.status));
      r.card_visible_at = Date.now();
      r.timing = card.timing || null;
      if (card.status === "stopped") throw Error("stopped: " + card.message);
      // What the person still has to do by hand on the form.
      let person_ms = 0;
      r.open_required = (card.openRequired || []).length;
      if (card.status === "blocked") {
        const t0 = Date.now();
        const typed = await personAnswers(sw, page, tabId);
        person_ms += typed.text * MODEL.type_text_s * 1000 + typed.pick * MODEL.pick_s * 1000;
        r.person_answered = typed;
        card = await waitCard(tabId, (c) => c.url === p.url && (c.status === "ready" || c.status === "stopped"), 15000);
        r.answer_machine_ms = Date.now() - t0;
        if (card.status !== "ready") throw Error("not ready after the person's answers: " + (card.blockers || []).join("; ") + " " + card.message);
      }
      // Grade every bound field against the answer key, as the card shows it.
      const fieldsNow = await sw.evaluate(async (id) => {
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
          const f = globalThis.TraineeCore.dom.readForm();
          return f.schema.map((s) => ({ ...s, widget: f.bindings[s.name].widget }));
        } });
        return result;
      }, tabId);
      const key = KEY.forms[p.id];
      const byName = Object.fromEntries((card.payload?.fields || []).map((x) => [x.name, x]));
      const graded = fieldsNow.map((fld) => {
        const want = key[fld.name] === undefined ? "unkeyed" : expectedValue(key[fld.name], fld, !!fld.widget, persona, RESUME.name);
        const got = byName[fld.name];
        return { name: fld.name, label: String(fld.label).slice(0, 100), widget: !!fld.widget, want, got: got ? got.value : null, source: got ? got.source : null, verdict: want === "unkeyed" ? "unkeyed" : verdict(want, got) };
      });
      r.verdicts = graded.reduce((a, g) => ((a[g.verdict] = (a[g.verdict] || 0) + 1), a), {});
      r.wrong = graded.filter((g) => g.verdict.startsWith("wrong"));
      r.missed = graded.filter((g) => g.verdict === "missed").map((g) => ({ label: g.label, widget: g.widget }));
      // The card the person reads: new lines word by word, lines already read on an earlier card at a glance.
      const answerLines = (card.payload?.fields || []).map((f) => norm(f.label) + "=" + norm(f.value));
      const fresh = answerLines.filter((l) => !seen.has(l));
      const words = (card.payload?.fields || []).filter((f) => !seen.has(norm(f.label) + "=" + norm(f.value))).reduce((a, f) => a + `${f.label} ${f.value}`.split(/\s+/).length, 0);
      const otherLines = (card.lines || []).length - answerLines.length;
      const read_ms = Math.round((words / MODEL.wpm) * 60000 + (answerLines.length - fresh.length + Math.max(0, otherLines)) * MODEL.glance_s * 1000 + MODEL.decide_s * 1000);
      r.card = { lines: (card.lines || []).length, answers: answerLines.length, new_answers: fresh.length, words_new: words, read_ms_model: read_ms, person_ms_model: person_ms };
      answerLines.forEach((l) => seen.add(l));
      if (PERSON === "model") await sleep(read_ms + person_ms);
      r.approve_at = Date.now();
      await panel.waitForFunction(() => !document.getElementById("approve").disabled, null, { timeout: 10000 });
      await panel.click("#approve");
      let done = await waitCard(tabId, (c) => c.url === p.url && (c.status === "done" || c.status === "stopped"), 30000);
      if (done.status === "stopped") done = await waitCard(tabId, (c) => c.url === p.url && c.status === "done", 3000).catch(() => done);
      r.result = done.status === "done" ? done.result : "stopped: " + done.message;
      r.done_at = Date.now();
      r.times = done.times || null;
    } catch (e) {
      r.result = "error: " + String(e.message || e).slice(0, 300);
      await panel.click("#q-skip").catch(() => {});
    }
    rows.push(r);
    process.stderr.write(`${i + 1}/${N} ${r.form.slice(0, 32)} ${r.result} ${r.wrong?.length ? "WRONG " + r.wrong.length : ""}\n`);
  }
  const wall_ms = Date.now() - wall0;
  const q = await queueOf();
  await ctx.close().catch(() => {});
  await world.close();

  // ------------------------------------------------------------------------------------------------ the report
  const sent = rows.filter((r) => r.result === "confirmed");
  const wrongSent = sent.filter((r) => r.wrong.length);
  const allGraded = rows.flatMap((r) => (r.verdicts ? [r.verdicts] : []));
  const sum = (k) => allGraded.reduce((a, v) => a + (v[k] || 0), 0);
  const filled = sum("correct") + sum("wrong_value") + sum("wrong_filled"), should = sum("correct") + sum("wrong_value") + sum("missed");
  const T = (r, a, b) => (r.timing && r.timing[a] && r.timing[b] ? r.timing[b] - r.timing[a] : null);
  const step = {
    // From the queue opening the posting to the content script's first mark: page load (the queue's own open mark).
    load_nav_to_dcl: rows.map((r) => T(r, "nav", "dcl")),
    script_start_after_dcl: rows.map((r) => T(r, "dcl", "script")),
    wait_to_prepare: rows.map((r) => T(r, "script", "prepare")),
    context_rpcs: rows.map((r) => T(r, "prepare", "context")),
    form_ready_read: rows.map((r) => T(r, "context", "read")),
    plan: rows.map((r) => T(r, "read", "plan")),
    fill: rows.map((r) => T(r, "plan", "fill")),
    card_build: rows.map((r) => T(r, "fill", "first_card")),
    nav_to_card: rows.map((r) => T(r, "nav", "first_card")),
    approve_to_click: rows.map((r) => (r.times ? r.times.clicked - r.times.approved : null)),
    click_to_confirmed: rows.map((r) => (r.times ? r.times.done - r.times.clicked : null)),
    tap_to_next_card_visible: rows.slice(1).map((r, j) => (rows[j].approve_at && r.card_visible_at ? r.card_visible_at - rows[j].approve_at : null)),
  };
  const report = {
    wo: "WO-042",
    label: LABEL,
    measured_at: new Date().toISOString(),
    person: PERSON,
    reading_model: PERSON === "model" ? MODEL : null,
    labels: { machine: "VERIFIED offline (local TEST world, headless Chromium)", session: PERSON === "model" ? "VERIFIED-S (simulated person; reading model ASSUMED)" : "VERIFIED offline (person taps at once)", live: "NOT_RUN" },
    n: N,
    sent_confirmed: sent.length,
    not_confirmed: rows.filter((r) => r.result !== "confirmed").map((r) => ({ i: r.i, form: r.form, result: r.result })),
    wall_ms,
    per_application_ms: Math.round(wall_ms / N),
    projected_in_30_min: Math.floor(1800000 / (wall_ms / Math.max(1, sent.length))),
    wrong_answer_submissions: wrongSent.length,
    wrong_answers: wrongSent.map((r) => ({ i: r.i, form: r.form, wrong: r.wrong })),
    field_precision: filled ? sum("correct") / filled : 1,
    field_coverage: should ? sum("correct") / should : 1,
    fields: { correct: sum("correct"), wrong_value: sum("wrong_value"), wrong_filled: sum("wrong_filled"), missed: sum("missed"), unkeyed: sum("unkeyed") },
    blocked_cards: rows.filter((r) => r.person_answered).length,
    person_typed: rows.reduce((a, r) => ({ text: a.text + (r.person_answered?.text || 0), pick: a.pick + (r.person_answered?.pick || 0) }), { text: 0, pick: 0 }),
    card: { answers: stats(rows.map((r) => r.card?.answers)), new_answers: stats(rows.map((r) => r.card?.new_answers)), read_ms_model: stats(rows.map((r) => r.card?.read_ms_model)), person_ms_model: stats(rows.map((r) => r.card?.person_ms_model)) },
    steps_ms: Object.fromEntries(Object.entries(step).map(([k, v]) => [k, stats(v)])),
    visibility_at_prepare: rows.reduce((a, r) => ((a[r.timing?.visibility_at_prepare ?? "unknown"] = (a[r.timing?.visibility_at_prepare ?? "unknown"] || 0) + 1), a), {}),
    queue_states: q.items.reduce((a, x) => ((a[x.state] = (a[x.state] || 0) + 1), a), {}),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ report, rows }, null, 1) + "\n");
  const s = (x) => (x == null ? "-" : (x / 1000).toFixed(2) + "s");
  console.log(`WO-042 ${LABEL}: ${sent.length}/${N} confirmed in ${s(wall_ms)} (${s(report.per_application_ms)} each; ${report.projected_in_30_min} in 30 min at this pace) [${report.labels.session}]`);
  console.log(`  wrong-answer submissions ${report.wrong_answer_submissions}; field precision ${(report.field_precision * 100).toFixed(1)}%, coverage ${(report.field_coverage * 100).toFixed(1)}%; cards needing the person ${report.blocked_cards} (typed ${report.person_typed.text}, picked ${report.person_typed.pick})`);
  for (const [k, v] of Object.entries(report.steps_ms)) console.log(`  ${k.padEnd(26)} p50 ${s(v.p50)}  p90 ${s(v.p90)}  max ${s(v.max)}`);
  console.log(`  card answers p50 ${report.card.answers.p50}, new p50 ${report.card.new_answers.p50}; modeled reading p50 ${s(report.card.read_ms_model.p50)} p90 ${s(report.card.read_ms_model.p90)}`);
  console.log(`  wrote ${path.relative(ROOT, OUT)}`);
}

// The person answers what is still open, on the page, with real input (trusted events). Returns what they did by hand.
async function personAnswers(sw, page, tabId) {
  const now = await sw.evaluate(async (id) => {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
      const D = globalThis.TraineeCore.dom, f = D.readForm();
      return f.schema.map((s) => ({ ...s, b: f.bindings[s.name], value: D.readValue(f.bindings[s.name]) }));
    } });
    return result;
  }, tabId);
  const loc = (sel) => (/^upmore-idx-/.test(sel) ? page.locator("input,select,textarea").nth(Number(sel.slice(11))) : page.locator(sel).first());
  const did = { text: 0, pick: 0, skipped_widgets: 0 };
  for (const f of now) {
    if (!f.required || f.value) continue;
    const b = f.b;
    if (b.widget) {
      did.skipped_widgets++;
      continue;
    }
    if (b.inputType === "text") {
      // What a person types depends on the field: a number field takes a number, a date field a date.
      const type = await loc(b.selector).getAttribute("type").catch(() => "text");
      const value = type === "number" ? "3" : type === "date" ? "2026-11-02" : type === "email" ? "test.person@example.test" : "TEST answer typed by the person";
      await loc(b.selector).fill(value);
      did.text++;
    } else if (b.inputType === "select") {
      await loc(b.selector).focus();
      await page.keyboard.press("ArrowDown");
      did.pick++;
    } else if (b.inputType === "radio_group" || b.inputType === "checkbox_group") {
      await loc(b.options[b.options.length - 1].selector).check();
      did.pick++;
    } else if (b.inputType === "checkbox") {
      await loc(b.selector).check();
      did.pick++;
    }
  }
  return did;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
