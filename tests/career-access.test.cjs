// Career access layer (Appendix A; ACCS-001..007): connected accounts, session health (T8 replay),
// re-auth wording, portal records, handoff tickets, audit log, chat handlers.
// Check: node --test tests/career-access.test.cjs
// Mocks are inside this test only and labeled mock: connection/health/audit ROWS are fixtures, no provider is called.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const A = require(path.join(root, 'packages/domain/120-career-access.js'));

const CAREER = [...A.CAREER_SCOPES];
const rowsMock = [
  { provider: 'gmail', email: 'person@example.com', scopes: A.GMAIL_SCOPE, connected_at: '2026-10-01T00:00:00.000Z' },
  { provider: 'google_career', email: 'person@example.com', scopes: CAREER.join(' '), connected_at: '2026-10-10T00:00:00.000Z' },
];

test('ACCS-002 connected accounts: career grant wins for Gmail (read + send), Calendar shows via the grant, scopes + email surface', () => {
  const r = A.connectedAccounts(rowsMock);
  assert.equal(r.gmail.connected, true);
  assert.equal(r.gmail.scope_set, 'career');
  assert.equal(r.gmail.can_send, true, "the user's own Gmail via OAuth is the send rail");
  assert.equal(r.calendar_connected, true);
  assert.equal(r.connected_email, 'person@example.com');
  assert.deepEqual(new Set(r.granted_scopes), new Set(CAREER));
  assert.match(r.text, /Gmail: connected as person@example\.com \(read \+ send\)/);
  assert.match(r.text, /Google Calendar: connected/);
  const legacyOnly = A.connectedAccounts([rowsMock[0]]);
  assert.equal(legacyOnly.gmail.scope_set, 'readonly');
  assert.equal(legacyOnly.gmail.can_send, false);
  assert.equal(legacyOnly.calendar_connected, false);
  assert.match(legacyOnly.text, /read-only/);
  assert.equal(A.connectedAccounts([]).count, 0);
  // The gmail-oauth status-object shape normalizes to the same answer.
  const fromStatus = A.connectedAccounts({ legacy: { connected: true, email: 'person@example.com', scopes: [A.GMAIL_SCOPE], connected_at: null }, career: { connected: true, email: 'person@example.com', scopes: CAREER, connected_at: null } });
  assert.equal(fromStatus.calendar_connected, true);
  assert.equal(fromStatus.gmail.scope_set, 'career');
});

test('ACCS-003 / Appendix B T8 replay: a killed LinkedIn session pauses ONLY LinkedIn tasks, one re-auth message, other work continues', () => {
  // Replay of T8 ("kill LinkedIn session mid-run"): health records are mock fixtures standing in for the
  // host's per-source health checks; the plan is the unit under test.
  const plan = A.healthPlan({
    health: [
      { source: 'linkedin', status: 'expired', checked_at: '2026-10-12T15:00:00.000Z' },
      { source: 'google_career', status: 'ok', checked_at: '2026-10-12T15:00:00.000Z' },
      { source: 'gmail', status: 'ok', checked_at: '2026-10-12T15:00:00.000Z' },
    ],
    tasks: [
      { id: 'view-profile', title: 'View a profile the user asked about', needs: ['linkedin'] },
      { id: 'send-outreach', title: 'Send outreach from own Gmail', needs: ['gmail'] },
      { id: 'book-call', title: 'Book on Calendar', needs: ['calendar'] },
      { id: 'li-and-send', title: 'Draft from LinkedIn, send by Gmail', needs: ['linkedin', 'gmail'] },
    ],
    secureLinkFor: s => `https://secure.example/connect/${s}`,
  });
  assert.deepEqual(plan.paused.map(p => p.id), ['view-profile', 'li-and-send']);
  assert.deepEqual(plan.running.map(p => p.id), ['send-outreach', 'book-call'], 'Gmail + Calendar work continues');
  assert.deepEqual(plan.paused[0].blocked_by, ['linkedin']);
  assert.equal(plan.messages.length, 1, 'exactly ONE re-auth message, however many tasks need the source');
  assert.equal(plan.reauth[0].source, 'linkedin');
  assert.equal(plan.per_source.linkedin.status, 'expired');
  assert.equal(plan.per_source.calendar.status, 'ok', 'calendar is satisfied by the career Google grant');
});

