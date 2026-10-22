/* Messages approval rendering. The database, not this view, owns expiry and single use.
   Extension cards remain TEST-only; cloud cards require explicit server eligibility. */
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TraineeApprovalCards = api;
})(globalThis, function () {
  'use strict';
  const DAY = 86400000;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SHA = /^[0-9a-f]{64}$/;
  const encoder = new TextEncoder();
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  const exact = (value, keys) => record(value) && Object.keys(value).sort().join('|') === keys.slice().sort().join('|');
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  class CardError extends Error { constructor(code) { super(code); this.code = code; } }
  const insist = (ok, reason = 'invalid') => { if (!ok) throw new CardError(reason); };
  const utf8Compare = (a, b) => {
    const x = encoder.encode(a), y = encoder.encode(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
    return x.length - y.length;
  };
  function canonical(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (record(value)) return '{' + Object.keys(value).sort(utf8Compare).map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    throw Error('invalid');
  }
  async function hash(value, crypto = globalThis.crypto) {
    insist(crypto && crypto.subtle, 'unavailable');
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical(value)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const copy = value => JSON.parse(canonical(value));
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function validEntry(entry) {
    insist(exact(entry, ['version', 'kind', 'jobId', 'company', 'url', 'answers', 'blank', 'ledger', 'question_set_hash', 'manifest_hash', 'quarantine_version']));
    insist(entry.version === 1 && entry.kind === 'agent-batch' && text(entry.jobId) && text(entry.company));
    let url;
    try { url = new URL(entry.url); } catch (_) { throw Error('invalid'); }
    insist(url.protocol === 'https:' && !url.username && !url.password && text(entry.url));
    insist(Array.isArray(entry.answers) && entry.answers.length > 0 && entry.answers.length <= 1000);
    insist(Array.isArray(entry.blank) && entry.blank.every(text) && new Set(entry.blank).size === entry.blank.length);
    insist(Array.isArray(entry.ledger) && entry.ledger.length === entry.answers.length);
    insist(SHA.test(entry.question_set_hash) && SHA.test(entry.manifest_hash) && entry.quarantine_version === 'd007-v1');
    const names = new Set(), fields = new Set();
    let files = 0;
    for (const answer of entry.answers) {
      insist(exact(answer, ['name', 'label', 'value', 'shown', 'kind', 'factId', 'file']));
      insist(text(answer.name) && text(answer.label) && typeof answer.value === 'string' && typeof answer.shown === 'string' && text(answer.factId));
      insist(!names.has(answer.name)); names.add(answer.name);
      insist(['text', 'select', 'choice', 'checkbox', 'file', 'listed'].includes(answer.kind));
      if (answer.kind === 'file') {
        insist(SHA.test(answer.file) && text(answer.shown));
        // The canonical producer names its approved local resume this way. This distinguishes attachments;
        // it does not replace the manifest/event checks enforced by the submission contract.
        if (answer.factId === 'approved-local-resume:' + answer.file) files++;
      }
      else insist(answer.file === null);
    }
    // This first TEST delivery is explicitly resume-bound. Fileless cards are not enabled.
    insist(files > 0, 'resume_missing');
    for (const row of entry.ledger) {
      insist(exact(row, ['application_id', 'field_id', 'question_hash', 'answer_hash', 'fact_refs', 'source_refs', 'confirmation_event_id', 'derivation_rule']));
      insist(row.application_id === entry.jobId && names.has(row.field_id) && !fields.has(row.field_id)); fields.add(row.field_id);
      insist(SHA.test(row.question_hash) && SHA.test(row.answer_hash) && text(row.confirmation_event_id) && text(row.derivation_rule));
      insist(Array.isArray(row.fact_refs) && row.fact_refs.length > 0 && row.fact_refs.every(text));
      insist(Array.isArray(row.source_refs) && row.source_refs.length > 0 && row.source_refs.every(text));
      insist(row.fact_refs[0] === entry.answers.find(answer => answer.name === row.field_id).factId);
    }
    insist(encoder.encode(canonical(entry)).length <= 131072);
  }
  const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  const closed = (value, required, optional = []) => record(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
  const https = value => { try { const url = new URL(value); return text(value) && url.protocol === 'https:' && !url.username && !url.password; } catch (_) { return false; } };
  const shownValue = value => typeof value === 'string' ? value : canonical(value);
  function validCloudItem(item, binding) {
    insist(exact(item, ['payload', 'hash', 'readback']) && SHA.test(item.hash));
    const p = item.payload, r = item.readback;
    // This is a display-completeness check of the producer's frozen P, not a second facts/engine pipeline.
    insist(closed(p, ['version', 'user_id', 'job_id', 'company', 'url', 'fields', 'destination', 'resume_sha256', 'page_field_names', 'engine_approval', 'privacy_epoch', 'account_version', 'expires_at'], ['schema_hash', 'quarantine_version', 'manifest_hash', 'replay_sources', 'resume_tailored', 'resume_persona', 'approved_snapshot']));
    insist(p.version === 1 && p.user_id === binding.owner && text(p.job_id) && text(p.company) && https(p.url) && https(p.destination));
    insist(SHA.test(p.resume_sha256) && SHA.test(p.engine_approval) && integer(p.privacy_epoch) && integer(p.account_version) && iso(p.expires_at));
    insist(Array.isArray(p.fields) && p.fields.length > 0 && p.fields.length <= 1000);
    insist(Array.isArray(p.page_field_names) && p.page_field_names.every(text) && new Set(p.page_field_names).size === p.page_field_names.length);
    insist(exact(r, ['answers', 'resume_name', 'resume_sha256', 'destination', 'blank', 'employer_fields']));
    insist(text(r.resume_name) && r.resume_sha256 === p.resume_sha256 && r.destination === p.destination, 'resume_missing');
    insist(Array.isArray(r.answers) && r.answers.length === p.fields.length && Array.isArray(r.blank) && r.blank.every(text) && new Set(r.blank).size === r.blank.length);
    insist(Array.isArray(r.employer_fields) && r.employer_fields.length === p.page_field_names.length);
    const names = new Set(), employerNames = new Set();
    for (const field of p.fields) {
      insist(closed(field, ['name', 'label', 'value', 'factId'], ['provenance', 'confirmation_event_id', 'authorizes', 'source']));
      insist(text(field.name) && text(field.label) && text(field.factId) && !names.has(field.name)); names.add(field.name);
      const answers = r.answers.filter(answer => record(answer) && answer.name === field.name);
      insist(answers.length === 1); const answer = answers[0];
      insist(closed(answer, ['name', 'label', 'value', 'shown', 'factId'], ['kind']));
      insist(answer.label === field.label && answer.factId === field.factId && canonical(answer.value) === canonical(field.value));
      insist(typeof answer.shown === 'string' || typeof answer.shown === 'boolean');
      if (Object.hasOwn(answer, 'kind')) insist(text(answer.kind));
    }
    for (const field of r.employer_fields) {
      insist(exact(field, ['name', 'value']) && text(field.name) && p.page_field_names.includes(field.name) && !employerNames.has(field.name)); employerNames.add(field.name);
      canonical(field.value);
    }
    insist(encoder.encode(canonical(p)).length <= 131072);
  }
  async function validate(card, binding, crypto, now) {
    insist(closed(card, ['id', 'payload', 'hash', 'state'], ['message_id', 'receipt']) && card.id === binding.cardId && UUID.test(card.id) && SHA.test(card.hash));
    if (Object.hasOwn(card, 'message_id')) insist(card.message_id === null || text(card.message_id) || integer(card.message_id));
    const p = card.payload;
    const cloud = p?.version === 2;
    insist(exact(p, ['version', 'kind', 'card_id', 'user_id', 'thread_id', 'issued_at', 'expires_at', 'items', ...(cloud ? ['execution_mode'] : [])]));
    insist((cloud ? p.execution_mode === 'cloud' : p.version === 1) && p.kind === 'career-message-approval' && p.card_id === card.id && p.user_id === binding.owner && p.thread_id === binding.thread);
    insist(integer(p.issued_at) && integer(p.expires_at) && p.expires_at - p.issued_at === DAY && p.issued_at <= now);
    insist(['open', 'approved', 'expired'].includes(card.state));
    insist(Array.isArray(p.items) && p.items.length > 0 && p.items.length <= 100);
    const jobs = new Set();
    for (const item of p.items) {
      if (cloud) { validCloudItem(item, binding); insist(!jobs.has(item.payload.job_id)); jobs.add(item.payload.job_id); }
      else { insist(exact(item, ['entry', 'hash']) && SHA.test(item.hash)); validEntry(item.entry); insist(!jobs.has(item.entry.jobId)); jobs.add(item.entry.jobId); }
      insist(await hash(cloud ? item.payload : item.entry, crypto) === item.hash);
    }
    insist(encoder.encode(canonical(p)).length <= (cloud ? 1048576 : 2000000) && await hash(p, crypto) === card.hash);
    if (Object.hasOwn(card, 'receipt')) { insist(cloud && card.state === 'approved'); validReceipt(card.receipt, card); }
    return freeze(copy(card));
  }
  function validReceipt(receipt, card) {
    const start = Date.parse(receipt?.approved_at), end = Date.parse(receipt?.approval_expires_at);
    insist(record(receipt) && receipt.card_id === card.id && receipt.card_hash === card.hash && receipt.approved_count === card.payload.items.length && iso(receipt.approved_at) && iso(receipt.approval_expires_at) && start >= card.payload.issued_at && start < card.payload.expires_at && end - start === DAY, 'unknown');
    if (card.payload.version !== 2) return;
    insist(Array.isArray(receipt.jobs) && receipt.jobs.length === card.payload.items.length, 'unknown');
    const ids = new Set(), approvals = new Set(), hashes = new Set();
    for (const job of receipt.jobs) {
      insist(exact(job, ['id', 'approval_id', 'payload_hash', 'expires_at']) && UUID.test(job.id) && UUID.test(job.approval_id) && SHA.test(job.payload_hash) && iso(job.expires_at), 'unknown');
      const item = card.payload.items.find(item => item.hash === job.payload_hash);
      insist(item && !ids.has(job.id) && !approvals.has(job.approval_id) && !hashes.has(job.payload_hash) && Date.parse(job.expires_at) === Math.min(Date.parse(item.payload.expires_at), start + DAY), 'unknown');
      ids.add(job.id); approvals.add(job.approval_id); hashes.add(job.payload_hash);
    }
  }
  const REASONS = {
    unavailable: 'The approval card could not be verified. Nothing was approved.',
    invalid: 'This approval card could not be verified. Nothing was approved.',
    resume_missing: 'A resume filename and fingerprint are required for this TEST approval. Nothing was approved.',
    changed: 'This card or its answers changed. Reload and review the current card. Nothing was approved.',
    stale: 'This conversation or signed-in account changed. Nothing was approved.',
    expired: 'This card expired. Ask for a new card; nothing was approved.',
    approved: 'This card was already approved. It cannot approve another application.',
    unknown: 'The approval result is unknown. Do not approve again. Reload this card to check its recorded state; nothing has been claimed as submitted.',
    checking: 'Approval is already being checked. Do not approve again.',
    ineligible: 'This account is not enabled for cloud application approvals. Nothing was approved.',
  };
  function createController(options) {
    const o = options || {}, doc = o.document || globalThis.document, crypto = o.crypto || globalThis.crypto;
    const now = typeof o.now === 'function' ? o.now : Date.now;
    const pending = new Set(), finished = new Map();
    const identity = () => typeof o.identity === 'function' ? o.identity() : null;
    const thread = () => typeof o.thread === 'function' ? o.thread() : null;
    async function mount(container, cardId, ticket = {}) {
      let state = 'loading', snapshot = null, stamp = null, display = null;
      let button = null, status = null;
      const binding = { cardId, owner: identity(), thread: thread() };
      const handle = { getState: () => state, approve: tap, get button() { return button; }, get status() { return status; }, get disclosure() { return display; } };
      const current = () => identity() === binding.owner && thread() === binding.thread && (typeof ticket.current !== 'function' || ticket.current());
      const scoped = () => UUID.test(binding.owner || '') && UUID.test(binding.thread || '') && UUID.test(cardId || '') && current();
      const testOwner = () => UUID.test(o.testUserId || '') && binding.owner === o.testUserId;
      const allowed = () => scoped() && (snapshot?.payload.version === 2 || testOwner());
      async function cloudEligible() {
        insist(typeof o.cloudEnabled === 'function', 'ineligible');
        const enabled = await o.cloudEnabled(); insist(current(), 'stale'); return enabled === true;
      }
      function outcome(next, message) {
        state = next;
        if (button) button.disabled = next !== 'open';
        if (status) status.textContent = message || REASONS[next] || REASONS.unavailable;
      }
      function node(tag, value, parent) {
        const el = doc.createElement(tag); if (value !== undefined) el.textContent = value;
        if (parent) parent.appendChild(el); return el;
      }
      function disclosureSignature() {
        // Opening native details is the person's review action, not a change to the answers.
        // Normalize only this interaction state; the remaining DOM stays part of the stamp.
        const view = display.cloneNode(true);
        for (const details of view.querySelectorAll('details')) details.removeAttribute('open');
        return view.outerHTML;
      }
      function render(card) {
        const section = node('section'); section.className = 'career-approval-card';
        section.setAttribute('aria-label', 'Review application approval');
        display = node('div', undefined, section);
        node('h3', 'Review exact application answers', display);
        const cloud = card.payload.version === 2;
        node('p', cloud ? 'Only these frozen application inputs are covered. Each application can start once, no later than its send deadline below or 24 hours after your tap, whichever comes first.' : 'Only the answers and resume fingerprints below are covered by this approval. Each application can start once; permission expires 24 hours after approval.', display);
        node('p', 'This review card expires ' + new Date(card.payload.expires_at).toISOString() + '.', display);
        for (const item of card.payload.items) {
          const application = node('section', undefined, display);
          if (cloud) {
            const p = item.payload, r = item.readback;
            node('h4', p.company, application); node('p', 'Posting: ' + p.job_id, application); node('p', 'Posting URL: ' + p.url, application);
            node('p', 'Destination: ' + r.destination, application);
            node('p', 'Send deadline: ' + p.expires_at + ' (or 24 hours after your tap, if earlier).', application);
            for (const answer of r.answers) {
              const field = node('section', undefined, application); node('h5', answer.label + ' [' + answer.name + ']', field);
              const shown = node('pre', shownValue(answer.shown), field); shown.style.whiteSpace = 'pre-wrap'; shown.style.overflowWrap = 'anywhere';
              if (canonical(answer.value) !== canonical(answer.shown)) { node('p', 'Prepared input value:', field); const value = node('pre', shownValue(answer.value), field); value.style.whiteSpace = 'pre-wrap'; value.style.overflowWrap = 'anywhere'; }
            }
            node('p', 'Resume: ' + r.resume_name, application); node('p', 'Resume SHA-256: ' + r.resume_sha256, application);
            node('p', r.blank.length ? 'Left blank: ' + r.blank.join('; ') : 'No listed fields are left blank.', application);
            for (const field of r.employer_fields) { node('h5', 'Employer field: ' + field.name, application); const value = node('pre', shownValue(field.value), application); value.style.whiteSpace = 'pre-wrap'; value.style.overflowWrap = 'anywhere'; }
            node('p', 'Application fingerprint: ' + item.hash, application); continue;
          }
          const entry = item.entry;
          node('h4', entry.company, application); node('p', 'Posting: ' + entry.jobId, application);
          node('p', 'Destination: ' + entry.url, application);
          for (const answer of entry.answers) {
            const field = node('section', undefined, application);
            node('h5', answer.label + ' [' + answer.name + ']', field);
            const shown = node('pre', answer.shown, field); shown.style.whiteSpace = 'pre-wrap'; shown.style.overflowWrap = 'anywhere';
            if (answer.kind === 'file') node('p', (answer.factId === 'approved-local-resume:' + answer.file ? 'Resume' : 'File') + ' SHA-256: ' + answer.file, field);
            if (answer.value !== answer.shown) { node('p', 'Prepared input value:', field); const value = node('pre', answer.value, field); value.style.whiteSpace = 'pre-wrap'; value.style.overflowWrap = 'anywhere'; }
          }
          node('p', entry.blank.length ? 'Left blank: ' + entry.blank.join('; ') : 'No listed fields are left blank.', application);
          node('p', 'Application fingerprint: ' + item.hash, application);
        }
        node('p', 'Card fingerprint: ' + card.hash, display);
        const details = node('details', undefined, display); node('summary', 'Exact approval payload', details);
        const raw = node('pre', canonical(card.payload), details); raw.style.whiteSpace = 'pre-wrap'; raw.style.overflowWrap = 'anywhere';
        button = node('button', 'Approve these exact answers for ' + card.payload.items.length + (card.payload.items.length === 1 ? ' application' : ' applications'), section); button.type = 'button'; button.disabled = true;
        status = node('p', '', section); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        button.onclick = event => tap(event);
        container.replaceChildren(section); stamp = disclosureSignature();
      }
      function disclosed() {
        if (!display || disclosureSignature() !== stamp || display.hidden || display.getAttribute('aria-hidden') === 'true') return false;
        if (container.isConnected !== true || display.isConnected !== true || button?.isConnected !== true) return false;
        const view = doc.defaultView;
        if (!view || typeof view.getComputedStyle !== 'function') return false;
        const details = display.querySelectorAll('details')[0];
        // The optional raw-JSON inspection can be closed. Every primary answer and fingerprint must be visible.
        const targets = [display, ...display.querySelectorAll('*')].filter(node => !details || !details.contains(node));
        for (const target of targets) {
          let node = target;
          while (node && typeof node.tagName === 'string') {
            if (node.hidden || node.getAttribute?.('aria-hidden') === 'true') return false;
            let css;
            try { css = view.getComputedStyle(node); } catch (_) { return false; }
            if (!css || css.display === 'none' || ['hidden', 'collapse'].includes(css.visibility) || css.contentVisibility === 'hidden' || Number(css.opacity) === 0) return false;
            if (css.display !== 'contents' && node.textContent.length > 0) {
              if (typeof node.getClientRects !== 'function') return false;
              let rects;
              try { rects = Array.from(node.getClientRects()); } catch (_) { return false; }
              if (!rects.some(rect => Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0)) return false;
            }
            node = node.parentNode;
          }
        }
        let parent = display.parentNode;
        while (parent) {
          if (parent.hidden || (typeof parent.getAttribute === 'function' && parent.getAttribute('aria-hidden') === 'true') || parent.style?.display === 'none' || parent.style?.visibility === 'hidden') return false;
          if (parent === container) return true;
          parent = parent.parentNode;
        }
        return false;
      }
      function ownerTap(event) {
        const NativeEvent = doc.defaultView?.Event;
        if (!event || typeof NativeEvent !== 'function' || !(event instanceof NativeEvent) || event.type !== 'click' || event.isTrusted !== true || event.currentTarget !== button || !button?.contains(event.target)) return false;
        // Native brand validation rejects objects forged with Event.prototype and an isTrusted property.
        try { return NativeEvent.prototype.composedPath.call(event).includes(button); } catch (_) { return false; }
      }
      async function tap(event) {
        if (state !== 'open' || pending.has(cardId) || finished.has(cardId)) return;
        if (!ownerTap(event)) return;
        if (!allowed()) { outcome('stale'); return; }
        if (now() >= snapshot.payload.expires_at) { outcome('expired'); return; }
        if (!disclosed()) { outcome('changed'); return; }
        pending.add(cardId); outcome('checking', 'Checking this exact card before approval…');
        let dispatched = false;
        try {
          insist(typeof o.authenticate === 'function' && typeof o.readCard === 'function' && typeof o.approve === 'function', 'unavailable');
          const verifiedOwner = await o.authenticate();
          insist(current() && allowed() && verifiedOwner === binding.owner, 'stale');
          if (snapshot.payload.version === 2) insist(await cloudEligible(), 'ineligible');
          const reread = await o.readCard(cardId);
          insist(record(reread) && reread.hash === snapshot.hash && canonical(reread.payload) === canonical(snapshot.payload), 'changed');
          const fresh = await validate(reread, binding, crypto, now());
          insist(current() && allowed(), 'stale');
          insist(fresh.hash === snapshot.hash && canonical(fresh.payload) === canonical(snapshot.payload), 'changed');
          insist(fresh.state === 'open', fresh.state);
          insist(now() < fresh.payload.expires_at, 'expired');
          insist(disclosed(), 'changed');
          // No await between the final owner/disclosure check and the authenticated RPC dispatch.
          insist(current() && allowed(), 'stale');
          dispatched = true;
          const receipt = await o.approve({ card_id: cardId, card_hash: snapshot.hash });
          validReceipt(receipt, snapshot);
          finished.set(cardId, 'approved');
          if (!current()) { outcome('stale'); return; }
          outcome('approved', snapshot.payload.version === 2 ? 'Approved and queued exactly as shown, once per application. ' + receipt.jobs.map(job => 'Application ' + job.id + ' send deadline: ' + job.expires_at + '.').join(' ') + ' This receipt does not claim an employer submission.' : 'Approved exactly as shown, once per application. Permission expires ' + receipt.approval_expires_at + '. Nothing has been submitted to an employer yet.');
        } catch (error) {
          if (dispatched) {
            finished.set(cardId, 'unknown');
            outcome('unknown');
          } else outcome(error instanceof CardError && REASONS[error.code] ? error.code : 'unavailable');
        } finally { pending.delete(cardId); }
      }
      try {
        insist(doc && container && typeof container.replaceChildren === 'function' && scoped() && (testOwner() || typeof o.cloudEnabled === 'function'), 'stale');
        insist(typeof o.readCard === 'function', 'unavailable');
        let cloudEnabled = false;
        if (typeof o.cloudEnabled === 'function') {
          insist(typeof o.authenticate === 'function', 'unavailable');
          insist(await o.authenticate() === binding.owner && scoped(), 'stale');
          try { cloudEnabled = await cloudEligible(); } catch (error) { if (!testOwner()) throw error; }
        }
        snapshot = await validate(await o.readCard(cardId), binding, crypto, now());
        if (snapshot.payload.version === 2 && snapshot.state === 'open') insist(cloudEnabled, 'ineligible');
        insist(current() && allowed(), 'stale');
        render(snapshot);
        if (snapshot.state !== 'open') outcome(snapshot.state);
        else if (finished.has(cardId)) outcome(finished.get(cardId));
        else if (pending.has(cardId)) outcome('checking');
        else if (now() >= snapshot.payload.expires_at) outcome('expired');
        else outcome('open', 'Review every answer and resume fingerprint before approving. Nothing has been submitted.');
      } catch (error) {
        if (doc && container && typeof container.replaceChildren === 'function') {
          const message = node('p', ''); message.setAttribute('role', 'status'); status = message; container.replaceChildren(message);
        }
        outcome(error instanceof CardError && REASONS[error.code] ? error.code : 'unavailable');
      }
      return handle;
    }
    return { mount };
  }
  return Object.freeze({ createController, canonical, hash });
});
