"use strict";
// Measurement only (no product code changes): how many option questions (a dropdown, a radio group, a checkbox) the
// person is asked only because the employer's option text is not the person's fact word for word ("IL" beside
// "Illinois", "Yes" beside "Yes, I am authorized"), against those with no fact behind them at all.
//
// Every captured form the extension tests serve (tests/fixtures/extension/world.cjs over tests/fixtures/forms-ci) is opened
// in headless Chromium on the local TEST world (no network: every other host resolves nowhere). The extension's own
// reader (TraineeCore.dom.readForm, the checked-in bundle extension/lib/trainee-core.js) reads it, and the extension's
// own pipeline runs on it: trustedManifest -> planForm -> contractFill (WO-102), with derivation rules read from
// batchPlan's ledger. A Greenhouse dropdown widget's options exist only once its menu opens (react-select, its script
// stripped from the capture), so it is given the employer's own option list captured from Greenhouse's public API
// (tests/fixtures/forms-ci/greenhouse-options.json), as chooseWidgetOption sees it on the live page; a widget with no
// captured list is counted apart ("options unknown offline").
//
// The persona is the extension tests' own complete synthetic TEST persona (tests/fixtures/extension/persona.ts), every
// fact stated and confirmed (provenance "owner stated (TEST)", a confirmation event id). No person's data.
//
// Every option question left unanswered is put in one class, by the fact behind it (the one the planner answered it
// from; else the one it reads when the same question is a plain text box, if that is the question's own mapped fact,
// classifyField else mapQuestion) and the employer's options:
//   policy  never filled from a fact by rule: a self-identification (EEO), an attestation or consent needing the person's
//           own answer to it, an identity number, a label asked twice on one form
//   a       an option equal to the fact (derivation's own normalisation: case, whitespace, trailing . or !) existed: a miss
//   b       near-miss: one option equals the fact after normalising case, punctuation, whitespace, a US state's name or
//           abbreviation, and a leading "Yes," / "No," on the option
//   c       ambiguous: the normalised fact equals more than one option
//   d       no fact: none (no fact maps to it, or one the person has not stated), held (a stated fact the planner does
//           not apply here: another country's work rights, a follow-up), inferred (only a yes or no computed from
//           another fact, "No" from the employer list)
//   e       off-list: a fact is there but no option equals it even normalised (another wording, a range, a list)
//
//   node evals/apply/option-near-miss.cjs [--out file.json]
// Headless Chromium refuses to run as root: run as an ordinary user (see docs/apply/OPTION-NEAR-MISS.md).
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
const OUT = arg("out", null);
const CORE = fs.readFileSync(path.join(ROOT, "extension/lib/trainee-core.js"), "utf8");
const OPTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/forms-ci/greenhouse-options.json"), "utf8"));
const widgetOptions = (formId, name) => {
  const f = OPTIONS.forms[formId];
  const sel = f?.selects?.[name] || f?.selects?.[name.replace(/\[\]$/, "")];
  if (sel) return sel.options;
  const ed = f && OPTIONS.education[f.board];
  if (/^degree--/.test(name)) return ed?.degrees || null;
  if (/^discipline--/.test(name)) return ed?.disciplines || null;
  return null;
};

let pw = null;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try {
    pw = require(id);
    break;
  } catch { /* next */ }
}
if (!pw) throw Error("PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH; nothing is downloaded");
const CHROME = [process.env.UPMORE_EXTENSION_CHROMIUM_PATH, (() => {
  try {
    return pw.chromium.executablePath();
  } catch {
    return null;
  }
})(), "/opt/pw-browsers/chromium", process.env.UPMORE_CHROMIUM_PATH].find((p) => p && fs.existsSync(p));

