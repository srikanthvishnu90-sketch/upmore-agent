// WO-041 acceptance tests: the source checker (scripts/career/check-sources.cjs), against a fake fetch and a fixed
// clock. Nothing here touches the network. Contract in docs/architect/work-orders/WO-041-source-freshness.md.
// Run: node --test tests/career-source-check.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const C = require('../scripts/career/check-sources.cjs');
const P = require('../packages/domain/134-career-paths.js');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const GUIDE = readJson('packages/career-data/firm-guide.json');
const PATTERNS = readJson('packages/career-data/interview-patterns.json');
const day = (iso) => () => new Date(`${iso}T09:00:00Z`);

// A virtual clock: sleeping moves it forward, every request takes 40 ms of it.
function harness(routes) {
  let t = 1_000_000;
  const calls = [];
  const inflight = new Map();
  const fetchImpl = async (url, init) => {
    const host = new URL(url).hostname;
    const call = { url, host, init, start: t, end: null, overlapped: (inflight.get(host) || 0) > 0 };
    calls.push(call);
    inflight.set(host, (inflight.get(host) || 0) + 1);
    await new Promise((r) => setImmediate(r));
    t += 40;
    inflight.set(host, inflight.get(host) - 1);
    call.end = t;
    const route = routes[url] ?? { status: 200, body: '<html><title>ok</title></html>' };
    if (route.throws) throw route.throws;
    return new Response(route.status >= 300 && route.status < 400 ? null : (route.body ?? ''), { status: route.status, headers: route.location ? { location: route.location } : {} });
  };
  return { calls, fetchImpl, sleep: async (ms) => { t += ms; }, clock: () => t };
}
const guideOf = (urls) => ({ firms: [{ firm_id: 'x', programs: urls.map((u, i) => ({ name: `p${i}`, timeline: '', source_url: u })), requirements: [] }] });
const run = (h, urls, extra = {}) => C.runChecks({ guide: guideOf(urls), patterns: { firms: [] }, fetchImpl: h.fetchImpl, sleep: h.sleep, clock: h.clock, now: day('2026-10-20'), ...extra });
const byUrl = (report) => Object.fromEntries(report.urls.map((r) => [r.url, r]));

test('WO-041/C1 each answer gets its status: live, redirected, gone, blocked or error', async () => {
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const routes = {
    'https://a.test/ok': { status: 200 },
    'https://a.test/moved': { status: 301, location: '/new-home' },
    'https://a.test/new-home': { status: 200 },
    'https://a.test/slash': { status: 301, location: 'https://a.test/slash/' },
    'https://a.test/slash/': { status: 200 },
    'https://b.test/gone': { status: 404 },
    'https://b.test/gone410': { status: 410 },
    'https://b.test/moved-gone': { status: 302, location: 'https://b.test/gone' },
    'https://c.test/forbidden': { status: 403 },
    'https://c.test/slow-down': { status: 429 },
    'https://d.test/challenge': { status: 200, body: '<html><head><title>Just a moment...</title></head><body>cf-chl-bypass</body></html>' },
    'https://d.test/form': { status: 200, body: '<html><title>Apply</title><script src="https://www.google.com/recaptcha/api.js"></script></html>' },
    'https://e.test/broken': { status: 500 },
    'https://e.test/dns': { throws: Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }) },
    'https://e.test/timeout': { throws: timeout },
    'https://e.test/loop': { status: 302, location: 'https://e.test/loop' },
  };
  const h = harness(routes);
  const r = byUrl(await run(h, Object.keys(routes).filter((u) => !/new-home|slash\/$/.test(u))));
  const want = { 'https://a.test/ok': ['live', 200], 'https://a.test/moved': ['redirected', 200], 'https://a.test/slash': ['live', 200],
    'https://b.test/gone': ['gone', 404], 'https://b.test/gone410': ['gone', 410], 'https://b.test/moved-gone': ['gone', 404],
    'https://c.test/forbidden': ['blocked', 403], 'https://c.test/slow-down': ['blocked', 429], 'https://d.test/challenge': ['blocked', 200],
    'https://d.test/form': ['live', 200], 'https://e.test/broken': ['error', 500], 'https://e.test/dns': ['error', null],
    'https://e.test/timeout': ['error', null], 'https://e.test/loop': ['error', null] };
  for (const [u, [status, http]] of Object.entries(want)) assert.deepEqual([r[u].status, r[u].http_status], [status, http], u);
  assert.equal(r['https://a.test/moved'].final_url, 'https://a.test/new-home', 'the final URL after the redirect');
  assert.deepEqual(r['https://a.test/moved'].redirects, [{ from: 'https://a.test/moved', http_status: 301, to: 'https://a.test/new-home' }]);
  assert.match(r['https://e.test/timeout'].note, /timed out/);
  assert.match(r['https://e.test/dns'].note, /ENOTFOUND/);
  assert.match(r['https://e.test/loop'].note, /more than 5 redirects/);
  for (const row of Object.values(r)) assert.equal(row.fetched_at, '2026-10-20T09:00:00.000Z', 'fetched-at from the run clock');
});

