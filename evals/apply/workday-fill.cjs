#!/usr/bin/env node
"use strict";
// WO-048: how the extension fills a Workday application, measured on a TEST Workday-shaped tenant.
//
//   node evals/apply/workday-fill.cjs --tenant <dir> [--out file] [--persona file]
//
// <dir> holds one HTML file per step and key.json (the shape of tests/fixtures/workday/dev-a: pages, fields, actions; or the
// second key schema {company, pages, rows, actions, notes}, normalized into that shape by normalizeKey below). The
// steps are served locally at a Workday tenant's URL by the TEST world (tests/fixtures/extension/world.cjs; Chromium
// resolves only the world's hosts, so nothing reaches a real Workday, Upmore or Supabase). The real extension runs in
// Chromium, signed in to the TEST world as the TEST persona (tests/fixtures/workday/persona.json, the persona of
// tests/fixtures/workday/sources.md, given as confirmed facts). Step by step, as a test person would:
//   1. press Fill on the first step (later steps fill themselves after an approved Save and Continue or a sign-in);
//   2. when the card is ready, grade every key row of the step against the page and the card, before the person touches
//      anything: fill-correct / fill-wrong / missed / asked-correctly / wrongly-filled-ask / never-ok / never-violation
//      (a value Workday set itself is "page-set": shown on the card as Workday's, never counted as Trainee's);
//   3. answer, as the person, every required field still empty (real input: clicks and typing), sign in on a sign-in
//      step, then tap Approve; the extension clicks Save and Continue;
//   4. on the review step, tap Submit only when the key's submit action says so (the dev keys say "ask": it stops there).
// Output: JSON (--out) and one summary line. coverage = correct / should-fill; precision = Trainee's correct fills /
// Trainee's fills; wrong = a wrong value or a filled ask; never-violations = a never row Trainee touched.
// Evidence label: VERIFIED-S on TEST Workday-shaped pages; real Workday NOT_RUN (needs a person signed in).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { startWorld } = require("../../tests/fixtures/extension/world.cjs");

const ROOT = path.join(__dirname, "..", "..");
const EXT = path.join(ROOT, "extension");
const PERSONA = path.join(ROOT, "tests/fixtures/workday/persona.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TEST_FILE = { name: "test-person-resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% TEST resume uploaded by the test person, WO-048\n") };

function playwright() {
  for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright", "/opt/node-tools/node_modules/playwright"]) {
    if (!id) continue;
    try {
      return require(id);
    } catch { /* next */ }
  }
  throw Error("PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH; nothing was downloaded");
}

// The extension, unpacked, in a Chromium that resolves only the TEST world's hosts.
async function launch(world) {
  const pw = playwright();
  let auto = null;
  try {
    auto = pw.chromium.executablePath();
  } catch { /* none */ }
  const chrome = [process.env.UPMORE_EXTENSION_CHROMIUM_PATH, auto, "/opt/pw-browsers/chromium", process.env.UPMORE_CHROMIUM_PATH].find((p) => p && fs.existsSync(p));
  const sandboxOff = process.env.UPMORE_CHROMIUM_SANDBOX === "off";
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "trainee-wd-profile-"));
  const ctx = await pw.chromium.launchPersistentContext(ud, {
    headless: true, ...(chrome ? { executablePath: chrome } : {}), ...(sandboxOff ? {} : { chromiumSandbox: true }), viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--host-resolver-rules=${world.hostRules}`, "--ignore-certificate-errors", "--no-proxy-server",
      ...(sandboxOff ? ["--no-sandbox"] : [])],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  return { ctx, sw, close: async () => (await ctx.close().catch(() => {}), fs.rmSync(ud, { recursive: true, force: true })) };
}
async function openPanel(ctx, sw, tabId) {
  const url = `chrome-extension://${new URL(sw.url()).host}/panel.html` + (tabId === null ? "" : `?tab=${tabId}`);
  const waiting = ctx.waitForEvent("page", { predicate: (p) => p.url() === url, timeout: 10000 });
  await sw.evaluate((u) => chrome.windows.create({ url: u, type: "popup", focused: false, width: 440, height: 900 }), url);
  const p = await waiting;
  await p.waitForLoadState("domcontentloaded");
  return p;
}
// The person signs in to Upmore the way they already are: the app's own session, picked up from its tab.
async function signIn(ctx, sw) {
  const app = await ctx.newPage();
  await app.goto("https://upmore-topaz.vercel.app/");
  const panel = await openPanel(ctx, sw, null);
  await panel.click("#use-app");
  await panel.waitForSelector("#page:not([hidden])", { timeout: 10000 });
  await panel.close();
  await app.close();
}
const tabIdOf = (sw, url) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u || t.pendingUrl === u)?.id ?? null, url);
const cardOf = (sw, id) => sw.evaluate(async (t) => ((await chrome.storage.session.get("cards")).cards || {})[t] || null, id);
async function waitCard(sw, id, pred, ms = 30000) {
  const end = Date.now() + ms;
  let c = null;
  while (Date.now() < end) {
    c = await cardOf(sw, id);
    if (c && pred(c)) return c;
    await sleep(150);
  }
  return null;
}
const settled = (url) => (c) => c.url === url && ["ready", "blocked", "stopped"].includes(c.status) && (c.payload || c.status === "stopped");

