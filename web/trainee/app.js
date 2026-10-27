/* Trainee web app (launch readiness B7, 2026-10-26): sign in with a code, the career chat, the approval card under the
   chat reply that carries it, and the applications view (the open card, then the FEATURE 15 dashboard).
   Every read goes through the signed-in person's own session (row-level security); the one write besides chat turns is
   the card's own answer (src/career-apply-card.js, career_apply_card_answer_own). Text from the server is shown with
   textContent only. Config: window.TRAINEE_CONFIG { backendUrl, anonKey } from /app/config.js. */
(function () {
  'use strict';
  const C = window.TRAINEE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const THREAD_KEY = 'trainee.thread.';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window: the thread is found from history */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing to clear */ } },
  };
  if (!C.backendUrl || !C.anonKey || !window.supabase) {
    $('boot').textContent = 'Trainee could not start: this page is missing its settings. Reload the page.';
    return;
  }
  const supa = window.supabase.createClient(C.backendUrl, C.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  let session = null, thread = null, view = 'boot', generation = 0;
  // The invite link (FEATURE WAVES: <app>/?invite=<token>): kept for this tab through sign-in, sent with the access check
  // (agent-chat redeems it as the signed-in person), then dropped from the address bar and from storage.
  const INVITE_KEY = 'trainee.invite';
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* kept in memory */ } }, del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* nothing kept */ } } };
  let invite = null;
  try {
    const u = new URL(location.href), t = u.searchParams.get('invite');
    if (t && /^[A-Za-z0-9_-]{32}$/.test(t)) { invite = t; ss.set(INVITE_KEY, t); }
    if (u.searchParams.has('invite')) { u.searchParams.delete('invite'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
  } catch (e) { /* no URL API: no invite */ }
  if (!invite) { const t = ss.get(INVITE_KEY); if (t && /^[A-Za-z0-9_-]{32}$/.test(t)) invite = t; }

  /* ---------------- views ---------------- */
  const VIEWS = ['boot', 'signin', 'waiting', 'chat', 'apps'];
  function show(name, focus) {
    view = name;
    for (const v of VIEWS) $(v).hidden = v !== name;
    const inApp = name === 'chat' || name === 'apps';
    $('tabs').hidden = !inApp;
    $('sign-out').hidden = !(session && (inApp || name === 'waiting'));
    for (const [tab, panel] of [['tab-chat', 'chat'], ['tab-apps', 'apps']]) {
      const on = panel === name;
      $(tab).setAttribute('aria-selected', String(on));
      $(tab).tabIndex = on ? 0 : -1;
    }
    if (focus) { const f = typeof focus === 'string' ? $(focus) : focus; if (f) f.focus(); }
  }

  /* ---------------- sign in ---------------- */
  const method = () => (document.querySelector('input[name=method]:checked') || {}).value || 'phone';
  let pending = null; // { phone } or { email }, the contact a code was sent to
  // One code a minute per number or address, in this browser (Supabase Auth limits sends per number and per address on the
  // server too; this keeps a person from tripping it by tapping twice).
  const COOLDOWN_MS = 60 * 1000, SENT_KEY = 'trainee.codeSent';
  const sentAt = (k) => { try { return Number((JSON.parse(store.get(SENT_KEY) || '{}'))[k]) || 0; } catch (e) { return 0; } };
  const markSent = (k) => { let all = {}; try { all = JSON.parse(store.get(SENT_KEY) || '{}') || {}; } catch (e) { all = {}; } all[k] = Date.now(); store.set(SENT_KEY, JSON.stringify(all)); };
  function phoneE164() {
    const cc = $('cc').value.trim().replace(/[^\d+]/g, '');
    let d = $('phone').value.replace(/\D/g, '');
    if (cc === '+1' && d.length === 11 && d.startsWith('1')) d = d.slice(1);
    if (!/^\+\d{1,3}$/.test(cc)) return { error: 'Enter a country code like +1.' };
    if (cc === '+1' ? d.length !== 10 : d.length < 6 || d.length > 14) return { error: 'Enter your mobile number, like (312) 555-0142.' };
    return { value: cc + d };
  }
  function syncMethod() {
    const phone = method() === 'phone';
    $('phone-field').hidden = !phone;
    $('email-field').hidden = phone;
    $('send-code').textContent = phone ? 'Text me a code' : 'Email me a code';
    $('send-error').textContent = '';
  }
  document.querySelectorAll('input[name=method]').forEach((r) => r.addEventListener('change', syncMethod));
  $('phone').addEventListener('input', () => {
    if ($('cc').value.trim() !== '+1') return;
    const d = $('phone').value.replace(/\D/g, '').replace(/^1(?=\d{10})/, '').slice(0, 10);
    $('phone').value = d.length > 6 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : d.length > 3 ? '(' + d.slice(0, 3) + ') ' + d.slice(3) : d;
  });
  function authMessage(e, kind) {
    const m = String((e && (e.message || e.msg)) || '').toLowerCase();
    if (/phone.*(provider|unsupported|disabled)|unsupported phone|sms.*(disabled|not enabled)/.test(m)) return 'Sign-in by text isn\'t turned on yet. Choose Email above and use your email instead.';
    if (/signups? not allowed|signup.*disabled/.test(m)) return 'New accounts are closed right now. Join the waitlist on the home page and we will text you when your spot opens.';
    if (/rate|too many|security purposes/.test(m)) return 'Too many codes asked for. Wait a minute, then try again.';
    if (/expired|invalid|otp|token/.test(m) && kind === 'verify') return 'That code is wrong or has expired. Check the latest message, or ask for a new code.';
    if (/fetch|network|failed to fetch|load failed/.test(m)) return 'Trainee couldn\'t be reached. Check your connection and try again.';
    return kind === 'verify' ? 'That code didn\'t work. Ask for a new code and try again.' : 'The code wasn\'t sent. Try again in a minute.';
  }
  $('send-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('send-error'); err.textContent = '';
    for (const id of ['phone', 'email']) $(id).removeAttribute('aria-invalid');
    let target;
    if (method() === 'phone') {
      const p = phoneE164();
      if (p.error) { err.textContent = p.error; $('phone').setAttribute('aria-invalid', 'true'); $('phone').focus(); return; }
      target = { phone: p.value };
    } else {
      const e = $('email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { err.textContent = 'Enter your email, like name@example.com.'; $('email').setAttribute('aria-invalid', 'true'); $('email').focus(); return; }
      target = { email: e };
    }
    const key = target.phone || target.email.toLowerCase();
    const wait = sentAt(key) + COOLDOWN_MS - Date.now();
    if (wait > 0) { err.textContent = 'A code was just sent to that ' + (target.phone ? 'number' : 'address') + '. You can ask for a new one in ' + Math.ceil(wait / 1000) + ' seconds.'; return; }
    const btn = $('send-code'); btn.disabled = true; const label = btn.textContent; btn.textContent = 'Sending…';
    try {
      const { error } = await supa.auth.signInWithOtp(target.phone ? { phone: target.phone } : { email: target.email, options: { shouldCreateUser: true } });
      if (error) throw error;
      markSent(key);
      pending = target;
      $('send-form').hidden = true; $('verify-form').hidden = false;
      $('sent-to').textContent = target.phone ? 'We texted a code to ' + target.phone + '.' : 'We emailed a code to ' + target.email + '.';
      $('change').textContent = target.phone ? 'Use a different number' : 'Use a different email';
      $('code').value = ''; $('code').focus();
    } catch (e) {
      err.textContent = authMessage(e, 'send');
    } finally { btn.disabled = false; btn.textContent = label; }
  });
  $('change').addEventListener('click', () => { pending = null; $('verify-form').hidden = true; $('send-form').hidden = false; $('verify-error').textContent = ''; (method() === 'phone' ? $('phone') : $('email')).focus(); });
  $('code').addEventListener('input', () => { $('code').value = $('code').value.replace(/\D/g, '').slice(0, 6); });
  $('verify-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('verify-error'); err.textContent = ''; $('code').removeAttribute('aria-invalid');
    const token = $('code').value.trim();
    if (!/^\d{6}$/.test(token)) { err.textContent = 'Enter the 6 digits from the message.'; $('code').setAttribute('aria-invalid', 'true'); $('code').focus(); return; }
    if (!pending) { $('change').click(); return; }
    const btn = $('verify'); btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const { data, error } = await supa.auth.verifyOtp(pending.phone ? { phone: pending.phone, token, type: 'sms' } : { email: pending.email, token, type: 'email' });
      if (error) throw error;
      if (!data || !data.session) throw Error('no session');
      session = data.session; pending = null;
      await enter();
    } catch (e) {
      err.textContent = authMessage(e, 'verify'); $('code').setAttribute('aria-invalid', 'true'); $('code').focus();
    } finally { btn.disabled = false; btn.textContent = 'Sign in'; }
  });

  async function token() {
    const { data } = await supa.auth.getSession();
    session = data && data.session ? data.session : null;
    return session ? session.access_token : null;
  }
  async function chatFetch(body) {
    const t = await token();
    if (!t) { const e = Error('signed out'); e.status = 401; throw e; }
    let res;
    try {
      res = await fetch(C.backendUrl + '/functions/v1/agent-chat', { method: 'POST', headers: { 'content-type': 'application/json', apikey: C.anonKey, authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
    } catch (e) { const x = Error('network'); x.status = 0; throw x; }
    const data = await res.json().catch(() => null);
    if (!res.ok) { const x = Error((data && (data.reply || data.message || data.error)) || 'chat unavailable'); x.status = res.status; x.body = data; throw x; }
    if (!data || typeof data.reply !== 'string' && !data.access) { const x = Error('bad reply'); x.status = 502; throw x; }
    return data;
  }

  // After sign-in or on load with a session: ask whether this person may use Trainee yet, then open the chat.
  async function enter() {
    const g = ++generation;
    show('boot');
    $('boot').replaceChildren(); const p = document.createElement('p'); p.className = 'loading'; p.textContent = 'Checking your access'; $('boot').appendChild(p);
    try {
      await chatFetch(invite ? { check_access: true, invite } : { check_access: true });
      if (invite) { invite = null; ss.del(INVITE_KEY); $('invite-note').hidden = true; }
    } catch (e) {
      if (g !== generation) return;
      if (e.status === 401) return signedOut('Your session ended. Sign in again.');
      if (e.status === 403) {
        // The check answered: an invite it could not redeem (used, expired, not ours) is not kept or sent again.
        if (invite) { invite = null; ss.del(INVITE_KEY); $('invite-note').hidden = true; }
        $('waiting-text').textContent = e.message; $('waiting-error').textContent = ''; show('waiting', 'waiting-title'); return;
      }
      $('waiting-text').textContent = '';
      $('waiting-error').textContent = e.status === 0 ? 'Trainee couldn\'t be reached. Check your connection, then choose Check again.' : (e.message || 'We couldn\'t check your access just now.') ;
      show('waiting', 'waiting-title'); $('waiting-title').textContent = 'We couldn\'t open Trainee';
      return;
    }
    if (g !== generation) return;
    $('waiting-title').textContent = 'Your spot hasn\'t opened yet';
    await openThread(g);
    if (g !== generation) return;
    show('chat', 'message');
    refreshCount();
  }
  $('waiting-retry').addEventListener('click', () => enter());
  async function signOut() {
    generation++;
    try { await supa.auth.signOut(); } catch (e) { /* the local session is cleared either way */ }
    signedOut('');
  }
  function signedOut(msg) {
    session = null; thread = null; pending = null;
    $('log').replaceChildren(); $('chat-empty').hidden = false;
    $('send-form').hidden = false; $('verify-form').hidden = true;
    $('send-error').textContent = msg || '';
    show('signin', 'signin-title');
  }
  $('sign-out').addEventListener('click', signOut);
  $('waiting-out').addEventListener('click', signOut);

  /* ---------------- chat ---------------- */
  function linkify(el, text) {
    const re = /https:\/\/[^\s<>"')]+/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('a'); a.href = m[0]; a.textContent = m[0]; a.target = '_blank'; a.rel = 'noopener noreferrer';
      el.appendChild(a); last = m.index + m[0].length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }
  function bubble(role, text, cls) {
    const li = document.createElement('li');
    li.className = 'msg ' + (role === 'user' ? 'me' : 'trainee') + (cls ? ' ' + cls : '');
    const who = document.createElement('span'); who.className = 'sr'; who.textContent = role === 'user' ? 'You: ' : 'Trainee: ';
    li.appendChild(who);
    const body = document.createElement('span'); linkify(body, text); li.appendChild(body);
    $('log').appendChild(li);
    $('chat-empty').hidden = true;
    return li;
  }
  // The card under the reply that carries it. Once the card shows its own lines (read from the database and checked
  // against their hashes), the reply's text keeps only its first paragraph, so the answers are not listed twice.
  function mountCard(li, meta) {
    if (meta && meta.intent === 'career_message_approval') return mountMessageCard(li, meta);
    if (!window.TraineeApplyCard || !TraineeApplyCard.cardIdOf(meta)) return;
    const g = generation;
    TraineeApplyCard.mount(li, meta, { from: (t) => supa.from(t), rpc: (n, a) => supa.rpc(n, a), document, current: () => g === generation })
      .then((v) => {
        if (v && Array.isArray(v.items) && v.items.length && g === generation) {
          const body = li.querySelector(':scope > span:nth-child(2)');
          const head = body ? body.textContent.split(/\n\s*\n/)[0].trim() : '';
          if (body && head) body.textContent = head;
        }
        refreshCount();
      }).catch(() => { if (g === generation) { const p = document.createElement('p'); p.textContent = 'This card could not be shown. Nothing was approved.'; p.setAttribute('role', 'alert'); li.appendChild(p); } });
  }
  // The other card a reply can carry: an application approval bound to this thread (career_apply_message_cards), read
  // and approved through its own hash-bound RPCs by the same controller the dashboard uses (src/career-approval-card.js).
  function mountMessageCard(li, meta) {
    const id = meta.career_approval_card_id || meta.card_id;
    if (!window.TraineeApprovalCards || typeof id !== 'string' || !UUID.test(id)) return;
    const g = generation, uid = session && session.user && session.user.id, th = thread;
    const call = async (name, args) => { const { data, error } = await supa.rpc(name, args); if (error) throw error; return data; };
    const box = document.createElement('section'); box.className = 'career-apply-card'; li.appendChild(box);
    TraineeApprovalCards.createController({
      testUserId: '', identity: () => uid, thread: () => th,
      authenticate: async () => { const { data, error } = await supa.auth.getUser(); if (error || !data || !data.user) throw Error('Sign in again to review this approval.'); return data.user.id; },
      cloudEnabled: async () => (await call('career_apply_message_cloud_enabled_own')) === true,
      readCard: (cardId) => call('career_apply_message_card_read_own', { p_card: cardId }),
      approve: ({ card_id, card_hash }) => call('career_apply_message_card_approve_own', { p_card: card_id, p_hash: card_hash }),
      now: () => Date.now(), document, crypto: window.crypto,
    }).mount(box, id, { current: () => g === generation }).catch(() => {
      if (g !== generation) return;
      box.textContent = 'This approval could not be verified. Nothing was approved.'; box.setAttribute('role', 'alert');
    });
  }
  function scrollEnd() { const l = $('log').lastElementChild; if (l && l.scrollIntoView) l.scrollIntoView({ block: 'end' }); }

  // The person's thread: the one this browser used, if it is still theirs; else their thread with the newest message.
  async function openThread(g) {
    const uid = session && session.user && session.user.id;
    thread = null;
    $('log').replaceChildren(); $('chat-empty').hidden = false;
    if (!uid) return;
    try {
      let id = store.get(THREAD_KEY + uid);
      if (id && UUID.test(id)) {
        const own = await supa.from('agent_threads').select('id').eq('id', id).eq('user_id', uid).limit(1);
        if (own.error || !own.data || !own.data.length) id = null;
      } else id = null;
      if (!id) {
        const ts = await supa.from('agent_threads').select('id').eq('user_id', uid).limit(50);
        if (ts.error) throw ts.error;
        const ids = (ts.data || []).map((t) => t.id);
        if (ids.length) {
          const last = await supa.from('agent_messages').select('thread_id,id').in('thread_id', ids).order('id', { ascending: false }).limit(1);
          if (last.error) throw last.error;
          id = last.data && last.data[0] ? last.data[0].thread_id : null;
        }
      }
      if (!id || g !== generation) return;
      const ms = await supa.from('agent_messages').select('id,role,content,meta').eq('thread_id', id).order('id', { ascending: true }).limit(200);
      if (ms.error) throw ms.error;
      if (g !== generation) return;
      thread = id; store.set(THREAD_KEY + uid, id);
      for (const m of ms.data || []) {
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        const li = bubble(m.role, String(m.content || ''));
        if (m.role === 'assistant') mountCard(li, m.meta);
      }
      scrollEnd();
    } catch (e) {
      const p = bubble('assistant', 'Your earlier messages could not be loaded. New messages still work.', 'failed');
      p.setAttribute('role', 'alert');
    }
  }

  // What is added with "Add resume": a text file is read here and sent as the message; any other file (PDF, Word, RTF)
  // is sent whole as `resume_file` and read by the server (FEATURE 16, career_resume_intake.ts), which answers what it
  // could read or exactly why it could not. Nothing is cut here.
  let attachment = null; // { name, text } or { name, file: { data, name, mime, sha256 } }
  let sending = false;
  const newKey = () => 'web_' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9_-]/g, '');
  async function send(text, key, failedLi, file) {
    if (sending) return;
    sending = true;
    const g = generation;
    $('composer-error').textContent = '';
    $('send').disabled = true; $('send').textContent = 'Sending…';
    const mine = failedLi || bubble('user', file ? (text ? text + '\n' : '') + 'Resume: ' + file.name : text);
    if (failedLi) { failedLi.classList.remove('failed'); const why = failedLi.querySelector('.why'); if (why) why.remove(); const r = failedLi.querySelector('.retry'); if (r) r.remove(); }
    const wait = bubble('assistant', file ? 'Trainee is reading your resume…' : 'Trainee is writing…', 'pending');
    wait.setAttribute('aria-busy', 'true');
    scrollEnd();
    try {
      const r = await chatFetch({ message: text, thread_id: thread, turn_key: key, ...(file ? { resume_file: file } : {}) });
      if (g !== generation) return;
      wait.remove();
      if (UUID.test(String(r.thread_id || ''))) { thread = r.thread_id; store.set(THREAD_KEY + session.user.id, thread); }
      const li = bubble('assistant', r.reply);
      mountCard(li, r.meta);
      scrollEnd();
      refreshCount();
    } catch (e) {
      if (g !== generation) return;
      wait.remove();
      if (e.status === 401) { signedOut('Your session ended. Sign in again.'); return; }
      if (e.status === 403) { $('waiting-text').textContent = e.message; show('waiting', 'waiting-title'); return; }
      mine.classList.add('failed');
      const why = document.createElement('span'); why.className = 'why';
      // A network failure can lose the answer after the turn ran, so it never says the message was not sent; the retry
      // carries the same turn key, so it is the same turn either way. A refusal shows the server's own words.
      const said = e.body && typeof e.body.reply === 'string' && e.body.reply.trim() ? e.body.reply.trim() : null;
      why.textContent = e.status === 0 ? 'No answer arrived: Trainee couldn\'t be reached. Check your connection, then try again.'
        : e.status === 429 ? 'Not sent: ' + e.message
        : e.status === 400 ? 'Not sent: ' + (said || (e.body && e.body.error === 'message too long' ? 'this message is too long for one message. Send it in parts.' : e.body && e.body.error === 'message required' && file ? 'Trainee couldn\'t read that file here. Paste the resume text instead.' : 'Trainee couldn\'t read this message.'))
        : 'Not sent: ' + (said || 'Trainee couldn\'t answer just now.');
      mine.appendChild(why);
      if (e.status !== 400) {
        const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'retry'; retry.textContent = 'Try again';
        retry.addEventListener('click', () => send(text, key, mine, file)); // the same turn key: a retry is the same turn, never a second one
        mine.appendChild(retry);
      }
    } finally {
      sending = false;
      $('send').disabled = false; $('send').textContent = 'Send';
    }
  }
  $('composer').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (sending) return;
    const typed = $('message').value.trim();
    let text = typed, file = null;
    if (attachment && attachment.file) file = attachment.file;
    else if (attachment) text = (typed ? typed + '\n\n' : 'Here is my resume:\n') + attachment.text;
    if (!text && !file) { $('composer-error').textContent = 'Type a message or add your resume first.'; $('message').focus(); return; }
    if (text.length > MAX_CHARS) { $('composer-error').textContent = 'This message has ' + text.length.toLocaleString('en-US') + ' characters, more than Trainee reads at once (' + MAX_CHARS.toLocaleString('en-US') + '). Send it in parts.'; $('message').focus(); return; }
    $('message').value = ''; autosize();
    clearAttachment();
    send(text, newKey(), undefined, file);
  });
  $('message').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && window.matchMedia && window.matchMedia('(pointer: fine)').matches) { ev.preventDefault(); $('composer').requestSubmit(); }
  });
  function autosize() { const t = $('message'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, window.innerHeight * 0.4) + 'px'; }
  $('message').addEventListener('input', autosize);
  $('starts').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-say]'); if (b) send(b.dataset.say, newKey()); });

  // The most agent-chat takes in one message: a resume pasted whole (FEATURE 16 reads one up to 19,000 characters, plus
  // the words around it); the server says if a message is too long for what it is. Files up to 10 MB, as the server reads.
  const MAX_CHARS = 19400, MAX_FILE = 10 * 1024 * 1024;
  function clearAttachment() { attachment = null; $('attached').hidden = true; $('file').value = ''; }
  $('attached-remove').addEventListener('click', () => { clearAttachment(); $('file').focus(); });
  const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
  $('file').addEventListener('change', async () => {
    const f = $('file').files && $('file').files[0];
    $('composer-error').textContent = '';
    if (!f) return;
    const name = f.name || 'file';
    if (f.size > MAX_FILE) { clearAttachment(); $('composer-error').textContent = 'That file is ' + (f.size / (1024 * 1024)).toFixed(1) + ' MB. Trainee reads resume files up to 10 MB.'; return; }
    if (!f.size) { clearAttachment(); $('composer-error').textContent = 'That file is empty.'; return; }
    const textFile = /\.(txt|md)$/i.test(name) || /^text\/(plain|markdown)$/.test(f.type || '');
    try {
      if (textFile) {
        const text = (await f.text()).trim();
        if (!text) { clearAttachment(); $('composer-error').textContent = 'That file is empty.'; return; }
        attachment = { name, text };
      } else {
        const buf = await f.arrayBuffer();
        const sha = crypto.subtle ? hex(await crypto.subtle.digest('SHA-256', buf)) : null;
        attachment = { name, file: { data: b64(buf), name, mime: f.type || null, ...(sha ? { sha256: sha } : {}) } };
      }
    } catch (e) { clearAttachment(); $('composer-error').textContent = 'That file could not be opened in this browser.'; return; }
    $('attached-name').textContent = 'Resume added: ' + name;
    $('attached').hidden = false;
    $('message').focus();
  });

  /* ---------------- tabs ---------------- */
  function tabTo(name) { show(name, name === 'chat' ? 'message' : null); if (name === 'apps') renderApps(); }
  $('tab-chat').addEventListener('click', () => tabTo('chat'));
  $('tab-apps').addEventListener('click', () => tabTo('apps'));
  $('tabs').addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    const next = view === 'chat' ? 'apps' : 'chat';
    tabTo(next); $(next === 'chat' ? 'tab-chat' : 'tab-apps').focus();
  });

  /* ---------------- applications ---------------- */
  async function openCard(uid) {
    const r = await supa.from('career_apply_cards').select('id,items,state,shown_at').eq('user_id', uid).eq('state', 'open').order('shown_at', { ascending: false }).limit(1);
    if (r.error) throw r.error;
    return r.data && r.data[0] ? r.data[0] : null;
  }
  async function readyCount(uid) {
    const r = await supa.from('career_apply_prepared').select('id').eq('user_id', uid).in('state', ['ready', 'shown']).limit(50);
    if (r.error) throw r.error;
    return (r.data || []).length;
  }
  async function refreshCount() {
    const uid = session && session.user && session.user.id;
    if (!uid) return;
    try {
      const card = await openCard(uid);
      const n = card ? null : await readyCount(uid);
      const badge = $('apps-count');
      const waiting = card && Array.isArray(card.items) ? card.items.length : 0;
      const label = waiting ? String(waiting) : n ? String(n) : '';
      badge.textContent = label; badge.hidden = !label;
      $('tab-apps').setAttribute('aria-label', label ? 'Applications, ' + label + (waiting ? ' waiting for your approval' : ' ready for review') : 'Applications');
    } catch (e) { /* the count is a hint; the view itself says what could not be read */ }
  }
  // The chat's card answers only within 10 minutes of being shown (career_apply_card_answer_for, card_stale), so an
  // older open card is not offered for a tap here: the person asks for a fresh one.
  const CARD_FRESH_MS = 10 * 60 * 1000;
  function mountApplyCard(g) {
    return async (slot, card) => {
      const shown = Date.parse(card.shown_at);
      if (!(Date.now() - shown < CARD_FRESH_MS)) {
        const p = document.createElement('div'); p.className = 'empty-card';
        const t = document.createElement('p'); t.style.margin = '0';
        t.textContent = card.items.length + (card.items.length === 1 ? ' application waits' : ' applications wait') + ' for your approval. Its card was shown more than 10 minutes ago, so ask for a fresh one to approve.';
        const b = document.createElement('button'); b.type = 'button'; b.className = 'primary'; b.style.marginTop = '12px'; b.textContent = 'Show a fresh card';
        b.addEventListener('click', () => { tabTo('chat'); send('show my applications', newKey()); });
        p.append(t, b); slot.appendChild(p);
        return;
      }
      await TraineeApplyCard.mount(slot, { intent: TraineeApplyCard.INTENT, card_id: card.id }, { from: (t) => supa.from(t), rpc: (n, a) => supa.rpc(n, a), document, current: () => g === generation && view === 'apps' });
    };
  }
  async function renderApps() {
    const uid = session && session.user && session.user.id;
    if (!uid || !window.TraineeDashboard) return;
    const g = generation;
    const dash = $('dashboard');
    dash.replaceChildren();
    const dl = document.createElement('p'); dl.className = 'loading'; dl.textContent = 'Loading your applications'; dash.appendChild(dl);
    dash.setAttribute('aria-busy', 'true');
    let data;
    try { data = await TraineeDashboard.load(supa, uid); }
    catch (e) {
      if (g === generation && view === 'apps') { dash.removeAttribute('aria-busy'); dash.replaceChildren(errorBlock('Your applications could not be loaded. Nothing was approved or sent.', renderApps)); }
      return;
    }
    if (g !== generation || view !== 'apps') return;
    dash.removeAttribute('aria-busy');
    dash.replaceChildren();
    TraineeDashboard.mount(dash, data, {
      now: () => Date.now(),
      draft: (text) => { tabTo('chat'); $('message').value = text; autosize(); $('message').focus(); },
      mountApplyCard: mountApplyCard(g),
      mountCard: window.TraineeApprovalCards ? TraineeDashboard.cardMounter({
        testUserId: '', identity: () => (session && session.user ? session.user.id : null), current: () => g === generation,
        authenticate: async () => { const { data: d, error } = await supa.auth.getUser(); if (error || !d || !d.user) throw Error('Sign in again to review this approval.'); return d.user.id; },
        rpc: (n, a) => supa.rpc(n, a), now: () => Date.now(), crypto: window.crypto,
      }) : null,
      // No send: in this app the chat is where a person sets up (resume, target roles), so the dashboard's own setup
      // form is not shown here.
      onDone: () => { if (view === 'apps') renderApps(); },
    });
    refreshCount();
  }
  function errorBlock(text, retry) {
    const d = document.createElement('div'); d.setAttribute('role', 'alert');
    const p = document.createElement('p'); p.className = 'error'; p.textContent = text; d.appendChild(p);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'secondary'; b.textContent = 'Try again'; b.style.marginTop = '10px';
    b.addEventListener('click', retry); d.appendChild(b);
    return d;
  }

  /* ---------------- start ---------------- */
  supa.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT' && view !== 'signin') signedOut('You were signed out. Sign in again.'); });
  (async () => {
    syncMethod();
    try {
      const { data } = await supa.auth.getSession();
      session = data && data.session ? data.session : null;
    } catch (e) { session = null; }
    $('invite-note').hidden = !invite;
    if (session) await enter(); else show('signin');
  })();
})();