test('WO-041/C2 LinkedIn and Indeed are never fetched, not even through a redirect; they are reported as skipped', async () => {
  const urls = ['https://www.linkedin.com/jobs/view/123', 'https://lnkd.in/abc', 'https://www.indeed.com/viewjob?jk=1', 'https://uk.indeed.com/jobs', 'https://www.indeed.co.uk/x', 'https://a.test/to-linkedin', 'https://a.test/fine'];
  const h = harness({ 'https://a.test/to-linkedin': { status: 302, location: 'https://www.linkedin.com/company/x' } });
  const report = await run(h, urls);
  const r = byUrl(report);
  assert.ok(!h.calls.some((c) => /linkedin|lnkd|indeed/.test(c.host)), `fetched: ${h.calls.map((c) => c.url).join(', ')}`);
  for (const u of urls.slice(0, 6)) assert.equal(r[u].status, 'skipped', u);
  assert.match(r['https://a.test/to-linkedin'].note, /never fetched/);
  assert.equal(r['https://a.test/fine'].status, 'live');
  assert.equal(report.summary.skipped, 6);
  for (const host of ['linkedin.com', 'www.linkedin.com', 'lnkd.in', 'indeed.com', 'de.indeed.com', 'www.indeed.co.uk', 'www.indeed.com.au']) assert.ok(C.neverFetch(host), host);
  for (const host of ['jobs.lever.co', 'www.goldmansachs.com', 'notlinkedin.com.example']) assert.ok(!C.neverFetch(host), host);
});

test('WO-041/C3 polite: one request per host at a time, 1 s apart, an honest User-Agent, GET, no cookies, redirects by hand', async () => {
  const urls = [];
  for (let i = 0; i < 6; i++) urls.push(`https://same.test/p${i}`);
  for (let i = 0; i < 3; i++) urls.push(`https://other${i}.test/x`);
  urls.push('https://same.test/redirect');
  const h = harness({ 'https://same.test/redirect': { status: 301, location: 'https://same.test/p0' } });
  await run(h, urls, { hostsAtOnce: 4 });
  const byHost = {};
  for (const c of h.calls) (byHost[c.host] ||= []).push(c);
  assert.equal(byHost['same.test'].length, 9, 'robots.txt, six pages, the redirect and its hop');
  assert.equal(byHost['same.test'][0].url, 'https://same.test/robots.txt', 'robots.txt first');
  for (const [host, list] of Object.entries(byHost)) {
    assert.ok(list.every((c) => !c.overlapped), `${host}: two requests at once`);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].start - list[i - 1].end >= 1000, `${host}: only ${list[i].start - list[i - 1].end} ms between requests`);
  }
  assert.match(C.USER_AGENT, /^UpmoreTrainee-source-check\/1\.0 \(\+https:\/\/github\.com\/[\w.-]+\/[\w.-]+\)$/);
  for (const c of h.calls) {
    assert.equal(c.init.method, 'GET');
    assert.equal(c.init.redirect, 'manual', 'each hop is checked against the never-fetch list');
    assert.equal(c.init.headers['user-agent'], C.USER_AGENT);
    assert.ok(!Object.keys(c.init.headers).some((k) => /cookie|authorization/i.test(k)), 'no cookie, no login');
    assert.ok(c.init.signal, 'a timeout');
  }
  // Different hosts do run side by side (the check is not one long queue).
  const firstOther = h.calls.find((c) => c.host === 'other0.test');
  assert.ok(firstOther.start < byHost['same.test'][byHost['same.test'].length - 1].start, 'hosts in parallel');
});

