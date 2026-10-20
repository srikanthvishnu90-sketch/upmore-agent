"use strict";
// WO-048: the extension on Workday, loaded unpacked into a real Chromium, on the TEST Workday-shaped tenants
// (tests/fixtures/workday/dev-a, dev-b; written from public sources by a separate writer, see sources.md) served at a
// Workday tenant's URL by the TEST world (tests/fixtures/extension/world.cjs: Chromium resolves only the world's hosts).
//
//   UPMORE_CHROMIUM_SANDBOX=off node --test tests/career-extension-workday.test.cjs
//
// What is held here: each step's card shows that step's answers exactly as Save and Continue sends them, and one tap
// approves that exact payload (a changed page, a verification, a value the page set: nothing is saved); nothing is saved
// before the tap; a sign-in page is never read, filled or clicked; voluntary disclosures are only the person's own; the
// disability form is the person's; Workday's own values are shown as Workday's; the Submit on the review step is its own
// tap; zero wrong answers on both development tenants (evals/apply/workday-fill.cjs).
// Evidence label: VERIFIED-S on TEST Workday-shaped pages; real Workday NOT_RUN.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startWorld } = require("./fixtures/extension/world.cjs");
const W = require("../evals/apply/workday-fill.cjs");

const FIX = path.join(__dirname, "fixtures/workday");
const PERSONA = JSON.parse(fs.readFileSync(path.join(FIX, "persona.json"), "utf8")).facts;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DRAFT = (e) => `Save and Continue sends this page to ${e} as a draft; nothing is submitted.`;

let world, browser, ctx, sw, blocked = null;
const tenants = {};
before(async () => {
  try {
    world = await startWorld();
    tenants.a = world.workdayTenant({ host: "northwind.wd5.myworkdayjobs.com", dir: path.join(FIX, "dev-a") });
    tenants.b = world.workdayTenant({ host: "contoso.wd1.myworkdayjobs.com", dir: path.join(FIX, "dev-b") });
    tenants.s = world.workdayTenant({ host: "fabrikam.wd3.myworkdayjobs.com", dir: path.join(FIX, "dev-a"), files: { "0-sign-in.html": path.join(FIX, "signin/0-sign-in.html") } });
    for (const [k, v] of Object.entries(PERSONA)) world.answer("fact:" + k, "fact", String(v));
    browser = await W.launch(world);
    ({ ctx, sw } = browser);
    await W.signIn(ctx, sw);
  } catch (e) {
    blocked = "BROWSER_UNAVAILABLE: " + String(e.message).split("\n")[0];
  }
});
after(async () => {
  await browser?.close();
  await world?.close();
});
const skip = (t) => {
  if (!blocked) return false;
  if (process.env.CI === "true") assert.fail("CI cannot skip the Workday suite: " + blocked);
  t.skip(blocked);
  return true;
};

async function open(url) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(150);
  const tabId = await W.tabIdOf(sw, page.url());
  const panel = await W.openPanel(ctx, sw, tabId);
  return { page, tabId, panel, close: async () => (await panel.close().catch(() => {}), await page.close().catch(() => {})) };
}
const cardFor = (f, pred = () => true, ms = 60000) => W.waitCard(sw, f.tabId, (c) => c.url === f.page.url() && ["ready", "blocked", "stopped"].includes(c.status) && pred(c), ms);
async function fill(f) {
  await f.panel.click("#fill");
  const c = await cardFor(f);
  assert.ok(c, "a card for this step");
  return c;
}
const traineeOf = (c) => (c.payload?.fields || []).filter((x) => x.source === "trainee");
const drafts = () => sw.evaluate(async () => (await chrome.storage.local.get("workday_drafts")).workday_drafts || []);
const saved = (f, step) => f.page.evaluate((k) => Object.keys(sessionStorage).filter((x) => x.endsWith(":" + k)), step);
const session = () => sw.evaluate(async () => JSON.stringify({ s: await chrome.storage.session.get(null), l: await chrome.storage.local.get(null) }));
const factRow = (k) => world.state.answers.find((a) => a.key === "fact:" + k);

