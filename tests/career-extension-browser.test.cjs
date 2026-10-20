"use strict";
// WO-031: the browser extension, loaded unpacked into a real Chromium, against the captured application forms
// (tests/fixtures/forms-ci) served at their real URLs by a local TEST world (tests/fixtures/extension/world.cjs). Chromium
// resolves only the world's hosts (MAP * ~NOTFOUND): nothing reaches a real employer, Upmore or Supabase.
//
//   node --test tests/career-extension-browser.test.cjs
// Needs Playwright and a Chromium (UPMORE_PLAYWRIGHT_PATH, UPMORE_CHROMIUM_PATH; /opt/pw-browsers/chromium is used when
// present). Chromium refuses its sandbox as root: run as a normal user, or set UPMORE_CHROMIUM_SANDBOX=off on a
// throwaway machine. Without Playwright or a Chromium the suite skips and says why.
//
// Field accuracy: each form is filled from the complete TEST persona (tests/fixtures/extension/persona.ts), given to the
// extension the way a real person's answers arrive (career_apply_answers_own rows, "fact:<name>"). What the card says
// Trainee filled is compared with tests/fixtures/extension/answer-key.json. Precision = filled correctly / filled;
// coverage = filled correctly / fields the key says should be filled. Reported per family, dev and held-out separately,
// and written to EXTENSION_ACCURACY_OUT when set.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { startWorld } = require("./fixtures/extension/world.cjs");

const ROOT = path.join(__dirname, "..");
const EXT = path.join(ROOT, "extension");
const KEY = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/extension/answer-key.json"), "utf8"));
const RESUME = { name: "test-person-resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% TEST resume for WO-031, not a real person\n") };

let pw = null, blocked = null;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try {
    pw = require(id);
    break;
  } catch { /* next */ }
}
if (!pw) blocked = "PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH; nothing was downloaded";
// An unpacked extension loads only in Chromium (branded Google Chrome 137+ ignores --load-extension): the extension's
// own Chromium if named, else Playwright's, else this machine's, else the gate's browser.
const CHROME = [process.env.UPMORE_EXTENSION_CHROMIUM_PATH, (() => {
  try {
    return pw && pw.chromium.executablePath();
  } catch {
    return null;
  }
})(), "/opt/pw-browsers/chromium", process.env.UPMORE_CHROMIUM_PATH].find((p) => p && fs.existsSync(p));
const SANDBOX_OFF = process.env.UPMORE_CHROMIUM_SANDBOX === "off";

let world, ctx, sw, persona;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "trainee-ext-profile-"));
  const c = await pw.chromium.launchPersistentContext(ud, {
    headless: true,
    ...(CHROME ? { executablePath: CHROME } : {}),
    ...(SANDBOX_OFF ? {} : { chromiumSandbox: true }),
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--host-resolver-rules=${world.hostRules}`,
      "--ignore-certificate-errors", "--no-proxy-server", ...(SANDBOX_OFF ? ["--no-sandbox"] : []),
    ],
  });
  let w = c.serviceWorkers()[0];
  if (!w) {
    try {
      w = await c.waitForEvent("serviceworker", { timeout: 15000 });
    } catch {
      await c.close();
      throw Error(`EXTENSION_NOT_LOADED: ${CHROME || "the default browser"} did not load the unpacked extension (set UPMORE_EXTENSION_CHROMIUM_PATH to a Chromium)`);
    }
  }
  return { c, w, ud };
}

const tabIdOf = (url) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u || t.pendingUrl === u)?.id ?? null, url);
const cardOf = (id) => sw.evaluate(async (t) => ((await chrome.storage.session.get("cards")).cards || {})[t] || null, id);
async function waitCard(id, pred, ms = 20000) {
  const end = Date.now() + ms;
  let c = null;
  while (Date.now() < end) {
    c = await cardOf(id);
    if (c && pred(c)) return c;
    await sleep(100);
  }
  throw Error("card did not reach the state in time: " + JSON.stringify(c && { status: c.status, message: c.message, url: c.url, blockers: c.blockers }));
}
async function openPanel(tabId) {
  const url = `chrome-extension://${new URL(sw.url()).host}/panel.html` + (tabId === null ? "" : `?tab=${tabId}`);
  const waiting = ctx.waitForEvent("page", { predicate: (p) => p.url() === url, timeout: 10000 });
  await sw.evaluate((u) => chrome.windows.create({ url: u, type: "popup", focused: false, width: 440, height: 900 }), url);
  const p = await waiting;
  await p.waitForLoadState("domcontentloaded");
  return p;
}
// A posting in its own tab with the panel beside it (its own window, so the form stays the visible tab).
async function openForm(url) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(150);
  const tabId = await tabIdOf(page.url());
  const panel = await openPanel(tabId);
  return { page, tabId, panel };
}
async function closeForm(f) {
  await f.panel.close().catch(() => {});
  await f.page.close().catch(() => {});
}
async function fill(f) {
  await f.panel.click("#fill");
  return await waitCard(f.tabId, (c) => ["ready", "blocked", "stopped"].includes(c.status) && (c.payload || c.status === "stopped"));
}
const traineeFields = (card) => (card.payload?.fields || []).filter((x) => x.source === "trainee");