test('WO-041/C3b the gate is per site: two hosts of one registrable domain share it; at most 8 sites at once', async () => {
  const urls = ['https://jobs.site.test/a', 'https://www.site.test/b', 'https://careers.site.test/c', 'https://www.site.co.uk/a', 'https://jobs.site.co.uk/b'];
  for (let i = 0; i < 20; i++) urls.push(`https://w${i}.test/x`);
  const h = harness({});
  let open = 0, most = 0;
  const wrapped = async (url, init) => { open++; most = Math.max(most, open); try { return await h.fetchImpl(url, init); } finally { open--; } };
  await run({ ...h, fetchImpl: wrapped }, urls, { hostsAtOnce: 100 });
  assert.ok(most <= 8, `${most} requests at once`);
  for (const site of ['site.test', 'site.co.uk']) {
    const list = h.calls.filter((c) => C.siteOf(c.host) === site);
    assert.ok(list.length >= 3, site);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].start - list[i - 1].end >= 1000, `${site}: ${list[i - 1].url} then ${list[i].url} only ${list[i].start - list[i - 1].end} ms apart`);
  }
  assert.deepEqual(['jobs.lever.co', 'www.goldmansachs.com', 'careers.microsoft.com', 'www.efinancialcareers.co.uk', 'globalgrad.uq.edu.au'].map(C.siteOf), ['lever.co', 'goldmansachs.com', 'microsoft.com', 'efinancialcareers.co.uk', 'uq.edu.au']);
});

test('WO-041/C9 never LinkedIn or Indeed, however the host is written, reached through a redirect', async () => {
  const targets = ['https://www.linkedin.com./company/acme', 'https://www.linkedin.com%2e/jobs', 'https://WWW.LinkedIn.COM/in/x', 'https://media.licdn.com/dms/image/x', 'https://linkedin.cn/company/acme',
    'https://www.linkedin.co.uk/x', 'https://lnkd.in/abc', 'https://indeed.jobs/', 'https://www.indeedjobs.com/', 'https://secure.indeed.com/', 'https://indeed.com.au/', 'https://de.indeed.com./x'];
  for (const target of targets) {
    const h = harness({ 'https://careers.acme.test/jobs': { status: 301, location: target } });
    const r = byUrl(await run(h, ['https://careers.acme.test/jobs']))['https://careers.acme.test/jobs'];
    assert.equal(r.status, 'skipped', target);
    assert.match(r.note, /never fetched/, target);
    assert.deepEqual(h.calls.map((c) => c.url), ['https://careers.acme.test/robots.txt', 'https://careers.acme.test/jobs'], `${target}: fetched ${h.calls.map((c) => c.url).join(', ')}`);
  }
  for (const host of ['www.glassdoor.com', 'hiringlab.test', 'linkedinlearning.example.org', 'xn--linkedn-yxa.com']) assert.ok(!C.neverFetch(host), host);
});

