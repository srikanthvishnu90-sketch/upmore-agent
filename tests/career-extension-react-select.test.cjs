"use strict";
// React-select widget capability battery — SYNTHETIC fixtures only.
//
// The captured Greenhouse/Lever forms carry no react-select menu DOM (their
// scripts were stripped at capture), so the coverage pack pins all 75 custom
// selects unverified-against-live and this battery does NOT change that: it
// measures a different axis — whether the PRODUCT (extension/lib bundle:
// planForm + contractFill + chooseWidgetOption + dom.fill/readValue) drives a
// react-select correctly when a menu exists. Fixtures are constructed pages
// (tests/fixtures/synthetic-selects/*.html, each labeled SYNTHETIC in-file with
// its provenance) whose stand-in script plays the employer's part: the menu
// opens on the widget's own Toggle flyout button, options render, a pick
// renders as the single value. Capability results here are labeled synthetic
// and are never live-coverage claims.
//
// The drive in the page is content.js's own sequence, product functions only:
// readForm -> trustedManifest (the TEST persona as a confirmed facts file) ->
// planForm -> contractFill -> per field: dom.fill with a chooser built on
// chooseWidgetOption, counted exactly as content.js counts (the fill returned
// ok AND the rendered read-back is non-empty). The TEST persona is the repo's
// one synthetic persona (evals/apply/fill-coverage.ts PERSONA, printed by
// tests/fixtures/extension/persona.ts); its answers are facts the product
// reads, never defaults in product code.
//
//   UPMORE_CHROMIUM_SANDBOX=off node --test tests/career-extension-react-select.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const BUNDLE = path.join(ROOT, "extension", "lib", "trainee-core.js");
const FIX = path.join(ROOT, "tests", "fixtures", "synthetic-selects");
require(BUNDLE); // node-side product path for the chooser tests
const C = globalThis.TraineeCore;

let pw = null, blocked = null;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", path.join(ROOT, "..", "sporve-agent-clone", "node_modules", "playwright"), "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try { pw = require(id); break; } catch { /* next */ }
}
if (!pw) blocked = "PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH; nothing was downloaded";
const CHROME = [process.env.UPMORE_EXTENSION_CHROMIUM_PATH, (() => { try { return pw && pw.chromium.executablePath(); } catch { return null; } })(), "/opt/pw-browsers/chromium", process.env.UPMORE_CHROMIUM_PATH].find((p) => p && fs.existsSync(p));
const SANDBOX_OFF = process.env.UPMORE_CHROMIUM_SANDBOX === "off";
const DENO = [process.env.DENO_BIN, path.join(os.homedir(), ".deno", "bin", "deno")].find((p) => p && fs.existsSync(p)) || "deno";

// The one TEST persona, from its one source.
const PERSONA = JSON.parse(execFileSync(DENO, ["run", "--allow-read", path.join(ROOT, "tests", "fixtures", "extension", "persona.ts")], { encoding: "utf8" }));
const factsFile = () => ({
  user_id: "TEST",
  answers: Object.fromEntries(Object.entries(PERSONA).map(([k, v]) => [k, {
    value: String(v), factId: "fact:" + k, confirmed: true, user_id: "TEST",
    provenance: "owner stated (TEST persona)", confirmation_event_id: "TEST-event",
  }])),
});
const ANSWERS = Object.fromEntries(Object.entries(PERSONA).map(([k, v]) => [k, { value: String(v), factId: "fact:" + k }]));
const field = (name, label) => ({ name, label, required: true, type: "text", options: [] });
const choose = (f, labels, answers = ANSWERS) => C.chooseWidgetOption({
  userId: "TEST", jobId: "synthetic-battery", company: "Synthetic Co", family: "greenhouse",
  field: f, form: [f], labels, answers, saved: {}, now: Date.now(), factId: undefined,
});

// ---------------------------------------------------------------- chooser-level (node, no browser)
// content.js passes factId from the plan; the node-level calls omit it (the
// gate under test is the derivation check on the fact the planner used).

