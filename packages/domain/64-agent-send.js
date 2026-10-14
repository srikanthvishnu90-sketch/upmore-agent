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
    // The new amount sits right next to the change words, so "no, wait 5 minutes" is never read as $5.
    const AMT = String.raw`\$?\s?[\d,]+(?:\.\d{1,2})?(?:\s*(?:dollars|bucks))?`;
    // A schedule ("every friday", "weekly", "on the 1st") is not part of a name; recurring sends are not built.
    const SCHEDULE = /\b(?:every\s+(?:day|week|other week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|night)|each\s+(?:week|month|friday|monday)|weekly|monthly|biweekly|recurring|on the \d{1,2}(?:st|nd|rd|th)?)\b/i;
    const AMOUNT_CHANGE = new RegExp(String.raw`^\s*(?:no[,.]?\s+|actually[,.]?\s+|wait[,.]?\s+|sorry[,.]?\s+)*(?:(?:make (?:it|that)|change (?:it|that)? ?to|switch (?:it|that)? ?to|(?:it|that) should be|should be|i meant|meant to say|actually)\s+${AMT}|\$\s?[\d,]+(?:\.\d{1,2})?|${AMT}\s+instead)\s*(?:instead|please|then)?\s*[.!]*\s*$`, "i");
    // Amounts typed as words ("forty bucks", "two hundred fifty"): whole dollars only (megadoc A12).
    const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
    const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
    function wordsAmount(text) {
      const toks = String(text || "").toLowerCase().replace(/-/g, " ").split(/[^a-z]+/).filter(Boolean);
      let best = null;
      for (let i = 0; i < toks.length; i++) {
        let total = 0, cur = 0, used = 0, j = i;
        for (; j < toks.length; j++) {
          const w = toks[j];
          if (w in UNITS) cur += UNITS[w]; else if (w in TENS) cur += TENS[w];
          else if (w === "hundred") cur = (cur || 1) * 100; else if (w === "thousand") { total += (cur || 1) * 1000; cur = 0; }
          else if ((w === "a" || w === "and") && used) { continue; } else if (w === "a" && /^(hundred|thousand)$/.test(toks[j + 1] || "")) continue;
          else break;
          used++;
        }
        if (used && !(used === 1 && toks[i] === "one" && !/^(dollars?|bucks)$/.test(toks[j] || ""))) { const v = total + cur; if (v > 0 && (!best || used > best.used)) best = { used, cents: v * 100 }; }
      }
      return best ? best.cents : null;
    }
    const FX = /(?:€|£|¥|₹)|\b(euros?|eur|pounds?|gbp|quid|pesos?|mxn|yen|jpy|rupees?|inr|cad|canadian dollars?|aud|francs?|yuan|rmb)\b/i;
    // A send for later or on a condition is not built: never staged as a send for now (megadoc A08, A15).
    const LATER = /\b(tomorrow|tonight at|next (?:week|month|monday|tuesday|wednesday|thursday|friday)|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in \d+ (?:days?|weeks?|hours?)|at \d{1,2}(?::\d{2})?\s*(?:am|pm)?\b|later today|this (?:weekend|friday|evening))\b/i;
    const CONDITION = /\b(?:only if|but only|if my|when my|once my|after my|as soon as|when it lands|when (?:the|my) (?:paycheck|deposit|refund))\b/i;
    const MARKET = /\b(craigslist|marketplace|offerup|letgo|ebay seller|facebook seller|the seller|a seller|the guy from|the girl from|someone online|a stranger)\b/i;
    const NEW_PAYEE = /\bnew (?:landlord|account|payee|bank|routing)\b|\blandlord (?:changed|has a new)\b/i;
    const PHONE = /(?:^|\s)((?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]?\d{4}|\d{10})(?!\d)/;
    function parse(text) {
      const t = String(text || "").trim(), lower = t.toLowerCase();
      const forIdx = lower.search(/\bfor\b/), head = forIdx >= 0 ? t.slice(0, forIdx) : t, memo = forIdx >= 0 ? t.slice(forIdx + 3).trim().replace(/^[\s:,-]+/, "") || null : null;
      // A phone number is the recipient, never the amount ("send 40 to this number 312-555-0147", megadoc B13).
      const phoneM = PHONE.exec(head), phone = phoneM ? phoneM[1].trim() : null, head2 = phone ? head.replace(phoneM[1], " ") : head;
      const amount_cents = parseAmount(head2) || wordsAmount(head2);
      // "40.555" and "4 0" are never rounded or joined silently (megadoc A13, B08).
      const extraDigits = /(?:^|[\s$])(\d+)\.(\d{3,})\b/.exec(head2), spaced = /(?:^|\s)\$?(\d)\s(\d)(?:\s|$)/.exec(head2);
      let recipient = null, recipient_raw = null;
      // The amount is a wall: a name never runs across it ("send sam 40 lol" is Sam, not "Sam Lol"; found by probing).
      const bare = head2.replace(AMOUNT, " \u00a6 ").replace(SCHEDULE, " ").replace(/\s+/g, " ");
      const to = /\bto\s+(?!(?:send|pay|venmo|zelle|transfer|wire)\b)(@?[A-Za-z][\w.'-]*(?:\s+[A-Za-z][\w.'-]*){0,3})/i.exec(bare);
      if (to) recipient_raw = to[1].trim();
      else { const verb = /(?:^|[,.;:!?\u00a6]\s*|\b(?:to|please|pls|plz|you|u|gotta|gonna|wanna|need to|i'?ll|i will|let me|lemme|ok|okay|yeah|yes|yep|just|also|then|and|i|go ahead and)\s+)(?:please\s+)?(?:send|pay|venmo|zelle|cash ?app|paypal|transfer|wire|give)\s+(@?[A-Za-z][\w.'-]*(?:\s+[A-Za-z][\w.'-]*){0,4})/i.exec(bare.trim()); if (verb) recipient_raw = verb[1].trim(); }
      if (phone) recipient_raw = recipient = phone;
      else if (recipient_raw) {
        // A name ends where the sentence moves on: "jake and add pizza", "maya but only if", "maya tomorrow at 9",
        // "maya from savings", "my roommate unevenly" (megadoc A05, A08, A11, A15, B07, C11).
        recipient_raw = recipient_raw.replace(/\s+(now|today|tonight|tomorrow|please|instantly|asap|rn|pls|back|and|but|if|from|at|on|by|when|then|also|unevenly|evenly|only|every|each|via|using|with|like|about|around|roughly|approximately|approx|maybe)\b.*$/i, "").replace(/\s+(he|she|they|who|because|since)\b.*$/i, "").trim();
        // An amount in words is not part of the name ("send maya forty bucks").
        const numWord = w => w.toLowerCase() in UNITS || w.toLowerCase() in TENS || /^(hundred|thousand|bucks|dollars?|a|and)$/i.test(w);
        const kept = recipient_raw.split(/\s+/); while (kept.length > 1 && numWord(kept[kept.length - 1])) kept.pop();
        const cut = kept.findIndex((w, i) => i > 0 && numWord(w) && w.toLowerCase() !== "a"); if (cut > 0) kept.length = cut;
        recipient_raw = kept.join(" ");
        recipient = recipient_raw.split(/\s+/).slice(0, 2).join(" ").replace(/\b(my|the|some|another)\b\s*/gi, "").trim() || null;
        if (recipient && /^(?:me|myself|us|you|u|it|them)$/i.test(recipient)) recipient = recipient_raw = null; // "give me 40" names nobody
      }
      const speed = /\b(instant|instantly|right now|asap|now)\b/i.test(t) ? "instant" : null;
      const funding = (/\bfrom\s+(checking|savings|[a-z]+ account)/i.exec(t) || [])[1] || null;
      const railM = /\b(venmo|zelle|cash ?app|paypal)\b/i.exec(head), rail = railM ? (/cash/i.test(railM[1]) ? "cash_app" : railM[1].toLowerCase()) : null;
      // "4.5" could be $4.50, $45 or $4,500: one question, never a guess (response-style corpus 1.14).
      const one_decimal = /(?:^|[\s$])\d+\.\d(?!\d)/.test(head);
      // A memo can also be added ("pay jake 25 and add \"pizza\"", megadoc A05).
      const added = /\band (?:add|put|write)\s+(?:a\s+)?(?:memo|note)?\s*(?:of|saying|that says)?\s*["“]?([^"”]{1,60})["”]?\s*$/i.exec(t);
      return { amount_cents, recipient, recipient_raw, memo: memo || (added ? added[1].trim() : null), speed, funding, rail, text: t, one_decimal, recurring: SCHEDULE.test(t),
        scheduled: !SCHEDULE.test(t) && LATER.test(t), conditional: CONDITION.test(t),
        fx: FX.test(t), extra_digits: extraDigits ? { whole: Number(extraDigits[1]), frac: extraDigits[2] } : null, spaced: spaced ? [Number(spaced[1]), Number(spaced[2])] : null,
        everything: /\b(everything|all (?:of )?my (?:money|cash|checking)|all of it|the whole (?:balance|account))\b/i.test(t) };
    }
    // A description of a person, not a name: "the guy from yesterday", "my landlord's cousin", "a guy i just met at the bar".
    // It never becomes a recipient's name; the person is asked who it is (response-style corpus 1.02, 1.08).
    const DESCRIBED = /^(?:my|the|a|an|this|that|his|her|our|their)\b|\b(?:guy|girl|man|woman|lady|person|someone|somebody|cousin|friend|brother|sister|mom|mother|dad|father|landlord|roommate|boss|coworker|neighbou?r|contractor|plumber|driver|home|bar|store|shop|company|agency|office)\b|\b(?:from|at|who|met|yesterday|tonight|earlier)\b/i;
    const GRIEF = /\b(passed( away)?|died|funeral|lost my (dad|mom|father|mother|husband|wife|son|daughter|brother|sister|grand\w+))\b/i;
    // S04: a handle one or two edits away from a saved one is a look-alike until the user says otherwise. The rule lives in
    // the recipient layer (42-agent-recipients.js) so every person-to-person flow applies it the same way.
    function lookalike(handle, people) {
      const r = AgentRecipients.resolve(handle, people);
      return r.status === "saved" && r.matched_by === "handle" ? { exact: r.person } : r.status === "lookalike" && r.handle ? { suspect: r.suspect, distance: r.distance } : null;
    }

    // Balance-aware sends (response-style corpus 1.05). Rows are the person's own agent_financial_accounts rows (the host
    // reads them through the RLS client and merges the account kinds the person set): account_id, name, institution,
    // account_kind, balance_cents, available_cents, balance_as_of, fetched_at, sync_error, status, currency. Pure: the rows
    // and the clock come in. Returns null whenever the answer is not known for sure, because a wrong "it won't go through"
    // is worse than none: no linked checking, a checking account without a number, a balance more than a day old or with
    // no time on it, a failed sync. With several checking accounts the fullest one decides, since the person's app may pay
    // from any of them. Only a send above every one of them comes back, with the number, the account, its source and its
    // as-of time (every money statement cites both, CLAUDE.md).
    const FUNDS_STALE_MS = DAY;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const asOfLabel = t => { const d = new Date(t), h = d.getUTCHours(), m = d.getUTCMinutes(); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} UTC`; };
    const cents = v => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v));
    const at = v => { const t = v === null || v === undefined || v === "" ? NaN : typeof v === "number" ? v : Date.parse(v); return Number.isFinite(t) ? t : NaN; };
    // The person's own type wins; an untyped row named "... Checking" is checking, the same reading the balance answer uses.
    const kindOf = a => { const k = String(a.account_kind || "unknown").toLowerCase(); if (k !== "unknown") return k; const n = String(a.name || "").toLowerCase(); return /\bchecking\b/.test(n) ? "checking" : /\bsavings?\b/.test(n) ? "savings" : "unknown"; };
    const acctName = a => { const n = String(a.name || a.account_id || "Your account").trim(), i = String(a.institution || "").trim(); return i && !n.toLowerCase().includes(i.toLowerCase()) ? `${i} ${n}` : n; };
    function fundsCheck(rows, total_cents, now, opts) {
      const funding = String((opts && opts.funding) || "").toLowerCase(), kinds = /savings/.test(funding) ? ["savings"] : /checking/.test(funding) ? ["checking"] : ["checking", "cash"];
      if (!Number.isSafeInteger(total_cents) || total_cents <= 0) return null;
      const list = (Array.isArray(rows) ? rows : []).filter(a => a && a.status !== "disconnected" && kinds.includes(kindOf(a)) && (!a.currency || String(a.currency).toUpperCase() === "USD"));
      if (!list.length) return null;
      const read = list.map(a => { const av = cents(a.available_cents), bal = cents(a.balance_cents), t = Number.isFinite(at(a.balance_as_of)) ? at(a.balance_as_of) : at(a.fetched_at); return { a, cents: av !== null ? av : bal, available: av !== null, t }; });
      // One unknown or stale account could be the one with the money: then nothing is said at all.
      if (read.some(x => x.cents === null || !Number.isFinite(x.t) || now - x.t > FUNDS_STALE_MS || x.t - now > 5 * 60000 || x.a.sync_error === true)) return null;
      const best = read.slice().sort((x, y) => y.cents - x.cents)[0];
      if (total_cents <= best.cents) return null;
      const inst = String(best.a.institution || "").trim();
      return { account: acctName(best.a), account_id: best.a.account_id || null, available_cents: best.cents, available: best.available, short_cents: total_cents - best.cents, as_of: best.t, as_of_text: asOfLabel(best.t), source: `from your linked ${inst ? inst + " " : ""}account`, accounts: read.length };
    }
    // The question, before any card: the number with its source and as-of time, what the person's app may pay from, and the
    // choices. Never an offer to move money between accounts: Upmore can't (MONEY_MOVE in agent-chat's capabilities.ts).
    function fundsText(chk, send) {
      const amt = money(send.amount_cents), name = send.recipient.name, rail = send.rail || {}, handoff = rail.mode === "handoff";
      const has = `${chk.account}${chk.accounts > 1 ? ", your fullest checking account," : ""} has ${money(chk.available_cents)}${chk.available ? " available" : ""} (${chk.source}, as of ${chk.as_of_text}), less than ${money(send.amount_cents + (rail.fee_cents || 0))}.`;
      const app = !handoff ? `So ${amt} to ${name} won't go through from it.`
        : rail.id === "zelle" ? `Zelle pays from the bank account you enrolled, so if that's this one, ${amt} to ${name} won't go through.`
        : `If ${rail.name} pays from it, ${amt} to ${name} won't go through; ${rail.name} can also pay from your ${rail.name} balance or a card I can't see.`;
      const options = chk.available_cents > 0 ? `${amt} anyway, ${money(chk.available_cents)}, or a different amount?` : `${amt} anyway, or a different amount?`;
      return `${has} ${app} ${handoff ? "Set up" : "Send"} ${options}`;
    }
    // Answers to that question. A money move is named and refused; a yes, "anyway" or the same amount goes on to the card.
    const FUNDS_NO = /^\s*(?:n|no|nope|nah|cancel|stop|never ?mind|nvm|forget it|skip it|drop it|don'?t)\b/i;
    const FUNDS_MOVE = /\b(?:move|moving|transfer|pull|shift)\b|\bsavings\b|\bfrom (?:my |the )?other account\b/i;
    const FUNDS_YES = /^\s*(?:y|yes|yep|yeah|ya|yup|sure|ok|okay|do it|go ahead|go for it|send it|set it up|still|anyway|send (?:it )?anyway|full amount|the full amount|all of it|try it|try anyway)\b/i;
    const FUNDS_AVAIL = /\b(?:what(?:'s| is)? (?:there|available|in it|i have)|what i(?:'ve)? got|the available|max(?:imum)?|everything in it)\b/i;
    const FUNDS_LESS = /\b(?:less|smaller|lower|different amount)\b/i;
    const FUNDS_AMOUNT = /^\s*(?:(?:send|make it|do|just|ok|okay|then|set up)\s+)*\$?\s?[\d,]+(?:\.\d{1,2})?\s*(?:dollars|bucks)?\s*(?:instead|then|please|pls)?\s*[.!]*\s*$/i;
    const fundsAccepts = text => { const t = String(text || ""); return t.length <= 80 && (FUNDS_NO.test(t) || FUNDS_YES.test(t) || FUNDS_AMOUNT.test(t) || FUNDS_AVAIL.test(t) || FUNDS_MOVE.test(t) || FUNDS_LESS.test(t)); };

    function create(opts) {
      const o = opts || {}, clock = o.clock || (() => Date.now());
      const Money = typeof AgentMoney !== "undefined" ? AgentMoney : null, Loop = typeof AgentLoop !== "undefined" ? AgentLoop : null, Voice = typeof AgentVoice !== "undefined" ? AgentVoice : null, Guard = typeof DataGuard !== "undefined" ? DataGuard : null;
      const Rec = typeof AgentRecipients !== "undefined" ? AgentRecipients : null;
      if (!Money || !Loop || !Rec) throw new Error("AgentSend needs AgentMoney, AgentLoop and AgentRecipients loaded.");
      // A stateless host restores the session from snapshot(): the loop (log, memory, pending confirmation), the staged sends and the live card.
      const st = o.state || {}, ls = st.loop || {};
      const log = Array.isArray(o.log) ? o.log : Array.isArray(ls.log) ? ls.log : [], memoryInit = o.memory || ls.memory || null;
      const Cards = typeof AgentCards !== "undefined" ? AgentCards : null;
      const loop = Loop.create({ registry: o.registry, connectors: o.connectors, clock, log, memory: memoryInit, sent: ls.sent, pending: ls.pending || null, control: o.control || null, envelopes: o.envelopes || [], confirm_ttl_ms: o.confirm_ttl_ms || 10 * 60000, guard: Guard, compliance: o.compliance || null, partners: o.partners || {}, kyc: o.kyc || null });
      const sends = Array.isArray(o.sends) ? o.sends : Array.isArray(st.sends) ? st.sends : []; // staged handoff sends awaiting their debit
      let pending = st.pending || null; // { send, confirmation_id, request, prep }
      // Recipients come from the one recipient layer: saved rows (the host loads public.saved_recipients) plus any directory.
      const book = o.recipients || Rec.book({ people: o.people || [], clock, channel: o.channel || null });
      let identity = st.identity || null, waiting = st.waiting || null; // a "Which Marcus", look-alike or stranger follow-up and the send it is for
      let saveOffer = st.save_offer || null; // a stranger confirmed by read-back whom the person may SAVE explicitly
      let pendingAmountCheck = st.amount_check || null; // "Do you mean $4.50?" waiting on its answer
      let pendingFunds = st.funds_check || null; // "Checking has $612.18 available ... anyway?" waiting on its answer: { parsed, pick, amount_cents, available_cents, recipient }
      // The person's own bank rows, read by the host (a function, sync or async). A failed read is no warning, never a guess.
      const readBalances = async () => { if (typeof o.balances !== "function") return null; try { return await o.balances(); } catch { return null; } };
      const sentWithin = ms => loop.memory.outcomes.filter(x => (x.capability_id === CAPABILITY || x.capability_id === "PAY-002") && x.result === "confirmed" && clock() - (x.recorded_at || 0) < ms).reduce((s, x) => s + (x.amount_cents || 0), 0) + sends.filter(s => s.staged_at && !s.cancelled && clock() - s.staged_at < ms).reduce((s, x) => s + x.amount_cents, 0);

      // The five-field confirmation (doc 11): action, exact amount, recipient with handle, funding account, fee, timing.
      // The card a person answers: two SMS segments at most. Who gets paid, the exact amount, the rail, the fee and total,
      // and that it can't be undone once received. Funding account, timing and the full reversal terms are DETAILS.
      // The memo rides on the card, quoted as text (megadoc A01, A05); a memo with instruction-like text is never shown as one.
      // A memo too long for the card is still named on it, and DETAILS quotes it whole: the person never approves a memo
      // they weren't shown (found by probing, 2026-10-12: a 75-character memo went out with the send, seen nowhere).
      const memoOn = send => !send.memo || send.memo_flagged ? "" : String(send.memo).length <= 40 ? `, memo "${String(send.memo).replace(/"/g, "'")}"` : ", with a memo (DETAILS shows it)";
      const cardText = (send, channel) => {
        const who = send.confirm.recipient, amt = money(send.amount_cents), rail = send.rail.name, irr = /irreversible|can'?t be undone|cannot be undone/i.test(String(send.rail.reversible || "")) && !/^friends-and-family/i.test(String(send.rail.reversible || ""));
        const nu = send.recipient.readback_id ? `${send.recipient.name}${send.recipient.handle && send.recipient.handle !== send.recipient.name ? ` (${send.recipient.handle})` : ""}` : null;
        const heads = nu ? [`New recipient, first send: set up ${amt} to ${nu} in ${rail} from ${send.confirm.from}, for you to send`, `New recipient, first send: set up ${amt} to ${nu} in ${rail}`]
          : [send.rail.mode === "handoff" ? `Set up ${amt} to ${who} in ${rail} from ${send.confirm.from}${memoOn(send)}, for you to send` : `Send ${amt} to ${who} by ${rail} from ${send.confirm.from}${memoOn(send)}`, send.rail.mode === "handoff" ? `Set up ${amt} to ${who} in ${rail}` : `Send ${amt} to ${who} by ${rail}`];
        const fee = send.rail.fee_cents || 0;
        for (const head of heads) {
          const f = { head, fee_cents: fee, total_cents: send.amount_cents + fee, irreversible: irr || /friends-and-family/i.test(String(send.rail.reversible || "")), irreversible_text: /friends-and-family/i.test(String(send.rail.reversible || "")) ? "Friends-and-family sends can't be undone." : "Can't be undone once received.", expiry_ms: o.confirm_ttl_ms || 10 * 60000, when: send.memo_flagged ? "Your memo had instruction-like text; I kept it as text" : send.verify_question && nu ? "Only if they asked you for this themselves, in person or on a call you placed" : null };
          const r = Cards ? Cards.compactText(f, channel || "sms") : { text: `${head}. ${fee ? `Fee ${money(fee)}, total ${money(send.amount_cents + fee)}.` : "No fee."} Reply YES or NO, or DETAILS.`, segments: { segments: 1 } };
          if (r.segments.segments <= 2) return r.text;
        }
        return `Send ${amt} to ${who}. Reply YES, NO or DETAILS.`;
      };
      const confirmText = send => `${send.confirm.action} ${send.confirm.amount} to ${send.confirm.recipient} from ${send.confirm.from}? ${send.confirm.fee ? "Fee " + send.confirm.fee : "No fee"}, ${send.confirm.when}. ${send.rail.reversible.charAt(0).toUpperCase() + send.rail.reversible.slice(1)}.${send.memo_flagged ? " The memo contained instruction-like text; I kept it as plain text and ignored it." : send.memo ? ` Memo: "${String(send.memo).replace(/"/g, "'")}".` : ""} Reply yes or no.`;

      const prepare = (parsed, person, memo) => Money.prepareSend({ amount_cents: parsed.amount_cents, recipient: person.name, memo, speed: parsed.speed, funding: parsed.funding || o.default_funding || "checking", instruction: parsed.text }, { people: [person], partners: o.partners || {}, today: ymd(clock()), sent_today_cents: sentWithin(DAY), sent_week_cents: sentWithin(WEEK), envelope: o.limits || {}, large_cents: o.large_cents, default_funding: o.default_funding || "checking", include_gated: false });
      // Starts the follow-up (choose, look-alike or the stranger path) and remembers the send it is for. Nothing is staged.
      function follow(spec, parsed, reason, extra) {
        const s0 = Rec.identityStart(spec, clock()); identity = s0.state; waiting = { parsed }; pending = null;
        return Object.assign({ outcome: "ask", reason, text: s0.text }, extra || {});
      }
      async function stage(parsed, pick) {
        // A scam pattern stops the request before any question about who or how much (response-style corpus 5.06).
        const scam = Money.SCAM.exec(String(parsed.text || ""));
        if (scam && !pick) return { outcome: "stop", reason: "scam_pattern", text: `That's a scam pattern ("${scam[0]}"): no real agency or company asks for money this way. I won't send this, and nothing was sent. If someone called you, hang up.` };
        // Warnings that ride along with the question, never a refusal (megadoc B12, N10).
        const warn = pick ? "" : MARKET.test(String(parsed.text || "")) ? "Paying a stranger from a listing is a common scam, and person-to-person apps rarely protect purchases; a card or the marketplace's own checkout does. " : NEW_PAYEE.test(String(parsed.text || "")) ? "A new payee for a big payment is the most common rent scam. Check it with your landlord on a number you already have. " : "";
        const grief = GRIEF.test(String(parsed.text || "")) && !pick ? "I'm so sorry. " : "", beat = grief + warn;
        if (!pick && (parsed.scheduled || parsed.conditional)) { const rr = parsed.recipient && !DESCRIBED.test(parsed.recipient_raw || "") ? book.resolve(parsed.recipient) : null, nm = rr && rr.status === "saved" ? rr.person.name : null; return { outcome: "not_built", reason: parsed.conditional ? "conditional" : "scheduled", text: parsed.conditional ? `Payments that wait on a condition aren't built yet, so nothing was set up.${parsed.amount_cents && nm ? ` I can set up ${money(parsed.amount_cents)} to ${nm} now instead. Want that?` : ""}` : `I couldn't read when, so nothing was set up. Say the person, the amount and a day or time, like "send Maya 40 tomorrow at 9am", and I'll ask you for the card then (it still needs your yes).${parsed.amount_cents && nm ? ` Or I can set up ${money(parsed.amount_cents)} to ${nm} now. Want that?` : ""}` }; }
        if (!pick && parsed.fx) return { outcome: "refuse", reason: "fx_unsupported", text: "Upmore sends US dollars only, so I can't send another currency, and nothing was set up. If you want to send a dollar amount, tell me how much." };
        if (!pick && parsed.extra_digits) { const lo = parsed.extra_digits.whole * 100 + Number(parsed.extra_digits.frac.slice(0, 2)); return { outcome: "ask", reason: "amount_format", text: `Dollars and cents only. Did you mean ${money(lo)} or ${money(lo + 1)}?` }; }
        if (!pick && parsed.spaced) { const [a1, b1] = parsed.spaced; return { outcome: "ask", reason: "amount_format", text: `Did you mean ${money((a1 * 10 + b1) * 100)} or ${money(a1 * 100)}?` }; }
        if (!pick && parsed.everything && !parsed.amount_cents) return { outcome: "ask", reason: "amount_all", text: `${beat}Sending everything would leave $0.00 in checking and could overdraft bills that are due, so I won't guess the amount. How much exactly?` };
        if (parsed.recurring && !pick) { const rr = parsed.recipient && !DESCRIBED.test(parsed.recipient_raw || "") ? book.resolve(parsed.recipient) : null, nm = rr && rr.status === "saved" ? rr.person.name : null; return { outcome: "not_built", reason: "recurring", text: `Recurring payments aren't built yet, so I can't set that up and nothing was scheduled.${parsed.amount_cents && nm ? ` I can do a one-time ${money(parsed.amount_cents)} to ${nm} now. Want that?` : ""}` }; }
        if (parsed.one_decimal && parsed.amount_cents && !parsed.amount_checked && !pick) { pendingAmountCheck = parsed; return { outcome: "ask", reason: "amount_format", text: `Do you mean ${money(parsed.amount_cents)}? Checking since it could also be ${money(parsed.amount_cents * 10)} or ${money(parsed.amount_cents * 1000)}.` }; }
        // "Send Maya my share" with no amount: a share of something said before, which this message doesn't carry (megadoc B10).
        if (!parsed.amount_cents && /\b(?:my|her|his|their|our|your) (?:share|half|part|cut|portion)\b/i.test(String(parsed.text || ""))) return { outcome: "ask", reason: "share_of_what", text: `${beat}Your share of what? Say the amount, like "send ${parsed.recipient ? String(parsed.recipient).replace(/\b\w/g, (c) => c.toUpperCase()) : "Maya"} $40 for dinner".` };
        // "The usual" (megadoc A10): no record of past sends is kept here, so the amount is asked, never guessed, and why.
        if (!parsed.amount_cents && /\b(?:the usual|my usual|usual amount|same as (?:last time|usual|always|before)|same amount|what i (?:always|usually) (?:send|pay|give))\b/i.test(String(parsed.text || ""))) return { outcome: "ask", reason: "usual_unknown", text: `${beat}How much? I don't keep a record of what you usually send${parsed.recipient && !DESCRIBED.test(parsed.recipient_raw || "") ? ` ${String(parsed.recipient).replace(/\s+(?:the|my|same|usual|what)\b.*$/i, "").replace(/\b\w/g, c => c.toUpperCase())}` : ""}, so I won't guess the amount.` };
        if (!parsed.amount_cents) return { outcome: "ask", text: `${beat}How much?` };
        if (!parsed.recipient && !pick) return { outcome: "ask", text: `${beat}Who should I send it to?` };
        identity = null; waiting = null; saveOffer = null;
        // Memo text is data: it may be quoted back, never obeyed.
        let memo = parsed.memo, memo_flagged = false;
        if (memo && Guard) { const g = Guard.wrap(memo); memo_flagged = !!g.flagged; }
        // Rail 1: exact handle, then full name, then first name; ambiguity, look-alikes and strangers never pass as saved.
        let person = pick || null;
        if (!person) {
          const r = book.resolve(parsed.recipient);
          if (r.status === "unavailable") return { outcome: "unavailable", reason: "recipients_unreadable", text: r.ask };
          if (r.status === "missing") return { outcome: "ask", text: r.ask };
          if (r.status === "ambiguous") return follow({ candidates: r.candidates, ask: r.ask }, parsed, "ambiguous", { candidates: r.candidates.map(c => c.name) });
          if (r.status === "lookalike") return follow({ suspect: r.suspect, handle: r.handle, rail: parsed.rail, name: r.handle ? null : r.query, ask: r.ask, lead: r.ask }, parsed, "lookalike");
          // A description is never turned into a name: ask who it is (corpus 1.02, 1.08, 5.05, 5.10).
          if (r.status === "stranger" && DESCRIBED.test(parsed.recipient_raw || "")) return follow({ name: null, handle: null, rail: parsed.rail, brief: true, lead: grief ? "I'm so sorry. I can help with the payment when you're ready." : `${warn}I don't have ${String(parsed.recipient_raw).replace(/^my\b/i, "your")} saved.` }, Object.assign({}, parsed, { recipient: null }), "new_recipient", { new_recipient: true });
          if (r.status === "stranger") return follow({ name: r.name, handle: r.handle, rail: parsed.rail, lead: `${beat}I don't have ${r.name || parsed.recipient} on file.` }, parsed, "new_recipient", { new_recipient: true });
          person = r.person;
        }
        // The app the person named, when the saved person is on it; a saved person not on that app is confirmed there in full.
        if (parsed.rail && person.handles && person.handles[parsed.rail]) person = Rec.forRail(person, parsed.rail);
        else if (parsed.rail && person.handles && !person.readback_id) return follow({ name: person.name, rail: parsed.rail, lead: `${person.name} is saved on ${person.rails.map(Rec.railName).join(" and ")}, not ${Rec.railName(parsed.rail)}.` }, parsed, "new_recipient", { new_recipient: true });
        // Someone known by name who has never been paid and was never confirmed goes through the same stranger path, prefilled.
        if (!person.saved && !(person.history && person.history.length) && !person.readback_id) {
          const rail = parsed.rail && (person.rails || []).includes(parsed.rail) ? parsed.rail : (person.rails || []).find(x => Rec.RAILS[x]) || null;
          return follow({ name: person.name, handle: person.handle || null, rail, lead: `${person.name} has never received money from you. First sends go through the new-recipient path and are confirmed in full.` }, parsed, "new_recipient", { new_recipient: true });
        }
        let prep = prepare(parsed, person, memo);
        // A person saved on several apps: the card shows the handle on the app the money actually goes by.
        if (!prep.stop && !prep.ask && person.handles && prep.rail && person.handles[prep.rail.id] && person.handle !== person.handles[prep.rail.id]) { person = Rec.forRail(person, prep.rail.id); prep = prepare(parsed, person, memo); }
        if (prep.stop) return { outcome: "stop", reason: prep.reason, text: prep.message };
        if (prep.ask) return { outcome: "ask", reason: prep.new_recipient ? "new_recipient" : "gap", text: prep.ask, new_recipient: !!prep.new_recipient };
        if (prep.tier === "T5" && !person.readback_id) return { outcome: "ask", reason: "new_recipient", text: `${prep.recipient.name} has never received money from you. First sends go through the new-recipient path and are confirmed in full. ${prep.verify_question || ""}`.trim(), new_recipient: true };
        // More than the cash the person has, from their own rows: said before any card, and nothing is staged until they
        // answer (corpus 1.05). Not a refusal: a handoff app may pay from a balance or card Upmore can't see.
        if (!parsed.funds_checked) {
          const chk = fundsCheck(await readBalances(), prep.amount_cents + (prep.rail.fee_cents || 0), clock(), { funding: parsed.funding });
          if (chk) {
            pendingFunds = { parsed: Object.assign({}, parsed), pick: pick || null, amount_cents: prep.amount_cents, available_cents: chk.available_cents, recipient: prep.recipient.name, asked_at: clock() };
            return { outcome: "ask", reason: "funds_short", text: fundsText(chk, prep), funds: chk };
          }
        }
        const send = Object.assign({ memo_flagged, staged_at: null, landed: null }, prep);
        // The family word the person used for someone confirmed by read-back in this same send ("send my mom 40", then the
        // handle typed back) may be kept as their nickname, but only when the SAVE offer restates it and they say SAVE.
        if (person.readback_id && Rec.isKin(parsed.recipient_raw || "") && book.nicknameCheck) { const nc = book.nicknameCheck(null, Rec.nickNorm(parsed.recipient_raw)); if (nc.ok && !nc.holder) send.nickname_offer = nc.nickname; }
        const handoff = send.rail.mode === "handoff";
        const request = { capability_id: person.readback_id ? "PAY-002" : CAPABILITY, key: prep.request.key, idempotency_key: prep.request.key, params: { amount_cents: send.amount_cents, recipient: send.recipient.id || send.recipient.name, recipient_name: send.recipient.name, rail: send.rail.id, memo: memo || null, funding: send.confirm.from }, describe: send.confirm.action, confirm: { action: send.confirm.action, amount: send.confirm.amount, recipient: send.confirm.recipient, from: send.confirm.from, fee: send.confirm.fee, when: send.confirm.when }, draft_only: handoff, amount_cents: send.amount_cents, recipient: send.recipient.id || send.recipient.name };
        send.request_key = request.key;
        // S10 for handoff rails: a staged send is "done" for the day even though no rail was written; the same instruction is not staged twice.
        const staged = sends.find(x => x.request_key === request.key && !x.cancelled);
        if (staged) return { outcome: "already_done", text: `${send.confirm.action} was already staged today${staged.landed ? ` and landed on ${staged.landed}` : ""}. I did not stage it again. If it never went through, say so and I'll restage it.` };
        const r = await loop.wake({ kind: "message", request });
        if (r.outcome === "awaiting_confirmation") { pending = { send, confirmation_id: r.confirmation_id, request, prep: { parsed: Object.assign({}, parsed, { memo: parsed.memo || null }) } }; return { outcome: "confirm", confirmation_id: r.confirmation_id, text: cardText(send), details: confirmText(send), send }; }
        if (r.outcome === "already_done") { pending = null; return { outcome: "already_done", text: r.message }; }
        if (r.outcome === "blocked") { pending = null; return { outcome: "blocked", reason: r.reason, text: r.message }; }
        return Object.assign({ outcome: r.outcome, text: r.message || null }, r);
      }
      // A new request while a card is live replaces it: the old card is declined in the loop first, so nothing stacks.
      async function start(text) { pendingAmountCheck = null; pendingFunds = null; if (pending) { await loop.wake({ kind: "confirmation", confirmation_id: pending.confirmation_id, approved: false }); pending = null; } return stage(parse(text)); }

      // The outcome of an approved action, in the user's words.
      function settle(r, send) {
        if (r.outcome === "draft_approved") {
          const h = Money.handoff(send); send.staged_at = clock(); send.watch = h.watch; sends.push(send);
          // Staged is not sent: a new recipient is saved when the money lands, or now if the person says SAVE.
          const nu = send.recipient.readback_id && !send.recipient.saved;
          if (nu) saveOffer = { name: send.recipient.name, handle: send.recipient.handle, rail: send.rail.id, readback_id: send.recipient.readback_id, nickname: send.nickname_offer || null, offered_at: clock() };
          return { outcome: "staged", text: nu ? `${h.text} Reply SAVE to keep ${send.recipient.name}${send.nickname_offer ? ` as "${send.nickname_offer}"` : ""} for next time; otherwise I'll save them once the money lands.` : h.text, steps: h.steps, app: h.app, watch: h.watch, send, save_offered: !!nu };
        }
        if (r.outcome === "confirmed") {
          const rc = Money.receipt(send, { reference: r.outcome_record && r.outcome_record.reference || (r.message.match(/ref ([^)]+)\)/) || [])[1] || "confirmed" });
          const sv = book.save({ name: send.recipient.name, handle: send.recipient.handle, rail: send.rail.id }, { kind: "completed_send", reference: rc.reference, outcome: "sent" });
          return { outcome: "sent", text: rc.text, reference: rc.reference, reversal_contract: rc.reversal_contract, mitigation: rc.mitigation, send, saved: sv.ok ? sv.op : null };
        }
        if (r.outcome === "unknown") return { outcome: "unknown", text: r.message, send };
        if (r.outcome === "failed") return { outcome: "failed", text: `${r.message} ${send.rail.mode === "partner" ? "Nothing posted on their side; the money is still in " + send.confirm.from + "." : ""}`.trim(), send };
        if (r.outcome === "expired") return { outcome: "expired", text: r.message };
        if (r.outcome === "declined") return { outcome: "declined", text: r.message };
        return Object.assign({ outcome: r.outcome, text: r.message || null }, r);
      }
      function recheck(p) {
        const was = p.send, parsed = (p.prep && p.prep.parsed) || {};
        // The recipient is looked up again: a saved person whose handle changed, or who was removed, stops the send.
        let cur = was.recipient;
        if (!was.recipient.readback_id) { const rr = book.resolve(was.recipient.handle || was.recipient.name); if (rr.status !== "saved") return ["the recipient is no longer on file as before"]; cur = rr.person; }
        const prep = Money.prepareSend({ amount_cents: was.amount_cents, recipient: cur.name, memo: was.memo || null, speed: parsed.speed || null, funding: was.confirm.from, instruction: parsed.text || "" }, { people: [cur], partners: o.partners || {}, today: ymd(clock()), sent_today_cents: sentWithin(DAY), sent_week_cents: sentWithin(WEEK), envelope: o.limits || {}, large_cents: o.large_cents, default_funding: o.default_funding || "checking", include_gated: false });
        if (prep.stop || prep.ask) return [`it no longer clears: ${prep.message || prep.ask}`];
        const moved = [];
        if (prep.rail.id !== was.rail.id) moved.push(`the rail changed from ${was.rail.name} to ${prep.rail.name}`);
        if ((prep.rail.fee_cents || 0) !== (was.rail.fee_cents || 0)) moved.push(`the fee changed from ${money(was.rail.fee_cents || 0)} to ${money(prep.rail.fee_cents || 0)}`);
        if (prep.amount_cents !== was.amount_cents) moved.push(`the amount changed from ${money(was.amount_cents)} to ${money(prep.amount_cents)}`);
        if ((prep.recipient.id || prep.recipient.name) !== (was.recipient.id || was.recipient.name) || prep.recipient.handle !== was.recipient.handle) moved.push(`the recipient's details changed`);
        return moved;
      }
      // The answer to the balance question. Nothing is staged until the person picks: the full amount anyway, what's there,
      // or another amount, each on its own card for its own yes. A money move between accounts is refused in plain words.
      async function fundsReply(text) {
        const f = pendingFunds, t = String(text || ""), amt = money(f.amount_cents), typed = parseAmount(t);
        const go = amount_cents => { pendingFunds = null; return stage(Object.assign({}, f.parsed, { amount_cents, funds_checked: amount_cents === f.amount_cents, one_decimal: false, amount_checked: true }), f.pick || undefined); };
        if (FUNDS_MOVE.test(t)) return { outcome: "not_built", reason: "money_move", text: `I can't move money between your accounts, so nothing was moved or sent. If you move it yourself in your bank's app, say "send it" and I'll set up ${amt} to ${f.recipient}, or tell me a smaller amount.` };
        if (typed) return go(typed);
        if (FUNDS_NO.test(t)) { pendingFunds = null; return { outcome: "declined", text: "Okay, nothing was sent." }; }
        if (FUNDS_AVAIL.test(t)) return f.available_cents > 0 ? go(f.available_cents) : { outcome: "ask", reason: "funds_short", text: "There's nothing available in it right now. How much should I set up?" };
        if (FUNDS_LESS.test(t)) return { outcome: "ask", reason: "funds_short", text: "How much?" };
        if (FUNDS_YES.test(t)) return go(f.amount_cents);
        return { outcome: "ask", reason: "funds_short", text: `${amt} anyway, or a different amount?` };
      }
      async function reply(text) {
        if (pendingFunds && fundsAccepts(text)) return fundsReply(text);
        if (pendingAmountCheck && AMOUNT_ANSWER.test(String(text || ""))) {
          const was = pendingAmountCheck; pendingAmountCheck = null;
          if (/^\s*(n|no|nope)\b/i.test(text)) return { outcome: "declined", text: "Okay. Nothing sent. Tell me the amount you meant." };
          const typed = parseAmount(String(text)), amount_cents = typed || was.amount_cents;
          return stage(Object.assign({}, was, { amount_cents, amount_checked: true, one_decimal: false }));
        }
        if (identity) {
          const step = Rec.identityStep(identity, text, clock()); identity = step.state;
          if (step.outcome === "ask") return { outcome: "ask", reason: "identity", text: step.text };
          const w = waiting; waiting = null;
          if (step.outcome === "use_saved" || step.outcome === "confirmed") return stage(w.parsed, step.person);
          return { outcome: step.outcome === "expired" ? "expired" : "declined", text: step.text };
        }
        if (saveOffer && /^\s*save( (them|him|her|it))?\s*[.!]*\s*$/i.test(String(text))) {
          const so = saveOffer; saveOffer = null;
          const sv = book.save({ name: so.name, handle: so.handle, rail: so.rail, nickname: so.nickname || null }, { kind: "confirmed", approved: true, readback: true, confirmation_id: so.readback_id });
          return sv.ok ? { outcome: "saved", text: `Saved ${so.name} (${Rec.railName(so.rail)} ${so.handle})${so.nickname ? ` as "${so.nickname}"` : ""}. Next time a send to ${so.nickname ? `"${so.nickname}"` : "them"} goes straight to the card.`, row: sv.row } : { outcome: "not_saved", text: sv.text };
        }
        const p = pending;
        if (!p) return { outcome: "nothing_pending", text: "There is no send waiting on you." };
        let cls = Voice ? Voice.classify(text, { pending_confirmation: true }) : { type: /^y/i.test(text) ? "confirmation" : "question", approved: /^y/i.test(text) };
        // A new amount without a yes ("actually make it $50", "no, make it 50", "$50 instead") corrects the card; it is never
        // read as a decline or answered with the old card. Found live 2026-10-11 (spec16 item 6).
        const asked = parseAmount(String(text || ""));
        if (cls.type !== "correction" && asked && asked !== p.send.amount_cents && (AMOUNT_CHANGE.test(String(text)) || /^\s*\$?\s?[\d,]+(\.\d{1,2})?\s*[.!]*\s*$/.test(String(text)))) cls = { type: "correction", amount_only: true };
        // S07: "yes, but" corrects. The old proposal is dropped and the corrected one is staged afresh; nothing is written in between.
        if (cls.type === "correction") {
          const fix = parse(text), merged = { amount_cents: fix.amount_cents || p.send.amount_cents, recipient: (!cls.amount_only && fix.recipient) || p.send.recipient.name, memo: p.send.memo, speed: fix.speed || null, funding: fix.funding || p.send.confirm.from, text };
          await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
          const again = await stage(merged);
          return Object.assign({ corrected: true }, again, again.outcome === "confirm" ? { text: `Got it. ${again.text}` } : {});
        }
        if (cls.type === "hold") return { outcome: "held", text: `Holding it. Nothing sent. Say yes to ${cardText(p.send).split(". ")[0].replace(/^Set up/, "set up").replace(/^Send/, "send")}, or no to drop it.` };
        if (cls.type === "confirmation" && cls.approved === false) { const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null; return settle(r, p.send); }
        if (cls.type === "confirmation" && cls.approved === true) {
          // Stop-on-change: the send is prepared again from the same words right before it goes out. If the rail, the fee, the
          // amount or the recipient came out different, or a limit now stops it, nothing is sent and a fresh card says what moved.
          const moved = recheck(p);
          if (moved.length) {
            await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: false }); pending = null;
            const again = await stage(p.prep.parsed);
            return Object.assign({}, again, { outcome: "changed", moved, next: again, text: `Stopped before sending: ${moved.join("; ")}. Nothing was sent.${again.outcome === "confirm" ? ` New card: ${again.text}` : ` ${again.text}`}` });
          }
          const r = await loop.wake({ kind: "confirmation", confirmation_id: p.confirmation_id, approved: true }); pending = null;
          // A stale yes never fires: the card expired, nothing was sent, and a fresh card goes up from the same request for a
          // fresh yes (spec 16 item 4 "expired, re-offered, never fired"; response-style corpus 2.09).
          if (r.outcome === "expired") {
            const again = await stage(p.prep.parsed);
            if (again.outcome === "confirm") return Object.assign({}, again, { expired: true, text: `That card expired, so nothing was sent. Here's a fresh one: ${again.text}` });
            return { outcome: "expired", text: `That card expired, so nothing was sent. ${again.text || ""}`.trim() };
          }
          return settle(r, p.send);
        }
        if (/^\s*(3|details?|more|terms|full terms)\s*[.!?]*\s*$/i.test(String(text))) return { outcome: "details", text: confirmText(p.send), details: true };
        return { outcome: "ask", text: `Yes or no? ${cardText(p.send)}` };
      }
      async function followUp() { const r = await loop.wake({ kind: "follow_up" }); const key = (log.filter(e => e.to === "ACTING").pop() || { input: {} }).input.idempotency_key; const send = sends.find(s => s.request && s.request.key === key) || (pending && pending.send) || lastSend(key); return settle(r, send || { rail: { mode: "partner", reversible: "" }, confirm: { from: "your account" }, amount_cents: 0, recipient: { name: "?" } }); }
      const lastSend = key => { const e = log.filter(x => x.to === "ACTING" && x.input && x.input.idempotency_key === key).pop(); if (!e) return null; const p = e.input.params || {}; const person = book.people.find(x => (x.id || x.name) === p.recipient) || { name: p.recipient_name || p.recipient }; const rail = Money.RAILS[p.rail] ? Object.assign({ id: p.rail }, Money.RAILS[p.rail]) : { id: p.rail, mode: "partner", name: p.rail, speed: "", reversible: "", mitigation: "" }; return { amount_cents: p.amount_cents, recipient: person, rail, confirm: { from: p.funding || "checking", action: `Send ${money(p.amount_cents)} to ${person.name}` }, memo: p.memo || null }; };
      // S15 for handoff rails: "landed" only when the debit posts; overdue asks instead of assuming.
      function landed(transactions) {
        const out = [];
        for (const s of sends) { if (s.landed || s.cancelled) continue; const hit = (transactions || []).find(t => { const c = Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100); const who = String(t.merchant_raw || "").toLowerCase(); return c === -s.amount_cents && Date.parse(String(t.posted_at).slice(0, 10) + "T00:00:00Z") >= Date.parse(ymd(s.staged_at) + "T00:00:00Z") && [s.recipient.name, s.recipient.handle].filter(Boolean).some(n => who.includes(String(n).toLowerCase().replace(/^@/, "").split(" ")[0])); }); if (hit) { s.landed = String(hit.posted_at).slice(0, 10); const rc = Money.receipt(s, { posted: s.landed }); const sv = book.save({ name: s.recipient.name, handle: s.recipient.handle, rail: s.rail.id }, { kind: "completed_send", transaction_id: hit.id, posted: s.landed }); if (sv.ok && saveOffer && saveOffer.handle === s.recipient.handle) saveOffer = null; out.push({ send: s, transaction_id: hit.id, text: rc.text, saved: sv.ok ? sv.op : null }); } }
        return out;
      }
      function overdue(now) { return sends.filter(s => !s.landed && !s.cancelled && s.watch && now - s.staged_at > s.watch.deadline_days * DAY).map(s => ({ send: s, text: `I staged ${money(s.amount_cents)} to ${s.recipient.name} on ${s.rail.name} ${Math.floor((now - s.staged_at) / DAY)} day(s) ago and have not seen it post. Did you send it? If not, nothing left your account.` })); }
      const snapshot = () => JSON.parse(JSON.stringify({ loop: loop.snapshot(), sends, pending, identity, waiting, save_offer: saveOffer, amount_check: pendingAmountCheck, funds_check: pendingFunds }));
      // A reply that belongs to this flow's follow-up (a handle, NEW, a choice, SAVE) goes here and never to the model.
      const AMOUNT_ANSWER = /^\s*(y|yes|yep|yeah|ya|correct|right|that'?s right|n|no|nope|\$?\s?[\d,]+(\.\d{1,2})?)\s*[.!]*\s*$/i;
      const accepts = text => (!!identity && Rec.identityAccepts(identity, text)) || (!!saveOffer && /^\s*save( (them|him|her|it))?\s*[.!]*\s*$/i.test(String(text || ""))) || (!!pendingAmountCheck && AMOUNT_ANSWER.test(String(text || ""))) || (!!pendingFunds && fundsAccepts(text));
      return { start, reply, followUp, landed, overdue, parse, loop, sends, snapshot, cardText, accepts, recipients: book,
        get pending() { return pending ? { confirmation_id: pending.confirmation_id, amount_cents: pending.send.amount_cents, recipient: pending.send.recipient.name } : null; },
        get awaiting_input() { return !!identity || !!saveOffer || !!pendingAmountCheck || !!pendingFunds; } };
    }
    return { create, parse, parseAmount, isAmountCorrection: text => AMOUNT_CHANGE.test(String(text)), lookalike, fundsCheck, editDistance: (a, b) => AgentRecipients.editDistance(a, b), CAPABILITY };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentSend;