test("a step's card: its answers exactly as sent, what Save and Continue does; nothing saved before the tap; the tap saves exactly that step", async (t) => {
  if (skip(t)) return;
  const f = await open(tenants.a.url("1-my-information.html"));
  try {
    const card = await fill(f);
    assert.equal(card.status, "ready", JSON.stringify(card.blockers));
    assert.equal(card.action, "draft");
    assert.ok(card.lines.includes(DRAFT("northwind")), "the card says a draft goes and nothing is submitted");
    assert.ok(card.lines.includes("First Name: Test") && card.lines.includes("Phone Number: 555 010 0000"));
    assert.equal(await f.panel.textContent("#approve"), "Approve this page: Save and Continue");
    // Nothing leaves before the tap: the page has not saved, no draft is kept, nothing is recorded.
    await sleep(1500);
    assert.match(f.page.url(), /1-my-information\.html$/);
    assert.deepEqual(await saved(f, "1-my-information"), []);
    assert.equal((await drafts()).length, 0);
    // A tap on another payload is refused.
    const wrong = await f.panel.evaluate(async (tab) => await chrome.runtime.sendMessage({ type: "approve", tabId: tab, hash: "0".repeat(64) }), f.tabId);
    assert.equal(wrong.ok, false);
    await sleep(500);
    assert.match(f.page.url(), /1-my-information\.html$/, "no Save and Continue for a payload nobody approved");
    // The tap: Save and Continue, once, with exactly the approved answers; the next step fills itself.
    await f.panel.click("#approve");
    await f.page.waitForURL(/2-my-experience\.html$/, { timeout: 20000 });
    const kept = await drafts();
    assert.equal(kept.length, 1);
    assert.equal(kept[0].approval_hash, card.hash, "the draft kept is the approved payload");
    assert.deepEqual(kept[0].approved_answers, card.payload.fields);
    assert.equal(world.state.begins.length, 0, "a draft is never an application record");
    const next = await cardFor(f, (c) => c.step === "My Experience", 60000);
    assert.ok(next, "the next step filled itself after the approved Save and Continue");
    assert.ok(traineeOf(next).some((x) => /Work Experience 1: Company/.test(x.label) && x.value === "Example Analytics"));
  } finally {
    await f.close();
  }
});

