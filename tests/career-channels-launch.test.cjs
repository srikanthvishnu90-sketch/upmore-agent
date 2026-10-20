// WO-038 launch wiring: go-live takes Telegram and WhatsApp as optional inputs (a channel left out stays NOT_WIRED, and
// no value is ever printed), deploys their two webhooks without JWT, applies the channel migration last; the smoke checks
// each webhook's door only when its secrets are given; the WhatsApp template the owner submits is the one the code sends.
// Nothing here reaches a network. Check: node --test tests/career-channels-launch.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const SCRIPT = path.join(root, 'scripts/launch/trainee-go-live.sh');
const smoke = require(path.join(root, 'scripts/launch/trainee-smoke.cjs'));

// Distinctive fakes; none may be printed (all labelled fake for tests/no-secrets.test.cjs).
const BASE_ENV = {
  SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_DB_URL: 'postgresql://postgres:fake-dbpass-CH38x@db.example.test:5432/postgres',
  CAREER_INGEST_SECRET: 'fake-ingest-secret-0038-IIIIIIIIIIIIIIIIIIII', CAREER_PROACTIVE_SECRET: 'fake-proactive-secret-0038-PPPPPPPPPPPPPPPP',
  TRAINEE_DELIVER_SECRET: 'fake-deliver-secret-0038-DDDDDDDDDDDDDDDDDD', TRAINEE_INBOUND_SECRET: 'fake-inbound-secret-0038-NNNNNNNNNNNNNNNNNN',
};
const CHANNEL = {
  TELEGRAM_BOT_TOKEN: '123456789:fake-telegram-token-0038-TTTTTTTT', TELEGRAM_WEBHOOK_SECRET: 'fake-telegram-webhook-0038-SSSSSSSSSSSSSS',
  TELEGRAM_BOT_USERNAME: 'TraineeFakeBot', WHATSAPP_TOKEN: 'fake-whatsapp-token-0038-WWWWWWWWWWWWWW', WHATSAPP_PHONE_NUMBER_ID: '100200300400',
  WHATSAPP_APP_SECRET: 'fake-whatsapp-app-secret-0038-AAAAAAAA', WHATSAPP_VERIFY_TOKEN: 'fake-whatsapp-verify-0038-VVVVVVVVVVVVVVVV',
  WHATSAPP_TEMPLATE_UPDATES: 'trainee_updates', WHATSAPP_TEMPLATE_LANGUAGE: 'en_US', WHATSAPP_DAILY_TEMPLATES: '250',
};
const HIDDEN = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'];
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'trainee-channels-test-'));
const dry = (env, args = []) => { const r = spawnSync('bash', [SCRIPT, '--dry-run', ...args], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, ...env } }); return { code: r.status, out: r.stdout + r.stderr }; };

test('go-live: the channel inputs are set masked, the two webhooks deploy without JWT, the channel migration applies last', () => {
  const { code, out } = dry({ ...BASE_ENV, ...CHANNEL });
  assert.equal(code, 0, out);
  for (const k of HIDDEN) assert.ok(!out.includes(CHANNEL[k]), `${k} is never printed`);
  for (const k of Object.keys(CHANNEL)) assert.match(out, new RegExp(`--env-file <0600 temp file: [^>]*${k}=\\*\\*\\*`), `${k} is set`);
  assert.match(out, /supabase functions deploy trainee-inbound [^\n]*--no-verify-jwt[\s\S]*supabase functions deploy trainee-telegram --project-ref abcdefghijklmnopqrst --no-verify-jwt[\s\S]*supabase functions deploy trainee-whatsapp --project-ref abcdefghijklmnopqrst --no-verify-jwt/);
  assert.match(out, /deno check [^\n]*trainee-telegram\/index\.ts [^\n]*trainee-whatsapp\/index\.ts/);
  const migs = [...out.matchAll(/-f supabase\/migrations\/(\S+\.sql)/g)].map((m) => m[1]);
  assert.equal(migs[migs.length - 1], '20261021070000_channel_parity.sql');
  assert.match(out, /Telegram webhook \(setWebhook with secret_token=<TELEGRAM_WEBHOOK_SECRET>\): https:\/\/abcdefghijklmnopqrst\.supabase\.co\/functions\/v1\/trainee-telegram/);
  assert.match(out, /WhatsApp callback URL \(verify token <WHATSAPP_VERIFY_TOKEN>, subscribe to messages\): https:\/\/abcdefghijklmnopqrst\.supabase\.co\/functions\/v1\/trainee-whatsapp/);
  assert.match(out, /TELEGRAM_WEBHOOK_SECRET=\*\*\* WHATSAPP_VERIFY_TOKEN=\*\*\* [^\n]*node scripts\/launch\/trainee-smoke\.cjs/, 'the smoke gets the channel secrets, masked');
});

