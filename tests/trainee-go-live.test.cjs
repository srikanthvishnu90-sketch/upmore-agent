// scripts/launch/trainee-go-live.sh in dry-run mode (the plan, in order, nothing touched, no secret printed) and the
// checks of scripts/launch/trainee-smoke.cjs over a fake fetch and a fake database. Nothing here reaches a network.
// Check: node --test tests/trainee-go-live.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const SCRIPT = path.join(root, 'scripts/launch/trainee-go-live.sh');
const SMOKE = path.join(root, 'scripts/launch/trainee-smoke.cjs');
const smoke = require(SMOKE);

// Distinctive fakes: none of them may ever appear in the output. All are labelled fake (tests/no-secrets.test.cjs).
const FAKE = {
  SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  SUPABASE_DB_URL: 'postgresql://postgres:fake-dbpass-QZ81x@db.example.test:5432/postgres',
  CAREER_INGEST_SECRET: 'fake-ingest-secret-0000-IIIIIIIIIIIIIIIIIIII',
  CAREER_PROACTIVE_SECRET: 'fake-proactive-secret-0000-PPPPPPPPPPPPPPPP',
  TRAINEE_DELIVER_SECRET: 'fake-deliver-secret-0000-DDDDDDDDDDDDDDDDDD',
  TRAINEE_INBOUND_SECRET: 'fake-inbound-secret-0000-NNNNNNNNNNNNNNNNNN',
  LOOPMESSAGE_API_KEY: 'fake-loop-key-0000-LLLLLLLLLL',
  OPENAI_API_KEY: 'sk-proj-fake-should-never-print-0000-OOOOOOOO',
  TRAINEE_ALLOWED_CONTACTS: '+15550009876,+15550004321',
  INGEST_CONTACT_EMAIL: 'owner-fake-QZ81@example.test',
  LOOPMESSAGE_DAILY_CONTACTS: '1000',
  UPMORE_TEST_JWT: 'fake-jwt-should-never-print-0000-JJJJ',
  TRAINEE_SMOKE_CONTACT: '+15550007777',
};
const SECRET_VALUES = Object.entries(FAKE).filter(([k]) => !['SUPABASE_PROJECT_REF', 'LOOPMESSAGE_DAILY_CONTACTS'].includes(k)).map(([, v]) => v);

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'trainee-go-live-test-'));
function dry(args = [], env = FAKE) {
  const res = spawnSync('bash', [SCRIPT, '--dry-run', ...args], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, ...env } });
  return { code: res.status, out: res.stdout + res.stderr };
}
function inOrder(out, steps) {
  let at = -1;
  for (const s of steps) { const i = out.indexOf(s, at + 1); assert.ok(i > at, `"${s}" comes next`); at = i; }
}
// Every migration file from the Trainee set on is applied by go-live, in file order: a new one that is not listed fails
// here (the apply pipeline's six once shipped in trunk without it; docs/playbook-drift-2026-10-19.md).
const MIGRATIONS = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f >= '20261019' && f.endsWith('.sql')).sort();

