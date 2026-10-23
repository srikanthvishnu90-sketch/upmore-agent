/* F1 web dashboard: feed, queue, tracker, receipts (Trainee builder plan 2026-10-22, item F1).
   The surfaces render ONLY what the records say: states come from the one vocabulary
   below (identical to the career_apply_jobs check constraint), fractions stay
   covered/total unreduced, every batch outcome returns exactly once with its reason,
   and a receipt exists only where the employer's email confirmed the row — composed
   verbatim from that row. Approval cards are NOT rendered here: queue items for
   prepared applications expose the marked slot (data-f1-card-slot) that the F2
   approval-card component mounts into via mountCards(). */
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TraineeDashboard = api;
})(globalThis, function () {
  'use strict';

  // The one place apply-state words live (builder-plan rule 3, 2026-10-22): order and
  // membership are the career_apply_jobs check constraint in
  // supabase/migrations/20261020000001_career_apply_jobs.sql; a test pins them equal.
  const APPLY_STATES = Object.freeze([
    { state: 'queued', label: 'Queued' },
    { state: 'driving', label: 'Applying now' },
    { state: 'confirmed', label: 'Confirmed by the employer' },
    { state: 'submitted_unconfirmed', label: 'Sent — waiting for the employer\u2019s confirmation' },
    { state: 'needs_user', label: 'Needs you' },
    { state: 'failed', label: 'Failed' },
    { state: 'not_submitted', label: 'Not submitted' },
    { state: 'unknown_outcome', label: 'Outcome unknown' },
  ]);
  const STATE_LABELS = Object.freeze(Object.fromEntries(APPLY_STATES.map(s => [s.state, s.label])));
  const QUEUE_STATES = new Set(['queued', 'driving', 'needs_user']);
  const FINISH_STATES = new Set(['confirmed', 'submitted_unconfirmed', 'needs_user', 'failed', 'not_submitted', 'unknown_outcome']);
  const AWAITING_STATES = new Set(['ready', 'shown']); // career_apply_prepared states that still await the person's approval

  const isRecord = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function checkRow(row) {
    if (!isRecord(row) || typeof row.state !== 'string' || !Object.hasOwn(STATE_LABELS, row.state)) {
      throw Error('unknown apply state: ' + (isRecord(row) ? String(row.state) : typeof row));
    }
    return row;
  }
  const byCreated = (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id || '').localeCompare(String(b.id || ''));
  const text = v => (typeof v === 'string' ? v : v == null ? '' : String(v));

  // A receipt is earned only by the employer's confirmation email (the product rule in
  // career_apply_receipts.ts and migration 20261021075000): state confirmed AND
  // email_confirmed_at set. Fields are copied verbatim from the row — byte-bound.
  function receiptFor(row) {
    checkRow(row);
    if (row.state !== 'confirmed' || typeof row.email_confirmed_at !== 'string' || row.email_confirmed_at.length === 0) return null;
    return Object.freeze({
      company: text(row.company),
      job_id: text(row.job_id),
      confirmation_number: typeof row.confirmation_id === 'string' && row.confirmation_id.length > 0 ? row.confirmation_id : null,
      payload_hash: text(row.payload_hash),
      confirmed_at: row.email_confirmed_at,
    });
  }

  const fieldFilled = f => {
    const v = f && f.value;
    return (typeof v === 'string' && v.trim().length > 0) || v === true || typeof v === 'number';
  };
  // Coverage fractions (builder-plan rule 1, 2026-10-22): covered/total, never reduced,
  // never a percentage, 0/0 when there is nothing to cover.
  function coverage(rows) {
    rows.forEach(checkRow);
    const total = rows.length;
    const preparedRows = rows.filter(r => isRecord(r.payload) && Array.isArray(r.payload.fields));
    let filled = 0, fields = 0;
    for (const r of preparedRows) { fields += r.payload.fields.length; filled += r.payload.fields.filter(fieldFilled).length; }
    const confirmed = rows.filter(r => r.state === 'confirmed').length;
    const frac = (n, d) => (d === 0 ? '0/0' : n + '/' + d);
    return Object.freeze({ prepared: frac(preparedRows.length, total), filled: frac(filled, fields), confirmed: frac(confirmed, total) });
  }

  function queueView(jobRows, preparedRows = []) {
    jobRows.forEach(checkRow);
    const items = jobRows.filter(r => QUEUE_STATES.has(r.state)).slice().sort(byCreated)
      .map(row => Object.freeze({ kind: 'job', row }));
    const awaiting = (preparedRows || []).filter(p => p && AWAITING_STATES.has(p.state)).slice().sort(byCreated)
      .map(row => Object.freeze({ kind: 'prepared', row }));
    return Object.freeze({ items: Object.freeze(items), awaiting: Object.freeze(awaiting) });
  }

  function trackerView(rows) {
    rows.forEach(checkRow);
    const view = rows.slice().sort((a, b) =>
      APPLY_STATES.findIndex(s => s.state === a.state) - APPLY_STATES.findIndex(s => s.state === b.state) || byCreated(a, b))
      .map(row => Object.freeze({
        id: row.id, job_id: row.job_id, company: row.company, url: row.url,
        state: row.state, label: STATE_LABELS[row.state],
        reason: typeof row.reason === 'string' && row.reason.length > 0 ? row.reason : null,
        receipt: receiptFor(row),
      }));
    return Object.freeze({ rows: Object.freeze(view) });
  }

  function feedView(jobRows, outcomes = []) {
    jobRows.forEach(checkRow);
    const events = [];
    for (const row of jobRows) {
      events.push({ kind: 'apply-event', at: row.created_at, state: 'queued', row_id: row.id, text: row.company + ': ' + STATE_LABELS.queued });
      if (typeof row.claimed_at === 'string' && row.claimed_at) {
        events.push({ kind: 'apply-event', at: row.claimed_at, state: 'driving', row_id: row.id, text: row.company + ': ' + STATE_LABELS.driving });
      }
      // Dedup (coordinator review 2026-10-23, item 6): a row reaches
      // 'confirmed' ONLY via the employer's confirmation email —
      // career_apply_confirm_as writes state, email_confirmed_at and
      // updated_at in ONE statement — so for a confirmed row the finish
      // event below and the email event are the SAME real-world event.
      // Emit only the email event (its timestamp is the real moment);
      // the finish event remains for a confirmed row that carries no
      // email timestamp, so the state is never shown zero times either.
      const confirmedByEmail = row.state === 'confirmed' && typeof row.email_confirmed_at === 'string' && row.email_confirmed_at.length > 0;
      if (FINISH_STATES.has(row.state) && !confirmedByEmail && typeof row.updated_at === 'string' && row.updated_at) {
        events.push({ kind: 'apply-event', at: row.updated_at, state: row.state, row_id: row.id, text: row.company + ': ' + STATE_LABELS[row.state] });
      }
      if (typeof row.email_confirmed_at === 'string' && row.email_confirmed_at) {
        events.push({ kind: 'apply-event', at: row.email_confirmed_at, state: 'confirmed', row_id: row.id, text: row.company + ': ' + STATE_LABELS.confirmed });
      }
    }
    events.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    // Builder-plan rule 2 (2026-10-22): each application in a batch returns exactly
    // once — kept, or dropped with the rule that dropped it. A dropped outcome with
    // no reason is refused here so an item can never silently disappear.
    const batch = (outcomes || []).map(o => {
      if (!isRecord(o) || typeof o.job_id !== 'string' || o.job_id.length === 0 || typeof o.kept !== 'boolean') {
        throw Error('invalid batch outcome');
      }
      if (!o.kept && (typeof o.reason !== 'string' || o.reason.length === 0)) {
        throw Error('dropped batch outcome without a reason: ' + o.job_id);
      }
      return Object.freeze({ kind: 'batch-outcome', job_id: o.job_id, company: text(o.company), kept: o.kept, reason: o.kept ? null : o.reason });
    });
    return Object.freeze([...events.map(e => Object.freeze(e)), ...batch]);
  }

  /* ---------- DOM rendering: record text goes through textContent only ---------- */
  function el(doc, tag, className, content) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }
  function statePill(doc, state) {
    const pill = el(doc, 'span', 'f1-state' + (state === 'driving' ? ' is-active' : ''), STATE_LABELS[state]);
    pill.setAttribute('data-f1-state', state);
    return pill;
  }
  function itemShell(doc, row, attrs) {
    const item = el(doc, 'article', 'f1-item');
    for (const [k, v] of Object.entries(attrs)) item.setAttribute(k, v);
    item.appendChild(el(doc, 'div', 'f1-company', text(row.company)));
    const meta = el(doc, 'div', 'f1-meta');
    const link = el(doc, 'a', '', text(row.job_id));
    if (typeof row.url === 'string' && /^https?:\/\//.test(row.url)) link.setAttribute('href', row.url);
    meta.appendChild(link);
    item.appendChild(meta);
    return item;
  }

  function renderQueue(doc, jobRows, preparedRows = []) {
    const view = queueView(jobRows, preparedRows);
    const section = el(doc, 'section', 'f1-surface f1-queue');
    section.appendChild(el(doc, 'h2', '', 'Queue'));
    if (view.awaiting.length > 0) {
      const group = el(doc, 'div', 'f1-awaiting');
      group.appendChild(el(doc, 'h3', '', 'Awaiting your approval'));
      const byId = new Map();
      for (const { row } of view.awaiting) {
        byId.set(row.id, row);
        const item = itemShell(doc, row, { 'data-f1-queue-item': '', 'data-f1-prepared-item': row.id });
        // F2 INTEGRATION SLOT: the approval-card component (F2 lane) mounts into this
        // element via TraineeDashboard.mountCards(root, mountFn); the dashboard itself
        // renders no approval UI and invents no card content.
        const slot = el(doc, 'div', 'f1-card-slot');
        slot.setAttribute('data-f1-card-slot', 'approval-card');
        slot.setAttribute('data-prepared-id', row.id);
        item.appendChild(slot);
        group.appendChild(item);
      }
      section.__f1PreparedById = byId;
      section.appendChild(group);
    }
    const list = el(doc, 'div', 'f1-queue-list');
    list.setAttribute('data-f1-single-view', 'queue');
    for (const { row } of view.items) {
      const item = itemShell(doc, row, { 'data-f1-queue-item': '', 'data-f1-row-id': row.id });
      item.appendChild(statePill(doc, row.state));
      if (typeof row.reason === 'string' && row.reason) item.appendChild(el(doc, 'div', 'f1-reason', row.reason));
      list.appendChild(item);
    }
    section.appendChild(list);
    return section;
  }

  function mountCards(rootEl, mountFn) {
    if (!rootEl || typeof mountFn !== 'function') throw Error('mountCards needs a root element and a mount function');
    const byId = rootEl.__f1PreparedById || (rootEl.querySelector && rootEl.querySelector('.f1-queue')?.__f1PreparedById);
    const slots = rootEl.querySelectorAll('[data-f1-card-slot]');
    for (const slot of slots) {
      const row = byId ? byId.get(slot.getAttribute('data-prepared-id')) : undefined;
      mountFn(slot, row);
    }
  }

  function renderTracker(doc, rows) {
    const view = trackerView(rows);
    const section = el(doc, 'section', 'f1-surface f1-tracker');
    section.appendChild(el(doc, 'h2', '', 'Tracker'));
    for (const row of view.rows) {
      const item = itemShell(doc, row, { 'data-f1-tracker-item': row.id });
      item.appendChild(statePill(doc, row.state));
      if (row.reason) item.appendChild(el(doc, 'div', 'f1-reason', row.reason));
      if (row.receipt) {
        // Receipts inline (F1 check e): the confirmed row's own recorded evidence,
        // visible without leaving the dashboard, fields verbatim.
        const receipt = el(doc, 'div', 'f1-receipt');
        receipt.setAttribute('data-f1-receipt', row.id);
        receipt.appendChild(el(doc, 'div', '', 'Receipt — ' + row.receipt.company));
        receipt.appendChild(el(doc, 'div', '', 'Job: ' + row.receipt.job_id));
        if (row.receipt.confirmation_number) receipt.appendChild(el(doc, 'div', '', 'Confirmation: ' + row.receipt.confirmation_number));
        const hash = el(doc, 'div', 'f1-hash', 'Payload hash: ' + row.receipt.payload_hash);
        receipt.appendChild(hash);
        receipt.appendChild(el(doc, 'div', '', 'Confirmed at: ' + row.receipt.confirmed_at));
        item.appendChild(receipt);
      }
      section.appendChild(item);
    }
    return section;
  }

  function renderFeed(doc, jobRows, outcomes = []) {
    const events = feedView(jobRows, outcomes);
    const section = el(doc, 'section', 'f1-surface f1-feed');
    section.appendChild(el(doc, 'h2', '', 'Feed'));
    const list = el(doc, 'div', 'f1-feed-list');
    for (const e of events) {
      const item = el(doc, 'div', 'f1-feed-item');
      if (e.kind === 'batch-outcome') {
        item.setAttribute('data-f1-batch-outcome', e.job_id);
        item.appendChild(el(doc, 'span', e.kept ? '' : 'f1-dropped',
          e.company + ' (' + e.job_id + '): ' + (e.kept ? 'kept' : 'dropped — ' + e.reason)));
      } else {
        item.setAttribute('data-f1-feed-event', e.row_id);
        item.appendChild(el(doc, 'span', '', e.text));
        item.appendChild(el(doc, 'div', 'f1-meta', text(e.at)));
      }
      list.appendChild(item);
    }
    section.appendChild(list);
    return section;
  }

  // Compose the four surfaces under one root with a tab bar (Feed · Queue · Tracker;
  // receipts live inline in the tracker). deps.cards.mountFn, when the host provides
  // it, is handed every approval-card slot after render.
  function mount(rootEl, data, deps = {}) {
    const doc = rootEl.ownerDocument;
    const { jobs = [], prepared = [], outcomes = [] } = data || {};
    const cov = coverage(jobs);
    // Field-fill telemetry has exactly one data source: each career_apply_jobs
    // row's payload.fields list (one entry per form field, with its value) —
    // the same list coverage() counts. When NO row carries any fields, the
    // telemetry is ABSENT, and absence must stay representable: the counter
    // renders a dash, never 0/0. A 0/0 beside an active or confirmed row reads
    // as a measured zero ("nothing was filled"), which the records do not say.
    const hasFieldTelemetry = jobs.some(r => isRecord(r.payload) && Array.isArray(r.payload.fields) && r.payload.fields.length > 0);
    rootEl.replaceChildren();
    const header = el(doc, 'div', 'f1-head');
    header.appendChild(el(doc, 'h1', '', 'Applications'));
    const covLine = el(doc, 'p', 'f1-coverage');
    covLine.appendChild(el(doc, 'span', '', 'Prepared '));
    covLine.appendChild(el(doc, 'strong', '', cov.prepared));
    covLine.appendChild(el(doc, 'span', '', ' · Fields filled '));
    const filledEl = el(doc, 'strong', '', hasFieldTelemetry ? cov.filled : '\u2014');
    filledEl.setAttribute('data-f1-fields-filled', hasFieldTelemetry ? 'telemetry' : 'absent');
    covLine.appendChild(filledEl);
    covLine.appendChild(el(doc, 'span', '', ' · Confirmed '));
    covLine.appendChild(el(doc, 'strong', '', cov.confirmed));
    header.appendChild(covLine);
    rootEl.appendChild(header);
    const tabs = el(doc, 'div', 'f1-tabs');
    tabs.setAttribute('role', 'tablist');
    const surfaces = [
      ['Feed', renderFeed(doc, jobs, outcomes)],
      ['Queue', renderQueue(doc, jobs, prepared)],
      ['Tracker', renderTracker(doc, jobs)],
    ];
    const buttons = surfaces.map(([name, surface], i) => {
      const b = el(doc, 'button', 'f1-tab', name);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      surface.hidden = i !== 0;
      b.addEventListener('click', () => {
        surfaces.forEach(([, s], j) => { s.hidden = j !== i; });
        buttons.forEach((bb, j) => bb.setAttribute('aria-selected', j === i ? 'true' : 'false'));
      });
      tabs.appendChild(b);
      return b;
    });
    rootEl.appendChild(tabs);
    for (const [, surface] of surfaces) rootEl.appendChild(surface);
    if (deps && deps.cards && typeof deps.cards.mountFn === 'function') mountCards(rootEl, deps.cards.mountFn);
    return rootEl;
  }

  return Object.freeze({ APPLY_STATES, STATE_LABELS, receiptFor, coverage, queueView, trackerView, feedView, renderQueue, renderTracker, renderFeed, mountCards, mount });
});