test('go-live: without channel inputs each one is kept and named NOT_WIRED; bad shapes stop the run without showing the value', () => {
  const { code, out } = dry(BASE_ENV);
  assert.equal(code, 0, out);
  for (const k of Object.keys(CHANNEL)) assert.match(out, new RegExp(`kept: ${k} \\(not given; [^)]*NOT_WIRED\\)`));
  assert.doesNotMatch(out, /TELEGRAM_BOT_TOKEN=\*\*\*/);
  const bad = dry({ ...BASE_ENV, ...CHANNEL, TELEGRAM_WEBHOOK_SECRET: 'fake has spaces and is long enough to pass 32' });
  assert.equal(bad.code, 1);
  assert.match(bad.out, /FAILED: TELEGRAM_WEBHOOK_SECRET must be 32 to 256/);
  assert.ok(!bad.out.includes('fake has spaces'));
  const num = dry({ ...BASE_ENV, ...CHANNEL, WHATSAPP_PHONE_NUMBER_ID: '+1 555 000 1111' });
  assert.match(num.out, /FAILED: WHATSAPP_PHONE_NUMBER_ID is the numeric ID, not the phone number/);
});

const BASE = 'https://abcdefghijklmnopqrst.supabase.co';
function fakeFetch(answer) {
  const calls = [];
  const f = async (url, init = {}) => { calls.push({ url, init }); const [status, body] = answer(url, init); return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }); };
  f.calls = calls;
  return f;
}
test('smoke: trainee-telegram refuses a wrong secret token and answers the right one; NOT_WIRED is a WARN; a gateway JWT wall fails', async () => {
  const right = CHANNEL.TELEGRAM_WEBHOOK_SECRET;
  const tg = (ok) => fakeFetch((u, i) => (i.headers['x-telegram-bot-api-secret-token'] === right ? ok : [403, { error: 'forbidden' }]));
  assert.deepEqual((await smoke.checkTelegram({ base: BASE, secret: right, fetchFn: tg([200, { ok: true, ignored: 'not a Telegram update' }]) })).map((x) => x.status), ['PASS', 'PASS']);
  assert.deepEqual((await smoke.checkTelegram({ base: BASE, secret: right, fetchFn: tg([503, { error: 'NOT_WIRED: TELEGRAM_BOT_TOKEN is not set; no turn was run' }]) })).map((x) => x.status), ['PASS', 'WARN']);
  assert.equal((await smoke.checkTelegram({ base: BASE, secret: right, fetchFn: fakeFetch(() => [401, { message: 'Missing authorization header' }]) }))[1].status, 'FAIL');
  const hook = (url) => fakeFetch(() => [200, { ok: true, result: { url, pending_update_count: 0 } }]);
  assert.equal((await smoke.checkTelegramWebhook({ base: BASE, token: CHANNEL.TELEGRAM_BOT_TOKEN, fetchFn: hook(`${BASE}/functions/v1/trainee-telegram`) })).status, 'PASS');
  assert.equal((await smoke.checkTelegramWebhook({ base: BASE, token: CHANNEL.TELEGRAM_BOT_TOKEN, fetchFn: hook('') })).status, 'FAIL');
});