test('WO-041/C10 robots.txt is honored: a disallowed page is skipped, never fetched; an unreadable robots.txt fetches nothing', async () => {
  const routes = {
    'https://r.test/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: OtherBot\nDisallow: /\n' },
    'https://s.test/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /\n\nUser-agent: UpmoreTrainee-source-check\nDisallow: /careers/*.pdf$\n' },
    'https://down.test/robots.txt': { status: 503 },
    'https://none.test/robots.txt': { status: 404 },
  };
  const h = harness(routes);
  const urls = ['https://r.test/private/x', 'https://r.test/private/open/y', 'https://r.test/public', 'https://s.test/careers/guide.pdf', 'https://s.test/careers/page', 'https://down.test/a', 'https://none.test/a'];
  const r = byUrl(await run(h, urls));
  assert.deepEqual(urls.map((u) => r[u].status), ['skipped', 'live', 'live', 'skipped', 'live', 'skipped', 'live']);
  assert.match(r['https://r.test/private/x'].note, /robots\.txt disallows \/private\/x/);
  assert.match(r['https://down.test/a'].note, /robots\.txt could not be read \(HTTP 503\)/);
  const fetched = h.calls.map((c) => c.url);
  for (const u of ['https://r.test/private/x', 'https://s.test/careers/guide.pdf', 'https://down.test/a']) assert.ok(!fetched.includes(u), `${u} was fetched`);
  assert.equal(fetched.filter((u) => u === 'https://r.test/robots.txt').length, 1, 'robots.txt read once per origin');
});

test('WO-041/C4 firm-guide dates against a fixed clock: past on the run date, never on the day itself', async () => {
  const quiet = harness({});
  const at = async (iso) => C.runChecks({ guide: GUIDE, patterns: { firms: [] }, fetchImpl: quiet.fetchImpl, sleep: quiet.sleep, clock: quiet.clock, now: day(iso) });
  const find = (r, firm, date) => r.firm_dates.find((d) => d.firm_id === firm && d.date === date);
  const oct20 = await at('2026-10-20');
  assert.deepEqual(find(oct20, 'evercore', '2026-10-11'), { firm_id: 'evercore', where: 'program: Summer intern programs (Europe/Asia, 2027)', source_url: find(oct20, 'evercore', '2026-10-11').source_url, said: '11 October 2026', date: '2026-10-11', kind: 'deadline', past: true });
  assert.equal(find(oct20, 'mckinsey', '2026-08-11').kind, 'deadline');
  assert.equal(find(oct20, 'mckinsey', '2026-07-01').kind, 'opens');
  assert.equal(find(oct20, 'bain', '2026-08-31').kind, 'deadline');
  assert.equal(find(oct20, 'mckinsey', '2026-03-29').kind, 'deadline', '"a March 29, 2026 deadline"');
  assert.ok(oct20.dates_past >= 7, `the seven dates the guide states, all past on 2026-10-20 (got ${oct20.dates_past})`);
  assert.equal(oct20.dates_past, oct20.firm_dates.filter((d) => d.past).length);
  const oct11 = await at('2026-10-11');
  assert.equal(find(oct11, 'evercore', '2026-10-11').past, false, 'the deadline day itself is not past');
  // A day is past once it is over everywhere (UTC-12): not at 09:00Z the next day, yes at 12:00Z.
  const oct12early = await at('2026-10-12');
  assert.equal(find(oct12early, 'evercore', '2026-10-11').past, false, 'still October 11 somewhere');
  const oct12 = await C.runChecks({ guide: GUIDE, patterns: { firms: [] }, fetchImpl: quiet.fetchImpl, sleep: quiet.sleep, clock: quiet.clock, now: () => new Date('2026-10-12T12:00:00Z') });
  assert.equal(find(oct12, 'evercore', '2026-10-11').past, true);
  // The reader: full dates only, real calendar days only.
  assert.deepEqual(P.statedDates('graduating December 2026 or Spring 2027'), []);
  assert.deepEqual(P.statedDates('February 30, 2026'), []);
  assert.deepEqual(P.statedDates('applications opened July 1, 2026 and the deadline was August 11, 2026 (closed)').map((d) => [d.date, d.kind]), [['2026-07-01', 'opens'], ['2026-08-11', 'deadline']]);
  assert.deepEqual(P.pastDates('due 5 Nov 2026', Date.UTC(2026, 10, 6, 11, 59)).length, 0);
  assert.deepEqual(P.pastDates('due 5 Nov 2026', Date.UTC(2026, 10, 6, 12)).map((d) => d.date), ['2026-11-05']);
  // The forms a timeline can take: unspaced dashes, ranges with a year on each side, ISO, US numeric, month-only
  // deadlines, "of", abbreviations; a date said without a year is undated, never given a year.
  const read = (t) => P.statedDates(t).map((d) => [d.date, d.kind]);
  assert.deepEqual(read('Applications open Sept. 1–Oct. 11, 2026.'), [['2026-09-01', 'opens'], ['2026-10-11', 'deadline']]);
  assert.deepEqual(read('Applications open Sept 1 - Oct 11, 2026.'), [['2026-09-01', 'opens'], ['2026-10-11', 'deadline']]);
  assert.deepEqual(read('October 1–11, 2026'), [['2026-10-01', 'opens'], ['2026-10-11', 'deadline']]);
  assert.deepEqual(read('accepted from August 31, 2025 to October 11, 2025'), [['2025-08-31', 'opens'], ['2025-10-11', 'deadline']]);
  assert.deepEqual(read('Apply by 10/11/2026.'), [['2026-10-11', 'deadline']]);
  assert.deepEqual(read('Deadline: 2026-10-11.'), [['2026-10-11', 'deadline']]);
  assert.deepEqual(read('Deadline: September 2026.'), [['2026-09-30', 'deadline']]);
  assert.deepEqual(read('Applications close 11th of October 2026.'), [['2026-10-11', 'deadline']]);
  assert.deepEqual(read('Deadline 11 Oct. 2026'), [['2026-10-11', 'deadline']]);
  assert.deepEqual(read('the deadline (for students graduating December 2027 to June 2028) was August 31, 2026'), [['2026-08-31', 'deadline']], 'graduation windows are not dates');
  assert.deepEqual(read('Applications for Fall 2026 close October 1.'), []);
  assert.deepEqual(P.undatedDates('Applications for Fall 2026 close October 1.'), [{ said: 'October 1', kind: 'deadline' }]);
  const ET = 'The deadline is October 20, 2026 at 11:59 PM ET.';
  assert.deepEqual(P.pastDates(ET, Date.parse('2026-10-21T00:30:00Z')), [], 'hours are left in ET');
  assert.equal(P.pastDates(ET, Date.parse('2026-10-21T12:00:00Z')).length, 1);
  // Closed: every dated date past, one not just an opening, nothing undated.
  const now = Date.parse('2026-10-20T15:00:00Z');
  assert.equal(P.programDates('opened July 1, 2022', now).closed, false, 'an old opening date closes nothing');
  assert.equal(P.programDates('Applications close on 1 May 2026, and the programme starts 7 September 2026.', now).closed, true);
  assert.equal(P.programDates('The internship starts June 1, 2026; applications are due January 15, 2027.', now).closed, false);
  assert.equal(P.programDates('closed August 1, 2026; the next round closes March 1.', now).closed, false, 'an undated date could be later');
});

