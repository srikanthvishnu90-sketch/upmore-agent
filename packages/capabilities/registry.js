  /* Capability registry: the single source of truth for what Upmore can do
     (Instinct spec doc 02). Pure: validates the generated registry.json and
     answers status questions. A capability absent here is not claimed; a
     capability present here is described only by its recorded status. */
  const CapabilityRegistry = (() => {
    const STATUSES = ["CLAIMED", "BUILT", "TESTED", "VERIFIED", "GATED", "NOT_WIRED"];
    const TIERS = ["T0", "T1", "T2", "T3", "T4", "T5"];
    const PROVEN = ["TESTED", "VERIFIED"];
    const ID = /^[A-Z]{3,4}-\d{3}$/;
    const PHRASE = {
      CLAIMED: "is planned but not built yet",
      BUILT: "is built but not yet proven by its acceptance test",
      TESTED: "is built and passes its acceptance test locally; it has not run against a live account",
      VERIFIED: "is built and verified against a live sandbox or real account",
      GATED: "is blocked until a licensed partner or rail is in place",
      NOT_WIRED: "exists in code but its rail is not connected"
    };

    // fileExists lets the caller prove test references without the module touching disk.
    function validate(registry, fileExists) {
      const errors = [];
      const rows = registry && Array.isArray(registry.capabilities) ? registry.capabilities : null;
      if (!rows) return ["registry has no capabilities array"];
      const seen = new Set();
      for (const c of rows) {
        const tag = c && c.id ? c.id : JSON.stringify(c).slice(0, 40);
        if (!c || !ID.test(c.id || "")) { errors.push(`${tag}: malformed id`); continue; }
        if (seen.has(c.id)) errors.push(`${c.id}: duplicate id`);
        seen.add(c.id);
        if (!c.name || !c.domain || !c.owner_doc) errors.push(`${c.id}: missing name, domain or owner_doc`);
        if (!TIERS.includes(c.tier)) errors.push(`${c.id}: invalid tier ${c.tier}`);
        if (!STATUSES.includes(c.status)) errors.push(`${c.id}: invalid status ${c.status}`);
        if (PROVEN.includes(c.status)) {
          if (!c.test_ref) errors.push(`${c.id}: ${c.status} without a test_ref`);
          else if (fileExists && !fileExists(c.test_ref)) errors.push(`${c.id}: test_ref ${c.test_ref} does not exist`);
        }
        if (c.status === "VERIFIED" && !(c.evidence_ref && (!fileExists || fileExists(c.evidence_ref))))
          errors.push(`${c.id}: VERIFIED without an existing evidence_ref`);
        if (c.status === "GATED" && !c.gate_reason) errors.push(`${c.id}: GATED without a gate_reason`);
        if (c.status === "BUILT" && !(Array.isArray(c.implementation) && c.implementation.length))
          errors.push(`${c.id}: BUILT without implementation files`);
      }
      return errors;
    }

    function load(registry, fileExists) {
      const errors = validate(registry, fileExists);
      if (errors.length) throw new Error("Capability registry invalid:\n" + errors.join("\n"));
      const byId = new Map(registry.capabilities.map(c => [c.id, c]));
      const list = f => registry.capabilities.filter(f || (() => true));
      const summary = () => {
        const out = {};
        for (const c of registry.capabilities) {
          const d = out[c.domain_code] || (out[c.domain_code] = {domain: c.domain, total: 0});
          d.total++; d[c.status] = (d[c.status] || 0) + 1;
        }
        return out;
      };
      // CORE-002: the honest answer to "can you do X?" for a known capability.
      const answer = id => {
        const c = byId.get(id);
        if (!c) return {known: false, text: "That is not a registered capability, so Upmore does not claim it."};
        let text = `${c.name} (${c.id}) ${PHRASE[c.status]}.`;
        if (c.status === "GATED") text += ` ${c.gate_reason}`;
        if (c.note) text += ` ${c.note}`;
        return {known: true, id: c.id, status: c.status, tier: c.tier, text};
      };
      return {get: id => byId.get(id) || null, list, summary, answer, size: byId.size,
        proven: () => list(c => PROVEN.includes(c.status)).map(c => c.id)};
    }
    return {validate, load, STATUSES, TIERS};
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = CapabilityRegistry;
