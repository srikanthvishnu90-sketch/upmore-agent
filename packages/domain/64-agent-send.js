  /* Send to a saved recipient, end to end (Instinct spec docs 01, 06, 11; depth protocol docs/depth/PAY-001.md).
     The dialogue and state machine over AgentMoney (rails, recipient, scam and
     velocity checks), AgentLoop (tiers, confirmation, idempotency, crash recovery),
     AgentVoice (what a reply means) and DataGuard (memo text is data). One session
     per conversation: start(text) stages or asks, reply(text) approves, corrects or
     declines, followUp() reconciles, landed(rows) closes a handoff. Handoff rails
     (Venmo, Zelle, Cash App, PayPal) are staged as drafts: the user taps, the agent
     watches for the debit and only then says "landed". Partner rails write through
     the loop and say "sent" only after the rail confirms. Nothing here talks to a
     rail directly; the connectors the session is given do. Loads after MoneyMath,
     AgentMoney, AgentLoop, AgentVoice, DataGuard. */
  const AgentSend = (() => {
    const DAY = 86400000, WEEK = 7 * DAY;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const ymd = ms => new Date(ms).toISOString().slice(0, 10);
    const CAPABILITY = "PAY-001";

    // S01/S02: the user's own words carry the amount and the recipient; the memo is whatever follows "for" and is never parsed for either.
    const AMOUNT = /(?:^|[\s:])\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(k\b)?(?![\d,.]*\w)/i;
    function parseAmount(text) {
      const m = AMOUNT.exec(text); if (!m) return null;
      const whole = Number(m[1].replace(/,/g, "")), frac = m[2] ? Number((m[2] + "0").slice(0, 2)) : 0;
      let cents = whole * 100 + frac; if (m[3]) cents *= 1000;
      return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
    }
    function parse(text) {
      const t = String(text || "").trim(), lower = t.toLowerCase();
      const forIdx = lower.search(/\bfor\b/), head = forIdx >= 0 ? t.slice(0, forIdx) : t, memo = forIdx >= 0 ? t.slice(forIdx + 3).trim().replace(/^[\s:,-]+/, "") || null : null;
      const amount_cents = parseAmount(head);
      let recipient = null;
      const to = /\bto\s+(@?[A-Za-z][\w.'-]*(?:\s+[A-Za-z][\w.'-]*)?)/.exec(head.replace(AMOUNT, " "));
      if (to) recipient = to[1].trim();
      else { const verb = /^(?:please\s+)?(?:send|pay|venmo|zelle|cash ?app|paypal|transfer|wire)\s+(@?[A-Za-z][\w.'-]*(?:\s+[A-Za-z][\w.'-]*)?)/i.exec(head.replace(AMOUNT, " ").replace(/\s+/g, " ")); if (verb) recipient = verb[1].trim(); }
      if (recipient) recipient = recipient.replace(/\b(my|the|some|another)\b\s*/gi, "").replace(/\s+(now|today|tonight|please|instantly|asap)$/i, "").trim() || null;
      const speed = /\b(instant|instantly|right now|asap|now)\b/i.test(t) ? "instant" : null;
      const funding = (/\bfrom\s+(checking|savings|[a-z]+ account)/i.exec(t) || [])[1] || null;
      return { amount_cents, recipient, memo, speed, funding, text: t };
    }
    // S04: a handle one or two edits away from a saved one is a look-alike until the user says otherwise.
    const normHandle = h => String(h || "").toLowerCase().replace(/^@/, ""); // a dash for an underscore is a different account, so punctuation counts as an edit
    function editDistance(a, b) { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0))); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
    function lookalike(handle, people) {
      const h = normHandle(handle); if (!h) return null;
      for (const p of people || []) { const saved = normHandle(p.handle); if (!saved) continue; if (saved === h) return { exact: p }; const d = editDistance(h, saved); if (d <= 2) return { suspect: p, distance: d }; }
      return null;
    }

    function create(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now());
      const Money = typeof AgentMoney !== "undefined" ? AgentMoney : null, Loop = typeof AgentLoop !== "undefined" ? AgentLoop : null, Voice = typeof AgentVoice !== "undefined" ? AgentVoice : null, Guard = typeof DataGuard !== "undefined" ? DataGuard : null;
      if (!Money || !Loop) throw new Error("AgentSend needs AgentMoney and AgentLoop loaded.");
      const log = Array.isArray(o.log) ? o.log : [], memoryInit = o.memory || null;
      const loop = Loop.create({ registry: o.registry, connectors: o.connectors, clock, log, memory: memoryInit, control: o.control || null, envelopes: o.envelopes || [], confirm_ttl_ms: o.confirm_ttl_ms, guard: Guard, compliance: o.compliance || null, partners: o.partners || {}, kyc: o.kyc || null });
      const sends = Array.isArray(o.sends) ? o.sends : []; // staged handoff sends awaiting their debit
      let pending = null; // { send, confirmation_id }
      const sentWithin = ms => loop.memory.outcomes.filter(x => x.capability_id === CAPABILITY && x.result === "confirmed" && clock() - (x.recorded_at || 0) < ms).reduce((s, x) => s + (x.amount_cents || 0), 0) + sends.filter(s => s.staged_at && !s.cancelled && clock() - s.staged_at < ms).reduce((s, x) => s + x.amount_cents, 0);

      // The five-field confirmation (doc 11): action, exact amount, recipient with handle, funding account, fee, timing.
      const confirmText = send => `${send.confirm.action} ${send.confirm.amount} to ${send.confirm.recipient} from ${send.confirm.from}? ${send.confirm.fee ? "Fee " + send.confirm.fee : "No fee"}, ${send.confirm.when}. ${send.rail.reversible.charAt(0).toUpperCase() + send.rail.reversible.slice(1)}.${send.memo_flagged ? " The memo contained instruction-like text; I kept it as plain text and ignored it." : ""} Reply yes or no.`;

      async function stage(parsed) {
        const people = o.people || [];
        if (!parsed.amount_cents) return { outcome: "ask", text: "How much?" };
        if (!parsed.recipient) return { outcome: "ask", text: "Who should I send it to?" };
        // Memo text is data: it may be quoted back, never obeyed.
        let memo = parsed.memo, memo_flagged = false;
        if (memo && Guard) { const g = Guard.wrap(memo); memo_flagged = !!g.flagged; }
        // A handle the user typed that is not saved but nearly is: name the look-alike before anything else happens.
        if (/^@/.test(parsed.recipient)) { const la = lookalike(parsed.recipient, people); if (la && la.suspect) return { outcome: "ask", reason: "lookalike", text: `${parsed.recipient} is not on file, but it is ${la.distance === 1 ? "one character" : "two characters"} away from ${la.suspect.name} (${la.suspect.handle}). Did you mean ${la.suspect.name}? If this is someone new, say so and I'll confirm them in full.` }; if (la && la.exact) parsed = Object.assign({}, parsed, { recipient: la.exact.name }); }
        const prep = Money.prepareSend({ amount_cents: parsed.amount_cents, recipient: parsed.recipient, memo, speed: parsed.speed, funding: parsed.funding || o.default_funding || "checking", instruction: parsed.text }, { people, partners: o.partners || {}, today: ymd(clock()), sent_today_cents: sentWithin(DAY), sent_week_cents: sentWithin(WEEK), envelope: o.limits || {}, large_cents: o.large_cents, default_funding: o.default_funding || "checking", include_gated: false });
        if (prep.stop) return { outcome: "stop", reason: prep.reason, text: prep.message };
        if (prep.ask) return { outcome: "ask", reason: prep.new_recipient ? "new_recipient" : "gap", text: prep.ask, new_recipient: !!prep.new_recipient };
        if (prep.tier === "T5") return { outcome: "ask", reason: "new_recipient", text: `${prep.recipient.name} has never received money from you. First sends go through the new-recipient path and are confirmed in full. ${prep.verify_question || ""}`.trim(), new_recipient: true };
        const send = Object.assign({ memo_flagged, staged_at: null, landed: null }, prep);
        const handoff = send.rail.mode === "handoff";
        const request = { capability_id: CAPABILITY, key: prep.request.key, idempotency_key: prep.request.key, params: { amount_cents: send.amount_cents, recipient: send.recipient.id || send.recipient.name, recipient_name: send.recipient.name, rail: send.rail.id, memo: memo || null, funding: send.confirm.from }, describe: send.confirm.action, confirm: { action: send.confirm.action, amount: send.confirm.amount, recipient: send.confirm.recipient, from: send.confirm.from, fee: send.confirm.fee, when: send.confirm.when }, draft_only: handoff, amount_cents: send.amount_cents, recipient: send.recipient.id || send.recipient.name };
        send.request_key = request.key;
        // S10 for handoff rails: a staged send is "done" for the day even though no rail was written; the same instruction is not staged twice.
        const staged = sends.find(x => x.request_key === request.key && !x.cancelled);
        if (staged) return { outcome: "already_done", text: `${send.confirm.action} was already staged today${staged.landed ? ` and landed on ${staged.landed}` : ""}. I did not stage it again. If it never went through, say so and I'll restage it.` };
        const r = await loop.wake({ kind: "message", request });
        if (r.outcome === "awaiting_confirmation") { pending = { send, confirmation_id: r.confirmation_id, request }; return { outcome: "confirm", confirmation_id: r.confirmation_id, text: confirmText(send), send }; }
        if (r.outcome === "already_done") { pending = null; return { outcome: "already_done", text: r.message }; }
        if (r.outcome === "blocked") { pending = null; return { outcome: "blocked", reason: r.reason, text: r.message }; }
        return Object.assign({ outcome: r.outcome, text: r.message || null }, r);
      }
      async function start(text) { return stage(parse(text)); }

      // The outcome of an approved action, in the user's words.
      function settle(r, send) {
        if (r.outcome === "draft_approved") { const h = Money.handoff(send); send.staged_at = clock(); send.watch = h.watch; sends.push(send); return { outcome: "staged", text: h.text, steps: h.steps, app: h.app, watch: h.watch, send }; }
        if (r.outcome === "confirmed") { const rc = Money.receipt(send, { reference: r.outcome_record && r.outcome_record.reference || (r.message.match(/ref ([^)]+)\)/) || [])[1] || "confirmed" }); return { outcome: "sent", text: rc.text, reference: rc.reference, reversal_contract: rc.reversal_contract, mitigation: rc.mitigation, send }; }
        if (r.outcome === "unknown") return { outcome: "unknown", text: r.message, send };
        if (r.outcome === "failed") return { outcome: "failed", text: `${r.message} ${send.rail.mode === "partner" ? "Nothing posted on their side; the money is still in " + send.confirm.from + "." : ""}`.trim(), send };
        if (r.outcome === "expired") return { outcome: "expired", text: r.message };
        if (r.outcome === "declined") return { outcome: "declined", text: r.message };
        return Object.assign({ outcome: r.outcome, text: r.message || null }, r);
      }
      async function reply(text) {
        const p = pending;
        if (!p) return { outcome: "nothing_pending", text: "There is no send waiting on you." };
        const cls = Voice ? Voice.classify(text, { pending_confirmation: true }) : { type: /^y/i.test(text) ? "confirmation" : "question", approved: /^y/i.test(text) };
        // S07: "yes, but" corrects. The old proposal is dropped and the corrected one is staged afresh; nothing is written in between.
        if (cls.type === "correction") {
          const fix = parse(text), merged = { amount_cents: fix.amount_cents || p.send.amount_cents, recipient: fix.recipient || p.send.recipient.name, memo: p.send.memo, speed: fix.speed || null, funding: fix.funding || p.send.confirm.from, text };
          await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
          const again = await stage(merged);
          return Object.assign({ corrected: true }, again, again.outcome === "confirm" ? { text: `Got it. ${again.text}` } : {});
        }
        if (cls.type === "confirmation" && cls.approved === false) { const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null; return settle(r, p.send); }
        if (cls.type === "confirmation" && cls.approved === true) { const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: true }); pending = null; return settle(r, p.send); }
        return { outcome: "ask", text: `Yes or no? ${confirmText(p.send)}` };
      }
      async function followUp() { const r = await loop.wake({ kind: "follow_up" }); const key = (log.filter(e => e.to === "ACTING").pop() || { input: {} }).input.idempotency_key; const send = sends.find(s => s.request && s.request.key === key) || (pending && pending.send) || lastSend(key); return settle(r, send || { rail: { mode: "partner", reversible: "" }, confirm: { from: "your account" }, amount_cents: 0, recipient: { name: "?" } }); }
      const lastSend = key => { const e = log.filter(x => x.to === "ACTING" && x.input && x.input.idempotency_key === key).pop(); if (!e) return null; const p = e.input.params || {}; const person = (o.people || []).find(x => (x.id || x.name) === p.recipient) || { name: p.recipient_name || p.recipient }; const rail = Money.RAILS[p.rail] ? Object.assign({ id: p.rail }, Money.RAILS[p.rail]) : { id: p.rail, mode: "partner", name: p.rail, speed: "", reversible: "", mitigation: "" }; return { amount_cents: p.amount_cents, recipient: person, rail, confirm: { from: p.funding || "checking", action: `Send ${money(p.amount_cents)} to ${person.name}` }, memo: p.memo || null }; };
      // S15 for handoff rails: "landed" only when the debit posts; overdue asks instead of assuming.
      function landed(transactions) {
        const out = [];
        for (const s of sends) { if (s.landed || s.cancelled) continue; const hit = (transactions || []).find(t => { const c = Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100); const who = String(t.merchant_raw || "").toLowerCase(); return c === -s.amount_cents && Date.parse(String(t.posted_at).slice(0, 10) + "T00:00:00Z") >= Date.parse(ymd(s.staged_at) + "T00:00:00Z") && [s.recipient.name, s.recipient.handle].filter(Boolean).some(n => who.includes(String(n).toLowerCase().replace(/^@/, "").split(" ")[0])); }); if (hit) { s.landed = String(hit.posted_at).slice(0, 10); const rc = Money.receipt(s, { posted: s.landed }); out.push({ send: s, transaction_id: hit.id, text: rc.text }); } }
        return out;
      }
      function overdue(now) { return sends.filter(s => !s.landed && !s.cancelled && s.watch && now - s.staged_at > s.watch.deadline_days * DAY).map(s => ({ send: s, text: `I staged ${money(s.amount_cents)} to ${s.recipient.name} on ${s.rail.name} ${Math.floor((now - s.staged_at) / DAY)} day(s) ago and have not seen it post. Did you send it? If not, nothing left your account.` })); }
      return { start, reply, followUp, landed, overdue, parse, loop, sends, get pending() { return pending ? { confirmation_id: pending.confirmation_id, amount_cents: pending.send.amount_cents, recipient: pending.send.recipient.name } : null; } };
    }
    return { create, parse, parseAmount, lookalike, editDistance, CAPABILITY };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentSend;