test('WO-041/C5 every URL in both data files is checked, each with where it is used', () => {
  const urls = C.collectUrls(GUIDE, PATTERNS);
  const scan = (f) => new Set((fs.readFileSync(path.join(root, f), 'utf8').match(/"source_url":\s*"(https?:[^"]+)"/g) || []).map((m) => m.replace(/^"source_url":\s*"|"$/g, '')));
  const all = new Set([...scan(C.FILES.guide), ...scan(C.FILES.patterns)]);
  assert.deepEqual(new Set(urls.map((u) => u.url)), all);
  assert.ok(urls.every((u) => u.used_by.length >= 1 && u.used_by.every((x) => x.file && x.where)));
  const patternUses = urls.flatMap((u) => u.used_by).filter((x) => x.file === C.FILES.patterns);
  assert.equal(patternUses.length, 26, 'the 26 pattern sources read only through search excerpts');
});

test('WO-041/C6 the checks file: a person writes it from a report; the chat reads gone, live and unverified from it', async () => {
  const h = harness({ 'https://g.test/gone': { status: 404 }, 'https://g.test/blocked': { status: 403 } });
  const report = await run(h, ['https://g.test/live', 'https://g.test/gone', 'https://g.test/blocked']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wo041-'));
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report));
  const out = path.join(dir, 'checks.json');
  execFileSync(process.execPath, [path.join(root, 'scripts/career/check-sources.cjs'), '--from-report', path.join(dir, 'report.json'), '--write-checks', out]);
  const checks = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(checks.ran, true);
  assert.equal(checks.run_at, '2026-10-20T09:00:00.000Z');
  assert.deepEqual(Object.keys(checks.urls).sort(), ['https://g.test/blocked', 'https://g.test/gone', 'https://g.test/live']);
  assert.deepEqual(Object.keys(checks.urls['https://g.test/gone']).sort(), ['fetched_at', 'final_url', 'http_status', 'status']);
  assert.deepEqual(P.sourceStatus('https://g.test/gone', checks), { status: 'gone', verified: false, checked: '2026-10-20', http_status: 404, final_url: 'https://g.test/gone' });
  assert.equal(P.sourceStatus('https://g.test/live', checks).verified, true);
  assert.equal(P.sourceStatus('https://g.test/blocked', checks).verified, false);
  assert.equal(P.sourceStatus('https://g.test/never-checked', checks).status, 'unverified');
  assert.equal(P.sourceStatus('https://g.test/live', { ...checks, ran: false }).status, 'unverified', 'a check that never ran verifies nothing');
  // The summary a person reads names every non-live URL and every past date.
  const text = C.summaryText(report);
  assert.match(text, /gone \(404\): https:\/\/g\.test\/gone/);
  assert.match(text, /blocked \(403\): https:\/\/g\.test\/blocked/);
  assert.match(text, /Nothing was edited/);
});