// --------------------------------------------------------------------------------------------- the normalisation measured
const STATES = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california", co: "colorado", ct: "connecticut", de: "delaware",
  dc: "district of columbia", fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan", mn: "minnesota",
  ms: "mississippi", mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
  nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon",
  pa: "pennsylvania", ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah",
  vt: "vermont", va: "virginia", wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
};
// derivation()'s own comparison (extension/src/apply_core.ts): whitespace, trailing . or !, case.
const exactN = (x) => String(x ?? "").replace(/\s+/g, " ").trim().replace(/[.!]+$/, "").toLowerCase();
// The near-miss normalisation: a leading "Yes," / "No," (followed by more words) is the yes or no; an upper-case US
// state code is the state's name; then case, punctuation and whitespace.
function nearN(x) {
  let s = String(x ?? "").replace(/[’‘]/g, "'").trim();
  const yn = /^(yes|no)\b\s*[,.:;!\-–—(]\s*\S/i.exec(s);
  if (yn) return yn[1].toLowerCase();
  s = s.replace(/\b([A-Z]{2})\b/g, (m) => STATES[m.toLowerCase()] ?? m);
  if (/^[a-z]{2}$/i.test(s) && STATES[s.toLowerCase()]) s = STATES[s.toLowerCase()];
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// ----------------------------------------------------------------------------------------- in the page (the extension's own code)
function analyse(input) {
  const C = globalThis.TraineeCore, D = C.dom;
  const f = D.readForm();
  const owner = "00000000-0000-4000-8000-0000000000aa";
  const answers = {};
  for (const [k, v] of Object.entries(input.persona)) {
    answers[k] = { value: v, factId: `TEST-fact-${k}`, user_id: owner, confirmed: true, provenance: "owner stated (TEST)", confirmation_event_id: `TEST-event-${k}` };
  }
  const resume = { filename: "test-person-resume.pdf", sha256: "a".repeat(64) };
  const manifest = C.trustedManifest({ owner, file: { user_id: owner, answers, saved: {} }, rows: [], resume: { sha256: resume.sha256 } });
  // As the extension does on the page (content.js): a dropdown widget or a place search is "listed": its options exist
  // only once its menu opens. The planner and the contract run on the form as read (a widget with no options); the
  // widget's answer is then put on the employer's own option by chooseWidgetOption, here over the captured list.
  const widgets = [], unknownWidgets = [], places = [], captured = {};
  const schema = f.schema;
  for (const s of schema) {
    const b = f.bindings[s.name];
    const el = b ? D.element(b.selector) : null;
    if (b?.widget) {
      const opts = input.widgetOptions[s.name];
      if (opts) (widgets.push(s.name), (captured[s.name] = opts.map(String)));
      else unknownWidgets.push(s.name);
    } else if (el && D.isPlaceSearch(el)) places.push(s.name);
  }
  const listed = [...widgets, ...unknownWidgets, ...places];
  const jobId = C.postingKey(location.href) || location.origin + location.pathname;
  const company = C.tenantOf(jobId) || location.hostname;
  const where = D.fnPostingLocation();
  const now = Date.UTC(2026, 9, 21);
  const plan = C.planForm({ userId: owner, jobId, company, family: input.family, schema, answers: manifest.answers, saved: manifest.saved, now, location: where });
  const cf = C.contractFill({ schema, plan, manifest, listed, resume });
  // The derivation rule of every answer the contract keeps, from batchPlan's own ledger (a form of only those fields).
  const keptNames = new Set(cf.fill.map((p) => p.name));
  const sub = schema.filter((s) => keptNames.has(s.name));
  const bp = C.batchPlan({ jobId, company, url: location.href, family: input.family, schema: sub, challenge: false, resume, listed, manifest,
    plan: { fill: cf.fill, needs: [], identity: [], ambiguous: [] } });
  const rules = {};
  if (bp.ok) for (const l of bp.posting.ledger) rules[l.field_id] = l.derivation_rule;
  // A kept widget answer reaches the page only when the planner names one of the employer's options for it.
  const widgetChoice = {};
  for (const n of widgets) {
    if (!keptNames.has(n)) continue;
    const field = schema.find((x) => x.name === n);
    widgetChoice[n] = C.chooseWidgetOption({ userId: owner, jobId, company, family: input.family, field, labels: captured[n], answers: manifest.answers,
      saved: manifest.saved, now, form: schema, location: where });
  }
  const planned = new Map(plan.fill.map((p) => [p.name, p]));
  // The contract's reason for every answer it turns back, optional ones too (contractFill names a reason only for a
  // required question: the same call with every field required).
  const asks = new Map(C.contractFill({ schema: schema.map((x) => ({ ...x, required: true })), plan, manifest, listed, resume }).asks.map((a) => [a.label, a.why]));
  // Which of the person's facts the planner reads for a question, apart from its options: the same form with this one
  // field asked as a plain text box. No answer there: the planner has no fact that applies to this question here.
  const probe = (s) => {
    const one = { ...s, type: "text", options: [], required: false };
    const r = C.planForm({ userId: owner, jobId, company, family: input.family, schema: schema.map((x) => (x.name === s.name ? one : x)), answers: manifest.answers,
      saved: manifest.saved, now, location: where });
    const p = r.fill.find((x) => x.name === s.name);
    const tf = p ? manifest.byFactId[p.factId] : null;
    return p ? { value: p.value, key: tf?.key ?? null, fact: tf?.value ?? null } : null;
  };
  const ambiguous = new Set(plan.ambiguous.map((a) => a.name)), identity = new Set(plan.identity.map((a) => a.name));
  const rows = schema.map((s) => {
    const keyed = C.classifyField(s.label, s.type);
    const mapped = C.mapQuestion(s);
    const fact = keyed !== "unknown" ? keyed : mapped.fact;
    const p = planned.get(s.name);
    return {
      name: s.name, label: s.label, type: s.type, required: !!s.required, personal: !!s.personal,
      options: captured[s.name] ? captured[s.name].map((l) => ({ label: l, value: l })) : (s.options || []).map((o) => ({ label: String(o.label), value: String(o.value) })),
      widget: !!f.bindings[s.name]?.widget, widgetUnknown: unknownWidgets.includes(s.name), place: places.includes(s.name),
      widgetChoice: widgets.includes(s.name) && keptNames.has(s.name) ? widgetChoice[s.name] ?? null : undefined,
      fact, mappedKind: mapped.kind, factValue: manifest.answers[fact]?.value ?? null,
      planned: p ? { value: p.value, factId: p.factId, key: manifest.byFactId[p.factId]?.key ?? null, fact: manifest.byFactId[p.factId]?.value ?? null } : null,
      kept: keptNames.has(s.name) && !(widgets.includes(s.name) && widgetChoice[s.name] === null), rule: rules[s.name] ?? null,
      contractWhy: asks.get(s.label) ?? null, ambiguous: ambiguous.has(s.name), identity: identity.has(s.name),
      identityField: C.isIdentityField(s), fileAlt: C.fileAlternative(s, schema),
      probe: keptNames.has(s.name) && !(widgets.includes(s.name) && widgetChoice[s.name] === null) ? null : probe(s),
    };
  });
  return { rows, where, batchOk: bp.ok, batchWhy: bp.ok ? [] : bp.why, excluded: manifest.excluded.length };
}

// ----------------------------------------------------------------------------------------------------- classification
const PERSONAL = /\b(gender|pronoun|race|ethnic\w*|hispanic|latin[oax]?|veteran|disabilit\w*|sexual orientation|transgender|lgbt\w*)\b/i;
const optionKind = (r) => {
  if (/file/.test(r.type)) return null;
  if (r.place) return null; // a place search is a typed search, not an option list
  if (r.type === "checkbox" && r.options.length < 2) return "checkbox";
  if (r.type === "checkbox" || /radio|checkbox_group|multi_value_multi_select/.test(r.type)) return "choice";
  if (r.options.length || r.widgetUnknown) return "select";
  return null;
};
const TEXT_FACTS = new Set(["full_name", "legal_name", "first_name", "last_name", "preferred_name", "email", "phone", "street_address",
  "full_address", "city", "postal_code", "location", "linkedin", "github", "website", "current_employer", "current_title", "school",
  "major", "salary_expectation", "current_compensation", "signature", "references", "timezone"]); // career_apply.ts
const realOptions = (r) => r.options.filter((o) => o.label && !/^select\b|^--|^please select|^choose\b/i.test(o.label.trim()));
function classify(r) {
  if (r.widgetUnknown) {
    if (r.personal || r.fact === "eeo" || PERSONAL.test(r.label)) return { cls: "policy", why: "self-identification (EEO)" };
    return { cls: "unknown_options" };
  }
  if (r.kept) {
    // How the option put on the page relates to the fact behind it (a widget's is chooseWidgetOption's choice).
    const fact = r.planned?.fact ?? "";
    const shown = r.kind === "checkbox" ? r.planned?.value : r.widgetChoice ?? r.options.find((o) => o.value === r.planned?.value)?.label ?? r.planned?.value;
    const filledBy = r.kind === "checkbox" ? "yes/no on a box" : exactN(shown) === exactN(fact) ? "exact"
      : nearN(shown) === nearN(fact) ? "normalised" : "mapped by meaning";
    return { cls: "filled", filledBy, shown };
  }
  if (r.identity || r.identityField) return { cls: "policy", why: "identity number" };
  if (r.ambiguous) return { cls: "policy", why: "label asked twice on the form" };
  if (r.personal || r.fact === "eeo" || r.mappedKind === "eeo" || PERSONAL.test(r.label)) return { cls: "policy", why: "self-identification (EEO)" };
  if (r.contractWhy && /attestation or a personal choice/.test(r.contractWhy)) return { cls: "policy", why: "attestation: needs the person's own answer" };
  // The fact behind the question: the one the planner answered it from; else the one it reads when the same question is
  // a plain text box (the probe), when that is the question's own fact (a text box reads more into a label than a box does).
  const yn = (v) => /^(yes|no)$/.test(nearN(v));
  const src = r.planned?.key ? { value: r.planned.value, key: r.planned.key, fact: r.planned.fact }
    : r.probe?.key && r.probe.key === r.fact ? r.probe : null;
  if (!src) {
    if (r.fact === "unknown") return { cls: "d", sub: "none", why: "no fact maps to it" };
    if (!r.factValue) return { cls: "d", sub: "none", why: `reads as ${r.fact}, which the person has not stated` };
    return { cls: "d", sub: "held", why: `reads as ${r.fact} ("${r.factValue}"), which the planner does not apply here` };
  }
  const fv = src.fact;
  r.src = src;
  // A yes or no computed from a fact that is not one ("No" from the employer list, "no" from the languages spoken): the
  // person never said it; the question has no supporting fact of its own. An agreement ("I agree") is not an inference.
  if (!yn(fv) && yn(src.value) && !/^i (agree|accept|consent|acknowledge|understand)\b/i.test(fv)) {
    return { cls: "d", sub: "inferred", why: `inferred: "${src.value}" read from ${src.key} ("${fv}")` };
  }
  if (r.kind === "checkbox" && TEXT_FACTS.has(src.key)) return { cls: "d", sub: "none", why: `a contact fact (${src.key}) never answers a box` };
  const opts = r.kind === "checkbox" ? [] : realOptions(r);
  if (r.kind === "checkbox") {
    // A lone box: the only exact rule is a yes or no fact (checkbox-yes-no).
    if (/^(yes|no)$/i.test(exactN(fv))) return { cls: "a", why: "a yes/no fact on a lone box" };
    return { cls: "e", why: "a lone box and a fact that is not yes or no" };
  }
  if (opts.some((o) => exactN(o.label) === exactN(fv) || o.value === fv)) return { cls: "a" };
  const hits = opts.filter((o) => nearN(o.label) === nearN(fv));
  if (hits.length === 1) return { cls: "b", hit: hits[0].label };
  if (hits.length > 1) return { cls: "c", hits: hits.map((o) => o.label) };
  return { cls: "e" };
}

// ------------------------------------------------------------------------------------------------------------ main
(async () => {
  const persona = JSON.parse(execFileSync(process.env.DENO_BIN || "deno", ["run", "--allow-read", path.join(ROOT, "tests/fixtures/extension/persona.ts")], { encoding: "utf8" }));
  const world = await startWorld();
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "option-near-miss-"));
  const ctx = await pw.chromium.launchPersistentContext(ud, {
    headless: true, ...(CHROME ? { executablePath: CHROME } : {}), viewport: { width: 1280, height: 900 },
    args: [`--host-resolver-rules=${world.hostRules}`, "--ignore-certificate-errors", "--no-proxy-server"],
  });
  const forms = [];
  try {
    for (const form of world.forms) {
      const page = await ctx.newPage();
      await page.goto(world.urlOf(form.id), { waitUntil: "domcontentloaded" });
      await page.addScriptTag({ content: CORE });
      for (let i = 0; i < 40; i++) {
        if (await page.evaluate(() => globalThis.TraineeCore.dom.readForm().schema.length >= 2)) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const names = await page.evaluate(() => globalThis.TraineeCore.dom.readForm().schema.map((s) => s.name));
      const wo = {};
      for (const n of names) {
        const o = form.family === "greenhouse" ? widgetOptions(form.id, n) : null;
        if (o) wo[n] = o;
      }
      const r = await page.evaluate(analyse, { persona, family: form.family, widgetOptions: wo });
      await page.close();
      const rows = r.rows.filter((x) => !x.fileAlt).map((x) => ({ ...x, kind: optionKind(x) })).filter((x) => x.kind);
      for (const x of rows) Object.assign(x, classify(x));
      forms.push({ id: form.id, family: form.family, where: r.where, rows, batchOk: r.batchOk, excludedFacts: r.excluded });
    }
  } finally {
    await ctx.close().catch(() => {});
    await world.close();
    fs.rmSync(ud, { recursive: true, force: true });
  }

  const CLASSES = ["filled", "a", "b", "c", "d", "e", "policy", "unknown_options"];
  const tally = (rows) => Object.fromEntries([["total", rows.length], ...CLASSES.map((c) => [c, rows.filter((x) => x.cls === c).length]),
    ...["none", "held", "inferred"].map((d) => ["d_" + d, rows.filter((x) => x.cls === "d" && x.sub === d).length]),
    ...["exact", "normalised", "mapped by meaning", "yes/no on a box"].map((k) => ["filled_" + k, rows.filter((x) => x.cls === "filled" && x.filledBy === k).length])]);
  const rulesOf = (rows) => rows.filter((x) => x.cls === "filled" && x.rule).reduce((m, x) => ((m[x.rule] = (m[x.rule] || 0) + 1), m), {});
  const out = { measured_at: new Date().toISOString(), persona_facts: Object.keys(persona).length, families: {}, forms: [] };
  for (const fam of ["greenhouse", "lever", "ashby"]) {
    const fs_ = forms.filter((f) => f.family === fam);
    const all = fs_.flatMap((f) => f.rows.map((x) => ({ ...x, form: f.id })));
    const req = all.filter((x) => x.required);
    out.families[fam] = { forms: fs_.length, required: tally(req), all: tally(all), rules_required: rulesOf(req), rules_all: rulesOf(all) };
  }
  for (const f of forms) {
    out.forms.push({ id: f.id, family: f.family, where: f.where, excluded_facts: f.excludedFacts, rows: f.rows.map((x) => ({
      label: x.label.replace(/\s+/g, " ").slice(0, 160), name: x.name, kind: x.kind, required: x.required, widget: x.widget, fact: x.src?.key ?? x.fact, factValue: x.src?.fact ?? x.factValue,
      options: realOptions(x).map((o) => o.label.replace(/\s+/g, " ").slice(0, 90)), planned: x.planned?.value ?? null, rule: x.rule, contractWhy: x.contractWhy,
      stage: x.kept ? null : !x.planned ? "planner" : x.widgetChoice === null ? "widget choice" : "contract", widgetChoice: x.widgetChoice ?? null,
      cls: x.cls, sub: x.sub ?? null, why: x.why ?? null, filledBy: x.filledBy ?? null, shown: x.shown ?? null, hit: x.hit ?? null, hits: x.hits ?? null,
    })) });
  }
  const text = JSON.stringify(out, null, 1);
  if (OUT) fs.writeFileSync(OUT, text);
  for (const [fam, r] of Object.entries(out.families)) {
    console.log(`${fam} (${r.forms} forms) required: ${JSON.stringify(r.required)} rules: ${JSON.stringify(r.rules_required)}`);
    console.log(`${fam} (${r.forms} forms) all:      ${JSON.stringify(r.all)} rules: ${JSON.stringify(r.rules_all)}`);
  }
  if (!OUT) console.log(text);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
