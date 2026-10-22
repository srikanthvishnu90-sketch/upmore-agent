'use strict';
// Greenhouse selected chips, not unpicked search text, must survive readback and the review card.
// Synthetic fixtures only. Bundle sources into /tmp; never rewrite the shared checked-in bundle here.
// Browser leg requires chromiumSandbox:true. Missing/unsupported browsers are NOT_RUN locally and fail CI.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
let dir, bundle, core, browser, context, browserBlocked;
const cases = [
  { name: 'single selected value', single: 'Reporting Certificate', labels: [], search: '', expected: 'Reporting Certificate' },
  { name: 'one selected chip', labels: ['Reporting Certificate'], search: '', expected: 'Reporting Certificate' },
  { name: 'two selected chips in page order', labels: ['Reporting Certificate', 'Analysis Certificate'], search: '', expected: 'Reporting Certificate, Analysis Certificate' },
  { name: 'selected labels beside unpicked search', labels: ['Analysis Certificate', 'Reporting Certificate'], search: 'Unpicked Certificate', expected: 'Analysis Certificate, Reporting Certificate' },
  { name: 'blank multi-select', labels: [], search: '', expected: '' },
  { name: 'unpicked search alone', labels: [], search: 'Reporting Certificate', expected: '' },
];
// A minimal element tree for the source-level readback controls. Selectors are interpreted generically;
// browser tests below exercise discovery and the content script against actual DOM nodes.
class Element {
  constructor(className = '', text = '', children = []) { this.className = className; this.text = text; this.children = children; for (const c of children) c.parentElement = this; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  matches(selector) { return selector.split(',').some((part) => { const classes = [...part.matchAll(/\[class\*=['"]([^'"]+)['"]\]/g)]; return classes.length > 0 && classes.every((m) => this.className.includes(m[1])); }); }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
  querySelectorAll(selector) { return this.children.flatMap((c) => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
function tree(c) {
  const input = new Element('select__input'); input.value = c.search;
  const labels = c.labels.map((label) => new Element('select__multi-value', '', [new Element('select__multi-value__label', label), new Element('select__multi-value__remove', 'Remove')]));
  new Element('select__control', '', [new Element('select__value-container', '', [...(c.single ? [new Element('select__single-value', c.single)] : []), ...labels, new Element('select__input-container', '', [input])])]);
  return input;
}
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'greenhouse-savedform-'));
  const out = path.join(dir, 'core.js');
  const esbuild = process.env.UPMORE_ESBUILD_PATH || (process.env.ESBUILD_BIN ? path.resolve(path.dirname(process.env.ESBUILD_BIN), '..', 'esbuild') : 'esbuild');
  require(esbuild).buildSync({ entryPoints: [path.join(ROOT, 'extension/src/core.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: out, logLevel: 'silent' });
  bundle = fs.readFileSync(out, 'utf8');
  const sandbox = { console, URL, TextEncoder, TextDecoder, crypto: webcrypto, setTimeout, clearTimeout };
  vm.createContext(sandbox); vm.runInContext(bundle, sandbox); core = sandbox.TraineeCore;
  core.setDocument = (document) => { sandbox.document = document; };
  let pw;
  for (const p of [process.env.UPMORE_PLAYWRIGHT_PATH, 'playwright']) { if (!p) continue; try { pw = require(p); break; } catch {} }
  try {
    if (!pw) throw Error('Playwright not resolvable; set UPMORE_PLAYWRIGHT_PATH');
    const executablePath = process.env.UPMORE_CHROMIUM_PATH || pw.chromium.executablePath();
    browser = await pw.chromium.launch({ executablePath, headless: true, chromiumSandbox: true,
      env: { ...process.env, XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir },
      args: ['--disable-background-networking', '--disable-component-update', '--host-resolver-rules=MAP * ~NOTFOUND'] });
    context = await browser.newContext();
    await context.route('**/*', (r) => r.abort());
  } catch (e) { browserBlocked = String(e.message).split('\n').find((l) => /FATAL:|not resolvable|executable doesn't exist/i.test(l)) || String(e.message).split('\n')[0]; }
});
after(async () => { await context?.close(); await browser?.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
for (const c of cases) {
  test('Greenhouse source readback: ' + c.name, () => {
    const before = JSON.stringify(c), input = tree(c);
    core.setDocument({ querySelector: (s) => s === '#certifications' ? input : null });
    assert.equal(core.dom.readValue({ selector: '#certifications', widget: 'react-select', inputType: 'text' }), c.expected);
    assert.equal(JSON.stringify(c), before, 'reading never rewrites selected labels or their order');
  });
}
test('Greenhouse source fill: existing multi-select chips are never appended or relabelled as newly filled', async () => {
  const c = cases[2], input = tree(c);
  let touched = 0; input.focus = () => { touched++; };
  core.setDocument({ querySelector: (s) => s === '#certifications' ? input : null });
  // A fixture deliberately has no typing primitives: any attempted focus/type is a forbidden write to the existing
  // selection. Catch only so the assertion records that attempted write as well as a wrong success response.
  let result;
  try { result = await core.dom.fill({ selector: '#certifications', widget: 'react-select', inputType: 'text' }, 'Another Certificate', null); } catch {}
  assert.equal(touched, 0, 'an existing multi-selection was driven before the person reviewed it');
  assert.equal(result, false); assert.equal(core.dom.readValue({ selector: '#certifications', widget: 'react-select', inputType: 'text' }), c.expected);
});
test('Greenhouse source fill: an exact complete multi-select value is idempotent without opening or wiping it', async () => {
  const c = cases[2], input = tree(c); let touched = 0; input.focus = () => { touched++; };
  core.setDocument({ querySelector: (s) => s === '#certifications' ? input : null });
  assert.equal(await core.dom.fill({ selector: '#certifications', widget: 'react-select', inputType: 'text' }, c.expected, null), true);
  assert.equal(touched, 0); assert.equal(core.dom.readValue({ selector: '#certifications', widget: 'react-select', inputType: 'text' }), c.expected);
  assert.equal(core.dom.takeWidgetChoice(), null, 'no last-picked label replaces the complete existing selection');
});
test('Greenhouse source controls: ordinary text and native select keep their normal readback', () => {
  const input = { value: 'Synthetic Applicant' }, select = { selectedIndex: 1, options: [{ value: '', textContent: 'Select one' }, { value: 'allowed', textContent: 'Yes' }] };
  core.setDocument({ querySelector: (s) => s === '#name' ? input : select });
  assert.equal(core.dom.readValue({ selector: '#name', inputType: 'text' }), 'Synthetic Applicant');
  assert.equal(core.dom.readValue({ selector: '#native', inputType: 'select' }), 'Yes');
});
function escape(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function html(c) {
  const chips = c.labels.map((s) => `<div class="select__multi-value"><div class="select__multi-value__label">${escape(s)}</div><button type="button" aria-label="Remove ${escape(s)}">×</button></div>`).join('');
  return `<!doctype html><form><label for="first_name">First name</label><input id="first_name" name="first_name"><label for="certifications">Which certifications do you hold?</label><div class="select__container"><div class="select__control"><div class="select__value-container select__value-container--is-multi">${c.single ? `<div class="select__single-value">${escape(c.single)}</div>` : ''}${chips}<div class="select__input-container"><input id="certifications" name="certifications" class="select__input" role="combobox" value="${escape(c.search)}"></div></div></div></div><button type="submit">Submit</button></form>`;
}
for (const c of cases) {
  test('Greenhouse sandboxed DOM/card: ' + c.name, async (t) => {
    if (browserBlocked) { if (process.env.CI === 'true') assert.fail('NOT_RUN: strict sandbox browser unavailable: ' + browserBlocked); t.skip('NOT_RUN: strict sandbox browser unavailable: ' + browserBlocked); return; }
    const page = await context.newPage();
    let network = 0; page.on('request', () => { network++; });
    try {
      await page.setContent(html(c)); await page.addScriptTag({ content: bundle });
      const observed = await page.evaluate(() => {
        const D = globalThis.TraineeCore.dom, f = D.readForm();
        return { schema: f.schema.find((x) => x.name === 'certifications'), value: D.readValue(f.bindings.certifications) };
      });
      assert.equal(observed.schema.widget, 'react-select'); assert.equal(observed.value, c.expected);
      if (c.labels.length) {
        const filled = await page.evaluate(async () => {
          const D = globalThis.TraineeCore.dom, f = D.readForm(), b = f.bindings.certifications;
          const before = D.readValue(b), exact = await D.fill(b, before, null), result = await D.fill(b, 'Another Certificate', null);
          return { before, exact, result, after: D.readValue(b) };
        });
        assert.deepEqual(filled, { before: c.expected, exact: true, result: false, after: c.expected }, 'existing choices remain for review rather than being appended and attributed to Trainee');
      }
      // Run the actual content-script prepare -> snapshot -> refresh -> card path. Portal and hash adapters isolate
      // about:blank's synthetic origin; no backend or approval path is invoked, and all card/planner code is real.
      await page.evaluate(() => {
        globalThis.__cards = []; globalThis.__messages = []; globalThis.__submits = 0;
        document.addEventListener('submit', (e) => { e.preventDefault(); globalThis.__submits++; });
        globalThis.TraineeCore.detectPortal = () => ({ family: 'greenhouse', embedded: false });
        globalThis.TraineeCore.approvalHash = async () => 'SYNTHETIC-CARD-HASH';
        globalThis.chrome = { runtime: { id: 'SYNTHETIC-EXTENSION', onMessage: { addListener: (fn) => { globalThis.__listener = fn; } },
          sendMessage: async (m) => { globalThis.__messages.push(m.type); if (m.type === 'card') { globalThis.__cards.push(m.card); return { ok: true }; }
            if (m.type === 'context') return { signedIn: true, userId: 'SYNTHETIC-OWNER', answers: {}, saved: {}, resume: null, account: { epoch: 0, version: 1, paused: false } };
            return { queued: false, ok: true }; } } };
      });
      await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'extension/content.js'), 'utf8') });
      const card = await page.evaluate(async () => { await new Promise((resolve) => globalThis.__listener({ type: 'prepare' }, { id: 'SYNTHETIC-EXTENSION' }, resolve)); return globalThis.__cards.at(-1); });
      const field = card.payload.fields.find((f) => f.name === 'certifications');
      if (c.expected) { assert.equal(field.value, c.expected); assert.equal(field.source, 'page'); assert.ok(card.lines.some((l) => l.includes(c.expected))); assert.equal(card.status, 'blocked', 'page-provided chips never acquire user approval'); }
      else assert.equal(field, undefined, 'unpicked search is never an answer');
      assert.equal(card.approved, false);
      const effects = await page.evaluate(() => ({ submits: globalThis.__submits, messages: globalThis.__messages }));
      assert.equal(effects.submits, 0); assert.ok(!effects.messages.some((m) => /begin|finish|submit|approve/.test(m))); assert.equal(network, 0);
    } finally { await page.close(); }
  });
}