// ------------------------------------------------------------------------------------------------ the key's two schemas
// Schema 1 (tests/fixtures/workday/dev-a): {tenant, company, job, jobLocation, pages, persona, conventions, fields, actions}
// with page names without ".html" and actions {action: "sign-in"|"create-account"|"add-row"|"submit", section,
// rowsNeeded}. It is used exactly as written (normalizeKey returns the same object).
// Schema 2 (an independently written key): {company, pages, rows, actions, notes}. normalizeKey turns it into schema 1:
//   - tenant = the key's tenant, else the directory's name; job / jobLocation absent keep the harness defaults;
//   - rows -> fields: page without ".html", automationId = automationId or formField, section id -> the section's name
//     (kept as sectionId); `match`, `entity`, `path` carried as they are (`path` is not used in grading);
//   - actions {kind, page, should, nth, target} -> {action, page, should, section, ...}: sign_in -> sign-in,
//     create_account -> create-account, submit -> submit (graded as schema 1's are: sign-in is the person's step, submit
//     "ask" stops at review), add_row -> per section one add-row {rowsNeeded = the highest nth with should "fill"}; when
//     any nth says "never", one more add-row {should "never", rowsMax = rowsNeeded}: rows beyond rowsNeeded must not be
//     added (graded per step by gradeAddRow); "ask" nths are recorded, not graded;
//   - match: how a row's page value compares to expected (matchBy); absent -> the harness's own comparison;
//   - entity: a repeating-section slot is graded against whichever row of its section holds that entity, when the row
//     selectors name the slot ([aria-labelledby="<Section>-<n>-panel"] ...) and the slot has a row whose expected is the
//     entity; otherwise the label rule (Company / School / Language) as for schema 1; otherwise by slot.
// Anything the harness cannot read faithfully is listed in key_warnings (in the report) instead of being guessed.
const SECTION_NAMES = { workExperienceSection: "Work Experience", educationSection: "Education", languageSection: "Languages", languagesSection: "Languages", websiteSection: "Websites", websitesSection: "Websites" };
const ACTION_KINDS = { sign_in: "sign-in", create_account: "create-account", add_row: "add-row", submit: "submit" };
const MATCH_KINDS = ["exact", "casefold", "contains-casefold", "digits", "url", "empty", "empty-or-na", "set"];
const pageName = (p) => String(p ?? "").replace(/\.html$/, "");
function normalizeKey(key, dir) {
  if (!key || Array.isArray(key.fields) || !Array.isArray(key.rows)) return key; // schema 1 (or no rows at all): as written
  const warnings = [];
  const fields = key.rows.map((r, i) => {
    const f = { ...r, page: pageName(r.page), expected: r.expected === undefined ? null : r.expected };
    if (f.automationId === undefined && r.formField !== undefined) f.automationId = r.formField;
    if (r.section !== undefined) {
      f.sectionId = r.section;
      f.section = SECTION_NAMES[r.section] || r.section;
      if (!SECTION_NAMES[r.section]) warnings.push(`row ${i} (${r.label}): section "${r.section}" is not a known section id`);
    }
    if (r.match !== undefined && r.match !== null && !MATCH_KINDS.includes(r.match)) {
      warnings.push(`row ${i} (${r.label}): match "${r.match}" is unknown; graded by the harness's own comparison`);
      delete f.match;
    }
    if (!r.selector) warnings.push(`row ${i} (${r.label}): no selector; the harness cannot find it on the page`);
    return f;
  });
  const actions = [];
  const addRows = new Map();
  for (const a of key.actions || []) {
    const action = ACTION_KINDS[a.kind];
    if (!action) {
      warnings.push(`action kind "${a.kind}" is unknown; kept but not graded`);
      actions.push({ ...a, action: String(a.kind), page: pageName(a.page) });
      continue;
    }
    if (action !== "add-row") {
      actions.push({ action, page: pageName(a.page), should: a.should, ...(a.target !== undefined ? { target: a.target } : {}) });
      continue;
    }
    if (!SECTION_NAMES[a.target]) warnings.push(`add_row target "${a.target}" is not a known section id`);
    if (!addRows.has(a.target)) addRows.set(a.target, []);
    addRows.get(a.target).push(a);
  }
  for (const [target, list] of addRows) {
    const section = SECTION_NAMES[target] || target;
    const page = pageName(list[0].page);
    const nths = (should) => list.filter((a) => a.should === should).map((a) => Number(a.nth)).filter(Number.isFinite);
    const fills = nths("fill"), nevers = nths("never"), asks = nths("ask");
    const rowsNeeded = fills.length ? Math.max(...fills) : 0;
    if (list.some((a) => !Number.isFinite(Number(a.nth)))) warnings.push(`add_row ${target}: an action without a numeric nth`);
    if (fills.length) actions.push({ action: "add-row", page, section, target, rowsNeeded, should: "fill" });
    // Any "never" nth: rows beyond rowsNeeded must not be added (one graded check per section).
    if (nevers.length) actions.push({ action: "add-row", page, section, target, rowsMax: rowsNeeded, nths: nevers.sort((x, y) => x - y), should: "never" });
    // An "ask" nth (the person decides whether to add it) is recorded, not graded.
    if (asks.length) actions.push({ action: "add-row", page, section, target, nths: asks.sort((x, y) => x - y), should: "ask" });
  }
  const out = { tenant: key.tenant || (dir ? path.basename(path.resolve(dir)) : undefined), company: key.company, pages: key.pages || [], fields, actions, schema: 2 };
  if (key.job !== undefined) out.job = key.job;
  if (key.jobLocation !== undefined) out.jobLocation = key.jobLocation;
  if (key.notes !== undefined) out.notes = key.notes;
  out.key_warnings = warnings;
  return out;
}
// How many rows a repeating section holds now (rows the extension must not add are graded by this).
function countSectionRows(list) {
  const re = /-\d+-panel$/;
  return list.map(({ target, section }) => {
    const box = target ? document.querySelector(`[data-automation-id="${CSS.escape(target)}"]`) : null;
    const groups = Array.from((box || document).querySelectorAll('[role="group"][aria-labelledby$="-panel"]')).filter((g) => re.test(g.getAttribute("aria-labelledby")));
    const prefix = String(section || "").trim().replace(/\s+/g, "-") + "-";
    return box ? groups.length : groups.filter((g) => g.getAttribute("aria-labelledby").startsWith(prefix)).length;
  });
}
// A schema-2 section with a "never" add_row: once the step is filled it must hold at most rowsMax (= rowsNeeded) rows.
// The harness cannot tell who added a row; rows already present when Workday served the page would count too.
function gradeAddRow(a, count) {
  const base = { page: a.page, label: `${a.section}: no rows beyond ${a.rowsMax} (add_row never: ${a.nths.join(", ")})`, type: "add-row", should: "never",
    expected: `at most ${a.rowsMax} rows`, got: count, source: null, selector: null };
  return count > a.rowsMax ? { ...base, verdict: "never-violation", why: `the section holds ${count} rows; at most ${a.rowsMax} may be added` } : { ...base, verdict: "never-ok" };
}