test("chooser: a bare yes/no menu takes the fact's own no (sponsorship)", () => {
  assert.equal(choose(field("question_sponsor", "Will you now or in the future require sponsorship for employment?"), ["Yes", "No"]), "No");
});

test("chooser: a yes-prefixed option derives; a full-sentence option is asked (the architect's FRS contract)", () => {
  const AUTH = "Are you legally authorized to work in the United States?";
  assert.equal(choose(field("question_auth", AUTH), ["Yes, I am authorized", "No"]), "Yes, I am authorized",
    "a yes put on the employer's yes option is a derivation (option-yes-no)");
  const v = choose(field("question_auth", AUTH), [
    "I am authorized to work in the United States for any employer",
    "I will require sponsorship to work in the United States",
    "I am not authorized to work in the United States",
  ]);
  assert.equal(v, null,
    "a choice the planner reaches only by meaning is asked, never clicked — pinned by tests/architect/frs-gh-widget.test.ts (FRS-widget/1, /2), which this battery honors over its own first framing");
});

test("chooser: the degree menu is asked — a degree's wording is not one of the gate's derivations", () => {
  const v = choose(field("question_degree", "Degree"), ["High School", "Associate's Degree", "Bachelor's Degree", "Master's Degree", "Doctorate"]);
  assert.equal(v, null, "only option-exact, option-yes-no and listed-name derivations are clicked (WO-102); the rest are the person's to answer");
});

test("chooser (a): an affirmative option asserting a sponsorship need is never chosen from the authorization fact", () => {
  const v = choose(field("question_auth", "Are you legally authorized to work in the United States?"), [
    "Yes, I will require sponsorship to work in the United States",
    "No, I am not authorized to work in the United States",
  ]);
  assert.equal(v, null, "no option on this menu derives from the person's facts: asked, never clicked");
});

test("chooser (a): a COMBINED answer is never chosen from the authorization fact alone", () => {
  // Convergence pin (widget-gap x eligibility separation): the compound takes its own sponsorship
  // position ("do not require sponsorship") that the authorization fact does not carry. The widget gate
  // vetoes the separate-position class, and chooseOption's work_authorization rule classifies it
  // identically — both paths refuse it here. Combined answers are answered from both facts by the
  // planner (career_apply's authorizedWithoutSponsorship), never clicked from one fact alone; the
  // exported-predicate side of this pin lives in tests/architect/widget-eligibility-compound.test.ts.
  const v = choose(field("question_auth", "Are you legally authorized to work in the United States?"), [
    "Yes, I am authorized and do not require sponsorship",
    "No, I am not authorized to work in the United States",
  ]);
  assert.equal(v, null, "the combined answer is asked, never chosen from the authorization fact alone");
});

test("chooser (a): a wrong degree is not chosen for the person's degree fact", () => {
  const v = choose(field("question_degree", "Degree"), ["Master's Degree", "Doctorate"]);
  assert.equal(v, null);
});

test("chooser (c): an empty option list is asked, never chosen", () => {
  assert.equal(choose(field("country", "Country"), []), null);
});

test("chooser (e): an attestation widget is not chosen from a standing consent fact", () => {
  const answers = { ...ANSWERS, privacy_ack: { value: "I agree", factId: "fact:privacy_ack" } };
  const v = choose(field("question_agree", "I agree to the Privacy Policy and Terms"), ["I agree", "I do not agree"], answers);
  assert.equal(v, null, "an attestation takes the person's own answer to that question, not a menu pick from a fact");
});

// ---------------------------------------------------------------- page-level (Chromium, the bundle in the page)
let browser = null;
before(async () => {
  if (blocked) return;
  try {
    browser = await pw.chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : {}), ...(SANDBOX_OFF ? { args: ["--no-sandbox"] } : { chromiumSandbox: true }) });
  } catch (e) {
    blocked = "BROWSER_UNAVAILABLE: " + String(e.message).split("\n")[0];
  }
});
after(async () => { await browser?.close().catch(() => {}); });
const skip = (t) => {
  if (blocked) {
    if (process.env.CI === "true") assert.fail("CI cannot skip the react-select battery: " + blocked);
    t.skip(blocked);
    return true;
  }
  return false;
};

