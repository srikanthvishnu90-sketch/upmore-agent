'use strict';
// Visible, fictional consumer fixtures. A owns the eventual shared schema.
const crypto = require('node:crypto');
const copy = x => JSON.parse(JSON.stringify(x));
const canonical = x => x === null || typeof x !== 'object' ? JSON.stringify(x) : Array.isArray(x) ? '[' + x.map(canonical).join(',') + ']' : '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
const hash = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : canonical(x)).digest('hex');
function snapshot() {
  const owner_id = 'synthetic-owner-a', thread_id = 'synthetic-thread-a';
  const row = (id, kind, value) => ({ id, version: 1, owner_id, thread_id, scope: 'thread', kind, value,
    provenance: { source_id: 'resume-v1', span: 'synthetic source excerpt' }, trust: 'user_supplied', validity: { status: 'active', epoch: 1 } });
  return { contract_version: 'career_journey_context/v1', owner_id, thread_id, captured_at: '2026-10-16T12:00:00Z',
    binding: { epoch: 1, account_version: 1, thread_revision: 1, context_sha256: hash('synthetic-context-v1') },
    facts: [row('project', 'project', 'I proposed duplicate detection for a class import tool; a teammate implemented it. A small test batch stopped duplicating rows; production was not measured.'), row('target', 'target', { role: 'Software engineer intern', level: 'early-career', company: null, stage: null }), row('resume', 'resume', { artifact_id: 'resume-v1', sha256: hash('synthetic-resume-v1') })],
    sources: [], dialogue: [], current_draft: null, goals: [], pending_asks: [], invalidations: [], tool_status: [], receipts: [], artifacts: [], assessments: [],
    capabilities: [{ id: 'interview.coach.v1', status: 'available', version: 1, reason: 'scripted contract only' }, { id: 'interview.local_draft.v1', status: 'available', version: 1, reason: 'scripted file sink only' }, { id: 'research.exact_url.v1', status: 'not_wired', version: 1, reason: 'no host tool in this fixture' }] };
}
const event = (id, type, args = {}) => ({ id, type, at: '2026-10-16T12:01:00Z', ...args });
const start = () => event('start', 'start', { journey_id: 'synthetic-journey', target_ref: { id: 'target', version: 1 }, resume_ref: { id: 'resume', version: 1 }, available_minutes: 30, mode: 'coaching', scripted: true });
module.exports = { copy, canonical, hash, snapshot, event, start };