test('ACCS-003 re-auth message: Appendix A.3 wording, secure link, never asks for a password / code / card', () => {
  const msg = A.reauthMessage('linkedin', 'https://secure.example/connect/linkedin');
  assert.equal(msg, 'I need access to LinkedIn to do this. Open this, sign in, done in 30 seconds. I never see your password. https://secure.example/connect/linkedin');
  assert.doesNotMatch(msg, /(send|give|tell|enter|type|share|text) (me )?(your )?(password|code|card)/i, 'asks for nothing secret');
  assert.doesNotMatch(msg, /\bpassword\?|\bcode\?/i);
  // Missing (never connected) also pauses and asks once; an unchecked source is not assumed healthy.
  const plan = A.healthPlan({ health: [], tasks: [{ id: 't1', needs: ['handshake'] }] });
  assert.equal(plan.per_source.handshake.status, 'missing');
  assert.equal(plan.paused.length, 1);
  assert.equal(plan.messages.length, 1);
});

test('ACCS-004 browser-source plan: user signs in once, agent never sees the password, LinkedIn risk said out loud, no scraping', () => {
  const p = A.browserConnectPlan('linkedin');
  assert.equal(p.ok, true);
  assert.equal(p.agent_sees_password, false);
  assert.match(p.risk_note, /prohibit automation and scraping/);
  assert.match(p.risk_note, /low-volume only/);
  assert.equal(A.browserConnectPlan('gmail').ok, false, 'Gmail connects by OAuth, not a browser session');
});

test('ACCS-005 portal records: alias + vault REF only; a secret value can never enter or serialize out', () => {
  const secretMock = 'mock-generated-value-DO-NOT-LOG-12345'; // labeled mock secret, test only
  const refused = A.portalRecord({ company: 'Acme', alias_email: 'me+acme@example.com', password: secretMock, password_vault_ref: 'vault://portal/acme' });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'secret_in_record');
  assert.ok(!JSON.stringify(refused).includes(secretMock), 'the refused output must not echo the value');
  const ok = A.portalRecord({ company: 'Acme Corp', alias_email: 'me+acme@example.com', password_vault_ref: 'portal_acme_cred', now: Date.UTC(2026, 9, 12) });
  assert.equal(ok.ok, true);
  assert.equal(ok.record.company_key, 'acme-corp');
  assert.equal(ok.record.username, 'me+acme@example.com');
  const list = A.portalList([ok.record]);
  assert.equal(list.count, 1);
  assert.match(list.text, /Acme Corp: portal account as me\+acme@example\.com \(password in your vault\)/);
  assert.ok(!JSON.stringify(list).includes(secretMock));
  assert.ok(!JSON.stringify(ok).includes(secretMock));
  assert.equal(A.portalRecord({ company: 'Acme', alias_email: 'not-an-email', password_vault_ref: 'x' }).code, 'alias_required');
  assert.equal(A.portalRecord({ company: 'Acme', alias_email: 'a@b.co', password_vault_ref: 'has space' }).code, 'vault_ref_required');
});

test('ACCS-006 handoff ticket lifecycle: create -> wrong token refused -> resume once -> replay refused; expiry refuses; no solving path exists', () => {
  const now = Date.UTC(2026, 9, 12, 15, 0, 0);
  const made = A.createHandoff({ source: 'linkedin', challenge: 'captcha', screenshot_ref: 'shot://run-1/step-3', run_id: 'run-1', now, resumeToken: 'mock-resume-token-1' });
  assert.equal(made.ok, true);
  assert.equal(made.ticket.status, 'awaiting_user');
  assert.equal(made.ticket.screenshot_ref, 'shot://run-1/step-3');
  assert.match(made.text, /only you can do/);
  const bad = A.resumeHandoff(made.ticket, { resume_token: 'wrong', now: now + 1000 });
  assert.equal(bad.ok, false); assert.equal(bad.code, 'bad_token');
  const resumed = A.resumeHandoff(made.ticket, { resume_token: 'mock-resume-token-1', now: now + 2000 });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.ticket.status, 'resumed');
  assert.equal(resumed.ticket.resume_token, null, 'resume token is single-use and cleared');
  assert.equal(resumed.run_id, 'run-1');
  const replay = A.resumeHandoff(resumed.ticket, { resume_token: 'mock-resume-token-1', now: now + 3000 });
  assert.equal(replay.ok, false); // resumed ticket carries no token: no_ticket/already handled — either way refused
  // Regression (found building this test): a resumed ticket object BEFORE token clearing must also refuse —
  // status alone stops the second resume.
  const replay2 = A.resumeHandoff({ ...made.ticket, status: 'resumed' }, { resume_token: 'mock-resume-token-1', now: now + 3000 });
  assert.equal(replay2.code, 'already_used');
  const expired = A.resumeHandoff(made.ticket, { resume_token: 'mock-resume-token-1', now: now + A.HANDOFF_TTL_MS + 1 });
  assert.equal(expired.code, 'expired');
  assert.equal(A.createHandoff({ source: 'linkedin', challenge: 'captcha' }).code, 'screenshot_required');
  assert.equal(A.createHandoff({ source: 'linkedin', challenge: 'solve_it_for_me', screenshot_ref: 's' }).code, 'bad_challenge');
  assert.ok(!('solveCaptcha' in A) && !('solve' in A), 'no CAPTCHA-solving surface, ever — handoff only');
});

