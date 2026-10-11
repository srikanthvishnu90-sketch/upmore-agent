  /* The confirmation card over text (Instinct spec 16, "The confirmation card"; docs 01 and 11; depth protocol
     docs/depth/CORE-009.md). One message fires money. This module owns the card itself: its fixed anatomy, its
     rendering per channel with plain-text degradation, and the store that makes a yes safe: time-bounded, single-use,
     context-bound, read back in the user's terms, superseded by any newer card, killed by "never mind", honored across
     channels, fired once under duplicate delivery, and logged as a replayable transcript. Channel adapters deliver the
     text and buttons and hand the reply back; the loop (doc 01) still executes and still refuses without a confirmation.
     Pure: the clock and the channel are injected. */
  const AgentCards = (() => {
    const money = c => { const s = Math.abs(Math.round(c)); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const DEFAULT_EXPIRY_MS = 10 * 60000;
    // What each channel can carry. Buttons are a rendering; the text is the card.
    const CHANNELS = {
      in_app: { buttons: true, rich: true, name: "the app" },
      rcs: { buttons: true, rich: true, name: "RCS" },
      whatsapp: { buttons: true, rich: false, name: "WhatsApp" },
      imessage: { buttons: false, rich: true, name: "iMessage" },
      sms: { buttons: false, rich: false, name: "SMS" }
    };
    const LOAD_BEARING = ["action", "amount_cents", "counterparty", "fee_cents", "total_cents", "timing", "undo"];

    // S01/S05/S11: the anatomy is fixed. A money card that lacks a load-bearing field, or whose text would not read back
    // the counterparty, the amount and the total, is refused before anyone can say yes to it.
    function validate(spec) {
      const s = spec || {}, errors = [];
      for (const f of LOAD_BEARING) if (s[f] === undefined || s[f] === null || s[f] === "") errors.push(`${f} is missing`);
      for (const f of ["amount_cents", "fee_cents", "total_cents"]) if (s[f] !== undefined && s[f] !== null && !Number.isSafeInteger(s[f])) errors.push(`${f} must be an integer number of cents`);
      if (Number.isSafeInteger(s.amount_cents) && Number.isSafeInteger(s.fee_cents) && Number.isSafeInteger(s.total_cents) && s.amount_cents + s.fee_cents !== s.total_cents) errors.push(`total ${money(s.total_cents)} is not amount ${money(s.amount_cents)} plus fee ${money(s.fee_cents)}`);
      if (s.expiry_ms !== undefined && !(Number.isSafeInteger(s.expiry_ms) && s.expiry_ms > 0)) errors.push("expiry_ms must be a positive number of milliseconds");
      if (s.undo !== undefined && s.undo !== null && !/\b(undo|cancel|reverse|recall|can't be undone|cannot be undone|irreversible|final)\b/i.test(String(s.undo))) errors.push("undo must state the reversal path or that it cannot be undone");
      return errors;
    }
    const minutes = ms => `${Math.max(1, Math.round(ms / 60000))} minute${Math.round(ms / 60000) === 1 ? "" : "s"}`;

    // SMS segments. GSM-7 text fits 160 characters in one segment and 153 per segment once split (extension characters
    // count twice); anything outside GSM-7 (an emoji, a curly quote) turns the whole message into UCS-2: 70, then 67.
    const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
    const GSM_EXT = "^{}\\[~]|€";
    function segments(text) {
      const s = String(text || ""); let units = 0, gsm = true;
      for (const ch of s) { if (GSM.includes(ch)) units += 1; else if (GSM_EXT.includes(ch)) units += 2; else { gsm = false; break; } }
      if (gsm) return { encoding: "GSM-7", units, segments: units <= 160 ? 1 : Math.ceil(units / 153) };
      const n = [...s].reduce((k, ch) => k + (ch.codePointAt(0) > 0xffff ? 2 : 1), 0);
      return { encoding: "UCS-2", units: n, segments: n <= 70 ? 1 : Math.ceil(n / 67) };
    }
    const MAX_SEGMENTS = 2;
    const IRREVERSIBLE = /\b(can'?t be undone|cannot be undone|irreversible|cannot be recalled|can'?t be recalled|final once)\b/i;
    // The card a person sees: action, exact amount, who gets paid, fee (and the total when there is a fee), the one line
    // that cannot wait until after (it cannot be undone; it queues), and how to answer. Everything else is DETAILS.
    function compactText(f, channel) {
      const ch = CHANNELS[channel] || CHANNELS.sms, parts = [];
      if (f.supersedes_cents !== undefined && f.supersedes_cents !== null) parts.push(`Replaces the ${money(f.supersedes_cents)} card.`);
      parts.push(String(f.head).replace(/[.\s]+$/, "") + ".");
      parts.push(f.fee_cents > 0 ? `Fee ${money(f.fee_cents)}, total ${money(f.total_cents)}.` : "No fee.");
      if (f.when) parts.push(String(f.when).replace(/[.\s]+$/, "") + ".");
      if (f.irreversible) parts.push(f.irreversible_text || "Can't be undone.");
      const m = Math.max(1, Math.round((f.expiry_ms || DEFAULT_EXPIRY_MS) / 60000));
      parts.push(f.envelope ? `Inside your envelope (${f.envelope}); no question asked.` : ch.buttons ? `Confirm below within ${m} min, or reply DETAILS.` : `Reply YES or NO within ${m} min, or DETAILS.`);
      const text = parts.join(" ").replace(/\s+/g, " ").trim();
      return { text, segments: segments(text) };
    }
    function compact(card, channel) {
      // The head says the action once: "Send $40.00 to Sarah M (@sarah-m)", never "Send $40.00 to Sarah M: $40.00 to Sarah M".
      const c = card, base = String(c.counterparty).replace(/\s*\(.*\)\s*$/, "");
      const head = c.short || (c.amount_cents > 0 && String(c.action).includes(money(c.amount_cents)) && String(c.action).includes(base) ? String(c.action).replace(base, c.counterparty) : c.amount_cents > 0 ? `${c.action}: ${money(c.amount_cents)} ${c.direction === "from" ? "from" : "to"} ${c.counterparty}` : String(c.action).includes(base) ? c.action : `${c.action} (${c.counterparty})`);
      // Irreversible only when the terms say so and offer no window: "you can cancel this free until 4pm" is reversible until then.
      const undo = String(c.undo || ""), irr = c.irreversible !== undefined ? !!c.irreversible : IRREVERSIBLE.test(undo) && !/\b(you can|can be|reply "?undo"?|reverse this within|cancel (this|it) free)\b/i.test(undo);
      return compactText({ head, fee_cents: c.fee_cents, total_cents: c.total_cents, when: c.when_short || null, irreversible: irr, irreversible_text: c.irreversible_text || null, expiry_ms: c.expiry_ms, envelope: c.envelope || null, supersedes_cents: c.supersedes_cents }, channel);
    }
    function render(card, channel) {
      const ch = CHANNELS[channel] || CHANNELS.sms, r = compact(card, channel);
      return { channel, text: r.text, segments: r.segments, buttons: ch.buttons && !card.envelope ? [{ label: "Confirm", reply: "1" }, { label: "Cancel", reply: "2" }, { label: "Details", reply: "details" }] : [], card_id: card.id };
    }
    // S06 in full: the long form, sent only when the person asks for DETAILS (and on "what did you just ask me").
    function renderFull(card, channel) {
      const ch = CHANNELS[channel] || CHANNELS.sms, c = card;
      const head = c.superseded_text ? `${c.superseded_text} ` : "";
      const lines = [
        `${head}${c.action}${c.amount_cents > 0 ? `: ${money(c.amount_cents)} ${c.direction === "from" ? "from" : "to"} ${c.counterparty}` : ""}${c.source ? ` from ${c.source}` : ""}.`,
        `${c.fee_cents ? `Fee ${money(c.fee_cents)}, total ${money(c.total_cents)}.` : c.amount_cents > 0 ? `No fee, total ${money(c.total_cents)}.` : "No fee."} ${c.timing}.`,
        `${c.undo}`,
        ...(c.lines || []),
        c.envelope ? `No question will be asked for this: it is inside your envelope (${c.envelope}).` : `This card expires in ${minutes(c.expiry_ms)}.`
      ];
      const ask = c.envelope ? null : ch.buttons ? "Confirm or cancel below, or reply yes or no." : "Reply 1 or yes to confirm, 2 or no to cancel.";
      const text = lines.concat(ask ? [ask] : []).join(" ").replace(/\s+/g, " ").trim();
      return { channel, text, buttons: ch.buttons && !c.envelope ? [{ label: "Confirm", reply: "1" }, { label: "Cancel", reply: "2" }] : [], card_id: c.id };
    }
    // S05: what is paid, to whom, and the fee are always in the text the person answers.
    function readsBack(text, card) {
      const t = String(text), low = t.toLowerCase(), who = String(card.short_counterparty || card.counterparty).toLowerCase();
      if (!low.includes(who)) return false;
      if (card.amount_cents > 0 && !t.includes(money(card.amount_cents))) return false;
      if (card.fee_cents > 0) return t.includes(money(card.fee_cents)) && t.includes(money(card.total_cents));
      return /\bno fee\b/i.test(t);
    }

    // S07: what a reply means. Channel numerics ("1", "2"), words, and the thumbs up count; anything else asks.
    const YES = /^\s*(1|y|yes|yep|yeah|yup|ok|okay|sure|confirm|confirmed|do it|go ahead|go|send it|approve|approved|👍|✅)\s*[.!]*\s*$/i;
    const NO = /^\s*(2|n|no|nope|cancel|cancel that|stop|don'?t|decline|👎|❌)\s*[.!]*\s*$/i;
    const NEVER_MIND = /^\s*(never ?mind|nvm|forget it|leave it|scratch that|drop it)\s*[.!]*\s*$/i;
    const CORRECTION = /^\s*(actually|wait|no,?|make it|change it|instead|rather|yes,? but|ok,? but)\b/i;
    const RESTATE = /\b(what did you (just )?ask|what('s| is) pending|what are you waiting (on|for)|say that again|repeat that)\b/i;
    const UNDO = /^\s*(undo|reverse|take it back|cancel that (send|transfer|order|payment))\b/i;
    const DETAILS = /^\s*(3|details?|more|more info|terms|full terms|show (me )?(the )?(details|terms))\s*[.!?]*\s*$/i;
    function classify(text) {
      const t = String(text || "").trim();
      if (!t) return { kind: "empty" };
      if (NEVER_MIND.test(t)) return { kind: "never_mind" };
      if (UNDO.test(t)) return { kind: "undo" };
      if (DETAILS.test(t)) return { kind: "details" };
      if (YES.test(t)) return { kind: "yes" };
      if (NO.test(t)) return { kind: "no" };
      if (RESTATE.test(t)) return { kind: "restate" };
      if (CORRECTION.test(t)) return { kind: "correction" };
      if (/\$\s?\d|\b\d+(\.\d+)?\b/.test(t) && /\b(make|change|instead|rather|to)\b/i.test(t)) return { kind: "correction" };
      if (/\?$/.test(t) || /\b(balance|how much|what|why|when|spent|owe|can i|afford)\b/i.test(t)) return { kind: "new_request" };
      return { kind: "unclear" };
    }

    function create(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now());
      // Restorable from snapshot() so a stateless host keeps the live card, its expiry and its single use across messages.
      const st = o.state || {};
      const cards = Array.isArray(st.cards) ? JSON.parse(JSON.stringify(st.cards)) : [], transcript = Array.isArray(o.transcript) ? o.transcript : [], corrections = {};
      if (st.corrections) for (const [conv, id] of Object.entries(st.corrections)) { const c = cards.find(x => x.id === id); if (c) corrections[conv] = c; }
      let seq = Number.isSafeInteger(st.seq) ? st.seq : cards.length;
      const log = (event, card, extra) => { const e = Object.assign({ at: clock(), event, card_id: card ? card.id : null, conversation: card ? card.conversation : (extra && extra.conversation) || null }, extra || {}); transcript.push(e); return e; };
      const live = conversation => cards.filter(c => c.conversation === conversation && c.state === "live");
      // S02: a card past its expiry is dead the moment anyone looks at it, whatever the channel.
      function sweep(now) { for (const c of cards) if (c.state === "live" && now >= c.expires_at) { c.state = "expired"; c.ended_at = now; log("expired", c, { reason: "time" }); } }

      // Issue a card. Any live card in the same conversation is superseded and the new card says so (S04).
      function issue(spec, ctx) {
        const c = ctx || {}, now = clock(), errors = validate(spec);
        if (errors.length) { log("refused", null, { conversation: c.conversation || "default", errors }); return { ok: false, errors, text: null }; }
        sweep(now);
        const conversation = c.conversation || "default", channel = c.channel || "in_app";
        const prior = live(conversation);
        // A card killed by a correction a moment ago is still what the new card replaces, so the new card says so (S09).
        const corrected = corrections[conversation] && now - corrections[conversation].ended_at < DEFAULT_EXPIRY_MS ? corrections[conversation] : null; delete corrections[conversation];
        const card = Object.assign({}, spec, { id: `card-${++seq}`, conversation, channel_issued: channel, state: "live", issued_at: now, expiry_ms: spec.expiry_ms || DEFAULT_EXPIRY_MS, expires_at: now + (spec.expiry_ms || DEFAULT_EXPIRY_MS), uses: 0, reference: null, superseded_text: null, replaces: prior.map(p => p.id).concat(corrected ? [corrected.id] : []) });
        for (const p of prior) { p.state = "superseded"; p.ended_at = now; p.superseded_by = card.id; log("superseded", p, { by: card.id }); }
        const replaced = prior.length ? prior[prior.length - 1] : corrected;
        if (replaced) { card.superseded_text = `This replaces the ${money(replaced.amount_cents || replaced.total_cents)} card, which is now dead.`; card.supersedes_cents = replaced.amount_cents || replaced.total_cents; }
        const r = render(card, channel);
        if (r.segments.segments > MAX_SEGMENTS) { log("refused", null, { conversation, errors: [`the card is ${r.segments.segments} SMS segments; the limit is ${MAX_SEGMENTS}`] }); return { ok: false, errors: [`the card is ${r.segments.segments} SMS segments; the limit is ${MAX_SEGMENTS}`], text: null }; }
        if (!card.envelope && !readsBack(r.text, card)) { log("refused", null, { conversation, errors: ["the card text does not read back the counterparty, the amount and the total"] }); return { ok: false, errors: ["the card text does not read back the counterparty, the amount and the total"], text: null }; }
        cards.push(card); log("issued", card, { channel, text: r.text, expires_at: card.expires_at });
        return Object.assign({ ok: true, card_id: card.id, expires_at: card.expires_at, replaced: card.replaces, details: renderFull(card, channel).text }, r);
      }

      // The reply. ctx: { conversation, channel, card_id (optional: a button carries it), now }. A fire returns a one-time
      // token the executor consumes; the card is consumed here first, so nothing can fire it again (S03, S14).
      function reply(text, ctx) {
        const c = ctx || {}, now = clock(), conversation = c.conversation || "default", channel = c.channel || "in_app";
        sweep(now);
        const kind = classify(text).kind;
        const current = live(conversation)[0] || null;
        const named = c.card_id ? cards.find(x => x.id === c.card_id) : null;
        const say = (outcome, t, extra) => { log("reply", current || named, Object.assign({ channel, text: String(text), outcome }, extra || {})); return Object.assign({ outcome, text: t, card_id: (current || named || {}).id || null }, extra || {}); };
        if (kind === "restate") return current ? say("restate", `${renderFull(current, channel).text} ${minutes(current.expires_at - now)} left.`) : say("nothing_pending", "Nothing is waiting on you.");
        if (kind === "details") return current ? say("details", `${renderFull(current, channel).text} ${minutes(current.expires_at - now)} left.`) : say("nothing_pending", "Nothing is waiting on you.");
        if (kind === "undo") return undo(now, conversation, channel);
        if (kind === "never_mind") { if (current) { current.state = "dropped"; current.ended_at = now; log("dropped", current, { reason: "never mind" }); } return say("never_mind", "Okay. Nothing happened.", { killed: current ? current.id : null }); }
        if (c.card_id && named && current && named.id !== current.id) return say("mismatch", `That reply belongs to an earlier card (${named.id}), not the one that is live. Nothing was done. ${render(current, channel).text}`);
        if (c.card_id && named && !current) {
          if (named.state === "consumed") return say("already_done", `${named.action} was already done${named.reference ? ` (ref ${named.reference})` : ""}. I did not do it again.`, { reference: named.reference });
          if (named.state === "expired") return say("expired", `That card expired after ${minutes(named.expiry_ms)}. Want me to set it up again?`);
          return say("mismatch", `That card is ${named.state}; nothing is live. Nothing was done.`);
        }
        if (!current) {
          const last = cards.filter(x => x.conversation === conversation).pop();
          if (kind === "yes" && last && last.state === "expired") return say("expired", `That card expired after ${minutes(last.expiry_ms)}. Want me to set it up again?`, { card_id: last.id });
          if (kind === "yes" && last && last.state === "consumed") return say("already_done", `${last.action} was already done${last.reference ? ` (ref ${last.reference})` : ""}. I did not do it again.`, { reference: last.reference });
          if (kind === "yes") return say("nothing_pending", "There is nothing waiting on a yes. Say what you want done and I'll put up a card.");
          return say("nothing_pending", kind === "new_request" ? null : "Nothing is waiting on you.", { kind });
        }
        if (kind === "yes") {
          if (current.uses > 0) return say("already_done", `${current.action} was already done. I did not do it again.`);
          current.uses = 1; current.state = "consumed"; current.consumed_at = now; current.channel_consumed = channel; current.token = `fire-${current.id}-${now}`;
          log("consumed", current, { channel });
          return say("fire", null, { token: current.token, card: current, channels: [current.channel_issued, channel] });
        }
        if (kind === "no") { current.state = "declined"; current.ended_at = now; log("declined", current, { channel }); return say("declined", "Okay, not doing that. Nothing was changed."); }
        if (kind === "correction") { current.state = "superseded"; current.ended_at = now; corrections[conversation] = current; log("corrected", current, { channel, text: String(text) }); return say("correction", null, { killed: current.id, correction: String(text) }); }
        if (kind === "new_request") { current.state = "dropped"; current.ended_at = now; log("dropped", current, { reason: "new request", text: String(text) }); return say("new_request", `I dropped the ${money(current.amount_cents)} card for ${current.counterparty}; say so if you still want it.`, { dropped: current.id }); }
        return say("ask", `Yes or no? ${render(current, channel).text}`);
      }

      // S12: the receipt after a fire restates the reference, what happens next, and the undo window.
      function receipt(card_id, result) {
        const card = cards.find(x => x.id === card_id); if (!card || card.state !== "consumed") throw new Error("A receipt needs a consumed card.");
        const r = result || {}; card.reference = r.reference || null; card.fired_at = clock(); card.undo_until = r.undo_until === undefined ? (card.undo_window_ms ? card.fired_at + card.undo_window_ms : null) : r.undo_until;
        log("receipt", card, { reference: card.reference, undo_until: card.undo_until });
        const window = card.undo_until ? `Reply "undo" before ${new Date(card.undo_until).toISOString().slice(0, 16).replace("T", " ")} UTC to reverse it.` : `This cannot be undone.`;
        const text = `Done: ${card.action}, ${money(card.total_cents)} ${card.direction === "from" ? "from" : "to"} ${card.counterparty}${card.reference ? ` (ref ${card.reference})` : ""}. ${r.next || "Nothing else happens."} ${window}`;
        return { text, card_id, reference: card.reference, undo_until: card.undo_until };
      }
      function undo(now, conversation, channel) {
        const fired = cards.filter(x => x.conversation === conversation && x.state === "consumed" && x.fired_at).pop();
        const say = (outcome, t, extra) => { log("undo", fired, Object.assign({ channel, outcome }, extra || {})); return Object.assign({ outcome, text: t, card_id: fired ? fired.id : null }, extra || {}); };
        if (!fired) return say("nothing_to_undo", "Nothing recent to undo.");
        if (!fired.undo_until) return say("cannot_undo", `${fired.action} cannot be undone${fired.reference ? ` (ref ${fired.reference})` : ""}. ${fired.after_window || "I can help with the next-best step."}`);
        if (now > fired.undo_until) return say("past_window", `${fired.action} is past its undo window (ended ${new Date(fired.undo_until).toISOString().slice(0, 16).replace("T", " ")} UTC). ${fired.after_window || "I can help with the next-best step."}`);
        const inverse = issue({ action: fired.inverse_action || `Undo ${fired.action}`, amount_cents: fired.amount_cents, counterparty: fired.counterparty, direction: fired.direction === "from" ? "to" : "from", fee_cents: 0, total_cents: fired.amount_cents, timing: "Right away", undo: "This reversal cannot be undone.", inverse_of: fired.id }, { conversation, channel });
        if (!inverse.ok) return say("undo_failed", `I could not put up the reversal card: ${inverse.errors.join("; ")}. Nothing was changed.`, { errors: inverse.errors });
        return say("undo_card", inverse.text, { inverse_card_id: inverse.card_id });
      }
      const get = id => cards.find(x => x.id === id) || null;
      const snapshot = () => JSON.parse(JSON.stringify({ cards, seq, corrections: Object.fromEntries(Object.entries(corrections).map(([k, v]) => [k, v.id])) }));
      return { snapshot, issue, reply, receipt, render: (id, channel) => render(get(id), channel), details: (id, channel) => renderFull(get(id), channel), live: conv => live(conv || "default").map(c => c.id), get, transcript, cards };
    }
    return { create, validate, render, renderFull, compact, compactText, segments, classify, readsBack, CHANNELS, LOAD_BEARING, DEFAULT_EXPIRY_MS, MAX_SEGMENTS, IRREVERSIBLE, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentCards;
