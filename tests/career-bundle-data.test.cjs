// The career-only bundle carries its data compressed (scripts/build-router-core.py, CAREER_INFLATE): every const must
// inflate to exactly the value the plain JSON build embedded, from the same source files, and quickly enough for a cold
// start. A wrong inflater would hand the modules corrupted company records with no other test noticing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const bundle = fs.readFileSync(path.join(root, 'supabase/functions/_shared/router_core.career.js'), 'utf8');
const lines = bundle.split('\n');
const inflater = lines.find((l) => l.startsWith('const __careerData = '));
const data = lines.filter((l) => /^const CAREER_[A-Z_]+_JSON = __careerData\("/.test(l));
const names = data.map((l) => l.match(/^const (CAREER_[A-Z_]+_JSON)/)[1]);
const dir = (d) => path.join(root, 'packages/career-data', d);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const expected = {
  CAREER_FIRM_SETS_JSON: () => readJson(dir('firm-sets.json')),
  CAREER_CIRS_JSON: () => fs.readdirSync(dir('cirs')).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(path.join(dir('cirs'), f))),
  CAREER_INTERVIEW_BANKS_JSON: () => Object.fromEntries(fs.readdirSync(dir('interview-banks')).filter((f) => f.endsWith('.md')).sort()
    .map((f) => [f.replace(/\.md$/, ''), fs.readFileSync(path.join(dir('interview-banks'), f), 'utf8')])),
  CAREER_KB_JSON: () => readJson(dir('kb-aggregates.json')),
  CAREER_PAY_JSON: () => Object.fromEntries(Object.entries({ maps: 'pay-maps.json', lca_wages: 'dol-lca-wages.json', oews_metro: 'bls-oews-metro.json',
    bls_national: 'bls-labor-data.json', lca_companies: 'dol-lca-fy2025q4-cir-companies.json' }).map(([k, f]) => [k, readJson(dir(path.join('datasets', f)))])),
  CAREER_FIRM_GUIDE_JSON: () => readJson(dir('firm-guide.json')),
  CAREER_PATTERNS_JSON: () => readJson(dir('interview-patterns.json')),
  CAREER_SOURCE_CHECKS_JSON: () => readJson(dir('source-checks.json')),
};

test('every career data const inflates to exactly its source data', () => {
  assert.ok(inflater, 'the bundle carries the inflater');
  assert.deepEqual([...names].sort(), Object.keys(expected).sort(), 'every career data const is compressed and accounted for');
  const t0 = process.hrtime.bigint();
  const got = new Function(`${inflater}\n${data.join('\n')}\nreturn { ${names.join(', ')} };`)();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  for (const n of names) assert.deepEqual(got[n], expected[n](), `${n} differs from its source files`);
  assert.ok(ms < 1500, `inflating the career data took ${ms.toFixed(0)} ms`);
  console.log(`# career data: ${names.length} consts inflated in ${ms.toFixed(1)} ms`);
});

test('a corrupted payload fails loudly instead of yielding wrong data', () => {
  const run = new Function(`${inflater}\nreturn __careerData;`)();
  const b64 = data[0].match(/__careerData\("([^"]+)"\)/)[1];
  const bytes = Buffer.from(b64, 'base64');
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;
  assert.throws(() => run(bytes.toString('base64')));
});
