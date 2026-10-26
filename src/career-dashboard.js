/* Trainee web dashboard (FEATURE 15, 2026-10-25): matches, queue, tracker, approval cards and first-run setup in one view.
   Built from the unmerged lanes muse/2026-10-22-f1-dashboard, -f2-approval-card, -f3-onboarding and the 2026-10-23
   integration, brought onto one module and one build (src/build-app.py).
   What it reads, all through the signed-in person's own row-level security (no service role, no mock rows):
     career_outbox (kind alert)       -> the matches feed; the posting itself from career_postings
     career_alert_prefs               -> the person's target roles and places, the basis of every fit verdict
     career_apply_message_cards       -> approval cards (awaiting / approved)
     career_apply_prepared            -> applications Trainee prepared and checked (reviewed)
     career_apply_jobs                -> the tracker: every application with its recorded state and receipt
   What it writes: nothing directly. Approving a card goes through TraineeApprovalCards (src/career-approval-card.js),
   the same controller and the same hash-bound RPC (career_apply_message_card_approve_own) the chat card uses. Changing an
   answer, leaving an application off or declining a batch opens the chat with a draft the person sends themselves.
   Setup sends the person's own words to the chat (the live handler files the resume and the watch) and saves their
   name on their profile. Every partial count is shown as a fraction with the reason for what is missing. */
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TraineeDashboard = api;
})(globalThis, function () {
  'use strict';

  // The career_apply_jobs state vocabulary, in the order of its check constraint
  // (supabase/migrations/20261020000001_career_apply_jobs.sql). A test pins the two equal.
  const APPLY_STATES = Object.freeze([
    { state: 'queued', label: 'Queued to send' },
    { state: 'driving', label: 'Applying now' },
    { state: 'confirmed', label: 'Confirmed by the employer' },
    { state: 'submitted_unconfirmed', label: 'Sent, waiting for the employer’s confirmation' },
    { state: 'needs_user', label: 'Needs you' },
    { state: 'failed', label: 'Failed' },
    { state: 'not_submitted', label: 'Not submitted' },
    { state: 'unknown_outcome', label: 'Outcome unknown' },
  ]);
  const STATE_LABELS = Object.freeze(Object.fromEntries(APPLY_STATES.map(s => [s.state, s.label])));
  const PROVIDERS = Object.freeze({ greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', smartrecruiters: 'SmartRecruiters' });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const isRecord = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : NaN; };
  const frac = (n, d) => n + '/' + d;
  const byNewest = key => (a, b) => str(b[key]).localeCompare(str(a[key]));

  /* ---------------- fit verdicts ---------------- */
  // A verdict says only what the records say: which of the person's own target words the posting's title carries and
  // whether its place is one they named. No score, no model, no guess.
  function fitVerdict(posting, prefs) {
    const title = str(posting && posting.title).toLowerCase();
    const location = str(posting && posting.location);
    const keywords = isRecord(prefs) && Array.isArray(prefs.keywords) ? prefs.keywords.map(str).filter(Boolean) : [];
    if (!keywords.length) return Object.freeze({ verdict: 'unchecked', label: 'Not checked: no target roles on file', reasons: Object.freeze([]) });
    const reasons = [];
    const hits = keywords.filter(k => title.includes(k.toLowerCase()));
    for (const k of hits) reasons.push('Title names “' + k + '”, one of your target roles');
    const places = Array.isArray(prefs.locations) ? prefs.locations.map(str).filter(Boolean) : [];
    const place = places.find(l => location.toLowerCase().includes(l.toLowerCase()));
    const remote = prefs.remote_ok === true && (posting.remote === 'remote' || /\bremote\b/i.test(location));
    if (place) reasons.push('Location ' + location + ' is in your list (' + place + ')');
    else if (remote) reasons.push('Remote, and you said remote is fine');
    else if (places.length) reasons.push('Location ' + (location || 'not stated') + ' is not one you listed (' + places.join(', ') + ')');
    if (!hits.length) reasons.unshift('Title names none of your target roles (' + keywords.join(', ') + ')');
    const placeOk = !places.length || !!place || remote;
    const verdict = hits.length && placeOk ? 'fits' : hits.length ? 'partial' : 'weak';
    const label = verdict === 'fits' ? 'Fits your targets' : verdict === 'partial' ? 'Role fits, place does not' : 'Weak fit';
    return Object.freeze({ verdict, label, reasons: Object.freeze(reasons) });
  }

  function providerOf(jobId) {
    const p = str(jobId).split(':')[0];
    return Object.hasOwn(PROVIDERS, p) ? p : null;
  }

  // Matches: every alert Trainee queued for this person, newest first, joined to its posting. An alert whose posting is
  // no longer on file is kept in the count and named, never dropped silently.
  function matchesView(alerts, postings, prefs, jobs) {
    const byId = new Map((postings || []).map(p => [p.job_id, p]));
    const applied = new Map((jobs || []).map(j => [j.job_id, j]));
    const rows = [], missing = [];
    const seen = new Set();
    for (const a of (alerts || []).slice().sort(byNewest('created_at'))) {
      const key = str(a.key);
      if (!key.startsWith('alert:')) continue;
      const jobId = key.slice(6);
      if (seen.has(jobId)) continue; seen.add(jobId);
      const posting = byId.get(jobId);
      if (!posting) { missing.push(Object.freeze({ job_id: jobId, reason: 'The posting is no longer on file' })); continue; }
      const job = applied.get(jobId);
      rows.push(Object.freeze({
        job_id: jobId, title: str(posting.title), company: str(posting.company), location: str(posting.location),
        url: str(posting.url), provider: providerOf(jobId), closed: !!posting.closed_at, matched_at: str(a.created_at),
        fit: fitVerdict(posting, prefs), applied: job ? STATE_LABELS[job.state] || null : null,
      }));
    }
    const checked = rows.filter(r => r.fit.verdict !== 'unchecked').length;
    return Object.freeze({
      rows: Object.freeze(rows), missing: Object.freeze(missing),
      coverage: Object.freeze({ onFile: frac(rows.length, rows.length + missing.length), fitChecked: frac(checked, rows.length) }),
    });
  }

  /* ---------------- approval cards ---------------- */
  // One application on a card, read for display only. The approval itself re-reads and re-verifies the card through
  // TraineeApprovalCards; nothing here is trusted for the tap.
  function cardItems(card) {
    const p = isRecord(card) && isRecord(card.payload) ? card.payload : {};
    const items = Array.isArray(p.items) ? p.items : [];
    return items.map(item => {
      if (p.version === 2 && isRecord(item.payload)) {
        const fields = Array.isArray(item.payload.fields) ? item.payload.fields : [];
        const blank = isRecord(item.readback) && Array.isArray(item.readback.blank) ? item.readback.blank.map(str) : [];
        return {
          job_id: str(item.payload.job_id), company: str(item.payload.company), url: str(item.payload.url),
          fields: fields.map(f => ({ name: str(f.name), label: str(f.label), verified: !!(f.confirmation_event_id || (isRecord(f.provenance) && Object.keys(f.provenance).length)) })),
          blank,
        };
      }
      const e = isRecord(item.entry) ? item.entry : {};
      const answers = Array.isArray(e.answers) ? e.answers : [];
      const ledger = Array.isArray(e.ledger) ? e.ledger : [];
      return {
        job_id: str(e.jobId), company: str(e.company), url: str(e.url),
        fields: answers.map(a => {
          const row = ledger.find(l => isRecord(l) && l.field_id === a.name);
          return { name: str(a.name), label: str(a.label), verified: !!(row && row.confirmation_event_id && Array.isArray(row.fact_refs) && row.fact_refs.length) };
        }),
        blank: Array.isArray(e.blank) ? e.blank.map(str) : [],
      };
    });
  }

  function cardState(card, now) {
    if (card.approved_at) return 'approved';
    if (ms(card.expires_at) <= now) return 'expired';
    return 'open';
  }

  // Queue: awaiting your approval (open cards), approved (approved cards and applications waiting to send), reviewed
  // (applications Trainee prepared and checked that are not on an open card).
  function queueView(cards, prepared, jobs, now) {
    const awaiting = [], approved = [], expired = [];
    for (const c of (cards || []).slice().sort(byNewest('shown_at'))) {
      const s = cardState(c, now);
      const items = cardItems(c);
      const fields = items.flatMap(i => i.fields);
      const row = Object.freeze({ card: c, items, verified: frac(fields.filter(f => f.verified).length, fields.length), state: s });
      (s === 'open' ? awaiting : s === 'approved' ? approved : expired).push(row);
    }
    const onCard = new Set(awaiting.flatMap(r => r.items.map(i => i.job_id)));
    const reviewed = (prepared || []).filter(p => ['ready', 'shown'].includes(p.state) && !onCard.has(p.job_id)).sort(byNewest('updated_at'));
    const sending = (jobs || []).filter(j => j.state === 'queued' || j.state === 'driving').sort(byNewest('updated_at'));
    return Object.freeze({ awaiting, approved, expired, reviewed, sending });
  }

  /* ---------------- tracker ---------------- */
  // A receipt exists only where the employer's confirmation email confirmed the row (career_apply_receipts.ts and
  // migration 20261021075000): state confirmed and email_confirmed_at set. Fields are the row's own, verbatim.
  function receiptFor(row) {
    if (!isRecord(row) || row.state !== 'confirmed' || !str(row.email_confirmed_at)) return null;
    return Object.freeze({
      company: str(row.company), job_id: str(row.job_id),
      confirmation_number: str(row.confirmation_id) || null,
      payload_hash: str(row.payload_hash), confirmed_at: str(row.email_confirmed_at),
    });
  }

  function trackerView(jobs) {
    const order = s => APPLY_STATES.findIndex(x => x.state === s.state);
    const rows = (jobs || []).map(row => {
      if (!isRecord(row) || !Object.hasOwn(STATE_LABELS, row.state)) throw Error('unknown apply state: ' + (isRecord(row) ? str(row.state) : typeof row));
      return row;
    }).slice().sort((a, b) => order(a) - order(b) || byNewest('updated_at')(a, b)).map(row => Object.freeze({
      id: row.id, job_id: str(row.job_id), company: str(row.company), url: str(row.url), state: row.state,
      label: STATE_LABELS[row.state], reason: str(row.reason) || null, updated_at: str(row.updated_at), receipt: receiptFor(row),
    }));
    const confirmed = rows.filter(r => r.receipt).length;
    return Object.freeze({ rows: Object.freeze(rows), coverage: Object.freeze({ confirmed: frac(confirmed, rows.length) }) });
  }

  /* ---------------- loading (supabase-js client, the person's own session) ---------------- */
  async function load(client, uid) {
    if (!client || !UUID.test(str(uid))) throw Error('sign in first');
    const must = r => { if (r.error) throw r.error; return r.data || []; };
    const [alerts, prefs, cards, prepared, jobs] = await Promise.all([
      client.from('career_outbox').select('key,created_at,delivered_at').eq('user_id', uid).eq('kind', 'alert').order('created_at', { ascending: false }).limit(100),
      client.from('career_alert_prefs').select('prefs').eq('user_id', uid).limit(1),
      client.from('career_apply_message_cards').select('id,thread_id,payload,payload_hash,shown_at,expires_at,approved_at,approval_expires_at').eq('user_id', uid).order('shown_at', { ascending: false }).limit(50),
      client.from('career_apply_prepared').select('id,job_id,company,url,payload_hash,card_lines,state,created_at,updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(100),
      client.from('career_apply_jobs').select('id,job_id,company,url,payload_hash,state,reason,confirmation_id,claimed_at,created_at,updated_at,email_confirmed_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(200),
    ]);
    const alertRows = must(alerts), cardRows = must(cards);
    const ids = new Set(alertRows.map(a => str(a.key)).filter(k => k.startsWith('alert:')).map(k => k.slice(6)));
    for (const c of cardRows) for (const i of cardItems(c)) if (i.job_id) ids.add(i.job_id);
    const postings = ids.size
      ? must(await client.from('career_postings').select('job_id,company,title,location,url,remote,closed_at').in('job_id', [...ids]))
      : [];
    const prefRows = must(prefs);
    return { alerts: alertRows, prefs: prefRows.length && isRecord(prefRows[0].prefs) ? prefRows[0].prefs : null, cards: cardRows, prepared: must(prepared), jobs: must(jobs), postings };
  }

  /* ---------------- approval: the chat card's controller and RPCs ---------------- */
  // The RPC names and arguments are the chat card's (src/upmore-app-template.html, careerApprovalCards); a test pins
  // them equal. Each card is bound to its own thread, so the controller's owner/thread/hash checks apply unchanged.
  const RPC = Object.freeze({
    cloudEnabled: 'career_apply_message_cloud_enabled_own',
    read: 'career_apply_message_card_read_own',
    approve: 'career_apply_message_card_approve_own',
  });
  function cardMounter(o) {
    const Cards = o.Cards || (typeof TraineeApprovalCards === 'object' ? TraineeApprovalCards : null);
    if (!Cards || typeof o.rpc !== 'function') throw Error('unavailable');
    const call = async (name, args) => { const { data, error } = await o.rpc(name, args); if (error) throw error; return data; };
    return function mountCard(slot, card) {
      const controller = Cards.createController({
        testUserId: o.testUserId || '',
        identity: o.identity,
        thread: () => card.thread_id,
        authenticate: o.authenticate,
        cloudEnabled: async () => (await call(RPC.cloudEnabled)) === true,
        readCard: cardId => call(RPC.read, { p_card: cardId }),
        approve: ({ card_id, card_hash }) => call(RPC.approve, { p_card: card_id, p_hash: card_hash }),
        now: o.now || Date.now, document: slot.ownerDocument, crypto: o.crypto || globalThis.crypto,
      });
      return controller.mount(slot, card.id, { current: o.current || (() => true) });
    };
  }

  /* ---------------- DOM (record text through textContent only) ---------------- */
  function h(doc, tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function link(doc, href, text) {
    const a = h(doc, 'a', 'tr-link', text);
    if (/^https:\/\//.test(href)) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function providerMark(doc, provider, icons, prefix = 'via ') {
    if (!provider) return null;
    const wrap = h(doc, 'span', 'tr-via');
    const icon = (icons || []).find(b => b.slug === provider);
    if (icon) { const img = h(doc, 'img', 'tr-via-logo'); img.src = icon.file; img.alt = ''; img.width = 14; img.height = 14; wrap.appendChild(img); }
    wrap.appendChild(doc.createTextNode(prefix + PROVIDERS[provider]));
    return wrap;
  }
  function pill(doc, cls, text, attr) {
    const p = h(doc, 'span', 'tr-pill ' + cls, text);
    if (attr) p.setAttribute(attr[0], attr[1]);
    return p;
  }

  function renderMatches(doc, view, deps) {
    const sec = h(doc, 'section', 'tr-surface');
    sec.setAttribute('data-tr-surface', 'matches');
    const cov = h(doc, 'p', 'tr-coverage');
    cov.setAttribute('data-tr-coverage', 'matches');
    cov.textContent = 'Postings on file ' + view.coverage.onFile + ' · Fit checked ' + view.coverage.fitChecked;
    sec.appendChild(cov);
    if (!view.rows.length && !view.missing.length) sec.appendChild(h(doc, 'p', 'tr-empty', 'No matches yet. New postings that fit your watch appear here as Trainee finds them.'));
    for (const m of view.rows) {
      const card = h(doc, 'article', 'tr-item');
      card.setAttribute('data-tr-match', m.job_id);
      const top = h(doc, 'div', 'tr-row');
      top.appendChild(h(doc, 'h3', 'tr-title', m.title));
      top.appendChild(pill(doc, 'tr-fit-' + m.fit.verdict, m.fit.label, ['data-tr-fit', m.fit.verdict]));
      card.appendChild(top);
      const meta = h(doc, 'p', 'tr-meta', m.company + (m.location ? ' · ' + m.location : ''));
      card.appendChild(meta);
      if (m.fit.reasons.length) {
        const ul = h(doc, 'ul', 'tr-reasons');
        for (const r of m.fit.reasons) ul.appendChild(h(doc, 'li', '', r));
        card.appendChild(ul);
      }
      const foot = h(doc, 'div', 'tr-row tr-foot');
      const via = providerMark(doc, m.provider, deps.brandIcons);
      if (via) foot.appendChild(via);
      if (m.closed) foot.appendChild(pill(doc, 'tr-muted', 'Closed'));
      if (m.applied) foot.appendChild(pill(doc, 'tr-muted', m.applied));
      foot.appendChild(link(doc, m.url, 'Posting'));
      card.appendChild(foot);
      sec.appendChild(card);
    }
    for (const x of view.missing) {
      const n = h(doc, 'p', 'tr-dropped', x.job_id + ': ' + x.reason);
      n.setAttribute('data-tr-missing', x.job_id);
      sec.appendChild(n);
    }
    return sec;
  }

  function fieldSummary(doc, item) {
    const box = h(doc, 'div', 'tr-verify');
    const unverified = item.fields.filter(f => !f.verified);
    const line = h(doc, 'p', unverified.length ? 'tr-alert' : 'tr-ok',
      'Answers backed by your confirmed facts: ' + frac(item.fields.length - unverified.length, item.fields.length));
    line.setAttribute('data-tr-verified', frac(item.fields.length - unverified.length, item.fields.length));
    box.appendChild(line);
    if (unverified.length) {
      const warn = h(doc, 'div', 'tr-loud');
      warn.setAttribute('role', 'alert');
      warn.setAttribute('data-tr-unverified', unverified.map(f => f.name).join(','));
      warn.appendChild(h(doc, 'strong', '', 'Check before approving: ' + unverified.length + (unverified.length === 1 ? ' answer has' : ' answers have') + ' no confirmed fact behind it'));
      const ul = h(doc, 'ul', '');
      for (const f of unverified) ul.appendChild(h(doc, 'li', '', f.label + ' [' + f.name + ']'));
      warn.appendChild(ul);
      box.appendChild(warn);
    }
    if (item.blank.length) {
      const b = h(doc, 'p', 'tr-alert', 'Left blank: ' + item.blank.join('; '));
      b.setAttribute('data-tr-blank', item.blank.join(','));
      box.appendChild(b);
    }
    return box;
  }

  function renderApprovalCard(doc, row, data, deps) {
    const { card, items } = row;
    const wrap = h(doc, 'article', 'tr-approval');
    wrap.setAttribute('data-tr-card', card.id);
    const head = h(doc, 'div', 'tr-row');
    head.appendChild(h(doc, 'h3', 'tr-title', items.length === 1 ? items[0].company : items.length + ' applications'));
    head.appendChild(pill(doc, 'tr-accent', 'Awaiting your approval'));
    wrap.appendChild(head);
    wrap.appendChild(h(doc, 'p', 'tr-meta', 'Expires ' + str(card.expires_at) + '. If you do nothing, nothing is sent.'));
    const postings = new Map((data.postings || []).map(p => [p.job_id, p]));
    for (const item of items) {
      const app = h(doc, 'section', 'tr-app');
      app.setAttribute('data-tr-card-item', item.job_id);
      const posting = postings.get(item.job_id);
      app.appendChild(h(doc, 'h4', 'tr-sub', (posting ? str(posting.title) + ' at ' : '') + item.company));
      const fit = posting ? fitVerdict(posting, data.prefs) : null;
      const why = h(doc, 'div', 'tr-why');
      why.setAttribute('data-tr-why', item.job_id);
      if (fit && fit.reasons.length) {
        why.appendChild(h(doc, 'p', 'tr-meta', 'Why it matched: ' + fit.label));
        const ul = h(doc, 'ul', 'tr-reasons');
        for (const r of fit.reasons) ul.appendChild(h(doc, 'li', '', r));
        why.appendChild(ul);
      } else why.appendChild(h(doc, 'p', 'tr-meta', posting ? 'Why it matched: not checked, no target roles on file.' : 'Why it matched: the posting is not on file, so there is no match reasoning to show.'));
      app.appendChild(why);
      app.appendChild(fieldSummary(doc, item));
      const actions = h(doc, 'div', 'tr-actions');
      const edit = h(doc, 'button', 'tr-btn tr-quiet', 'Change an answer');
      edit.type = 'button';
      edit.setAttribute('data-tr-action', 'edit');
      edit.onclick = () => deps.draft && deps.draft('For ' + item.company + ' (' + item.job_id + '), change my answer to "<question>" to: ', card.thread_id);
      const off = h(doc, 'button', 'tr-btn tr-quiet', 'Leave this one off');
      off.type = 'button';
      off.setAttribute('data-tr-action', 'reject-one');
      off.onclick = () => deps.draft && deps.draft('Leave ' + item.company + ' (' + item.job_id + ') off this batch. Don’t apply there.', card.thread_id);
      actions.append(edit, off);
      app.appendChild(actions);
      wrap.appendChild(app);
    }
    // The exact, hash-bound card. Approval of the whole batch happens only inside this controller.
    const slot = h(doc, 'div', 'tr-card-slot');
    slot.setAttribute('data-tr-card-slot', card.id);
    wrap.appendChild(slot);
    const batch = h(doc, 'div', 'tr-actions');
    const decline = h(doc, 'button', 'tr-btn tr-quiet', 'Decline the whole batch');
    decline.type = 'button';
    decline.setAttribute('data-tr-action', 'reject-all');
    decline.onclick = () => deps.draft && deps.draft('No. Don’t send any of the applications on this card.', card.thread_id);
    batch.appendChild(decline);
    wrap.appendChild(batch);
    wrap.appendChild(h(doc, 'p', 'tr-note', 'Changing an answer, leaving one off or declining opens your chat with a draft. Nothing is approved or sent until you send it, and a changed answer comes back as a new card.'));
    return { node: wrap, slot };
  }

  function renderQueue(doc, view, data, deps, mounts) {
    const sec = h(doc, 'section', 'tr-surface');
    sec.setAttribute('data-tr-surface', 'queue');
    const cov = h(doc, 'p', 'tr-coverage');
    cov.textContent = 'Awaiting your approval ' + view.awaiting.length + ' · Approved ' + (view.approved.length + view.sending.length) + ' · Reviewed ' + view.reviewed.length;
    sec.appendChild(cov);
    const group = (title, key) => { const g = h(doc, 'div', 'tr-group'); g.setAttribute('data-tr-queue', key); g.appendChild(h(doc, 'h2', 'tr-h2', title)); sec.appendChild(g); return g; };
    const aw = group('Awaiting your approval', 'awaiting');
    if (!view.awaiting.length) aw.appendChild(h(doc, 'p', 'tr-empty', 'Nothing is waiting for you.'));
    for (const row of view.awaiting) {
      const { node, slot } = renderApprovalCard(doc, row, data, deps);
      aw.appendChild(node);
      mounts.push({ slot, card: row.card });
    }
    const ap = group('Approved', 'approved');
    if (!view.approved.length && !view.sending.length) ap.appendChild(h(doc, 'p', 'tr-empty', 'No approved applications yet.'));
    for (const row of view.approved) {
      const n = h(doc, 'article', 'tr-item');
      n.setAttribute('data-tr-approved-card', row.card.id);
      n.appendChild(h(doc, 'h3', 'tr-title', row.items.map(i => i.company).join(', ')));
      n.appendChild(h(doc, 'p', 'tr-meta', 'You approved these exact answers at ' + str(row.card.approved_at) + '. Permission ends ' + str(row.card.approval_expires_at) + '.'));
      ap.appendChild(n);
    }
    for (const j of view.sending) {
      const n = h(doc, 'article', 'tr-item');
      n.setAttribute('data-tr-sending', j.id);
      const top = h(doc, 'div', 'tr-row');
      top.appendChild(h(doc, 'h3', 'tr-title', str(j.company)));
      top.appendChild(pill(doc, j.state === 'driving' ? 'tr-accent' : 'tr-muted', STATE_LABELS[j.state]));
      n.append(top, h(doc, 'p', 'tr-meta', str(j.job_id)));
      ap.appendChild(n);
    }
    const rv = group('Reviewed by Trainee', 'reviewed');
    if (!view.reviewed.length) rv.appendChild(h(doc, 'p', 'tr-empty', 'No prepared applications outside a card.'));
    for (const p of view.reviewed) {
      const n = h(doc, 'article', 'tr-item');
      n.setAttribute('data-tr-reviewed', p.id);
      n.appendChild(h(doc, 'h3', 'tr-title', str(p.company)));
      const lines = Array.isArray(p.card_lines) ? p.card_lines : [];
      if (lines.length) { const ul = h(doc, 'ul', 'tr-reasons'); for (const l of lines) ul.appendChild(h(doc, 'li', '', str(l))); n.appendChild(ul); }
      n.appendChild(h(doc, 'p', 'tr-meta', 'Prepared and checked. Ask in chat to put it on a card for your approval.'));
      rv.appendChild(n);
    }
    if (view.expired.length) {
      const ex = group('Expired without approval', 'expired');
      for (const row of view.expired) {
        const n = h(doc, 'p', 'tr-meta', row.items.map(i => i.company).join(', ') + ': expired ' + str(row.card.expires_at) + '. Nothing was sent.');
        n.setAttribute('data-tr-expired-card', row.card.id);
        ex.appendChild(n);
      }
    }
    return sec;
  }

  function renderTracker(doc, view) {
    const sec = h(doc, 'section', 'tr-surface');
    sec.setAttribute('data-tr-surface', 'tracker');
    const cov = h(doc, 'p', 'tr-coverage', 'Confirmed by the employer ' + view.coverage.confirmed);
    cov.setAttribute('data-tr-coverage', 'tracker');
    sec.appendChild(cov);
    if (!view.rows.length) sec.appendChild(h(doc, 'p', 'tr-empty', 'No applications yet.'));
    for (const r of view.rows) {
      const n = h(doc, 'article', 'tr-item');
      n.setAttribute('data-tr-application', r.id);
      const top = h(doc, 'div', 'tr-row');
      top.appendChild(h(doc, 'h3', 'tr-title', r.company));
      const cls = r.state === 'confirmed' ? 'tr-good' : ['failed', 'not_submitted', 'unknown_outcome', 'needs_user'].includes(r.state) ? 'tr-bad' : r.state === 'driving' ? 'tr-accent' : 'tr-muted';
      top.appendChild(pill(doc, cls, r.label, ['data-tr-state', r.state]));
      n.appendChild(top);
      const meta = h(doc, 'p', 'tr-meta');
      meta.appendChild(link(doc, r.url, r.job_id));
      if (r.updated_at) meta.appendChild(doc.createTextNode(' · updated ' + r.updated_at));
      n.appendChild(meta);
      if (r.reason) n.appendChild(h(doc, 'p', 'tr-reason', r.reason));
      if (r.receipt) {
        const rc = h(doc, 'div', 'tr-receipt');
        rc.setAttribute('data-tr-receipt', r.id);
        rc.appendChild(h(doc, 'strong', '', 'Receipt'));
        rc.appendChild(h(doc, 'p', '', 'Confirmed by ' + r.receipt.company + ' at ' + r.receipt.confirmed_at));
        if (r.receipt.confirmation_number) rc.appendChild(h(doc, 'p', '', 'Confirmation number: ' + r.receipt.confirmation_number));
        rc.appendChild(h(doc, 'p', 'tr-hash', 'Answers fingerprint: ' + r.receipt.payload_hash));
        n.appendChild(rc);
      }
      sec.appendChild(n);
    }
    return sec;
  }

  /* ---------------- first-run setup (under two minutes: name, resume, target roles) ---------------- */
  // Each step is the person's own words. The name is saved on their profile; the resume and the target roles go to the
  // chat, where the live handler files the resume as drafts, asks for the person's yes, and saves the watch. The reply
  // shown under each step is the handler's own reply, verbatim.
  function setupMessages(input) {
    const roles = str(input.roles).split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    const place = str(input.place).trim();
    return Object.freeze({
      resume: str(input.resume).trim() ? 'Here’s my resume:\n' + str(input.resume).trim() : null,
      watch: roles.length ? 'Watch for ' + roles.join(', ') + ' roles' + (place ? ' in ' + place : '') : null,
    });
  }

  function renderSetup(doc, deps) {
    const sec = h(doc, 'section', 'tr-setup');
    sec.setAttribute('data-tr-surface', 'setup');
    sec.appendChild(h(doc, 'h2', 'tr-h2', 'Set up Trainee'));
    sec.appendChild(h(doc, 'p', 'tr-meta', 'Three things: your name, your resume, the roles you want. About two minutes.'));
    const clock = h(doc, 'p', 'tr-clock');
    clock.setAttribute('data-tr-clock', '');
    sec.appendChild(clock);
    const started = (deps.now || Date.now)();
    const tick = () => { const s = Math.max(0, Math.floor(((deps.now || Date.now)() - started) / 1000)); clock.textContent = 'Elapsed ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    tick();
    const timer = typeof setInterval === 'function' ? setInterval(() => { if (!sec.isConnected) clearInterval(timer); else tick(); }, 1000) : null;
    let thread = null;
    const field = (label, el) => { const l = h(doc, 'label', 'tr-field'); l.appendChild(h(doc, 'span', '', label)); l.appendChild(el); return l; };
    const step = (n, title) => { const s = h(doc, 'div', 'tr-step'); s.setAttribute('data-tr-step', String(n)); s.appendChild(h(doc, 'h3', 'tr-title', n + '. ' + title)); sec.appendChild(s); return s; };
    const out = (s) => { const p = h(doc, 'p', 'tr-reply'); p.setAttribute('role', 'status'); s.appendChild(p); return p; };
    async function send(text, status) {
      status.textContent = 'Sending…';
      try {
        const r = await deps.send(text, thread);
        if (!r || typeof r.reply !== 'string') throw Error('no reply');
        if (UUID.test(str(r.thread_id))) thread = r.thread_id;
        status.textContent = r.reply;
        return r.reply;
      } catch (e) { status.textContent = 'Not sent: ' + (e && e.message ? e.message : 'try again') + '.'; return null; }
    }
    // 1. Name
    const s1 = step(1, 'Your name');
    const name = h(doc, 'input', 'tr-input'); name.type = 'text'; name.autocomplete = 'name'; name.name = 'tr-name';
    s1.appendChild(field('Full name', name));
    const save1 = h(doc, 'button', 'tr-btn', 'Save name'); save1.type = 'button'; save1.setAttribute('data-tr-action', 'save-name');
    const o1 = out(s1); s1.insertBefore(save1, o1);
    save1.onclick = async () => {
      const v = name.value.trim();
      if (!v) { o1.textContent = 'Type your name first.'; return; }
      try { await deps.saveName(v); o1.textContent = 'Saved on your profile: ' + v; } catch (e) { o1.textContent = 'Not saved: ' + (e && e.message ? e.message : 'try again') + '.'; }
    };
    // 2. Resume
    const s2 = step(2, 'Your resume');
    const resume = h(doc, 'textarea', 'tr-input'); resume.rows = 6; resume.name = 'tr-resume';
    s2.appendChild(field('Paste your resume text', resume));
    const file = h(doc, 'input', 'tr-file'); file.type = 'file'; file.accept = '.txt,.md,text/plain';
    s2.appendChild(field('or choose a text file', file));
    file.onchange = async () => { const f = file.files && file.files[0]; if (f) resume.value = await f.text(); };
    const send2 = h(doc, 'button', 'tr-btn', 'Send resume'); send2.type = 'button'; send2.setAttribute('data-tr-action', 'send-resume');
    const confirm2 = h(doc, 'button', 'tr-btn tr-quiet', 'Yes, these facts are right'); confirm2.type = 'button'; confirm2.hidden = true; confirm2.setAttribute('data-tr-action', 'confirm-resume');
    const o2 = out(s2); s2.insertBefore(send2, o2); s2.appendChild(confirm2);
    send2.onclick = async () => {
      const m = setupMessages({ resume: resume.value });
      if (!m.resume) { o2.textContent = 'Paste your resume first.'; return; }
      const reply = await send(m.resume, o2);
      confirm2.hidden = !(reply && /awaiting your word|confirm|draft/i.test(reply));
    };
    confirm2.onclick = async () => { const r = await send('yes', o2); if (r) confirm2.hidden = true; };
    // 3. Target roles
    const s3 = step(3, 'The roles you want');
    const roles = h(doc, 'input', 'tr-input'); roles.type = 'text'; roles.name = 'tr-roles'; roles.placeholder = 'Data analyst, financial analyst';
    const place = h(doc, 'input', 'tr-input'); place.type = 'text'; place.name = 'tr-place'; place.placeholder = 'Chicago';
    s3.append(field('Target roles, separated by commas', roles), field('City (optional)', place));
    const send3 = h(doc, 'button', 'tr-btn', 'Start watching'); send3.type = 'button'; send3.setAttribute('data-tr-action', 'send-roles');
    const o3 = out(s3); s3.insertBefore(send3, o3);
    send3.onclick = async () => {
      const m = setupMessages({ roles: roles.value, place: place.value });
      if (!m.watch) { o3.textContent = 'Name at least one role.'; return; }
      const r = await send(m.watch, o3);
      if (r && typeof deps.onDone === 'function') deps.onDone();
    };
    return sec;
  }

  /* ---------------- mount ---------------- */
  // data: the result of load(). deps: { now, brandIcons, draft(text, threadId), send(text, threadId), saveName(name),
  // mountCard(slot, cardRow) -> Promise }, all supplied by the host page.
  function mount(rootEl, data, deps = {}) {
    const doc = rootEl.ownerDocument;
    const now = (deps.now || Date.now)();
    const d = Object.assign({ alerts: [], prefs: null, cards: [], prepared: [], jobs: [], postings: [] }, data || {});
    const matches = matchesView(d.alerts, d.postings, d.prefs, d.jobs);
    const queue = queueView(d.cards, d.prepared, d.jobs, now);
    const tracker = trackerView(d.jobs);
    rootEl.replaceChildren();
    rootEl.classList.add('tr-dash');
    const head = h(doc, 'header', 'tr-head');
    head.appendChild(h(doc, 'h1', 'tr-h1', 'Your applications'));
    const sum = h(doc, 'p', 'tr-coverage');
    sum.setAttribute('data-tr-summary', '');
    sum.textContent = matches.rows.length + ' matches · ' + queue.awaiting.length + ' awaiting approval · Confirmed ' + tracker.coverage.confirmed;
    head.appendChild(sum);
    rootEl.appendChild(head);
    if (!d.prefs && typeof deps.send === 'function') rootEl.appendChild(renderSetup(doc, deps));
    const mounts = [];
    const surfaces = [
      ['Matches', renderMatches(doc, matches, deps)],
      ['Queue', renderQueue(doc, queue, d, deps, mounts)],
      ['Tracker', renderTracker(doc, tracker)],
    ];
    const tabs = h(doc, 'div', 'tr-tabs');
    tabs.setAttribute('role', 'tablist');
    const start = queue.awaiting.length ? 1 : 0;
    const buttons = surfaces.map(([name, surface], i) => {
      const b = h(doc, 'button', 'tr-tab', name);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === start));
      if (name === 'Queue' && queue.awaiting.length) b.appendChild(h(doc, 'span', 'tr-badge', String(queue.awaiting.length)));
      surface.hidden = i !== start;
      b.addEventListener('click', () => {
        surfaces.forEach(([, s], j) => { s.hidden = j !== i; });
        buttons.forEach((x, j) => x.setAttribute('aria-selected', String(j === i)));
      });
      tabs.appendChild(b);
      return b;
    });
    rootEl.appendChild(tabs);
    for (const [, s] of surfaces) rootEl.appendChild(s);
    const foot = h(doc, 'footer', 'tr-works');
    foot.appendChild(h(doc, 'span', '', 'Works with job boards on'));
    for (const p of Object.keys(PROVIDERS)) foot.appendChild(providerMark(doc, p, deps.brandIcons, ''));
    rootEl.appendChild(foot);
    const pending = [];
    if (typeof deps.mountCard === 'function') {
      for (const m of mounts) pending.push(Promise.resolve().then(() => deps.mountCard(m.slot, m.card)).catch(() => {
        m.slot.textContent = 'This approval could not be verified. Nothing was approved.';
        m.slot.setAttribute('role', 'alert');
      }));
    } else for (const m of mounts) m.slot.textContent = 'The approval card is not available here. Nothing was approved.';
    return { root: rootEl, ready: Promise.all(pending), matches, queue, tracker };
  }

  return Object.freeze({ APPLY_STATES, STATE_LABELS, PROVIDERS, RPC, cardMounter, fitVerdict, matchesView, cardItems, queueView, receiptFor, trackerView, setupMessages, load, mount });
});