test('WO-041/C7 the workflow: weekly, by hand and on pull requests touching the checker or the data; it reports and never edits', () => {
  const wf = fs.readFileSync(path.join(root, '.github/workflows/source-freshness.yml'), 'utf8');
  assert.match(wf, /schedule:\s*\n\s*- cron: "\d+ \d+ \* \* [0-6]"/, 'weekly');
  assert.match(wf, /workflow_dispatch:/);
  for (const p of ['scripts/career/check-sources.cjs', 'packages/career-data/firm-guide.json', 'packages/career-data/interview-patterns.json']) assert.ok(wf.includes(`      - ${p}`), `pull_request path ${p}`);
  assert.match(wf, /permissions:\s*\n\s*contents: read/, 'read-only: it cannot push');
  assert.ok(!/git (commit|push|add)|--write-checks|contents: write/.test(wf), 'no data edit');
  assert.match(wf, /node scripts\/career\/check-sources\.cjs/);
  assert.match(wf, /actions\/upload-artifact@[0-9a-f]{40}[\s\S]*source-check-report\.json/);
  const uses = wf.match(/uses: \S+/g) || [];
  assert.ok(uses.length >= 3 && uses.every((u) => /@[0-9a-f]{40}$/.test(u)), `every action pinned by commit SHA: ${uses.join(', ')}`);
  assert.match(wf, /GITHUB_STEP_SUMMARY/);
  const src = fs.readFileSync(path.join(root, 'scripts/career/check-sources.cjs'), 'utf8');
  assert.ok(!/require\((?!"node:)/.test(src.replace(/require\(path\.join\(ROOT, "packages\/domain\/134-career-paths\.js"\)\)/, '')), 'no dependency beyond Node and 134');
  assert.ok(!/HTTPS?_PROXY|dispatcher|ProxyAgent|puppeteer|playwright|2captcha|anti-?captcha|capsolver|solveCaptcha/i.test(src), 'no proxy, browser or captcha solving');
});

test('WO-041/C8 the committed source-checks.json names only URLs from the two files, or says it never ran', () => {
  const checks = readJson('packages/career-data/source-checks.json');
  assert.equal(checks.dataset_id, 'source-checks');
  const all = new Set(C.collectUrls(GUIDE, PATTERNS).map((u) => u.url));
  if (!checks.ran) {
    assert.deepEqual(checks.urls, {}, 'a check that never ran lists no result');
    assert.match(checks.not_run_reason, /^NOT_RUN: /);
  } else {
    for (const [u, r] of Object.entries(checks.urls)) {
      assert.ok(all.has(u), `${u} is not in the data files`);
      assert.ok(['live', 'redirected', 'gone', 'blocked', 'error', 'skipped'].includes(r.status), `${u}: ${r.status}`);
    }
  }
});