test("every stop rule applies per step: a value changed after the card, a verification showing, a value the page set", async (t) => {
  if (skip(t)) return;
  const f = await open(tenants.b.url("3-questions.html"));
  try {
    // The person answers what is theirs, so the card is ready.
    let card = await fill(f);
    await f.page.locator('[data-automation-id="formField-cdbd4e9b56940fb1d6a038b49f140d79"] textarea').fill("TEST answer typed by the person");
    await f.page.locator('[data-automation-id="formField-9c2b219960adc5e750fdc326707b1e95"] input[type=checkbox]').first().check();
    card = await cardFor(f, (c) => c.status === "ready", 15000);
    assert.ok(card, "ready once the person answered");
    // 1. A page script changes an answer after the card: the tap saves nothing.
    await f.page.evaluate(() => {
      const ta = document.querySelector('[data-automation-id="formField-cdbd4e9b56940fb1d6a038b49f140d79"] textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, "PLANTED by a page script");
    });
    await f.panel.click("#approve");
    const stopped = await W.waitCard(sw, f.tabId, (c) => c.status === "stopped", 15000);
    assert.match(stopped.message, /changed after you reviewed it/);
    await sleep(500);
    assert.match(f.page.url(), /3-questions\.html$/);
    assert.deepEqual(await saved(f, "3-questions"), []);
    // 2. A value the page sets while the person works is the page's: the card blocks the tap.
    await f.page.locator('[data-automation-id="formField-cdbd4e9b56940fb1d6a038b49f140d79"] textarea').fill("TEST answer typed by the person");
    await f.page.evaluate(() => {
      const d = document.querySelector('[data-automation-id="formField-54951b18f40dd3b34928972850c2f074"] [data-automation-id="dateSectionYear-input"]');
      d.value = "2031";
    });
    await f.page.locator('[data-automation-id="formField-cdbd4e9b56940fb1d6a038b49f140d79"] textarea').type(" more");
    card = await W.waitCard(sw, f.tabId, (c) => c.status === "blocked" && (c.blockers || []).some((b) => /set by the page/.test(b)), 15000);
    assert.ok(card, "a value nobody gave blocks the tap");
    await f.page.evaluate(() => (document.querySelector('[data-automation-id="formField-54951b18f40dd3b34928972850c2f074"] [data-automation-id="dateSectionYear-input"]').value = ""));
    await f.page.locator('[data-automation-id="formField-cdbd4e9b56940fb1d6a038b49f140d79"] textarea').type(".");
    card = await cardFor(f, (c) => c.status === "ready", 15000);
    assert.ok(card);
    // 3. A verification shows up before the tap lands: handed to the person, nothing saved.
    await f.page.evaluate(() => {
      const fr = document.createElement("iframe");
      fr.src = "https://www.google.com/recaptcha/api2/bframe?k=TEST";
      fr.style.cssText = "display:block;width:300px;height:150px";
      document.body.appendChild(fr);
    });
    await f.panel.click("#approve");
    const handed = await W.waitCard(sw, f.tabId, (c) => c.status === "stopped", 15000);
    assert.match(handed.message, /verification check/);
    assert.match(f.page.url(), /3-questions\.html$/);
    assert.equal((await drafts()).filter((d) => /3-questions/.test(d.url)).length, 0);
  } finally {
    await f.close();
  }
});

test("a sign-in page is never read, filled or clicked; the password never reaches Trainee; the step after it fills itself", async (t) => {
  if (skip(t)) return;
  const f = await open(tenants.s.url("0-sign-in.html"));
  try {
    // The person has typed their password already (their own keys).
    const secret = "TEST-pw-" + Math.random().toString(36).slice(2);
    await f.page.locator("#input-5").fill(secret);
    const before = await f.page.evaluate(() => ({ clicks: window.__clicks.length, focus: window.__passwordFocus }));
    const card = await fill(f);
    assert.equal(card.status, "stopped");
    assert.equal(card.message, "Sign in to fabrikam's Workday yourself; I'll fill the application after.");
    assert.equal(card.payload, undefined, "nothing on the page was read into a card");
    const after = await f.page.evaluate(() => ({ clicks: window.__clicks.slice(), focus: window.__passwordFocus, email: document.getElementById("input-4").value }));
    assert.equal(after.clicks.length, before.clicks, "nothing was clicked");
    assert.equal(after.focus, before.focus, "the password box was never touched");
    assert.equal(after.email, "", "the account email is never filled");
    assert.ok(!(await session()).includes(secret), "the password is nowhere the extension keeps anything");
    // The person signs in themselves; the application's first step then fills itself.
    await f.page.locator("#input-4").fill("test.person@example.test");
    await f.page.locator('[data-automation-id="click_filter"][aria-label="Sign In"]').click();
    await f.page.waitForURL(/1-my-information\.html$/, { timeout: 15000 });
    const next = await cardFor(f, (c) => c.step === "My Information", 60000);
    assert.ok(next && traineeOf(next).length > 5, "filled after the person signed in");
    assert.ok(!(await session()).includes(secret));
  } finally {
    await f.close();
  }
});

test("voluntary disclosures: never a default; a decline only where the form offers one; the disability form is the person's", async (t) => {
  if (skip(t)) return;
  const eeo = factRow("eeo");
  world.state.answers = world.state.answers.filter((a) => a !== eeo);
  try {
    const f = await open(tenants.a.url("4-voluntary.html"));
    try {
      const card = await fill(f);
      assert.deepEqual(traineeOf(card).map((x) => x.label), [], "no disclosure the person did not give");
      const values = await f.page.evaluate(() => Array.from(document.querySelectorAll('[id^="personalInfoUS--"]')).map((b) => b.textContent.trim()));
      assert.ok(values.every((v) => v === "Select One"), "every disclosure left: " + values.join(", "));
    } finally {
      await f.close();
    }
  } finally {
    world.state.answers.push(eeo);
  }
  const g = await open(tenants.b.url("4-voluntary.html"));
  try {
    const card = await fill(g);
    assert.deepEqual(traineeOf(card).map((x) => [x.label, x.value]), [["Gender", "I don't wish to answer"], ["Veteran Status", "I choose not to self-identify"]],
      "Hispanic or Latino (no decline offered) and race (none) are left");
  } finally {
    await g.close();
  }
  const d = await open(tenants.a.url("5-self-identify.html"));
  try {
    const card = await fill(d);
    assert.deepEqual(traineeOf(card), [], "the disability form is never filled");
    assert.ok(card.lines.some((l) => /disability form .* is yours/i.test(l)));
    const name = await d.page.inputValue("#selfIdentifiedDisabilityData--name");
    assert.equal(name, "");
  } finally {
    await d.close();
  }
});

test("Workday's own values are Workday's: shown apart, never counted as Trainee's, never overwritten; no duplicate row", async (t) => {
  if (skip(t)) return;
  const f = await open(tenants.a.url("1-my-information.html"));
  try {
    const card = await fill(f);
    const country = card.payload.fields.find((x) => x.label === "Country");
    assert.equal(country.source, "workday", "the tenant's default country is Workday's");
    const at = card.lines.indexOf("Filled by Workday from your resume: check them");
    assert.ok(at > 0 && card.lines.indexOf("Country: United States of America") > at);
  } finally {
    await f.close();
  }
  // A resume parse left row 1 as "Data Analyst II" at Example Analytics.
  const p = await open(tenants.a.url("2-my-experience.html", "parsed"));
  try {
    const card = await fill(p);
    const title = card.payload.fields.find((x) => x.label === "Work Experience 1: Job Title");
    assert.equal(title.source, "workday");
    assert.equal(title.value, "Data Analyst II", "never overwritten");
    assert.ok(card.lines.some((l) => l.includes('Workday has "Data Analyst II"') && l.includes('"Data Analyst"')), "side by side");
    const from = card.payload.fields.find((x) => x.label === "Work Experience 1: From");
    assert.equal(from?.source, "trainee", "an empty field of the same job is filled");
    assert.equal(from.value, "06/2022");
    const rows = await p.page.evaluate(() => document.querySelectorAll('[aria-labelledby^="Work-Experience-"][aria-labelledby$="-panel"]').length);
    assert.equal(rows, 2, "one row added for Sample Retail; none again for Example Analytics");
  } finally {
    await p.close();
  }
});

test("the Submit on the review step is its own tap, bound to the review page's reading; drafts never submit", async (t) => {
  if (skip(t)) return;
  const begins = world.state.begins.length;
  const f = await open(tenants.b.url("6-review.html"));
  try {
    const card = await fill(f);
    assert.equal(card.action, "submit");
    assert.equal(card.status, "ready");
    assert.ok(card.lines.some((l) => /Approve submits this application to contoso with Workday's own Submit/.test(l)));
    assert.equal(await f.panel.textContent("#approve"), "Approve and submit");
    await sleep(1000);
    assert.equal(await f.page.evaluate(() => window.__submitted === true), false, "nothing submitted before the tap");
    assert.equal(world.state.begins.length, begins);
    await f.panel.click("#approve");
    const done = await W.waitCard(sw, f.tabId, (c) => c.status === "done", 40000);
    assert.ok(done, "the application finished");
    assert.equal(await f.page.evaluate(() => window.__submitted === true), true);
    assert.equal(world.state.begins.length, begins + 1, "recorded once, before the click");
    assert.equal(world.state.begins.at(-1).p_approval, card.hash, "the record is bound to the review page's reading");
    assert.match(done.message, /confirmed/);
  } finally {
    await f.close();
  }
});

for (const tenant of ["dev-a", "dev-b"]) {
  test(`zero wrong on ${tenant}: every step filled, approved page by page, stopped at the review (evals/apply/workday-fill.cjs)`, async (t) => {
    if (skip(t)) return;
    const r = await W.runTenant({ tenant: path.join(FIX, tenant), log: () => {} });
    console.log(r.summary);
    assert.deepEqual(r.errors, []);
    assert.equal(r.wrong, 0, JSON.stringify(r.rows.filter((x) => /wrong/.test(x.verdict))));
    assert.equal(r.never_violations, 0);
    assert.equal(r.submitted, false, "the key says ask: never submitted");
    assert.equal(r.records, 0);
    assert.ok(r.coverage >= 0.7, `coverage ${r.coverage}`);
  });
}
