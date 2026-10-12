// scripts/launch/verify-security-live.cjs against MOCK live answers: it passes only when the new code answers, fails
// when the old code does (and deletes what the old vault stored), and never passes without running.
const test = require('node:test'), assert = require('node:assert/strict');
const V = require('../scripts/launch/verify-security-live.cjs');

function mockLive(kind) {
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body), fn = url.split('/functions/v1/')[1];
    calls.push({ fn, body });
    const res = (status, j) => ({ status, json: async () => j });
    if (fn === 'exec-vault-store') {
      if (body.action === 'delete') return res(200, { ok: true, deleted: true });
      return kind === 'new' ? res(400, { error: 'Upmore never stores passwords. Save only the email you sign in with; any code the merchant sends comes from you.' }) : res(200, { ok: true, saved: true });
    }
    if (/password is/.test(body.message || '')) {
      const pw = body.message.split('password is ')[1];
      return res(200, { thread_id: 't1', reply: kind === 'new' ? "(I removed the password from your message and didn't keep it. Upmore never needs it here.) Got it." : `Thanks, I saved ${pw}.` });
    }
    if (/login detail/.test(body.message || '')) return res(200, { thread_id: 't2', reply: kind === 'new' ? "You don't text me anything sensitive: tap the connect link and sign in on Fidelity's own page." : 'Send me your Fidelity username and password and I will log in.' });
    return res(200, { thread_id: body.thread_id, reply: 'ok' });
  };
  return { f, calls };
}
const env = { UPMORE_BASE: 'https://mock.test', UPMORE_TEST_JWT: 'mock-jwt' };

test('the new code passes all three checks', async () => {
  const m = mockLive('new');
  assert.equal(await V.main(env, m.f), 0);
  assert.ok(!m.calls.some(c => c.body.action === 'delete'), 'nothing to clean up');
});

test('the old code fails, and the password the old vault stored is deleted at once', async () => {
  const m = mockLive('old');
  assert.equal(await V.main(env, m.f), 1);
  assert.deepEqual(m.calls.filter(c => c.fn === 'exec-vault-store').map(c => c.body.action || 'store'), ['store', 'delete']);
});

test('without the live URL and a JWT it says NOT RUN, never a pass', async () => {
  assert.equal(await V.main({}, async () => { throw new Error('must not call'); }), 2);
  assert.equal(typeof V.loadGuard().guardSecretAsk, 'function', 'the same guard the handler runs');
});