test("smoke: trainee-whatsapp answers Meta's challenge only with the right verify token and refuses an unsigned POST", async () => {
  const f = fakeFetch((u, i) => {
    const q = new URL(u).searchParams;
    if ((i.method || 'GET') === 'GET') return q.get('hub.verify_token') === CHANNEL.WHATSAPP_VERIFY_TOKEN ? [200, q.get('hub.challenge')] : [403, { error: 'forbidden' }];
    return [403, { error: 'forbidden' }];
  });
  assert.deepEqual((await smoke.checkWhatsApp({ base: BASE, verifyToken: CHANNEL.WHATSAPP_VERIFY_TOKEN, fetchFn: f })).map((x) => x.status), ['PASS', 'PASS', 'PASS']);
  const open = fakeFetch(() => [200, '1']);
  assert.ok((await smoke.checkWhatsApp({ base: BASE, verifyToken: CHANNEL.WHATSAPP_VERIFY_TOKEN, fetchFn: open })).some((x) => x.status === 'FAIL'), 'an open door fails');
});

test('smoke main: channel secrets are never printed; a channel not given is reported NOT_WIRED and does not fail the run', async () => {
  const lines = [];
  const f = fakeFetch((u, i) => {
    if (u.includes('api.telegram.org')) return [200, { ok: true, result: { url: `${BASE}/functions/v1/trainee-telegram`, last_error_message: `bad ${CHANNEL.TELEGRAM_BOT_TOKEN}` } }];
    if (u.includes('trainee-telegram')) return i.headers['x-telegram-bot-api-secret-token'] === CHANNEL.TELEGRAM_WEBHOOK_SECRET ? [200, { ok: true }] : [403, { error: `refused ${CHANNEL.TELEGRAM_WEBHOOK_SECRET}` }];
    if (u.includes('agent-chat')) return [401, {}];
    return [200, { ok: true }];
  });
  const env = { SUPABASE_URL: BASE, ...BASE_ENV, TELEGRAM_BOT_TOKEN: CHANNEL.TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET: CHANNEL.TELEGRAM_WEBHOOK_SECRET };
  await smoke.main([], env, { fetch: f, log: (s) => lines.push(s) });
  const out = lines.join('\n');
  for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET']) assert.ok(!out.includes(CHANNEL[k]), `${k} never printed`);
  assert.match(out, /^PASS    trainee-telegram refuses a wrong secret token/m);
  assert.match(out, /^NOT RUN trainee-whatsapp: WhatsApp NOT_WIRED/m);
  assert.doesNotMatch(out, /^FAIL .*whatsapp/m);
});

test('the WhatsApp template the owner submits is the one the code sends: UTILITY, the wording, its env name and one number', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(root, 'docs/launch/whatsapp-templates.json'), 'utf8'));
  const t = doc.templates[0];
  assert.equal(t.category, 'UTILITY');
  assert.equal(t.components[0].text, 'Trainee has {{1}} new update(s) for you. Reply to see them.');
  assert.ok(!/https?:|\*|_/.test(t.components[0].text.replace('{{1}}', '')), 'plain text: no link, no markdown');
  const registry = fs.readFileSync(path.join(root, 'supabase/functions/_shared/channel_registry.ts'), 'utf8');
  assert.ok(registry.includes(`env.get("${t.env}")`) && registry.includes(`env.get("${t.language_env}")`), 'the code reads the template name and language from these env vars');
  const wa = fs.readFileSync(path.join(root, 'supabase/functions/_shared/whatsapp.ts'), 'utf8');
  assert.match(wa, /parameters: \[\{ type: "text", text: String\(/, 'one body parameter: the count');
  const golive = fs.readFileSync(path.join(root, 'docs/launch/TRAINEE-GO-LIVE.md'), 'utf8');
  assert.ok(golive.includes(t.components[0].text) && golive.includes(t.name), 'the go-live doc tells the owner exactly what to submit');
});
