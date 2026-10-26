// FEATURE 15 (2026-10-25): the Trainee dashboard in a real sandboxed Chromium at phone width, on an intercepted
// synthetic HTTPS origin. Every surface renders from fixture rows read through the module's own load(); the approve
// flow taps the real TraineeApprovalCards controller, which calls the hash-bound RPC the chat card uses. No service or
// employer is contacted. Check: node --test tests/career-dashboard-browser.test.cjs
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { webcrypto } = require('node:crypto');
const Cards = require('../src/career-approval-card.js');
const { chromium } = require(process.env.UPMORE_PLAYWRIGHT_PATH || 'playwright');
const read = f => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const CARD_JS = read('src/career-approval-card.js'), DASH_JS = read('src/career-dashboard.js'), DASH_CSS = read('src/career-dashboard.css');
const OWNER = '11111111-1111-4111-8111-111111111111', THREAD = '33333333-3333-4333-8333-333333333333';
const CARD1 = '44444444-4444-4444-8444-444444444444', CARD2 = '55555555-5555-4555-8555-555555555555';
const DAY = 86400000, NOW = Date.parse('2026-10-25T16:00:00.000Z'), SHA = 'a'.repeat(64), RESUME_FACT = 'approved-local-resume:' + SHA;
const ORIGIN = 'https://dashboard.trainee.test/';
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}), timeout: 60000 });
});
after(async () => { if (browser) await browser.close(); });

async function v1Card() {
  const jobId = 'greenhouse:inventedco:101';
  const entry = { version: 1, kind: 'agent-batch', jobId, company: 'Invented Analytics Co', url: 'https://example.test/jobs/101',
    answers: [{ name: 'why', label: 'Why this role?', value: 'I build SQL dashboards.', shown: 'I build SQL dashboards.', kind: 'text', factId: 'F-001', file: null },
      { name: 'resume', label: 'Resume/CV', value: 'resume.pdf', shown: 'Synthetic Resume.pdf', kind: 'file', factId: RESUME_FACT, file: SHA }],
    blank: ['Portfolio URL'],
    ledger: [{ application_id: jobId, field_id: 'why', question_hash: SHA, answer_hash: SHA, fact_refs: ['F-001'], source_refs: ['own statement'], confirmation_event_id: 'ev-1', derivation_rule: 'verbatim' },
      { application_id: jobId, field_id: 'resume', question_hash: SHA, answer_hash: SHA, fact_refs: [RESUME_FACT], source_refs: ['own upload'], confirmation_event_id: 'ev-2', derivation_rule: 'attachment' }],
    question_set_hash: SHA, manifest_hash: SHA, quarantine_version: 'd007-v1' };
  const payload = { version: 1, kind: 'career-message-approval', card_id: CARD1, user_id: OWNER, thread_id: THREAD, issued_at: NOW - 60000, expires_at: NOW - 60000 + DAY,
    items: [{ entry, hash: await Cards.hash(entry, webcrypto) }] };
  return { id: CARD1, payload, hash: await Cards.hash(payload, webcrypto) };
}
async function v2Card() {
  const expires = new Date(NOW + 6 * 3600000).toISOString();
  const fields = [
    { name: 'email', label: 'Email', value: 'jane@example.test', factId: 'F-010', confirmation_event_id: 'ev-10' },
    { name: 'phone', label: 'Phone', value: '555-0100', factId: 'F-011' },
  ];
  const p = { version: 1, user_id: OWNER, job_id: 'lever:cloudco:7', company: 'Cloud Invented Inc', url: 'https://example.test/jobs/7', fields,
    destination: 'https://example.test/apply/7', resume_sha256: SHA, page_field_names: [], engine_approval: SHA, privacy_epoch: 0, account_version: 0, expires_at: expires };
  const readback = { answers: fields.map(f => ({ name: f.name, label: f.label, value: f.value, shown: f.value, factId: f.factId })),
    resume_name: 'Synthetic Resume.pdf', resume_sha256: SHA, destination: p.destination, blank: [], employer_fields: [] };
  const payload = { version: 2, execution_mode: 'cloud', kind: 'career-message-approval', card_id: CARD2, user_id: OWNER, thread_id: THREAD, issued_at: NOW - 120000, expires_at: NOW - 120000 + DAY,
    items: [{ payload: p, hash: await Cards.hash(p, webcrypto), readback }] };
  return { id: CARD2, payload, hash: await Cards.hash(payload, webcrypto) };
}
const cardRow = (c, shownAgo) => ({ id: c.id, thread_id: THREAD, payload: c.payload, payload_hash: c.hash,
  shown_at: new Date(NOW - shownAgo).toISOString(), expires_at: new Date(NOW - shownAgo + DAY).toISOString(), approved_at: null, approval_expires_at: null });