before(async () => {
  if (blocked) return;
  try {
    persona = JSON.parse(execFileSync(process.env.DENO_BIN || "deno", ["run", "--allow-read", path.join(__dirname, "fixtures/extension/persona.ts")], { encoding: "utf8" }));
  } catch (e) {
    blocked = "DENO_UNAVAILABLE: " + String(e.message).split("\n")[0];
    return;
  }
  world = await startWorld();
  for (const [k, v] of Object.entries(persona)) world.answer("fact:" + k, "fact", v);
  try {
    ({ c: ctx, w: sw } = await launch());
  } catch (e) {
    blocked = "BROWSER_UNAVAILABLE: " + String(e.message).split("\n")[0];
    return;
  }
  // The person signs in the way they already are: the Upmore app's own session, picked up from its tab.
  const app = await ctx.newPage();
  await app.goto("https://upmore-topaz.vercel.app/");
  const panel = await openPanel(null);
  await panel.click("#use-app");
  await panel.waitForSelector("#page:not([hidden])", { timeout: 10000 });
  await panel.setInputFiles("#resume", RESUME);
  await panel.waitForFunction(() => document.getElementById("resume-name").textContent.includes(".pdf"));
  await panel.close();
  await app.close();
});
after(async () => {
  await ctx?.close().catch(() => {});
  await world?.close();
});
const skip = (t) => {
  if (blocked) {
    t.skip(blocked);
    return true;
  }
  return false;
};