// content.js's fill sequence, product functions only (see the header).
async function driveSyntheticForm(cfg) {
  const C = globalThis.TraineeCore, D = C.dom;
  const trace = { schema: [], rawFill: [], screenedFill: [], asks: [], needs: [], steps: {}, finalValues: {} };
  const form = D.readForm();
  trace.schema = form.schema.map((s) => ({ name: s.name, label: s.label, required: !!s.required, widget: (form.bindings[s.name] || {}).widget || null }));
  const manifest = C.trustedManifest({ owner: "TEST", file: cfg.file, rows: cfg.rows || [], resume: null });
  const plan = C.planForm({ userId: "TEST", jobId: cfg.jobId, company: "Synthetic Co", family: "greenhouse", schema: form.schema, answers: manifest.answers, saved: manifest.saved, now: Date.now() });
  trace.rawFill = plan.fill.map((p) => ({ name: p.name, value: p.value, factId: p.factId }));
  trace.needs = plan.needs.map((n) => n.label);
  const listed = form.schema.filter((s) => (form.bindings[s.name] || {}).widget || D.isPlaceSearch(D.element(form.bindings[s.name].selector))).map((s) => s.name);
  const screened = C.contractFill({ schema: form.schema, plan, manifest, listed, resume: null, jobId: cfg.jobId });
  trace.screenedFill = screened.fill.map((p) => p.name);
  trace.asks = screened.asks.map((a) => ({ label: a.label, why: a.why }));
  trace.dropped = screened.dropped;
  for (const p of screened.fill) {
    const b = form.bindings[p.name];
    if (!b) continue;
    const s = form.schema.find((x) => x.name === p.name);
    const isListed = !!b.widget || D.isPlaceSearch(D.element(b.selector));
    let refused = null;
    const verdicts = [];
    const chooseFn = isListed && s ? (labels) => {
      const v = C.chooseWidgetOption({ userId: "TEST", jobId: cfg.jobId, company: "Synthetic Co", family: "greenhouse", field: s, form: form.schema, labels, answers: manifest.answers, saved: manifest.saved, now: Date.now(), factId: p.factId });
      verdicts.push(v);
      refused = v === null ? labels : null;
      return v;
    } : undefined;
    const ok = await D.fill(b, p.value, null, chooseFn);
    const v = D.readValue(b);
    const label = D.takeWidgetChoice();
    trace.steps[p.name] = { planned: p.value, verdicts, refused: !!refused, ok, readBack: v, clicked: label, counted: !!(ok && v) };
  }
  for (const s of form.schema) trace.finalValues[s.name] = D.readValue(form.bindings[s.name]);
  return trace;
}

async function drive(fixture, rows) {
  const page = await browser.newPage();
  try {
    await page.setContent(fs.readFileSync(path.join(FIX, fixture), "utf8"));
    await page.addScriptTag({ path: BUNDLE });
    return await page.evaluate(driveSyntheticForm, { file: factsFile(), rows: rows || [], jobId: "synthetic-battery" });
  } finally {
    await page.close();
  }
}

test("synthetic happy path: country and sponsorship menus fill and read back exactly", async (t) => {
  if (skip(t)) return;
  const tr = await drive("basic.html");
  assert.deepEqual(tr.steps.country, { planned: "United States", verdicts: ["United States"], refused: false, ok: true, readBack: "United States", clicked: "United States", counted: true });
  assert.equal(tr.steps.question_sponsor.readBack, "No");
  assert.equal(tr.steps.question_sponsor.counted, true);
  assert.equal(tr.finalValues.question_exp, "", "the span list's edge case (3 years in two ranges) stays asked, untouched");
  assert.ok(tr.needs.some((l) => /years of experience/i.test(l)), "the experience question is asked, not forced");
});

test("synthetic sentences: full-sentence menus are asked by design (FRS contract); nothing is clicked", async (t) => {
  if (skip(t)) return;
  const tr = await drive("sentences.html");
  for (const name of ["question_auth", "question_degree"]) {
    const s = tr.steps[name];
    assert.ok(s, name + " was planned and attempted");
    assert.deepEqual(s.verdicts, [null], name + ": the chooser asks rather than clicking a meaning-only choice");
    assert.equal(s.clicked, null);
    assert.equal(s.counted, false);
    assert.equal(tr.finalValues[name], "", name + " stays open for the person");
  }
});

