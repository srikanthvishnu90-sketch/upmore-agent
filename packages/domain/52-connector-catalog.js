  /* Connector catalog logic (Instinct spec doc 05). Validates the catalog
     table (packages/connectors/catalog.json): valid auth method, capabilities
     that exist in the registry, gated rows with reasons, write actions never
     promised beyond what an adapter can do, a last-checked date per row. Also
     answers "what can you connect" from the table, so the answer is complete
     and never aspirational, and runs the coverage test against financial
     life scenarios. Pure. */
  const ConnectorCatalog = (() => {
    const AUTH = ["AGGREGATOR", "OAUTH", "VAULTED_CREDENTIALS", "MANUAL", "PUBLIC_DATA"];
    const ID = /^[A-Z]{3,4}-\d{3}$/;
    function validate(catalog, registry) {
      const errors = [], ids = new Set((registry && registry.capabilities || []).map(c => c.id)), seen = new Set();
      for (const c of catalog && catalog.connectors || []) {
        const tag = c.provider || "?";
        if (!c.provider || seen.has(c.provider)) errors.push(`${tag}: missing or duplicate provider id`); seen.add(c.provider);
        if (!AUTH.includes(c.auth_method)) errors.push(`${tag}: invalid auth method ${c.auth_method}`);
        if (![1, 2, 3].includes(c.wave)) errors.push(`${tag}: wave must be 1, 2 or 3`);
        if (!c.reliability_class) errors.push(`${tag}: reliability class missing`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.last_checked || ""))) errors.push(`${tag}: last_checked date missing`);
        if (!Array.isArray(c.capabilities) || !c.capabilities.length) errors.push(`${tag}: no capabilities`);
        for (const id of c.capabilities || []) if (!ID.test(id) || !ids.has(id)) errors.push(`${tag}: capability ${id} is not in the registry`);
        for (const w of c.write_actions || []) { if (!w.capability || !ids.has(w.capability)) errors.push(`${tag}: write action cites unknown capability ${w.capability}`); if (!/^T[3-5]$/.test(w.tier || "")) errors.push(`${tag}: write action ${w.action} must be T3 or above`); if (!w.gated && !(c.adapter_state && /live/.test(c.adapter_state))) errors.push(`${tag}: write action ${w.action} promised without a live adapter and no gated reason`); }
        if (c.gated_reason === "" ) errors.push(`${tag}: empty gated reason`);
        if (c.auth_method === "VAULTED_CREDENTIALS" && !/low/.test(c.reliability_class)) errors.push(`${tag}: vaulted credentials must be labeled the least reliable class`);
      }
      return errors;
    }
    // "What can you connect": generated from the table. A surface the catalog does not cover is an honest gap, said as such.
    function answer(catalog, surface) {
      const s = String(surface || "").toLowerCase().trim();
      const hits = (catalog.connectors || []).filter(c => c.display_name.toLowerCase().includes(s) || c.provider.includes(s.replace(/\s+/g, "-")) || c.domain.toLowerCase().includes(s));
      if (!hits.length) return { covered: false, text: `I can't connect ${surface} yet; it isn't in the connector catalog. CSV import always works as the floor.`, rows: [] };
      return { covered: true, rows: hits, text: hits.map(c => `${c.display_name}: yes, via ${c.auth_method.toLowerCase().replace(/_/g, " ")} (${c.reliability_class})${c.adapter_state === "none" ? "; adapter not built yet" : ""}${c.gated_reason ? "; gated: " + c.gated_reason : ""}${(c.write_actions || []).filter(w => w.gated).map(w => `; ${w.action} gated: ${w.gated}`).join("")}`).join(". ") };
    }
    // Coverage: for a life described as surfaces, every surface answers yes via a connector or is an unlabeled gap.
    function coverage(catalog, lives) {
      const out = [];
      for (const life of lives || []) { const gaps = []; for (const surface of life.surfaces) { const a = answer(catalog, surface); if (!a.covered) gaps.push(surface); } out.push({ id: life.id, surfaces: life.surfaces.length, gaps }); }
      return { lives: out, ok: out.every(l => !l.gaps.length), gaps: out.flatMap(l => l.gaps.map(g => `${l.id}: ${g}`)) };
    }
    const byWave = catalog => [1, 2, 3].map(w => ({ wave: w, connectors: (catalog.connectors || []).filter(c => c.wave === w).map(c => c.provider) }));
    return { AUTH, validate, answer, coverage, byWave };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = ConnectorCatalog;