async function fixture(t, { prefs = { on: true, keywords: ['data analyst'], locations: ['Chicago'], remote_ok: true } } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  t.after(() => context.close());
  const unexpected = [];
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url === ORIGIN) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#1E1F24}' + DASH_CSS + '</style></head><body><main id="careerDash"><div id="careerDashboard"></div></main></body></html>' });
    if (url === ORIGIN + 'fonts/libre-baskerville-regular.woff2') return route.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(path.resolve(__dirname, '../fonts/libre-baskerville-regular.woff2')) });
    if (url === ORIGIN + 'img/brands/greenhouse.svg') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: read('img/brands/greenhouse.svg') });
    unexpected.push(url); return route.abort();
  });
  await page.goto(ORIGIN);
  await page.addScriptTag({ content: CARD_JS });
  await page.addScriptTag({ content: DASH_JS });
  const c1 = await v1Card(), c2 = await v2Card();
  const tables = {
    career_outbox: [
      { key: 'alert:greenhouse:inventedco:101', created_at: '2026-10-25T10:00:00Z' },
      { key: 'alert:lever:otherco:5', created_at: '2026-10-25T12:00:00Z' },
      { key: 'alert:ashby:goneco:3', created_at: '2026-10-25T11:00:00Z' },
    ],
    career_alert_prefs: prefs ? [{ prefs }] : [],
    career_apply_message_cards: [cardRow(c1, 60000), cardRow(c2, 120000)],
    career_apply_prepared: [{ id: 'prep-1', job_id: 'smartrecruiters:x:9', company: 'Reviewed Only LLC', card_lines: ['Applies as Data Analyst', '9 answers from your confirmed facts'], state: 'shown', updated_at: '2026-10-25T09:00:00Z' }],
    career_apply_jobs: [
      { id: 'job-r1', job_id: 'greenhouse:doneco:1', company: 'Done Co', url: 'https://example.test/done', state: 'confirmed', email_confirmed_at: '2026-10-24T15:00:00Z', confirmation_id: 'CONF-778', payload_hash: 'e'.repeat(64), updated_at: '2026-10-24T15:00:00Z' },
      { id: 'job-r2', job_id: 'lever:waitco:2', company: 'Wait Co', url: 'https://example.test/wait', state: 'submitted_unconfirmed', payload_hash: 'f'.repeat(64), updated_at: '2026-10-24T12:00:00Z' },
      { id: 'job-r3', job_id: 'ashby:failco:3', company: 'Fail Co', url: 'https://example.test/fail', state: 'failed', reason: 'The form asked for a portfolio link that is not on your record.', payload_hash: 'd'.repeat(64), updated_at: '2026-10-23T12:00:00Z' },
    ],
    career_postings: [
      { job_id: 'greenhouse:inventedco:101', company: 'Invented Analytics Co', title: 'Data Analyst', location: 'Chicago, IL', url: 'https://example.test/jobs/101', remote: null, closed_at: null },
      { job_id: 'lever:otherco:5', company: 'Other Co', title: 'Marketing Associate', location: 'Austin, TX', url: 'https://example.test/jobs/5', remote: null, closed_at: null },
      { job_id: 'lever:cloudco:7', company: 'Cloud Invented Inc', title: 'Junior Data Analyst', location: 'Remote', url: 'https://example.test/jobs/7', remote: 'remote', closed_at: null },
    ],
  };
  await page.evaluate(async ({ tables, owner, now, day, brands }) => {
    window.reads = []; window.rpcs = []; window.drafts = []; window.sent = []; window.names = []; window.trusted = [];
    window.stored = Object.fromEntries(tables.career_apply_message_cards.map(c => [c.id, { id: c.id, payload: structuredClone(c.payload), hash: c.payload_hash, state: 'open' }]));
    const client = { from(table) {
      const q = { table, ops: [] }; window.reads.push(q);
      const chain = new Proxy({}, { get(_, op) {
        if (op === 'then') return (res, rej) => Promise.resolve({ data: structuredClone(tables[table] || []), error: null }).then(res, rej);
        return (...args) => { q.ops.push([op, ...args]); return chain; };
      } });
      return chain;
    } };
    const rpc = async (name, args) => {
      window.rpcs.push([name, args === undefined ? null : args]);
      if (name === 'career_apply_message_cloud_enabled_own') return { data: true, error: null };
      if (name === 'career_apply_message_card_read_own') return { data: structuredClone(window.stored[args.p_card]), error: null };
      if (name === 'career_apply_message_card_approve_own') {
        const c = window.stored[args.p_card];
        if (!c || c.hash !== args.p_hash || c.state !== 'open') return { data: null, error: Error('invalid or stale message approval card') };
        c.state = 'approved';
        return { data: { card_id: c.id, card_hash: c.hash, approved_count: c.payload.items.length, approved_at: new Date(now + 10).toISOString(), approval_expires_at: new Date(now + 10 + day).toISOString() }, error: null };
      }
      return { data: null, error: Error('unknown rpc') };
    };
    const data = await TraineeDashboard.load(client, owner);
    window.view = TraineeDashboard.mount(document.querySelector('#careerDashboard'), data, {
      now: () => now + 10, brandIcons: brands,
      draft: (text, thread) => window.drafts.push([text, thread]),
      send: async (text, thread) => { window.sent.push([text, thread]); return { thread_id: '99999999-9999-4999-8999-999999999999', reply: text.startsWith('Here') ? 'Your resume is on record — as drafts, awaiting your word.' : text === 'yes' ? 'Confirmed — your resume facts are on your record.' : 'Watch set: Data Analyst.' }; },
      saveName: async name => { window.names.push(name); },
      mountCard: TraineeDashboard.cardMounter({ testUserId: owner, identity: () => owner, authenticate: async () => owner, rpc, now: () => now + 10, crypto }),
    });
    await window.view.ready;
    for (const b of document.querySelectorAll('.career-approval-card button')) b.addEventListener('click', e => window.trusted.push(e.isTrusted));
  }, { tables, owner: OWNER, now: NOW, day: DAY, brands: [{ slug: 'greenhouse', name: 'Greenhouse', match: ['greenhouse'], file: 'img/brands/greenhouse.svg' }] });
  t.after(() => assert.deepEqual(unexpected, [], 'the page must not attempt a real service request'));
  return { page, c1, c2 };
}
const noSideScroll = page => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth);