test('ACCS-007 audit log: shape {source, at, what}, sorted view, secret fields refused', () => {
  const e1 = A.auditEntry({ source: 'gmail', what: 'Sent outreach email to a hiring manager', at: '2026-10-12T15:02:00.000Z', outcome: 'sent' });
  const e2 = A.auditEntry({ source: 'linkedin', what: 'User completed handoff sign-in', at: '2026-10-12T15:01:00.000Z' });
  assert.equal(e1.ok, true);
  assert.deepEqual(Object.keys(e1.entry).sort(), ['at', 'outcome', 'source', 'what']);
  const log = A.auditLog([e1.entry, e2.entry]);
  assert.equal(log.count, 2);
  assert.equal(log.entries[0].source, 'linkedin', 'sorted by time');
  assert.match(log.text, /Gmail: Sent outreach email/);
  const bad = A.auditEntry({ source: 'gmail', what: 'x', password: 'mock-value' });
  assert.equal(bad.code, 'secret_in_record');
  assert.ok(!JSON.stringify(bad).includes('mock-value'));
  assert.equal(A.auditLog([]).text, 'No login-requiring actions yet.');
});

test('ACCS-001/002/007 chat handlers: connect google / connected / disconnect X / access log — handlers name the edge action, never claim it ran', () => {
  const ctx = {
    statusRecords: rowsMock,
    auditEntries: [{ source: 'gmail', at: '2026-10-12T15:02:00.000Z', what: 'Connected career Google grant', outcome: null }],
    secureLinkFor: s => `https://secure.example/connect/${s}`,
  };
  const connect = A.handleChat('connect my Google', ctx);
  assert.equal(connect.intent, 'connect_google');
  assert.equal(connect.edge_action, 'start_career', 'the router hands this to gmail-oauth');
  assert.deepEqual(connect.scopes, CAREER);
  assert.match(connect.reply, /your own Gmail/);
  assert.match(connect.reply, /secure\.example\/connect\/google_career/);
  const list = A.handleChat('what accounts are connected?', ctx);
  assert.equal(list.intent, 'connected_accounts');
  assert.equal(list.calendar_connected, true);
  const disc = A.handleChat('disconnect LinkedIn', ctx);
  assert.equal(disc.intent, 'disconnect');
  assert.equal(disc.edge_action, 'disconnect');
  assert.equal(disc.source, 'linkedin');
  assert.match(disc.reply, /host confirms/, 'deletion is claimed only after the host/edge confirms it');
  const discCal = A.handleChat('disconnect calendar', ctx);
  assert.equal(discCal.source, 'calendar');
  assert.match(discCal.reply, /career Google grant/);
  const log = A.handleChat('show my access log', ctx);
  assert.equal(log.intent, 'access_log');
  assert.match(log.reply, /Connected career Google grant/);
  assert.equal(A.handleChat('what is my checking balance?', ctx), null, 'non-access messages fall through');
  assert.deepEqual(Object.keys(A.chatHandlers).sort(), ['access_log', 'connect_browser_source', 'connect_google', 'connected_accounts', 'disconnect', 'portal_accounts']);
});

test('scope lockstep: domain CAREER_SCOPES match the edge function career grant exactly (drift guard)', () => {
  const edge = fs.readFileSync(path.join(root, 'supabase/functions/gmail-oauth/career.ts'), 'utf8');
  for (const s of CAREER) assert.ok(edge.includes(`"${s}"`), `edge career.ts carries ${s}`);
  assert.match(edge, /oauth_google_career_/, 'career grant is a separate vault entry');
});