test('dry run: six steps in order, every Trainee migration in order, agent-chat staged then the four functions without JWT, the three schedules, then smoke', () => {
  const { code, out } = dry();
  assert.equal(code, 0, out);
  inOrder(out, ['STEP 1/6 preflight', 'STEP 1/6 preflight: OK', 'STEP 2/6 migrations', 'STEP 2/6 migrations: OK', 'STEP 3/6 secrets', 'STEP 3/6 secrets: OK',
    'STEP 4/6 deploy', 'STEP 4/6 deploy: OK', 'STEP 5/6 schedules', 'STEP 5/6 schedules: OK', 'STEP 6/6 smoke', 'STEP 6/6 smoke: OK']);
  inOrder(out, MIGRATIONS.map((m) => `--single-transaction -f supabase/migrations/${m}`));
  // 20261024130000 (the draft card-cloud bridge) and 20261025100000 (the one ledger) both replace career_apply_claim_own and
  // career_apply_cloud_refusal; the bridge applied after the ledger strips the ledger's approval re-check from both
  // (docs/architect/MIGRATION-SEQUENCING-BRIDGE-LEDGER.md). Go-live never applies the bridge after the ledger.
  const at = (m) => out.indexOf(`--single-transaction -f supabase/migrations/${m}`);
  const [bridge, ledger] = [at('20261024130000_career_apply_card_cloud_bridge.sql'), at('20261025100000_career_apply_one_ledger.sql')];
  assert.ok(ledger > 0, 'go-live applies the one ledger');
  assert.ok(bridge < 0 || bridge < ledger, 'go-live never applies the draft bridge after the one ledger');
  for (const f of fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => /^2026101[56].*career/.test(f))) {
    assert.match(out, new RegExp(`check ${f} is on the live project.*never applied here`), `${f} is only checked`);
    assert.doesNotMatch(out, new RegExp(`-f supabase/migrations/${f}`), `${f} is never applied`);
  }
  inOrder(out, ['node scripts/career/stage-career.cjs', '(index-career.ts staged as agent-chat/index.ts)', 'supabase functions deploy agent-chat --project-ref abcdefghijklmnopqrst)',
    'supabase functions deploy career-ingest --project-ref abcdefghijklmnopqrst --no-verify-jwt',
    'supabase functions deploy career-proactive --project-ref abcdefghijklmnopqrst --no-verify-jwt',
    'supabase functions deploy trainee-deliver --project-ref abcdefghijklmnopqrst --no-verify-jwt',
    'supabase functions deploy trainee-inbound --project-ref abcdefghijklmnopqrst --no-verify-jwt']);
  assert.doesNotMatch(out, /deploy agent-chat[^\n]*--no-verify-jwt/, 'agent-chat keeps the JWT check');
  const base = 'https://abcdefghijklmnopqrst.supabase.co/functions/v1';
  inOrder(out, [`CAREER_INGEST_SECRET=*** psql *** -X -q -v ON_ERROR_STOP=1 -v url=${base}/career-ingest -f scripts/launch/schedule-career-ingest.sql`,
    `CAREER_PROACTIVE_SECRET=*** psql *** -X -q -v ON_ERROR_STOP=1 -v url=${base}/career-proactive -f scripts/launch/schedule-career-proactive.sql`,
    `TRAINEE_DELIVER_SECRET=*** psql *** -X -q -v ON_ERROR_STOP=1 -v url=${base}/trainee-deliver -f scripts/launch/schedule-trainee-deliver.sql`,
    'node scripts/launch/trainee-smoke.cjs --wait-runs 420']);
  assert.doesNotMatch(out, /supabase db push/, 'never a replay of every migration');
  assert.doesNotMatch(out, /--allow-send/, 'no text goes out unless asked');
});

test('the env var each schedule script reads is the one go-live passes, and the header it sends is the one the handler checks', () => {
  const pairs = [['schedule-career-ingest.sql', 'CAREER_INGEST_SECRET', 'career-ingest'], ['schedule-career-proactive.sql', 'CAREER_PROACTIVE_SECRET', 'career-proactive'], ['schedule-trainee-deliver.sql', 'TRAINEE_DELIVER_SECRET', 'trainee-deliver']];
  for (const [file, v, fn] of pairs) {
    const sql = fs.readFileSync(path.join(root, 'scripts/launch', file), 'utf8');
    assert.match(sql, new RegExp(`printf '%s' "\\$${v}"`), `${file} reads ${v}`);
    const g = smoke.GATED.find((x) => x.fn === fn);
    assert.equal(g.env, v);
    assert.ok(sql.includes(`'${g.header}'`), `${file} sends ${g.header}`);
    const handler = fs.readFileSync(path.join(root, 'supabase/functions', fn, 'handler.ts'), 'utf8');
    assert.ok(handler.includes(`d.env.get("${v}")`) && handler.includes(`req.headers.get("${g.header}")`), `${fn}/handler.ts checks ${v} in ${g.header}`);
  }
  const inbound = fs.readFileSync(path.join(root, 'supabase/functions/trainee-inbound/handler.ts'), 'utf8');
  assert.ok(inbound.includes('d.env.get("TRAINEE_INBOUND_SECRET")') && inbound.includes('searchParams.get("secret")'));
  const files = { 'trainee-career-ingest': 'schedule-career-ingest.sql', 'trainee-career-proactive': 'schedule-career-proactive.sql', 'trainee-deliver': 'schedule-trainee-deliver.sql' };
  for (const r of smoke.RUNS) assert.ok(fs.readFileSync(path.join(root, 'scripts/launch', files[r.job]), 'utf8').includes(`cron.schedule('${r.job}'`), `${r.job} is the job name`);
});

