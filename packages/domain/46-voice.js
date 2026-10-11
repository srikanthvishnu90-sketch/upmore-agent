  /* Voice: the composition layer every user-facing message passes through
     (Instinct spec doc 11). Pure and deterministic. Leads with the answer,
     states money exactly with its source and as-of time, never fills, never
     moralizes, never names a capability the registry does not back. Every
     composed message is linted against the anti-pattern list before it is
     returned, so the composer cannot produce them. */
  const AgentVoice = (() => {
    const BUBBLE_MAX = 220;
    const FILLER = [/\bgreat question\b/i, /\bi'?d be happy to\b/i, /\bhappy to help\b/i, /\blet me know if (you need|there'?s) anything else\b/i,
      /\bi have processed your request\b/i, /\bcertainly!/i, /\babsolutely!/i, /\bas an ai\b/i];
    const HEDGE = /\b(it might be possible that|i think maybe|perhaps possibly|it could potentially|may or may not)\b/i;
    const MORALIZE = /\b(you (really )?shouldn'?t (be )?(spend|buy|waste)|that'?s a lot to spend|you need to be more careful with money|irresponsible)\b/i;
    const ADVICE = /\b(you should (consider|think about) (investing|buying|moving your money)|i'?d recommend you (buy|sell|invest))\b/i;
    const APPROX_MONEY = /\b(about|around|roughly|approximately) (four|five|six|a) (thousand|hundred|grand)\b|\bballpark\b/i;
    const LIGHT = /\b(lol|haha|no biggie|fun fact|yay|oops)\b|[!]{2,}/i;
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
    const money = c => { if (!Number.isSafeInteger(c)) throw new Error("Money must be an exact integer number of cents."); const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const need = (f, keys) => { for (const k of keys) if (f[k] === undefined || f[k] === null || f[k] === "") throw new Error(`compose needs ${k}`); };

    // Classification, not improvisation: every inbound message maps to one response type.
    function classify(text, ctx) {
      const t = String(text || "").trim();
      const c = ctx || {};
      if (!t) return { type: "smalltalk" };
      // "Yes, but use the other account" is a correction that invalidates the proposal, never an approval of it.
      if (c.pending_confirmation && /^(y|yes|yep|yeah|ok|okay|sure|do it|go ahead|confirm)\b/i.test(t) && /\b(but|except|instead|actually|change|make it|use the other|not the|rather)\b/i.test(t)) return { type: "correction", qualified_approval: true };
      if (c.pending_confirmation && /^(y|yes|yep|yeah|ok|okay|sure|do it|go ahead|confirm)\b/i.test(t)) return { type: "confirmation", approved: true };
      if (c.pending_confirmation && /^(n|no|nope|don'?t|stop|cancel that|actually no|never ?mind)\b/i.test(t)) return { type: "confirmation", approved: false };
      if (/^(no[,.]? |not |wrong|that'?s wrong|i (said|meant)|it'?s actually|correction:)/i.test(t) || /\bnot [A-Z][a-z]+ [A-Z][a-z]+\b/.test(t)) return { type: "correction" };
      if (/\b(why the hell|wtf|what the f|ridiculous|this is bs|i'?m (so )?(pissed|furious|angry)|seriously\?)\b/i.test(t)) return { type: "venting" };
      const intent = typeof AgentIntents !== "undefined" ? AgentIntents.match(t) : null;
      if (intent) return { type: "action", intent };
      if (/^(send|pay|move|transfer|cancel|dispute|zelle|venmo)\b/i.test(t)) {
        const hasAmount = /\$?\d+(\.\d{2})?\b/.test(t), hasWho = /\b(to |my |the )?[a-z][a-z'-]+\b/i.test(t.replace(/^(send|pay|move|transfer|zelle|venmo)\s+/i, ""));
        return hasAmount && hasWho ? { type: "action" } : { type: "ambiguous_money" };
      }
      if (/\b(balance|how much|what'?s my|do i have|spent|spending|owe|due|net worth|401k|savings)\b/i.test(t) || /\?$/.test(t)) return { type: "question" };
      if (/^(thanks|thank you|ty|cool|nice|hey|hi|hello|good (morning|night)|lol)\b/i.test(t)) return { type: "smalltalk" };
      return { type: "question" };
    }

    // Register: mirror formality (not typos). Lowercase fragments without punctuation read as casual.
    function register(text) {
      const t = String(text || "");
      return t.length > 0 && t === t.toLowerCase() && !/[.!?]$/.test(t) ? "casual" : "precise";
    }

    function lint(text, opts) {
      const o = opts || {}, s = String(text || ""), findings = [];
      for (const re of FILLER) if (re.test(s)) findings.push({ rule: "filler", match: s.match(re)[0] });
      if (HEDGE.test(s)) findings.push({ rule: "hedging_stack", match: s.match(HEDGE)[0] });
      if (MORALIZE.test(s)) findings.push({ rule: "moralizing", match: s.match(MORALIZE)[0] });
      if (ADVICE.test(s)) findings.push({ rule: "unsolicited_advice", match: s.match(ADVICE)[0] });
      if (APPROX_MONEY.test(s)) findings.push({ rule: "approximate_money", match: s.match(APPROX_MONEY)[0] });
      const emojis = (s.match(EMOJI) || []).length; if (emojis > 1) findings.push({ rule: "emoji_spam", match: `${emojis} emoji` });
      if (o.severity === "high" && LIGHT.test(s)) findings.push({ rule: "wrong_gravity", match: s.match(LIGHT)[0] });
      if (o.question && s.length > 3 * o.question.length + 200 && (s.match(/[.!?](\s|$)/g) || []).length > 3) findings.push({ rule: "overlong_answer", match: `${s.length} chars` });
      if (o.question && s.replace(/[?.]/g, "").toLowerCase().trim() === String(o.question).replace(/[?.]/g, "").toLowerCase().trim()) findings.push({ rule: "repeats_question", match: s });
      if (/\$\d/.test(s) && o.requires_source && !/\b(as of|per)\b/i.test(s)) findings.push({ rule: "ungrounded_money", match: s.match(/\$[\d,.]+/)[0] });
      if (o.registry && Array.isArray(o.claims)) for (const id of o.claims) {
        const c = o.registry.get(id);
        if (!c || !["BUILT", "TESTED", "VERIFIED"].includes(c.status)) findings.push({ rule: "capability_overclaim", match: id });
      }
      return findings;
    }

    function bubbles(parts) {
      // One idea per bubble: sentences are grouped until the next one would overflow.
      const out = [];
      for (const p of parts.filter(Boolean)) {
        // Split only at sentence punctuation followed by whitespace, so "$85.00" and "@sarah-m" stay whole.
        const sentences = String(p).split(/(?<=[.!?])\s+/);
        let cur = "";
        for (const s of sentences) {
          const piece = s.trim(); if (!piece) continue;
          if (cur && (cur + " " + piece).length > BUBBLE_MAX) { out.push(cur); cur = piece; } else cur = cur ? cur + " " + piece : piece;
        }
        if (cur) out.push(cur);
      }
      return out;
    }

    function compose(kind, fields, ctx) {
      const f = fields || {}, c = ctx || {}, reg = c.register || "precise";
      let parts = [], meta = {};
      if (kind === "answer") {
        if (f.amount_cents !== undefined) {
          need(f, ["subject", "as_of", "source"]);
          parts.push(f.stale
            ? `${f.subject} was ${money(f.amount_cents)} as of ${f.as_of}, per ${f.source}; that sync is stale, so it may have changed.`
            : `${f.subject} is ${money(f.amount_cents)} as of ${f.as_of}, per ${f.source}.`);
          if (f.detail) parts.push(f.detail);
        } else { need(f, ["text"]); parts.push(f.text + (f.source ? ` (per ${f.source}${f.as_of ? `, as of ${f.as_of}` : ""})` : "")); }
        if (f.document) { meta.document = f.document; }
      } else if (kind === "confirm") {
        if (f.restate) { need(f, ["context"]); parts.push(`${f.context} ${f.restate} ${reg === "casual" ? "ok?" : "Confirm?"}`); }
        else {
          need(f, ["action", "amount_cents", "recipient", "timing"]);
          parts.push(`${f.action} ${money(f.amount_cents)} to ${f.recipient}${f.from ? ` from ${f.from}` : ""}? ${Number.isFinite(f.fee_cents) ? (f.fee_cents > 0 ? `Fee ${money(f.fee_cents)}` : "Free") : "Fee not yet quoted"}, ${f.timing}.`);
        }
      } else if (kind === "receipt") {
        need(f, ["done", "amount_cents", "recipient", "rail", "reference"]);
        parts.push(`${f.done}. ${money(f.amount_cents)} to ${f.recipient}, ${f.rail}, confirmation ${f.reference}.${f.followup ? " " + f.followup : ""}`);
      } else if (kind === "limit") {
        need(f, ["capability"]);
        const cap = f.capability, why = { GATED: cap.gate_reason || "it needs a licensed partner", NOT_WIRED: "the rail is not connected yet", CLAIMED: "it is not built yet" }[cap.status];
        if (!why) throw new Error("limit is only for capabilities the registry does not back");
        parts.push(`${f.label || cap.name} isn't available yet: ${why}.${f.path ? ` ${f.path}` : ""}`);
      } else if (kind === "ask") { need(f, ["question"]); parts.push(f.question); }
      else if (kind === "correction_ack") { need(f, ["ack", "fix"]); parts.push(`${f.ack} ${f.fix}`); meta.store_correction = true; }
      else if (kind === "venting_ack") { need(f, ["fact", "fix"]); parts.push(`${f.fact} ${f.fix}`); }
      else if (kind === "smalltalk") { need(f, ["text"]); if (f.text.length > 80) throw new Error("smalltalk stays short"); parts.push(f.text); }
      else if (kind === "proactive") { need(f, ["finding", "offer", "reason"]); parts.push(`${f.finding} ${f.offer}`); meta.reason = f.reason; }
      else if (kind === "alert") { need(f, ["first_line"]); parts.push(f.first_line + (f.detail ? " " + f.detail : "")); if (f.action) parts.push(f.action); c.severity = "high"; }
      else if (kind === "declined") parts.push("Okay, not doing that. Nothing was changed.");
      else throw new Error("Unknown message kind " + kind);
      const out = bubbles(parts);
      const findings = lint(out.join(" "), { severity: c.severity, question: c.question, requires_source: kind === "answer", registry: c.registry, claims: f.claims });
      if (findings.length) throw new Error("Voice refused to produce: " + findings.map(x => x.rule + " (" + x.match + ")").join(", "));
      return { kind, bubbles: out, meta };
    }

    // Trust ladder: per capability and shape. Three clean confirmations earn an envelope offer; any correction or surprise drops it.
    function ladder(state) {
      const s = state && typeof state === "object" ? state : {};
      const key = (cap, shape) => `${cap}|${shape || "*"}`;
      return {
        state: s,
        record(cap, shape, event) {
          const k = key(cap, shape), e = s[k] || (s[k] = { clean: 0, offer: false, granted: false, demotions: 0 });
          if (event === "clean_confirmation") { e.clean++; if (e.clean >= 3 && !e.granted) e.offer = true; }
          else if (event === "correction" || event === "surprise") { e.clean = 0; e.offer = false; e.granted = false; e.demotions++; }
          else if (event === "envelope_granted") { if (!e.offer) throw new Error("An envelope is granted only after it was offered."); e.granted = true; e.offer = false; }
          else if (event === "envelope_revoked") { e.granted = false; e.offer = false; e.clean = 0; }
          else throw new Error("Unknown ladder event " + event);
          return { ...e };
        },
        offerText(cap, shape, limitCents) { const e = s[key(cap, shape)]; return e && e.offer ? `I can just do this under ${money(limitCents)} from now on, with a receipt each time. Want that?` : null; },
        autonomous(cap, shape) { const e = s[key(cap, shape)]; return !!(e && e.granted); }
      };
    }
    return { classify, register, lint, compose, ladder, money, bubbles };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentVoice;