// ------------------------------------------------------------------------------------------------ sign-in
test("auth: the session lives only in chrome.storage.session, no token in local storage, no password anywhere", async (t) => {
  if (skip(t)) return;
  const s = await sw.evaluate(async () => ({ session: await chrome.storage.session.get(null), local: await chrome.storage.local.get(null) }));
  assert.equal(s.session.auth.user_id, world.userId);
  assert.ok(s.session.auth.access_token && s.session.auth.refresh_token);
  assert.ok(!JSON.stringify(s.local).includes(s.session.auth.access_token), "no token in chrome.storage.local");
  assert.ok(!JSON.stringify(s.local).includes(s.session.auth.refresh_token), "no refresh token in chrome.storage.local");
  assert.ok(!/password/i.test(JSON.stringify(s)), "no password anywhere the extension keeps");
  assert.equal(JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8")).manifest_version, 3);
});

test("auth: a service-role key in the app tab is refused; the person's own session is taken", async (t) => {
  if (skip(t)) return;
  const kept = await sw.evaluate(async () => (await chrome.storage.session.get("auth")).auth);
  world.state.serviceKeySession = true;
  const app = await ctx.newPage();
  await app.goto("https://upmore-topaz.vercel.app/?service=1");
  const panel = await openPanel(null);
  try {
    await sw.evaluate(() => chrome.storage.session.remove("auth"));
    const r = await panel.evaluate(() => chrome.runtime.sendMessage({ type: "signin-app" }));
    assert.equal(r.ok, false);
    assert.equal(await sw.evaluate(async () => (await chrome.storage.session.get("auth")).auth ?? null), null, "a service-role token is never kept");
  } finally {
    world.state.serviceKeySession = false;
    await app.goto("https://upmore-topaz.vercel.app/?person=1");
    const r = await panel.evaluate(() => chrome.runtime.sendMessage({ type: "signin-app" }));
    assert.equal(r.ok, true);
    assert.equal((await sw.evaluate(async () => (await chrome.storage.session.get("auth")).auth)).user_id, kept.user_id);
    await panel.close();
    await app.close();
  }
});

test("auth: a sign-in link is asked for by email (no account created, no password, no code typed anywhere)", async (t) => {
  if (skip(t)) return;
  const panel = await openPanel(null);
  const out = await panel.evaluate(() => chrome.runtime.sendMessage({ type: "signin-magic", email: "test.person@example.test" }));
  assert.equal(out.ok, true);
  assert.match(out.message, /Open the link/);
  const sent = world.state.otp.at(-1);
  assert.deepEqual(sent, { email: "test.person@example.test", redirect_to: "https://upmore-topaz.vercel.app", create_user: false });
  await panel.close();
});

// ------------------------------------------------------------------------------------------------ field accuracy
// The answer key's grading, shared with the 60-in-30 benchmark (evals/apply/sixty-in-thirty.cjs).
const { norm, same, emptyish, expectedValue: expectedFrom } = require("./fixtures/extension/grade.cjs");
const expectedValue = (spec, field, isWidget) => expectedFrom(spec, field, isWidget, persona, RESUME.name);

const results = [];
for (const f of (KEY.forms ? Object.keys(KEY.forms) : [])) {
  test(`accuracy: ${f}`, async (t) => {
    if (skip(t)) return;
    const form = await openForm(world.urlOf(f));
    try {
      const card = await fill(form);
      assert.notEqual(card.status, "stopped", card.message);
      const schema = await form.page.evaluate(() => globalThis.__traineeSchema || null).catch(() => null);
      void schema;
      const key = KEY.forms[f];
      const fieldsNow = await sw.evaluate(async (id) => {
        const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
          const f = globalThis.TraineeCore.dom.readForm();
          return f.schema.map((s) => ({ ...s, widget: f.bindings[s.name].widget }));
        } });
        return result;
      }, form.tabId);
      const names = fieldsNow.map((x) => x.name);
      for (const n of names) assert.ok(Object.hasOwn(key, n), `the answer key covers ${n} on ${f}`);
      const byName = Object.fromEntries((card.payload?.fields || []).map((x) => [x.name, x]));
      const rows = [];
      for (const fld of fieldsNow) {
        const spec = key[fld.name];
        const want = expectedValue(spec, fld, !!fld.widget);
        const got = byName[fld.name];
        const filled = !!got && got.source === "trainee" && !emptyish(got.value);
        const chose = !!got && got.source === "trainee" && norm(got.value) === "no (left unchecked)";
        let verdict;
        if (want === "any") verdict = "any";
        else if (want === null) verdict = filled ? "wrong_filled" : "empty_ok";
        else if (filled || chose) verdict = same(got.value, want) ? "correct" : "wrong_value";
        else verdict = "missed";
        rows.push({ name: fld.name, label: fld.label.slice(0, 120), type: fld.type, widget: !!fld.widget, want, got: got ? got.value : null, verdict });
      }
      results.push({ form: f, family: f.split("-")[0], heldout: KEY.split.heldout.includes(f), rows, status: card.status });
      // Never an EEO answer the person did not give, never an identity number: the persona gave none.
      for (const x of traineeFields(card)) assert.ok(!/\b(gender|race|ethnicity|veteran|disability|hispanic)\b/i.test(x.label) || /sponsor|authori/i.test(x.label), `no EEO answer filled: ${x.label}`);
    } finally {
      await closeForm(form);
    }
  });
}