// ------------------------------------------------------------------------------------------------ reading the key rows
// Each row's control as the key names it, read in the page: its value by the key's type, whether it is hidden, and the
// names the extension may know it by (the control's id or name, its date group, its wrapper).
function readRows(rows) {
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const hidden = (n) => {
    for (; n && n !== document.body; n = n.parentElement) if (n.hidden || getComputedStyle(n).display === "none") return true;
    return false;
  };
  const labelFor = (i) => clean(i.id ? document.querySelector(`label[for="${CSS.escape(i.id)}"]`)?.textContent : i.closest("label")?.textContent);
  return rows.map((r) => {
    let els = [];
    try {
      els = Array.from(document.querySelectorAll(r.selector));
    } catch { /* a selector this page cannot read */ }
    if (!els.length) return { found: false, hidden: true, value: "", names: [] };
    const el = els[0];
    const wrap = el.closest('[data-automation-id^="formField-"], [data-automation-id="attachments-FileUpload"]');
    let value, list; // list: the chosen labels one by one, for a schema-2 "set" comparison (not used by schema 1)
    const spins = () => {
      const ps = Array.from(el.querySelectorAll('[role="spinbutton"]'));
      const v = ps.map((p) => p.value);
      return v.every((x) => !x) ? "" : v.join("/");
    };
    switch (r.type) {
      case "text": case "textarea": case "email": case "tel": value = String(el.value ?? ""); break;
      case "dropdown": { const t = clean(el.textContent); value = /^select one$/i.test(t) ? "" : t; break; }
      case "prompt": case "multiPrompt": {
        const c = el.closest('[data-automation-id="multiSelectContainer"]') || wrap || document;
        list = Array.from(c.querySelectorAll('[data-automation-id="promptSelectionLabel"]')).map((p) => clean(p.textContent));
        value = list.join(", ");
        break;
      }
      case "radio": list = els.filter((x) => x.checked).map(labelFor); value = list.join(", "); break;
      case "checkbox": value = !!el.checked; break;
      case "checkboxGroup": value = els.filter((x) => x.checked).map(labelFor); break;
      case "monthYear": case "year": case "date": value = el.matches('[role="spinbutton"]') ? String(el.value || "") : spins(); break;
      case "file": value = Array.from((wrap || document).querySelectorAll('[data-automation-id="file-upload-item-name"]')).map((n) => clean(n.textContent)).join(", "); break;
      case "password": value = el.value ? "(something typed)" : ""; break;
      default: value = el.matches("button") ? clean(el.textContent) : String(el.value ?? "");
    }
    const names = [el.id, el.getAttribute("name"), el.closest('[data-automation-id="dateInputWrapper"]')?.id, wrap?.getAttribute("data-automation-id"),
      wrap?.querySelector('[data-automation-id="select-files"]')?.id].filter(Boolean);
    return { found: true, hidden: hidden(el), value, names, ...(list ? { list } : {}) };
  });
}
// Rows of a repeating section match by their company, school or language, not by their order (the key's convention).
function remapRows(groups) {
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim().toLowerCase();
  const val = (el) => (!el ? "" : el.matches("button") ? clean(el.textContent) : el.matches('[data-automation-id="searchBox"]')
    ? Array.from((el.closest('[data-automation-id="multiSelectContainer"]') || document).querySelectorAll('[data-automation-id="promptSelectionLabel"]')).map((p) => clean(p.textContent)).join(", ")
    : clean(el.value));
  const used = new Set(), out = {};
  for (const g of groups) {
    const rows = Array.from(document.querySelectorAll(`[role="group"][aria-labelledby^="${g.panel}-"][aria-labelledby$="-panel"]`));
    for (const row of rows) {
      const n = Number(/-(\d+)-panel$/.exec(row.getAttribute("aria-labelledby"))[1]);
      if (used.has(g.panel + n)) continue;
      let el = null;
      try {
        el = row.querySelector(g.anchorSub);
      } catch { /* none */ }
      if (val(el) && val(el) === clean(g.expected)) {
        used.add(g.panel + n);
        out[g.panel + "-" + g.n] = n;
        break;
      }
    }
  }
  return out;
}
const PANEL = /^\[aria-labelledby="([A-Za-z-]+?)-(\d+)-panel"\]\s*(.*)$/;
function rowGroups(rows) {
  const groups = new Map();
  for (const r of rows) {
    const m = PANEL.exec(r.selector);
    if (!m) continue;
    const k = m[1] + "-" + m[2];
    if (!groups.has(k)) groups.set(k, { panel: m[1], n: Number(m[2]), rows: [] });
    groups.get(k).rows.push({ r, sub: m[3] });
  }
  const out = [];
  for (const g of groups.values()) {
    // Schema 2: a slot's rows name their entity (the employer, school, language or site the slot is about). The anchor is
    // the slot's row whose expected value is that entity; with none, the label rule below; with neither, by slot.
    const ent = g.rows.map((x) => x.r.entity).find((e) => typeof e === "string" && e.trim());
    const same = (x) => ent && x.r.expected != null && !Array.isArray(x.r.expected) && norm(x.r.expected) === norm(ent);
    const byEntity = ent ? g.rows.find((x) => same(x) && x.r.should === "fill") || g.rows.find(same) : null;
    const a = byEntity || g.rows.find((x) => x.r.should === "fill" && /^(company|company name|employer|school|school or university|university|school name|language)$/i.test(String(x.r.label).trim()) && x.r.expected);
    if (a) out.push({ panel: g.panel, n: g.n, anchorSub: a.sub, expected: String(a.r.expected) });
  }
  return out;
}
function remapSelector(sel, map) {
  const m = PANEL.exec(sel);
  if (!m) return sel;
  const to = map[m[1] + "-" + m[2]];
  return to ? `[aria-labelledby="${m[1]}-${to}-panel"] ${m[3]}` : sel;
}

