'use strict';
// Synthetic Workday DOM-boundary regressions: actual readWorkday preserves the native field contract.
// Source controls use an element tree; strict-sandbox browser replay is separately labelled NOT_RUN when unavailable.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
let dir, bundle, runtime, reader, browser, context, blocked;
class Element {
  constructor(tag, attrs = {}, children = [], text = '') { this.tagName = tag.toUpperCase(); this.attrs = attrs; this.children = children; this.text = text; this.isConnected = true; for (const c of children) c.parentElement = this; }
  getAttribute(k) { return Object.hasOwn(this.attrs, k) ? String(this.attrs[k]) : null; }
  get id() { return this.attrs.id || ''; } get name() { return this.attrs.name || ''; } get type() { return this.attrs.type || 'text'; }
  get value() { return this.attrs.value || ''; } get required() { return Object.hasOwn(this.attrs, 'required'); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  getClientRects() { return [{}]; }
  matches(selector) { return selector.split(',').some((s) => {
    s = s.trim(); if (s.includes(':scope') || s.includes(' ')) return false;
    const absent = [...s.matchAll(/:not\(\[([^\]]+)\]\)/g)].map((m) => m[1]); if (absent.some((a) => this.getAttribute(a) !== null)) return false;
    s = s.replace(/:not\(\[[^\]]+\]\)/g, '');
    const tag = /^[a-z]+/i.exec(s)?.[0]; if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (s.startsWith('#')) return this.id === s.slice(1);
    return [...s.matchAll(/\[([\w-]+)(?:(\^=|\$=|\*=|=)['"]?([^'"\]]*)['"]?)?\]/g)].every((m) => {
      const v = this.getAttribute(m[1]); return m[2] === '=' ? v === m[3] : m[2] === '^=' ? v?.startsWith(m[3]) : m[2] === '$=' ? v?.endsWith(m[3]) : m[2] === '*=' ? v?.includes(m[3]) : v !== null;
    });
  }); }
  closest(s) { return this.matches(s) ? this : this.parentElement?.closest(s) ?? null; }
  querySelectorAll(s) { return this.children.flatMap((c) => [...(c.matches(s) ? [c] : []), ...c.querySelectorAll(s)]); }
  querySelector(s) { return this.querySelectorAll(s)[0] ?? null; }
}
const field = (type, attrs = {}) => new Element('div', { 'data-automation-id': 'formField-native' }, [new Element('label', { for: 'native' }, [], 'Synthetic question'), new Element('input', { id: 'native', type, ...attrs })]);
function documentOf(children) { const body = new Element('body', {}, [new Element('div', { 'data-automation-id': 'applyFlowPage' }, children)]); return { body, querySelector: (s) => body.querySelector(s), querySelectorAll: (s) => body.querySelectorAll(s), getElementById: (id) => body.querySelector('#' + id) }; }
const cases = [
  { name: 'native number', type: 'number', attrs: { min: '0', max: '60', step: '0.5', required: '' }, expected: { type: 'number', min: '0', max: '60', step: '0.5', required: true } },
  { name: 'native date', type: 'date', attrs: { min: '2026-10-21', max: '2027-10-21', required: '' }, expected: { type: 'date', min: '2026-10-21', max: '2027-10-21', required: true } },
  { name: 'native month', type: 'month', attrs: { min: '2026-10', max: '2028-10', step: '2' }, expected: { type: 'month', min: '2026-10', max: '2028-10', step: '2', required: false } },
  { name: 'native text constraints', type: 'text', attrs: { pattern: '[A-Z]{2}', minlength: '2', maxlength: '2' }, expected: { type: 'text', pattern: '[A-Z]{2}', minLength: 2, maxLength: 2, required: false } },
  { name: 'native email', type: 'email', attrs: {}, expected: { type: 'email', required: false } },
  { name: 'native telephone', type: 'tel', attrs: {}, expected: { type: 'tel', required: false } },
  { name: 'native URL', type: 'url', attrs: {}, expected: { type: 'url', required: false } },
];
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workday-native-reader-'));
  const esbuild = process.env.UPMORE_ESBUILD_PATH || (process.env.ESBUILD_BIN ? path.resolve(path.dirname(process.env.ESBUILD_BIN), '..', 'esbuild') : 'esbuild');
  bundle = require(esbuild).buildSync({ entryPoints: [path.join(ROOT, 'extension/src/dom.ts')], bundle: true, platform: 'browser', format: 'iife', globalName: 'WorkdayNativeReader', write: false, logLevel: 'silent' }).outputFiles[0].text;
  runtime = { console, URL, setTimeout, clearTimeout, getComputedStyle: () => ({ visibility: 'visible' }) }; vm.createContext(runtime); vm.runInContext(bundle, runtime); reader = runtime.WorkdayNativeReader;
  let pw; for (const p of [process.env.UPMORE_PLAYWRIGHT_PATH, 'playwright']) { if (!p) continue; try { pw = require(p); break; } catch {} }
  try { if (!pw) throw Error('Playwright unavailable'); browser = await pw.chromium.launch({ executablePath: process.env.UPMORE_CHROMIUM_PATH || pw.chromium.executablePath(), chromiumSandbox: true, headless: true, env: { ...process.env, XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir }, args: ['--disable-background-networking', '--disable-component-update', '--host-resolver-rules=MAP * ~NOTFOUND'] }); context = await browser.newContext(); await context.route('**/*', (r) => r.abort()); }
  catch (e) { blocked = String(e.message).split('\n').find((l) => /FATAL:|unavailable|doesn't exist/i.test(l)) || String(e.message).split('\n')[0]; }
});
after(async () => { await context?.close(); await browser?.close(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
function check(form, c) { const f = form.schema.find((s) => s.name === 'native'); assert.ok(f, 'reader omitted native field'); for (const [key, expected] of Object.entries(c.expected)) assert.equal(f[key], expected, 'lost ' + key); assert.equal(form.bindings.native.inputType, c.type, 'native binding type was narrowed'); }
for (const c of cases) test('Workday actual source reader: ' + c.name, () => { runtime.document = documentOf([field(c.type, c.attrs)]); check(reader.readWorkday(), c); });
test('Workday actual source reader controls: custom list/prompt/date keep widget types and date format', () => {
  const date = new Element('div', { id: 'workExperience-1--startDate', 'data-automation-id': 'dateInputWrapper' }, [new Element('input', { role: 'spinbutton', 'data-automation-id': 'dateSectionMonth-input', 'aria-label': 'Month' }), new Element('input', { role: 'spinbutton', 'data-automation-id': 'dateSectionYear-input', 'aria-label': 'Year' })]);
  const row = new Element('div', { role: 'group', 'aria-labelledby': 'Work-Experience-1-panel' }, [new Element('div', { 'data-automation-id': 'formField-start' }, [new Element('label', { for: date.id }, [], 'From'), date])]);
  const section = new Element('section', { 'aria-labelledby': 'work-heading' }, [new Element('h3', { id: 'work-heading' }, [], 'Work Experience'), row]);
  const list = new Element('div', { 'data-automation-id': 'formField-list' }, [new Element('label', {}, [], 'Synthetic choice'), new Element('button', { id: 'list', 'aria-haspopup': 'listbox' }, [], 'Select one')]);
  const prompt = new Element('div', { 'data-automation-id': 'formField-prompt' }, [new Element('label', {}, [], 'Synthetic search'), new Element('input', { id: 'prompt', type: 'text', 'data-automation-id': 'searchBox' })]);
  runtime.document = documentOf([section, list, prompt]); const form = reader.readWorkday();
  assert.equal(form.schema.find((s) => s.name === date.id).type, 'date'); assert.equal(form.bindings[date.id].widget, 'wd-date'); assert.equal(form.schema.find((s) => s.name === date.id).section.format, 'MM/YYYY');
  assert.equal(form.schema.find((s) => s.name === 'list').type, 'select'); assert.equal(form.bindings.list.widget, 'wd-list'); assert.equal(form.schema.find((s) => s.name === 'prompt').type, 'select'); assert.equal(form.bindings.prompt.widget, 'wd-prompt');
});
test('Workday actual source reader control: native telephone keeps its separate country dial code', () => {
  const country = new Element('div', { 'data-automation-id': 'formField-countryPhoneCode' }, [new Element('label', {}, [], 'Country phone code'), new Element('button', { id: 'country-code', 'aria-haspopup': 'listbox' }, [], 'United States (+1)')]);
  const phone = new Element('div', { 'data-automation-id': 'formField-phoneNumber' }, [new Element('label', { for: 'contact--phoneNumber' }, [], 'Phone Number'), new Element('input', { id: 'contact--phoneNumber', type: 'tel' })]);
  runtime.document = documentOf([country, phone]); const form = reader.readWorkday(), schema = form.schema.find((s) => s.name === 'contact--phoneNumber');
  assert.equal(schema.type, 'tel'); assert.equal(schema.dial, '+1'); assert.equal(form.bindings['contact--phoneNumber'].inputType, 'tel');
});
for (const c of cases) test('Workday strict sandbox DOM: ' + c.name, async (t) => {
  if (blocked) { if (process.env.CI === 'true') assert.fail('NOT_RUN: strict sandbox browser unavailable: ' + blocked); t.skip('NOT_RUN: strict sandbox browser unavailable: ' + blocked); return; }
  const page = await context.newPage(); let requests = 0; page.on('request', () => { requests++; });
  try { const attrs = Object.entries(c.attrs).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' '); await page.setContent(`<div data-automation-id="formField-native"><label for="native">Synthetic question</label><input id="native" type="${c.type}" ${attrs}></div>`); await page.addScriptTag({ content: bundle }); const form = await page.evaluate(() => globalThis.WorkdayNativeReader.readWorkday()); check(form, c); assert.equal(requests, 0); } finally { await page.close(); }
});