test("accuracy: report (precision and coverage per family; dev and held-out)", async (t) => {
  if (skip(t)) return;
  assert.ok(results.length >= 17, "every captured form was run");
  const agg = (rows) => {
    const filled = rows.filter((r) => ["correct", "wrong_value", "wrong_filled"].includes(r.verdict)).length;
    const correct = rows.filter((r) => r.verdict === "correct").length;
    const should = rows.filter((r) => r.want !== null && r.want !== "any").length;
    return { filled, correct, should, precision: filled ? correct / filled : 1, coverage: should ? correct / should : 1 };
  };
  const report = { measured_at: new Date().toISOString(), families: {} };
  for (const fam of ["greenhouse", "lever", "ashby"]) {
    const rs = results.filter((r) => r.family === fam);
    const all = rs.flatMap((r) => r.rows), dev = rs.filter((r) => !r.heldout).flatMap((r) => r.rows), held = rs.filter((r) => r.heldout).flatMap((r) => r.rows);
    const noWidget = all.filter((r) => !r.widget);
    report.families[fam] = {
      forms: rs.length, all: agg(all), dev: agg(dev), heldout: agg(held), excluding_widgets: agg(noWidget),
      misses: all.filter((r) => r.verdict === "missed").map((r) => ({ label: r.label, type: r.type, widget: r.widget, want: r.want })),
      wrong: all.filter((r) => r.verdict.startsWith("wrong")).map((r) => ({ label: r.label, type: r.type, want: r.want, got: r.got, verdict: r.verdict })),
    };
  }
  const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1) + "%";
  for (const [fam, r] of Object.entries(report.families)) {
    console.log(`${fam}: precision ${pct(r.all.precision)} (${r.all.correct}/${r.all.filled}), coverage ${pct(r.all.coverage)} (${r.all.correct}/${r.all.should}); held-out precision ${pct(r.heldout.precision)}, coverage ${pct(r.heldout.coverage)}; without react-select widgets coverage ${pct(r.excluding_widgets.coverage)}`);
  }
  if (process.env.EXTENSION_ACCURACY_OUT) fs.writeFileSync(process.env.EXTENSION_ACCURACY_OUT, JSON.stringify({ report, results }, null, 1));
  // Regression floors at what was measured (WO-042 Run 2, docs/architect/work-orders/WO-042-sixty-in-thirty.md): a
  // reader or planner change that loses ground fails here. Precision is held at 100%: one wrong answer fails the suite.
  // Every wrong fill is listed in the report and shown on the card, where the person reads it before the one tap.
  const FLOOR = { greenhouse: [1, 1], lever: [1, 0.96], ashby: [1, 0.94] };
  for (const [fam, r] of Object.entries(report.families)) {
    assert.ok(r.all.precision >= FLOOR[fam][0], `${fam} precision ${r.all.precision} fell below ${FLOOR[fam][0]}: ${JSON.stringify(r.wrong)}`);
    assert.ok(r.excluding_widgets.coverage >= FLOOR[fam][1], `${fam} coverage ${r.excluding_widgets.coverage} fell below ${FLOOR[fam][1]}`);
  }
});

// ------------------------------------------------------------------------------------------------ the submit
// The form as the extension reads it now: each field, its binding and its current value.
const formNow = (tabId) => sw.evaluate(async (id) => {
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
    const D = globalThis.TraineeCore.dom, f = D.readForm();
    return f.schema.map((s) => ({ ...s, b: f.bindings[s.name], value: D.readValue(f.bindings[s.name]) }));
  } });
  return result;
}, tabId);
// The person answers what is still open, on the page, with real input (trusted events): what a person does by hand.
async function personAnswers(form, values = {}) {
  const loc = (sel) => (/^upmore-idx-/.test(sel) ? form.page.locator("input,select,textarea").nth(Number(sel.slice(11))) : form.page.locator(sel).first());
  for (const f of await formNow(form.tabId)) {
    if (!f.required || f.value) continue;
    const b = f.b;
    if (b.widget) continue;
    if (b.inputType === "text") await loc(b.selector).fill(values[f.name] ?? "TEST answer typed by the person");
    // A person picks with the keyboard (Playwright's selectOption is a script setting the value, not a person).
    else if (b.inputType === "select") {
      await loc(b.selector).focus();
      await form.page.keyboard.press("ArrowDown");
    }
    else if (b.inputType === "radio_group" || b.inputType === "checkbox_group") await loc(b.options[b.options.length - 1].selector).check();
    else if (b.inputType === "checkbox") await loc(b.selector).check();
  }
}
async function readyCard(form) {
  let card = await fill(form);
  if (card.status === "blocked") {
    await personAnswers(form);
    card = await waitCard(form.tabId, (c) => c.status === "ready" || c.status === "stopped", 10000);
  }
  return card;
}
const fresh = () => {
  world.state.jobs = [];
  world.state.submits = [];
  world.state.begins = [];
  world.state.finishes = [];
};
const submitsFor = (id) => world.state.submits.filter((s) => s.form === id);

