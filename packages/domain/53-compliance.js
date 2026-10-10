  /* Compliance and honest capability gating (Instinct spec doc 14): the pure
     half. The regulated map as data (surface -> requirement -> partner state),
     one gate the loop calls before every act, the versioned disclosure library
     that fires contextually once, the incident playbooks as step lists, the
     KYC handoff states, and the completeness check that every registry
     capability resolves to "unregulated" or a named requirement. A capability
     with a requirement and no live partner is blocked in code with a specific
     message. Nothing here is legal advice; it is the product's honesty
     contract encoded. The edge wiring is Codex's; this is what it imports. */
  const Compliance = (() => {
    // The regulated map. requirement: what must exist; partner_key: the partners record key whose live:true unblocks it.
    const REQUIREMENTS = Object.freeze({
      money_transmission_hold: { surface: "holding money, stored balances", regulated: "money transmission, state by state", requirement: "partner bank or BaaS (Unit, Column, Increase class); Upmore never holds user funds itself", partner_key: "baas" },
      money_movement: { surface: "moving money (ACH, wires)", regulated: "money transmission, KYC/AML", requirement: "money-movement partner with a KYC flow; sanctions screening on recipients", partner_key: "money_movement" },
      closed_network_send: { surface: "Zelle, Venmo, Cash App sends", regulated: "closed networks", requirement: "a bank partnership for Zelle, or no direct rail: the handoff pattern, said plainly", partner_key: "zelle_bank" },
      securities_execution: { surface: "executing securities orders", regulated: "broker-dealer activity", requirement: "broker-dealer partner (Alpaca, DriveWealth class); user-directed orders only", partner_key: "broker_dealer" },
      investment_advice: { surface: "personalized investment advice", regulated: "Investment Advisers Act", requirement: "not done (doc 09); an RIA registration or partner only as a deliberate later step", partner_key: null, never: true },
      credit_data: { surface: "credit score and report data", regulated: "FCRA", requirement: "permissible purpose through bureau partnerships or consumer-authorized surfaces", partner_key: "credit_bureau" },
      credit_repair: { surface: "credit repair, disputes", regulated: "CROA, FCRA process", requirement: "drafts and guidance; the user files; no 'we fix your credit' claims", partner_key: null, user_files: true },
      bill_negotiation: { surface: "bill negotiation as a service", regulated: "generally unregulated; some states watch fee models", requirement: "flat or success-fee disclosures; the agent identifies itself as an assistant when asked", partner_key: null, disclosure: "negotiation" },
      insurance_binding: { surface: "insurance rebid and binding", regulated: "insurance producer licensing per state", requirement: "quotes and comparisons are fine; binding coverage goes through licensed brokers or carriers", partner_key: "insurance_broker" },
      tax_filing: { surface: "tax filing", regulated: "IRS e-file provider rules", requirement: "track, organize, export; do not file; a filing partner only if ever", partner_key: "tax_filer" },
      data_aggregation: { surface: "data aggregation", regulated: "CFPB 1033, aggregator agreements, GLBA", requirement: "contracted aggregator access, consent records (doc 04), GLBA privacy program", partner_key: "aggregator" },
      lending: { surface: "lending or BNPL origination", regulated: "lending licenses, TILA", requirement: "never originates; surfaces alternatives and math only", partner_key: null, never: true }
    });
    // Capability -> requirement. Everything not listed is unregulated (information, math, drafts the user sends, education).
    const MAP = Object.freeze({
      "PAY-001": "money_movement", "PAY-002": "money_movement", "PAY-005": "money_movement", "PAY-006": "money_movement", "PAY-007": "money_movement", "PAY-008": "money_movement", "PAY-009": "money_movement", "PAY-010": "money_movement", "PAY-011": "money_movement", "PAY-016": "money_movement", "PAY-023": "money_movement", "PAY-025": "money_movement", "HOUS-002": "money_movement", "SOC-004": "money_movement", "SOC-005": "money_movement", "SOC-008": "money_movement", "SAVE-001": "money_movement", "SAVE-006": "money_movement", "SAVE-021": "money_movement", "SAVE-022": "money_movement", "BILL-008": "money_movement",
      "PAY-012": "closed_network_send", "PAY-013": "closed_network_send", "PAY-014": "closed_network_send", "PAY-015": "closed_network_send",
      "INV-011": "securities_execution", "INV-012": "securities_execution", "INV-013": "securities_execution", "INV-014": "securities_execution",
      "INV-024": "investment_advice",
      "CRDT-001": "credit_data", "CRDT-002": "credit_data", "CRDT-007": "credit_data", "SEC-005": "credit_data",
      "CRDT-004": "credit_repair", "CRDT-016": "credit_repair",
      "BILL-005": "bill_negotiation", "SAVE-007": "bill_negotiation",
      "SAVE-008": "insurance_binding", "INS-004": "insurance_binding",
      "TAX-011": "tax_filing", "TAX-012": "tax_filing",
      "ACCT-006": "data_aggregation", "ACCT-009": "data_aggregation",
      "SOC-007": "money_transmission_hold", "CARD-012": "money_transmission_hold"
    });
    // Capabilities under a requirement that remain allowed because they only draft, compare, track or inform; the user acts.
    const INFORMATION_ONLY = new Set(["INV-024", "CRDT-004", "CRDT-016", "BILL-005", "SAVE-007", "INS-004", "TAX-011", "TAX-012", "SAVE-008"]);

    // The gate: one call site in the loop before every act. partners: {money_movement: {live: true, name: "..."}, ...}
    function gate(capability, partners, ctx) {
      const cap = capability || {}, c = ctx || {}, p = partners || {};
      const reqKey = MAP[cap.id];
      if (!reqKey) return { allowed: true, regulated: false, requirement: null };
      const req = REQUIREMENTS[reqKey];
      if (req.never) return { allowed: INFORMATION_ONLY.has(cap.id), regulated: true, requirement: reqKey, reason: INFORMATION_ONLY.has(cap.id) ? null : "never", message: INFORMATION_ONLY.has(cap.id) ? null : `${cap.name || cap.id} is something Upmore does not do: ${req.requirement}.` };
      if (INFORMATION_ONLY.has(cap.id) && !c.executes) return { allowed: true, regulated: true, requirement: reqKey, user_files: !!req.user_files, disclosure: req.disclosure || null };
      const partner = req.partner_key ? p[req.partner_key] : null;
      if (partner && partner.live === true) {
        if (req.partner_key === "money_movement" && c.kyc && c.kyc.state !== "verified") return { allowed: false, regulated: true, requirement: reqKey, reason: "kyc_" + c.kyc.state, message: kycMessage(c.kyc, partner) };
        return { allowed: true, regulated: true, requirement: reqKey, partner: partner.name || req.partner_key };
      }
      const plain = { money_movement: `I can't move money on a real rail yet: that needs a licensed money-movement partner with identity checks. I can stage it for you to send from your bank app and confirm when it lands.`, closed_network_send: `I can't send through ${(cap.name || "that app").replace(/ via .*$/, "")} directly: it has no third-party rail. I'll stage it in the app, step by step, and confirm when it lands.`, securities_execution: `I can't place orders yet: that needs a broker-dealer partner. I can show the data and the exact order, and you place it.`, credit_data: `I can't pull credit data yet: that needs a bureau partnership or your own authorized surface. Connect your issuer's score or a consumer-authorized service and I'll read it.`, insurance_binding: `I can compare quotes, but binding coverage goes through a licensed broker or carrier.`, tax_filing: `I track and export; filing goes through a filing product you choose.`, data_aggregation: `Connecting accounts needs the aggregator contract in place; until then, manual import works.`, money_transmission_hold: `Upmore never holds money itself; that needs a partner bank.` }[reqKey] || `${cap.name || cap.id} needs ${req.requirement}.`;
      return { allowed: false, regulated: true, requirement: reqKey, reason: "no_live_partner", message: plain };
    }
    function kycMessage(kyc, partner) {
      const who = partner && partner.name ? partner.name : "the payment partner";
      return { pending: `Identity verification is pending with ${who}, usually a day. I'll tell you the moment it clears; nothing moves until then.`, needs_info: `${who} needs identity details before the first send: legal name, date of birth, address and SSN, collected in their hosted form, never stored by Upmore. Want the link?`, review: `${who} is reviewing the verification. That can take a few days; I'll follow up.`, rejected: `${who} could not verify identity, so sends are off until that is resolved with them.` }[kyc.state] || `Identity verification with ${who} is ${kyc.state}.`;
    }
    // KYC handoff states: the partner's hosted flow collects; Upmore only tracks the state and explains why.
    const KYC_STATES = Object.freeze(["not_started", "needs_info", "pending", "review", "verified", "rejected"]);
    function kyc(current, event) {
      const s = current || { state: "not_started" }, next = { not_started: { start: "needs_info" }, needs_info: { submitted: "pending" }, pending: { cleared: "verified", flagged: "review", failed: "rejected" }, review: { cleared: "verified", failed: "rejected" }, verified: {}, rejected: { restart: "needs_info" } }[s.state];
      if (!next || !next[event]) throw new Error(`KYC: event ${event} is not valid in state ${s.state}`);
      return { state: next[event], explanation: "The first send through a partner rail triggers the partner's identity check; it explains why before asking, collects through the partner's hosted form, and Upmore never stores the SSN.", history: (s.history || []).concat([{ from: s.state, event, to: next[event] }]) };
    }
    // Completeness: every registry capability resolves to unregulated or a named requirement with a partner state.
    function resolveAll(registryCapabilities, partners) {
      return (registryCapabilities || []).map(c => { const key = MAP[c.id]; if (!key) return { id: c.id, resolution: "unregulated" }; const req = REQUIREMENTS[key], partner = req.partner_key ? (partners || {})[req.partner_key] : null; return { id: c.id, resolution: key, partner_state: req.never ? "never" : req.partner_key ? (partner && partner.live ? "live" : "not_signed") : "user_acts", information_only: INFORMATION_ONLY.has(c.id) }; });
    }

    // Disclosures: versioned, one per surface, short and plain, triggered contextually and shown once per conversation. Never stacked.
    const DISCLOSURES = Object.freeze({
      investing: { version: 1, trigger: "first investing topic in a conversation", text: "I can show you data and execute what you decide. I don't give investment advice." },
      first_send: { version: 1, trigger: "first money send in a conversation", text: "Sends on Venmo, Zelle and Cash App can't be pulled back once received. I'll read every send back to you before anything moves." },
      negotiation: { version: 1, trigger: "first bill negotiation", text: "If I run a chat for you I'll say I'm an assistant when asked, and I'll never misstate your situation. Outcomes vary; nothing is guaranteed." },
      credit_drafts: { version: 1, trigger: "first credit dispute or collector draft", text: "This is a template you send yourself, not legal advice. Upmore doesn't repair credit or promise results." },
      aggregator: { version: 1, trigger: "first account connection", text: "Connecting uses a licensed aggregator with read-only access. You can see and revoke every connection, and revoking deletes the token." },
      insurance: { version: 1, trigger: "first insurance comparison", text: "I compare quotes and coverage. Binding a policy goes through a licensed broker or carrier." },
      tax: { version: 1, trigger: "first tax topic", text: "I organize and export your tax documents. I don't file; your filing product or preparer does." }
    });
    function disclosure(surface, conversation) {
      const d = DISCLOSURES[surface]; if (!d) throw new Error(`no disclosure for ${surface}`);
      const c = conversation || {}; c.disclosed = c.disclosed || {};
      if (c.disclosed[surface] === d.version) return null;
      c.disclosed[surface] = d.version;
      return { surface, version: d.version, text: d.text };
    }
    // Incident playbooks as step lists; each executes against fixtures through injected actions and records every step.
    const PLAYBOOKS = Object.freeze({
      unauthorized_transaction: ["freeze_new_actions_on_account", "collect_transaction_evidence", "start_rail_dispute", "preserve_evidence", "schedule_follow_up_until_resolved"],
      agent_error: ["own_it_first_sentence", "execute_reversal_contract", "file_postmortem_scenario", "compensate_per_policy"],
      data_breach: ["revoke_affected_tokens", "notify_user_with_specifics", "rotate_credentials"],
      partner_outage: ["mark_connectors_degraded", "serve_last_good_with_age", "suppress_fresh_claims", "notify_once"]
    });
    async function runPlaybook(kind, actions, incident) {
      const steps = PLAYBOOKS[kind]; if (!steps) throw new Error(`no playbook for ${kind}`);
      const record = [];
      for (const step of steps) { const fn = actions && actions[step]; if (typeof fn !== "function") { record.push({ step, status: "missing_action" }); break; } try { const out = await fn(incident); record.push({ step, status: "done", out }); } catch (e) { record.push({ step, status: "failed", error: String(e && e.message || e) }); break; } }
      const complete = record.length === steps.length && record.every(r => r.status === "done");
      return { kind, complete, steps: record, first_line: kind === "agent_error" ? `I got this wrong: ${incident && incident.what || "the action"}. Here is what I'm doing about it right now.` : null };
    }
    // Negative space: claims in user-facing templates must match the registry's proven set. A claim is a named capability the text says Upmore does.
    function claimsAudit(texts, registry) {
      const findings = [], caps = registry.list ? registry.list() : [];
      const stem = c => c.name.split(" ").slice(0, 2).join("\\s+").replace(/[()]/g, "");
      for (const t of texts || []) {
        const hits = caps.map(c => { const re = new RegExp(`\\b(i can|upmore can|we can|i will|i'll)\\b[^.]{0,40}\\b${stem(c)}\\b`, "i"); const m = t.text.match(re); return m ? { c, match: m[0] } : null; }).filter(Boolean);
        // A claim is backed when any proven capability carries the same words ("refund request" is backed by the tested fee refund, not an overclaim of the unbuilt outage refund).
        const proven = caps.filter(c => ["TESTED", "VERIFIED"].includes(c.status));
        for (const h of hits) {
          if (["TESTED", "VERIFIED"].includes(h.c.status)) continue;
          const words = h.c.name.split(" ").slice(0, 2).join(" ").toLowerCase();
          if (proven.some(pc => pc.name.toLowerCase().includes(words))) continue; // "refund request" is backed by the tested "fee refund request"
          findings.push({ where: t.where, capability: h.c.id, status: h.c.status, match: h.match });
        }
      }
      return { ok: findings.length === 0, findings };
    }
    return { REQUIREMENTS, MAP, INFORMATION_ONLY, gate, kyc, KYC_STATES, resolveAll, DISCLOSURES, disclosure, PLAYBOOKS, runPlaybook, claimsAudit };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = Compliance;
