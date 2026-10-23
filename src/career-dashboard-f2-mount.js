/* F1–F2 INTEGRATION (coordinator review 2026-10-23, item 3): the mount that
   fills the dashboard's awaiting-approval card slot with the REAL F2 review
   card (packages/domain/175-career-approval-ui.js). The F1 dashboard renders
   the slot (data-f1-card-slot) and delegates through TraineeDashboard.mountCards;
   this adapter is the host side of that delegation:
     - reviewInputFromPrepared maps ONE career_apply_prepared row to the F2
       review card's canonical input. Verification is derived exactly the way
       175's own v2 reader derives it: a field is verified iff the prepared
       field carries its confirmation_event_id — provenance on the record,
       never assumed. A field without one renders UNVERIFIED, loudly.
     - batchStateFromPrepared builds the executor's stored batch shape for
       the same row (one application at awaiting_attestation under the
       prepared row's payload hash as the card set hash).
     - commitPrepared is the production commit seam: 175's tapReviewCommit
       over that stored state — the mint binds run + the exact payload hash
       the card showed. The dashboard host may inject its own commit via
       createMountFn deps (the seam receives (set, card, row) — the exact
       reviewed partition, every application once).
   Nothing here rebuilds the card, re-derives its bindings, submits anything,
   or flips a flag: approval records the batch approval only, flag OFF. */
(function (root, build) {
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TraineeDashboardF2Mount = api;
})(globalThis, function () {
  'use strict';

  const getUi = () => {
    if (typeof CareerApprovalUi !== 'undefined') return CareerApprovalUi;
    try { return require('../packages/domain/175-career-approval-ui.js'); } catch { return null; }
  };
  const text = v => (typeof v === 'string' ? v : v == null ? '' : String(v));

  function reviewInputFromPrepared(row, opts = {}) {
    const payload = (row && row.payload) || {};
    const fields = (Array.isArray(payload.fields) ? payload.fields : []).map(f => ({
      name: text(f.name),
      label: text(f.label) || text(f.name),
      value: f.value,
      kind: f.kind || 'text',
      factId: f.factId || null,
      // Provenance-backed verification (175's v2 rule): the prepared field
      // itself must carry the confirmation event that verified it.
      verification: f.confirmation_event_id ? 'verified' : 'unverified',
    }));
    return {
      runId: row.id,
      cardSha256: row.payload_hash,
      world: opts.world || null,
      applications: [{
        id: row.job_id,
        jobTitle: payload.job_title || payload.title || null,
        company: row.company,
        location: payload.location || null,
        url: row.url || payload.url || null,
        matchReason: payload.match_reason || null,
        payloadSha256: row.payload_hash || null,
        fields,
        blank: Array.isArray(payload.blank) ? payload.blank.slice() : [],
      }],
    };
  }

  function batchStateFromPrepared(row) {
    const payload = (row && row.payload) || {};
    return {
      id: row.id,
      userId: row.user_id || null,
      status: 'awaiting_approval',
      cardSha256: row.payload_hash,
      familyText: '',
      requested: 1,
      apps: {
        [row.job_id]: {
          postingKey: row.job_id,
          company: row.company,
          role: payload.job_title || payload.title || null,
          url: row.url || payload.url || null,
          stage: 'awaiting_attestation',
          payloadSha256: null, // stored shape: the batch-level binding is the card set hash
        },
      },
    };
  }

  // The production commit seam for one prepared row: 175's tapReviewCommit
  // (the existing mint, unchanged) against the row's stored batch state.
  function commitPrepared(row, card, opts = {}) {
    const ui = opts.ui || getUi();
    if (!ui) return { ok: false, code: 'NO_APPROVAL_UI', reason: 'the F2 approval module is not loaded' };
    return ui.tapReviewCommit(card, batchStateFromPrepared(row), opts.tapOpts || {});
  }

  // The mountFn TraineeDashboard.mountCards delegates with:
  // (slotElement, preparedRow) per awaiting-approval slot.
  function createMountFn(deps = {}) {
    return function mountF2Card(slot, row) {
      const ui = deps.ui || getUi();
      if (!ui) { slot.textContent = 'Approval card unavailable: the review component is not loaded.'; return { ok: false, code: 'NO_APPROVAL_UI' }; }
      if (!row) { slot.textContent = 'Approval card unavailable: the prepared record is missing.'; return { ok: false, code: 'NO_PREPARED_ROW' }; }
      const built = ui.buildReviewCard(reviewInputFromPrepared(row, deps));
      if (!built.ok) {
        // An honest refusal on the surface, never an invented card.
        slot.textContent = 'Approval card unavailable: ' + (built.reason || built.code);
        return built;
      }
      const commit = typeof deps.commit === 'function'
        ? (set, card) => deps.commit(set, card, row)
        : (set, card) => commitPrepared(row, card, deps);
      return ui.wireReviewCard(slot, built.card, { commit, onChange: deps.onChange });
    };
  }

  return Object.freeze({ reviewInputFromPrepared, batchStateFromPrepared, commitPrepared, createMountFn });
});