test("submit: nothing goes before the person's own tap; the tap sends exactly the reviewed answers once, recorded and evidenced", async (t) => {
  if (skip(t)) return;
  fresh();
  for (const id of ["lever-lyrahealth-35bffe8b-ac9f-4749-ba4c-5f3a4d2bd77d", "ashby-crusoe-b1b99030-d393-4329-80fe-5bc2e4c93b03"]) {
    const form = await openForm(world.urlOf(id));
    try {
      const card = await readyCard(form);
      assert.equal(card.status, "ready", card.message);
      const shape = Object.fromEntries((await formNow(form.tabId)).map((f) => [f.name, f.b]));
      await sleep(1500);
      assert.equal(submitsFor(id).length, 0, "nothing is sent while the card waits");
      // A click a script makes is not the person's tap.
      await form.panel.evaluate(() => document.getElementById("approve").click());
      await sleep(800);
      assert.equal(submitsFor(id).length, 0, "an untrusted click approves nothing");
      assert.equal(world.state.begins.filter((b) => b.p_payload.url === world.urlOf(id)).length, 0, "nothing recorded before the tap");
      await form.panel.click("#approve");
      const done = await waitCard(form.tabId, (c) => c.status === "done", 20000);
      assert.equal(done.result, "confirmed", done.message);
      const sent = submitsFor(id);
      assert.equal(sent.length, 1, "exactly one submission");
      // Exactly what the card showed: every typed answer as it was reviewed, the resume by name and bytes.
      for (const fld of card.payload.fields) {
        const b = shape[fld.name];
        if (b.inputType === "file") {
          assert.equal(sent[0].files[fld.name]?.name, RESUME.name, "the resume, by name");
          assert.equal(sent[0].files[fld.name]?.sha256, require("node:crypto").createHash("sha256").update(RESUME.buffer).digest("hex"), "and by its bytes");
          continue;
        }
        if (fld.value === "No (left unchecked)") {
          assert.equal(sent[0].fields[fld.name], undefined, `${fld.label}: left unchecked, so not sent`);
          continue;
        }
        const got = sent[0].fields[fld.name];
        assert.ok(got !== undefined, `${fld.label} reached the employer`);
        if (b.inputType === "text") assert.equal(got, fld.value, `${fld.label} exactly as reviewed`);
        // A radio's own value (a page that gives none sends "on", the browser's default, for the checked one).
        if (b.inputType === "radio_group" && got !== "on") assert.equal(got, b.options.find((o) => o.label === fld.value)?.value, `${fld.label} as reviewed`);
      }
      assert.equal(world.state.begins.at(-1).p_approval, card.hash, "the record is bound to the approved hash");
      const fin = world.state.finishes.at(-1);
      assert.equal(fin.p_state, "confirmed");
      assert.ok(fin.p_evidence.answers.length >= card.payload.fields.length - 1);
      assert.match(fin.p_evidence.screenshot_sha256, /^[0-9a-f]{64}$/);
      assert.match(fin.p_evidence.confirmation_text, /Thank you for applying/);
      assert.ok(fin.p_evidence.ms_card_to_done > 0);
      const local = await sw.evaluate(async () => (await chrome.storage.local.get("evidence")).evidence[0]);
      assert.equal(local.job_id, card.payload.job_id);
      assert.match(local.screenshot, /^data:image\/png;base64,/);
      assert.equal(local.state, "confirmed");
    } finally {
      await closeForm(form);
    }
  }
});