// ------------------------------------------------------------------------------------------------ grading
const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const emptyExpected = (e) => e === "" || e === false || (Array.isArray(e) && !e.length);
const isEmpty = (v) => v === "" || v === false || v === null || v === undefined || (Array.isArray(v) && !v.length);
// Schema 2's `match`: how the page's value compares to `expected`.
const isBlank = (v) => isEmpty(v) || (typeof v === "string" && !v.trim());
const urlKey = (v) => {
  const s = String(v ?? "").trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/+$/, "");
  const cut = s.search(/[/?#]/);
  const host = (cut < 0 ? s : s.slice(0, cut)).toLowerCase().replace(/^www\./, ""); // hosts are case-insensitive; paths are not
  return host + (cut < 0 ? "" : s.slice(cut));
};
function matchBy(kind, e, value, list) {
  switch (kind) {
    case "exact": return String(value ?? "").trim() === String(e ?? "").trim();
    case "casefold": return norm(value) === norm(e);
    case "contains-casefold": return norm(value).includes(norm(e));
    case "digits": return digits(value) === digits(e);
    case "url": return urlKey(value) === urlKey(e);
    case "empty": return isBlank(value);
    case "empty-or-na": return isBlank(value) || /^(n\/a|not applicable)$/.test(norm(value));
    case "set": {
      const got = Array.isArray(list) ? list : Array.isArray(value) ? value : isBlank(value) ? [] : String(value).split(",");
      const a = [...new Set((Array.isArray(e) ? e : e == null ? [] : [e]).map(norm).filter(Boolean))].sort();
      const b = [...new Set(got.map(norm).filter(Boolean))].sort();
      return JSON.stringify(a) === JSON.stringify(b);
    }
  }
  return null; // unknown: the harness's own comparison decides
}
// The correct final state is empty: schema 1 says so with an empty expected, schema 2 also with match "empty"/"empty-or-na".
const wantsEmpty = (row) => emptyExpected(row.expected) || row.match === "empty" || row.match === "empty-or-na";
function matches(row, value, list) {
  const e = row.expected;
  if (row.match) {
    const r = matchBy(row.match, e, value, list);
    if (r !== null) return r;
  }
  if (row.type === "checkbox") return !!value === !!e;
  if (Array.isArray(e) || Array.isArray(value)) {
    const a = (Array.isArray(e) ? e : [e]).map(norm).sort(), b = (Array.isArray(value) ? value : [value]).filter((x) => x !== "").map(norm).sort();
    return JSON.stringify(a.filter(Boolean)) === JSON.stringify(b);
  }
  if (emptyExpected(e)) return isEmpty(value);
  if (norm(value) === norm(e)) return true;
  // A number, a phone or a pay amount: the same digits in any rendering ("$95,000", "555-010-0000"); never with letters in the expected.
  return /^[\d\s$,.()+-]+$/.test(String(e)) && digits(e).length >= 4 && !/[a-z]/i.test(String(value).replace(/\b(usd|dollars)\b/gi, "")) && digits(value) === digits(e);
}
function cardField(fields, names) {
  return fields.find((f) => names.includes(f.name)) ||
    fields.find((f) => names.some((n) => f.name.startsWith(n + "@") || f.name.startsWith(n + "~"))) || null;
}
function grade(row, read, fields) {
  const f = read.found ? cardField(fields, read.names) : null;
  const src = f?.source ?? null, trainee = src === "trainee";
  const base = { page: row.page, label: row.label, type: row.type, should: row.should, expected: row.expected ?? null, got: read.value, source: src, selector: row.selector,
    ...(row.match ? { match: row.match } : {}), ...(row.entity ? { entity: row.entity } : {}) };
  if (row.should === "fill") {
    if (!read.found) return { ...base, verdict: "missed", why: "the control is not on the page (a row not added?)" };
    if (matches(row, read.value, read.list)) {
      if (trainee) return { ...base, verdict: "fill-correct" };
      if (wantsEmpty(row)) return { ...base, verdict: "fill-correct", by_leaving: true };
      if (src === "workday") return { ...base, verdict: "page-set", why: "set by Workday before Trainee read the page: shown as Workday's, not Trainee's" };
      return { ...base, verdict: "page-set", why: "a value nobody on the card claims" };
    }
    if (trainee) return { ...base, verdict: "fill-wrong" };
    if (isEmpty(read.value)) return { ...base, verdict: "missed" };
    return { ...base, verdict: src === "workday" ? "page-set-wrong" : "missed", why: "a value Trainee did not set, and not the right one" };
  }
  if (row.should === "ask") return { ...base, verdict: trainee ? "wrongly-filled-ask" : "asked-correctly" };
  if (row.should === "never") {
    if (trainee) return { ...base, verdict: "never-violation" };
    if (row.conditional && read.found && !read.hidden) return { ...base, verdict: "never-violation", why: "a conditional field that must stay hidden is showing" };
    return { ...base, verdict: "never-ok" };
  }
  return { ...base, verdict: "unknown-should" };
}

// ------------------------------------------------------------------------------------------------ the test person
// Every required field still empty, answered by the person with real input. What they type is theirs, never graded.
function tagRequired() {
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const sel = '[data-automation-id^="formField-"], [data-automation-id="attachments-FileUpload"]';
  const out = [];
  Array.from(document.querySelectorAll(sel)).filter((w) => !w.parentElement.closest(sel) && vis(w)).forEach((w, i) => {
    const req = Array.from(w.querySelectorAll("abbr")).some((a) => /\*/.test(a.textContent)) || !!w.querySelector('[aria-required="true"]');
    if (!req) return;
    const file = w.querySelector('input[type="file"]'), date = w.querySelector('[data-automation-id="dateInputWrapper"]');
    const prompt = w.querySelector('[data-automation-id="searchBox"]'), list = w.querySelector('button[aria-haspopup="listbox"]');
    const radios = w.querySelectorAll('input[type="radio"]'), boxes = w.querySelectorAll('input[type="checkbox"]');
    const area = w.querySelector("textarea"), text = w.querySelector('input:not([type]), input[type="text"], input[type="email"], input[type="tel"]');
    let kind = null, empty = false, parts = 0;
    if (w.querySelector('input[type="password"]')) return;
    if (file) [kind, empty] = ["file", !w.querySelector('[data-automation-id="file-upload-item"]')];
    else if (date) {
      const ps = Array.from(date.querySelectorAll('[role="spinbutton"]'));
      [kind, empty, parts] = ["date", ps.some((p) => !p.value), ps.length];
    } else if (prompt) [kind, empty] = ["prompt", !w.querySelector('[data-automation-id="selectedItem"], [data-automation-id="promptSelectionLabel"]')];
    else if (list) [kind, empty] = ["list", /^select one$/i.test(list.textContent.trim()) || !list.textContent.trim()];
    else if (radios.length) [kind, empty] = ["radio", !Array.from(radios).some((r) => r.checked)];
    else if (boxes.length) [kind, empty] = ["box", !Array.from(boxes).some((r) => r.checked)];
    else if (area) [kind, empty] = ["text", !area.value.trim()];
    else if (text) [kind, empty] = ["text", !text.value.trim()];
    if (!kind || !empty) return;
    w.setAttribute("data-eval-person", String(i));
    out.push({ i, kind, parts });
  });
  return out;
}
// The person drags their file onto Workday's drop zone: a real (trusted) drop, as the browser makes it. Playwright's own
// file setters fire untrusted events, which the extension rightly treats as the page's, not the person's.
async function personDropsFile(page, wrapper) {
  const zone = wrapper.locator('[data-automation-id="file-upload-drop-zone"]').first();
  await (await zone.count() ? zone : wrapper).scrollIntoViewIfNeeded();
  const box = (await zone.count()) ? await zone.boundingBox() : await wrapper.boundingBox();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "trainee-wd-file-")), TEST_FILE.name);
  fs.writeFileSync(file, TEST_FILE.buffer);
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const data = { items: [], files: [file], dragOperationsMask: 1 };
  for (const type of ["dragEnter", "dragOver", "drop"]) await cdp.send("Input.dispatchDragEvent", { type, x, y, data });
  await cdp.detach().catch(() => {});
}
const POPUP = '[role="listbox"]:not([data-automation-id="selectedItemList"])';
async function personAnswers(page, log) {
  const done = [];
  for (let round = 0; round < 4; round++) {
    const todo = await page.evaluate(tagRequired);
    if (!todo.length) break;
    for (const t of todo) {
      const w = page.locator(`[data-eval-person="${t.i}"]`).first();
      try {
        if (t.kind === "text") await w.locator("textarea, input:not([type]), input[type=text], input[type=email], input[type=tel]").first().fill("TEST answer typed by the person");
        else if (t.kind === "radio") await w.locator('input[type="radio"]').first().check();
        else if (t.kind === "box") await w.locator('input[type="checkbox"]').first().check();
        else if (t.kind === "file") await personDropsFile(page, w);
        else if (t.kind === "date") {
          await w.locator('[role="spinbutton"]').first().click();
          await page.keyboard.type(t.parts === 1 ? "2020" : t.parts === 2 ? "012020" : "01012020", { delay: 15 });
        } else if (t.kind === "list") {
          await w.locator('button[aria-haspopup="listbox"]').first().click();
          const opt = page.locator(`${POPUP} [role="option"]:not([aria-disabled="true"])`).filter({ hasNotText: /^\s*Select One\s*$/i }).first();
          await opt.click({ timeout: 3000 });
        } else if (t.kind === "prompt") {
          // The open list's options (never a chosen pill of another prompt, which is an option of its own list); a category
          // opens the next level, which replaces the list.
          await w.locator('[data-automation-id="searchBox"]').first().click();
          for (let k = 0; k < 4; k++) {
            const opt = page.locator(`${POPUP} [role="option"]`).first();
            await opt.waitFor({ timeout: 3000 });
            const cat = (await opt.getAttribute("aria-haspopup")) === "true" || (await opt.locator('[data-automation-id="promptOptionMore"], .wd-icon-chevron-right-small').count()) > 0;
            await opt.click();
            if (!cat) break;
            await sleep(150);
          }
          await page.keyboard.press("Escape").catch(() => {});
        }
        done.push(t.kind);
      } catch (e) {
        log(`  the test person could not answer a required ${t.kind}: ${String(e.message).split("\n")[0]}`);
      }
      await sleep(80);
    }
    await sleep(300);
  }
  await page.evaluate(() => document.querySelectorAll("[data-eval-person]").forEach((e) => e.removeAttribute("data-eval-person")));
  return done;
}
// The person signs in on Workday's own sign-in step, themselves (TEST credentials, typed by the test person, with real
// keys and a real pointer). Round 2: Workday lays a click_filter over its own Sign In button, so the person's click lands
// on whatever is on top at the button's centre (as a real click does), never on a hidden control; an email-first sign-in
// (only the email and Next, the password on the next view) takes two rounds. Nothing here is the extension's.
async function personSignsIn(page) {
  const before = page.url();
  for (let round = 0; round < 3; round++) {
    const inputs = await page.evaluate(() => {
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const view = Array.from(document.querySelectorAll('[data-automation-id="signInContent"], [data-automation-id="createAccountContent"]')).find(vis) || document.body;
      document.querySelectorAll("[data-eval-signin]").forEach((e) => e.removeAttribute("data-eval-signin"));
      return Array.from(view.querySelectorAll("input")).filter((i) => vis(i) && i.type !== "hidden" && i.getAttribute("data-automation-id") !== "beecatcher" && i.tabIndex !== -1)
        .map((i, n) => (i.setAttribute("data-eval-signin", String(n)), { n: String(n), type: i.type, empty: i.type === "checkbox" ? !i.checked : !i.value }));
    });
    for (const i of inputs.filter((x) => x.empty)) {
      const loc = page.locator(`[data-eval-signin="${i.n}"]`);
      if (i.type === "checkbox") await loc.check().catch(() => {});
      else {
        await loc.click().catch(() => {});
        await page.keyboard.type(i.type === "password" ? "TEST-password-typed-by-the-person" : "test.person@example.test", { delay: 5 });
      }
    }
    // The button the person presses: the view's own submit (Sign In, Create Account, Next, Continue), by its centre.
    const box = await page.evaluate(() => {
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const label = (b) => String(b.getAttribute("aria-label") || b.value || b.textContent || "").replace(/\s+/g, " ").trim();
      const b = Array.from(document.querySelectorAll('[data-automation-id="click_filter"], button, [role="button"], input[type="submit"]'))
        .find((x) => vis(x) && /^(sign in|create account|next|continue|log in)$/i.test(label(x)));
      if (!b) return null;
      b.scrollIntoView({ block: "center" });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!box) throw Error("the test person found no Sign In, Next or Continue button");
    await page.mouse.click(box.x, box.y);
    // Moved on (signed in), or the next view of the same sign-in (the password after the email).
    const end = Date.now() + 8000;
    let more = false;
    while (Date.now() < end) {
      if (page.url() !== before) return;
      more = await page.evaluate(() => Array.from(document.querySelectorAll("input")).some((i) => i.getClientRects().length > 0 && i.type !== "hidden" &&
        i.getAttribute("data-automation-id") !== "beecatcher" && i.tabIndex !== -1 && (i.type === "checkbox" ? false : !i.value))).catch(() => false);
      if (more) break;
      await sleep(150);
    }
    if (!more) {
      // Workday answered nothing to the click: the person presses Enter in the last box, as people do.
      await page.keyboard.press("Enter").catch(() => {});
      await sleep(1500);
      if (page.url() !== before) return;
    }
  }
}

// ------------------------------------------------------------------------------------------------ one tenant
function slug(s) {
  return String(s || "").replace(/\(.*?\)/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tenant";
}
async function runTenant(o) {
  const log = o.log || ((m) => console.error(m));
  const dir = path.resolve(o.tenant);
  const key = normalizeKey(JSON.parse(fs.readFileSync(path.join(dir, "key.json"), "utf8")), dir);
  const persona = JSON.parse(fs.readFileSync(o.persona || PERSONA, "utf8")).facts;
  const pages = key.pages || [];
  const submitAction = (key.actions || []).find((a) => a.action === "submit");
  const report = {
    measured_at: new Date().toISOString(), tenant: key.tenant || path.basename(dir), company: key.company, evidence: "VERIFIED-S on TEST Workday-shaped pages; real Workday NOT_RUN",
    pages: [], rows: [], actions: [], submitted: false, records: 0, errors: [],
  };
  if (key.schema === 2) {
    report.key_schema = 2;
    report.key_warnings = key.key_warnings || [];
    for (const w of report.key_warnings) log(`${report.tenant}: key warning: ${w}`);
  }
  const world = await startWorld();
  const host = `${slug(key.company)}.wd5.myworkdayjobs.com`;
  const base = `/en-US/External/job/${slug(key.jobLocation || "Remote")}/${slug(key.job || "Job")}_R-10001/apply/`;
  const tenant = world.workdayTenant({ host, dir, base });
  for (const [k, v] of Object.entries(persona)) world.answer("fact:" + k, "fact", String(v));
  let browser = null;
  try {
    browser = await launch(world);
    const { ctx, sw } = browser;
    await signIn(ctx, sw);
    const page = await ctx.newPage();
    await page.goto(tenant.url(pages[0]), { waitUntil: "domcontentloaded" });
    await sleep(200);
    const tabId = await tabIdOf(sw, page.url());
    const panel = await openPanel(ctx, sw, tabId);
    let pressedFill = false;
    for (let step = 0; step < pages.length + 2; step++) {
      await page.waitForLoadState("domcontentloaded");
      const url = page.url();
      const file = decodeURIComponent(new URL(url).pathname.slice(base.length));
      const name = file.replace(/\.html$/, "");
      const rows = (key.fields || []).filter((r) => r.page === name);
      log(`${report.tenant}: ${file}`);
      // Fill: the person presses it on the first step; afterwards each step fills itself.
      let card = await waitCard(sw, tabId, settled(url), pressedFill ? 12000 : 1500);
      if (!card) {
        await panel.click("#fill");
        pressedFill = true;
        card = await waitCard(sw, tabId, settled(url), 60000);
      }
      if (!card) {
        const c = await cardOf(sw, tabId);
        report.errors.push(`${file}: no card for this step (the card now: ${JSON.stringify(c && { status: c.status, url: c.url, message: c.message })})`);
        break;
      }
      // Grade before the person touches anything.
      const map = await page.evaluate(remapRows, rowGroups(rows));
      const read = await page.evaluate(readRows, rows.map((r) => ({ ...r, selector: remapSelector(r.selector, map) })));
      const fields = card.payload?.fields || [];
      const graded = rows.map((r, i) => grade(r, read[i], fields));
      // Schema 2: rows the key says must not be added (add_row, should "never").
      const neverRows = (key.actions || []).filter((a) => a.action === "add-row" && a.page === name && a.should === "never" && Number.isFinite(a.rowsMax));
      if (neverRows.length) {
        const counts = await page.evaluate(countSectionRows, neverRows.map((a) => ({ target: a.target, section: a.section })));
        neverRows.forEach((a, i) => graded.push(gradeAddRow(a, counts[i])));
      }
      report.rows.push(...graded);
      const traineeNames = new Set(fields.filter((f) => f.source === "trainee").map((f) => f.name));
      const keyed = new Set(read.flatMap((x) => x.names));
      const unkeyed = [...traineeNames].filter((n) => !keyed.has(n) && ![...keyed].some((k) => n.startsWith(k + "@") || n.startsWith(k + "~")));
      const pg = { file, status: card.status, action: card.action || null, message: card.message, lines: card.lines || [], blockers: card.blockers || [], unkeyed_trainee_fills: unkeyed,
        verdicts: graded.reduce((a, g) => ((a[g.verdict] = (a[g.verdict] || 0) + 1), a), {}) };
      report.pages.push(pg);
      if (card.status === "stopped" && /Sign in to/.test(card.message || "")) {
        // A sign-in step: the person signs in themselves; the next step fills itself.
        report.actions.push({ page: file, action: "sign-in", by: "the test person" });
        const before = url;
        await personSignsIn(page);
        await page.waitForURL((u) => String(u) !== before, { timeout: 15000 });
        continue;
      }
      if (card.action === "submit") {
        const want = submitAction?.should;
        report.actions.push({ page: file, action: "submit", should: want ?? null, card_offers_submit: card.status === "ready" || card.status === "blocked" });
        if (want === "fill" || want === "do") {
          await panel.waitForSelector("#approve:not([disabled])", { timeout: 15000 });
          await panel.click("#approve");
          await waitCard(sw, tabId, (c) => c.status === "done", 40000);
        }
        break;
      }
      // A draft step: the person answers what is theirs, then approves this page's exact payload.
      const answered = await personAnswers(page, log);
      card = await waitCard(sw, tabId, (c) => c.url === url && c.status === "ready", 15000);
      if (!card) {
        const c = await cardOf(sw, tabId);
        report.errors.push(`${file}: the card never became ready: ${JSON.stringify(c?.blockers || c?.message || null).slice(0, 400)}`);
        break;
      }
      pg.person_answered = answered;
      await panel.waitForSelector("#approve:not([disabled])", { timeout: 10000 });
      const before = url;
      await panel.click("#approve");
      try {
        await page.waitForURL((u) => String(u) !== before, { timeout: 20000 });
      } catch {
        const c = await cardOf(sw, tabId);
        report.errors.push(`${file}: Save and Continue did not move on: ${String(c?.message || "").slice(0, 300)}`);
        break;
      }
    }
    report.submitted = await page.evaluate(() => window.__submitted === true).catch(() => false);
    report.records = world.state.begins.length;
    // Ask once (round 2): what the extension sent Trainee to ask by text, step by step (labels only).
    report.questions_stored = world.state.putCalls.map((c) => (c.p_questions || []).map((q) => q.label));
    report.served = tenant.served.slice();
    report.drafts_kept = (await sw.evaluate(async () => (await chrome.storage.local.get("workday_drafts")).workday_drafts || [])).length;
  } catch (e) {
    report.errors.push(String(e && e.stack || e).slice(0, 2000));
  } finally {
    await browser?.close();
    await world.close();
  }
  return summarize(report);
}
function summarize(report) {
  const rows = report.rows;
  const n = (v) => rows.filter((r) => r.verdict === v).length;
  const should = rows.filter((r) => r.should === "fill").length;
  const correct = n("fill-correct");
  const traineeCorrect = rows.filter((r) => r.verdict === "fill-correct" && !r.by_leaving).length;
  const traineeFilled = rows.filter((r) => r.source === "trainee").length;
  const nonEmptyShould = rows.filter((r) => r.should === "fill" && !wantsEmpty(r)).length;
  const traineeCorrectNonEmpty = rows.filter((r) => r.verdict === "fill-correct" && !r.by_leaving && !wantsEmpty(r)).length;
  report.counts = {
    should_fill: should, fill_correct: correct, fill_correct_by_leaving_empty: rows.filter((r) => r.by_leaving).length, fill_wrong: n("fill-wrong"), missed: n("missed"),
    page_set: n("page-set"), page_set_wrong: n("page-set-wrong"), asked_correctly: n("asked-correctly"), wrongly_filled_ask: n("wrongly-filled-ask"),
    never_ok: n("never-ok"), never_violations: n("never-violation"), trainee_filled: traineeFilled, trainee_correct: traineeCorrect,
  };
  report.coverage = should ? correct / should : 0;
  report.coverage_strict = nonEmptyShould ? traineeCorrectNonEmpty / nonEmptyShould : 0; // only rows with a value to fill, only Trainee's fills
  report.precision = traineeFilled ? traineeCorrect / traineeFilled : 1;
  report.wrong = n("fill-wrong") + n("wrongly-filled-ask");
  report.never_violations = n("never-violation");
  const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1) + "%";
  report.summary = `workday-fill ${report.tenant}: coverage ${pct(report.coverage)} (${correct}/${should}), strict ${pct(report.coverage_strict)} (${traineeCorrectNonEmpty}/${nonEmptyShould}), ` +
    `precision ${pct(report.precision)} (${traineeCorrect}/${traineeFilled}), wrong ${report.wrong}, never-violations ${report.never_violations}, ` +
    `submitted ${report.submitted ? "YES" : "no"}, records ${report.records}, errors ${report.errors.length} [${report.evidence}]`;
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : null);
  const tenant = opt("--tenant");
  if (!tenant) {
    console.error("usage: node evals/apply/workday-fill.cjs --tenant <dir> [--out file] [--persona file]");
    process.exit(2);
  }
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
  } catch {
    console.error("NOT_RUN: openssl is needed for the TEST world's certificate");
    process.exit(2);
  }
  const report = await runTenant({ tenant, persona: opt("--persona") || undefined });
  const out = opt("--out");
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(report.summary);
  process.exit(report.errors.length ? 1 : 0);
}
module.exports = { runTenant, launch, openPanel, signIn, waitCard, cardOf, tabIdOf, matches, matchBy, grade, gradeAddRow, summarize, slug, personSignsIn, personAnswers,
  normalizeKey, rowGroups, wantsEmpty };
if (require.main === module) main();