test("synthetic (a): the wrong-only menu — nothing is clicked, the field is asked", async (t) => {
  if (skip(t)) return;
  const tr = await drive("wrong-only.html");
  const s = tr.steps.question_auth;
  assert.ok(s, "the field was planned and attempted");
  assert.deepEqual(s.verdicts, [null], "the chooser refuses the menu");
  assert.equal(s.clicked, null);
  assert.equal(s.counted, false);
  assert.equal(tr.finalValues.question_auth, "");
});

test("synthetic (b): a read-back that renders a different option is not counted as filled", async (t) => {
  if (skip(t)) return;
  const tr = await drive("wrong-render.html");
  const s = tr.steps.country;
  assert.deepEqual(s.verdicts, ["United States"], "the planner named the correct option");
  assert.equal(s.readBack, "Mexico", "the widget rendered a different option's text (the fixture's wrong-render rule: the next option cyclically)");
  assert.equal(s.clicked, null, "no choice is recorded for a fill the page did not take");
  assert.equal(s.ok, false, "the drive reports the mismatch as a failure");
  assert.equal(s.counted, false, "a mismatched read-back is never counted filled");
});

test("synthetic (c): menus that never open or open empty stop the drive; the fields stay open", async (t) => {
  if (skip(t)) return;
  const tr = await drive("no-menu.html");
  for (const name of ["question_school", "question_degree"]) {
    const s = tr.steps[name];
    assert.ok(s, name + " was attempted");
    assert.equal(s.ok, false, name + ": no options, no fill");
    assert.equal(s.counted, false);
    assert.equal(tr.finalValues[name], "");
  }
});

test("synthetic (d): the conditional follow-up is gated off without the person's own answer, and driven with it", async (t) => {
  if (skip(t)) return;
  const off = await drive("followup.html");
  assert.equal(off.steps.question_convict.readBack, "No", "the parent is answered from the fact");
  assert.ok(!off.screenedFill.includes("question_convict_detail"), "no fact answers a follow-up: it is not planned");
  assert.equal(off.finalValues.question_convict_detail, "", "the gated follow-up stays empty");

  // The person's own answer to that follow-up wording (ask-once), keyed by the
  // product's own answerKey for the field.
  const page = await browser.newPage();
  let key;
  try {
    await page.setContent(fs.readFileSync(path.join(FIX, "followup.html"), "utf8"));
    await page.addScriptTag({ path: BUNDLE });
    key = await page.evaluate(() => {
      const form = globalThis.TraineeCore.dom.readForm();
      const f = form.schema.find((x) => x.name === "question_convict_detail");
      return globalThis.TraineeCore.answerKey(f, "synthetic-battery");
    });
  } finally {
    await page.close();
  }
  assert.match(key, /^label:[0-9a-f]{16}$/, "the follow-up's wording key");
  const on = await drive("followup.html", [{ id: "followup-1", key, answer: "Misdemeanor" }]);
  assert.ok(on.screenedFill.includes("question_convict_detail"), "with the person's own answer, the follow-up is planned");
  assert.equal(on.steps.question_convict_detail.readBack, "Misdemeanor", "and driven to exactly that answer");
  assert.equal(on.steps.question_convict_detail.counted, true);
});

test("synthetic (e): the attestation widget always stops for the person; the plain field beside it fills", async (t) => {
  if (skip(t)) return;
  const tr = await drive("attestation.html");
  assert.ok(!tr.screenedFill.includes("question_agree"), "the contract turns the attestation back to the person");
  assert.ok(tr.asks.some((a) => /attestation or a personal choice/i.test(a.why)), "and names why it is theirs");
  assert.equal(tr.finalValues.question_agree, "", "nothing was auto-accepted");
  assert.equal(tr.steps.country.counted, true, "the plain country field on the same form still fills");
  assert.equal(tr.finalValues.country, "United States");
});
