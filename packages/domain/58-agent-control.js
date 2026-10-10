  /* Control plane (Instinct spec docs 01, 02: CORE-003/004/005/006/011/013/014/016, SEC-006/007/010):
     the user's authority over the agent, as data the loop reads. Standing
     instructions that never widen authority; autonomy envelopes that are explicit,
     bounded per action and per period, revocable, and reported back; corrections
     stored verbatim and applied to the next request; undo and mitigation contracts
     per capability so a confirmation can say what can be taken back; the kill
     switch that stops every action above a read; export of everything the agent
     holds without a secret in it; the deletion plan; the onboarding interview;
     credit-freeze and credential-rotation records; version awareness. Pure,
     serializable, no provider calls. Loads after AgentLoop when the loop should
     honour the kill switch (pass control to AgentLoop.create as opts.control). */
  const AgentControl = (() => {
    const DAY = 86400000, WEEK = 7 * DAY;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const iso = ms => new Date(ms).toISOString();
    const SECRET_KEY = /token|secret|password|passcode|otp|one_time|ssn|social_security|cvv|pin\b|private_key|vault_handle|refresh|access_key|routing_number|account_number/i;

    function create(initial) {
      const s = Object.assign({ instructions: [], envelopes: [], corrections: [], pause: null, freezes: [], credentials: [], onboarding: { answers: {}, done: false }, seq: 0 }, initial || {});
      const id = p => `${p}-${++s.seq}`;

      // CORE-004: standing instructions. Restated in plain words, with cadence, limits and expiry; a firing is a request the loop still gates by tier.
      const instructions = {
        create(spec, now) {
          const need = ["capability_id", "text"].filter(k => !spec[k]); if (need.length) throw new Error(`A standing instruction needs ${need.join(", ")}.`);
          if (!spec.cadence && !spec.trigger) throw new Error("A standing instruction needs a cadence (daily, weekly, monthly, on a day) or a trigger (an event it answers).");
          const r = { id: id("si"), capability_id: spec.capability_id, text: String(spec.text).trim(), params: spec.params || {}, cadence: spec.cadence || null, day: spec.day || null, trigger: spec.trigger || null, max_cents: Number.isInteger(spec.max_cents) ? spec.max_cents : null, expires_at: spec.expires_at || null, created_at: now, status: "active", last_fired_period: null, restated: null };
          r.restated = restate(r); s.instructions.push(r); return r;
        },
        list() { return s.instructions.slice(); },
        get(iid) { return s.instructions.find(i => i.id === iid) || null; },
        pause(iid, now) { const i = instructions.get(iid); if (!i) return null; i.status = "paused"; i.paused_at = now; return i; },
        resume(iid, now) { const i = instructions.get(iid); if (!i) return null; i.status = "active"; i.resumed_at = now; return i; },
        revoke(iid, now) { const i = instructions.get(iid); if (!i) return null; i.status = "revoked"; i.revoked_at = now; return i; },
        // The instructions due now: one firing per period, keyed so a duplicate wake never fires twice. A paused agent fires nothing.
        due(now, opts) {
          if (pause.paused(now)) return [];
          const out = [];
          for (const i of s.instructions) {
            if (i.status !== "active" || (i.expires_at && i.expires_at <= now) || !i.cadence) continue;
            const period = periodKey(i, now); if (!period || i.last_fired_period === period) continue;
            if (i.day && !dayMatches(i, now)) continue;
            out.push({ instruction_id: i.id, period, request: Object.assign({ capability_id: i.capability_id, key: `${i.id}:${period}`, idempotency_key: `${i.id}:${period}`, params: Object.assign({}, i.params), describe: i.text, cadence_requested: true, standing_instruction: i.id }, i.max_cents != null && i.params.amount_cents > i.max_cents ? { blocked: `over the instruction's ${money(i.max_cents)} limit` } : {}) });
          }
          return out;
        },
        fired(iid, period) { const i = instructions.get(iid); if (i) i.last_fired_period = period; return i; },
        triggered(eventKind, now) { if (pause.paused(now)) return []; return s.instructions.filter(i => i.status === "active" && i.trigger === eventKind && (!i.expires_at || i.expires_at > now)).map(i => ({ instruction_id: i.id, request: { capability_id: i.capability_id, key: `${i.id}:${eventKind}:${Math.floor(now / DAY)}`, params: Object.assign({}, i.params), describe: i.text, cadence_requested: true, standing_instruction: i.id } })); }
      };
      function periodKey(i, now) { const d = new Date(now); return i.cadence === "daily" ? d.toISOString().slice(0, 10) : i.cadence === "weekly" ? `${d.getUTCFullYear()}-W${Math.floor((now - Date.UTC(d.getUTCFullYear(), 0, 1)) / WEEK)}` : i.cadence === "monthly" ? d.toISOString().slice(0, 7) : null; }
      function dayMatches(i, now) { const d = new Date(now); if (i.cadence === "monthly") return d.getUTCDate() === Math.min(i.day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()); if (i.cadence === "weekly") return d.getUTCDay() === i.day; return true; }
      function restate(i) { const when = i.cadence === "daily" ? "every day" : i.cadence === "weekly" ? `every week${i.day != null ? ` on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i.day]}` : ""}` : i.cadence === "monthly" ? `every month${i.day ? ` on the ${i.day}${["st", "nd", "rd"][i.day - 1] || "th"}` : ""}` : `when ${i.trigger}`; return `${i.text}, ${when}${i.max_cents != null ? `, never more than ${money(i.max_cents)} at a time` : ""}${i.expires_at ? `, until ${iso(i.expires_at).slice(0, 10)}` : ""}. Anything that needs your approval still asks; this does not raise your limits.`; }

      // CORE-005: autonomy envelopes. Explicit, user-set, bounded per action and per week, revocable; every action inside one still gets a receipt.
      const envelopes = {
        grant(spec, now) {
          if (!spec.capability_id || !Number.isInteger(spec.max_cents) || spec.max_cents <= 0) throw new Error("An envelope needs a capability and a positive per-action limit in cents.");
          if (!spec.granted_by_text) throw new Error("An envelope is granted in the user's own words; record them.");
          const e = { id: id("env"), capability_id: spec.capability_id, max_cents: spec.max_cents, max_per_week_cents: Number.isInteger(spec.max_per_week_cents) ? spec.max_per_week_cents : null, recipient: spec.recipient || null, expires_at: spec.expires_at || now + 90 * DAY, active: true, granted_at: now, granted_by_text: String(spec.granted_by_text).trim(), restated: null };
          e.restated = `Without asking each time, I may ${spec.describe || spec.capability_id}${e.recipient ? ` to ${e.recipient}` : ""} up to ${money(e.max_cents)} per action${e.max_per_week_cents ? ` and ${money(e.max_per_week_cents)} per week` : ""}, until ${iso(e.expires_at).slice(0, 10)}. You get a receipt after each one. First-time recipients still ask. Say "stop" or "revoke" to end it.`;
          s.envelopes.push(e); return e;
        },
        list() { return s.envelopes.slice(); },
        revoke(eid, now) { const e = s.envelopes.find(x => x.id === eid); if (!e) return null; e.active = false; e.revoked_at = now; return e; },
        revokeAll(now) { for (const e of s.envelopes) if (e.active) { e.active = false; e.revoked_at = now; } return s.envelopes.filter(e => e.revoked_at === now).length; },
        // Usage against outcomes: what was written under this envelope this week.
        usage(eid, outcomes, now) { const e = s.envelopes.find(x => x.id === eid); if (!e) return null; const rows = (outcomes || []).filter(o => o.envelope_id === e.id && o.result === "confirmed" && (now - (o.recorded_at || 0)) < WEEK); const used = rows.reduce((t, o) => t + (o.amount_cents || 0), 0); return { envelope_id: e.id, used_this_week_cents: used, actions_this_week: rows.length, remaining_this_week_cents: e.max_per_week_cents != null ? Math.max(0, e.max_per_week_cents - used) : null }; },
        // What the loop checks: active, unexpired envelopes with the per-action limit cut to what is left this week. The kill switch makes this empty.
        forLoop(outcomes, now) { if (pause.paused(now)) return []; return s.envelopes.filter(e => e.active && e.expires_at > now).map(e => { const u = envelopes.usage(e.id, outcomes, now); const cap = u.remaining_this_week_cents != null ? Math.min(e.max_cents, u.remaining_this_week_cents) : e.max_cents; return { id: e.id, capability_id: e.capability_id, max_cents: cap, recipient: e.recipient, active: cap > 0, expires_at: e.expires_at }; }); }
      };

      // CORE-006: corrections, verbatim, with the action they corrected; a field-level fix is applied to later requests.
      const corrections = {
        capture(text, correctedAction, now, fix) {
          if (typeof text !== "string" || !text.trim()) throw new Error("A correction is stored verbatim; it needs the user's words.");
          const c = { id: id("corr"), text: text.trim(), action: correctedAction || null, field: fix && fix.field || null, from: fix && fix.from != null ? String(fix.from) : null, to: fix && fix.to != null ? String(fix.to) : null, capability_id: fix && fix.capability_id || (correctedAction && correctedAction.capability_id) || null, recorded_at: now, applied: 0 };
          s.corrections.push(c); return c;
        },
        list() { return s.corrections.slice(); },
        // Apply field-level corrections to a request: the same wrong value is never proposed twice.
        apply(request) {
          const r = JSON.parse(JSON.stringify(request || {})), applied = [];
          for (const c of s.corrections) { if (!c.field || c.from == null || c.to == null) continue; if (c.capability_id && r.capability_id && c.capability_id !== r.capability_id) continue; const p = r.params || (r.params = {}); if (String(p[c.field] || "").toLowerCase() === c.from.toLowerCase()) { p[c.field] = c.to; c.applied++; applied.push({ correction_id: c.id, field: c.field, from: c.from, to: c.to }); } }
          return { request: r, applied };
        }
      };

      // SEC-010: the kill switch. Paused means nothing above a read runs: no action, no standing instruction, no envelope.
      const pause = {
        set(reason, now, until) { s.pause = { at: now, reason: reason || "user asked", until: until || null }; return s.pause; },
        clear(now) { const was = s.pause; s.pause = null; return { resumed_at: now, was }; },
        paused(now) { return !!s.pause && (!s.pause.until || s.pause.until > now); },
        status(now) { return pause.paused(now) ? { paused: true, since: iso(s.pause.at), reason: s.pause.reason, until: s.pause.until ? iso(s.pause.until) : null, text: `Paused since ${iso(s.pause.at).slice(0, 16).replace("T", " ")}: I answer questions but take no action, fire no standing instruction and use no envelope until you say resume.` } : { paused: false, text: "Active." }; },
        // The hook the loop calls before any tier above T1.
        gate(cap, now) { if (!pause.paused(now)) return { allowed: true }; if (cap && (cap.tier === "T0" || cap.tier === "T1")) return { allowed: true }; return { allowed: false, reason: "paused", message: `I'm paused (${s.pause.reason}), so I did not do that. Say resume when you want actions back on.` }; }
      };

      // SEC-006 / SEC-007: freeze records per bureau and credential-rotation reminders from connector consent dates.
      const freezes = {
        record(bureau, state, now, pin_hint) { if (pin_hint && /\d{4,}/.test(pin_hint)) throw new Error("Never store a freeze PIN; store where it is kept."); const f = { bureau, state, recorded_at: now, pin_location_hint: pin_hint || null }; s.freezes = s.freezes.filter(x => x.bureau !== bureau).concat([f]); return f; },
        status() { const bureaus = ["Equifax", "Experian", "TransUnion"]; return { bureaus: bureaus.map(b => { const f = s.freezes.find(x => x.bureau === b); return { bureau: b, state: f ? f.state : "unknown", recorded_at: f ? f.recorded_at : null }; }), all_frozen: bureaus.every(b => (s.freezes.find(x => x.bureau === b) || {}).state === "frozen"), text: bureaus.map(b => `${b}: ${(s.freezes.find(x => x.bureau === b) || { state: "unknown" }).state}`).join(", ") + "." }; }
      };
      const credentials = {
        record(connector_id, kind, rotated_at, interval_days) { const c = { connector_id, kind: kind || "password", rotated_at, interval_days: interval_days || 180 }; s.credentials = s.credentials.filter(x => !(x.connector_id === connector_id && x.kind === c.kind)).concat([c]); return c; },
        due(now) { return s.credentials.filter(c => now - c.rotated_at >= c.interval_days * DAY).map(c => ({ connector_id: c.connector_id, kind: c.kind, days_since: Math.floor((now - c.rotated_at) / DAY), text: `${c.connector_id} ${c.kind}: last rotated ${Math.floor((now - c.rotated_at) / DAY)} days ago; your interval is ${c.interval_days} days. I never see or store the new one.` })); }
      };

      // CORE-003: onboarding interview. One question at a time, answers kept as preferences; nothing asked twice.
      const QUESTIONS = [
        { id: "accounts", ask: "Which accounts should I see? Connect them or list institution and type; you can add more later.", store: "accounts", validate: v => Array.isArray(v) && v.length ? null : "Name at least one account or say none for now." },
        { id: "goals", ask: "What are you working toward in the next year? A number and a date each helps.", store: "goals", validate: v => Array.isArray(v) ? null : "A list, even of one." },
        { id: "people", ask: "Who do you send money to or split with? Names are enough; details come when you first send.", store: "people", validate: v => Array.isArray(v) ? null : "A list, even empty." },
        { id: "quiet_hours", ask: "When should I stay quiet unless it is fraud? Give a start and end hour.", store: "quiet_hours", validate: v => v && Number.isInteger(v.start) && Number.isInteger(v.end) ? null : "Two hours, 0 to 23." },
        { id: "autonomy", ask: "Should I ever act without asking? Start with nothing; you can grant small envelopes later.", store: "autonomy", validate: v => ["nothing", "small_envelopes_later"].includes(v) ? null : "nothing, or small envelopes later." }
      ];
      const onboarding = {
        next() { if (s.onboarding.done) return { done: true, preferences: s.onboarding.answers }; const q = QUESTIONS.find(x => s.onboarding.answers[x.store] === undefined); return q ? { done: false, question: q.id, ask: q.ask, step: QUESTIONS.indexOf(q) + 1, of: QUESTIONS.length } : (s.onboarding.done = true, { done: true, preferences: s.onboarding.answers }); },
        answer(questionId, value, now) { const q = QUESTIONS.find(x => x.id === questionId); if (!q) throw new Error("Unknown question."); const err = q.validate(value); if (err) return { accepted: false, ask_again: err }; s.onboarding.answers[q.store] = value; s.onboarding.answered_at = now; return Object.assign({ accepted: true }, onboarding.next()); },
        progress() { return { answered: Object.keys(s.onboarding.answers).length, of: QUESTIONS.length, done: s.onboarding.done }; }
      };

      // CORE-013: export everything the agent holds, machine-readable, with a manifest and no secret in it.
      function exportBundle(data, now) {
        const d = data || {}, files = {};
        const put = (name, value) => { files[name] = typeof value === "string" ? value : JSON.stringify(scrub(value), null, 1); };
        put("manifest.json", { exported_at: iso(now), format: "Upmore export v1", files: [] });
        put("control.json", { instructions: s.instructions, envelopes: s.envelopes, corrections: s.corrections, pause: s.pause, freezes: s.freezes, credentials: s.credentials, onboarding: s.onboarding });
        if (d.memory) put("memory.json", d.memory);
        if (d.log) put("event-log.json", d.log);
        if (d.accounts) put("accounts.json", d.accounts);
        if (d.transactions) put("transactions.csv", typeof AgentLedger !== "undefined" && AgentLedger.csv ? AgentLedger.csv(d.transactions) : JSON.stringify(scrub(d.transactions)));
        if (d.people) put("people.json", d.people);
        const manifest = JSON.parse(files["manifest.json"]); manifest.files = Object.keys(files).filter(f => f !== "manifest.json").map(f => ({ name: f, bytes: typeof Buffer !== "undefined" ? Buffer.byteLength(files[f], "utf8") : files[f].length })); manifest.secrets_removed = scrubCount; files["manifest.json"] = JSON.stringify(manifest, null, 1);
        return { files, manifest, text: `Your export has ${manifest.files.length} files (${manifest.files.map(f => f.name).join(", ")}), as of ${iso(now).slice(0, 16).replace("T", " ")}. No credentials, tokens or identity numbers are in it${scrubCount ? ` (${scrubCount} such fields were removed)` : ""}.` };
      }
      let scrubCount = 0;
      function scrub(v) { if (Array.isArray(v)) return v.map(scrub); if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) { if (SECRET_KEY.test(k)) { scrubCount++; continue; } o[k] = scrub(x); } return o; } return v; }

      // CORE-014: deletion. A plan the user confirms with a phrase; connectors revoked first; what the law keeps is said, not hidden.
      function deletionPlan(data, now) {
        const d = data || {}, connectors = (d.connectors || []).map(c => c.id || c);
        const steps = [{ step: 1, what: `Revoke ${connectors.length} connector consent${connectors.length === 1 ? "" : "s"} so no new data arrives`, items: connectors }, { step: 2, what: "Cancel every standing instruction and envelope", items: s.instructions.filter(i => i.status === "active").map(i => i.id).concat(s.envelopes.filter(e => e.active).map(e => e.id)) }, { step: 3, what: "Delete memory, event log, accounts, transactions, people and preferences", items: ["memory", "event-log", "accounts", "transactions", "people", "preferences"] }, { step: 4, what: "Keep only what the law requires: records of money sent through a partner rail stay with that partner for its retention period; nothing stays with Upmore", items: [] }];
        return { steps, confirm_phrase: "delete my Upmore account", undo_window_days: 7, text: `Deleting your account: ${steps.map(x => x.what.toLowerCase()).join("; ")}. Export first if you want a copy. Type "delete my Upmore account" to confirm; you have 7 days to change your mind, then it is gone.`, requested_at: now };
      }
      function deletionConfirm(phrase, now) { const ok = String(phrase || "").trim().toLowerCase() === "delete my upmore account"; if (!ok) return { confirmed: false, text: "That is not the confirmation phrase; nothing was deleted." }; s.deletion = { confirmed_at: now, purge_after: now + 7 * DAY }; envelopes.revokeAll(now); for (const i of s.instructions) if (i.status === "active") instructions.revoke(i.id, now); return { confirmed: true, purge_after: iso(s.deletion.purge_after), text: `Confirmed. Nothing acts from now on; everything is purged on ${iso(s.deletion.purge_after).slice(0, 10)} unless you cancel before then.` }; }

      function snapshot() { return JSON.parse(JSON.stringify(s)); }
      return { instructions, envelopes, corrections, pause, freezes, credentials, onboarding, exportBundle, deletionPlan, deletionConfirm, snapshot, state: s };
    }

    // CORE-011: undo and mitigation contracts per capability family. A confirmation can say what can be taken back and for how long.
    const CONTRACTS = [
      { match: /^BILL-003$|^BILL-004$/, undo: { possible: true, window_days: 30, how: "resubscribe or unpause; most merchants restore the same plan within the billing period" }, mitigation: "if the price changed, the old rate is usually gone; I will say so before you confirm" },
      { match: /^PAY-009$|^SAVE-001$|^SAVE-021$|^SAVE-022$/, undo: { possible: true, window_days: 365, how: "transfer the same amount back between your own accounts" }, mitigation: "a transfer that overdrew an account can carry a fee; I check the balance first" },
      { match: /^PAY-007$|^BILL-008$|^PAY-005$|^PAY-006$/, undo: { possible: true, window_days: 0, how: "cancel the scheduled payment before the rail's cutoff (usually the business day before)" }, mitigation: "after cutoff: ask the payee for a refund; I draft the request" },
      { match: /^PAY-00[1-4]$|^PAY-01[2-5]$|^SOC-004$/, undo: { possible: false, window_days: 0, how: null }, mitigation: "a P2P send to the wrong person cannot be pulled back; I ask the recipient to return it and file a claim with the rail; first-time recipients always confirm the exact name and handle" },
      { match: /^PAY-010$/, undo: { possible: true, window_days: 1, how: "ACH push can be recalled the same day through the originating bank; after that it is a return request" }, mitigation: "returns depend on the receiving bank; I keep the trace number in the receipt" },
      { match: /^PAY-011$/, undo: { possible: false, window_days: 0, how: null }, mitigation: "wire recall is a request, not a right, and must be made within hours; confirmation restates every field" },
      { match: /^INV-01[1-4]$/, undo: { possible: false, window_days: 0, how: null }, mitigation: "a filled order is final; the reverse trade is a new trade at a new price and may create a taxable event" },
      { match: /^CARD-011$/, undo: { possible: true, window_days: 365, how: "unfreeze the card the same way" }, mitigation: "recurring charges may fail while frozen; I list them before you confirm" },
      { match: /^SAVE-005$|^BILL-015$|^CARD-010$|^RECOV/, undo: { possible: true, window_days: 60, how: "withdraw the dispute or refund request with the issuer" }, mitigation: "a dispute can close the merchant account; I say which merchants do that" }
    ];
    function contract(capability_id, cap) {
      const c = CONTRACTS.find(x => x.match.test(capability_id || "")) || (cap && (cap.tier === "T0" || cap.tier === "T1") ? { undo: { possible: true, window_days: 0, how: "nothing was changed; a read or a draft has nothing to undo" }, mitigation: null } : { undo: { possible: false, window_days: 0, how: null }, mitigation: "no undo path is on record for this action; it confirms every time" });
      return { capability_id, undo: c.undo, mitigation: c.mitigation, text: c.undo.possible ? (c.undo.window_days ? `Can be undone within ${c.undo.window_days} day${c.undo.window_days === 1 ? "" : "s"}: ${c.undo.how}.` : `Can be undone: ${c.undo.how}.`) + (c.mitigation ? ` ${capitalize(c.mitigation)}.` : "") : `Cannot be undone.${c.mitigation ? ` ${capitalize(c.mitigation)}.` : ""}` };
    }
    const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
    // Given a recorded outcome, whether undo is still open now, and the step.
    function undoPlan(outcome, now) {
      const c = contract(outcome.capability_id); const age = (now - (outcome.recorded_at || now)) / DAY;
      if (!c.undo.possible) return { possible: false, step: c.mitigation ? `Mitigation: ${c.mitigation}.` : "No mitigation on record.", contract: c };
      if (c.undo.window_days && age > c.undo.window_days) return { possible: false, step: `The ${c.undo.window_days}-day undo window closed ${Math.floor(age - c.undo.window_days)} day(s) ago. ${c.mitigation ? `Mitigation: ${c.mitigation}.` : ""}`.trim(), contract: c };
      return { possible: true, step: `Undo: ${c.undo.how}.`, within_days: c.undo.window_days ? Math.max(0, Math.ceil(c.undo.window_days - age)) : null, contract: c };
    }

    // CORE-016: version and changelog awareness from a CHANGELOG text (keep-a-changelog shape).
    function changelog(text) {
      const entries = []; let cur = null;
      for (const line of String(text || "").split("\n")) { const h = line.match(/^## \[?([^\]\s]+)\]?(?: - (\d{4}-\d{2}-\d{2}))?/); if (h) { cur = { version: h[1], date: h[2] || null, changes: [] }; entries.push(cur); continue; } const b = line.match(/^\s*[-*] (.+)/); if (b && cur) cur.changes.push(b[1].trim()); }
      return entries;
    }
    function version(text) { const e = changelog(text).filter(x => x.version.toLowerCase() !== "unreleased"); return e.length ? { version: e[0].version, date: e[0].date, changes: e[0].changes, text: `Upmore ${e[0].version}${e[0].date ? ` (${e[0].date})` : ""}: ${e[0].changes.slice(0, 3).join("; ")}${e[0].changes.length > 3 ? `; and ${e[0].changes.length - 3} more` : ""}.` } : { version: null, text: "No released version is recorded yet." }; }
    function whatsNew(text, sinceVersion) { const e = changelog(text).filter(x => x.version.toLowerCase() !== "unreleased"); const i = e.findIndex(x => x.version === sinceVersion); const newer = i < 0 ? e : e.slice(0, i); return { since: sinceVersion, versions: newer.map(x => x.version), changes: newer.flatMap(x => x.changes), text: newer.length ? `Since ${sinceVersion}: ${newer.flatMap(x => x.changes).join("; ")}.` : `Nothing new since ${sinceVersion}.` }; }

    return { create, contract, undoPlan, changelog, version, whatsNew, CONTRACTS, SECRET_KEY };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentControl;