test('reads only the person\'s rows, opens on the queue, and fits a phone screen', async t => {
  const { page } = await fixture(t);
  const reads = await page.evaluate(() => window.reads.map(r => [r.table, r.ops.filter(o => o[0] === 'eq').map(o => o[1] + '=' + o[2]).join('&')]));
  assert.deepEqual(reads.slice(0, 5).map(r => r[0]), ['career_outbox', 'career_alert_prefs', 'career_apply_message_cards', 'career_apply_prepared', 'career_apply_jobs']);
  for (const [table, eq] of reads.slice(0, 5)) assert.match(eq, new RegExp('user_id=' + OWNER), table);
  assert.equal(await page.getByRole('tab', { name: /Queue/ }).getAttribute('aria-selected'), 'true');
  assert.match(await page.locator('[data-tr-summary]').innerText(), /2 matches · 2 awaiting approval · Confirmed 1\/3/);
  assert.equal(await noSideScroll(page), true, 'no horizontal scroll at 390px');
  for (const tab of ['Matches', 'Tracker']) { await page.getByRole('tab', { name: tab }).click(); assert.equal(await noSideScroll(page), true, tab + ' fits at 390px'); }
});

test('matches: fit verdicts with their reasons, the missing posting named, coverage as fractions', async t => {
  const { page } = await fixture(t);
  await page.getByRole('tab', { name: 'Matches' }).click();
  const m = page.locator('[data-tr-surface=matches]');
  assert.equal(await m.locator('[data-tr-coverage]').innerText(), 'Postings on file 2/3 · Fit checked 2/2');
  const fit = m.locator('[data-tr-match="greenhouse:inventedco:101"]');
  assert.equal(await fit.locator('[data-tr-fit]').getAttribute('data-tr-fit'), 'fits');
  assert.match(await fit.innerText(), /Title names “data analyst”, one of your target roles/);
  assert.match(await fit.innerText(), /Location Chicago, IL is in your list \(Chicago\)/);
  assert.match(await fit.innerText(), /via Greenhouse/);
  assert.equal(await fit.locator('img.tr-via-logo').getAttribute('src'), 'img/brands/greenhouse.svg');
  assert.equal(await m.locator('[data-tr-match="lever:otherco:5"] [data-tr-fit]').getAttribute('data-tr-fit'), 'weak');
  assert.equal(await m.locator('[data-tr-missing="ashby:goneco:3"]').innerText(), 'ashby:goneco:3: The posting is no longer on file');
  assert.match(await page.locator('.tr-works').innerText(), /Works with job boards on/);
});