test("submit: the same posting twice is refused by the record, so nothing is sent again", async (t) => {
  if (skip(t)) return;
  const id = "lever-lyrahealth-35bffe8b-ac9f-4749-ba4c-5f3a4d2bd77d";
  const before = submitsFor(id).length;
  assert.ok(world.state.jobs.some((j) => j.job_id.includes("35bffe8b")), "the earlier application is on record");
  const form = await openForm(world.urlOf(id));
  try {
    const card = await readyCard(form);
    assert.equal(card.status, "ready");
    await form.panel.click("#approve");
    const stopped = await waitCard(form.tabId, (c) => c.status === "stopped").catch(async (e) => {
      const p = await form.panel.evaluate(() => ({ status: document.getElementById("status").textContent, disabled: document.getElementById("approve").disabled, hash: document.getElementById("approve").dataset.hash }));
      const c = await cardOf(form.tabId);
      const trail = await sw.evaluate(async (id) => ((await chrome.storage.session.get("card_trail")).card_trail || []).filter((x) => x.tabId === id), form.tabId);
      throw Error(e.message + " panel=" + JSON.stringify(p) + " card.hash=" + c?.hash + " begins=" + world.state.begins.length + " trail=" + JSON.stringify(trail));
    });
    assert.match(stopped.message, /already applied/);
    await sleep(500);
    assert.equal(submitsFor(id).length, before, "nothing sent");
  } finally {
    await closeForm(form);
  }
});

test("zero wrong answers: a value changed after review blocks the submit; nothing is recorded or sent", async (t) => {
  if (skip(t)) return;
  fresh();
  const id = "ashby-airwallex-cba0ab2e-5ab8-416b-ac9b-115638e3c65c";
  const form = await openForm(world.urlOf(id));
  try {
    const card = await readyCard(form);
    assert.equal(card.status, "ready", card.message);
    // A page script rewrites an answer the person already reviewed (no trusted event: the card does not move).
    await form.page.evaluate(() => {
      const el = document.querySelector("[name='_systemfield_email']");
      el.value = "planted@wrong.example.test";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await form.panel.click("#approve");
    const stopped = await waitCard(form.tabId, (c) => c.status === "stopped" || c.status === "done" || c.status === "blocked");
    assert.notEqual(stopped.status, "done");
    assert.match(String(stopped.message), /changed after you reviewed|set by the page|Not ready/);
    await sleep(800);
    assert.equal(submitsFor(id).length, 0, "the changed application never went");
    assert.equal(world.state.begins.length, 0, "and was never recorded as started");
  } finally {
    await closeForm(form);
  }
});

test("zero wrong answers: a value the page set itself (nobody gave it) blocks the tap", async (t) => {
  if (skip(t)) return;
  fresh();
  const id = "lever-tsmg-9e43a7f6-3476-482f-9cdd-ed5b73fb9df7";
  const form = await openForm(world.urlOf(id, "prefill"));
  try {
    await fill(form);
    await personAnswers(form);
    const card = await waitCard(form.tabId, (c) => c.status === "blocked" && c.payload?.fields.some((x) => x.source === "page"), 10000);
    assert.ok(card.lines.some((l) => /set by the page/.test(l)));
    assert.equal(await form.panel.isDisabled("#approve"), true, "the tap is not offered");
    const r = await form.panel.evaluate((h) => chrome.runtime.sendMessage({ type: "approve", tabId: Number(new URLSearchParams(location.search).get("tab")), hash: h }), card.hash);
    assert.equal(r.ok, false, "an approval of a blocked card is refused");
    await sleep(800);
    assert.equal(submitsFor(id).length, 0);
  } finally {
    await closeForm(form);
  }
});

test("verification: a challenge on the page stops before anything is filled and hands off to the person", async (t) => {
  if (skip(t)) return;
  fresh();
  const id = "lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027";
  const form = await openForm(world.urlOf(id, "captcha"));
  try {
    const card = await fill(form);
    assert.equal(card.status, "stopped");
    assert.match(card.message, /verification check.*yourself.*never answers one/i);
    assert.equal((await formNow(form.tabId)).filter((f) => f.value).length, 0, "nothing was filled");
  } finally {
    await closeForm(form);
  }
  // A challenge that appears after the review: the tap stops, nothing is sent.
  const id2 = "ashby-crusoe-b1b99030-d393-4329-80fe-5bc2e4c93b03";
  const f2 = await openForm(world.urlOf(id2));
  try {
    const card = await readyCard(f2);
    assert.equal(card.status, "ready");
    await f2.page.evaluate(() => {
      const fr = document.createElement("iframe");
      fr.src = "https://www.google.com/recaptcha/api2/bframe?k=TEST";
      fr.style.cssText = "display:block;width:320px;height:200px";
      document.body.appendChild(fr);
    });
    await f2.panel.click("#approve");
    const stopped = await waitCard(f2.tabId, (c) => c.status === "stopped");
    assert.match(stopped.message, /verification check/);
    await sleep(800);
    assert.equal(submitsFor(id2).length, 0);
    assert.equal(world.state.begins.length, 0);
  } finally {
    await closeForm(f2);
  }
});

test("identity numbers: never filled, typed by the person, masked in the screenshot, never in any record", async (t) => {
  if (skip(t)) return;
  fresh();
  const id = "ashby-crusoe-b1b99030-d393-4329-80fe-5bc2e4c93b03";
  const form = await openForm(world.urlOf(id, "ssn"));
  try {
    await form.page.evaluate(() => {
      window.__masks = 0;
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.getAttribute?.("data-trainee-mask") && window.__masks++)))
        .observe(document.documentElement, { childList: true });
    });
    const card = await fill(form);
    assert.equal(await form.page.inputValue("#ssn_test"), "", "Trainee never fills it");
    assert.ok(card.lines.some((l) => /Type this yourself on the form: Social Security Number/.test(l)));
    await form.page.fill("#ssn_test", "123-45-6789");
    const ready = await waitCard(form.tabId, (c) => c.status === "ready", 10000);
    const ssnField = ready.payload.fields.find((f) => f.name === "ssn_test");
    assert.equal(ssnField.source, "you");
    assert.ok(!JSON.stringify(ready).includes("123-45-6789"), "the card never carries the number");
    await form.panel.click("#approve");
    await waitCard(form.tabId, (c) => c.status === "done", 20000);
    assert.ok((await form.page.evaluate(() => window.__masks).catch(() => 1)) >= 1, "the field was covered for the screenshot");
    const everything = JSON.stringify({ b: world.state.begins, f: world.state.finishes, local: await sw.evaluate(async () => (await chrome.storage.local.get("evidence")).evidence.map((e) => ({ ...e, screenshot: null }))) });
    assert.ok(!everything.includes("123-45-6789"), "no identity number in the record or the local evidence");
    assert.equal(submitsFor(id)[0].fields.ssn_test, "123-45-6789", "the person's own answer went to the employer as they typed it");
  } finally {
    await closeForm(form);
  }
});