test('dry run: no secret value is ever printed, only names and ***', () => {
  for (const args of [[], ['--brain', 'agent', '--allow-send'], ['--only-smoke'], ['--skip-deploy', '--skip-migrations']]) {
    const { code, out } = dry(args);
    assert.equal(code, 0, out);
    for (const v of SECRET_VALUES) assert.ok(!out.includes(v), `${v.slice(0, 12)}… is not printed (${args.join(' ')})`);
    assert.doesNotMatch(out, /fake-dbpass|QZ81|NNNNNNNN|IIIIIIII/);
  }
  const { out } = dry();
  assert.match(out, /supabase secrets set --project-ref abcdefghijklmnopqrst --env-file <0600 temp file: CAREER_INGEST_SECRET=\*\*\* CAREER_PROACTIVE_SECRET=\*\*\* TRAINEE_DELIVER_SECRET=\*\*\* TRAINEE_INBOUND_SECRET=\*\*\* INGEST_CONTACT_EMAIL=\*\*\* LOOPMESSAGE_API_KEY=\*\*\* LOOPMESSAGE_DAILY_CONTACTS=\*\*\* TRAINEE_ALLOWED_CONTACTS=\*\*\* OPENAI_API_KEY=\*\*\* MODEL_PROVIDER=openai>/);
});

test('CAREER_BRAIN=agent is set only with --brain agent; --brain router unsets it; otherwise it is not touched', () => {
  const plain = dry([], { ...FAKE, CAREER_BRAIN: 'agent' }).out; // the environment never decides the brain
  assert.doesNotMatch(plain, /CAREER_BRAIN=agent/);
  assert.doesNotMatch(plain, /secrets unset CAREER_BRAIN/);
  assert.match(plain, /CAREER_BRAIN not touched/);
  const agent = dry(['--brain', 'agent']).out;
  assert.match(agent, /--env-file <0600 temp file: [^>]*CAREER_BRAIN=agent>/);
  const router = dry(['--brain=router']).out;
  assert.doesNotMatch(router, /CAREER_BRAIN=agent/);
  assert.match(router, /DRY: supabase secrets unset CAREER_BRAIN --project-ref abcdefghijklmnopqrst/);
  assert.notEqual(dry(['--brain', 'gpt']).code, 0, 'only agent or router');
});

test('flags: --skip-migrations, --skip-deploy and --only-smoke skip their steps; --allow-send and --no-wait reach the smoke', () => {
  const noMig = dry(['--skip-migrations']).out;
  assert.match(noMig, /STEP 2\/6 migrations: SKIPPED \(--skip-migrations\)/);
  assert.doesNotMatch(noMig, /-f supabase\/migrations\//);
  assert.match(noMig, /supabase functions deploy trainee-inbound/);
  const noDeploy = dry(['--skip-deploy']).out;
  assert.match(noDeploy, /STEP 4\/6 deploy: SKIPPED \(--skip-deploy\)/);
  assert.doesNotMatch(noDeploy, /functions deploy|deno check/);
  assert.match(noDeploy, /schedule-trainee-deliver\.sql/);
  const only = dry(['--only-smoke', '--allow-send']).out;
  for (const s of ['2/6 migrations', '3/6 secrets', '4/6 deploy', '5/6 schedules']) assert.match(only, new RegExp(`STEP ${s}: SKIPPED \\(--only-smoke\\)`));
  assert.doesNotMatch(only, /secrets set|functions deploy|psql \*\*\* -X -q -v ON_ERROR_STOP=1 -v url/);
  assert.match(only, /TRAINEE_SMOKE_CONTACT=\*\*\* node scripts\/launch\/trainee-smoke\.cjs --allow-send$/m, 'no wait: the schedules fired long ago');
  assert.match(dry(['--no-wait']).out, /node scripts\/launch\/trainee-smoke\.cjs$/m);
  assert.equal(dry(['--bogus']).code, 64);
  const badRef = dry([], { ...FAKE, SUPABASE_PROJECT_REF: 'not-a-ref' });
  assert.equal(badRef.code, 1);
  assert.match(badRef.out, /STEP 1\/6 preflight: FAILED: SUPABASE_PROJECT_REF is not a project ref/);
  const badSecret = dry([], { ...FAKE, TRAINEE_INBOUND_SECRET: 'too-short-fake' });
  assert.match(badSecret.out, /FAILED: TRAINEE_INBOUND_SECRET must be 32 or more/);
  assert.ok(!badSecret.out.includes('too-short-fake'));
});

test('the script is the owner\'s: it prompts on hidden reads, never writes a secret to a file except the 0600 env file it removes', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.match(src, /read -rs "\$v" <\/dev\/tty/);
  assert.match(src, /openssl rand -hex 24/);
  assert.match(src, /rm -f "\$ENVF"/);
  assert.match(src, /printf '  %s=%s\\n' "\$v" "\$\{!v\}" >\/dev\/tty/, 'a generated secret is shown only on the terminal, never the log');
  assert.doesNotMatch(src, /set -x/);
  execFileSync('bash', ['-n', SCRIPT]);
});