test('approval card: job, company, match reasoning, every answer, and an unverified answer loud', async t => {
  const { page } = await fixture(t);
  const q = page.locator('[data-tr-surface=queue]');
  const first = q.locator('[data-tr-card="' + CARD1 + '"]');
  assert.match(await first.innerText(), /Data Analyst at Invented Analytics Co/);
  assert.match(await first.locator('[data-tr-why]').innerText(), /Why it matched: Fits your targets/);
  assert.equal(await first.locator('[data-tr-verified]').getAttribute('data-tr-verified'), '2/2');
  assert.equal(await first.locator('[data-tr-blank]').innerText(), 'Left blank: Portfolio URL');
  for (const text of ['Why this role? [why]', 'I build SQL dashboards.', 'Synthetic Resume.pdf', SHA]) assert.ok((await first.locator('.tr-card-slot').innerText()).includes(text), text);
  const second = q.locator('[data-tr-card="' + CARD2 + '"]');
  const loud = second.locator('[role=alert][data-tr-unverified]');
  assert.equal(await loud.getAttribute('data-tr-unverified'), 'phone');
  assert.match(await loud.innerText(), /Check before approving: 1 answer has no confirmed fact behind it\s+Phone \[phone\]/);
  assert.equal(await loud.evaluate(n => getComputedStyle(n).borderTopWidth), '2px');
  assert.equal(await second.locator('[data-tr-verified]').getAttribute('data-tr-verified'), '1/2');
  assert.ok((await second.locator('.tr-card-slot').innerText()).includes('555-0100'), 'the unverified answer itself is on the card');
  assert.match(await q.locator('[data-tr-queue=reviewed]').innerText(), /Reviewed Only LLC[\s\S]*9 answers from your confirmed facts/);
  // Edit, leave one off and decline open the chat with a draft on the card's own thread; nothing is approved.
  await first.locator('[data-tr-action=edit]').click();
  await first.locator('[data-tr-action=reject-one]').click();
  await first.locator('[data-tr-action=reject-all]').click();
  assert.deepEqual(await page.evaluate(() => window.drafts.map(d => d[1])), [THREAD, THREAD, THREAD]);
  assert.match((await page.evaluate(() => window.drafts))[1][0], /^Leave Invented Analytics Co \(greenhouse:inventedco:101\) off this batch/);
  assert.equal((await page.evaluate(() => window.rpcs)).filter(r => r[0].endsWith('approve_own')).length, 0);
  assert.equal(await noSideScroll(page), true);
});

