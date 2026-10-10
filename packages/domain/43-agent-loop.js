  /* Agent operating model (Instinct spec doc 01). Pure and deterministic:
     the loop is a persisted state machine, not a prompt. Every wake runs
     observe -> understand -> decide -> gate -> act -> verify -> remember.
     Connectors, clock and the capability registry are injected, so the loop
     is testable with in-memory fakes. A money write is never repeated
     blindly: it carries an idempotency key, and an ambiguous first attempt
     becomes "unknown" until the connector reconciles it. */
  const AgentLoop = (() => {
    const STATES = ["IDLE", "OBSERVING", "DECIDING", "AWAITING_CONFIRMATION", "ACTING", "VERIFYING", "FOLLOW_UP_SCHEDULED"];
    const TIERS = { T0: "inform", T1: "watch", T2: "draft", T3: "confirm", T4: "envelope", T5: "never_autonomous" };
    const DAY = 86400000, WEEK = 7 * DAY;
    const BUDGET = { per_day: 1, per_week: 4 };
    const STORES = ["facts", "preferences", "relationships", "outcomes"];
    const text = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 200);

    function createMemory(initial) {
      const m = {};
      for (const s of STORES) m[s] = Array.isArray(initial && initial[s]) ? initial[s].slice() : [];
      return m;
    }
    // Facts always carry their source and as-of time; corrections are stored verbatim with the action they corrected.
    function remember(memory, store, record, now) {
      if (!STORES.includes(store)) throw new Error("Unknown memory store.");
      if (store === "facts" && !(record.source && record.as_of)) throw new Error("A fact needs a source and an as-of time.");
      if (store === "outcomes" && record.correction !== undefined && typeof record.correction !== "string") throw new Error("A correction is stored verbatim.");
      memory[store].push(Object.assign({ recorded_at: now }, record));
      return memory[store][memory[store].length - 1];
    }

    // Autonomy gate: the tier is part of the capability definition, never a runtime guess.
    function gate(cap, action, envelopes, now) {
      if (!cap) return { allowed: false, reason: "unknown_capability" };
      const t = cap.tier;
      if (cap.status === "GATED") return { allowed: false, reason: "gated", detail: cap.gate_reason || null };
      if (cap.status === "CLAIMED" || cap.status === "NOT_WIRED") return { allowed: false, reason: "not_built" };
      if (t === "T0" || t === "T1") return { allowed: true, confirm: false };
      if (t === "T2") return { allowed: true, confirm: true, draft_only: true };
      if (t === "T5") return { allowed: true, confirm: true, always: true };
      if (t === "T3") return { allowed: true, confirm: true };
      if (t === "T4") {
        const env = (envelopes || []).find(e => e.capability_id === cap.id && e.active !== false && (!e.expires_at || e.expires_at > now));
        if (!env) return { allowed: true, confirm: true, reason: "no_envelope" };
        // The envelope is checked against the exact values that will be written, never a summary the caller supplied separately.
        const p = (action && action.params) || {};
        const amt = Number(p.amount_cents !== undefined ? p.amount_cents : action && action.amount_cents);
        const recipient = p.recipient !== undefined ? p.recipient : action && action.recipient;
        if (!Number.isSafeInteger(amt) || amt < 0) return { allowed: true, confirm: true, reason: "amount_unknown" };
        if (amt > env.max_cents) return { allowed: true, confirm: true, reason: "outside_envelope" };
        if (env.recipient && recipient !== env.recipient) return { allowed: true, confirm: true, reason: "outside_envelope" };
        if (action.first_time) return { allowed: true, confirm: true, reason: "first_time_is_T5" };
        return { allowed: true, confirm: false, envelope: env.id };
      }
      return { allowed: false, reason: "invalid_tier" };
    }

    // Proactive messages: one per day, four per week, unless urgent, asked-for cadence, or a real deadline.
    function budgetAllows(sent, item, now) {
      if (item.urgent || item.cadence_requested) return { allowed: true, reason: item.urgent ? "urgent" : "cadence_requested" };
      if (item.deadline && item.deadline - now <= 2 * DAY && item.deadline >= now) return { allowed: true, reason: "deadline" };
      const day = sent.filter(t => now - t < DAY).length, week = sent.filter(t => now - t < WEEK).length;
      if (day >= BUDGET.per_day) return { allowed: false, reason: "daily_budget" };
      if (week >= BUDGET.per_week) return { allowed: false, reason: "weekly_budget" };
      if (!item.reason) return { allowed: false, reason: "no_stated_reason" };
      return { allowed: true, reason: "budget" };
    }

    // Decision order: safety, direct request, commitments due, standing watches, proactive within budget, else silence.
    function decide(obs, ctx) {
      if (obs.safety && obs.safety.length) return { decision: "alert", priority: "high", item: obs.safety[0], why: "safety" };
      if (obs.request) return { decision: obs.request.ask ? "ask" : "act", item: obs.request, why: "direct_request" };
      const due = (obs.commitments || []).filter(c => c.due_at <= ctx.now);
      if (due.length) return { decision: due[0].ask ? "ask" : "act", item: due[0], why: "commitment" };
      if (obs.watches && obs.watches.length) return { decision: "notify", item: obs.watches[0], why: "standing_watch" };
      for (const p of obs.proactive || []) {
        const b = budgetAllows(ctx.sent, p, ctx.now);
        if (b.allowed) return { decision: "notify", item: p, why: "proactive", budget: b.reason };
        ctx.suppressed.push({ key: p.key, reason: b.reason });
      }
      return { decision: "silent", why: "nothing_to_say" };
    }

    function create(opts) {
      const o = opts || {};
      const registry = o.registry; if (!registry || typeof registry.get !== "function") throw new Error("A capability registry is required.");
      const connectors = o.connectors; if (!connectors || typeof connectors.read !== "function" || typeof connectors.write !== "function" || typeof connectors.verify !== "function") throw new Error("Connectors need read, write and verify.");
      const clock = o.clock || (() => Date.now());
      const log = Array.isArray(o.log) ? o.log : [];
      const memory = createMemory(o.memory);
      const envelopes = Array.isArray(o.envelopes) ? o.envelopes : [];
      const sent = Array.isArray(o.sent) ? o.sent.slice() : [];
      let state = log.length ? log[log.length - 1].to : "IDLE";
      let pending = null; // the confirmation we are waiting on
      const seq = () => log.length + 1;
      function transition(to, input, output) {
        if (!STATES.includes(to)) throw new Error("Unknown state " + to);
        const e = { seq: seq(), at: clock(), from: state, to, input: input === undefined ? null : input, output: output === undefined ? null : output };
        log.push(e); state = to;
        if (typeof o.persist === "function") o.persist(e);
        return e;
      }
      const idle = (input, output) => { transition("IDLE", input, output); return output; };

      function compose(kind, fields) {
        // Lead with the number or decision, then source and as-of time (doc 11 owns the full voice).
        const f = fields || {};
        if (kind === "answer") return `${f.lead}${f.source ? ` (${f.source}, as of ${f.as_of}${f.stale ? ", which is stale" : ""})` : ""}`;
        if (kind === "confirm") return `Confirm: ${f.action} ${f.amount || ""}${f.recipient ? ` to ${f.recipient}` : ""}${f.from ? ` from ${f.from}` : ""}${f.fee ? `, fee ${f.fee}` : ", no fee"}${f.when ? `, ${f.when}` : ""}. Reply yes to proceed.`.replace(/\s+/g, " ");
        if (kind === "receipt") return `Done: ${f.action}${f.reference ? ` (ref ${f.reference})` : ""}. ${f.verified ? "Confirmed by " + f.source + "." : "Not yet confirmed by the rail; I will follow up."}`;
        if (kind === "unknown") return `I could not confirm whether ${f.action} went through. I have not retried, and I will not until the record is reconciled. Nothing else was changed.`;
        if (kind === "blocked") return f.text;
        return text(f.text, 500);
      }

      async function read(capId, params) {
        try {
          const raw = await connectors.read(capId, params);
          if (!raw || !raw.source || !raw.as_of) throw new Error("Connector read lacks source or as-of time.");
          // Connector data is data (doc 12 / constitution 4.3): every string in a read is quarantined before it reaches memory or a message.
          const guarded = o.guard && typeof o.guard.wrap === "function" ? o.guard.wrap(raw.value) : { value: raw.value, flags: [], flagged: false };
          const r = Object.assign({}, raw, { value: guarded.value, flags: guarded.flags });
          const stale = o.freshness_ms ? clock() - r.as_of > o.freshness_ms : false;
          remember(memory, "facts", { capability_id: capId, value: r.value, source: r.source, as_of: r.as_of, flags: r.flags }, clock());
          return Object.assign({ stale }, r);
        } catch (err) {
          // Read failure: answer with the last good fact, labeled with its age, and say the connector is down.
          const last = memory.facts.filter(f => f.capability_id === capId).pop();
          if (!last) return { error: String(err && err.message || err), value: null, source: null, as_of: null, stale: true, down: true };
          return { value: last.value, source: last.source, as_of: last.as_of, stale: true, down: true };
        }
      }

      const keyFor = (item, cap) => item.idempotency_key || `${cap.id}:${item.key || JSON.stringify(item.params || {})}`;
      async function act(item, cap, g) {
        const key = keyFor(item, cap);
        // Never re-execute a write whose ACTING entry already exists in the log. A fresh request that reuses a
        // completed key is told so plainly instead of being reported as newly done.
        const prior = memory.outcomes.filter(x => x.idempotency_key === key && x.result === "confirmed").pop();
        if (prior) return idle({ idempotency_key: key }, { outcome: "already_done", message: `${item.describe || cap.name} was already done earlier${prior.reference ? ` (ref ${prior.reference})` : ""}. I did not do it again.` });
        if (log.some(e => e.to === "ACTING" && e.input && e.input.idempotency_key === key)) return reconcile(item, cap, key);
        transition("ACTING", { capability_id: cap.id, idempotency_key: key, params: item.params || null });
        let result;
        try { result = await connectors.write(cap.id, item.params || {}, key); }
        catch (err) {
          // Write failure: stop, do not retry blind. The outcome is unknown until reconciled.
          return unknown(item, cap, key, String(err && err.message || err));
        }
        return verify(item, cap, key, result);
      }
      async function verify(item, cap, key, result) {
        transition("VERIFYING", { idempotency_key: key, reference: result && result.reference || null });
        let v = null;
        try { v = await connectors.verify(cap.id, key, result && result.reference); } catch (_) { v = null; }
        const confirmed = v && v.confirmed === true;
        const outcome = remember(memory, "outcomes", { capability_id: cap.id, idempotency_key: key, reference: result && result.reference || v && v.reference || null,
          result: confirmed ? "confirmed" : v && v.confirmed === false ? "failed" : "unknown", source: v && v.source || null }, clock());
        if (confirmed) return idle({ idempotency_key: key }, { outcome: "confirmed", message: compose("receipt", { action: item.describe || cap.name, reference: result && result.reference, verified: true, source: v.source || "the connector" }), outcome_record: outcome });
        if (v && v.confirmed === false) return idle({ idempotency_key: key }, { outcome: "failed", message: `${item.describe || cap.name} did not go through (${v.reason || "the rail rejected it"}), per ${v.source || "the rail"}. Nothing posted on their side.` });
        transition("FOLLOW_UP_SCHEDULED", { idempotency_key: key }, { follow_up_at: clock() + (o.follow_up_ms || 15 * 60000) });
        return { outcome: "unknown", state, message: compose("unknown", { action: item.describe || cap.name }), idempotency_key: key };
      }
      function unknown(item, cap, key, error) {
        remember(memory, "outcomes", { capability_id: cap.id, idempotency_key: key, result: "unknown", error }, clock());
        transition("FOLLOW_UP_SCHEDULED", { idempotency_key: key, error }, { follow_up_at: clock() + (o.follow_up_ms || 15 * 60000) });
        return { outcome: "unknown", state, message: compose("unknown", { action: item.describe || cap.name }), idempotency_key: key };
      }
      async function reconcile(item, cap, key) {
        // Resume after a crash or a lost response: read back from the source of truth instead of acting again.
        return verify(item, cap, key, { reference: (log.filter(e => e.to === "VERIFYING" && e.input && e.input.idempotency_key === key).pop() || { input: {} }).input.reference || null });
      }

      async function wake(input) {
        const now = clock();
        if (state === "AWAITING_CONFIRMATION" && input && input.kind === "confirmation") return handleConfirmation(input);
        if (state === "FOLLOW_UP_SCHEDULED" && input && input.kind === "follow_up") {
          const last = log.filter(e => e.to === "FOLLOW_UP_SCHEDULED").pop();
          const cap = registry.get(last && last.input && last.input.capability_id) || registry.get((log.filter(e => e.to === "ACTING" && e.input.idempotency_key === last.input.idempotency_key).pop() || { input: {} }).input.capability_id);
          return reconcile({ describe: cap && cap.name }, cap, last.input.idempotency_key);
        }
        if (state !== "IDLE") return { outcome: "busy", state, message: null };
        transition("OBSERVING", { kind: input && input.kind || "unknown" });
        const obs = { safety: input.safety || [], request: input.request || null, commitments: input.commitments || [], watches: input.watches || [], proactive: input.proactive || [] };
        transition("DECIDING");
        const ctx = { now, sent, suppressed: [] };
        const d = decide(obs, ctx);
        if (d.decision === "silent") return idle(null, { outcome: "silent", why: d.why, suppressed: ctx.suppressed });
        if (d.decision === "alert") { sent.push(now); return idle(null, { outcome: "alert", priority: "high", message: `${d.item.text || "Possible fraud or unauthorized change."} ${d.item.detail || ""}`.trim(), why: d.why, suppressed: ctx.suppressed }); }
        if (d.decision === "notify") {
          sent.push(now);
          const reason = d.item.reason || (d.why === "standing_watch" ? "you asked me to watch this" : null);
          return idle(null, { outcome: "notify", message: `${d.item.text} (${reason})`, why: d.why, budget: d.budget || null, suppressed: ctx.suppressed });
        }
        if (d.decision === "ask") return idle(null, { outcome: "ask", message: d.item.ask, why: d.why });
        // act: resolve the capability and gate it.
        const item = d.item, cap = registry.get(item.capability_id);
        // A duplicate instruction ("send $50" twice, a webhook delivered twice) carries the same idempotency key as a write already in the log: reconcile it, never confirm or write again.
        // A request that reuses a completed key is told so plainly; one whose write is in flight or unresolved reconciles. Neither is gated or confirmed again.
        if (cap) { const dupKey = keyFor(item, cap); const done = memory.outcomes.filter(x => x.idempotency_key === dupKey && x.result === "confirmed").pop(); if (done) return idle({ capability_id: cap.id, idempotency_key: dupKey }, { outcome: "already_done", message: `${item.describe || cap.name} was already done earlier${done.reference ? ` (ref ${done.reference})` : ""}. I did not do it again. Ask again with new details if you want a second one.` }); if (log.some(e => e.to === "ACTING" && e.input && e.input.idempotency_key === dupKey)) return reconcile(item, cap, dupKey); }
        const g = gate(cap, item, envelopes, now);
        if (!g.allowed) return idle({ capability_id: item.capability_id }, { outcome: "blocked", reason: g.reason, message: compose("blocked", { text: cap ? (registry.answer ? registry.answer(cap.id).text : `${cap.name} is not available.`) : "That is not something Upmore can do." }) });
        // Compliance gate (doc 14): one call site, before anything can act. A regulated capability with no live partner fails closed with a specific message, whatever the prompt says.
        if (o.compliance && typeof o.compliance.gate === "function" && cap.tier !== "T0" && cap.tier !== "T1") { const cg = o.compliance.gate(cap, o.partners || {}, { executes: true, kyc: o.kyc || null }); if (cg && cg.allowed === false) return idle({ capability_id: cap.id }, { outcome: "blocked", reason: "compliance:" + (cg.reason || cg.requirement), message: compose("blocked", { text: cg.message || `${cap.name} needs a licensed partner that is not in place.` }) }); }
        if (cap.tier === "T0" || cap.tier === "T1") {
          const r = await read(cap.id, item.params);
          const lead = r.value === null ? `I could not read ${cap.name} and have no earlier value.` : (item.lead ? item.lead(r.value) : `${cap.name}: ${JSON.stringify(r.value)}`);
          const flagNote = r.flags && r.flags.length && o.guard && typeof o.guard.notice === "function" ? " " + o.guard.notice(r.flags) : "";
          return idle({ capability_id: cap.id }, { outcome: "answer", message: compose("answer", { lead, source: r.source, as_of: r.as_of ? new Date(r.as_of).toISOString() : null, stale: r.stale }) + (r.down ? " The connector is down right now." : "") + flagNote, stale: r.stale, down: !!r.down, flags: r.flags || [] });
        }
        if (g.confirm) {
          const done = memory.outcomes.filter(x => x.idempotency_key === keyFor(item, cap) && x.result === "confirmed").pop();
          if (done) return idle({ capability_id: cap.id }, { outcome: "already_done", message: `${item.describe || cap.name} was already done earlier${done.reference ? ` (ref ${done.reference})` : ""}. I did not do it again. Ask again with new details if you want a second one.` });
          // A money confirmation must restate the exact amount and recipient that will be written.
          const p = item.params || {};
          if (!g.draft_only && p.amount_cents !== undefined && !(item.confirm && item.confirm.amount && item.confirm.recipient))
            return idle({ capability_id: cap.id }, { outcome: "blocked", reason: "confirmation_incomplete", message: "I can't ask you to approve a payment without restating the exact amount and recipient. Nothing was done." });
          pending = { id: `confirm-${seq()}`, item, cap, draft_only: !!g.draft_only, created_at: now, expires_at: now + (o.confirm_ttl_ms || 15 * 60000) };
          transition("AWAITING_CONFIRMATION", { capability_id: cap.id, confirmation_id: pending.id, reason: g.reason || null, draft_only: pending.draft_only });
          return { outcome: "awaiting_confirmation", state, confirmation_id: pending.id, draft_only: pending.draft_only,
            message: g.draft_only ? `Draft ready: ${item.describe || cap.name}. Nothing is sent until you approve the exact content and destination.` : compose("confirm", item.confirm || { action: item.describe || cap.name }) };
        }
        return act(item, cap, g);
      }
      async function handleConfirmation(input) {
        if (!pending) { const last = log.filter(e => e.to === "AWAITING_CONFIRMATION").pop(); if (!last) return idle(null, { outcome: "nothing_pending" }); return idle(null, { outcome: "lost_pending", message: "I lost the details of that pending action after a restart. Please ask again; nothing was done." }); }
        if (input.confirmation_id !== pending.id) return { outcome: "mismatch", state, message: "That confirmation does not match the pending action." };
        const p = pending; pending = null;
        // A stale approval is not an approval: balances, prices and intent all move.
        if (clock() > p.expires_at) { remember(memory, "outcomes", { capability_id: p.cap.id, result: "confirmation_expired" }, clock()); return idle({ confirmation_id: p.id }, { outcome: "expired", message: `That approval expired after ${Math.round((p.expires_at - p.created_at) / 60000)} minutes, so I did not act on it. Ask again and I'll re-confirm the details.` }); }
        if (!input.approved) { remember(memory, "outcomes", { capability_id: p.cap.id, result: "declined" }, clock()); return idle({ confirmation_id: p.id }, { outcome: "declined", message: "Okay, not doing that. Nothing was changed." }); }
        if (p.draft_only) { remember(memory, "outcomes", { capability_id: p.cap.id, result: "draft_approved", draft: p.item.params || null }, clock()); return idle({ confirmation_id: p.id }, { outcome: "draft_approved", message: `Approved draft recorded for ${p.item.describe || p.cap.name}. Sending is a separate, confirmed step.` }); }
        return act(p.item, p.cap, { confirm: false });
      }
      return { wake, get state() { return state; }, log, memory, remember: (s, r) => remember(memory, s, r, clock()), pendingConfirmation: () => pending && { id: pending.id, capability_id: pending.cap.id } };
    }
    return { create, gate, decide, budgetAllows, createMemory, remember, STATES, TIERS, BUDGET };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentLoop;
