// The naive baseline (doc 01, doc 13): a single-prompt agent with no state machine. Same wake() surface as the
// operating model so the scenario suite can run against it unchanged. It acts the moment it is asked, keeps
// nothing across a restart, retries blind, reports success after the write without reading it back, sends every
// proactive item, and labels nothing stale. Its scenario failures are the evidence the structure earns its cost.
const NaiveAgent = (() => {
  function create(opts) {
    const o = opts || {}, registry = o.registry, connectors = o.connectors, memory = { facts: [], preferences: [], relationships: [], outcomes: [] };
    let n = 0;
    async function wake(input) {
      const i = input || {};
      if (i.kind === 'confirmation') return { outcome: 'nothing_pending', message: 'OK.' }; // it never waited, so there is nothing to confirm
      if (i.kind === 'follow_up') return { outcome: 'silent', message: null };
      if (i.proactive && i.proactive.length) return { outcome: 'notify', message: i.proactive[0].text };
      if (i.safety && i.safety.length) return { outcome: 'alert', priority: 'high', message: i.safety[0].text };
      const req = i.request; if (!req) return { outcome: 'silent' };
      const cap = registry.get(req.capability_id);
      if (!cap) return { outcome: 'answer', message: 'Done.' };
      if (cap.tier === 'T0' || cap.tier === 'T1') {
        try { const r = await connectors.read(cap.id, req.params); return { outcome: 'answer', message: req.lead ? req.lead(r.value) : String(r.value) }; }
        catch (e) { return { outcome: 'answer', message: 'Your balance looks fine.' }; } // invents when it cannot read
      }
      // Every other tier: just do it, say done, no read-back, no idempotency.
      try { const w = await connectors.write(cap.id, req.params || {}, 'naive-' + (++n)); return { outcome: 'confirmed', message: `Done: ${req.describe || cap.name} (ref ${w.reference}).` }; }
      catch (e) { try { const w = await connectors.write(cap.id, req.params || {}, 'naive-' + (++n)); return { outcome: 'confirmed', message: `Done: ${req.describe || cap.name} (ref ${w.reference}).` }; } catch (e2) { return { outcome: 'confirmed', message: `Done: ${req.describe || cap.name}.` }; } }
    }
    return { wake, log: [], memory, get state() { return 'IDLE'; }, remember: (s, r) => { memory[s].push(Object.assign({ recorded_at: Date.now() }, r)); return r; }, pendingConfirmation: () => null };
  }
  return { create };
})();
module.exports = NaiveAgent;