test('trainee-smoke with no environment: NOT RUN, exit 2, says what is missing, calls nothing', () => {
  const res = spawnSync(process.execPath, [SMOKE], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(res.status, 2);
  assert.match(res.stdout, /^NOT RUN trainee smoke: missing SUPABASE_URL, CAREER_INGEST_SECRET, CAREER_PROACTIVE_SECRET, TRAINEE_DELIVER_SECRET, TRAINEE_INBOUND_SECRET/);
});

// A fake fetch: answers by (function, which secret) from a table, and records every call.
const BASE = 'https://abcdefghijklmnopqrst.supabase.co';
function fakeFetch(answer) {
  const calls = [];
  const f = async (url, init) => {
    const u = new URL(url), fn = u.pathname.split('/').pop();
    const g = smoke.GATED.find((x) => x.fn === fn);
    const got = g ? (g.query ? u.searchParams.get(g.query) : init.headers[g.header]) : null;
    const call = { fn, url, init, secretOk: g ? got === FAKE[g.env] : null, body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const [status, body] = answer(call);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  f.calls = calls;
  return f;
}
const handlerLike = (call) => {
  const refuse = call.fn === 'trainee-inbound' ? [403, { error: 'forbidden' }] : [401, { error: 'Unauthorized' }];
  return call.secretOk ? [200, { ok: true }] : refuse;
};

test('checkGate: refuses wrong (401/403) and answers right (200) pass; NOT_WIRED is a WARN; no secret on the function, a gateway JWT wall or an open door fail', async () => {
  for (const g of smoke.GATED) {
    const f = fakeFetch(handlerLike);
    const res = await smoke.checkGate(g, { base: BASE, secret: FAKE[g.env], fetchFn: f });
    assert.deepEqual(res.map((x) => x.status), ['PASS', 'PASS'], `${g.fn}: ${JSON.stringify(res)}`);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].secretOk, false); assert.equal(f.calls[1].secretOk, true);
    assert.equal(f.calls[1].init.method, 'POST');
    if (g.query) assert.match(f.calls[1].url, /\?secret=/); else assert.ok(!f.calls[1].url.includes('?'), 'scheduler secrets go in the header');
  }
  const deliver = smoke.GATED.find((x) => x.fn === 'trainee-deliver');
  const notWired = await smoke.checkGate(deliver, { base: BASE, secret: FAKE.TRAINEE_DELIVER_SECRET, fetchFn: fakeFetch((c) => c.secretOk ? [503, { error: 'NOT_WIRED: LOOPMESSAGE_API_KEY is not set; nothing was sent' }] : [401, { error: 'Unauthorized' }]) });
  assert.deepEqual(notWired.map((x) => x.status), ['PASS', 'WARN']);
  assert.match(notWired[1].detail, /LOOPMESSAGE_API_KEY/);
  const ingest = smoke.GATED.find((x) => x.fn === 'career-ingest');
  const noContact = await smoke.checkGate(ingest, { base: BASE, secret: FAKE.CAREER_INGEST_SECRET, fetchFn: fakeFetch((c) => c.secretOk ? [503, { error: 'not configured: INGEST_CONTACT_EMAIL is not set (boards are told who is reading them)' }] : [401, { error: 'Unauthorized' }]) });
  assert.deepEqual(noContact.map((x) => x.status), ['PASS', 'WARN']);
  const noSecret = await smoke.checkGate(ingest, { base: BASE, secret: FAKE.CAREER_INGEST_SECRET, fetchFn: fakeFetch(() => [503, { error: 'not configured: CAREER_INGEST_SECRET must be set, 32 characters or more' }]) });
  assert.deepEqual(noSecret.map((x) => x.status), ['FAIL', 'FAIL']);
  const gateway = await smoke.checkGate(ingest, { base: BASE, secret: FAKE.CAREER_INGEST_SECRET, fetchFn: fakeFetch(() => [401, { code: 401, message: 'Missing authorization header' }]) });
  assert.equal(gateway[1].status, 'FAIL'); assert.match(gateway[1].detail, /--no-verify-jwt/);
  const open = await smoke.checkGate(ingest, { base: BASE, secret: FAKE.CAREER_INGEST_SECRET, fetchFn: fakeFetch(() => [200, {}]) });
  assert.equal(open[0].status, 'FAIL', 'answering a wrong secret is a failure');
  const crashed = await smoke.checkGate(ingest, { base: BASE, secret: FAKE.CAREER_INGEST_SECRET, fetchFn: fakeFetch((c) => c.secretOk ? [500, { error: 'ingest failed', detail: 'boom' }] : [401, { error: 'Unauthorized' }]) });
  assert.equal(crashed[1].status, 'FAIL');
  const down = await smoke.checkGate(ingest, { base: BASE, secret: FAKE.CAREER_INGEST_SECRET, fetchFn: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
  assert.deepEqual(down.map((x) => x.status), ['FAIL', 'FAIL']);
});

test('the HELP body is one the real parseLoopInbound reads as an inbound text from the contact', async () => {
  const { stripTypeScriptTypes } = require('node:module');
  const src = stripTypeScriptTypes(fs.readFileSync(path.join(root, 'supabase/functions/_shared/loopmessage.ts'), 'utf8'), { mode: 'strip' });
  const { parseLoopInbound } = await import('data:text/javascript,' + encodeURIComponent(src));
  const body = smoke.helpBody(FAKE.TRAINEE_SMOKE_CONTACT, 1760000000000);
  const m = parseLoopInbound(body);
  assert.equal(m.kind, 'text'); assert.equal(m.text, 'HELP'); assert.equal(m.sender, FAKE.TRAINEE_SMOKE_CONTACT);
  assert.ok(m.messageId && m.messageId !== smoke.helpBody(FAKE.TRAINEE_SMOKE_CONTACT, 1760000000000).message_id, 'a fresh message id each run');
  assert.equal(parseLoopInbound({}).kind, 'ignored', 'the right-secret gate call (empty body) runs no turn');
});

test('checkInboundHelp: ok + command help + sent passes; not sent, ignored or NOT_WIRED do not', async () => {
  const args = (fetchFn) => ({ base: BASE, secret: FAKE.TRAINEE_INBOUND_SECRET, contact: FAKE.TRAINEE_SMOKE_CONTACT, fetchFn, now: 1 });
  const f = fakeFetch((c) => [200, { ok: true, command: c.body.text.toLowerCase(), sent: true }]);
  assert.equal((await smoke.checkInboundHelp(args(f))).status, 'PASS');
  assert.equal(f.calls[0].secretOk, true);
  assert.equal(f.calls[0].body.recipient, FAKE.TRAINEE_SMOKE_CONTACT);
  assert.equal((await smoke.checkInboundHelp(args(fakeFetch(() => [200, { ok: true, command: 'help', sent: false }])))).status, 'FAIL');
  assert.equal((await smoke.checkInboundHelp(args(fakeFetch(() => [200, { ok: true, ignored: 'no sender' }])))).status, 'FAIL');
  assert.equal((await smoke.checkInboundHelp(args(fakeFetch(() => [503, { error: 'NOT_WIRED: LOOPMESSAGE_API_KEY is not set; no turn was run' }])))).status, 'WARN');
});

test('agent-chat: no JWT must be 401; "hi" with the test JWT needs a non-empty reply', async () => {
  assert.equal((await smoke.checkChatNoJwt({ base: BASE, fetchFn: fakeFetch(() => [401, { error: 'unauthorized' }]) })).status, 'PASS');
  assert.equal((await smoke.checkChatNoJwt({ base: BASE, fetchFn: fakeFetch(() => [200, { reply: 'x' }]) })).status, 'FAIL');
  const f = fakeFetch(() => [200, { reply: 'Hi, I find jobs and text you the good ones.', thread_id: 't' }]);
  assert.equal((await smoke.checkChatHi({ base: BASE, jwt: FAKE.UPMORE_TEST_JWT, fetchFn: f })).status, 'PASS');
  assert.equal(f.calls[0].init.headers.Authorization, `Bearer ${FAKE.UPMORE_TEST_JWT}`);
  assert.deepEqual(f.calls[0].body, { message: 'hi' });
  assert.equal((await smoke.checkChatHi({ base: BASE, jwt: 'x', fetchFn: fakeFetch(() => [200, { reply: '  ' }]) })).status, 'FAIL');
  assert.equal((await smoke.checkChatHi({ base: BASE, jwt: 'x', fetchFn: fakeFetch(() => [429, { message: 'slow down' }]) })).status, 'FAIL');
});

// A fake database: the cron query answers from `jobs`, each run query from `runs` (keyed by its table).
function fakeSql(jobs, runs) {
  return async (q) => {
    if (q.includes('cron.job')) return jobs.map((j) => j.join('|')).join('\n') + '\n';
    const key = Object.keys(runs).find((k) => q.includes(k));
    return runs[key] == null ? '' : runs[key] + '\n';
  };
}
const goodJobs = [['trainee-career-ingest', 'succeeded', '120'], ['trainee-career-proactive', 'succeeded', '60'], ['trainee-deliver', 'succeeded', '20']];
const goodRuns = { career_ingest_state: '90|', career_proactive_runs: '50|', channel_delivery_runs: '15|' };

test('checkRuns: each schedule fired and each run record has a fresh row without an error; missing, stale or failed ones fail', async () => {
  assert.deepEqual((await smoke.checkRuns({ sql: fakeSql(goodJobs, goodRuns) })).map((x) => x.status), Array(6).fill('PASS'));
  const missingJob = await smoke.checkRuns({ sql: fakeSql(goodJobs.slice(0, 2), goodRuns) });
  assert.equal(missingJob.find((x) => x.check === 'schedule trainee-deliver').status, 'FAIL');
  const stale = await smoke.checkRuns({ sql: fakeSql(goodJobs, { ...goodRuns, channel_delivery_runs: '900|' }) });
  assert.equal(stale.find((x) => x.check === 'channel_delivery_runs has a recent row').status, 'FAIL');
  const errored = await smoke.checkRuns({ sql: fakeSql(goodJobs, { ...goodRuns, career_proactive_runs: '30|record run: permission denied' }) });
  assert.match(errored.find((x) => x.check === 'career_proactive_runs has a recent row').detail, /permission denied/);
  const never = await smoke.checkRuns({ sql: fakeSql([['trainee-career-ingest', '', ''], ...goodJobs.slice(1)], { ...goodRuns, career_ingest_state: '|' }) });
  assert.deepEqual(never.slice(0, 2).map((x) => x.status), ['FAIL', 'FAIL']);
  const failedFire = await smoke.checkRuns({ sql: fakeSql([['trainee-career-ingest', 'failed', '30'], ...goodJobs.slice(1)], goodRuns) });
  assert.equal(failedFire[0].status, 'FAIL');
});

test('main: one line per check and a summary, waits for the schedules when asked, exit 1 on a FAIL, and never prints a secret', async () => {
  const env = { SUPABASE_URL: BASE + '/', ...FAKE };
  const lines = [];
  let polls = 0, clock = 0;
  const sql = async (q) => { if (q.includes('cron.job')) polls++; return fakeSql(polls < 3 ? goodJobs.slice(0, 2) : goodJobs, goodRuns)(q); };
  const echoFetch = fakeFetch((c) => c.fn === 'agent-chat'
    ? (c.init.headers.Authorization ? [200, { reply: `echo ${FAKE.UPMORE_TEST_JWT}` }] : [401, { error: 'unauthorized' }])
    : c.fn === 'trainee-inbound' && c.body && c.body.text ? [200, { ok: true, command: 'help', sent: true }]
    : c.secretOk ? [200, { ok: true, echoed: c.url }] : [c.fn === 'trainee-inbound' ? 403 : 401, { error: `refused ${FAKE.TRAINEE_INBOUND_SECRET}` }]);
  const code = await smoke.main(['--allow-send', '--wait-runs', '120'], env, { fetch: echoFetch, sql, log: (s) => lines.push(s), sleep: async (ms) => { clock += ms; }, now: () => clock });
  const out = lines.join('\n');
  assert.equal(code, 0, out);
  assert.equal(polls, 3, 'polled until every schedule had fired');
  assert.match(out, /waiting up to 120 s/);
  assert.match(out, /^summary: 17 PASS, 0 WARN, 0 FAIL, 0 NOT RUN$/m);
  for (const l of lines.filter((l) => !/^summary|^waiting/.test(l))) assert.match(l, /^(PASS|FAIL|WARN|NOT RUN) /);
  for (const v of SECRET_VALUES) assert.ok(!out.includes(v) && !out.includes(encodeURIComponent(v)), `${v.slice(0, 12)}… is not printed`);

  const bare = [];
  const code2 = await smoke.main([], { SUPABASE_URL: BASE, CAREER_INGEST_SECRET: FAKE.CAREER_INGEST_SECRET, CAREER_PROACTIVE_SECRET: FAKE.CAREER_PROACTIVE_SECRET, TRAINEE_DELIVER_SECRET: FAKE.TRAINEE_DELIVER_SECRET, TRAINEE_INBOUND_SECRET: FAKE.TRAINEE_INBOUND_SECRET },
    { fetch: fakeFetch((c) => c.fn === 'trainee-deliver' && c.secretOk ? [500, { error: 'delivery run failed' }] : c.fn === 'agent-chat' ? [401, {}] : handlerLike(c)), log: (s) => bare.push(s) });
  assert.equal(code2, 1);
  assert.match(bare.join('\n'), /^NOT RUN trainee-inbound answers HELP: skipped: it texts the help reply/m);
  assert.match(bare.join('\n'), /^NOT RUN agent-chat answers "hi" for the test user: missing UPMORE_TEST_JWT/m);
  assert.match(bare.join('\n'), /^NOT RUN schedules and run records: missing SUPABASE_DB_URL/m);
  assert.match(bare.join('\n'), /^FAIL    trainee-deliver answers the right secret: HTTP 500/m);
  assert.equal(await smoke.main([], { ...env, SUPABASE_URL: 'http://plain.example.test' }, { log: () => {} }), 2, 'https only');
});

// A real (not dry) run over stub tools, without a terminal: pressing Enter for the inbound secret must not replace one
// LoopMessage's webhook URL already carries, unless the owner asks for the rotation.
const REAL_GIT = execFileSync('bash', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const HEAD_SHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
function stubbed(env) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'trainee-go-live-bin-'));
  const calls = path.join(bin, 'calls.log');
  const stub = (name, body) => { fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\necho "${name} $*" >> "${calls}"\n${body}\n`); fs.chmodSync(path.join(bin, name), 0o755); };
  stub('supabase', 'if [[ "$1 $2" == "secrets list" ]]; then printf "NAME | DIGEST\\nTRAINEE_INBOUND_SECRET | 0f0f\\n"; fi; exit 0');
  stub('psql', 'exit 0'); stub('deno', 'exit 0');
  // WO-093: a real run ships exactly --sha (HEAD here) from git archive, so git and node are the real ones, but for a
  // clean tree (this checkout may have edits) and the smoke (no network in a test).
  stub('node', `if [[ "$1" == *trainee-smoke.cjs ]]; then exit 0; fi\nexec "${process.execPath}" "$@"`);
  stub('git', `if [[ "$1" == status ]]; then exit 0; fi\nexec "${REAL_GIT}" "$@"`);
  const res = spawnSync('bash', [SCRIPT, '--sha', HEAD_SHA], { cwd: root, encoding: 'utf8', detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, TRAINEE_GO_LIVE_LOG: path.join(bin, 'run.log'), ...env } });
  return { code: res.status, out: res.stdout + res.stderr, calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '' };
}

test('an inbound secret already on the project is never replaced by an Enter; TRAINEE_ROTATE_INBOUND=1 replaces it on purpose', () => {
  const { TRAINEE_INBOUND_SECRET, ...rest } = FAKE;
  const kept = stubbed(rest);
  assert.equal(kept.code, 1, kept.out);
  assert.match(kept.out, /STEP 1\/6 preflight: FAILED: TRAINEE_INBOUND_SECRET is already set on the project/);
  assert.doesNotMatch(kept.calls, /secrets set|functions deploy/, 'nothing changed on the project');
  const rotated = stubbed({ ...rest, TRAINEE_ROTATE_INBOUND: '1' });
  assert.match(rotated.out, /STEP 1\/6 preflight: OK/, rotated.out);
  for (const v of SECRET_VALUES) assert.ok(!rotated.out.includes(v) && !kept.out.includes(v), 'no secret printed');
});