test("ask once: a required question nobody answered is stored once; answered once by text, it fills the next form", async (t) => {
  if (skip(t)) return;
  fresh();
  const saved = world.state.answers;
  world.state.answers = saved.filter((a) => a.key !== "fact:sponsorship");
  // A new browser session: nothing has been stored from this browser yet.
  await sw.evaluate(() => chrome.storage.session.remove("asked"));
  const calls = world.state.putCalls.length;
  try {
    const id = "lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027";
    let form = await openForm(world.urlOf(id));
    let card = await fill(form);
    assert.ok(card.openRequired.some((l) => /sponsorship/i.test(l)));
    await waitFor(() => world.state.putCalls.length > calls);
    const put = world.state.putCalls.at(-1);
    assert.ok(put.p_questions.some((q) => q.key === "fact:sponsorship"), JSON.stringify(put.p_questions.map((q) => q.key)));
    await closeForm(form);
    // The same posting again in this session: not stored twice.
    form = await openForm(world.urlOf(id) + "?again=1");
    await fill(form);
    await sleep(500);
    assert.equal(world.state.putCalls.length, calls + 1, "asked once");
    await closeForm(form);
    // The person answers Trainee by text; the next form with the same question fills from it.
    world.answer("fact:sponsorship", "fact", "No");
    const id2 = "lever-lyrahealth-35bffe8b-ac9f-4749-ba4c-5f3a4d2bd77d";
    form = await openForm(world.urlOf(id2));
    card = await fill(form);
    const spons = card.payload.fields.find((f) => /sponsorship/i.test(f.label));
    assert.equal(spons.value, "No");
    assert.equal(spons.source, "trainee");
    assert.match(spons.factId, /^text-answer:/);
    await closeForm(form);
  } finally {
    world.state.answers = saved;
  }
});

async function waitFor(pred, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return;
    await sleep(50);
  }
  throw Error("timed out");
}