test('approve: a trusted tap calls the hash-bound approval RPC with this card and its exact hash, once', async t => {
  const { page, c1 } = await fixture(t);
  const card = page.locator('[data-tr-card="' + CARD1 + '"] .tr-card-slot');
  const button = card.getByRole('button', { name: /Approve these exact answers for 1 application/ });
  await button.click();
  await page.waitForFunction(() => /Nothing has been submitted to an employer/.test(document.querySelector('[data-tr-card-slot] [role=status]').textContent));
  const rpcs = await page.evaluate(() => window.rpcs);
  const approvals = rpcs.filter(r => r[0] === 'career_apply_message_card_approve_own');
  assert.deepEqual(approvals, [['career_apply_message_card_approve_own', { p_card: CARD1, p_hash: c1.hash }]]);
  // The controller re-read the card through the same read RPC before approving.
  assert.ok(rpcs.some(r => r[0] === 'career_apply_message_card_read_own' && r[1].p_card === CARD1));
  assert.deepEqual(await page.evaluate(() => window.trusted), [true]);
  assert.equal(await button.isDisabled(), true, 'a used card cannot approve again');
});

test('tracker: each application\'s recorded state, the failure reason, and the receipt inline', async t => {
  const { page } = await fixture(t);
  await page.getByRole('tab', { name: 'Tracker' }).click();
  const tr = page.locator('[data-tr-surface=tracker]');
  assert.equal(await tr.locator('[data-tr-coverage]').innerText(), 'Confirmed by the employer 1/3');
  assert.deepEqual(await tr.locator('[data-tr-state]').evaluateAll(n => n.map(x => x.getAttribute('data-tr-state'))), ['confirmed', 'submitted_unconfirmed', 'failed']);
  const receipt = tr.locator('[data-tr-receipt="job-r1"]');
  assert.match(await receipt.innerText(), /Confirmed by Done Co at 2026-10-24T15:00:00Z[\s\S]*Confirmation number: CONF-778[\s\S]*eeee/);
  assert.equal(await tr.locator('[data-tr-receipt]').count(), 1, 'no receipt without the employer email');
  assert.match(await tr.locator('[data-tr-application="job-r3"]').innerText(), /portfolio link that is not on your record/);
});

test('setup: name, resume and target roles in one pass, each reply shown verbatim', async t => {
  const { page } = await fixture(t, { prefs: null });
  const setup = page.locator('[data-tr-surface=setup]');
  assert.equal(await setup.isVisible(), true);
  const started = Date.now();
  await setup.getByLabel('Full name').fill('Jane Rivera');
  await setup.locator('[data-tr-action=save-name]').click();
  await setup.getByText('Saved on your profile: Jane Rivera').waitFor();
  await setup.getByLabel('Paste your resume text').fill('Jane Rivera\nEDUCATION\nDePaul University, B.S. Finance, expected May 2028\nSKILLS\nSQL, Tableau');
  await setup.locator('[data-tr-action=send-resume]').click();
  await setup.getByText('Your resume is on record — as drafts, awaiting your word.').waitFor();
  await setup.locator('[data-tr-action=confirm-resume]').click();
  await setup.getByText('Confirmed — your resume facts are on your record.').waitFor();
  await setup.getByLabel('Target roles, separated by commas').fill('Data analyst, financial analyst');
  await setup.getByLabel('City (optional)').fill('Chicago');
  await setup.locator('[data-tr-action=send-roles]').click();
  await setup.getByText('Watch set: Data Analyst.').waitFor();
  assert.ok(Date.now() - started < 120000);
  assert.deepEqual(await page.evaluate(() => window.names), ['Jane Rivera']);
  const sent = await page.evaluate(() => window.sent);
  assert.deepEqual(sent.map(s => s[0].split('\n')[0]), ['Here’s my resume:', 'yes', 'Watch for Data analyst, financial analyst roles in Chicago']);
  assert.deepEqual(sent.map(s => s[1]), [null, '99999999-9999-4999-8999-999999999999', '99999999-9999-4999-8999-999999999999'], 'one thread for the whole setup');
  assert.equal(await noSideScroll(page), true);
});