test("queue: postings open one after another, each fills and waits for its tap; time from card to confirmed is measured", async (t) => {
  if (skip(t)) return;
  fresh();
  const ids = ["lever-lyrahealth-35bffe8b-ac9f-4749-ba4c-5f3a4d2bd77d", "ashby-crusoe-b1b99030-d393-4329-80fe-5bc2e4c93b03",
    "ashby-airwallex-cba0ab2e-5ab8-416b-ac9b-115638e3c65c", "lever-cgsfederal-0130d854-9bae-48d4-8ef0-e9da1ee778a5",
    "ashby-lilt-production-959498b8-a18e-457b-9e93-07662c38f3d3"];
  const page = await ctx.newPage();
  await page.goto("https://upmore-topaz.vercel.app/?queue=1");
  await sleep(100);
  const tabId = await tabIdOf(page.url());
  assert.equal(typeof tabId, "number");
  const panel = await openPanel(tabId);
  const times = [];
  try {
    await panel.fill("#links", ids.map((id) => world.urlOf(id)).join("\n") + "\nhttps://www.linkedin.com/jobs/view/123 (never queued)");
    await panel.click("#q-add");
    const q = await sw.evaluate(async () => (await chrome.storage.session.get("queue")).queue);
    assert.equal(q.items.length, ids.length, "only Greenhouse, Lever and Ashby postings are queued");
    const wall = Date.now();
    await panel.click("#q-start");
    for (const id of ids) {
      const url = world.urlOf(id);
      await waitFor(() => page.url() === url, 15000);
      const form = { page, tabId, panel };
      let card = await waitCard(tabId, (c) => c.url === url && ["ready", "blocked"].includes(c.status), 20000);
      if (card.status === "blocked") {
        await personAnswers(form);
        card = await waitCard(tabId, (c) => c.url === url && c.status === "ready", 10000);
      }
      await panel.click("#approve");
      const done = await waitCard(tabId, (c) => c.url === url && c.status === "done", 20000);
      assert.equal(done.result, "confirmed", `${id}: ${done.message}`);
      times.push(done.ms);
    }
    const queue = await sw.evaluate(async () => (await chrome.storage.session.get("queue")).queue);
    assert.deepEqual(queue.items.map((x) => x.state), ids.map(() => "confirmed"), JSON.stringify(queue));
    assert.equal(world.state.submits.length, ids.length, "one submission per approved posting");
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`queue: ${ids.length} applications, card shown to employer confirmed: ${times.map((x) => (x / 1000).toFixed(2) + "s").join(", ")}; average ${(avg / 1000).toFixed(2)}s; wall clock including the TEST person's typing ${((Date.now() - wall) / 1000).toFixed(1)}s`);
    if (process.env.EXTENSION_ACCURACY_OUT) {
      const out = JSON.parse(fs.readFileSync(process.env.EXTENSION_ACCURACY_OUT, "utf8"));
      out.queue = { n: ids.length, ms_card_to_confirmed: times, avg_ms: avg, wall_ms: Date.now() - wall };
      fs.writeFileSync(process.env.EXTENSION_ACCURACY_OUT, JSON.stringify(out, null, 1));
    }
    assert.ok(times.every((x) => x < 10000), "each under 10 seconds from card to confirmed");
  } finally {
    await sw.evaluate(() => chrome.storage.session.set({ queue: { items: [], index: -1, tabId: null, running: false } }));
    await panel.close();
    await page.close();
  }
});

test("Workday: recognized, said plainly, only the basic contact fields filled; never claimed", async (t) => {
  if (skip(t)) return;
  const url = "https://acme.wd1.myworkdayjobs.com/en-US/External/job/Chicago/Analyst_R123/apply";
  const form = await openForm(url);
  try {
    const card = await fill(form);
    assert.ok(card.lines.includes("Workday needs you signed in on the employer's site; I fill the fields I can."));
    const mine = traineeFields(card).map((f) => f.name).sort();
    assert.deepEqual(mine, ["email", "legalName--firstName", "legalName--lastName", "phoneNumber"]);
    assert.ok(card.openRequired.some((l) => /authorized/i.test(l)) && card.openRequired.some((l) => /sponsorship/i.test(l)), "the rest is the person's, on the employer's site");
  } finally {
    await closeForm(form);
  }
});

module.exports = { expectedValue };
